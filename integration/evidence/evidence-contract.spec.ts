import { expect, test } from "@playwright/test";

// Real browser and application components; local synthetic transport only.
// This does not establish server persistence, authorization or model accuracy.
const review = "/integration/evidence-review.html";
test("V2 scoped choice preserves original and receives unresolved evidence", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${review}?state=question`);
  await expect(page.getByRole("heading", { name: "7~8시는 오전인가요, 오후인가요?" })).toBeVisible();
  await expect(page.getByText("토요일 7~8시 온라인만 가능, 일요일은 불가", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "오후", exact: true }).click();
  await expect(page.getByText("오후 7~8시", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("v2-scoped-choice.png"), fullPage: true });
  await page.getByRole("button", { name: "선택한 답변 제출" }).click();
  await expect(page.getByText(/접수 완료.*최종 분석에서 해석/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "제출한 보완 답변" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인 취소", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "7~8시는 오전인가요, 오후인가요?" })).toHaveCount(0);
  await expect(page.getByText("제출 완료 · 다른 참여자를 기다려 주세요.")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("v2-unresolved-received.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("V2 text-only answer starts empty and never replaces original", async ({ page }, info) => {
  await page.goto(`${review}?state=text`);
  await page.getByRole("button", { name: "직접 답변" }).click();
  const editor = page.getByRole("textbox", { name: /보완 답변/ });
  await expect(editor).toHaveValue("");
  await editor.fill("오후 7시부터 8시까지예요");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("v2-text-only-answer.png"), fullPage: true });
  await page.getByRole("button", { name: "답변 제출", exact: true }).click();
  await expect(page.getByText("오후 7시부터 8시까지예요", { exact: true })).toBeVisible();
  await expect(page.getByText("토요일 7~8시 온라인만 가능, 일요일은 불가", { exact: true })).toBeVisible();
});

test("V2 host sees unapplied original and finalized answer without a personal question", async ({ page }, info) => {
  await page.goto(`${review}?state=unapplied`);
  await page.getByText(/반영되지 않은 입력.*확인/).click();
  const details = page.locator("details.unapplied");
  await expect(details.getByText("합성 참여자", { exact: true })).toBeVisible();
  await expect(details.getByText("제출한 보완 답변: 퇴근하면 가능해요", { exact: true })).toBeVisible();
  await expect(details.getByText("시간 조건 미반영", { exact: true })).toBeVisible();
  await expect(details.getByText("7~8시는 오전인가요, 오후인가요?", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("v2-host-unapplied.png"), fullPage: true });
});
