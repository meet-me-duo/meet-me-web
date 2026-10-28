import { expect, test, type Page } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

const code = "abcdefghijklmnopqrstuv";
const root = `/api/rooms/${code}`;
const promptId = "11111111-1111-4111-8111-111111111111";
const candidate = {
  candidate_id: "22222222-2222-4222-8222-222222222222", plan_type: "A", rank: 1,
  meeting_mode: "REMOTE", attendance_count: 2, total_participants: 2, place: null,
  summary: "합성 리뷰 검증 일정",
  time_ranges: [{ start_at: "2026-10-30T09:00:00Z", end_at: "2026-10-30T10:00:00Z" }],
};

async function fixture(page: Page, baseURL: string, options: {
  selection?: boolean; role?: "HOST" | "MEMBER"; resultFailure?: boolean; suppressed?: boolean; failFirstSubmit?: boolean;
  support?: { value: unknown };
} = {}) {
  const state = { claims: [] as unknown[], submissions: [] as unknown[], closes: [] as unknown[], unexpected: [] as string[], errors: [] as string[] };
  const role = options.role ?? "MEMBER";
  let claimRequest: string | null = null;
  let terminal = false;
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { state.unexpected.push(request.method() + " " + url.origin); return route.abort(); }
    if (await fulfillAccountRefresh(route, role === "HOST" ? "합성 주최자" : null)) return;
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === root && request.method() === "GET") return route.fulfill({ json: {
      invite_code: code, purpose: "확정 결과 리뷰 검증", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
      search_start_date: "2026-10-28", search_end_date: "2026-11-01", search_range_source: "DEFAULTED",
      expected_participants: 2, submission_deadline: null, manual_only: false,
      collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-28T09:00:00Z",
      public_status: "CONFIRMED", input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
      ...(options.support ? (options.support.value === undefined ? {} : { review_prompt_supported: options.support.value }) : { review_prompt_supported: true }),
      viewer: { joined: true, role, display_name: "합성 참여자", context_id: "33333333-3333-4333-8333-333333333333" },
    } });
    if (url.pathname === root + "/submission" && request.method() === "GET") return route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    if (url.pathname === root + "/result" && request.method() === "GET") {
      if (options.resultFailure) return route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", detail: "합성 결과 조회 실패" } });
      return route.fulfill({ json: {
        candidate, confirmed_at: "2026-10-28T09:01:00Z",
        ...(options.selection ? { selection: {
          protocol: "diverse-time-v1", analysis_id: "44444444-4444-4444-8444-444444444444",
          option_id: "55555555-5555-4555-8555-555555555555", variant_id: "66666666-6666-4666-8666-666666666666",
          start_at: "2026-10-30T09:00:00Z", end_at: "2026-10-30T10:00:00Z",
        } } : {}),
      } });
    }
    if (url.pathname === root + "/review-prompt") {
      expect(request.method()).toBe("POST");
      const body = request.postDataJSON() as { request_id: string };
      expect(body).toEqual({ request_id: expect.stringMatching(/^[0-9a-f-]{36}$/i) });
      state.claims.push(body);
      const pending = !options.suppressed && !terminal && (claimRequest === null || claimRequest === body.request_id);
      claimRequest ??= body.request_id;
      return route.fulfill({ json: { prompt_id: pending ? promptId : null, state: pending ? "PENDING" : "SUPPRESSED" } });
    }
    if (url.pathname === root + `/review-prompt/${promptId}/submission`) {
      expect(request.method()).toBe("POST"); state.submissions.push(request.postDataJSON());
      if (options.failFirstSubmit && state.submissions.length === 1) return route.fulfill({ status: 503, json: { detail: "합성 내부 오류 원문" } });
      terminal = true; return route.fulfill({ json: { prompt_id: promptId, state: "SUBMITTED" } });
    }
    if (url.pathname === root + `/review-prompt/${promptId}/close`) {
      expect(request.method()).toBe("POST");
      const body = request.postDataJSON() as { hide_for_week: boolean };
      expect(body).toEqual({ hide_for_week: expect.any(Boolean) }); state.closes.push(body);
      terminal = true; return route.fulfill({ json: { prompt_id: promptId, state: "CLOSED" } });
    }
    state.unexpected.push(request.method() + " " + url.pathname); return route.abort();
  });
  return state;
}

for (const selection of [false, true]) test(`confirmed ${selection ? "explicit time" : "legacy plan"} asks its viewer once and sends satisfaction only`, async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!, { selection, role: selection ? "HOST" : "MEMBER" });
  await page.goto(`/rooms/${code}`);
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "일주일간 보지 않기" }).check();
  await dialog.getByRole("checkbox", { name: "불편한 점 없이 잘 이용했어요" }).check();
  await dialog.getByRole("button", { name: "의견 보내기" }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.claims).toHaveLength(1); expect(state.submissions).toEqual([{ choices: [1], other_text: null }]); expect(state.closes).toEqual([]);
  await expect(page.getByRole("heading", { name: selection ? "실제 모임 일정이 확정됐어요" : "주최자가 선택한 플랜이에요" })).toBeVisible();
  await page.reload(); await expect(page.getByRole("heading", { name: "확정 결과 리뷰 검증", exact: true })).toBeVisible();
  await expect.poll(() => state.claims.length).toBe(2); await expect(dialog).toHaveCount(0);
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

test("checked close sends no choices or private draft through the app API", async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`);
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "기타", exact: true }).check();
  await dialog.getByRole("textbox").fill("synthetic unsent private opinion");
  await dialog.getByRole("checkbox", { name: "일주일간 보지 않기" }).check();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect.poll(() => state.closes.length).toBe(1);
  expect(state.closes).toEqual([{ hide_for_week: true }]); expect(state.submissions).toEqual([]);
  expect(JSON.stringify(state)).not.toContain("synthetic unsent private opinion");
  expect(await page.evaluate(() => Object.values(localStorage).concat(Object.values(sessionStorage)).join())).not.toContain("synthetic unsent private opinion");
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

test("a failed result lookup never claims an optional review", async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!, { resultFailure: true }); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "결과를 불러오지 못했어요" })).toBeVisible();
  expect(state.claims).toEqual([]); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

test("an uncertain submission retries the same answer without exposing backend details", async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!, { failFirstSubmit: true }); await page.goto(`/rooms/${code}`);
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox", { name: "기타", exact: true }).check();
  await dialog.getByRole("textbox").fill("synthetic submitted opinion");
  await dialog.getByRole("button", { name: "의견 보내기" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible(); await expect(dialog.getByRole("textbox")).toBeDisabled();
  await expect(page.getByText("합성 내부 오류 원문")).toHaveCount(0);
  await dialog.getByRole("button", { name: "다시 제출" }).click(); await expect(dialog).toHaveCount(0);
  expect(state.submissions).toEqual([
    { choices: [5], other_text: "synthetic submitted opinion" }, { choices: [5], other_text: "synthetic submitted opinion" },
  ]);
  expect(state.closes).toEqual([]); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

test("a server-suppressed review leaves the confirmed result available", async ({ page, baseURL }) => {
  const state = await fixture(page, baseURL!, { suppressed: true }); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "주최자가 선택한 플랜이에요" })).toBeVisible();
  await expect.poll(() => state.claims.length).toBe(1); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.submissions).toEqual([]); expect(state.closes).toEqual([]); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
});

for (const selection of [false, true]) {
  for (const { label, value } of [
    { label: "missing", value: undefined }, { label: "false", value: false }, { label: "string", value: "true" },
    { label: "number", value: 1 }, { label: "null", value: null }, { label: "object", value: { enabled: true } },
  ]) test(`old or malformed server support ${label} keeps ${selection ? "explicit time" : "legacy plan"} available without any review POST`, async ({ page, baseURL }) => {
    const state = await fixture(page, baseURL!, { selection, support: { value } });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: selection ? "실제 모임 일정이 확정됐어요" : "주최자가 선택한 플랜이에요" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(state.claims).toEqual([]); expect(state.submissions).toEqual([]); expect(state.closes).toEqual([]);
    expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
  });
}
