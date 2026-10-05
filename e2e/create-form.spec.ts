import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const room = { invite_code: code, purpose: "생성 폼 로컬 검증", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-05", search_end_date: "2026-10-19", search_range_source: "DEFAULTED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", viewer: { joined: true, role: "HOST", display_name: "주최자" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT" };

async function fixture(context: BrowserContext, failFirst = false) {
  const bodies: Record<string, unknown>[] = [], external: string[] = [];
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") { external.push(url.origin); return route.abort(); }
    if (url.pathname === "/api/rooms" && request.method() === "POST") {
      bodies.push(request.postDataJSON());
      if (failFirst && bodies.length === 1) return route.fulfill({ status: 503, json: { code: "TEMPORARY_FAILURE", detail: "잠시 후 다시 시도해 주세요." } });
      return route.fulfill({ status: 201, json: room });
    }
    if (url.pathname.endsWith("/submission")) return route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    if (url.pathname === `/api/rooms/${code}`) return route.fulfill({ json: room });
    if (url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  return { bodies, external };
}
async function firstStep(page: Page) {
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("주최자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
}
async function next(page: Page) {
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("heading", { name: "언제 입력을 마감할까요?" })).toBeVisible();
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page).toHaveURL(`/rooms/${code}`);
}
async function capture(page: Page, path: string) {
  await page.locator(".create-card").evaluate(async card => {
    await Promise.all(card.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    window.scrollTo(0, 0);
  });
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

test("default 14 dates use Seoul today and submit the existing null/null contract", async ({ page, context }) => {
  const { bodies, external } = await fixture(context);
  await page.clock.install({ time: new Date("2026-10-05T14:59:59Z") });
  await firstStep(page);
  await expect(page.getByText("2026-10-05 ~ 2026-10-18")).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByText("2026-10-06 ~ 2026-10-19")).toBeVisible();
  await next(page); await submit(page);
  expect(bodies).toEqual([{ host_display_name: "주최자", purpose: room.purpose, meeting_mode: "EITHER", expected_participants: 4, submission_deadline: null, manual_only: false, search_start_date: null, search_end_date: null }]);
  expect(external).toEqual([]);
});

test("automatic/manual switching and previous step preserve inputs and apply only the selected mode", async ({ page, context }) => {
  const { bodies } = await fixture(context);
  await firstStep(page); await next(page);
  await page.getByLabel("예상 참여 인원").fill("7");
  await page.getByRole("checkbox", { name: /정해진 시간이 되면/ }).check();
  await page.getByLabel("제출 마감 (한국 시간)").fill("2099-12-31T18:30");
  await expect(page.getByRole("status")).toContainText("7명 제출 또는 지정 시각 중 먼저 충족");
  await page.getByRole("radio", { name: "직접 마감", exact: true }).check();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("자동 마감 없이 주최자가 직접 마감");
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("주최자 이름")).toBeFocused();
  await expect(page.getByLabel("모임 목적 / 이름")).toHaveValue(room.purpose);
  await next(page);
  await expect(page.getByRole("radio", { name: "직접 마감", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "자동 마감", exact: true }).check();
  await expect(page.getByLabel("예상 참여 인원")).toHaveValue("7");
  await expect(page.getByLabel("제출 마감 (한국 시간)")).toHaveValue("2099-12-31T18:30");
  await submit(page);
  expect(bodies[0]).toMatchObject({ expected_participants: 7, submission_deadline: "2099-12-31T09:30:00.000Z", manual_only: false });
});

test("manual mode ignores invalid retained automatic values and retry preserves the request", async ({ page, context }) => {
  const { bodies } = await fixture(context, true);
  await firstStep(page); await next(page);
  await page.getByLabel("예상 참여 인원").fill("");
  await page.getByRole("checkbox", { name: /정해진 시간이 되면/ }).check();
  await page.getByRole("radio", { name: "직접 마감", exact: true }).check();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("잠시 후 다시 시도");
  await expect(page.getByRole("radio", { name: "직접 마감", exact: true })).toBeChecked();
  await submit(page);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0]).toMatchObject({ expected_participants: null, submission_deadline: null, manual_only: true });
});

test("requires an automatic condition and valid future deadline before submitting time only", async ({ page, context }) => {
  const { bodies } = await fixture(context);
  await firstStep(page); await next(page);
  await page.getByRole("checkbox", { name: /목표 인원이 모두 제출하면/ }).uncheck();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("자동 마감 조건을 하나 이상");
  await page.getByRole("checkbox", { name: /정해진 시간이 되면/ }).check();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("마감 시각을 선택");
  await page.getByLabel("제출 마감 (한국 시간)").fill("2020-01-01T00:00");
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("현재보다 뒤의 시간");
  expect(bodies).toHaveLength(0);
  await page.getByLabel("제출 마감 (한국 시간)").fill("2099-01-01T00:00");
  await submit(page);
  expect(bodies[0]).toMatchObject({ expected_participants: null, submission_deadline: "2098-12-31T15:00:00.000Z", manual_only: false });
});

for (const [start, last, exclusive] of [
  ["2026-12-31", "2026-12-31", "2027-01-01"],
  ["2028-02-28", "2028-02-29", "2028-03-01"],
  ["2026-01-01", "2026-01-31", "2026-02-01"],
]) test(`custom period includes ${start} through ${last}`, async ({ page, context }) => {
  const { bodies } = await fixture(context);
  await firstStep(page);
  await page.getByRole("button", { name: "기간 변경", exact: true }).click();
  await page.getByLabel("시작일", { exact: true }).fill(start);
  await page.getByLabel("마지막 날 (포함)").fill(last);
  await next(page); await submit(page);
  expect(bodies[0]).toMatchObject({ search_start_date: start, search_end_date: exclusive });
});

test("date errors block the next step, back preserves dates, and reset restores null/null", async ({ page, context }) => {
  const { bodies } = await fixture(context);
  await firstStep(page);
  await page.getByRole("button", { name: "기간 변경", exact: true }).click();
  await page.getByLabel("시작일", { exact: true }).fill("2026-01-01");
  await page.getByLabel("마지막 날 (포함)").fill("2026-02-01");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("alert")).toContainText("31일 이하");
  await expect(page.getByLabel("마지막 날 (포함)")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("마지막 날 (포함)").fill("2025-12-31");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("alert")).toContainText("1일 이상");
  await page.getByLabel("마지막 날 (포함)").fill("");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByRole("alert")).toContainText("올바른 날짜");
  expect(bodies).toHaveLength(0);
  await page.getByLabel("마지막 날 (포함)").fill("2026-01-31");
  await next(page);
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByLabel("마지막 날 (포함)")).toHaveValue("2026-01-31");
  await page.getByRole("button", { name: "기본 14일로 되돌리기" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await next(page); await submit(page);
  expect(bodies[0]).toMatchObject({ search_start_date: null, search_end_date: null });
});

for (const width of [320, 390, 1440]) test(`keyboard, compact choices and touch targets at ${width}px`, async ({ page, context }, testInfo) => {
  await fixture(context);
  await page.setViewportSize({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900 });
  await firstStep(page);
  const choice = page.getByRole("radio", { name: "상관없음", exact: true });
  await choice.focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "대면", exact: true })).toBeChecked();
  for (const label of await page.locator(".mode-choices span").all()) {
    const box = await label.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const modeBox = await page.locator(".mode-choices").boundingBox(); expect(modeBox?.height).toBeLessThanOrEqual(55);
  const nextButton = page.getByRole("button", { name: /다음 단계/ });
  await nextButton.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "언제 입력을 마감할까요?" })).toBeFocused();
  const auto = page.getByRole("radio", { name: "자동 마감", exact: true });
  await auto.focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "직접 마감", exact: true })).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(auto).toBeChecked();
  await page.getByRole("checkbox", { name: /정해진 시간이 되면/ }).check();
  await page.getByLabel("제출 마감 (한국 시간)").fill("2099-12-31T18:30");
  await page.getByRole("button", { name: "방 만들기", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.locator(".create-card .actions button").all()) {
    const box = await button.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  await capture(page, testInfo.outputPath(`create-auto-${width}.png`));
  await page.getByRole("radio", { name: "직접 마감", exact: true }).check();
  await capture(page, testInfo.outputPath(`create-manual-${width}.png`));
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await capture(page, testInfo.outputPath(`create-basic-${width}.png`));
  await page.getByRole("button", { name: "기간 변경", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, testInfo.outputPath(`create-dates-${width}.png`));
  await page.getByRole("button", { name: "취소", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/");
});

for (const timezoneId of ["UTC", "America/Los_Angeles", "Asia/Seoul"]) test(`date display and API boundary are stable in ${timezoneId}`, async ({ browser }) => {
  const context = await browser.newContext({ timezoneId, baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  const { bodies } = await fixture(context);
  await page.clock.install({ time: new Date("2026-12-31T15:00:00Z") });
  await page.goto("/create");
  await expect(page.getByText("2027-01-01 ~ 2027-01-14")).toBeVisible();
  await page.getByLabel("주최자 이름").fill("주최자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
  await page.getByRole("button", { name: "기간 변경", exact: true }).click();
  await expect(page.getByLabel("시작일", { exact: true })).toHaveValue("2027-01-01");
  await expect(page.getByLabel("마지막 날 (포함)")).toHaveValue("2027-01-14");
  await next(page); await submit(page);
  expect(bodies[0]).toMatchObject({ search_start_date: "2027-01-01", search_end_date: "2027-01-15" });
  await context.close();
});
