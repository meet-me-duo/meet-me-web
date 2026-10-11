import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const ownText = "화요일  저녁\n목요일은 8시부터\n" + "아주긴조건".repeat(70);
const candidate = { candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "합성 후보", time_ranges: [{ start_at: "2026-10-07T10:00:00Z", end_at: "2026-10-07T12:00:00Z" }] };

async function fixture(page: Page, status: string, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const path = `/api/rooms/${code}`;
  const unexpected: string[] = [];
  const errors: string[] = [];
  const reads: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== "GET") { unexpected.push(request.method() + " " + request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === path + "/submission") { reads.push(url.pathname); return route.fulfill({ json: { raw_text: ownText, revision: 7, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z", editable: false } }); }
    if (url.pathname === path + "/candidates") return route.fulfill({ json: { quality: status === "READY_WITH_WARNINGS" ? "PARTIAL" : "COMPLETE", applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0, candidates: [candidate] } });
    if (url.pathname === path + "/result") return route.fulfill({ json: { candidate, confirmed_at: "2026-10-07T13:00:00Z" } });
    if (url.pathname === path) return route.fulfill({ json: { invite_code: code, purpose: "저장 입력 확인", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "DEFAULTED", expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-07T08:00:00Z", public_status: status, viewer: { joined: true, display_name: "합성 참여자", role: "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT" } });
    unexpected.push(request.method() + " " + url.pathname);
    return route.abort();
  });
  return { reads, unexpected, errors };
}

for (const width of [1440, 390, 320]) test.describe(`saved input at ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } });
  for (const status of ["ANALYZING", "INSUFFICIENT_PARTICIPANTS", "ANALYSIS_DELAYED", "NO_MATCH", "READY", "READY_WITH_WARNINGS", "CONFIRMED"]) {
    test(`reads own input after ${status} without writes`, async ({ page, baseURL }, testInfo) => {
      const mock = await fixture(page, status, baseURL!);
      await page.goto(`/rooms/${code}`);
      const summary = page.locator(".saved-submission summary");
      await expect(summary).toBeVisible();
      expect(mock.reads).toHaveLength(0);
      await summary.click();
      await expect(page.locator(".saved-submission .submitted-text")).toHaveText(ownText);
      await expect(page.getByText("저장된 입력 #7")).toBeVisible();
      expect(mock.reads).toHaveLength(1);
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "내 조건 수정" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "조건 수정 열기" })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.evaluate(text => Object.values({ ...localStorage, ...sessionStorage }).some(value => String(value).includes(text)), ownText)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath("saved-input.png"), fullPage: true });
      await summary.click();
      await expect(page.locator(".saved-submission .submitted-text")).toHaveCount(0);
      expect(mock.unexpected).toEqual([]);
      expect(mock.errors).toEqual([]);
    });
  }
  test("keyboard opens and closes saved input", async ({ page, baseURL }) => {
    const mock = await fixture(page, "NO_MATCH", baseURL!);
    await page.goto(`/rooms/${code}`);
    const summary = page.locator(".saved-submission summary");
    await expect(summary).toBeVisible();
    for (let index = 0; index < 15; index++) {
      if (await summary.evaluate(element => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(summary).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator(".saved-submission .submitted-text")).toHaveText(ownText);
    await page.keyboard.press("Space");
    await expect(page.locator(".saved-submission .submitted-text")).toHaveCount(0);
    expect(mock.unexpected).toEqual([]);
    expect(mock.errors).toEqual([]);
  });
});
