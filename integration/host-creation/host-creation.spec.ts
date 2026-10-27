import { execFileSync } from "node:child_process";
import type { BrowserContext, Page, Response } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Room } from "../../src/api/types";
import type { StartSubmissionCheckBody, SubmissionCheckSnapshot } from "../../src/api/precheck";

// Current-contract independent oracle: PRD FR-001/002C/005/008, ADR-051/053,
// Rule4 and the published OpenAPI. Original PR24 bytes are archived by the parent.
// All API/OPTIONS/OIDC traffic is real. No route, fulfill or auth bypass is used.
function origin(name: string, protocol: string, hostname: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing isolated integration setting: ${name}`);
  const parsed = new URL(value);
  if (parsed.origin !== value || parsed.protocol !== protocol || parsed.hostname !== hostname) throw new Error("ISOLATED_INTEGRATION_ORIGIN_REQUIRED");
  return value;
}
const webOrigin = origin("HOST_INTEGRATION_WEB_ORIGIN", "https:", "localhost");
const apiOrigin = origin("HOST_INTEGRATION_API_ORIGIN", "https:", "localhost");
const controlOrigin = origin("HOST_INTEGRATION_CONTROL_ORIGIN", "http:", "127.0.0.1");
const deniedOrigin = "https://localhost:19445";
type Reply<T> = { status: number; body: T };
type Problem = { code: string; submitted_participants?: number };
type DatabaseState = {
  participants: number; hosts: number; accountHosts: number; hostHeads: number;
  heads: number; versions: number; maxRevision: number; latestIds: string;
  checkCandidates: number; checks: number; executions: number; operations: number;
  candidateIds: string; executionIds: string; maxCandidateRevision: number;
  batches: number; items: number; frozenLatest: boolean;
  runs: number; queued: number; outbox: number; recommendations: number;
  analysisAttempts: number; analysisInvocations: number;
};
const tokens = new WeakMap<BrowserContext, string>();

function selectDatabase(sql: string): string {
  const container = process.env.HOST_INTEGRATION_DB_CONTAINER;
  const user = process.env.HOST_INTEGRATION_DB_USER;
  const database = process.env.HOST_INTEGRATION_DB_NAME;
  if (!container || !user || !database) throw new Error("ISOLATED_DATABASE_METADATA_REQUIRED");
  return execFileSync("docker", ["exec", container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", database, "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// Counts and identity digests only: never SELECT raw_text, credentials, tokens,
// cookies, provider settings, or private outcome bodies from the fixture database.
function snapshot(code: string): DatabaseState {
  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) throw new Error("INVALID_SYNTHETIC_INVITE_CODE");
  const value = selectDatabase(`WITH room AS (SELECT id FROM meeting_rooms WHERE invite_code='${code}'),
    people AS (SELECT p.* FROM participants p JOIN room r ON p.room_id=r.id),
    heads AS (SELECT h.* FROM submission_heads h JOIN room r ON h.room_id=r.id),
    versions AS (SELECT v.* FROM submission_versions v JOIN heads h ON v.submission_id=h.id),
    source AS (SELECT c.* FROM precheck_candidates c JOIN room r ON c.room_id=r.id),
    checks AS (SELECT c.* FROM precheck_checks c JOIN source s ON c.candidate_id=s.id),
    executions AS (SELECT e.* FROM precheck_executions e JOIN checks c ON c.id=e.check_id),
    batches AS (SELECT b.* FROM submission_batches b JOIN room r ON b.room_id=r.id),
    items AS (SELECT i.* FROM submission_batch_items i JOIN batches b ON i.batch_id=b.id),
    runs AS (SELECT c.* FROM coordination_runs c JOIN room r ON c.room_id=r.id)
    SELECT json_build_object(
      'participants',(SELECT count(*) FROM people),
      'hosts',(SELECT count(*) FROM people WHERE role='HOST'),
      'accountHosts',(SELECT count(*) FROM people WHERE role='HOST' AND user_id IS NOT NULL),
      'hostHeads',(SELECT count(*) FROM heads h JOIN people p ON p.id=h.participant_id WHERE p.role='HOST'),
      'heads',(SELECT count(*) FROM heads),'versions',(SELECT count(*) FROM versions),
      'maxRevision',(SELECT coalesce(max(revision),0) FROM versions),
      'latestIds',(SELECT coalesce(md5(string_agg(latest_version_id::text,',' ORDER BY id)),'') FROM heads),
      'checkCandidates',(SELECT count(*) FROM source),'checks',(SELECT count(*) FROM checks),
      'executions',(SELECT count(*) FROM executions),
      'operations',(SELECT count(*) FROM precheck_operations o JOIN people p ON p.id=o.participant_id),
      'candidateIds',(SELECT coalesce(md5(string_agg(id::text||':'||revision::text,',' ORDER BY id)),'') FROM source),
      'executionIds',(SELECT coalesce(md5(string_agg(check_id::text||':'||generation::text,',' ORDER BY check_id,generation)),'') FROM executions),
      'maxCandidateRevision',(SELECT coalesce(max(revision),0) FROM source),
      'batches',(SELECT count(*) FROM batches),'items',(SELECT count(*) FROM items),
      'frozenLatest',NOT EXISTS(
        (SELECT submission_version_id FROM items EXCEPT SELECT latest_version_id FROM heads)
        UNION ALL(SELECT latest_version_id FROM heads EXCEPT SELECT submission_version_id FROM items)),
      'runs',(SELECT count(*) FROM runs),'queued',(SELECT count(*) FROM runs WHERE status='QUEUED'),
      'outbox',(SELECT count(*) FROM outbox_events e JOIN runs r ON e.aggregate_id=r.id),
      'recommendations',(SELECT count(*) FROM candidates c JOIN runs r ON c.coordination_run_id=r.id),
      'analysisAttempts',(SELECT count(*) FROM coordination_attempts a JOIN runs r ON a.coordination_run_id=r.id),
      'analysisInvocations',(SELECT count(*) FROM analysis_invocations a JOIN runs r ON a.coordination_run_id=r.id)) FROM room`);
  if (!value) throw new Error("SYNTHETIC_ROOM_NOT_PERSISTED");
  return JSON.parse(value) as DatabaseState;
}
const roomPath = (code: string) => `/api/rooms/${code}`;
const checkPath = (code: string) => `${roomPath(code)}/submission/checks`;
function responseFor(response: Response, path: string, method: string): boolean {
  return response.url() === `${apiOrigin}${path}` && response.request().method() === method;
}
async function api<T>(page: Page, path: string, method = "GET", body?: unknown): Promise<Reply<T>> {
  const bearer = tokens.get(page.context());
  return page.evaluate(async ({ origin, path, method, body, bearer }) => {
    const response = await fetch(`${origin}${path}`, { method, credentials: "include", headers: {
      Accept: "application/json, application/problem+json", "Accept-Language": "ko-KR",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }, { origin: apiOrigin, path, method, body, bearer });
}
async function control<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${controlOrigin}${path}`, { method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  if (response.status !== 200) throw new Error("ISOLATED_CONTROL_REQUEST_FAILED");
  return response.json() as Promise<T>;
}
async function own(page: Page, code: string): Promise<SubmissionCheckSnapshot> {
  const reply = await api<SubmissionCheckSnapshot>(page, `${checkPath(code)}/current`);
  expect(reply.status, "Own precheck uses the published current200 snapshot contract").toBe(200);
  return reply.body;
}
function noAnalysis(state: DatabaseState) {
  expect(state.analysisAttempts).toBe(0); expect(state.analysisInvocations).toBe(0); expect(state.recommendations).toBe(0);
}
function privateTextAbsent(value: unknown, texts: string[]) {
  const serialized = JSON.stringify(value);
  expect(texts.some(text => serialized.includes(text)), "Another viewer must never receive an owner's synthetic private input").toBe(false);
}
async function secretsAreMemoryOnly(page: Page) {
  const cookies = await page.context().cookies(apiOrigin);
  const values = [tokens.get(page.context()), ...cookies.filter(cookie => ["meetme_refresh", "meet_me_guest"].includes(cookie.name)).map(cookie => cookie.value)].filter((value): value is string => !!value);
  const exposed = await page.evaluate(values => {
    const visible = [document.cookie, location.href, JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), document.body.innerText];
    return values.some(value => visible.some(text => text.includes(value)));
  }, values);
  expect(exposed, "Bearer/proof/refresh values stay out of URL, DOM and Web Storage").toBe(false);
}
async function login(page: Page) {
  await page.goto(`${webOrigin}/create`);
  const refresh = page.waitForResponse(response => responseFor(response, "/api/auth/refresh", "POST") && response.status() === 200);
  await page.getByRole("link", { name: "Google로 로그인", exact: true }).click();
  const refreshed = await refresh;
  const body = await refreshed.json() as { accessToken: string; account: { id: string } };
  expect(typeof body.accessToken === "string" && body.accessToken.length > 0).toBe(true);
  tokens.set(page.context(), body.accessToken);
  await expect(page).toHaveURL(`${webOrigin}/create`);
  await expect(page.getByRole("button", { name: "로그아웃", exact: true })).toBeVisible();
  const cookie = (await page.context().cookies(`${apiOrigin}/api/auth`)).find(value => value.name === "meetme_refresh");
  expect(!!cookie, "Actual OAuth callback must issue the refresh cookie").toBe(true);
  if (!cookie) throw new Error("REFRESH_COOKIE_NOT_ISSUED");
  expect({ secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, path: cookie.path, domain: cookie.domain })
    .toEqual({ secure: true, httpOnly: true, sameSite: "Lax", path: "/api/auth", domain: "localhost" });
  await secretsAreMemoryOnly(page);
}
async function createRoom(page: Page): Promise<{ code: string; room: Room; response: Response }> {
  await login(page);
  await expect(page.getByLabel("주최자 이름", { exact: true })).toHaveCount(0);
  await page.getByLabel("모임 목적 / 이름", { exact: true }).fill("HTTPS 현재 계약 합성 모임");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByText(/내 시간·장소 조건은 방을 만든 뒤 입력/)).toBeVisible();
  await page.getByLabel("예상 참여 인원", { exact: true }).fill("4");
  const pending = page.waitForResponse(response => responseFor(response, "/api/rooms", "POST"));
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  const response = await pending; expect(response.status()).toBe(201);
  const room = await response.json() as Room;
  expect(/^[A-Za-z0-9_-]{22}$/.test(room.invite_code)).toBe(true);
  expect(room.viewer.joined).toBe(true); expect(room.viewer.role).toBe("HOST");
  expect(room.submission_protocol).toBe("PRE_SUBMIT_V1"); expect(room.collection_status).toBe("COLLECTING"); expect(room.expected_participants).toBe(4);
  expect(Object.hasOwn(response.request().postDataJSON(), "raw_text")).toBe(false);
  await expect(page).toHaveURL(`${webOrigin}/rooms/${room.invite_code}`);
  await expect(page.getByRole("textbox", { name: /시간·장소 조건/ })).toBeVisible();
  const initial = await own(page, room.invite_code);
  expect(initial.candidate).toBeNull(); expect(initial.accepted).toBeNull(); expect(initial.check).toBeNull(); expect(initial.submission_complete).toBe(false);
  expect(snapshot(room.invite_code)).toMatchObject({ participants: 1, hosts: 1, accountHosts: 1, hostHeads: 0, heads: 0, versions: 0, checkCandidates: 0, executions: 0, batches: 0, runs: 0 });
  return { code: room.invite_code, room, response };
}
async function submit(page: Page, code: string, raw: string): Promise<{ body: StartSubmissionCheckBody; pending: SubmissionCheckSnapshot }> {
  if (!await page.getByRole("textbox", { name: /시간·장소 조건/ }).count()) await page.getByRole("button", { name: "내 조건 수정", exact: true }).click();
  await page.getByRole("textbox", { name: /시간·장소 조건/ }).fill(raw);
  const pending = page.waitForResponse(response => responseFor(response, checkPath(code), "POST"));
  await page.getByRole("button", { name: /조건 제출하기|수정 내용 확인/ }).click();
  const response = await pending; expect(response.status()).toBe(202);
  const request = response.request().postDataJSON() as StartSubmissionCheckBody;
  expect(/^[0-9a-f-]{36}$/i.test(request.request_id)).toBe(true);
  expect(request.raw_text).toBe(raw);
  const stored = await own(page, code);
  expect(stored.candidate?.raw_text).toBe(raw); expect(stored.submission_complete).toBe(false);
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요", exact: true })).toHaveCount(0);
  return { body: request, pending: stored };
}
async function clear(page: Page, code: string, raw: string): Promise<SubmissionCheckSnapshot> {
  await control("/provider", { verdict: "CLEAR" });
  const result = await control<{ ran: boolean }>("/worker/run-one", {}); expect(result.ran).toBe(true);
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요", exact: true })).toBeVisible({ timeout: 12_000 });
  const accepted = await own(page, code);
  expect(accepted.check?.status).toBe("CLEAR"); expect(accepted.submission_complete).toBe(true); expect(accepted.accepted?.raw_text).toBe(raw); expect(accepted.accepted?.confirmation_source).toBe("PRECHECK");
  return accepted;
}
async function join(page: Page, code: string, name: string): Promise<Response> {
  await page.goto(`${webOrigin}/rooms/${code}`); await page.getByLabel("이름", { exact: true }).fill(name);
  const pending = page.waitForResponse(response => responseFor(response, `${roomPath(code)}/participants`, "POST"));
  await page.getByRole("button", { name: "참여하기", exact: true }).click(); const response = await pending;
  expect(response.status()).toBe(201); const room = await response.json() as Room; expect(room.viewer.role).toBe("MEMBER");
  await expect(page.getByRole("textbox", { name: /시간·장소 조건/ })).toBeVisible();
  return response;
}

test.beforeEach(async () => {
  const health = await control<{ fixture: string; production: boolean }>("/health");
  if (health.fixture !== "issue123-host-current-v1" || health.production !== false) throw new Error("CURRENT_HTTPS_FIXTURE_NOT_READY");
});

test("current account HOST creates/shares, defers input, restores refresh memory, and isolates real guest/CORS/TLS", async ({ page, context, newTrustedContext, newUntrustedContext }) => {
  test.setTimeout(120_000);
  const untrusted = await newUntrustedContext();
  try {
    const negative = await untrusted.newPage();
    const rejected = await negative.goto(webOrigin).then(() => false, error => error instanceof Error && /ERR_CERT_AUTHORITY_INVALID/.test(error.message));
    expect(rejected, "A fresh profile without the ephemeral CA must reject TLS").toBe(true);
  } finally { await untrusted.close(); }
  let creates = 0; let saves = 0;
  page.on("request", request => { if (request.url() === `${apiOrigin}/api/rooms` && request.method() === "POST") creates++; if (request.url().includes("/submission/checks") && request.method() === "POST") saves++; });
  const { code, room, response } = await createRoom(page);
  expect(creates).toBe(1); expect(saves).toBe(0);
  const headers = await response.allHeaders(); expect(headers["access-control-allow-origin"]).toBe(webOrigin); expect(headers["access-control-allow-credentials"]).toBe("true");
  await page.getByRole("button", { name: "초대 링크 복사", exact: true }).click();
  const feedback = page.getByRole("status").filter({ hasText: /링크를 복사했어요|자동으로 복사하지 못했어요/ }); await expect(feedback).toBeVisible();
  if ((await feedback.textContent())?.includes("자동으로 복사하지 못했어요")) await expect(page.getByLabel("직접 복사할 링크", { exact: true })).toHaveValue(`${webOrigin}/rooms/${code}`);
  else { await context.grantPermissions(["clipboard-read"], { origin: webOrigin }); expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${webOrigin}/rooms/${code}`); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(webOrigin); await page.goto(`${webOrigin}/rooms/${code}`);
  const refresh = page.waitForResponse(value => responseFor(value, "/api/auth/refresh", "POST") && value.status() === 200);
  const previousCookie = (await context.cookies(`${apiOrigin}/api/auth`)).find(value => value.name === "meetme_refresh");
  await page.reload(); const restored = await (await refresh).json() as { accessToken: string };
  expect(typeof restored.accessToken === "string" && restored.accessToken.length > 0).toBe(true); tokens.set(context, restored.accessToken);
  const returned = await api<Room>(page, roomPath(code)); expect(returned.status).toBe(200); expect(returned.body.viewer.role).toBe("HOST"); expect(returned.body.viewer.context_id).toBe(room.viewer.context_id);
  const rotatedCookie = (await context.cookies(`${apiOrigin}/api/auth`)).find(value => value.name === "meetme_refresh");
  expect(!!previousCookie && !!rotatedCookie && previousCookie.value !== rotatedCookie.value, "Reload restores memory through actual refresh rotation").toBe(true);
  expect(creates).toBe(1); expect(saves).toBe(0); expect(snapshot(code).heads).toBe(0); await secretsAreMemoryOnly(page);
  const firstRaw = "수요일 18~20시 온라인 합성 HOST 첫 입력";
  const { body } = await submit(page, code, firstRaw);
  const beforeReplay = snapshot(code); expect(beforeReplay).toMatchObject({ heads: 0, versions: 0, checkCandidates: 1, checks: 1, executions: 1, operations: 1, maxCandidateRevision: 1 });
  const replay = await api<SubmissionCheckSnapshot>(page, checkPath(code), "POST", body); expect(replay.status).toBe(202);
  expect(replay.body.check?.id).toBe((await own(page, code)).check?.id); expect(replay.body.candidate?.revision).toBe(1); expect(replay.body.submission_complete).toBe(false); expect(snapshot(code)).toEqual(beforeReplay);
  await clear(page, code, firstRaw); const afterClear = snapshot(code); expect(afterClear).toMatchObject({ hostHeads: 1, heads: 1, versions: 1, executions: 1 });
  const acceptedReplay = await api<SubmissionCheckSnapshot>(page, checkPath(code), "POST", body); expect(acceptedReplay.status).toBe(202); expect(acceptedReplay.body.submission_complete).toBe(true); expect(acceptedReplay.body.accepted?.raw_text).toBe(firstRaw); expect(snapshot(code)).toEqual(afterClear);
  const revisedRaw = "목요일 19~21시 온라인 합성 HOST 수정 입력";
  await submit(page, code, revisedRaw); expect(snapshot(code).heads).toBe(1); expect(snapshot(code).versions).toBe(1); await clear(page, code, revisedRaw);
  const beforeReload = snapshot(code); await page.reload();
  await expect(page.getByText(revisedRaw, { exact: true })).toBeVisible(); expect(snapshot(code)).toEqual(beforeReload);
  // A fresh guest cannot use the HOST account identity or read its private state.
  const stranger = await newTrustedContext();
  try {
    const other = await stranger.newPage(); await other.goto(`${webOrigin}/rooms/${code}`);
    const anonymous = await api<Problem>(other, `${checkPath(code)}/current`); expect(anonymous.status).toBe(401); expect(anonymous.body.code).toBe("GUEST_SESSION_REQUIRED"); privateTextAbsent(anonymous.body, [firstRaw, revisedRaw]);
    const joined = await join(other, code, "합성 HOST와 같은 표시 이름");
    const guest = (await stranger.cookies(`${apiOrigin}/api/rooms`)).find(value => value.name === "meet_me_guest");
    expect(!!guest).toBe(true); if (!guest) throw new Error("ACTUAL_GUEST_PROOF_NOT_ISSUED");
    expect({ secure: guest.secure, httpOnly: guest.httpOnly, sameSite: guest.sameSite, path: guest.path, domain: guest.domain }).toEqual({ secure: true, httpOnly: true, sameSite: "Lax", path: "/api", domain: "localhost" });
    const cookieHeader = (await joined.headersArray()).find(value => value.name.toLowerCase() === "set-cookie" && value.value.startsWith("meet_me_guest="))?.value ?? "";
    expect(/;\s*domain=/i.test(cookieHeader)).toBe(false); expect(/;\s*max-age=2592000(?:;|$)/i.test(cookieHeader)).toBe(true);
    const ownOther = await own(other, code); expect(ownOther.candidate).toBeNull(); expect(ownOther.accepted).toBeNull(); privateTextAbsent(ownOther, [firstRaw, revisedRaw]);
    const visibleRoom = await api<Room>(other, roomPath(code)); expect(visibleRoom.body.viewer.role).toBe("MEMBER"); privateTextAbsent(visibleRoom.body, [firstRaw, revisedRaw]);
    const beforeDenied = snapshot(code); const denied = await api<Problem>(other, `${roomPath(code)}/close`, "POST", { confirm_early: true }); expect(denied.status).toBe(401); expect(denied.body.code).toBe("ACCOUNT_REQUIRED"); expect(snapshot(code)).toEqual(beforeDenied);
    await expect(other.locator("body")).not.toContainText(revisedRaw); await secretsAreMemoryOnly(other);
    await other.goto(deniedOrigin); const network = await stranger.newCDPSession(other); await network.send("Network.enable");
    let preflight: { status: number; allowOrigin?: string } | null = null;
    network.on("Network.responseReceived", event => {
      if (event.type !== "Preflight" || event.response.url !== `${apiOrigin}${checkPath(code)}`) return;
      preflight = { status: event.response.status, allowOrigin: Object.entries(event.response.headers as Record<string, string>).find(([name]) => name.toLowerCase() === "access-control-allow-origin")?.[1] };
    });
    try {
      const blocked = await other.evaluate(async ({ url }) => { try { await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: 0, raw_text: "비허용 Origin 합성 입력" }) }); return false; } catch (error) { return error instanceof TypeError; } }, { url: `${apiOrigin}${checkPath(code)}` });
      expect(blocked).toBe(true); await expect.poll(() => preflight !== null, { message: "Observe actual OPTIONS, never a routed synthetic preflight" }).toBe(true);
      const observed = preflight as { status: number; allowOrigin?: string } | null; if (!observed) throw new Error("ACTUAL_OPTIONS_NOT_OBSERVED");
      expect(observed.status).toBe(403); expect(observed.allowOrigin === deniedOrigin || observed.allowOrigin === "*").toBe(false);
      expect(snapshot(code)).toEqual(beforeDenied);
    } finally { await network.detach(); }
  } finally { await stranger.close(); }
  noAnalysis(snapshot(code));
});

for (const acceptedMembers of [0, 1, 2]) {
  test(`current Rule4 closes with unsubmitted account HOST and ${acceptedMembers} accepted CLEAR MEMBERs`, async ({ page, newTrustedContext }) => {
    test.setTimeout(120_000);
    const { code } = await createRoom(page); const members: BrowserContext[] = []; const memberPages: Page[] = [];
    try {
      for (let index = 0; index < acceptedMembers; index++) {
        const context = await newTrustedContext(); members.push(context); const member = await context.newPage(); memberPages.push(member);
        await join(member, code, `합성 참여자 ${index + 1}`);
        const raw = `금요일 18~20시 온라인 합성 MEMBER ${index + 1}`;
        await submit(member, code, raw); expect(snapshot(code).heads).toBe(index); await clear(member, code, raw);
        if (index === 0) { const revision = "토요일 18~20시 온라인 합성 최신 확인 완료본"; await submit(member, code, revision); expect(snapshot(code).heads).toBe(1); await clear(member, code, revision); }
      }
      // A pending edit must not replace the last accepted version frozen below.
      if (acceptedMembers === 2) await submit(memberPages[0], code, "일요일 18~20시 아직 미확인인 합성 수정본");
      const before = snapshot(code); expect(before).toMatchObject({ participants: 1 + acceptedMembers, hosts: 1, accountHosts: 1, hostHeads: 0, heads: acceptedMembers, batches: 0, runs: 0 }); noAnalysis(before);
      const hostOwn = await own(page, code); expect(hostOwn.candidate).toBeNull(); expect(hostOwn.accepted).toBeNull(); expect(hostOwn.submission_complete).toBe(false);
      const closePath = `${roomPath(code)}/close`;
      const cancelled = page.waitForEvent("dialog").then(async dialog => { expect(dialog.type()).toBe("confirm"); expect(dialog.message().includes("확인 완료되지 않은 입력")).toBe(true); expect(dialog.message().includes("이번 결과에 포함되지")).toBe(true); await dialog.dismiss(); });
      const warningPromise = page.waitForResponse(value => responseFor(value, closePath, "POST"));
      await page.getByRole("button", { name: "입력 마감하기", exact: true }).click(); const warning = await warningPromise;
      expect(warning.status()).toBe(409); const problem = await warning.json() as Problem; expect(problem.code).toBe("EARLY_CLOSE_CONFIRMATION_REQUIRED"); expect(problem.submitted_participants).toBe(acceptedMembers); await cancelled;
      await expect(page.getByRole("button", { name: "입력 마감하기", exact: true })).toBeEnabled(); expect((await api<Room>(page, roomPath(code))).body.collection_status).toBe("COLLECTING"); expect(snapshot(code)).toEqual(before);
      const confirmed = page.waitForEvent("dialog").then(dialog => dialog.accept());
      const closedPromise = page.waitForResponse(value => responseFor(value, closePath, "POST") && value.status() === 200);
      await page.getByRole("button", { name: "입력 마감하기", exact: true }).click(); await confirmed;
      const closed = await (await closedPromise).json() as Room;
      expect(closed.collection_status).toBe("CLOSED"); expect(closed.closure_reason).toBe("MANUAL"); expect(!!closed.closed_at).toBe(true); expect(closed.public_status).toBe(acceptedMembers < 2 ? "INSUFFICIENT_PARTICIPANTS" : "ANALYZING");
      const after = snapshot(code); expect(after.heads).toBe(acceptedMembers); expect(after.hostHeads).toBe(0); expect(after.latestIds).toBe(before.latestIds); noAnalysis(after);
      if (acceptedMembers < 2) { expect(after).toMatchObject({ batches: 0, items: 0, runs: 0, outbox: 0 }); await expect(page.getByRole("heading", { name: "조율에 필요한 인원이 부족해요", exact: true })).toBeVisible(); }
      else expect(after).toMatchObject({ batches: 1, items: 2, runs: 1, queued: 1, outbox: 1, frozenLatest: true });
      const persisted = await api<Room>(page, roomPath(code)); const repeated = await api<Room>(page, closePath, "POST", { confirm_early: true });
      expect(repeated.status).toBe(200); expect(repeated.body.closed_at).toBe(persisted.body.closed_at);
      const lateHost = await api<Problem>(page, checkPath(code), "POST", { request_id: crypto.randomUUID(), expected_revision: 0, raw_text: "마감 뒤 HOST 합성 입력" });
      expect(lateHost.status).toBe(409); expect(lateHost.body.code).toBe("ROOM_CLOSED");
      if (memberPages.length) {
        const last = await own(memberPages[0], code); const lateMember = await api<Problem>(memberPages[0], checkPath(code), "POST", { request_id: crypto.randomUUID(), expected_revision: last.candidate?.revision, raw_text: "마감 뒤 MEMBER 합성 입력" });
        expect(lateMember.status).toBe(409); expect(lateMember.body.code).toBe("ROOM_CLOSED");
      }
      expect(snapshot(code)).toEqual(after); await page.reload(); const afterReload = await api<Room>(page, roomPath(code)); expect(afterReload.body.public_status).toBe(closed.public_status); expect(afterReload.body.closed_at).toBe(persisted.body.closed_at);
      if (acceptedMembers === 2) {
        const beforeLateWorker = snapshot(code); await control("/worker/run-one", {}); const afterLateWorker = snapshot(code);
        expect(afterLateWorker.heads).toBe(beforeLateWorker.heads); expect(afterLateWorker.versions).toBe(beforeLateWorker.versions); expect(afterLateWorker.latestIds).toBe(beforeLateWorker.latestIds); expect(afterLateWorker.items).toBe(2); expect(afterLateWorker.frozenLatest).toBe(true);
      }
    } finally { for (const member of members) await member.close(); }
  });
}
