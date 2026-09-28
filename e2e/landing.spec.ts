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
