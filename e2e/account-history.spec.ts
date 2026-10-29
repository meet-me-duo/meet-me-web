import { expect, test, type Page, type Route } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

const rows = [
  { invite_code: "a".repeat(22), purpose: "TEAM 주최 모임", role: "HOST", created_at: "2026-10-27T15:00:00Z", expires_at: "2026-11-27T15:00:00Z" },
  { invite_code: "b".repeat(22), purpose: "Team 참여 모임", role: "MEMBER", created_at: "2026-10-28T03:00:00Z", expires_at: "2026-11-27T15:00:00Z" },
  { invite_code: "c".repeat(22), purpose: "이전 생성일 모임", role: "MEMBER", created_at: "2026-10-24T03:00:00Z", expires_at: "2026-11-24T03:00:00Z" },
];
const cursor = "opaque+/_=next";
async function setup(page: Page) {
  await installAccountRefresh(page, "합성 계정");
  const requests: URLSearchParams[] = [];
  await page.route("**/api/account/rooms*", route => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toBe("Bearer synthetic-host-service-access");
    const query = new URL(route.request().url()).searchParams; requests.push(query);
    const selected = rows.filter(row => (!query.has("role") || row.role === query.get("role"))
      && (!query.has("query") || row.purpose.toLocaleLowerCase().includes(query.get("query")!.toLocaleLowerCase()))
      && (!query.has("created_from") || new Date(Date.parse(row.created_at) + 9 * 3600_000).toISOString().slice(0, 10) >= query.get("created_from")!)
      && (!query.has("created_to") || new Date(Date.parse(row.created_at) + 9 * 3600_000).toISOString().slice(0, 10) <= query.get("created_to")!));
    const start = query.has("cursor") ? 2 : 0;
    const more = selected.length > start + 2;
    return route.fulfill({ json: { rooms: selected.slice(start, start + 2), has_more: more, next_cursor: more ? cursor : null } });
  });
  return requests;
}

for (const width of [320, 390, 1440]) {
  test(`account history includes participation, filters creation dates/names and resets paging at ${width}px`, async ({ page }, testInfo) => {
    const requests = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/account/rooms");
    await expect(page.getByRole("heading", { name: "내 모임", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Team 참여 모임/ })).toBeVisible();
    if (!await page.locator(".account-history-filters").evaluate(el => (el as HTMLDetailsElement).open)) await page.getByText("모임 찾기 · 검색 및 필터", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "전체", exact: true })).toBeChecked();
    expect([...requests[0].keys()]).toEqual([]);
    await page.getByRole("button", { name: "더 보기", exact: true }).click();
    await expect(page.getByRole("link", { name: /이전 생성일 모임/ })).toBeVisible();
    expect(requests.at(-1)!.get("cursor")).toBe(cursor);
    await expect(page.getByRole("button", { name: "더 보기", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "주최", exact: true }).check();
    await page.getByLabel("생성일 시작").fill("2026-10-28");
    await page.getByLabel("생성일 종료").fill("2026-10-28");
    await page.getByLabel("모임 이름").fill("  team  ");
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByRole("link", { name: /TEAM 주최 모임/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Team 참여 모임/ })).toHaveCount(0);
    expect(Object.fromEntries(requests.at(-1)!)).toEqual({ role: "HOST", created_from: "2026-10-28", created_to: "2026-10-28", query: "team" });
    await expect(page.getByText(/주최 · 불러온 모임 1개/)).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("history-filtered.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("radio", { name: "참여", exact: true }).check();
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByRole("link", { name: /Team 참여 모임/ })).toBeVisible();
    expect(requests.at(-1)!.has("cursor")).toBe(false);
    await page.getByRole("button", { name: "초기화" }).click();
    if (!await page.locator(".account-history-filters").evaluate(el => (el as HTMLDetailsElement).open)) await page.getByText("모임 찾기 · 검색 및 필터", { exact: true }).click();
    await expect(page.getByRole("radio", { name: "전체", exact: true })).toBeChecked();
    await expect(page.getByLabel("모임 이름")).toHaveValue("");
    await expect(page.getByRole("link", { name: /TEAM 주최 모임/ })).toBeVisible();
    await page.getByLabel("모임 이름").fill("😀".repeat(101));
    const before = requests.length;
    await page.getByRole("button", { name: "조회", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("100자 이내");
    expect(requests.length).toBe(before);
  });
}

test("history protects already loaded rows after a next-page authorization failure", async ({ page }) => {
  await installAccountRefresh(page, "합성 계정");
  await page.route("**/api/account/rooms*", route => new URL(route.request().url()).searchParams.has("cursor")
    ? route.fulfill({ status: 403, json: { code: "FORBIDDEN", detail: "접근할 수 없어요." } })
    : route.fulfill({ json: { rooms: [rows[0]], has_more: true, next_cursor: cursor } }));
  await page.goto("/account/rooms"); await expect(page.getByRole("link", { name: /TEAM 주최 모임/ })).toBeVisible();
  await page.getByRole("button", { name: "더 보기" }).click();
  await expect(page.getByRole("alert")).toContainText("접근할 수 없어요");
  await expect(page.getByRole("link", { name: /TEAM 주최 모임/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);
});

test("a late previous account history response cannot appear after a new account refresh", async ({ page }) => {
  await page.clock.install();
  let refreshes = 0;
  let release!: () => void;
  let finished!: () => void;
  const releaseA = new Promise<void>(done => { release = done; });
  const finishedA = new Promise<void>(done => { finished = done; });
  let pendingA: Route | null = null;
  await page.route("**/api/auth/refresh", async route => {
    const isA = ++refreshes === 1;
    const now = await route.request().frame().evaluate(() => Date.now());
    return route.fulfill({ json: { accessToken: isA ? "synthetic-A" : "synthetic-B", expiresAt: new Date(now + (isA ? 31_000 : 900_000)).toISOString(), account: { id: isA ? "11111111-2222-4333-8444-555555555555" : "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", displayName: isA ? "합성 A" : "합성 B" } } });
  });
  await page.route("**/api/account/rooms*", async route => {
    if (route.request().headers().authorization === "Bearer synthetic-A") {
      pendingA = route; await releaseA;
      try { await route.fulfill({ json: { rooms: [{ ...rows[0], purpose: "A 전용 지연 모임" }], has_more: false, next_cursor: null } }); }
      catch (error) { if (!route.request().failure()) throw error; }
      finally { finished(); }
    } else await route.fulfill({ json: { rooms: [{ ...rows[1], purpose: "B의 참여 모임" }], has_more: false, next_cursor: null } });
  });
  await page.goto("/account/rooms");
  await expect(page.getByRole("button", { name: "합성 A 계정 메뉴" })).toBeVisible();
  await expect.poll(() => pendingA !== null).toBe(true);
  await page.clock.fastForward(2_000);
  await expect(page.getByRole("button", { name: "합성 B 계정 메뉴" })).toBeVisible();
  await expect(page.getByRole("link", { name: /B의 참여 모임/ })).toBeVisible();
  release(); await finishedA;
  await expect(page.getByRole("link", { name: /A 전용 지연 모임/ })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  for (const privateValue of ["synthetic-A", "synthetic-B", "A 전용 지연 모임", "B의 참여 모임"]) expect(storage).not.toContain(privateValue);
});
