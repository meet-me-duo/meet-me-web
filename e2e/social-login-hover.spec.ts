import { expect, test } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

const hoverShadow = "rgb(100, 116, 139) 0px 0px 0px 2px, rgba(15, 23, 42, 0.15) 0px 2px 6px 0px";
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
      await back.focus(); await page.mouse.move(0, 0);
      await expect(link).toHaveCSS("box-shadow", "none");
      const bounds = (await link.boundingBox())!;
      const clip = { x: bounds.x - 10, y: bounds.y - 10, width: bounds.width + 20, height: bounds.height + 20 };
      await page.screenshot({ path: testInfo.outputPath(`${provider}-default.png`), clip });
      await link.hover();
      await expect(link).toHaveCSS("box-shadow", hoverShadow);
      expect(await link.boundingBox()).toEqual(bounds);
      await page.screenshot({ path: testInfo.outputPath(`${provider}-hover.png`), clip });
      // The solid outline sits outside the unchanged provider surface. Its slate
      // color has >3:1 contrast against the white card (not just a faint shadow).
      const luminance = (r: number, g: number, b: number) => [r, g, b].map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
      expect(1.05 / (luminance(100, 116, 139) + .05)).toBeGreaterThanOrEqual(3);
      await page.mouse.down();
      await expect(link).toHaveCSS("box-shadow", "rgb(3, 105, 161) 0px 0px 0px 3px");
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
    await kakao.click({ noWaitAfter: true });
    await expect(kakao).toHaveAttribute("aria-disabled", "true");
    await expect(kakao).toHaveCSS("box-shadow", "none");
    await google.hover(); await expect(google).toHaveCSS("box-shadow", "none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await kakao.hover(); await expect(kakao).toHaveCSS("box-shadow", hoverShadow);
    await expect(kakao).toHaveCSS("transition-duration", "1e-05s");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}
