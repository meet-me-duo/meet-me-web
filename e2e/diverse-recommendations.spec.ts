import { expect, test, type Page } from "@playwright/test";
import type { ConfirmedResult, RecommendationList, RecommendationOption, Room } from "../src/api/types";

const code = "abcdefghijklmnopqrstuv";
const analysis = "11111111-1111-4111-8111-111111111111";
const freshAnalysis = "22222222-2222-4222-8222-222222222222";
const optionId = "33333333-3333-4333-8333-333333333333";
const local = "44444444-4444-4444-8444-444444444444";
const online = "55555555-5555-4555-8555-555555555555";
const cursor = "opaque+/=&?%23";
const fixtures = new Map<Page, { unexpected: string[]; errors: string[] }[]>();
test.afterEach(({ page }) => {
  for (const mock of fixtures.get(page) ?? []) { expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]); }
  fixtures.delete(page);
});
const ownText = "합성 본인 입력\n이번 주 저녁 가능";

function option(id = optionId, rank: number | null = 1, day = "08"): RecommendationOption {
  return { option_id: id, rank, summary: "합성 가능한 시간", time_range: { start_at: `2026-10-${day}T01:00:00Z`, end_at: `2026-10-${day}T05:00:00Z` }, variants: [
    { variant_id: local, meeting_mode: "IN_PERSON", attendance_count: 4, total_participants: 4, partial_attendance: false, place: { display_name: "강남", latitude: null, longitude: null } },
    { variant_id: online, meeting_mode: "REMOTE", attendance_count: 3, total_participants: 4, partial_attendance: true, place: null },
  ] };
}
async function fixture(page: Page, baseURL: string, options: { count?: number; role?: "HOST" | "MEMBER"; protocol?: string; failure?: 409 | 503; precise?: boolean } = {}) {
  const root = `/api/rooms/${code}`;
  const origin = new URL(baseURL).origin;
  const writes: { path: string; body: Record<string, string> }[] = [];
  const reads: string[] = []; const unexpected: string[] = []; const errors: string[] = [];
  let active = analysis; let version = 10; let confirmed: ConfirmedResult | undefined; let failed = false;
  const snapshot = (): Room => ({ invite_code: code, purpose: "합성 다양한 추천 시간", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-07", search_end_date: "2026-10-15", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-10-07T00:00:00Z", public_status: confirmed ? "CONFIRMED" : "READY", viewer: { joined: true, role: options.role ?? "HOST", display_name: "합성 참여자", context_id: local }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", state_version: version, revision_generation: 0, revision_round: null, analysis_id: active, capabilities: { can_edit_own_submission: false, can_open_revision: false, can_analyze_revision: false, can_confirm: !confirmed, can_force_reparse: false }, remaining_correction_analyses: 3, recommendation_protocol: options.protocol ?? "diverse-time-v1" });
  const listing = (items: RecommendationOption[], next: string | null = null): RecommendationList => ({ protocol: "diverse-time-v1", analysis_id: active, state_version: version, quality: "COMPLETE", total_options: 5, options: items, has_alternatives: true, next_cursor: next });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return method === "GET" ? route.continue() : route.abort();
    if (method === "GET") {
      reads.push(url.pathname + url.search);
      if (url.pathname === root) return route.fulfill({ json: snapshot() });
      if (url.pathname === root + "/submission") return route.fulfill({ json: { raw_text: ownText, revision: 7, editable: false, locale: "ko-KR", created_at: "2026-10-07T00:00:00Z" } });
      if (url.pathname === root + "/recommendations") return route.fulfill({ json: listing(Array.from({ length: options.count ?? 1 }, (_, index) => {
        const item = option(`${index + 3}3333333-3333-4333-8333-333333333333`, index + 1, active === analysis ? String(8 + index).padStart(2, "0") : "09");
        return options.precise ? { ...item, time_range: { start_at: "2026-10-08T01:00:00.000001Z", end_at: "2026-10-08T01:00:00.000002Z" } } : item;
      })) });
      if (url.pathname === root + "/recommendations/alternatives") {
        expect(url.searchParams.get("analysis_id")).toBe(active); expect(url.searchParams.get("limit")).toBe("20");
        const incoming = url.searchParams.get("cursor");
        expect(incoming).toBe(incoming === null ? null : cursor);
        return route.fulfill({ json: listing([option(incoming === null ? local : online, null, incoming === null ? "11" : "12")], incoming === null ? cursor : null) });
      }
      if (url.pathname === root + "/result" && confirmed) return route.fulfill({ json: confirmed });
    }
    if (method === "POST" && url.pathname === root + `/recommendations/${optionId}/confirmation`) {
      const body = request.postDataJSON() as Record<string, string>; writes.push({ path: url.pathname, body });
      expect(Object.keys(body).sort()).toEqual(["analysis_id", "end_at", "start_at", "variant_id"]);
      if (options.failure && !failed) {
        failed = true;
        if (options.failure === 409) { active = freshAnalysis; version++; }
        return route.fulfill({ status: options.failure, json: { status: options.failure, code: options.failure === 409 ? "STALE_ANALYSIS" : "RATE_LIMIT_UNAVAILABLE", detail: options.failure === 409 ? "합성 분석 갱신" : "합성 요청 저장소 장애" } });
      }
      expect(body.analysis_id).toBe(active);
      confirmed = { confirmed_at: "2026-10-07T00:00:00Z", selection: { protocol: "diverse-time-v1", analysis_id: active, option_id: optionId, variant_id: body.variant_id!, start_at: body.start_at!, end_at: body.end_at! }, candidate: { candidate_id: null, plan_type: "C", rank: 1, meeting_mode: "REMOTE", attendance_count: 3, total_participants: 4, place: null, summary: "합성 확정", time_ranges: [{ start_at: body.start_at!, end_at: body.end_at! }] } }; version++;
      return route.fulfill({ json: confirmed });
    }
    unexpected.push(method + " " + url.pathname); return route.abort();
  });
  fixtures.set(page, [...(fixtures.get(page) ?? []), { unexpected, errors }]);
  return { writes, reads, unexpected, errors };
}
async function enter(page: Page) {
  await page.getByRole("radio", { name: /온라인/ }).check();
  await page.getByRole("button", { name: "이 시간 선택" }).click();
  await expect(page.getByLabel("시작 시간", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("종료 시간", { exact: true })).toHaveValue("");
  await page.getByLabel("시작 시간", { exact: true }).fill("2026-10-08T10:30");
  await page.getByLabel("종료 시간", { exact: true }).fill("2026-10-08T11:15");
}
for (const width of [1440, 390, 320]) test.describe(`native recommendation ${width}px`, () => {
  test.use({ viewport: { width, height: 844 }, timezoneId: "America/Los_Angeles" });
  test("uses room timezone, preserves explicit times, sends one tuple, and protects the saved result", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`); await enter(page);
    await page.getByRole("button", { name: "일정 확정" }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
    expect(mock.writes).toHaveLength(1); expect(mock.writes[0]?.body).toEqual({ analysis_id: analysis, variant_id: online, start_at: "2026-10-08T01:30:00.000Z", end_at: "2026-10-08T02:15:00.000Z" });
    await expect(page.getByRole("article")).toContainText("10:30"); await expect(page.getByRole("article")).toContainText("11:15");
    await expect(page.getByRole("article")).toContainText("3/4"); await expect(page.getByRole("article")).toContainText("온라인");
    await expect(page.getByRole("button", { name: /일정 확정|조건 수정 열기/ })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
    expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });
  test("explicit whole-range action preserves microsecond bounds in the browser and saved result", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { precise: true }); await page.goto(`/rooms/${code}`);
    await page.getByRole("radio", { name: /온라인/ }).check(); await page.getByRole("button", { name: "이 시간 선택" }).click();
    await expect(page.getByLabel("시작 시간", { exact: true })).toHaveValue(""); await expect(page.getByLabel("종료 시간", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "가능한 범위 전체 선택" }).click();
    await expect(page.getByText(/확정할 일정/)).toContainText("10:00:00.000001"); await expect(page.getByText(/확정할 일정/)).toContainText("10:00:00.000002");
    await page.getByRole("button", { name: "일정 확정" }).click(); await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
    expect(mock.writes).toHaveLength(1); expect(mock.writes[0]?.body.start_at).toBe("2026-10-08T01:00:00.000001Z"); expect(mock.writes[0]?.body.end_at).toBe("2026-10-08T01:00:00.000002Z");
    await expect(page.getByRole("article")).toContainText("10:00:00.000001"); await expect(page.getByRole("article")).toContainText("10:00:00.000002"); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });
  test("shows three dates, loads opaque pages only on request, and stops at null", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { count: 3 }); await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("article")).toHaveCount(3);
    expect(mock.reads.some(path => path.includes("/alternatives"))).toBe(false);
    await page.getByRole("button", { name: "다른 가능한 시간 보기" }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(page.getByRole("article")).toHaveCount(4);
    await page.getByRole("button", { name: "다른 가능한 시간 보기" }).click(); await expect(page.getByRole("article")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "다른 가능한 시간 보기" })).toHaveCount(0);
    expect(mock.reads.filter(path => path.includes("/alternatives"))).toHaveLength(2); expect(mock.writes).toHaveLength(0); expect(mock.unexpected).toEqual([]);
  });
  test("keyboard return restores focus and keeps native boundaries accessible without horizontal overflow", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`);
    const choice = page.getByRole("button", { name: "이 시간 선택" }); await choice.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /실제 일정 선택/ })).toBeFocused();
    const back = page.getByRole("button", { name: "추천안으로 돌아가기" }); await back.focus(); await page.keyboard.press("Enter"); await expect(choice).toBeFocused();
    expect((await choice.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mock.writes).toHaveLength(0); expect(mock.errors).toEqual([]);
    await page.screenshot({ path: `test-results/recommendations-19/native-${test.info().project.name}-${width}.png`, fullPage: true });
  });
  test("503 preserves input and requires an explicit retry", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { failure: 503 }); await page.goto(`/rooms/${code}`); await enter(page);
    await page.getByRole("button", { name: "일정 확정" }).click(); await expect(page.getByText("합성 요청 저장소 장애")).toBeVisible();
    await expect(page.getByLabel("시작 시간", { exact: true })).toHaveValue("2026-10-08T10:30"); await expect(page.getByLabel("종료 시간", { exact: true })).toHaveValue("2026-10-08T11:15");
    expect(mock.writes).toHaveLength(1); await page.getByRole("button", { name: "일정 확정" }).click(); await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
    expect(mock.writes).toHaveLength(2); expect(mock.unexpected).toEqual([]);
  });
  test("409 replaces the selection with the current analysis", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { failure: 409 }); await page.goto(`/rooms/${code}`); await enter(page);
    await page.getByRole("button", { name: "일정 확정" }).click(); await expect(page.getByRole("heading", { name: "추천안 1" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /온라인/ })).toHaveAccessibleName(/2026-10-09/);
    await expect(page.getByLabel("시작 시간", { exact: true })).toHaveCount(0); expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]);
  });
  test("MEMBER reads only their saved input; unknown protocol blocks all recommendation routes", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { role: "MEMBER" }); await page.goto(`/rooms/${code}`); await expect(page.getByRole("heading", { name: "추천안 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "이 시간 선택" })).toHaveCount(0);
    expect(mock.reads.some(path => path.includes("/submission"))).toBe(false); await page.getByText("내 저장 입력 확인").click(); await expect(page.getByText(ownText, { exact: true })).toBeVisible();
    expect(await page.evaluate(value => Object.values({ ...localStorage, ...sessionStorage }).some(item => String(item).includes(value)), ownText)).toBe(false);
    expect(mock.writes).toHaveLength(0); expect(mock.unexpected).toEqual([]);
    await page.unroute("**/*"); const unknown = await fixture(page, baseURL!, { protocol: "diverse-time-v2" }); await page.reload(); await expect(page.getByRole("heading", { name: "추천 화면 업데이트가 필요해요" })).toBeVisible();
    expect(unknown.reads.some(path => /recommendations|candidates/.test(path))).toBe(false); expect(unknown.writes).toHaveLength(0); expect(unknown.unexpected).toEqual([]);
  });
});
