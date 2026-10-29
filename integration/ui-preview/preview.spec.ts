import { expect, test } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const scenes = ["landing", "login", "create", "history", "empty", "security", "collecting", "checking", "saved", "analyzing", "ready", "confirmed", "review", "no_match", "error"];
test("all synthetic scenes render locally without runtime errors or overflow", async ({ page, baseURL }) => {
  const external: string[] = [];
  const errors: string[] = [];
  const unsupported: string[] = [];
  page.on("request", request => { if (!request.url().startsWith(baseURL! + "/")) external.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() === 501) unsupported.push(response.url()); });
  for (const scene of scenes) {
    await page.goto(`/__preview?scene=${scene}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator(".ui-preview-banner")).toContainText("합성 데이터");
    if (scene === "ready") await expect(page.getByRole("button", { name: "이 시간 선택" })).toHaveCount(3);
    if (scene === "review") await expect(page.getByRole("dialog")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(external).toEqual([]); expect(errors).toEqual([]); expect(unsupported).toEqual([]);
});

test("synthetic recommendation selection persists only within its preview session", async ({ page }) => {
  await page.goto("/__preview?scene=ready");
  await page.getByRole("button", { name: "이 시간 선택" }).first().click();
  await page.getByRole("button", { name: "가능한 범위 전체 선택" }).click();
  await page.getByRole("button", { name: "일정 확정" }).click();
  await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "실제 모임 일정이 확정됐어요" })).toBeVisible();
  await page.goto("/__preview?scene=ready");
  await expect(page.getByRole("button", { name: "이 시간 선택" })).toHaveCount(3);
});

test("review uses local submission and OAuth never redirects to a provider", async ({ page }) => {
  await page.goto("/__preview?scene=review");
  await page.getByLabel("불편한 점 없이 잘 이용했어요").check();
  await page.getByRole("button", { name: "의견 보내기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/__preview?scene=login");
  await page.getByRole("link", { name: "Google로 로그인" }).click();
  await expect(page).toHaveURL(/\/api\/auth\/google\/start$/);
  await expect(page.getByRole("heading", { name: "로컬 로그인 미리보기" })).toBeVisible();
});

test("preview rejects unknown API and cross-origin access, and production assets exclude fixtures", async ({ page, request }) => {
  await page.goto("/__preview?scene=history");
  const unknown = await page.request.get("/api/unsupported");
  expect(unknown.status()).toBe(501);
  expect((await request.get("/__preview", { headers: { Origin: "https://example.invalid" } })).status()).toBe(403);
  expect((await request.get("/__preview", { headers: { Host: "localhost:4175" } })).status()).toBe(403);
  const response = await request.get("/__preview");
  expect(response.headers()["content-security-policy"]).toContain("connect-src 'self'");
  expect(response.headers()["cache-control"]).toBe("no-store");
  for (const name of await readdir(resolve("dist/assets"))) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(resolve("dist/assets", name), "utf8");
    expect(source).not.toMatch(/ui-preview-synthetic-token|UI_PREVIEW_UNSUPPORTED|__preview\?scene=/);
  }
});

test("synthetic creation, condition submission and closing use the existing controls", async ({ page }) => {
  await page.goto("/__preview?scene=create");
  await page.getByLabel("모임 목적 / 이름").fill("로컬 UI 확인용 모임");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("radio", { name: "직접 마감", exact: true }).check();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "로컬 UI 확인용 모임" })).toBeVisible();
  await page.getByRole("textbox").fill("화요일 저녁 7시부터 9시까지 온라인으로 가능해요.");
  await page.getByRole("button", { name: /조건 제출하기/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "제출 완료 · 다른 참여자를 기다려 주세요." })).toBeVisible();
  await page.getByRole("button", { name: "입력 마감하기", exact: true }).click();
  await page.getByRole("button", { name: "지금 입력 마감", exact: true }).click();
  await expect(page.getByRole("button", { name: "이 시간 선택" })).toHaveCount(3);
});
