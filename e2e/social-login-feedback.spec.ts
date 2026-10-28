import { expect, test } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

// Local navigation fixtures only. No provider login, account creation or production API.
test.beforeEach(async ({ page }) => { await installAccountRefresh(page, null); });

for (const provider of ["google", "kakao"] as const) {
  const name = provider === "google" ? "Google" : "Kakao";
  test(`${name}: shared pending, duplicate guard, delayed retry and restored page`, async ({ page }, testInfo) => {
    await page.clock.install();
    let requests = 0;
    await page.route("**/api/auth/*/start", route => { requests++; return route.fulfill({ status: 204 }); });
    await page.goto("/create");
    const link = page.getByRole("link", { name: `${name}로 로그인` });
    const other = page.getByRole("link", { name: `${name === "Google" ? "Kakao" : "Google"}로 로그인` });
    await link.click({ noWaitAfter: true });
    await expect(page.getByRole("status")).toHaveText(`${name} 로그인 화면으로 이동 중…`);
    await expect(link).toHaveAttribute("aria-busy", "true");
    for (const button of [link, other]) await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect.poll(() => requests).toBe(1);
    // DOM dispatch bypasses Playwright's aria-disabled protection, as a rapid user event can.
    await other.dispatchEvent("click");
    await link.dispatchEvent("click");
    expect(requests).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem("meetme.login-return"))).toBe("/create");
    await page.screenshot({ path: testInfo.outputPath(`${provider}-pending.png`), fullPage: true });
    await page.clock.fastForward(15_000);
    await expect(page.getByRole("alert")).toContainText("이동이 지연되고 있어요");
    await expect(link).not.toHaveAttribute("aria-disabled");
    await other.click({ noWaitAfter: true });
    await expect.poll(() => requests).toBe(2);
    // Explicitly exercise a BFCache pageshow while state is still mounted.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(link).not.toHaveAttribute("aria-disabled");
    await expect(other).not.toHaveAttribute("aria-disabled");
    await expect(page.getByRole("status")).toBeEmpty();
  });

  test(`${name}: Enter follows the unchanged OAuth URL and back permits another provider`, async ({ page }) => {
    await page.route(`**/api/auth/${provider}/start`, route => route.fulfill({ contentType: "text/html", body: "<h1>Local OAuth navigation fixture</h1>" }));
    await page.goto("/create");
    const link = page.getByRole("link", { name: `${name}로 로그인` });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/api/auth/${provider}/start$`));
    expect(await page.evaluate(() => sessionStorage.getItem("meetme.login-return"))).toBe("/create");
    await page.goBack();
    for (const login of await page.getByRole("group", { name: "로그인 방법" }).getByRole("link").all()) {
      await expect(login).not.toHaveAttribute("aria-disabled");
    }
    await expect(page.getByRole("status")).toBeEmpty();
  });
}

test("both providers show hover, press, keyboard focus and reduced-motion feedback without changing assets", async ({ page }, testInfo) => {
  await page.goto("/login");
  for (const name of ["Google", "Kakao"]) {
    const link = page.getByRole("link", { name: `${name}로 로그인` });
    await link.hover();
    const before = await link.boundingBox();
    await page.mouse.down();
    await expect(link).toHaveCSS("box-shadow", "rgb(3, 105, 161) 0px 0px 0px 3px");
    expect(await link.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath(`${name}-pressed.png`), fullPage: true });
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".social-login").first()).toHaveCSS("transition-duration", "1e-05s");
  expect(await page.locator(".social-login--google img").evaluate((image: HTMLImageElement) => [image.width, image.height])).toEqual([20, 20]);
  const kakao = page.locator(".social-login--kakao img");
  expect(await kakao.getAttribute("src")).toBe("/brands/kakao-login.svg");
});

test("a new-tab click leaves the source page available", async ({ page, context }) => {
  await context.route("**/api/auth/google/start", route => route.fulfill({ contentType: "text/html", body: "<p>Local OAuth fixture</p>" }));
  await page.goto("/login");
  const popupReady = context.waitForEvent("page");
  await page.getByRole("link", { name: "Google로 로그인" }).click({ modifiers: ["Control"] });
  const popup = await popupReady;
  await expect(popup).toHaveURL(/\/api\/auth\/google\/start$/);
  await expect(page.getByRole("link", { name: "Kakao로 로그인" })).not.toHaveAttribute("aria-disabled");
  await expect(page.getByRole("status")).toBeEmpty();
  await popup.close();
});
