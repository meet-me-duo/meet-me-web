import { expect, test } from "@playwright/test";

function isUnclipped(element: Element) {
  const clip = getComputedStyle(element).clipPath;
  return clip === "none" || clip.match(/[\d.]+/g)!.every((value) => Number(value) === 0);
}

test("landing page starts the two-step room flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
  await page.getByRole("button", { name: "모임 만들기" }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByLabel("주최자 이름").fill("민수");
  await page.getByLabel("모임 목적 / 이름").fill("프로젝트 킥오프");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("heading", { name: "언제 입력을 마감할까요?" })).toBeVisible();
  await page.getByRole("checkbox", { name: /자동 마감 없이 직접 마감/ }).check();
  await expect(page.getByRole("checkbox", { name: /목표 인원이 모두 제출하면/ })).not.toBeChecked();
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
  test(`landing focuses the first screen and reveals details at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const hero = page.locator(".hero");
    const action = page.getByRole("button", { name: "모임 만들기" });
    const details = page.locator(".landing-details");
    await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
    const heading = hero.getByRole("heading", { level: 1 });
    const lineHeight = await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
    expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 2 + 1);
    await expect.poll(async () => (await hero.boundingBox())!.y + (await hero.boundingBox())!.height).toBeGreaterThanOrEqual(height);
    const buttonBox = (await action.boundingBox())!;
    expect(buttonBox.y).toBeGreaterThanOrEqual(68);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(height);
    expect(buttonBox.height).toBeCloseTo(56, 2);
    if (width <= 540) expect(buttonBox.width).toBeCloseTo(width - 24, 2);
    expect((await details.boundingBox())!.y).toBeGreaterThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.mouse.wheel(0, height);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("heading", { name: "말하듯 조건 작성" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "말하듯 조건 작성" })).toBeInViewport();
    await page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("landing supports keyboard navigation and viewport height changes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  const action = page.getByRole("button", { name: "모임 만들기" });
  await expect(action).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 390, height: 564 });
  await expect(action).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Meet me 홈" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel("주최자 이름")).toBeFocused();
});

test("hero action has strong contrast, keyboard focus and subtle pointer feedback", async ({ page }) => {
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
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(action).toBeFocused();
  expect(await action.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
  await expect(action).toHaveCSS("outline-width", "3px");
  await expect(action).toHaveCSS("outline-color", "rgb(15, 23, 42)");
  await action.hover();
  await expect.poll(() => action.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(-1);
  await page.mouse.down();
  await expect.poll(() => action.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByLabel("주최자 이름")).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "블라인드 일정 입력" })).toBeVisible();
});

test("each feature reveals progressively while entering the viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  test.skip(!await page.evaluate(() => CSS.supports("animation-timeline", "view()")), "Static accessible fallback for browsers without scroll timelines");
  const feature = page.locator(".feature").first();
  await expect(feature).toHaveCSS("opacity", "0");
  await expect(feature).toHaveCSS("clip-path", "inset(0px 0px 100%)");
  const position = await feature.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const translation = new DOMMatrix(getComputedStyle(element).transform).m42;
    return { top: bounds.top + scrollY - translation, height: bounds.height };
  });
  await page.evaluate(({ top, height }) => scrollTo(0, top - innerHeight + height * .7), position);
  await expect.poll(() => feature.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0);
  expect(await feature.evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(1);
  const movement = await feature.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42);
  expect(movement).toBeGreaterThan(0);
  expect(movement).toBeLessThan(64);
  expect(await feature.evaluate(isUnclipped)).toBe(false);
  await page.evaluate(({ top, height }) => scrollTo(0, top - innerHeight + height * 1.8), position);
  await expect(feature).toHaveCSS("opacity", "1");
  await expect.poll(() => feature.evaluate(isUnclipped)).toBe(true);
  expect(await feature.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
});

test("desktop cards unfold in sequence and all details finish before the page ends", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  test.skip(!await page.evaluate(() => CSS.supports("animation-timeline", "view()")), "Static accessible fallback for browsers without scroll timelines");
  const cards = page.locator(".feature");
  const top = await cards.first().evaluate((element) => element.getBoundingClientRect().top + scrollY - new DOMMatrix(getComputedStyle(element).transform).m42);
  const height = (await cards.first().boundingBox())!.height;
  await page.evaluate(({ top, height }) => scrollTo(0, top - innerHeight + height * .4), { top, height });
  await expect.poll(() => cards.first().evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0);
  const progress = await cards.evaluateAll((elements) => elements.map((element) => Number(getComputedStyle(element).opacity)));
  expect(progress[0]).toBeGreaterThan(progress[1]);
  expect(progress[1]).toBeGreaterThan(progress[2]);
  expect(progress[2]).toBe(0);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  for (const element of await page.locator(".landing-reveal").all()) {
    await expect(element).toHaveCSS("opacity", "1");
    await expect.poll(() => element.evaluate(isUnclipped)).toBe(true);
  }
});

test("sentences uncover their text with scroll and the static fallback remains readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => { Object.defineProperty(window, "IntersectionObserver", { value: undefined }); });
  await page.goto("/");
  const sentences = page.locator(".landing-sentence");
  test.skip(!await page.evaluate(() => CSS.supports("animation-timeline", "view()")), "Static accessible fallback for browsers without scroll timelines");
  await expect(sentences.first()).toHaveCSS("opacity", "0");
  await expect(sentences.first()).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");
  const position = await sentences.first().evaluate((element) => ({top:element.getBoundingClientRect().top+scrollY-new DOMMatrix(getComputedStyle(element).transform).m42,height:element.getBoundingClientRect().height}));
  await page.evaluate(({top,height})=>scrollTo(0,top-innerHeight+height*.8),position);
  await expect.poll(() => sentences.first().evaluate((element) => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0);
  expect(await sentences.first().evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(1);
  expect(await sentences.first().evaluate(isUnclipped)).toBe(false);
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) for (let i=sheet.cssRules.length-1;i>=0;i--) {
      const rule=sheet.cssRules[i];
      if(rule instanceof CSSSupportsRule && rule.conditionText.includes("animation-timeline")) sheet.deleteRule(i);
    }
  });
  for (const element of await page.locator(".landing-reveal").all()) {
    await expect(element).toHaveCSS("opacity", "1");
    await expect(element).toHaveCSS("transform", "none");
    await expect(element).toHaveCSS("clip-path", "none");
  }
});
