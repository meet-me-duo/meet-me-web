import { expect, test } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

test.beforeEach(async ({ page }) => { await installAccountRefresh(page, null); });

async function keyboardToHero(page: import("@playwright/test").Page) {
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Meet me 홈" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "내 모임", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /계정 메뉴/ })).toBeFocused();
  await page.keyboard.press("Tab");
}



test("landing page starts the two-step room flow", async ({ page }) => {
  await installAccountRefresh(page, "민수");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "조건만 말하세요, 결정은 Meet me가 할게요", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "모임 만들기" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(page.getByLabel("주최자 이름")).toHaveCount(0);
  await page.getByLabel("모임 목적 / 이름").fill("프로젝트 킥오프");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("heading", { name: "언제 입력을 마감할까요?" })).toBeVisible();
  await page.getByRole("radio", { name: "직접 마감", exact: true }).check();
  await expect(page.getByRole("checkbox", { name: /목표 인원이 모두 제출하면/ })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("자동 마감 없이 주최자가 직접 마감");
});

test("back and the logo return from room creation to the home page", async ({ page }) => {
  const code = "abcdefghijklmnopqrstuv";
  await page.route(`**/api/rooms/${code}`, (route) => route.fulfill({ status: 404, json: { code: "ROOM_NOT_FOUND" } }));
  await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeVisible();
  await page.getByRole("link", { name: "Meet me 홈" }).click();

  await page.getByRole("button", { name: "모임 만들기" }).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();

  await page.getByRole("button", { name: "모임 만들기" }).click();
  await page.getByRole("link", { name: "Meet me 홈" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
});

test("mobile layout keeps primary action inside viewport", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/");
  const button = page.getByRole("button", { name: "모임 만들기" });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [768, 1024], [1440, 900], [320, 480], [844, 390], [568, 320], [844, 320], [1280, 600]]) {
  test(`landing remains readable without horizontal overflow at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const hero = page.locator(".hero");
    const action = page.getByRole("button", { name: "모임 만들기" });
    const details = page.locator(".landing-details");
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    const heading = hero.getByRole("heading", { level: 1 });
    const lineHeight = await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
    expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 4 + 1);
    const buttonBox = (await action.boundingBox())!;
    expect(buttonBox.x).toBeGreaterThanOrEqual(0);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(width);
    expect(buttonBox.height).toBeCloseTo(48, 2);
    const example = page.getByRole("complementary", { name: "자연어 조건 입력 예시", includeHidden: true });
    if (width <= 540) {
      await expect(example).toBeHidden();
      await expect(details).toBeHidden();
      await expect(page.locator(".hero-note")).toBeHidden();
      await expect(page.locator(".hero-guide")).toBeHidden();
      await expect(page.locator(".hero-description-mobile")).toHaveText("시간·장소 조건을 모아, 함께 만날 시간을 찾아요.");
      await expect(page.locator(".hero-description-mobile")).toBeVisible();
      await expect(page.locator(".hero-description-desktop")).toBeHidden();
    } else {
      await expect(example).toBeVisible();
      await expect(page.locator(".hero-description-mobile")).toBeHidden();
      expect((await details.boundingBox())!.y).toBeGreaterThan(buttonBox.y + buttonBox.height);
      await page.mouse.wheel(0, height);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await page.getByRole("heading", { name: "말하듯 조건 작성" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("heading", { name: "말하듯 조건 작성" })).toBeInViewport();
      await page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("landing supports keyboard navigation and viewport height changes", async ({ page }) => {
  await installAccountRefresh(page, "민수");
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  const action = page.getByRole("button", { name: "모임 만들기" });
  await expect(action).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 390, height: 564 });
  await expect(action).toBeInViewport({ ratio: 1 });
  await keyboardToHero(page);
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel("모임 목적 / 이름")).toBeFocused();
});

test("hero action has strong contrast, keyboard focus and subtle pointer feedback", async ({ page }) => {
  await installAccountRefresh(page, "민수");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const action = page.getByRole("button", { name: "모임 만들기" });
  const contrast = await action.evaluate((element) => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const channels = color.match(/\d+/g)!.slice(0, 3).map((channel) => {
        const value = Number(channel) / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      });
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const text = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await expect(action).toHaveCSS("background-image", "none");
  await keyboardToHero(page);
  await expect(action).toBeFocused();
  expect(await action.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(action).toHaveCSS("outline-width", "3px");
  await expect(action).toHaveCSS("outline-color", "rgb(15, 23, 42)");
  await action.hover();
  await expect.poll(() => action.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
  await page.mouse.down();
  await expect.poll(() => action.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel("모임 목적 / 이름")).toBeFocused();
});

test("hero action stays still for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const action = page.getByRole("button", { name: "모임 만들기" });
  await action.hover();
  await expect(action).toHaveCSS("transform", "none");
  await page.mouse.down();
  await expect(action).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0);
  await page.mouse.up();
});

test("landing details stay readable with reduced motion and no observer", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => { Object.defineProperty(window, "IntersectionObserver", { value: undefined }); });
  await page.goto("/");
  const features = page.getByRole("region", { name: "Meet me 주요 기능" });
  await features.scrollIntoViewIfNeeded();
  await expect(features).toBeInViewport();
  await expect(features).toHaveCSS("opacity", "1");
  await expect(features).toHaveCSS("transform", "none");
  await expect(features).toHaveCSS("animation-name", "none");
  for (const feature of await features.locator("article").all()) {
    await expect(feature).toHaveCSS("opacity", "1");
    await expect(feature).toHaveCSS("transform", "none");
    await expect(feature).toHaveCSS("animation-name", "none");
  }
  await expect(page.getByRole("heading", { name: "비공개 조건 입력" })).toBeVisible();
});

test("feature cards remain readable after forward and reverse scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const panels = page.locator(".story-panel");
  await expect(panels).toHaveCount(3);
  for (const panel of await panels.all()) {
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.getByRole("heading")).toBeInViewport();
    await expect(panel).toHaveCSS("opacity", "1");
    await expect(panel).not.toHaveAttribute("inert", "");
  }
  await page.evaluate(() => scrollTo(0, 0));
  await panels.first().scrollIntoViewIfNeeded();
  await expect(panels.first()).toHaveCSS("opacity", "1");
  await expect(panels.first()).toHaveCSS("position", "static");
});

test("keyboard guide link reaches details without a scroll lock", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/");
  await page.getByRole("link", { name: "이용 방법 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#how-it-works")).toBeFocused();
  await expect(page.getByRole("heading", { name: "일정 조율을 단순하게." })).toBeInViewport();
  await page.keyboard.press("End");
  await expect(page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" })).toBeInViewport();
});

test("changing motion preference stops decorative entrances", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto("/");
  await page.locator(".story-panel").first().scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const panel of await page.locator(".story-panel").all()) {
    await expect(panel).toHaveCSS("animation-name", "none");
    await expect(panel).toHaveCSS("opacity", "1");
  }
});

test("cards entering together visibly progress in sequence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const cards = page.locator(".story-panel");
  await cards.first().evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - innerHeight * .45));
  await expect.poll(() => cards.evaluateAll(elements => {
    const progress = elements.map(element => element.getAnimations()[0]?.effect?.getComputedTiming().progress ?? 0);
    return progress[0] > progress[1] && progress[1] > progress[2] && progress[0] < 1;
  })).toBe(true);
  const nextSectionTop = (await page.locator(".how-card").boundingBox())!.y;
  for (const card of await cards.all()) {
    const box = (await card.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(nextSectionTop);
  }
  for (const card of await cards.all()) await expect(card).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
});

test("a later narrow-layout card starts without waiting for offscreen cards", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 640 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const cards = page.locator(".story-panel");
  await cards.first().evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - 300));
  await expect(cards.first()).toHaveClass(/story-entered/);
  const firstBox = (await cards.first().boundingBox())!;
  expect(firstBox.y + firstBox.height).toBeLessThanOrEqual((await cards.nth(1).boundingBox())!.y);
  await expect(cards.first()).toHaveCSS("opacity", "1");
  await expect(cards.last()).not.toHaveClass(/story-entered/);
  await cards.nth(1).evaluate(element => scrollTo(0, element.getBoundingClientRect().top + scrollY - 300));
  await expect(cards.nth(1)).toHaveClass(/story-entered/);
  await expect(cards.nth(1)).toHaveCSS("opacity", "1");
  await expect(cards.last()).not.toHaveClass(/story-entered/);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last()).toHaveClass(/story-entered/);
  await expect(cards.last()).toHaveCSS("animation-delay", "0s");
  await expect(cards.last()).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("animation-name", "none");
    await expect(card).toHaveCSS("transform", "none");
  }
});
