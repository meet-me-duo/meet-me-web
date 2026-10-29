import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

const code = "abcdefghijklmnopqrstuv";
const historyKey = "meet-me:recent-rooms:v1";
const unrelatedKey = "synthetic:unrelated-credential";
const legacy = JSON.stringify({ version: 1, rooms: [{ inviteCode: code, title: "기기 목록 전용 모임", lastOpenedAt: 1_800_000_000_000, role: "HOST" }] });
type AuditWindow = Window & { __historyAudit: { calls: string[]; read: (key: string) => string | null }; __copied?: string };

// All identities, cookies, rooms and HTTP responses below are synthetic.
async function fixture(context: BrowserContext, baseURL: string, account = false) {
  const origin = new URL(baseURL).origin;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  let privateReads = 0;
  let stored = { revision: 1, raw_text: "토요일 오후 온라인 가능", locale: "ko-KR", created_at: "2026-10-28T03:00:00Z", editable: true };
  let purpose = "공유 URL로 다시 찾는 모임";
  let hasSubmission = true;
  const room = (joined: boolean) => ({ invite_code: code, purpose, meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-28", search_end_date: "2026-11-04", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", viewer: joined ? { joined: true, display_name: account ? "합성 주최자" : "합성 참여자", role: account ? "HOST" : "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" } : { joined: false, display_name: null, role: null } });
  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
    if (await fulfillAccountRefresh(route, account ? "합성 주최자" : null)) return;
    const owns = account || (request.headers().cookie ?? "").includes("meet_me_guest=synthetic-guest-owner");
    if (request.method() !== "GET") writes.push({ path, body: request.postDataJSON() });
    if (path === `/api/rooms/${code}` && request.method() === "GET") return route.fulfill({ json: room(owns) });
    if (path === `/api/rooms/${code}/guest-records` && request.method() === "GET") return route.fulfill({ json: { records: [] } });
    if (path === `/api/rooms/${code}/submission` && owns) {
      privateReads++;
      if (!account) expect(request.headers().cookie).toContain("meet_me_guest=synthetic-guest-owner");
      if (request.method() === "PUT") { stored = { ...stored, raw_text: request.postDataJSON().raw_text, revision: stored.revision + 1 }; hasSubmission = true; }
      return hasSubmission ? route.fulfill({ json: stored }) : route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    }
    if (path === "/api/rooms" && account && request.method() === "POST") {
      expect(request.headers().authorization).toBe("Bearer synthetic-host-service-access");
      purpose = request.postDataJSON().purpose; hasSubmission = false;
      return route.fulfill({ status: 201, json: room(true) });
    }
    if (path === "/api/account/rooms" && account && request.method() === "GET") {
      expect(request.headers().authorization).toBe("Bearer synthetic-host-service-access");
      return route.fulfill({ json: { rooms: [{ invite_code: code, purpose: "계정 서버의 모임", role: "HOST", created_at: "2026-10-28T03:00:00Z", expires_at: "2026-11-28T03:00:00Z" }], has_more: false, next_cursor: null } });
    }
    unexpected.push(`${request.method()} ${path}`); return route.abort();
  });
  return { writes, unexpected, reads: () => privateReads };
}

async function auditStorage(page: Page, context: BrowserContext, value = legacy, denyStorage = false) {
  // Seed a same-origin document without loading any application code.
  await page.route("**/__history_seed", route => route.fulfill({ contentType: "text/html", body: "<p>Storage fixture</p>" }));
  await page.goto("/__history_seed");
  await page.evaluate(({ historyKey, unrelatedKey, value }) => {
    localStorage.setItem(historyKey, value); localStorage.setItem(unrelatedKey, "preserve-unrelated-data");
  }, { historyKey, unrelatedKey, value });
  await context.addInitScript(({ historyKey, denyStorage }) => {
    const originalRead = Storage.prototype.getItem;
    const audit = { calls: [] as string[], read: (key: string) => originalRead.call(localStorage, key) };
    (window as AuditWindow).__historyAudit = audit;
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, { configurable: true, writable: true, value: function(this: Storage, key: string, ...rest: string[]) {
        if (key === historyKey) audit.calls.push(method);
        if (denyStorage) throw new DOMException("synthetic storage denied", "SecurityError");
        return Reflect.apply(original, this, [key, ...rest]);
      } });
    }
    const clear = Storage.prototype.clear;
    Storage.prototype.clear = function() { audit.calls.push("clear"); return clear.call(this); };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as AuditWindow).__copied = text; } } });
  }, { historyKey, denyStorage });
  await page.goto("/");
}
async function preserved(page: Page, value = legacy) {
  expect(await page.evaluate(() => (window as AuditWindow).__historyAudit.calls)).toEqual([]);
  expect(await page.evaluate(key => (window as AuditWindow).__historyAudit.read(key), historyKey)).toBe(value);
  expect(await page.evaluate(key => (window as AuditWindow).__historyAudit.read(key), unrelatedKey)).toBe("preserve-unrelated-data");
  await expect(page.locator("#recent-rooms, .recent-shortcut")).toHaveCount(0);
}

for (const [name, value] of [["existing records", legacy], ["malformed records", "{broken"]]) {
  test(`landing omits browser history without reading or deleting ${name}`, async ({ page, context, baseURL }, info) => {
    const mock = await fixture(context, baseURL!);
    await auditStorage(page, context, value);
    await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
    await expect(page.locator(".landing-details")).toBeVisible();
    await expect(page.getByRole("heading", { name: "이 기기의 최근 모임" })).toHaveCount(0);
    await expect(page.getByText("기기 목록 전용 모임", { exact: true })).toHaveCount(0);
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new StorageEvent("storage", { key: "meet-me:recent-rooms:v1" })); });
    await preserved(page, value); expect(mock.writes).toEqual([]); expect(mock.unexpected).toEqual([]);
    if (name === "existing records") { await page.emulateMedia({ reducedMotion: "reduce" }); await page.locator(".landing").screenshot({ path: info.outputPath("landing-without-browser-records.png"), scale: "css" }); }
  });
}

test("shared URL retains guest cookie ownership, private edits, cancellation and back navigation", async ({ page, context, baseURL }) => {
  const mock = await fixture(context, baseURL!);
  await context.addCookies([{ name: "meet_me_guest", value: "synthetic-guest-owner", url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
  await auditStorage(page, context);
  await page.goto(`/rooms/${code}?tracking=remove#private`);
  await expect(page.locator(".submitted-text")).toHaveText("토요일 오후 온라인 가능");
  await expect(page.locator(".host-tools-inline > summary")).toHaveCount(0);
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await page.getByRole("textbox", { name: /시간·장소 조건/ }).fill("취소할 임시 조건");
  await page.getByRole("button", { name: "수정 취소" }).click();
  await expect(page.locator(".submitted-text")).toHaveText("토요일 오후 온라인 가능"); expect(mock.writes).toEqual([]);
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await page.getByRole("textbox", { name: /시간·장소 조건/ }).fill("일요일 오후 온라인 가능");
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect(page.locator(".submitted-text")).toHaveText("일요일 오후 온라인 가능");
  await page.locator(".room-header").getByRole("button", { name: "초대 링크 복사" }).click();
  expect(await page.evaluate(() => (window as AuditWindow).__copied)).toBe(`${new URL(baseURL!).origin}/rooms/${code}`);
  await preserved(page); await page.reload();
  await expect(page.locator(".submitted-text")).toHaveText("일요일 오후 온라인 가능");
  await page.getByRole("link", { name: "Meet me 홈" }).click();
  await expect(page).toHaveURL("/"); await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
  await page.goBack();
  await expect(page.locator(".submitted-text")).toHaveText("일요일 오후 온라인 가능");
  await preserved(page);
  const tab = await context.newPage(); await tab.goto(`/rooms/${code}`);
  await expect(tab.locator(".submitted-text")).toHaveText("일요일 오후 온라인 가능"); await preserved(tab);
  expect(mock.writes).toEqual([{ path: `/api/rooms/${code}/submission`, body: { raw_text: "일요일 오후 온라인 가능" } }]);
  expect(mock.reads()).toBeGreaterThan(1); expect(mock.unexpected).toEqual([]);
  expect((await context.cookies()).some(cookie => cookie.name === "meet_me_guest" && cookie.httpOnly)).toBe(true);
});

test("old browser metadata cannot grant participant or HOST authority", async ({ page, context, baseURL }) => {
  const mock = await fixture(context, baseURL!); await auditStorage(page, context);
  await page.goto(`/rooms/${code}`);
  await expect(page.getByLabel("이름", { exact: true })).toBeVisible();
  await expect(page.getByText("토요일 오후 온라인 가능", { exact: true })).toHaveCount(0);
  await expect(page.locator(".host-tools-inline > summary")).toHaveCount(0);
  expect(mock.reads()).toBe(0); expect(mock.writes).toEqual([]); await preserved(page); expect(mock.unexpected).toEqual([]);
});

test("anonymous hosting remains gated through cancel and back navigation", async ({ page, context, baseURL }) => {
  const mock = await fixture(context, baseURL!); await auditStorage(page, context);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("모임 목적 / 이름")).toHaveCount(0);
  await page.getByRole("link", { name: "홈으로 돌아가기" }).click();
  await expect(page).toHaveURL("/"); await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL("/create");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  expect(mock.writes).toEqual([]); await preserved(page); expect(mock.unexpected).toEqual([]);
});

test("account creation and server history work with browser storage denied", async ({ page, context, baseURL }) => {
  const mock = await fixture(context, baseURL!, true); await auditStorage(page, context, legacy, true);
  await page.goto("/create");
  await page.getByLabel("모임 목적 / 이름").fill("공유 URL 모임"); await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page).toHaveURL("/"); await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
  expect(mock.writes).toEqual([]);
  await page.goBack(); await expect(page).toHaveURL("/create"); await expect(page.getByLabel("모임 목적 / 이름")).toHaveValue("");
  await page.getByLabel("모임 목적 / 이름").fill("공유 URL 모임"); await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click(); await expect(page).toHaveURL(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "공유 URL 모임", exact: true })).toBeVisible(); await preserved(page);
  expect(mock.writes).toHaveLength(1); expect(mock.writes[0].path).toBe("/api/rooms");
  await page.getByRole("navigation", { name: "계정과 내 모임" }).getByRole("link", { name: "내 모임", exact: true }).click();
  await expect(page.getByRole("link", { name: /계정 서버의 모임/ })).toBeVisible();
  await expect(page.getByText("기기 목록 전용 모임", { exact: true })).toHaveCount(0); await preserved(page);
  expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]);
});
