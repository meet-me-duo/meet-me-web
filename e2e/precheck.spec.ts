import { expect, test, type Page } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

// Synthetic transport only: no real backend, OAuth or model. Independent public
// UI/HTTP oracle PS01/03/04/07/09/14/18/20/30, approved PD03/04.
const code = "abcdefghijklmnopqrstuv";
const checkId = "22222222-2222-4222-8222-222222222222";
const participantId = "33333333-3333-4333-8333-333333333333";
const path = `/api/rooms/${code}`;
const raw = "내일 7~8시 가능, 온라인만 가능";
const textVersion = (raw_text = raw, revision = 1) => ({ revision, raw_text, created_at: "2026-10-17T10:00:00Z", interpretation_reference_at: "2026-10-17T10:00:00Z" });
function current(status: string | null = null) {
  return { candidate: status ? textVersion() : null, accepted: null as (ReturnType<typeof textVersion> & { confirmation_source: "PRECHECK" | "LEGACY_CORRECTION" }) | null,
    check: status ? { id: checkId, status, version: 1, retry_allowed: ["FAILED", "TIMED_OUT", "FAILED_QUEUE"].includes(status), failure_code: null, question: null as null | { id: string; text: string; source_excerpt: string; options: { id: string; text: string; proposed_text: string }[] } } : null,
    submission_complete: false, applied_to_result: false,
    room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: "2026-10-31T10:00:00Z" }, operation_outcome: null };
}
const ownRoom = { invite_code: code, purpose: "제출 전 확인 브라우저 합성", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-17", search_end_date: "2026-10-31", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: "2026-10-31T10:00:00Z", manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, display_name: "본인", role: "MEMBER", context_id: participantId }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
async function fixture(page: Page, baseURL: string, initial = current(), joined = true, role: "HOST" | "MEMBER" = "MEMBER", protocol = "PRE_SUBMIT_V1") {
  const origin = new URL(baseURL).origin;
  let state = initial; const writes: { path: string; body: Record<string, unknown> }[] = []; const reads: string[] = []; const unexpected: string[] = []; const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(request.method() + " " + request.url()); return route.abort(); }
    if (await fulfillAccountRefresh(route, role === "HOST" ? "합성 주최자" : null)) return;
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() === "GET" && url.pathname === path) return route.fulfill({ json: { ...ownRoom, submission_protocol: protocol, viewer: joined ? { ...ownRoom.viewer, role } : { joined: false, display_name: null, role: null } } });
    if (request.method() === "GET" && url.pathname === path + "/guest-records") return route.fulfill({ json: { records: [{ participant_id: participantId, display_name: "본인" }] } });
    if (request.method() === "GET" && url.pathname === path + "/submission/checks/current") { reads.push(url.pathname); return route.fulfill({ json: state }); }
    if (request.method() === "POST" && url.pathname === path + "/guest-records/reaccess") return route.fulfill({ json: { participant_id: participantId, level: "REPLACE_ONLY" } });
    if (request.method() === "POST" && url.pathname.startsWith(path + "/submission/checks")) {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ path: url.pathname, body });
      if (url.pathname === path + "/submission/checks") { state = current("CHECKING"); state.candidate = textVersion(String(body.raw_text)); }
      else if (url.pathname.endsWith("/cancel")) state = current("CANCELLED");
      else state = current("CHECKING");
      return route.fulfill({ status: url.pathname.endsWith("/cancel") ? 200 : 202, json: state });
    }
    unexpected.push(request.method() + " " + url.pathname); return route.abort();
  });
  return { writes, reads, unexpected, errors, set: (next: ReturnType<typeof current>) => { state = next; } };
}
async function noPrivateStorage(page: Page, text: string) { expect(await page.evaluate(value => Object.values({ ...localStorage, ...sessionStorage }).some(item => String(item).includes(value)), text)).toBe(false); }

// PRE_SUBMIT_V2 is a browser-only contract fixture; this does not enable a server.
for (const [protocol, motion] of [["PRE_SUBMIT_V1", "searching"], ["PRE_SUBMIT_V2", "composing"]]) {
  test(`${protocol} orb animates, reduces motion, pauses offscreen and stops after cancellation`, async ({ page, baseURL }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const mock = await fixture(page, baseURL!, current("CHECKING"), true, "MEMBER", protocol);
    await page.goto(`/rooms/${code}`);
    const canvas = page.locator(`[data-orb-state="${motion}"] canvas`);
    await expect(canvas).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();
    expect((await canvas.boundingBox())!.width).toBe(64);
    await expect(page.locator('.analysis-loading [role="status"]')).toHaveAttribute("aria-live", "polite");
    await expect(page.locator(".thinking-orb")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("button", { name: "내 조건 수정", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "확인 취소", exact: true })).toHaveCount(0);
    await expect(page.locator(".precheck-card, .submission-privacy")).toHaveCount(0);
    const frame = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(frame);
    await page.screenshot({ path: info.outputPath(`${protocol}-orb.png`), fullPage: true });

    await page.emulateMedia({ reducedMotion: "reduce" });
    // Allow the media query's React effect to commit before comparing frames.
    await page.waitForTimeout(100);
    const staticFrame = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(200);
    expect(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(staticFrame);
    expect(await canvas.evaluate(node => Array.from((node as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, (node as HTMLCanvasElement).width, (node as HTMLCanvasElement).height).data).some((value, i) => i % 4 === 3 && value > 0))).toBe(true);
    await page.screenshot({ path: info.outputPath(`${protocol}-reduced-motion.png`), fullPage: true });

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.locator(".analysis-loading").evaluate(node => { node.style.marginTop = "2000px"; });
    await page.evaluate(() => scrollTo(0, 0));
    await expect(canvas).not.toBeInViewport();
    await page.waitForTimeout(100);
    const offscreenFrame = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
    await page.waitForTimeout(200);
    expect(await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).toBe(offscreenFrame);
    await page.locator(".analysis-loading").evaluate(node => { node.style.marginTop = ""; });
    await canvas.scrollIntoViewIfNeeded();
    await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(offscreenFrame);

    mock.set(current("TIMED_OUT"));
    await expect(page.getByText(/확인 시간이 초과됐어요/)).toBeVisible();
    await expect(page.getByRole("button", { name: "다시 확인", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "확인 취소", exact: true }).dblclick();
    await expect(page.locator(".thinking-orb")).toHaveCount(0);
    await expect(page.getByText(/확인을 취소했어요/)).toBeVisible();
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]?.path).toBe(path + `/submission/checks/${checkId}/cancel`);
    await expect(page.getByText(raw, { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Meet me 홈" }).click();
    await page.goBack();
    await expect(page.getByText(/확인을 취소했어요/)).toBeVisible();
    await expect(page.locator(".thinking-orb")).toHaveCount(0);
    expect(mock.writes).toHaveLength(1);
    expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });
}

test.describe("#107 synthetic browser pre-submit", () => {
  test("one card retains text and shows pending without false completion after a double click", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`);
    const input = page.getByRole("textbox", { name: /시간·장소 조건/ });
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill("  토요일  오후\n온라인만  ");
    await page.locator(".submission-help > summary").click();
    await expect(page.getByText(/마감.*확인.*반영되지|마감.*반영되지.*확인/)).toBeVisible();
    await page.locator(".submission-help > summary").click();
    await page.getByRole("button", { name: /조건 제출하기/ }).dblclick();
    await expect(page.getByText(/확인 중|확인하고/)).toBeVisible();
    await expect(page.getByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).toHaveCount(0);
    await expect(page.locator('[data-orb-state="searching"] canvas')).toBeVisible();
    expect(mock.writes).toHaveLength(1); expect(mock.writes[0]?.body).toMatchObject({ expected_revision: 0, raw_text: "토요일  오후\n온라인만" });
    await noPrivateStorage(page, "토요일  오후"); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });

  test("reload restores a pending check by GET without creating a second write", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, current("CHECKING")); await page.goto(`/rooms/${code}`);
    await expect(page.locator(".analysis-loading")).toBeVisible(); await page.reload();
    await expect(page.locator(".analysis-loading")).toBeVisible();
    await expect(page.getByText(raw, { exact: true })).toHaveCount(0); expect(mock.reads.length).toBeGreaterThanOrEqual(2); expect(mock.writes).toEqual([]);
    await expect(page.getByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).toHaveCount(0); expect(mock.unexpected).toEqual([]);
  });

  for (const status of ["FAILED", "TIMED_OUT", "FAILED_QUEUE", "CANCELLED", "LIMIT_REACHED"]) test(`${status} keeps saved text and never declares completion`, async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, current(status)); await page.goto(`/rooms/${code}`);
    await expect(page.getByText(raw, { exact: true })).toBeVisible(); await expect(page.getByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).toHaveCount(0);
    await expect(page.locator(".thinking-orb")).toHaveCount(0);
    expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });

  test("synthetic CLEAR preserves broad intent, asks no unnecessary question and displays accepted text", async ({ page, baseURL }) => {
    const value = current("CLEAR"); value.candidate = textVersion("주말 아무 때나 가능"); value.accepted = { ...textVersion("주말 아무 때나 가능", 8), confirmation_source: "PRECHECK" }; value.submission_complete = true;
    const mock = await fixture(page, baseURL!, value); await page.goto(`/rooms/${code}`);
    await expect(page.getByText(/조건 제출을 완료했어요|다른 참여자를 기다려/)).toBeVisible(); await expect(page.getByText("주말 아무 때나 가능", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /오전|오후|직접 수정/ })).toHaveCount(0); expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
  });

  test("keyboard choice shows the complete proposed text before explicit confirmation", async ({ page, baseURL }) => {
    const value = current("NEEDS_CHOICE"); value.check!.question = { id: "44444444-4444-4444-8444-444444444444", text: "오전과 오후 중 어느 시간인가요?", source_excerpt: "7~8시", options: [{ id: "A", text: "오전", proposed_text: "내일 오전 7~8시 가능, 온라인만 가능" }, { id: "B", text: "오후", proposed_text: "내일 오후 7~8시 가능, 온라인만 가능" }] };
    const mock = await fixture(page, baseURL!, value); await page.goto(`/rooms/${code}`);
    const morning = page.getByRole("button", { name: /오전/ }); await morning.focus(); await page.keyboard.press("Enter");
    await expect(page.getByText("내일 오전 7~8시 가능, 온라인만 가능", { exact: true })).toBeVisible(); expect(mock.writes).toEqual([]);
    await page.getByRole("button", { name: /이 해석으로 확인|선택 확정|선택한 내용.*확인/ }).click();
    await expect.poll(() => mock.writes.length).toBe(1); expect(mock.writes[0]?.body).toMatchObject({ expected_revision: 1, expected_check_version: 1, question_id: "44444444-4444-4444-8444-444444444444", choice_id: "A" });
    expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });

  test("REPLACE_ONLY reaccess never sends a question GET or grants own-precheck access", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, current(), false); await page.goto(`/rooms/${code}`);
    await page.getByRole("combobox", { name: "다시 접근할 참여 기록" }).selectOption(participantId);
    await page.getByRole("button", { name: "기록에 다시 접근" }).click(); await expect(page.getByRole("textbox", { name: "새 참여 조건" })).toBeVisible();
    expect(mock.reads).toEqual([]); expect(mock.writes).toEqual([]); await expect(page.getByText(raw)).toHaveCount(0); expect(mock.unexpected).toEqual([]);
  });

  test("500 emoji code points remain valid while 501 cannot submit or be silently truncated", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`); const input = page.getByRole("textbox", { name: /시간·장소 조건/ });
    await input.fill("😀".repeat(500)); await expect(page.getByRole("button", { name: /조건 제출하기/ })).toBeEnabled();
    await input.fill("😀".repeat(501)); await expect(input).toHaveValue("😀".repeat(501)); await expect(page.getByRole("button", { name: /조건 제출하기/ })).toBeDisabled();
    expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
  });
});

for (const width of [320, 390, 1440]) {
  test(`saved precheck hierarchy and cancellable HOST confirmation at ${width}px`, async ({ page, baseURL }, info) => {
    const mock = await fixture(page, baseURL!, current("FAILED"), true, "HOST");
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: "저장된 조건", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "가능한 조건을 알려주세요" })).toHaveCount(0);
    await expect(page.locator(".room-header h1")).toHaveText(ownRoom.purpose);
    await expect(page.locator(".room-header").getByRole("button", { name: "초대 링크 복사" })).toBeVisible();
    await expect(page.locator(".submission-layout > aside")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /이 브라우저의.*참여 연결/ })).toHaveCount(0);
    const cancel = page.getByRole("button", { name: "확인 취소", exact: true });
    const tools = page.locator(".host-tools-inline");
    expect(await cancel.evaluate((element) => !!(element.compareDocumentPosition(document.querySelector(".host-tools-inline")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(tools.locator("summary")).toHaveText("주최자 도구");
    await tools.locator("summary").click();
    await page.screenshot({ path: info.outputPath("saved-condition-hierarchy.png"), fullPage: true });
    const trigger = tools.getByRole("button", { name: "입력 마감하기" });
    await trigger.click(); const dialog = page.getByRole("dialog", { name: "지금 입력을 마감할까요?" });
    const back = dialog.getByRole("button", { name: "돌아가기" });
    await expect(back).toBeFocused(); await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "지금 입력 마감", exact: true })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(back).toBeFocused();
    await page.screenshot({ path: info.outputPath("room-close-confirmation.png"), fullPage: true });
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click(); await page.getByRole("dialog").getByRole("button", { name: "돌아가기" }).click();
    expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
    await expect(page.getByText(raw, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
