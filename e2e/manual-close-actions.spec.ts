import { expect, test, type Page } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

const code = "abcdefghijklmnopqrstuv";
const root = `/api/rooms/${code}`;
const raw = "합성 입력: 수요일 오후 온라인으로 가능해요.";
type Options = { role?: "HOST" | "MEMBER"; manual?: boolean; protocol?: string; status?: string; signedIn?: boolean; closed?: boolean };
async function fixture(page: Page, baseURL: string, options: Options = {}) {
  const { role = "HOST", manual = true, protocol = "PRE_SUBMIT_V1", signedIn = true } = options;
  const state = { status: options.status ?? "NEEDS_EDIT", closed: options.closed ?? false, failClose: false, waitClose: null as Promise<void> | null, writes: [] as { path: string; body: unknown }[], unexpected: [] as string[], errors: [] as string[] };
  const text = { revision: 2, raw_text: raw, created_at: "2026-11-03T09:00:00Z", interpretation_reference_at: "2026-11-03T09:00:00Z" };
  const room = () => ({ invite_code: code, purpose: "합성 수동 마감 모임", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-11-03", search_end_date: "2026-11-10", search_range_source: "HOST_SPECIFIED", expected_participants: manual ? null : 4, submission_deadline: null, manual_only: manual,
    collection_status: state.closed ? "CLOSED" : "COLLECTING", closure_reason: state.closed ? "MANUAL" : null, closed_at: state.closed ? "2026-11-03T10:00:00Z" : null, public_status: state.closed ? "ANALYZING" : "COLLECTING", state_version: state.closed ? 2 : 1,
    viewer: { joined: true, role, display_name: "합성 사용자", context_id: "33333333-3333-4333-8333-333333333333" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: protocol });
  const snapshot = () => ({ candidate: text, accepted: ["CLEAR", "RECEIVED"].includes(state.status) ? { ...text, confirmation_source: "PRECHECK" } : null,
    check: { id: "22222222-2222-4222-8222-222222222222", status: state.status, version: 1, retry_allowed: state.status === "TIMED_OUT", failure_code: null, question: null }, submission_complete: ["CLEAR", "RECEIVED"].includes(state.status), applied_to_result: false,
    room: { collection_status: room().collection_status, state_version: room().state_version, submission_deadline: null }, operation_outcome: null });
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin) { state.unexpected.push(request.url()); return route.abort(); }
    if (await fulfillAccountRefresh(route, signedIn ? "합성 사용자" : null)) return;
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") state.writes.push({ path: url.pathname, body: request.postDataJSON() });
    if (url.pathname === "/api/account/rooms" && request.method() === "GET") return route.fulfill({ json: { rooms: [{ invite_code: code, purpose: room().purpose, role, created_at: "2026-11-03T09:00:00Z", expires_at: "2026-12-03T09:00:00Z" }], has_more: false, next_cursor: null } });
    if (url.pathname === root && request.method() === "GET") return route.fulfill({ json: room() });
    if (url.pathname === root + "/submission/checks/current" && request.method() === "GET") return route.fulfill({ json: snapshot() });
    if (url.pathname === root + "/close" && request.method() === "POST") {
      if (state.waitClose) await state.waitClose;
      if (state.failClose) return route.fulfill({ status: 503, json: { detail: "합성 마감 오류: 다시 확인해 주세요." } });
      state.closed = true;
      return route.fulfill({ json: room() }).catch(() => {});
    }
    state.unexpected.push(request.method() + " " + url.pathname); return route.abort();
  });
  return state;
}
async function stamp(page: Page) {
  await page.evaluate(() => { const label = document.createElement("div"); label.textContent = "독립 cloud · 합성 미리보기 · 운영 요청 없음"; label.style.cssText = "position:fixed;bottom:3px;right:3px;background:#e0f2fe;color:#075985;font:11px sans-serif;padding:4px;z-index:9999;pointer-events:none"; document.body.append(label); });
}

for (const [width, height] of [[1440, 900], [390, 844], [320, 480]]) test(`completed manual HOST input remains concise at ${width}x${height}`, async ({ page, baseURL }, info) => {
  const mock = await fixture(page, baseURL!, { status: "CLEAR" }); await page.setViewportSize({ width, height });
  await page.goto("/account/rooms"); await page.locator(".account-history-room").click();
  const group = page.getByRole("group", { name: "내 입력 관리" });
  await expect(group.getByRole("button")).toHaveText(["내 조건 수정", "입력 마감하기"]);
  await expect(page.getByRole("heading", { name: "내 입력", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /저장된 조건|저장된 원문/ })).toHaveCount(0);
  const [edit, close] = await group.getByRole("button").all();
  const editBox = (await edit.boundingBox())!, closeBox = (await close.boundingBox())!;
  expect(closeBox.y).toBeGreaterThanOrEqual(editBox.y + editBox.height + 7.9);
  expect(Math.abs(closeBox.x - editBox.x)).toBeLessThan(1);
  expect(Math.abs(closeBox.width - editBox.width)).toBeLessThan(1);
  await expect(page.locator(".submission-help")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "확인 취소" })).toHaveCount(0);
  await expect(page.locator(".host-tools-inline > summary")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await stamp(page); await page.screenshot({ path: info.outputPath("completed-host-initial.png") });
  await group.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("completed-host-actions.png"), fullPage: true });
  await group.getByRole("button", { name: "입력 마감하기" }).click();
  await expect(page.getByRole("dialog", { name: "지금 입력을 마감할까요?" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("completed-host-dialog.png") });
  await page.getByRole("dialog").getByRole("button", { name: "돌아가기" }).click();
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});

for (const width of [320, 390, 1440]) test(`manual HOST discovers editing and closing from account rooms at ${width}px`, async ({ page, baseURL }, info) => {
  const mock = await fixture(page, baseURL!); await page.setViewportSize({ width, height: 900 });
  await page.goto("/account/rooms"); await page.locator(".account-history-room").click();
  const group = page.getByRole("group", { name: "내 입력 관리" });
  await expect(group.getByRole("button")).toHaveText(["내 조건 수정", "입력 마감하기"]);
  await expect(page.locator(".host-tools-inline > summary")).toHaveCount(0);
  const trigger = group.getByRole("button", { name: "입력 마감하기" }); await expect(trigger).toHaveClass(/danger-outline/);
  for (const button of await group.getByRole("button").all()) {
    const box = (await button.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await stamp(page); await page.screenshot({ path: info.outputPath("manual-host-actions.png"), fullPage: true });
  await trigger.click(); const dialog = page.getByRole("dialog", { name: "지금 입력을 마감할까요?" });
  const back = dialog.getByRole("button", { name: "돌아가기" }); await expect(back).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "지금 입력 마감", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(back).toBeFocused();
  await page.screenshot({ path: info.outputPath("manual-close-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByRole("dialog").getByRole("button", { name: "돌아가기" }).click(); await expect(trigger).toBeFocused();
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

for (const signedIn of [true, false]) test(`MEMBER keeps only editing (account=${signedIn})`, async ({ page, baseURL }, info) => {
  const mock = await fixture(page, baseURL!, { role: "MEMBER", signedIn });
  if (signedIn) { await page.goto("/account/rooms"); await page.locator(".account-history-room").click(); } else await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("group", { name: "내 입력 관리" }).getByRole("button")).toHaveText(["내 조건 수정"]);
  await expect(page.getByRole("button", { name: "입력 마감하기" })).toHaveCount(0); await expect(page.locator(".host-tools-inline")).toHaveCount(0);
  await stamp(page); await page.screenshot({ path: info.outputPath("member-actions.png"), fullPage: true });
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
});

test("auto-closing HOST has no manual close action or HOST disclosure", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { manual: false }); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("group", { name: "내 입력 관리" }).getByRole("button")).toHaveText(["내 조건 수정"]);
  await expect(page.locator(".host-tools-inline > summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "입력 마감하기" })).toHaveCount(0);
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
});

for (const [protocol, status] of [["PRE_SUBMIT_V1", "CLEAR"], ["PRE_SUBMIT_V2", "RECEIVED"], ["PRE_SUBMIT_V2", "CANCELLED"]]) test(`does not force cancel into ${protocol}/${status}`, async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { protocol, status }); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("group", { name: "내 입력 관리" }).getByRole("button")).toHaveText(["내 조건 수정", "입력 마감하기"]);
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
});

test("normal manual HOST loading has no controls, timeout exposes existing recovery, closed analysis has none", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { status: "CHECKING" }); await page.goto(`/rooms/${code}`);
  await expect(page.locator('.analysis-loading [data-orb-state="searching"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /내 조건 수정|확인 취소|입력 마감하기/ })).toHaveCount(0);
  mock.status = "TIMED_OUT"; await expect(page.getByText(/확인 시간이 초과됐어요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 확인", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "입력 마감하기" })).toBeEnabled();
  mock.closed = true; await page.reload(); await expect(page.locator(".analysis-loading")).toBeVisible();
  await expect(page.getByRole("button", { name: /내 조건 수정|확인 취소|입력 마감하기/ })).toHaveCount(0);
  expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});

test("confirmed close sends exactly one request and enters the existing analysis screen", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`);
  let release!: () => void; mock.waitClose = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "입력 마감하기" }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "지금 입력 마감", exact: true }).evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  await expect.poll(() => mock.writes.length).toBe(1); await expect(dialog.getByRole("button", { name: "돌아가기" })).toBeDisabled();
  expect(mock.writes).toEqual([{ path: root + "/close", body: { confirm_early: true } }]);
  release(); await expect(page.locator(".analysis-loading")).toBeVisible();
  await expect(page.getByRole("button", { name: "입력 마감하기" })).toHaveCount(0);
  expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});

test("close failure recovers and leaving during a later pending close cannot restore the room", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!); mock.failClose = true; await page.goto(`/rooms/${code}`);
  await page.getByRole("button", { name: "입력 마감하기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "지금 입력 마감", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("합성 마감 오류");
  expect(mock.writes).toHaveLength(1); await page.getByRole("dialog").getByRole("button", { name: "돌아가기" }).click();
  await expect(page.getByText(raw, { exact: true })).toBeVisible();
  mock.failClose = false; let release!: () => void; mock.waitClose = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "입력 마감하기" }).click(); await page.getByRole("dialog").getByRole("button", { name: "지금 입력 마감", exact: true }).click();
  await expect.poll(() => mock.writes.length).toBe(2); await page.goto("/"); release();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("조건만 말하세요"); await expect(page).toHaveURL(/\/$/);
  expect(mock.writes).toHaveLength(2); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});
