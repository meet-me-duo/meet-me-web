import { execFileSync } from "node:child_process";
import type { BrowserContext, Page, Response } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Room, SavedSubmission, Submission } from "../../src/api/types";

// Acceptance sources: web #22 / JIN-71, PRD FR-002C/007A/009/010A/010B,
// Rule 4, ADR-036, and the published OpenAPI. No API routes are mocked.
const webOrigin = process.env.HOST_INTEGRATION_WEB_ORIGIN ?? "https://localhost:8443";
const apiOrigin = process.env.HOST_INTEGRATION_API_ORIGIN ?? "https://localhost:8444";
for (const origin of [webOrigin, apiOrigin]) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.hostname !== "localhost" || parsed.origin !== origin) {
    throw new Error("Integration origins must be bare HTTPS localhost origins");
  }
}

type Reply<T> = { status: number; body: T };
type Problem = { code: string; submitted_participants?: number };
type Snapshot = {
  participants: number; hosts: number; hostHeads: number; heads: number;
  versions: number; maxRevision: number; latestIds: string;
  batches: number; items: number; frozenLatest: boolean;
  runs: number; queued: number; outbox: number;
  candidates: number; attempts: number; invocations: number;
};

function selectDatabase(sql: string): string {
  const container = process.env.HOST_INTEGRATION_DB_CONTAINER;
  if (!container) throw new Error("HOST_INTEGRATION_DB_CONTAINER is required");
  return execFileSync("docker", [
    "exec", container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
    "-U", process.env.HOST_INTEGRATION_DB_USER ?? "meetme",
    "-d", process.env.HOST_INTEGRATION_DB_NAME ?? "meetme", "-c", sql,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Only aggregate metadata leaves the isolated test database. Never query/print
// credentials, raw_text, database passwords, or provider configuration.
function snapshot(inviteCode: string): Snapshot {
  if (!/^[A-Za-z0-9_-]{22}$/.test(inviteCode)) throw new Error("Invalid synthetic invite code");
  const sql = `WITH room AS (SELECT id FROM meeting_rooms WHERE invite_code = '${inviteCode}'),
    people AS (SELECT p.* FROM participants p JOIN room r ON r.id = p.room_id),
    heads AS (SELECT h.* FROM submission_heads h JOIN room r ON r.id = h.room_id),
    versions AS (SELECT v.* FROM submission_versions v JOIN heads h ON h.id = v.submission_id),
    batches AS (SELECT b.* FROM submission_batches b JOIN room r ON r.id = b.room_id),
    items AS (SELECT i.* FROM submission_batch_items i JOIN batches b ON b.id = i.batch_id),
    runs AS (SELECT c.* FROM coordination_runs c JOIN room r ON r.id = c.room_id)
    SELECT json_build_object(
      'participants', (SELECT count(*) FROM people),
      'hosts', (SELECT count(*) FROM people WHERE role = 'HOST'),
      'hostHeads', (SELECT count(*) FROM heads h JOIN people p ON p.id = h.participant_id WHERE p.role = 'HOST'),
      'heads', (SELECT count(*) FROM heads),
      'versions', (SELECT count(*) FROM versions),
      'maxRevision', (SELECT coalesce(max(revision), 0) FROM versions),
      'latestIds', (SELECT coalesce(md5(string_agg(latest_version_id::text, ',' ORDER BY id)), '') FROM heads),
      'batches', (SELECT count(*) FROM batches),
      'items', (SELECT count(*) FROM items),
      'frozenLatest', NOT EXISTS (
        (SELECT submission_version_id FROM items EXCEPT SELECT latest_version_id FROM heads)
        UNION ALL (SELECT latest_version_id FROM heads EXCEPT SELECT submission_version_id FROM items)),
      'runs', (SELECT count(*) FROM runs),
      'queued', (SELECT count(*) FROM runs WHERE status = 'QUEUED'),
      'outbox', (SELECT count(*) FROM outbox_events e JOIN runs r ON r.id = e.aggregate_id),
      'candidates', (SELECT count(*) FROM candidates c JOIN runs r ON r.id = c.coordination_run_id),
      'attempts', (SELECT count(*) FROM coordination_attempts a JOIN runs r ON r.id = a.coordination_run_id),
      'invocations', (SELECT count(*) FROM analysis_invocations a JOIN runs r ON r.id = a.coordination_run_id)
    ) FROM room`;
  const output = selectDatabase(sql);
  if (!output) throw new Error("Synthetic room was not persisted");
  return JSON.parse(output) as Snapshot;
}

async function api<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<Reply<T>> {
  return page.evaluate(async ({ origin, path, method, body }) => {
    const response = await fetch(`${origin}${path}`, {
      method, credentials: "include",
      headers: { Accept: "application/json, application/problem+json", "Accept-Language": "ko-KR", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }, { origin: apiOrigin, path, method, body });
}

function roomPath(code: string) { return `/api/rooms/${code}`; }
function isApiResponse(response: Response, path: string, method: string) {
  return response.url() === `${apiOrigin}${path}` && response.request().method() === method;
}

async function createRoom(page: Page): Promise<{ code: string; response: Response; room: Room }> {
  await page.goto(`${webOrigin}/create`);
  await page.getByLabel("주최자 이름").fill("합성 주최자");
  await page.getByLabel("모임 목적 / 이름").fill("로컬 연결 검증 모임");
  await expect(page.getByRole("textbox")).toHaveCount(2);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByText(/내 시간·장소 조건은 방을 만든 뒤 입력/)).toBeVisible();
  await page.getByLabel("예상 참여 인원", { exact: true }).fill("4");
  const responsePromise = page.waitForResponse(response => isApiResponse(response, "/api/rooms", "POST"));
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const room = await response.json() as Room;
  expect(/^[A-Za-z0-9_-]{22}$/.test(room.invite_code)).toBe(true);
  await expect(page).toHaveURL(`${webOrigin}/rooms/${room.invite_code}`);
  await expect(page.getByRole("heading", { name: "모임이 만들어졌어요" })).toBeVisible();
  expect(room.viewer.joined).toBe(true);
  expect(room.viewer.role).toBe("HOST");
  expect(typeof room.viewer.context_id === "string" && room.viewer.context_id.length > 0).toBe(true);
  expect(room.collection_status).toBe("COLLECTING");
  expect(room.expected_participants).toBe(4);
  expect(Object.hasOwn(response.request().postDataJSON(), "raw_text")).toBe(false);
  return { code: room.invite_code, response, room };
}

async function submit(page: Page, code: string, text: string, revision: number) {
  await page.getByLabel("시간·장소 조건", { exact: false }).fill(text);
  const pending = page.waitForResponse(response => isApiResponse(response, `${roomPath(code)}/submission`, "PUT"));
  await page.getByRole("button", { name: revision === 1 ? "조건 제출하기" : "수정 내용 저장", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  const saved = await response.json() as SavedSubmission;
  expect(saved.raw_text === text.trim()).toBe(true);
  expect(saved.revision).toBe(revision);
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await expect(page.getByText(`저장된 입력 #${revision}`, { exact: true })).toBeVisible();
  return saved;
}

async function join(page: Page, code: string, name: string) {
  await page.goto(`${webOrigin}/rooms/${code}`);
  await page.getByLabel("내 이름", { exact: true }).fill(name);
  const pending = page.waitForResponse(response => isApiResponse(response, `${roomPath(code)}/participants`, "POST"));
  await page.getByRole("button", { name: "모임 참여하기", exact: true }).click();
  const response = await pending;
  expect([200, 201].includes(response.status())).toBe(true);
  const room = await response.json() as Room;
  expect(room.viewer.role).toBe("MEMBER");
  await expect(page.getByRole("textbox", { name: /시간·장소 조건/ })).toBeVisible();
}

function noAnalysis(value: Snapshot) {
  expect(value.attempts).toBe(0);
  expect(value.invocations).toBe(0);
  expect(value.candidates).toBe(0);
}

function noPrivateInput(value: unknown, inputs: string[]) {
  const serialized = JSON.stringify(value);
  expect(inputs.some(input => serialized.includes(input))).toBe(false);
  expect(serialized.includes('"raw_text"')).toBe(false);
}

// The public schema promises date-time storage instants, not nanosecond wire
// precision. V1 persists TIMESTAMPTZ. Ask the same PostgreSQL to compare both
// timestamps exactly in that type; never allow a wall-clock tolerance. The
// before/after GET assertions below independently require exact immutability.
// Synthetic timestamp metadata contains neither text nor credentials.
async function recordTimestampBoundary(kind: string, written: string, persisted: string) {
  function parts(value: string) {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
    if (!match) throw new Error("Timestamp diagnostic requires a UTC RFC3339 instant");
    const seconds = Date.parse(`${match[1]}Z`) / 1000;
    if (!Number.isSafeInteger(seconds)) throw new Error("Invalid diagnostic timestamp seconds");
    return { seconds, nanoseconds: Number((match[2] ?? "").padEnd(9, "0")), precision: (match[2] ?? "").length };
  }
  const first = parts(written), stored = parts(persisted);
  const firstNanos = BigInt(first.seconds) * 1_000_000_000n + BigInt(first.nanoseconds);
  const storedNanos = BigInt(stored.seconds) * 1_000_000_000n + BigInt(stored.nanoseconds);
  // Both strings passed the restricted UTC timestamp grammar above.
  const pgProjectionEqual = selectDatabase(`SELECT '${written}'::timestamptz = '${persisted}'::timestamptz`) === "t";
  await test.info().attach(`timestamp-boundary-${kind}`, {
    contentType: "application/json",
    body: JSON.stringify({
      written: first, persisted: stored,
      deltaNanoseconds: Number(storedNanos - firstNanos),
      exactStringEqual: written === persisted,
      withinPgMicrosecond: storedNanos % 1_000n === 0n && (firstNanos + 500n) / 1_000n === storedNanos / 1_000n,
      pgProjectionEqual,
    }),
  });
  expect(pgProjectionEqual, "Initial and persisted instants must be exactly equal as PostgreSQL TIMESTAMPTZ").toBe(true);
}

test("#22 creation, sharing, deferred HOST input, private ownership and immutable retry", async ({ page, context, newTrustedContext }) => {
  const commands = { create: 0, join: 0, save: 0 };
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.origin !== apiOrigin) return;
    if (url.pathname === "/api/rooms" && request.method() === "POST") commands.create++;
    if (url.pathname.endsWith("/participants") && request.method() === "POST") commands.join++;
    if (url.pathname.endsWith("/submission") && request.method() === "PUT") commands.save++;
  });
  const { code, response, room } = await createRoom(page);
  expect(commands).toEqual({ create: 1, join: 0, save: 0 });
  expect(snapshot(code)).toMatchObject({ participants: 1, hosts: 1, hostHeads: 0, heads: 0, versions: 0, batches: 0, runs: 0 });
  const ownMissing = await api<Problem>(page, `${roomPath(code)}/submission`);
  expect(ownMissing.status).toBe(404);
  expect(ownMissing.body.code).toBe("SUBMISSION_NOT_FOUND");

  // ADR-036: metadata only. Credential bytes never become assertion output.
  const cookie = (await context.cookies(`${apiOrigin}/api/rooms`)).find(item => item.name === "meet_me_guest");
  expect(!!cookie).toBe(true);
  if (!cookie) throw new Error("Server did not issue the guest cookie");
  expect({ secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, path: cookie.path, domain: cookie.domain })
    .toEqual({ secure: true, httpOnly: true, sameSite: "Lax", path: "/api", domain: "localhost" });
  expect(cookie.expires > Date.now() / 1000 + 29 * 86400).toBe(true);
  expect(cookie.expires <= Date.now() / 1000 + 30 * 86400 + 60).toBe(true);
  const headers = await response.allHeaders();
  const cookieHeader = (await response.headersArray()).find(header => header.name.toLowerCase() === "set-cookie" && header.value.startsWith("meet_me_guest="))?.value ?? "";
  expect(/;\s*domain=/i.test(cookieHeader)).toBe(false);
  expect(/;\s*max-age=2592000(?:;|$)/i.test(cookieHeader)).toBe(true);
  expect(headers["access-control-allow-origin"]).toBe(webOrigin);
  expect(headers["access-control-allow-credentials"]).toBe("true");
  expect(JSON.stringify(room).includes(cookie.value)).toBe(false);
  const exposedInStorage = await page.evaluate(value => {
    const values = [document.cookie, location.href, ...Object.values(localStorage), ...Object.values(sessionStorage)];
    return values.some(item => item.includes(value));
  }, cookie.value);
  expect(exposedInStorage).toBe(false);

  await expect(page.getByText(/아직 내 조건은 제출하지 않았어요/)).toBeVisible();
  await page.getByRole("button", { name: "초대 링크 복사", exact: true }).click();
  const copyFeedback = page.getByRole("status").filter({ hasText: /링크를 복사했어요|자동으로 복사하지 못했어요/ });
  await expect(copyFeedback).toBeVisible();
  if (await copyFeedback.textContent() === "링크를 복사했어요.") {
    await context.grantPermissions(["clipboard-read"], { origin: webOrigin });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${webOrigin}/rooms/${code}`);
  } else {
    await expect(copyFeedback).toHaveText("자동으로 복사하지 못했어요. 아래 링크를 선택해 직접 복사해 주세요.");
    const manualLink = page.getByLabel("직접 복사할 링크", { exact: true });
    await expect(manualLink).toBeVisible();
    await expect(manualLink).toHaveValue(`${webOrigin}/rooms/${code}`);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "나중에 입력하기", exact: true }).click();
  await expect(page).toHaveURL(`${webOrigin}/`);
  await page.goto(`${webOrigin}/rooms/${code}`);
  await page.reload();
  await expect(page.getByRole("heading", { name: "모임이 만들어졌어요" })).toBeVisible();
  const returned = await api<Room>(page, roomPath(code));
  expect(returned.status).toBe(200);
  expect(returned.body.viewer.role).toBe("HOST");
  expect(returned.body.viewer.context_id === room.viewer.context_id).toBe(true);
  const reusedCookie = (await context.cookies(`${apiOrigin}/api/rooms`)).find(item => item.name === cookie.name);
  expect(reusedCookie?.value === cookie.value).toBe(true);
  expect(reusedCookie?.expires === cookie.expires).toBe(true);
  expect(commands).toEqual({ create: 1, join: 0, save: 0 });

  const first = await submit(page, code, "  화요일 저녁 온라인 합성 조건 첫번째  ", 1);
  const initial = snapshot(code);
  expect(initial).toMatchObject({ participants: 1, hosts: 1, hostHeads: 1, heads: 1, versions: 1, maxRevision: 1, batches: 0 });
  await page.getByRole("button", { name: "내 조건 수정", exact: true }).click();
  const revised = await submit(page, code, "목요일 저녁 온라인 합성 조건 두번째", 2);
  expect(revised.revision).toBe(first.revision + 1);
  const beforeRetry = snapshot(code);
  expect(beforeRetry).toMatchObject({ participants: 1, heads: 1, versions: 2, maxRevision: 2, batches: 0 });
  const persistedBeforeRetry = await api<Submission>(page, `${roomPath(code)}/submission`);
  expect(persistedBeforeRetry.status).toBe(200);
  expect(persistedBeforeRetry.body.revision).toBe(revised.revision);
  expect(persistedBeforeRetry.body.raw_text === revised.raw_text).toBe(true);
  await recordTimestampBoundary("submission", revised.created_at, persistedBeforeRetry.body.created_at);
  // The UI correctly disables unchanged saves. Exercise the public API retry
  // contract from that same trusted browser, with ECMAScript trim equivalence.
  const retry = await api<SavedSubmission>(page, `${roomPath(code)}/submission`, "PUT", { raw_text: ` \t${revised.raw_text}\n`, });
  expect(retry.status).toBe(200);
  expect(retry.body.revision).toBe(2);
  expect(retry.body.created_at === persistedBeforeRetry.body.created_at).toBe(true);
  expect(retry.body.locale === revised.locale).toBe(true);
  expect(retry.body.raw_text === revised.raw_text).toBe(true);
  expect(snapshot(code)).toEqual(beforeRetry);
  expect(commands).toEqual({ create: 1, join: 0, save: 3 });
  await page.reload();
  await expect(page.getByText("저장된 입력 #2", { exact: true })).toBeVisible();
  const saved = await api<Submission>(page, `${roomPath(code)}/submission`);
  expect(saved.status).toBe(200);
  expect(saved.body.raw_text === revised.raw_text).toBe(true);
  expect(saved.body.created_at === persistedBeforeRetry.body.created_at).toBe(true);

  const stranger = await newTrustedContext();
  try {
    const other = await stranger.newPage();
    await other.goto(`${webOrigin}/rooms/${code}`);
    await expect(other.getByRole("button", { name: "모임 참여하기", exact: true })).toBeVisible();
    await expect(other.getByRole("button", { name: "입력 마감하기", exact: true })).toHaveCount(0);
    const publicRead = await api<Room>(other, roomPath(code));
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.viewer.joined).toBe(false);
    noPrivateInput(publicRead.body, [first.raw_text, revised.raw_text]);
    const anonymousOwn = await api<Problem>(other, `${roomPath(code)}/submission`);
    expect(anonymousOwn.status).toBe(401);
    expect(anonymousOwn.body.code).toBe("GUEST_SESSION_REQUIRED");
    noPrivateInput(anonymousOwn.body, [first.raw_text, revised.raw_text]);
    await join(other, code, "합성 주최자");
    const memberOwn = await api<Problem>(other, `${roomPath(code)}/submission`);
    expect(memberOwn.status).toBe(404);
    expect(memberOwn.body.code).toBe("SUBMISSION_NOT_FOUND");
    noPrivateInput(memberOwn.body, [first.raw_text, revised.raw_text]);
    const denied = await api<Problem>(other, `${roomPath(code)}/close`, "POST", { confirm_early: true });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe("HOST_PERMISSION_REQUIRED");
    const rendered = await other.locator("body").innerText();
    expect([first.raw_text, revised.raw_text].some(input => rendered.includes(input))).toBe(false);
    const memberRoom = await api<Room>(other, roomPath(code));
    expect(memberRoom.body.viewer.role).toBe("MEMBER");
    noPrivateInput(memberRoom.body, [first.raw_text, revised.raw_text]);
    expect(snapshot(code)).toMatchObject({ participants: 2, hosts: 1, heads: 1, versions: 2, batches: 0, runs: 0 });
    noAnalysis(snapshot(code));

    // Same hostname and valid TLS, but a different Origin. Browser CORS
    // preflight must be rejected even though this MEMBER has a valid cookie.
    const beforeWrongOrigin = snapshot(code);
    await other.goto("https://localhost:8445");
    // Chromium preflight requests have no frame and may not emit Playwright
    // Page response events. CDP only observes the actual network response;
    // no routing/interception is installed, including for OPTIONS.
    const network = await stranger.newCDPSession(other);
    let observedPreflight: { status: number; allowOrigin: string | undefined } | null = null;
    await network.send("Network.enable");
    network.on("Network.responseReceived", event => {
      if (event.type !== "Preflight" || event.response.url !== `${apiOrigin}${roomPath(code)}/submission`) return;
      const headers = event.response.headers as Record<string, string>;
      observedPreflight = { status: event.response.status, allowOrigin: Object.entries(headers).find(([name]) => name.toLowerCase() === "access-control-allow-origin")?.[1] };
    });
    try {
      const corsBlocked = await other.evaluate(async ({ origin, path }) => {
        try {
          await fetch(`${origin}${path}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw_text: "합성 비허용 Origin 조건" }) });
          return false;
        } catch (error) { return error instanceof TypeError; }
      }, { origin: apiOrigin, path: `${roomPath(code)}/submission` });
      expect(corsBlocked).toBe(true);
      await expect.poll(() => observedPreflight !== null, { message: "Observe the actual server CORS preflight response" }).toBe(true);
      const preflight = observedPreflight as { status: number; allowOrigin: string | undefined } | null;
      if (!preflight) throw new Error("Missing actual CORS preflight response");
      expect(preflight.status).toBe(403);
      expect(preflight.allowOrigin === "https://localhost:8445").toBe(false);
      expect(preflight.allowOrigin === "*").toBe(false);
    } finally { await network.detach(); }
    expect(snapshot(code)).toEqual(beforeWrongOrigin);
  } finally { await stranger.close(); }
});

for (const submittedMembers of [0, 1, 2]) {
  test(`#22 Rule 4 manual close with unsubmitted HOST and ${submittedMembers} submitted MEMBERs`, async ({ page, newTrustedContext }) => {
    const { code } = await createRoom(page);
    const members: BrowserContext[] = [];
    const memberPages: Page[] = [];
    try {
      for (let index = 0; index < submittedMembers; index++) {
        const memberContext = await newTrustedContext();
        members.push(memberContext);
        const member = await memberContext.newPage();
        memberPages.push(member);
        await join(member, code, `합성 참여자 ${index + 1}`);
        await submit(member, code, `금요일 저녁 온라인 합성 참여 조건 ${index + 1}`, 1);
        // Freeze latest revisions rather than an earlier saved version.
        if (index === 0) {
          await member.getByRole("button", { name: "내 조건 수정", exact: true }).click();
          await submit(member, code, "토요일 저녁 온라인 합성 수정 조건", 2);
        }
      }
      const before = snapshot(code);
      expect(before).toMatchObject({ participants: 1 + submittedMembers, hosts: 1, hostHeads: 0, heads: submittedMembers, batches: 0, runs: 0 });
      noAnalysis(before);
      const unsubmitted = await api<Problem>(page, `${roomPath(code)}/submission`);
      expect(unsubmitted.status).toBe(404);
      expect(unsubmitted.body.code).toBe("SUBMISSION_NOT_FOUND");

      const closePath = `${roomPath(code)}/close`;
      // Automatic policy remains unmet, so cancellation must preserve OPEN.
      const cancelledDialog = page.waitForEvent("dialog").then(async dialog => {
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message().includes(`${submittedMembers}명 제출`)).toBe(true);
        expect(dialog.message().includes("목표 4명")).toBe(true);
        await dialog.dismiss();
      });
      const warningPromise = page.waitForResponse(response => isApiResponse(response, closePath, "POST"));
      await page.getByRole("button", { name: "입력 마감하기", exact: true }).click();
      const warning = await warningPromise;
      expect(warning.status()).toBe(409);
      const warningBody = await warning.json() as Problem;
      expect(warningBody.code).toBe("EARLY_CLOSE_CONFIRMATION_REQUIRED");
      expect(warningBody.submitted_participants).toBe(submittedMembers);
      await cancelledDialog;
      await expect(page.getByRole("button", { name: "입력 마감하기", exact: true })).toBeEnabled();
      expect((await api<Room>(page, roomPath(code))).body.collection_status).toBe("COLLECTING");
      expect(snapshot(code)).toEqual(before);

      const acceptedDialog = page.waitForEvent("dialog").then(dialog => dialog.accept());
      const closedPromise = page.waitForResponse(response => isApiResponse(response, closePath, "POST") && response.status() === 200);
      await page.getByRole("button", { name: "입력 마감하기", exact: true }).click();
      await acceptedDialog;
      const closed = await (await closedPromise).json() as Room;
      expect(closed.collection_status).toBe("CLOSED");
      expect(closed.closure_reason).toBe("MANUAL");
      expect(!!closed.closed_at).toBe(true);
      expect(closed.public_status).toBe(submittedMembers < 2 ? "INSUFFICIENT_PARTICIPANTS" : "ANALYZING");
      if (submittedMembers < 2) await expect(page.getByRole("heading", { name: "조율에 필요한 인원이 부족해요", exact: true })).toBeVisible();

      const after = snapshot(code);
      expect(after.hostHeads).toBe(0);
      expect(after.heads).toBe(submittedMembers);
      expect(after.latestIds).toBe(before.latestIds);
      noAnalysis(after);
      if (submittedMembers < 2) expect(after).toMatchObject({ batches: 0, runs: 0, items: 0, outbox: 0 });
      else expect(after).toMatchObject({ batches: 1, runs: 1, queued: 1, items: 2, frozenLatest: true, outbox: 1 });

      // Repeat close is a no-op; first-time HOST and existing MEMBER writes
      // after closure cannot modify the frozen cohort or add another batch.
      const persistedClosed = await api<Room>(page, roomPath(code));
      expect(persistedClosed.status).toBe(200);
      expect(persistedClosed.body.collection_status).toBe("CLOSED");
      if (!closed.closed_at || !persistedClosed.body.closed_at) throw new Error("Closed room requires a closure timestamp");
      await recordTimestampBoundary("close", closed.closed_at, persistedClosed.body.closed_at);
      const repeated = await api<Room>(page, closePath, "POST", { confirm_early: true });
      expect(repeated.status).toBe(200);
      expect(repeated.body.closed_at === persistedClosed.body.closed_at).toBe(true);
      const lateHost = await api<Problem>(page, `${roomPath(code)}/submission`, "PUT", { raw_text: "일요일 온라인 합성 늦은 주최자 조건" });
      expect(lateHost.status).toBe(409);
      expect(lateHost.body.code).toBe("ROOM_CLOSED");
      if (memberPages.length) {
        const memberPage = memberPages[0];
        await expect(memberPage).toHaveURL(`${webOrigin}/rooms/${code}`);
        const lateMember = await api<Problem>(memberPage, `${roomPath(code)}/submission`, "PUT", { raw_text: "일요일 온라인 합성 늦은 수정" });
        expect(lateMember.status).toBe(409);
        expect(lateMember.body.code).toBe("ROOM_CLOSED");
      }
      expect(snapshot(code)).toEqual(after);
      await page.reload();
      const afterReload = await api<Room>(page, roomPath(code));
      expect(afterReload.body.public_status).toBe(closed.public_status);
      expect(afterReload.body.closed_at === persistedClosed.body.closed_at).toBe(true);
    } finally { for (const member of members) await member.close(); }
  });
}
