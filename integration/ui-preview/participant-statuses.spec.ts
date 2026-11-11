import { expect, test } from "@playwright/test";

test("participant availability remains distinct and usable through actual-time selection", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1100 } : { width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/__preview?scene=participant_statuses");
  const cards = page.locator(".recommendation-card");
  await expect(cards).toHaveCount(3);
  const people = (index: number) => cards.nth(index).getByRole("list", { name: "참가자별 가능 여부" }).getByRole("listitem");
  for (const index of [0, 1, 2]) await expect(people(index)).toHaveCount(4);
  for (const index of [0, 1, 2]) {
    const rows = await people(index).all();
    for (let row = 1; row < rows.length; row++) {
      const before = (await rows[row - 1]!.boundingBox())!;
      const after = (await rows[row]!.boundingBox())!;
      expect(after.y).toBeGreaterThanOrEqual(before.y + before.height);
    }
    const metadata = cards.nth(index).locator(".candidate-meta > span");
    await expect(metadata).toHaveCount(2);
    const attendance = (await metadata.nth(0).boundingBox())!;
    const mode = (await metadata.nth(1).boundingBox())!;
    expect(mode.y).toBeGreaterThanOrEqual(attendance.y + attendance.height);
  }
  await expect(people(0).nth(3)).toHaveText("하린가능");
  await expect(people(1).nth(3)).toHaveText("하린불가");
  await expect(people(2).nth(3)).toHaveText("하린확인 필요");
  await expect(cards.nth(1)).not.toContainText("님을 제외한");
  const boxColors = await Promise.all([0, 1, 2].map(index => people(index).nth(3).evaluate(element => ({ background: getComputedStyle(element).backgroundColor, text: getComputedStyle(element).color }))));
  expect(new Set(boxColors.map(box => box.background)).size).toBe(3);
  expect(new Set(boxColors.map(box => box.text)).size).toBe(1);
  await expect(cards.nth(2)).toContainText("4/4명 시간 일치");
  await expect(cards.nth(2)).not.toContainText("참석 가능");
  if (info.project.name === "desktop") {
    const tops = await Promise.all([0, 1, 2].map(index => cards.nth(index).locator(".recommendation-participants").boundingBox()));
    expect(Math.max(...tops.map(box => box!.y)) - Math.min(...tops.map(box => box!.y))).toBeLessThanOrEqual(1);
  }
  const notice = cards.nth(2).locator(".recommendation-participants-hint");
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("장소·이동 조건은 확인이 필요해요.");
  expect((await notice.boundingBox())!.y).toBeGreaterThan((await cards.nth(2).getByRole("list").boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("participant-statuses.png"), fullPage: true });
  await cards.nth(2).getByRole("button", { name: "이 시간 선택" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "선택한 시간 확정하기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".actual-time-form h3")).toBeFocused();
  await expect(page.getByText("가능한 범위 전체 기준")).toBeVisible();
  await expect(page.getByRole("listitem").nth(3)).toHaveText("하린확인 필요");
  await page.getByRole("button", { name: "가능한 범위 전체 선택" }).click();
  await expect(page.getByRole("button", { name: "일정 확정", exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("participant-statuses-time-selection.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("mode-specific statuses stay with their variant instead of becoming radio labels", async ({ page }, info) => {
  await page.goto("/__preview?scene=participant_status_modes");
  const lists = page.getByRole("list", { name: "참가자별 가능 여부" });
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0).getByRole("listitem").nth(3)).toHaveText("하린불가");
  await expect(lists.nth(1).getByRole("listitem").nth(3)).toHaveText("하린가능");
  const remote = page.getByRole("radio", { name: /온라인/ });
  await expect(remote).not.toHaveAccessibleName(/하린/);
  await remote.check();
  // Full-page captures must start at the top so the sticky header stays at its actual page edge.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("participant-statuses-modes.png"), fullPage: true });
  await page.getByRole("button", { name: "이 시간 선택" }).click();
  await page.getByRole("button", { name: "선택한 시간 확정하기" }).click();
  await expect(page.getByRole("listitem").nth(3)).toHaveText("하린가능");
  await expect(page.getByRole("list")).not.toContainText("불가");
});

test("long and duplicate names retain full text with single-line ellipsis at 320px", async ({ page }, info) => {
  const name = "가나다라마바사아자차카타파하가나다라마바";
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/api\/rooms\/[^/]+\/recommendations(?:\?|$)/, async route => {
    const response = await route.fetch();
    const body = await response.json();
    for (const option of body.options) for (const variant of option.variants) {
      variant.participant_statuses[0].display_name = name;
      variant.participant_statuses[1].display_name = name;
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto("/__preview?scene=participant_statuses");
  await expect(page.getByText(name, { exact: true })).toHaveCount(6);
  for (const row of await page.getByText(name, { exact: true }).all()) {
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("title", name);
    const text = await row.evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth, whiteSpace: getComputedStyle(element).whiteSpace, overflow: getComputedStyle(element).textOverflow }));
    expect(text.scroll).toBeGreaterThan(text.width);
    expect(text.whiteSpace).toBe("nowrap");
    expect(text.overflow).toBe("ellipsis");
    await row.scrollIntoViewIfNeeded();
    expect(await row.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return hit === element || !!hit && element.contains(hit);
    })).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator(".recommendation-card").first().screenshot({ path: info.outputPath("participant-long-name-ellipsis.png") });
});

test("larger groups expand independently without selecting the card or hiding a pending-condition notice", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1100 } : { width: 390, height: 844 });
  await page.goto("/__preview?scene=participant_status_many");
  const cards = page.locator(".recommendation-card");
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.getByRole("listitem")).toHaveCount(4);
    await expect(card.getByRole("button", { name: "나머지 3명 더보기" })).toHaveAttribute("aria-expanded", "false");
  }
  await expect(cards.nth(2)).toContainText("7/7명 시간 일치");
  await expect(cards.nth(2).locator(".recommendation-participants-hint")).toBeVisible();
  await page.screenshot({ path: info.outputPath("participant-statuses-many-collapsed.png"), fullPage: true });
  const toggle = cards.nth(2).getByRole("button", { name: "나머지 3명 더보기" });
  await toggle.click();
  await expect(cards.nth(2).getByRole("listitem")).toHaveCount(7);
  await expect(cards.nth(2).getByRole("listitem").nth(6)).toHaveText("다온확인 필요");
  await expect(cards.nth(0).getByRole("listitem")).toHaveCount(4);
  await expect(cards.nth(1).getByRole("listitem")).toHaveCount(4);
  await expect(cards.nth(2).getByRole("button", { name: "이 시간 선택" })).toHaveAttribute("aria-pressed", "false");
  await expect(cards.nth(2).getByRole("button", { name: "접기", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("participant-statuses-many-expanded.png"), fullPage: true });
  await cards.nth(2).getByRole("button", { name: "접기", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toBeFocused();
  await expect(cards.nth(2).getByRole("listitem")).toHaveCount(4);
  await page.keyboard.press("Space");
  await expect(cards.nth(2).getByRole("listitem")).toHaveCount(7);
  await cards.nth(2).getByRole("button", { name: "이 시간 선택" }).click();
  await page.getByRole("button", { name: "선택한 시간 확정하기" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(4);
  await page.getByRole("button", { name: "나머지 3명 더보기" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(7);
  await expect(page.getByRole("listitem").nth(6)).toHaveText("다온확인 필요");
  await page.getByRole("button", { name: "가능한 범위 전체 선택" }).click();
  await expect(page.getByRole("button", { name: "일정 확정", exact: true })).toBeEnabled();
});

test("participant name clicks select their card while disclosure, radio and keyboard controls remain independent", async ({ page }, info) => {
  await page.setViewportSize(info.project.name === "desktop" ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  await page.goto("/__preview?scene=participant_status_many");
  const cards = page.locator(".recommendation-card");
  const selection = (index: number) => cards.nth(index).getByRole("button", { name: "이 시간 선택" });
  const firstName = cards.nth(0).locator(".recommendation-participant-name").first();
  await firstName.scrollIntoViewIfNeeded();
  const beforeNameClick = await page.evaluate(() => scrollY);
  await firstName.click();
  expect(await page.evaluate(() => scrollY)).toBe(beforeNameClick);
  await expect(selection(0)).toHaveAttribute("aria-pressed", "true");
  await expect(selection(0)).toBeFocused();
  await expect(selection(2)).toHaveAttribute("aria-pressed", "false");
  await cards.nth(2).getByRole("button", { name: "나머지 3명 더보기" }).click();
  await expect(selection(2)).toHaveAttribute("aria-pressed", "false");
  await expect(selection(0)).toHaveAttribute("aria-pressed", "true");
  await cards.nth(2).locator(".recommendation-participant-name").last().click();
  await expect(selection(2)).toHaveAttribute("aria-pressed", "true");
  await expect(selection(2)).toBeFocused();
  await expect(selection(0)).toHaveAttribute("aria-pressed", "false");
  await selection(1).focus(); await page.keyboard.press("Enter");
  await expect(selection(1)).toHaveAttribute("aria-pressed", "true");
  await expect(selection(2)).toHaveAttribute("aria-pressed", "false");
  await page.goto("/__preview?scene=participant_status_modes");
  await page.getByRole("radio", { name: /온라인/ }).check();
  await expect(page.getByRole("button", { name: "이 시간 선택" })).toHaveAttribute("aria-pressed", "false");
});
