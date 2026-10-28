import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  let claimed: string | null = null;
  await page.route("**/__review-test/**", async route => {
    const action = route.request().url().split("/").at(-1);
    const body = route.request().postDataJSON();
    if (action === "claim") {
      const pending = claimed === null || claimed === body.request_id;
      claimed ??= body.request_id;
      await route.fulfill({ json: { prompt_id: pending ? "synthetic-prompt" : null, state: pending ? "PENDING" : "SUPPRESSED" } });
    } else await route.fulfill({ json: { prompt_id: "synthetic-prompt", state: action === "submit" ? "SUBMITTED" : "CLOSED" } });
  });
});

test("mobile layout, keyboard trap, optional OTHER, checked close excludes draft", async ({ page }, info) => {
  const requests: { action: string; body: unknown }[] = [];
  page.on("request", req => { if (req.url().includes("/__review-test/")) requests.push({ action: req.url().split("/").at(-1)!, body: req.postDataJSON() }); });
  await page.goto("/docs/verification/review-preview.html");
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await dialog.evaluate(element => element.getBoundingClientRect().width <= innerWidth)).toBe(true);
  const first = dialog.getByRole("checkbox", { name: "불편한 점 없이 잘 이용했어요" });
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Tab"); await expect(first).toBeFocused();
  await dialog.getByRole("checkbox", { name: "기타", exact: true }).check();
  await dialog.getByRole("textbox").fill("synthetic private draft");
  await dialog.getByRole("checkbox", { name: "일주일간 보지 않기" }).check();
  await page.screenshot({ path: `docs/verification/review-${info.project.name}.png`, fullPage: true });
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => requests.filter(req => req.action === "close").length).toBe(1);
  expect(requests.at(-1)?.body).toEqual({ prompt_id: "synthetic-prompt", hide_for_week: true });
  expect(JSON.stringify(requests)).not.toContain("synthetic private draft");
  expect(await page.evaluate(() => Object.values(localStorage).concat(Object.values(sessionStorage)).join())).not.toContain("synthetic private draft");
  await page.reload(); await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("navigation back discards unsubmitted draft and does not reask same meeting", async ({ page }) => {
  let submissions = 0; page.on("request", req => { if (req.url().endsWith("/__review-test/submit")) submissions++; });
  await page.goto("/docs/verification/review-preview.html");
  await page.getByRole("checkbox", { name: "기타", exact: true }).check();
  await page.getByRole("textbox").fill("synthetic temporary draft");
  await page.goto("/docs/verification/review-preview.html?away=1");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(submissions).toBe(0);
});
