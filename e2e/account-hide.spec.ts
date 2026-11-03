import { expect, test } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

for (const width of [320, 390, 1440]) test(`account-only hide survives refresh and keeps direct links at ${width}px`, async ({ page, baseURL }, info) => {
  let account = "A", calls = 0, fail = true;
  const hidden = new Map<string, Set<string>>();
  const code = "a".repeat(22), other = "b".repeat(22);
  const rows = [code, other].map((invite_code, i) => ({ invite_code, purpose: `합성 모임 ${i + 1}`, role: i ? "MEMBER" : "HOST", created_at: "2026-11-03T00:00:00Z", expires_at: "2026-12-03T00:00:00Z" }));
  const unexpected: string[] = [];
  await page.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== new URL(baseURL!).origin) { unexpected.push(req.url()); return route.abort(); }
    if (await fulfillAccountRefresh(route, `합성 계정 ${account}`)) return;
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === `/api/rooms/${code}` && req.method() === "GET") return route.fulfill({ json: { invite_code: code, viewer: { joined: true, role: "HOST" }, collection_status: "COLLECTING" } });
    if (url.pathname === "/api/account/rooms" && req.method() === "GET") return route.fulfill({ json: { rooms: rows.filter(row => !hidden.get(account)?.has(row.invite_code)), has_more: false, next_cursor: null } });
    if (url.pathname === `/api/account/rooms/${code}/hide` && req.method() === "POST") {
      calls++; expect(req.postData()).toBeNull();
      if (fail) return route.fulfill({ status: 503, json: { detail: "합성 숨김 오류" } });
      const set = hidden.get(account) ?? new Set<string>(); set.add(code); hidden.set(account, set);
      return route.fulfill({ status: 204 });
    }
    unexpected.push(req.method() + " " + url.pathname); return route.abort();
  });
  await page.setViewportSize({ width, height: 844 }); await page.goto("/account/rooms");
  await expect(page.getByRole("link", { name: /합성 모임 1/ })).toHaveAttribute("href", `/rooms/${code}`);
  await page.evaluate(() => { const p=document.createElement("p"); p.textContent="독립 cloud · 합성 미리보기 · 운영 요청 없음"; p.style.cssText="background:#e0f2fe;color:#075985;font-size:12px;padding:8px"; document.body.prepend(p); });
  await page.screenshot({ path: info.outputPath("account-hide.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  const button = page.getByRole("button", { name: "합성 모임 1 목록에서 숨기기" });
  await button.click(); await expect(page.getByRole("alert")).toContainText("합성 숨김 오류");
  await expect(page.getByRole("link", { name: /합성 모임 1/ })).toBeVisible();
  fail = false; await button.evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click(); });
  await expect(page.getByRole("link", { name: /합성 모임 1/ })).toHaveCount(0); expect(calls).toBe(2);
  await page.reload(); await expect(page.getByRole("link", { name: /합성 모임 2/ })).toHaveAttribute("href", `/rooms/${other}`);
  await expect(page.getByRole("link", { name: /합성 모임 1/ })).toHaveCount(0);
  const direct = await page.evaluate(async code => {
    const response = await fetch(`/api/rooms/${code}`); return { status: response.status, body: await response.json() };
  }, code);
  expect(direct).toMatchObject({ status: 200, body: { invite_code: code, viewer: { joined: true }, collection_status: "COLLECTING" } });
  account = "B"; await page.reload(); await expect(page.getByRole("link", { name: /합성 모임 1/ })).toBeVisible();
  expect(unexpected).toEqual([]);
});
