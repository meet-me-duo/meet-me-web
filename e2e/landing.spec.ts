import { expect, test } from "@playwright/test";


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

test("sticky story holds a complete explanation and its layers move at different speeds", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const story = page.locator(".story");
  await expect(story).toHaveAttribute("data-enhanced", "true");
  const position = await story.evaluate((element) => {
    const stage = element.querySelector<HTMLElement>(".story-stage")!;
    return { start: element.getBoundingClientRect().top + scrollY - Number.parseFloat(getComputedStyle(stage).top), distance: element.clientHeight - stage.offsetHeight };
  });
  const snapshots = [];
  for (const fraction of [.06, .28]) {
    await page.evaluate(({ start, distance, fraction }) => scrollTo(0, start + distance * fraction), { ...position, fraction });
    await expect(story.getByRole("heading", { name: "말하듯 조건 작성" })).toBeInViewport();
    await expect(story.locator('[data-current="true"]')).toHaveCSS("opacity", "1");
    snapshots.push(await story.evaluate((element) => ({
      top: element.querySelector(".story-stage")!.getBoundingClientRect().top,
      far: new DOMMatrix(getComputedStyle(element.querySelector(".story-backdrop i")!).transform).m42,
      near: new DOMMatrix(getComputedStyle(element.querySelector('[data-current="true"] .story-art')!).transform).m42,
    })));
  }
  expect(snapshots[1].top).toBeCloseTo(snapshots[0].top, 1);
  expect(Math.abs(snapshots[1].far - snapshots[0].far)).toBeGreaterThan(Math.abs(snapshots[1].near - snapshots[0].near) * 2);
  expect(position.distance).toBeGreaterThan(page.viewportSize()!.height * 2);
});

test("normal wheel and a fast jump resolve the story from current position, including reverse scroll", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const story = page.locator(".story");
  await expect(story).toHaveAttribute("data-enhanced", "true");
  const position = await story.evaluate((element) => {
    const stage = element.querySelector<HTMLElement>(".story-stage")!;
    return { start: element.getBoundingClientRect().top + scrollY - Number.parseFloat(getComputedStyle(stage).top), distance: element.clientHeight - stage.offsetHeight };
  });
  await page.evaluate(({ start }) => scrollTo(0, start), position);
  for (let i=0;i<3;i++) await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(position.start + 500);
  const target = position.start + position.distance * .9;
  const current = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, target - current);
  await expect(story.getByRole("heading", { name: "Plan A·B·C 제안" })).toBeVisible();
  await expect(story.getByText("복잡한 비교 대신 우선순위가 정해진 후보 중 하나만 고르면 돼요.")).toBeVisible();
  await expect(story.getByRole("button", { name: /Plan A/ })).toHaveAttribute("aria-current", "step");
  await page.mouse.wheel(0, -(position.distance * .4));
  await expect(story.getByRole("heading", { name: "블라인드 일정 입력" })).toBeVisible();
  await expect(story.locator('[data-current="true"]')).toHaveCSS("opacity", "1");
});

test("story steps can be revisited with the keyboard without a scroll lock", async ({ page }) => {
  await page.goto("/");
  const story = page.locator(".story");
  await expect(story).toHaveAttribute("data-enhanced", "true");
  const button = story.getByRole("button", { name: /Plan A/ });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toBeFocused();
  await expect(story.getByRole("heading", { name: "Plan A·B·C 제안" })).toBeInViewport();
  await page.keyboard.press("End");
  await expect(page.getByRole("heading", { name: "링크 하나로 시작하는 일정 조율" })).toBeInViewport();
});

test("story animation failure and short viewports leave all three static panels readable", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "requestAnimationFrame", { value: undefined }); });
  await page.goto("/");
  const story = page.locator(".story");
  for (const panel of await story.locator(".story-panel").all()) {
    await expect(panel).toHaveCSS("opacity", "1");
    await expect(panel).not.toHaveAttribute("inert", "");
    await expect(panel.getByRole("heading")).toBeVisible();
  }
  await page.setViewportSize({ width: 844, height: 320 });
  await page.reload();
  await expect(story.locator(".story-stage")).toHaveCSS("position", "static");
  await expect(story.getByRole("heading", { name: "블라인드 일정 입력" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(844);
});
