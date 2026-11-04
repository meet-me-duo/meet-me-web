import { expect, test, type Page } from "@playwright/test";
import { installAccountRefresh } from "./accountFixture";

const code = "abcdefghijklmnopqrstuv";
const room = {
  invite_code: code, purpose: "함께 준비하는 주말 모임", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-11-10", search_end_date: "2026-11-17", search_range_source: "HOST_SPECIFIED",
  expected_participants: 4, submitted_participant_count: 2, submission_deadline: null, manual_only: false,
  collection_status: "CLOSED", closure_reason: "MANUAL", closed_at: "2026-11-04T03:00:00Z", public_status: "ANALYZING",
  expires_at: "2026-12-04T03:00:00Z",
  viewer: { joined: true, role: "HOST", display_name: "합성 주최자" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
};

async function setup(page: Page, value: object) {
  await installAccountRefresh(page, "합성 주최자");
  const calls: string[] = [];
  const external: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (!request.url().startsWith("http://127.0.0.1:")) external.push(request.url());
  });
  await page.route("**/api/rooms/**", route => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    if (route.request().method() === "GET" && new URL(route.request().url()).pathname === `/api/rooms/${code}`) return route.fulfill({ json: value });
    return route.fulfill({ status: 501, json: { detail: "Unexpected synthetic API" } });
  });
  return { calls, external, errors };
}

for (const width of [320, 390, 1440]) {
  for (const target of [4, null]) {
    for (const long of [false, true]) {
      test(`header aggregate target=${target} width=${width} long=${long}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        const purpose = long ? "친구들과함께준비하는아주긴모임제목을좁은화면에서도생략없이확인해요".repeat(4) : room.purpose;
        const evidence = await setup(page, { ...room, purpose, expected_participants: target });
        await page.goto(`/rooms/${code}`);
        const header = page.locator(".room-header");
        const donut = header.getByRole("img", { name: target === null ? "입력 마감 · 2명 제출, 목표 인원 없음" : "입력 마감 · 목표 4명 중 2명 제출" });
        const button = header.getByRole("button", { name: "초대 링크 복사" });
        await expect(donut).toBeVisible();
        await expect(header.locator("h1")).toHaveText(purpose);
        await expect(header.locator(".room-retention-hint")).toBeVisible();
        await expect(page.locator(".thinking-orb")).toHaveAttribute("data-orb-state", "searching");
        const [d, b, dates, mode, title, card] = await Promise.all([donut.boundingBox(), button.boundingBox(), header.locator(".room-header-dates").boundingBox(), header.locator(".room-header-mode").boundingBox(), header.locator("h1").boundingBox(), header.boundingBox()]);
        expect(d!.width).toBe(64); expect(d!.height).toBe(64);
        const paintedDiameter = await donut.locator("circle").first().evaluate(circle => {
          const svg = circle.ownerSVGElement!;
          return (2 * Number(circle.getAttribute("r")) + Number(circle.getAttribute("stroke-width"))) * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
        });
        expect(paintedDiameter).toBe(d!.width);
        expect(b!.height).toBeGreaterThanOrEqual(44);
        expect(mode!.y).toBeGreaterThanOrEqual(dates!.y + dates!.height);
        expect(title!.x + title!.width).toBeLessThanOrEqual(width <= 780 ? d!.x - 12 : d!.x - 12);
        if (width <= 780) {
          expect(b!.width).toBe(d!.width); expect(b!.height).toBe(d!.height);
          expect(b!.x + b!.width / 2).toBe(d!.x + d!.width / 2);
          expect(d!.y - b!.y - b!.height).toBe(12);
          expect(b!.y - card!.y).toBe(21);
        } else {
          expect(d!.x + d!.width + 12).toBeLessThanOrEqual(b!.x);
          expect(Math.abs(d!.y + d!.height / 2 - b!.y - b!.height / 2)).toBeLessThan(1);
        }
        await expect(donut.locator(".submission-progress-number")).toHaveCSS("font-size", "14px");
        await expect(donut.locator("circle").first()).toHaveAttribute("stroke-width", "8");
        await expect(donut.locator("svg")).toHaveCSS("animation-name", "none");
        expect(await donut.getAttribute("aria-live")).toBeNull();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        if (target === null) await expect(donut.locator(".submission-progress-value")).toHaveCount(0);
        else await expect(donut.locator(".submission-progress-value")).toHaveAttribute("stroke-dasharray", "50 100");
        if (!long) await page.screenshot({ path: info.outputPath(`progress-${width}-${target === null ? "count" : "target"}.png`), fullPage: true });
        await button.focus(); await expect(button).toBeFocused();
        expect(evidence.external).toEqual([]); expect(evidence.errors).toEqual([]);
        expect(evidence.calls.every(call => call === `GET /api/rooms/${code}`)).toBe(true);
      });
    }
  }
}

test("stale multi-digit ratios keep the notice outside the ring and preserve actual over-target values", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  for (const submitted of [100, 1000]) {
    await page.unroute("**/api/rooms/**");
    await setup(page, { ...room, submitted_participant_count: submitted, expected_participants: 50 });
    await page.goto(`/rooms/${code}`);
    const donut = page.locator(".room-submission-progress");
    await expect(donut).toHaveAccessibleName(`입력 마감 · 목표 50명 중 ${submitted}명 제출`);
    await page.route(`**/api/rooms/${code}`, route => route.fulfill({ status: 503, json: { detail: "Synthetic refresh failure" } }));
    const note = page.getByText("마지막으로 확인한 제출 인원이에요.");
    await expect(note).toBeVisible();
    await expect(donut).toHaveAccessibleName(`입력 마감 · 마지막 확인한 집계 · 목표 50명 중 ${submitted}명 제출`);
    await expect(donut.locator("strong")).toHaveText(`${submitted}/50명`);
    await expect(donut.locator(".submission-progress-caption")).toHaveCount(0);
    const ring = (await donut.boundingBox())!;
    expect((await note.boundingBox())!.y).toBeGreaterThan(ring.y + ring.height);
    for (const line of await donut.locator(".submission-progress-number > span").all()) {
      const box = (await line.boundingBox())!;
      const dy = Math.max(Math.abs(box.y - ring.y - 32), Math.abs(box.y + box.height - ring.y - 32));
      expect(box.width).toBeLessThanOrEqual(2 * Math.sqrt(24 ** 2 - dy ** 2));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test("zero, missing, above-target and invalid denominator never invent completion", async ({ page }) => {
  for (const [submitted, target, text, dash] of [[0, 4, "0/4명", null], [null, 4, "—", null], [6, 4, "6/4명", "100 100"], [2, 0, "2명", null]] as const) {
    await page.unroute("**/api/rooms/**");
    const evidence = await setup(page, { ...room, submitted_participant_count: submitted, expected_participants: target });
    await page.goto(`/rooms/${code}`);
    const donut = page.locator(".room-submission-progress");
    await expect(donut.locator("strong")).toHaveText(text);
    if (dash) await expect(donut.locator(".submission-progress-value")).toHaveAttribute("stroke-dasharray", dash);
    else await expect(donut.locator(".submission-progress-value")).toHaveCount(0);
    expect(evidence.calls.every(call => call.startsWith("GET "))).toBe(true);
    expect(evidence.errors).toEqual([]);
  }
});

test("long title and clipboard failure preserve full-width manual copying without overlap", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const purpose = "긴제목과직접복사동선을함께검증하는합성모임".repeat(4);
  await setup(page, { ...room, purpose });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Synthetic copy failure"); } } }));
  await page.goto(`/rooms/${code}`);
  const header = page.locator(".room-header");
  await header.getByRole("button", { name: "초대 링크 복사" }).click();
  const input = header.getByRole("textbox", { name: "직접 복사할 링크" });
  await expect(input).toHaveValue(new RegExp(`/rooms/${code}$`));
  const [feedback, textbox, title, donut] = await Promise.all([header.locator(".copy-feedback").boundingBox(), input.boundingBox(), header.locator("h1").boundingBox(), header.locator(".room-submission-progress").boundingBox()]);
  expect(feedback!.y).toBeGreaterThan(title!.y + title!.height);
  expect(feedback!.y).toBeGreaterThan(donut!.y + donut!.height);
  expect(textbox!.y).toBeGreaterThanOrEqual(feedback!.y + feedback!.height);
  await input.focus(); await expect(input).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

for (const width of [320, 390, 1440]) {
  test(`multi-digit ratios stay inside the ring at ${width}px without changing number size`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [submitted, target] of [[20, 20], [50, 50], [100, 50], [1000, 50]]) {
      await page.unroute("**/api/rooms/**");
      await setup(page, { ...room, submitted_participant_count: submitted, expected_participants: target });
      await page.goto(`/rooms/${code}`);
      const donut = page.locator(".room-submission-progress");
      await expect(donut).toHaveAccessibleName(`입력 마감 · 목표 ${target}명 중 ${submitted}명 제출`);
      await expect(donut.locator("strong")).toHaveText(`${submitted}/${target}명`);
      await expect(donut.locator("strong")).toHaveCSS("font-size", "14px");
      await expect(donut.locator(".submission-progress-caption")).toHaveCount(0);
      const ring = (await donut.boundingBox())!;
      expect(ring.width).toBe(64); expect(ring.height).toBe(64);
      const lines = donut.locator(".submission-progress-number > span");
      await expect(lines).toHaveCount(2);
      for (const line of await lines.all()) {
        const box = (await line.boundingBox())!;
        const dy = Math.max(Math.abs(box.y - ring.y - 32), Math.abs(box.y + box.height - ring.y - 32));
        const innerChord = 2 * Math.sqrt(24 ** 2 - dy ** 2);
        expect(box.width).toBeLessThanOrEqual(innerChord);
        expect(box.x).toBeGreaterThan(ring.x + 8);
        expect(box.x + box.width).toBeLessThan(ring.x + 56);
      }
      if (submitted === 20) await page.screenshot({ path: info.outputPath(`progress-${width}-20-target.png`), fullPage: true });
    }
  });
}
