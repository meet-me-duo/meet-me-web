import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv", key = "meet-me:recent-rooms:v1";
const room = {
  invite_code: code, purpose: "다시 찾을 모임", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-04", search_end_date: "2026-10-18", search_range_source: "DEFAULTED",
  expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING",
  closure_reason: null, closed_at: null, public_status: "COLLECTING", input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};

async function fixture(context: BrowserContext, options: { joined?: boolean; role?: string; status?: string; error?: number } = {}) {
  let joined = options.joined ?? true, role = options.role ?? "HOST";
  await context.route("**/api/**", route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    const response = () => ({ ...room, public_status: options.status ?? room.public_status, viewer: { joined, role: joined ? role : null, display_name: joined ? "로컬 사용자" : null } });
    if (pathname === "/api/rooms" && request.method() === "POST") { joined = true; role = "HOST"; return route.fulfill({ status: 201, json: response() }); }
    if (pathname.endsWith("/participants") && request.method() === "POST") { joined = true; role = "MEMBER"; return route.fulfill({ status: 201, json: response() }); }
    if (pathname.endsWith("/submission")) return route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    if (pathname === `/api/rooms/${code}`) return options.error ? route.fulfill({ status: options.error, json: { code: options.error === 404 ? "ROOM_NOT_FOUND" : "TEMPORARY_FAILURE" } }) : route.fulfill({ json: response() });
    return route.abort();
  });
}
async function seed(page: Page, lastOpenedAt = Date.now()) {
  await page.goto("/");
  await page.evaluate(({ key, code, lastOpenedAt }) => localStorage.setItem(key, JSON.stringify({ version: 1, rooms: [{ inviteCode: code, title: "다시 찾을 모임", lastOpenedAt }] })), { key, code, lastOpenedAt });
  await page.reload();
}

test("creation is recorded before opening and a new tab returns to a selectable home", async ({ page, context }) => {
  await fixture(context);
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("로컬 사용자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page).toHaveURL(`/rooms/${code}`);
  await expect(page.getByText(/홈의.*이 기기의 최근 모임/)).toBeVisible();
  const data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(Object.keys(data.rooms[0]).sort()).toEqual(["inviteCode", "lastOpenedAt", "title"]);
  await page.close();
  const freshTab = await context.newPage(); await freshTab.goto("/");
  await expect(freshTab).toHaveURL("/");
  await freshTab.getByRole("link", { name: "다시 찾을 모임 다시 열기" }).click();
  await expect(freshTab.getByRole("heading", { name: "주최자 도구" })).toBeVisible();
});

test("a plain invitation is not recorded until joining, then persists through reload", async ({ page, context }) => {
  await fixture(context, { joined: false });
  await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("button", { name: "모임 참여하기" })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await page.getByLabel("내 이름").fill("참여자");
  await page.getByRole("button", { name: "모임 참여하기" }).click();
  await expect(page.getByText(/홈의.*이 기기의 최근 모임/)).toBeVisible();
  await page.goto("/"); await page.reload();
  await expect(page.getByRole("link", { name: "다시 찾을 모임 다시 열기" })).toBeVisible();
});

for (const status of [404, 503]) test(`opening a ${status} room retains the address and removal is local only`, async ({ page, context }) => {
  await fixture(context, { error: status }); await seed(page);
  let writes = 0; page.on("request", request => { if (request.method() !== "GET") writes++; });
  await page.getByRole("link", { name: "다시 찾을 모임 다시 열기" }).click();
  await expect(page.getByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeVisible();
  await page.getByRole("link", { name: "Meet me 홈" }).click();
  await expect(page.getByRole("link", { name: "다시 찾을 모임 다시 열기" })).toBeVisible();
  await page.getByRole("button", { name: "다시 찾을 모임 목록에서 지우기" }).click();
  await expect(page.getByRole("status")).toContainText("실제 모임은 삭제되지 않았어요");
  await expect(page.getByRole("heading", { name: "이 기기의 최근 모임" })).toBeFocused();
  expect(writes).toBe(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).rooms.length, key)).toBe(0);
});

test("a saved address never supplies authority after participation is lost", async ({ page, context }) => {
  await fixture(context, { joined: false }); await seed(page);
  await page.getByRole("link", { name: "다시 찾을 모임 다시 열기" }).click();
  await expect(page.getByText(/같은 이름으로 새로 참여해도/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "주최자 도구" })).toHaveCount(0);
  await page.getByLabel("내 이름").fill("로컬 사용자");
  await page.getByRole("button", { name: "모임 참여하기" }).click();
  await expect(page.getByRole("button", { name: "초대 링크 복사" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "주최자 도구" })).toHaveCount(0);
});

test("storage rejection preserves successful creation and explains link preservation", async ({ page, context }) => {
  await fixture(context);
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("denied", "QuotaExceededError"); }; });
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("로컬 사용자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page).toHaveURL(`/rooms/${code}`);
  await expect(page.getByRole("status")).toContainText("모임 주소를 보관하지 못했어요");
  await expect(page.getByRole("heading", { name: "주최자 도구" })).toBeVisible();
});

test("clipboard failure offers a selectable public link and keyboard can reopen a room", async ({ page, context }) => {
  await fixture(context); await seed(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByRole("link", { name: "이 기기의 최근 모임 1개 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#recent-rooms")).toBeFocused();
  await page.getByRole("button", { name: "다시 찾을 모임 링크 복사" }).click();
  const link = page.getByRole("textbox", { name: "직접 복사할 모임 링크" });
  await expect(link).toBeFocused();
  expect(await link.inputValue()).toMatch(/\/rooms\/abcdefghijklmnopqrstuv$/);
  expect(await link.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBe((await link.inputValue()).length);
  await page.getByRole("link", { name: "다시 찾을 모임 다시 열기" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "주최자 도구" })).toBeVisible();
});

test("copy success contains only the public room path", async ({ page }) => {
  await seed(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as any).__copied = text; } } }));
  await page.getByRole("button", { name: "다시 찾을 모임 링크 복사" }).click();
  await expect(page.getByRole("status")).toContainText("초대 링크를 복사했어요");
  expect(await page.evaluate(() => (window as any).__copied)).toBe(new URL(`/rooms/${code}`, page.url()).href);
});

test("real storage events keep two tabs in sync", async ({ page, context }) => {
  await seed(page); const second = await context.newPage(); await second.goto("/");
  await expect(second.getByRole("link", { name: "다시 찾을 모임 다시 열기" })).toBeVisible();
  await page.getByRole("button", { name: "다시 찾을 모임 목록에서 지우기" }).click();
  await expect(second.getByRole("link", { name: "다시 찾을 모임 다시 열기" })).toHaveCount(0);
  await page.evaluate(({ key, code }) => localStorage.setItem(key, JSON.stringify({ version: 1, rooms: [{ inviteCode: code, title: "새 기록", lastOpenedAt: Date.now() }] })), { key, code });
  await expect(second.getByRole("link", { name: "새 기록 다시 열기" })).toBeVisible();
  await second.close();
});

test("history expiry and corrupt storage do not interrupt home", async ({ page }) => {
  await seed(page, Date.now() - 31 * 86_400_000);
  await expect(page.getByRole("link", { name: "다시 찾을 모임 다시 열기" })).toHaveCount(0);
  await page.evaluate(key => localStorage.setItem(key, "{broken"), key); await page.reload();
  await expect(page.getByRole("button", { name: "모임 만들기", exact: true })).toBeVisible();
});

test("ten long titles remain usable on narrow mobile and desktop", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, rooms: Array.from({ length: 10 }, (_, i) => ({ inviteCode: `room${String(i).padStart(18, "0")}`, title: "긴 모임 제목".repeat(12), lastOpenedAt: Date.now() - i })) })), key);
  await page.reload();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("link", { name: /이 기기의 최근 모임 10개 보기/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const button of await page.locator(".recent-actions .button").all()) {
      expect(await button.evaluate(element => Number.parseFloat(getComputedStyle(element).minHeight))).toBeGreaterThanOrEqual(44);
      // Chromium can report 43.999969px for a 44px box at a fractional scroll position.
      const height = (await button.boundingBox())!.height;
      expect(Math.round(height * 1_000) / 1_000).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`recent-${width}.png`) });
  }
});
