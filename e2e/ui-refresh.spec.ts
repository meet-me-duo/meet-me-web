import { expect, test } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

test("landing explains equal time choices and the host disclosure boundary", async ({ page }, testInfo) => {
  await installAccountRefresh(page, null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".hero")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("landing.png") });
  const story = page.getByRole("region", { name: "Meet me 주요 기능" });
  await expect(story.getByRole("heading", { name: "최대 3개 시간 선택지" })).toBeVisible();
  await expect(story).toContainText("우열 없는 시간 선택지");
  await expect(story).toContainText("주최자는 분석에 반영되지 않은 조건을 확인할 수 있어요.");
  await expect(story).not.toContainText("Plan A");
  await story.screenshot({ path: testInfo.outputPath("story.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

for (const width of [320, 390, 1440]) {
  test(`official login buttons remain usable at ${width}px`, async ({ page }, testInfo) => {
    await installAccountRefresh(page, null);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/create");
    const google = page.getByRole("link", { name: "Google로 로그인" });
    const kakao = page.getByRole("link", { name: "Kakao로 로그인" });
    const card = (await page.locator(".login-card").boundingBox())!;
    const group = (await page.getByRole("group", { name: "로그인 방법" }).boundingBox())!;
    expect(Math.abs((group.y - card.y) - (card.y + card.height - group.y - group.height))).toBeLessThan(1);
    expect(Math.abs((group.x - card.x) - (card.x + card.width - group.x - group.width))).toBeLessThan(1);
    for (const link of [google, kakao]) {
      await expect(link).toBeVisible();
      expect(await link.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    expect(Math.abs((await google.boundingBox())!.width - (await kakao.boundingBox())!.width)).toBeLessThan(1);
    const googleSurface = google.locator(".gsi-material-button");
    await expect(googleSurface).toHaveCSS("background-color", "rgb(242, 242, 242)");
    await expect(googleSurface).toHaveCSS("border-style", "none");
    await expect(googleSurface).toHaveCSS("height", "46px");
    await expect(google.locator(".gsi-material-button-contents")).toHaveText("Google로 로그인");
    expect((await google.locator("img").boundingBox())!.width).toBe(20);
    expect((await google.locator("img").boundingBox())!.height).toBe(20);
    await expect(google.locator("button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await google.focus();
    await expect(google).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Tab");
    await expect(kakao).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
    await page.route("**/api/auth/kakao/start", route => route.fulfill({ contentType: "text/html", body: "<p>Local OAuth navigation fixture</p>" }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/api\/auth\/kakao\/start$/);
    expect(await page.evaluate(() => sessionStorage.getItem("meetme.login-return"))).toBe("/create");
    await page.goBack();
    await page.route("**/api/auth/google/start", route => route.fulfill({ contentType: "text/html", body: "<p>Local Google OAuth navigation fixture</p>" }));
    await page.getByRole("link", { name: "Google로 로그인" }).click();
    await expect(page).toHaveURL(/\/api\/auth\/google\/start$/);
    expect(await page.evaluate(() => sessionStorage.getItem("meetme.login-return"))).toBe("/create");
    await page.goBack();
    await page.getByRole("link", { name: "홈으로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}

test("long Korean creation draft survives repeated next/back and cancellation", async ({ page }, testInfo) => {
  await installAccountRefresh(page, "아주긴한국어이름을가진주최자");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/create");
  const purpose = "친구들과함께하는아주긴이름의한국어모임".repeat(12);
  await page.getByLabel("모임 목적 / 이름").fill(purpose);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "다음 단계" }).click();
    await expect(page.getByRole("heading", { name: "언제 입력을 마감할까요?" })).toBeFocused();
    await expect(page.locator(".form-step")).toHaveCSS("opacity", "1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath(`create-step-2-${attempt}.png`), fullPage: true });
    await page.getByRole("button", { name: "이전", exact: true }).click();
    await expect(page.getByLabel("모임 목적 / 이름")).toHaveValue(purpose);
  }
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
