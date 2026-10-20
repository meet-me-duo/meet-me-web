import { execFileSync } from "node:child_process";
import type { Page, Response } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Room } from "../../src/api/types";
import type { SubmissionCheckSnapshot } from "../../src/api/precheck";

// Approved A only: real HTTPS/OIDC/server/PG with a synthetic provider.
// Browser clock and removal of the local synthetic refresh cookie are explicit
// fault injection. No routed HTTP, forged401, manual auth fetch or paid call.
// Original eight and both causal diagnostic specifications remain unchanged.
const web = process.env.HOST_INTEGRATION_WEB_ORIGIN;
const api = process.env.HOST_INTEGRATION_API_ORIGIN;
const control = process.env.HOST_INTEGRATION_CONTROL_ORIGIN;
if (web !== "https://localhost:19443" || api !== "https://localhost:19444" || control !== "http://127.0.0.1:19442") throw new Error("ISOLATED_A_RECOVERY_FIXTURE_REQUIRED");
const matches = (response: Response, path: string, method = "GET") => response.url() === `${api}${path}` && response.request().method() === method;
const refresh = (response: Response) => matches(response, "/api/auth/refresh", "POST");
const roomPath = (code: string) => `/api/rooms/${code}`;
const checksPath = (code: string) => `${roomPath(code)}/submission/checks`;
const input = (page: Page) => page.getByRole("textbox", { name: /시간·장소 조건/ });
async function fixture(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${control}${path}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  expect(response.status).toBe(200); return response.json() as Promise<Record<string, unknown>>;
}
function counts(code: string): { heads: number; versions: number; candidates: number } {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) throw new Error("SYNTHETIC_ROOM_CODE_REQUIRED");
  const container = process.env.HOST_INTEGRATION_DB_CONTAINER; const user = process.env.HOST_INTEGRATION_DB_USER; const database = process.env.HOST_INTEGRATION_DB_NAME;
  if (!container || !user || !database) throw new Error("DISPOSABLE_DB_METADATA_REQUIRED");
  const sql = `WITH r AS (SELECT id FROM meeting_rooms WHERE invite_code='${code}'), h AS (SELECT h.id FROM submission_heads h JOIN r ON h.room_id=r.id) SELECT json_build_object('heads',(SELECT count(*) FROM h),'versions',(SELECT count(*) FROM submission_versions v JOIN h ON v.submission_id=h.id),'candidates',(SELECT count(*) FROM precheck_candidates c JOIN r ON c.room_id=r.id))`;
  return JSON.parse(execFileSync("docker", ["exec", container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim());
}
async function create(page: Page): Promise<{ code: string; expiresAt: string }> {
  await page.goto(`${web}/create`);
  await expect(page.getByRole("link", { name: "Google로 로그인", exact: true })).toBeVisible();
  const restored = page.waitForResponse(refresh);
  await page.getByRole("link", { name: "Google로 로그인", exact: true }).click();
  const restoredResponse = await restored; expect(restoredResponse.status()).toBe(200);
  // Retain only the public expiry timestamp, never a credential or body dump.
  const expiresAt = (await restoredResponse.json() as { expiresAt: string }).expiresAt;
  expect(Number.isFinite(Date.parse(expiresAt))).toBe(true);
  await expect(page).toHaveURL(`${web}/create`);
  await page.getByLabel("모임 목적 / 이름", { exact: true }).fill("HTTPS A 복구 합성 모임");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByLabel("예상 참여 인원", { exact: true }).fill("4");
  const creation = page.waitForResponse(response => matches(response, "/api/rooms", "POST"));
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  const response = await creation; expect(response.status()).toBe(201); const room = await response.json() as Room;
  expect(room.viewer.role).toBe("HOST"); expect(room.submission_protocol).toBe("PRE_SUBMIT_V1");
  await expect(page).toHaveURL(`${web}/rooms/${room.invite_code}`);
  await expect(input(page)).toBeVisible(); expect(counts(room.invite_code)).toEqual({ heads: 0, versions: 0, candidates: 0 });
  return { code: room.invite_code, expiresAt };
}
async function saved(page: Page, code: string, raw: string): Promise<void> {
  await input(page).fill(raw);
  const posted = page.waitForResponse(response => matches(response, checksPath(code), "POST"));
  await page.getByRole("button", { name: "조건 제출하기", exact: true }).click();
  const response = await posted; expect(response.status()).toBe(202); const candidate = await response.json() as SubmissionCheckSnapshot;
  expect(candidate.candidate?.raw_text).toBe(raw); expect(candidate.accepted).toBeNull(); expect(candidate.submission_complete).toBe(false);
  expect(counts(code)).toEqual({ heads: 0, versions: 0, candidates: 1 });
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요", exact: true })).toHaveCount(0);
  await fixture("/provider", { verdict: "CLEAR" }); expect((await fixture("/worker/run-one", {})).ran).toBe(true);
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요", exact: true })).toBeVisible({ timeout: 12_000 });
  expect(counts(code)).toEqual({ heads: 1, versions: 1, candidates: 1 });
}
async function recentRoom(page: Page, code: string): Promise<void> {
  const link = page.locator(`a[href="/rooms/${code}"]`);
  await expect(link).toBeVisible(); await link.click(); await expect(page).toHaveURL(`${web}/rooms/${code}`);
}
async function noRawInStorage(page: Page, raw: string): Promise<void> {
  const leaked = await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), raw);
  expect(leaked, "The private synthetic draft must not enter Web Storage").toBe(false);
}

test.beforeEach(async () => { const health = await fixture("/health"); expect(health.fixture).toBe("issue123-host-current-v1"); expect(health.production).toBe(false); });

test("A normal SPA navigation keeps account memory and stable reload re-reads only server-accepted input", async ({ page }) => {
  test.setTimeout(90_000); let refreshes = 0;
  page.on("request", request => { if (request.url() === `${api}/api/auth/refresh`) refreshes++; });
  const { code } = await create(page); const beforeSpa = refreshes;
  await page.getByRole("link", { name: "Meet me 홈", exact: true }).click(); await recentRoom(page, code);
  await expect(page.getByRole("button", { name: "입력 마감하기", exact: true })).toBeVisible(); expect(refreshes).toBe(beforeSpa);
  const raw = "금요일 오후 7~8시 온라인만 가능한 합성 저장본"; await saved(page, code, raw);
  const restored = page.waitForResponse(refresh); const current = page.waitForResponse(response => matches(response, `${checksPath(code)}/current`) && response.status() === 200);
  await page.reload(); expect((await restored).status()).toBe(200);
  const owner = await (await current).json() as SubmissionCheckSnapshot;
  expect(owner.accepted?.raw_text).toBe(raw); expect(owner.submission_complete).toBe(true);
  await expect(page.getByText(raw, { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "입력 마감하기", exact: true })).toBeVisible();
  expect(counts(code)).toEqual({ heads: 1, versions: 1, candidates: 1 }); await noRawInStorage(page, raw);
});

test("A explicit recheck restores the original-tab draft after actual401 and same-account new-tab login only after fresh owner reads", async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date() });
  const { code, expiresAt } = await create(page); const raw = "  원래 탭에만 남겨 둔 합성 미저장 조건\n주말 아무 때나  ";
  let writes = 0; page.on("request", request => { if (request.url() === `${api}${checksPath(code)}` && request.method() === "POST") writes++; });
  await input(page).click(); await input(page).fill(raw);
  // Explicit local fault injection: the real scheduled app refresh encounters a
  // missing disposable cookie and the unchanged server returns its actual401.
  await context.clearCookies({ name: "meetme_refresh" });
  const expired = page.waitForResponse(refresh); await page.clock.pauseAt(Date.parse(expiresAt) - 30_000);
  expect((await expired).status()).toBe(401);
  await page.clock.setSystemTime(new Date());
  await page.clock.resume();
  const recovery = page.getByRole("region", { name: "계정 복구", exact: true }); await expect(recovery).toBeVisible();
  await expect(recovery).toContainText(/로그인.*다시|다시.*로그인|로그인.*확인/);
  await expect(input(page)).toHaveCount(0); expect(await page.locator("body").innerText()).not.toContain(raw);
  const newPage = context.waitForEvent("page"); await recovery.getByRole("link", { name: "새 탭에서 로그인", exact: true }).click();
  const popup = await newPage;
  try {
    await expect(popup).toHaveURL(`${web}/rooms/${code}`); expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    const popupRecovery = popup.getByRole("region", { name: "계정 복구", exact: true }); await expect(popupRecovery).toBeVisible();
    const loggedIn = popup.waitForResponse(refresh); await popupRecovery.getByRole("link", { name: /Google/ }).click(); expect((await loggedIn).status()).toBe(200);
    await expect(popup).toHaveURL(`${web}/rooms/${code}`); await expect(popup.getByRole("button", { name: "입력 마감하기", exact: true })).toBeVisible();
    await expect(input(popup)).toHaveValue("");
    let recoveryRefreshes = 0; page.on("request", request => { if (request.url() === `${api}/api/auth/refresh` && request.method() === "POST") recoveryRefreshes++; });
    const restored = page.waitForResponse(refresh); const freshRoom = page.waitForResponse(response => matches(response, roomPath(code)) && response.status() === 200);
    const freshOwn = page.waitForResponse(response => matches(response, `${checksPath(code)}/current`) && response.status() === 200);
    await page.bringToFront();
    await page.getByRole("button", { name: "로그인 상태 다시 확인", exact: true }).click();
    expect((await restored).status()).toBe(200); expect((await (await freshRoom).json() as Room).viewer.role).toBe("HOST");
    const current = await (await freshOwn).json() as SubmissionCheckSnapshot; expect(current.candidate).toBeNull(); expect(current.accepted).toBeNull();
    await expect(input(page)).toHaveValue(raw); await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요", exact: true })).toHaveCount(0);
    expect(recoveryRefreshes).toBe(1); expect(writes).toBe(0); expect(counts(code)).toEqual({ heads: 0, versions: 0, candidates: 0 }); await noRawInStorage(page, raw); await noRawInStorage(popup, raw);
  } finally { await popup.close(); }
});

test("A native beforeunload cancellation retains draft; confirmed full exit honestly loses unsaved memory", async ({ page }) => {
  test.setTimeout(90_000); const { code } = await create(page); const raw = "이탈 확인 전의 합성 미저장 원문";
  await input(page).click(); await input(page).fill(raw);
  const cancelled = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("beforeunload"); await dialog.dismiss(); });
  const attempt = page.goto(web).then(() => false, error => error instanceof Error && /ERR_ABORTED|navigation.*cancel/i.test(error.message));
  await cancelled; expect(await attempt).toBe(true); await expect(page).toHaveURL(`${web}/rooms/${code}`); await expect(input(page)).toHaveValue(raw);
  const confirmed = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("beforeunload"); await dialog.accept(); });
  const restored = page.waitForResponse(refresh); await page.goto(web); await confirmed; expect((await restored).status()).toBe(200);
  await recentRoom(page, code); await expect(input(page)).toHaveValue(""); await expect(page.getByRole("button", { name: "입력 마감하기", exact: true })).toBeVisible();
  expect(counts(code)).toEqual({ heads: 0, versions: 0, candidates: 0 }); await noRawInStorage(page, raw);
});
