import { expect, test } from "@playwright/test";

test("operator outcomes distinguish empty completed results, technical delay and isolated work", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  await page.goto("/__preview?scene=operations");
  await expect(page.getByText("작업 격리 · DLQ", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("operator-outcome-list.png"), fullPage: true });
  for (const [room, heading] of [["새해 회고", "분석 완료 · 저장된 후보 없음"], ["1월 독서 모임", "분석 지연 · 기술적 사유로 종결"], ["디자인 리뷰", "작업 격리 · DLQ 확인 필요"]]) {
    await page.getByRole("button", { name: room, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`operator-outcome-${room}.png`), fullPage: true });
    await page.getByRole("button", { name: "모임 목록" }).click();
  }
});

test("operator diagnostics keep original inputs, first Jev decision, answers and recorded retries distinct", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  const external: string[] = [], errors: string[] = [];
  page.on("request", request => { if (!request.url().startsWith("http://127.0.0.1:4175/")) external.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/__preview?scene=operations");
  await expect(page.getByRole("heading", { name: "모임을 살펴볼까요?" })).toBeVisible();
  await expect(page.locator(".ops-room-name")).toHaveCount(6);
  await page.screenshot({ path: info.outputPath("operator-rooms.png"), fullPage: true });
  await page.getByRole("textbox", { name: "현재 목록에서 모임 제목 검색" }).fill("제품");
  await expect(page.locator(".ops-room-name")).toHaveCount(1);
  await page.getByRole("button", { name: "제품 기획 회의", exact: true }).click();
  await expect(page.getByRole("heading", { name: /입력과 보완 내용/ })).toBeVisible();
  await expect(page.getByText("오전 10시 30분부터 12시까지 가능해요.", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".ops-person").nth(1)).toContainText("보완 필요");
  await expect(page.locator(".ops-person").nth(1)).toContainText("[이메일 숨김]");
  await expect(page.locator(".ops-timeline-card")).toContainText("재시도");
  await expect(page.locator(".ops-timeline-card")).toContainText("대체 모델");
  await expect(page.locator(".ops-result-card")).toContainText("후보 포함");
  await page.screenshot({ path: info.outputPath("operator-diagnostics.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const history = page.getByRole("combobox", { name: "조회할 분석 이력" });
  await history.selectOption("000000db-1111-4111-8111-000000000001");
  await expect(page.getByText("이전 분석의 고정 입력과 결과예요. 다시 분석은 현재 분석에서 실행할 수 있어요.")).toBeVisible();
  await expect(page.locator(".ops-person").first()).toContainText("미기록");
  await expect(page.getByRole("button", { name: "다시 분석", exact: true })).toBeDisabled();
  await page.screenshot({ path: info.outputPath("operator-historical.png"), fullPage: true });
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("operator reanalysis requires confirmation and sends one reviewed request with a new-result receipt", async ({ page }, info) => {
  const writes: Record<string, unknown>[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/api\/operations\/rooms\/[^/]+\/analyses$/.test(new URL(request.url()).pathname)) writes.push(request.postDataJSON()); });
  await page.goto("/__preview?scene=operations");
  await page.getByRole("button", { name: "제품 기획 회의", exact: true }).click();
  const trigger = page.getByRole("button", { name: "다시 분석", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "이 모임을 다시 분석할까요?" });
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await page.screenshot({ path: info.outputPath("operator-reanalysis-confirm.png"), fullPage: false });
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused(); expect(writes).toEqual([]);
  await trigger.click(); await dialog.getByRole("button", { name: "다시 분석", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "재분석 요청을 접수했어요." })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 분석", exact: true })).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(Object.keys(writes[0]!).sort()).toEqual(["expected_state_version", "request_id", "source_analysis_id"]);
  expect(writes[0]).toMatchObject({ expected_state_version: 7, source_analysis_id: "000000dc-1111-4111-8111-000000000001" });
  await expect(page.getByRole("heading", { name: /입력과 보완 내용/ })).toBeVisible();
});

test("collecting and confirmed rooms cannot be reanalyzed and current input view does not fabricate results", async ({ page }) => {
  await page.goto("/__preview?scene=operations");
  await page.getByRole("button", { name: "금요일 점심 약속", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "조회할 분석 이력" })).toHaveValue("current");
  await expect(page.getByRole("button", { name: "다시 분석", exact: true })).toBeDisabled();
  await expect(page.locator(".ops-result-card")).not.toContainText("후보 포함");
  await page.getByRole("button", { name: "모임 목록" }).click();
  await page.getByRole("button", { name: "프로젝트 킥오프", exact: true }).click();
  await expect(page.getByText("확정한 모임은 다시 분석할 수 없어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 분석", exact: true })).toBeDisabled();
});

test("a lost accepted reply recovers the same command after navigation instead of creating another analysis", async ({ page }) => {
  const bodies: unknown[] = [];
  let acceptedId = "";
  await page.route("**/api/operations/rooms/*/analyses", async route => {
    if (route.request().method() !== "POST") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length !== 1) return route.continue();
    // The local synthetic backend accepts and stores the command, while the
    // browser sees a gateway timeout instead of the original 202 receipt.
    const accepted = await route.fetch();
    expect(accepted.status()).toBe(202);
    acceptedId = (await accepted.json()).analysis_id;
    return route.fulfill({ status: 504, json: { detail: "synthetic lost reply" } });
  });
  await page.goto("/__preview?scene=operations");
  await page.getByRole("button", { name: "제품 기획 회의", exact: true }).click();
  await page.getByRole("button", { name: "다시 분석", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "다시 분석", exact: true }).click();
  await expect(page.getByRole("button", { name: "같은 요청으로 접수 확인" })).toBeVisible();
  expect(bodies).toHaveLength(1);
  await page.getByRole("button", { name: "모임 목록" }).click();
  await page.getByRole("button", { name: "제품 기획 회의", exact: true }).click();
  await page.getByRole("button", { name: "같은 요청으로 접수 확인" }).click();
  await expect(page.getByRole("status").filter({ hasText: "재분석 요청을 접수했어요." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "조회할 분석 이력" })).toHaveValue(acceptedId);
  expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
});
