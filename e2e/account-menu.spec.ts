import { expect, test, type Page } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

// Synthetic service sessions and local API fixtures only. Never a real account logout.
async function authenticated(page: Page, name = "합성 회원") {
  await installAccountRefresh(page, name);
  await page.route("**/api/account/rooms", route => route.fulfill({ json: { rooms: [] } }));
}
async function security(page: Page) {
  await page.getByRole("button", { name: /계정 메뉴/ }).click();
  await page.getByRole("link", { name: "계정 보안" }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await expect(page.getByRole("heading", { name: "계정 보안" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "모든 기기 로그아웃", exact: true }).click();
  return page.getByRole("dialog", { name: "모든 기기에서 로그아웃할까요?" });
}

test("authenticated header and /login route expose an account menu instead of a login action", async ({ page }) => {
  await authenticated(page);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/account\/rooms$/);
  await expect(page.getByRole("link", { name: "로그인", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Google로 로그인" })).toHaveCount(0);
  const history = page.getByRole("link", { name: "내 모임", exact: true });
  await expect(history.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(history).toHaveAttribute("href", "/account/rooms");
  const trigger = page.getByRole("button", { name: "합성 회원 계정 메뉴" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toHaveCount(0);
  await trigger.press("Enter");
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /모든 기기/ })).toHaveCount(0);
  await trigger.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("heading", { name: "내가 만든 모임" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

for (const width of [320, 390, 1440]) {
  test(`long account names and security confirmation remain accessible at ${width}px`, async ({ page }, testInfo) => {
    await authenticated(page, "아주긴한국어계정이름".repeat(10));
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /계정 메뉴/ });
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trigger.click();
    const group = page.getByRole("group", { name: "계정 동작" });
    await expect(group).toBeVisible();
    const box = (await group.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath("account-menu.png"), fullPage: true });
    await page.getByRole("link", { name: "계정 보안" }).click();
    await expect(page).toHaveURL(/\/account\/security$/);
    await page.screenshot({ path: testInfo.outputPath("account-security-page.png"), fullPage: true });
    await page.getByRole("button", { name: "모든 기기 로그아웃", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("현재 기기를 포함");
    await expect(dialog).toContainText("최대 15분");
    const cancel = dialog.getByRole("button", { name: "취소", exact: true });
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "모든 기기에서 로그아웃" })).toBeFocused();
    await page.keyboard.press("Tab"); await expect(cancel).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("account-security.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: "모든 기기 로그아웃", exact: true })).toBeFocused();
  });
}

for (const all of [false, true]) {
  test(`explicit synthetic logout uses only the intended endpoint allDevices=${all}`, async ({ page }) => {
    await authenticated(page);
    const requests: string[] = [];
    await page.route("**/api/auth/logout*", route => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers().authorization).toBe("Bearer synthetic-host-service-access");
      requests.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 204 });
    });
    await page.goto("/");
    if (all) {
      let dialog = await security(page);
      expect(requests).toHaveLength(0);
      await dialog.getByRole("button", { name: "취소" }).click(); expect(requests).toHaveLength(0);
      dialog = await security(page);
      await dialog.getByRole("button", { name: "모든 기기에서 로그아웃" }).click();
    } else {
      await page.getByRole("button", { name: /계정 메뉴/ }).click();
      await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    }
    await expect(page.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
    expect(requests).toEqual([`/api/auth/${all ? "logout-all" : "logout"}`]);
    await expect(page.getByRole("button", { name: /계정 메뉴/ })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("an unavailable refresh and a failed synthetic all-device logout keep honest anonymous UI", async ({ page }) => {
  await page.route("**/api/auth/refresh", route => route.fulfill({ status: 503, json: { code: "AUTH_UNAVAILABLE" } }));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("로그인 확인 필요");
  await authenticated(page); await page.reload();
  await page.route("**/api/auth/logout-all", route => route.fulfill({ status: 503, json: { detail: "synthetic private detail" } }));
  const dialog = await security(page);
  await dialog.getByRole("button", { name: "모든 기기에서 로그아웃" }).click();
  await expect(page.getByRole("alert")).toContainText("서버에서 모든 기기의 로그아웃을 확인하지 못했어요");
  await expect(page.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /계정 메뉴/ })).toHaveCount(0);
  await expect(page.getByText("synthetic private detail")).toHaveCount(0);
});
