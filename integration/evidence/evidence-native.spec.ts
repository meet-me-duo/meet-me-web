import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

type Fixture = { inviteCode: string; host: { access_token: string; expires_at: string; user: { id: string; display_name: string } }; flow: { raw_text: string; answer_text: string } };
type SourceRow = { raw_text: string; input_evidence: unknown; question?: unknown };
function evidence(value: unknown): { interpretation?: string; supplement?: { answerText?: string } } {
  if (typeof value === "string") return JSON.parse(value);
  if (value && typeof value === "object" && "value" in value && typeof value.value === "string") return JSON.parse(value.value);
  return value as { interpretation?: string; supplement?: { answerText?: string } };
}

// Native app/PG/Redis/workers/matching/public HTTP. OAuth refresh and AI providers
// are synthetic fixtures. No interception of room, check, answer or result APIs.
test("V2 native original -> one scoped answer -> frozen final input -> host selection", async ({ page, request }, info) => {
  const health = await request.get("http://127.0.0.1:18933/health");
  expect(health.status()).toBe(200);
  const exported = await request.get("http://127.0.0.1:18932/v3/api-docs");
  expect(exported.status()).toBe(200);
  const actualApi = await exported.json();
  const webApi = JSON.parse(await readFile("openapi/meet-me.openapi.json", "utf8"));
  for (const name of ["InputEvidenceResponse", "InputSupplementResponse", "PrecheckResponse", "PrecheckAcceptedResponse", "PrecheckQuestionResponse", "UnappliedInputResponse"]) expect(actualApi.components.schemas[name]).toEqual(webApi.components.schemas[name]);
  const reset = await request.post("http://127.0.0.1:18933/reset");
  expect(reset.status()).toBe(200);
  const fixture = await reset.json() as Fixture;
  const writes: { method: string; path: string; body: unknown }[] = []; const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", req => {
    const path = new URL(req.url()).pathname;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method()) && path.includes(`/api/rooms/${fixture.inviteCode}/`)) writes.push({ method: req.method(), path, body: req.postDataJSON() });
  });
  await page.route("**/api/auth/refresh", route => route.fulfill({ json: { accessToken: fixture.host.access_token, expiresAt: fixture.host.expires_at, account: { id: fixture.host.user.id, displayName: fixture.host.user.display_name } } }));
  await page.goto(`/rooms/${fixture.inviteCode}`);
  const input = page.getByRole("textbox", { name: /시간·장소 조건/ });
  await input.fill(fixture.flow.raw_text);
  await page.getByRole("button", { name: "조건 제출하기", exact: true }).click();
  await expect(page.getByRole("heading", { name: /오전.*오후|오후.*오전/ })).toBeVisible();
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "직접 답변", exact: true }).click();
    await page.getByRole("textbox", { name: /보완 답변/ }).fill(fixture.flow.answer_text);
    await page.getByRole("button", { name: "답변 제출", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "오후", exact: true }).click();
    await page.getByRole("button", { name: "선택한 답변 제출", exact: true }).click();
  }
  await expect(page.getByText(/접수 완료.*최종 분석에서 해석/)).toBeVisible();
  await expect(page.getByText(fixture.flow.raw_text, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "제출한 보완 답변" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 취소", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/접수 완료.*최종 분석에서 해석/)).toBeVisible();
  await page.locator("details.host-tools-inline > summary").click();
  await page.getByRole("button", { name: "입력 마감하기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "지금 입력 마감", exact: true }).click();
  await expect(page.getByRole("heading", { name: "함께할 수 있는 추천 시간이에요" })).toBeVisible();
  await page.getByText(/반영되지 않은 입력.*확인/).click();
  const diagnostics = page.locator("details.unapplied");
  await expect(diagnostics.getByText(fixture.flow.raw_text, { exact: true })).toBeVisible();
  await expect(diagnostics.getByText(/제출한 보완 답변:/)).toBeVisible();
  await expect(diagnostics.getByText("시간 조건 미반영", { exact: true })).toBeVisible();
  await expect(diagnostics.getByText(/오전.*오후|오후.*오전/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("native-v2-host-diagnostics.png"), fullPage: true });

  const state = await (await request.get("http://127.0.0.1:18933/state")).json() as { questions: SourceRow[]; received: SourceRow[]; frozen: SourceRow[] };
  expect(state.questions.filter(row => row.question != null)).toHaveLength(1);
  const frozen = state.frozen.find(row => row.raw_text === fixture.flow.raw_text);
  expect(frozen).toBeDefined();
  expect(evidence(frozen!.input_evidence).interpretation).toBe("UNRESOLVED");
  expect(evidence(frozen!.input_evidence).supplement?.answerText).toContain(fixture.flow.answer_text);
  expect(writes.filter(write => write.path.endsWith("/submission/checks"))).toHaveLength(1);
  expect(writes.filter(write => write.path.endsWith("/answer"))).toHaveLength(1);
  expect(writes.some(write => write.method === "PUT" && write.path.endsWith("/submission"))).toBe(false);
  await page.getByRole("button", { name: "이 시간 선택", exact: true }).first().click();
  await page.getByRole("button", { name: "선택한 시간 확정하기", exact: true }).click();
  await page.getByRole("button", { name: "가능한 범위 전체 선택", exact: true }).click();
  const confirmed = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/confirmation"));
  await page.getByRole("button", { name: "일정 확정", exact: true }).click();
  const confirmation = await confirmed;
  expect(confirmation.status()).toBe(200);
  const result = await confirmation.json();
  await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
  await writeFile(info.outputPath("native-v2-evidence.json"), JSON.stringify({ project: info.project.name, writes, frozen: state.frozen, confirmation: result.selection, publishedQuestionCount: 1, models: "synthetic-only", auth: "synthetic-refresh-real-RS256-validation", actual_api_schema_sha256: createHash("sha256").update(JSON.stringify(actualApi.components.schemas)).digest("hex") }, null, 2));
  await page.screenshot({ path: info.outputPath("native-v2-confirmed.png"), fullPage: true });
  expect(errors).toEqual([]);
});
