import { expect, test } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

for (const width of [320, 390, 1440]) {
  test(`both social links have visible pointer feedback at ${width}px`, async ({ page }, testInfo) => {
    await installAccountRefresh(page, null);
    await page.setViewportSize({ width, height: 900 });
    let starts = 0;
    await page.route("**/api/auth/*/start", route => { starts++; return route.fulfill({ status: 204 }); });
    await page.goto("/login");
    const back = page.getByRole("link", { name: "홈으로 돌아가기" });
    for (const provider of ["Google", "Kakao"]) {
      const link = page.getByRole("link", { name: `${provider}로 로그인` });
      const surface = link.locator(provider === "Google" ? ".gsi-material-button" : ".kakao-login-surface");
      const state = link.locator(provider === "Google" ? ".gsi-material-button-state" : ".social-login-state");
      await back.focus(); await page.mouse.move(0, 0);
      await expect(link).toHaveCSS("box-shadow", "none");
      await expect(link).toHaveCSS("outline-style", "none");
      await expect(state).toHaveCSS("opacity", "0");
      const bounds = (await link.boundingBox())!;
      const visible = (await surface.boundingBox())!;
      expect(bounds.height).toBe(46);
      expect(visible.height).toBe(46);
      expect(visible.y - bounds.y).toBe(0);
      const clip = { x: bounds.x - 10, y: bounds.y - 10, width: bounds.width + 20, height: bounds.height + 20 };
      await page.screenshot({ path: testInfo.outputPath(`${provider}-default.png`), clip });
      await link.hover();
      await expect(state).toHaveCSS("opacity", "0.08");
      await expect(link).toHaveCSS("box-shadow", "none");
      await expect(link).toHaveCSS("outline-style", "none");
      expect(await state.boundingBox()).toEqual(visible);
      expect(await link.boundingBox()).toEqual(bounds);
      await page.screenshot({ path: testInfo.outputPath(`${provider}-hover.png`), clip });
      await page.mouse.down();
      await expect(state).toHaveCSS("opacity", "0.12");
      await expect(link).toHaveCSS("box-shadow", "none");
      await page.mouse.move(0, 0); await page.mouse.up();
      await link.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      await expect(link).toBeFocused();
      await expect(link).toHaveCSS("outline-style", "solid");
      await expect(link).toHaveCSS("outline-width", "3px");
      await expect(link).toHaveAttribute("href", new RegExp(`/api/auth/${provider.toLowerCase()}/start$`));
    }
    expect(starts).toBe(0);
    const kakao = page.getByRole("link", { name: "Kakao로 로그인" });
    const google = page.getByRole("link", { name: "Google로 로그인" });
    await back.focus();
    await kakao.click({ noWaitAfter: true });
    await expect(kakao).toHaveAttribute("aria-disabled", "true");
    await expect(kakao).toHaveCSS("box-shadow", "none");
    await expect(kakao.locator(".social-login-state")).toHaveCSS("opacity", "0.12");
    await google.hover(); await expect(google).toHaveCSS("box-shadow", "none");
    await expect(google.locator(".gsi-material-button-state")).toHaveCSS("opacity", "0");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await kakao.hover(); await expect(kakao.locator(".social-login-state")).toHaveCSS("opacity", "0.08");
    await expect(kakao.locator(".social-login-state")).toHaveCSS("transition-duration", "1e-05s");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
