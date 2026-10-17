import { chromium, expect } from '@playwright/test';
import { randomBytes, randomUUID, createSign } from 'node:crypto';
import { readFile, realpath, writeFile, mkdir } from 'node:fs/promises';

// Deliberately fixed endpoints: this script cannot target a deployment or provider.
const WEB = 'http://localhost:5173';
const API = 'http://localhost:8080';
const OIDC = 'http://localhost:9091';
const fixtureOrigins = new Set([WEB, API, OIDC]);
const output = new URL('../docs/verification/issue-108-native.json', import.meta.url);
const checks = [];
const contexts = [];
const pages = [];
const sensitive = [];
let browser;
let currentCheck = 'initialization';
let currentAction = 'initialization';
const authResponses = { refreshSuccess: 0, refreshFailure: 0, callbackSuccess: 0, callbackFailure: 0 };
const writeResponses = { joins: [], reaccess: [], replacements: [], claims: [] };
let externalRequests = 0;
let blockedNonFixtureRequests = 0;
let status = 'FAIL';
let failedCheck;
let lastJoinProbe;
let joinDiagnostics;
const unique = randomBytes(8).toString('hex');
const name = '격리 동일 이름';
const plainRaw = `합성 무암호 조건 ${randomBytes(10).toString('hex')}`;
const protectedRaw = `합성 보호 조건 ${randomBytes(10).toString('hex')}`;
const replacementRaw = `합성 대체 조건 ${randomBytes(10).toString('hex')}`;
const memberRaw = `합성 회원 조건 ${randomBytes(10).toString('hex')}`;
const closedRaw = `합성 마감 조건 ${randomBytes(10).toString('hex')}`;
const password = randomBytes(24).toString('base64url');
const wrongPassword = randomBytes(24).toString('base64url');
sensitive.push(plainRaw, protectedRaw, replacementRaw, memberRaw, closedRaw, password, wrongPassword);

function requireSafe(condition) {
  if (!condition) throw new Error('assertion-failed');
}
async function check(id, action) {
  currentCheck = id;
  currentAction = 'assertions';
  console.log(JSON.stringify({ check: id, state: 'START' }));
  await action();
  checks.push(id);
}
function onlyFixture(url) {
  const target = new URL(url);
  return target.protocol === 'http:' && fixtureOrigins.has(target.origin);
}
async function isolatedContext() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  contexts.push(context);
  // This route is an allowlist, never an API response mock or credential injector.
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    if (!onlyFixture(target.href)) {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) externalRequests++;
      blockedNonFixtureRequests++;
      return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => {
    const target = new URL(socket.url());
    if (target.protocol === 'ws:' && target.hostname === 'localhost' && target.port === '5173') {
      socket.connectToServer();
    } else {
      if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) externalRequests++;
      blockedNonFixtureRequests++;
      socket.close();
    }
  });
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  const reads = { own: 0, replacementWrites: 0 };
  page.on('response', response => {
    const path = new URL(response.url()).pathname;
    if (path === '/api/auth/refresh') authResponses[response.status() < 400 ? 'refreshSuccess' : 'refreshFailure']++;
    if (/^\/api\/auth\/[^/]+\/callback$/.test(path)) authResponses[response.status() < 400 ? 'callbackSuccess' : 'callbackFailure']++;
    if (response.request().method() === 'POST' && /^\/api\/rooms\/[^/]+\/participants$/.test(path)) writeResponses.joins.push(response.status());
    if (response.request().method() === 'POST' && /^\/api\/rooms\/[^/]+\/guest-records\/reaccess$/.test(path)) writeResponses.reaccess.push(response.status());
    if (response.request().method() === 'PUT' && /^\/api\/rooms\/[^/]+\/guest-records\/[^/]+\/submission$/.test(path)) writeResponses.replacements.push(response.status());
    if (response.request().method() === 'POST' && /^\/api\/rooms\/[^/]+\/claim$/.test(path)) writeResponses.claims.push(response.status());
  });
  page.on('request', request => {
    const target = new URL(request.url());
    if (/^\/api\/rooms\/[^/]+\/submission$/.test(target.pathname) && request.method() === 'GET') reads.own++;
    if (/^\/api\/rooms\/[^/]+\/guest-records\/[^/]+\/submission$/.test(target.pathname) && request.method() === 'PUT') reads.replacementWrites++;
  });
  return { context, page, reads };
}
function responseWait(page, predicate, options) {
  // Install a rejection handler immediately, before any potentially failing click.
  return page.waitForResponse(predicate, options).catch(() => undefined);
}
async function login(page, provider, returnPath = '/create') {
  currentAction = 'login-page-navigation';
  await page.goto(`${WEB}${returnPath}`);
  const restored = responseWait(page, response => new URL(response.url()).pathname === '/api/auth/refresh' && response.status() === 200);
  currentAction = 'login-provider-click';
  await page.getByRole('link', { name: `${provider}로 로그인`, exact: true }).click();
  currentAction = 'login-web-return';
  await page.waitForURL(url => url.origin === WEB && !url.pathname.startsWith('/auth/'));
  currentAction = 'login-refresh-response';
  const session = await (await restored).json();
  requireSafe(typeof session.account?.id === 'string' && typeof session.accessToken === 'string');
  sensitive.push(session.accessToken);
  return session;
}
async function createRoom(page, suffix) {
  currentAction = 'create-page-navigation';
  await page.goto(`${WEB}/create`);
  currentAction = 'create-purpose-input';
  await page.getByLabel('모임 목적 / 이름').fill(`격리 재접근 ${unique} ${suffix}`);
  currentAction = 'create-next-action';
  await page.getByRole('button', { name: /다음 단계/ }).click();
  currentAction = 'create-submit-action';
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  currentAction = 'create-room-return';
  await page.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  await expect(page.getByRole('heading', { name: '모임이 만들어졌어요' })).toBeVisible();
  return new URL(page.url()).pathname;
}
function roomApi(path) {
  requireSafe(/^\/rooms\/[A-Za-z0-9_-]{22}$/.test(path));
  return `${API}/api${path}`;
}
async function joinGuest(device, roomPath, chosenPassword) {
  currentAction = 'guest-join-navigation';
  await device.page.goto(`${WEB}${roomPath}`);
  currentAction = 'guest-join-name-input';
  await device.page.getByLabel('이름', { exact: true }).fill(name);
  if (chosenPassword) await device.page.getByLabel('참여 암호 (선택)').fill(chosenPassword);
  const joined = responseWait(device.page, response => response.url().endsWith(`${roomPath}/participants`) && response.request().method() === 'POST');
  currentAction = 'guest-join-explicit-action';
  await device.page.getByRole('button', { name: '참여하기', exact: true }).click();
  currentAction = 'guest-join-response-status';
  const response = await joined;
  requireSafe(response.status() === 200 || response.status() === 201);
  const body = await response.json();
  currentAction = 'guest-join-record-identity';
  const participantId = body.viewer?.participant_id;
  lastJoinProbe = { page: device.page, participantId };
  requireSafe(typeof participantId === 'string' && /^[0-9a-f-]{36}$/i.test(participantId));
  // context_id is intentionally never treated as a record number or credential.
  currentAction = 'guest-join-record-number-display';
  await expect(device.page.getByText(participantId, { exact: false })).toBeVisible();
  currentAction = 'guest-join-own-editor';
  await expect(device.page.getByRole('textbox')).toBeVisible();
  return participantId;
}
async function submitOwn(page, raw) {
  const edit = page.getByRole('button', { name: '내 조건 수정', exact: true });
  if (await edit.count()) await edit.click();
  await page.getByRole('textbox').fill(raw);
  const saved = responseWait(page, response => /^\/api\/rooms\/[^/]+\/submission$/.test(new URL(response.url()).pathname) && response.request().method() === 'PUT');
  await page.getByRole('button', { name: /^(조건 제출하기|수정 내용 저장)$/ }).click();
  requireSafe((await saved).status() === 200);
  await expect(page.getByRole('heading', { name: '조건 제출을 완료했어요', exact: true })).toBeVisible();
}
async function selectRecord(page, roomPath, participantId) {
  await page.goto(`${WEB}${roomPath}`);
  const record = page.getByRole('option', { name: new RegExp(`${name}.*${participantId}`) });
  await expect(record).toHaveCount(1);
  await page.getByRole('combobox', { name: '다시 접근할 참여 기록' }).selectOption(participantId);
}
async function reaccess(page, roomPath, participantId, chosenPassword) {
  await selectRecord(page, roomPath, participantId);
  if (chosenPassword) await page.getByLabel('기록 암호 (선택)').fill(chosenPassword);
  const response = responseWait(page, result => result.url().endsWith(`${roomPath}/guest-records/reaccess`) && result.request().method() === 'POST');
  await page.getByRole('button', { name: '기록에 다시 접근', exact: true }).click();
  return response;
}
async function noSensitiveStorage(page) {
  const clean = await page.evaluate(values => {
    const entries = [...Object.values(localStorage), ...Object.values(sessionStorage)];
    return entries.every(value => values.every(secret => !value.includes(secret)));
  }, sensitive);
  requireSafe(clean);
}
async function request(context, url, options) {
  requireSafe(onlyFixture(url));
  return context.request.fetch(url, { ...options, maxRedirects: 0 });
}
async function signedAccess(accountId, displayName, expired) {
  const keyPath = process.env.ISSUE108_NATIVE_SIGNING_KEY_PATH;
  requireSafe(typeof keyPath === 'string');
  const resolved = await realpath(keyPath);
  requireSafe(resolved.startsWith('/tmp/'));
  const key = await readFile(resolved);
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'RS256', typ: 'JWT', kid: 'issue108-local' });
  const body = encode({ iss: API, aud: 'meetme-web', sub: accountId, name: displayName, iat: expired ? now - 1200 : now, exp: expired ? now - 600 : now + 300, jti: randomUUID() });
  const unsigned = `${head}.${body}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const token = `${unsigned}.${signer.sign(key).toString('base64url')}`;
  key.fill(0);
  sensitive.push(token);
  return token;
}

try {
  await check('loopback-oidc-probe-and-ephemeral-key-required', async () => {
    requireSafe(typeof process.env.ISSUE108_NATIVE_SIGNING_KEY_PATH === 'string');
    const probe = await fetch(`${API}/api/auth/google/start`, { redirect: 'manual' });
    requireSafe(probe.status >= 300 && probe.status < 400);
    const location = new URL(probe.headers.get('location') ?? 'https://invalid.test');
    requireSafe(location.origin === OIDC && location.pathname === '/google/authorize');
    const callback = new URL(location.searchParams.get('redirect_uri') ?? 'https://invalid.test');
    requireSafe(callback.origin === API);
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const host = await isolatedContext();
  let mainRoom;
  await check('real-google-login-and-host-room-creation', async () => {
    await login(host.page, 'Google');
    mainRoom = await createRoom(host.page, '수집');
  });
  const plain = await isolatedContext();
  let plainId;
  await check('name-only-join-explicit-unprotected-warning-and-record-number', async () => {
    await plain.page.goto(`${WEB}${mainRoom}`);
    await expect(plain.page.getByText(/수정.*보호/)).toBeVisible();
    await expect(plain.page.getByText(/원문.*조회/)).toBeVisible();
    await expect(plain.page.getByLabel('참여 암호 (선택)')).toHaveAttribute('type', 'password');
    plainId = await joinGuest(plain, mainRoom);
    await submitOwn(plain.page, plainRaw);
  });
  const protectedOwner = await isolatedContext();
  let protectedId;
  await check('password-join-allows-duplicate-name-with-distinct-record-number', async () => {
    protectedId = await joinGuest(protectedOwner, mainRoom, password);
    requireSafe(protectedId !== plainId);
    await submitOwn(protectedOwner.page, protectedRaw);
  });
  await check('same-device-valid-owner-session-retains-original-access', async () => {
    await plain.page.reload();
    await expect(plain.page.getByText(plainRaw, { exact: true })).toBeVisible();
    await protectedOwner.page.reload();
    await expect(protectedOwner.page.getByText(protectedRaw, { exact: true })).toBeVisible();
  });
  const recovered = await isolatedContext();
  await check('other-device-wrong-password-generic-error-without-original-read', async () => {
    const response = await reaccess(recovered.page, mainRoom, protectedId, wrongPassword);
    requireSafe(response.status() === 403);
    await expect(recovered.page.getByRole('alert')).toBeVisible();
    const alertText = await recovered.page.getByRole('alert').innerText();
    requireSafe(!/hash|stack|exception|password|participant_id|session_id/i.test(alertText));
    requireSafe(sensitive.every(value => !alertText.includes(value)));
    await expect(recovered.page.getByLabel('기록 암호 (선택)')).toHaveValue('');
    requireSafe(recovered.reads.own === 0);
  });
  await check('other-device-password-proof-restores-server-viewer-and-original', async () => {
    const response = await reaccess(recovered.page, mainRoom, protectedId, password);
    requireSafe(response.status() === 200);
    requireSafe((await response.json()).level === 'VERIFIED_GUEST');
    await expect(recovered.page.getByText(protectedRaw, { exact: true })).toBeVisible();
    requireSafe(recovered.reads.own > 0);
    await expect(recovered.page.getByRole('button', { name: '입력 마감하기', exact: true })).toHaveCount(0);
    await expect(recovered.page.getByLabel('기록 암호 (선택)')).toHaveCount(0);
  });
  const replacer = await isolatedContext();
  await check('other-device-no-password-blank-replacement-with-zero-original-gets', async () => {
    const response = await reaccess(replacer.page, mainRoom, plainId);
    requireSafe(response.status() === 200 && (await response.json()).level === 'REPLACE_ONLY');
    await expect(replacer.page.getByLabel('새 참여 조건')).toHaveValue('');
    requireSafe(replacer.reads.own === 0 && replacer.reads.replacementWrites === 0);
    await expect(replacer.page.getByText(plainRaw, { exact: true })).toHaveCount(0);
    await replacer.page.getByLabel('새 참여 조건').fill(replacementRaw);
    // Observe actual room polling rather than mocking a room response.
    await responseWait(replacer.page, result => result.url().endsWith(mainRoom) && result.request().method() === 'GET', { timeout: 15_000 });
    await expect(replacer.page.getByLabel('새 참여 조건')).toHaveValue(replacementRaw);
    requireSafe(replacer.reads.own === 0);
    const saved = responseWait(replacer.page, result => result.url().endsWith(`${mainRoom}/guest-records/${plainId}/submission`) && result.request().method() === 'PUT');
    await replacer.page.getByRole('button', { name: '기존 조건 대체하기', exact: true }).click();
    const saveResponse = await saved;
    requireSafe(saveResponse.status() === 200);
    requireSafe(JSON.stringify(await saveResponse.json()) === JSON.stringify({ replaced: true }));
    requireSafe(replacer.reads.own === 0 && replacer.reads.replacementWrites === 1);
    await expect(replacer.page.getByRole('button', { name: '입력 마감하기', exact: true })).toHaveCount(0);
  });
  await check('replacement-is-persisted-without-granting-replacer-read-access', async () => {
    await plain.page.reload();
    await expect(plain.page.getByText(replacementRaw, { exact: true })).toBeVisible();
    requireSafe(replacer.reads.own === 0);
  });
  const member = await isolatedContext();
  let memberSession;
  await check('real-kakao-member-join-without-name-or-password-inputs', async () => {
    memberSession = await login(member.page, 'Kakao', '/login');
    await member.page.goto(`${WEB}${mainRoom}`);
    await expect(member.page.getByLabel('이름', { exact: true })).toHaveCount(0);
    await expect(member.page.getByLabel(/암호/)).toHaveCount(0);
    const joined = responseWait(member.page, response => response.url().endsWith(`${mainRoom}/participants`) && response.request().method() === 'POST');
    await member.page.getByRole('button', { name: '계정으로 참여', exact: true }).click();
    const response = await joined;
    requireSafe(response.status() === 200 || response.status() === 201);
    requireSafe(JSON.stringify(response.request().postDataJSON()) === '{}');
    await submitOwn(member.page, memberRaw);
  });
  const conflict = await isolatedContext();
  await check('explicit-claim-conflict-preserves-existing-account-record', async () => {
    await joinGuest(conflict, mainRoom, password);
    await login(conflict.page, 'Kakao', '/login');
    await conflict.page.goto(`${WEB}${mainRoom}`);
    await expect(conflict.page.getByText(memberRaw, { exact: true })).toBeVisible();
    await conflict.page.getByText('이 브라우저의 이전 참여 연결', { exact: true }).click();
    const claimed = responseWait(conflict.page, result => result.url().endsWith(`${mainRoom}/claim`) && result.request().method() === 'POST');
    await conflict.page.getByRole('button', { name: '이 브라우저의 기존 참여 연결', exact: true }).click();
    const response = await claimed;
    requireSafe(response.status() === 409 && (await response.json()).code === 'PARTICIPANT_CONFLICT');
    await expect(conflict.page.getByRole('alert')).toBeVisible();
    await expect(conflict.page.getByText(memberRaw, { exact: true })).toBeVisible();
    await expect(conflict.page.getByRole('button', { name: '입력 마감하기', exact: true })).toHaveCount(0);
  });
  await check('expired-signed-bearer-rejected-despite-valid-guest-cookie', async () => {
    // A live sibling token proves this fixture key and claim set are accepted;
    // the expired request must fail because its lifetime has ended.
    const live = await signedAccess(memberSession.account.id, memberSession.account.displayName, false);
    currentAction = 'signed-live-token-control';
    const liveResponse = await request(plain.context, `${roomApi(mainRoom)}/submission`, { method: 'GET', headers: { Authorization: `Bearer ${live}` } });
    requireSafe(liveResponse.status() === 200 && (await liveResponse.json()).raw_text === memberRaw);
    const expired = await signedAccess(memberSession.account.id, memberSession.account.displayName, true);
    currentAction = 'signed-expired-token-rejection';
    const response = await request(plain.context, `${roomApi(mainRoom)}/submission`, { method: 'GET', headers: { Authorization: `Bearer ${expired}` } });
    requireSafe(response.status() === 401);
    const body = await response.text();
    requireSafe(sensitive.every(value => !body.includes(value)));
    currentAction = 'guest-owner-cookie-control';
    const stillOwner = await request(plain.context, `${roomApi(mainRoom)}/submission`, { method: 'GET' });
    requireSafe(stillOwner.status() === 200 && (await stillOwner.json()).raw_text === replacementRaw);
  });
  let closedRoom;
  let closedProtectedId;
  const closedOwner = await isolatedContext();
  await check('manual-close-with-one-submission-enters-insufficient-state-without-ai', async () => {
    closedRoom = await createRoom(host.page, '마감');
    closedProtectedId = await joinGuest(closedOwner, closedRoom, password);
    await submitOwn(closedOwner.page, closedRaw);
    await host.page.goto(`${WEB}${closedRoom}`);
    let explicitConfirmation = false;
    host.page.once('dialog', async dialog => { explicitConfirmation = true; await dialog.accept(); });
    const response = responseWait(host.page, result => result.url().endsWith(`${closedRoom}/close`) && result.request().method() === 'POST');
    // Register the success waiter before clicking: a confirmed retry can be fast.
    const confirmedResponse = responseWait(host.page, result => result.url().endsWith(`${closedRoom}/close`) && result.request().method() === 'POST' && result.status() === 200);
    currentAction = 'manual-close-explicit-action';
    await host.page.getByRole('button', { name: '입력 마감하기', exact: true }).click();
    const firstResponse = await response;
    requireSafe(Boolean(firstResponse));
    currentAction = 'manual-close-public-protocol';
    if (firstResponse.status() === 409) {
      requireSafe((await firstResponse.json()).code === 'EARLY_CLOSE_CONFIRMATION_REQUIRED');
      const finalResponse = await confirmedResponse;
      requireSafe(explicitConfirmation && finalResponse?.status() === 200);
    } else {
      requireSafe(firstResponse.status() === 200);
    }
    await expect(host.page.getByRole('heading', { name: '조율에 필요한 인원이 부족해요', exact: true })).toBeVisible();
  });
  const closedReader = await isolatedContext();
  await check('closed-room-blocks-new-joins-but-password-proof-keeps-lazy-original-read', async () => {
    await closedReader.page.goto(`${WEB}${closedRoom}`);
    await expect(closedReader.page.getByRole('button', { name: '참여하기', exact: true })).toHaveCount(0);
    const response = await reaccess(closedReader.page, closedRoom, closedProtectedId, password);
    requireSafe(response.status() === 200);
    await expect(closedReader.page.getByText('내 저장 입력 확인', { exact: true })).toBeVisible();
    requireSafe(closedReader.reads.own === 0);
    await closedReader.page.getByText('내 저장 입력 확인', { exact: true }).click();
    await expect(closedReader.page.getByText(closedRaw, { exact: true })).toBeVisible();
    requireSafe(closedReader.reads.own === 1);
    await expect(closedReader.page.getByRole('button', { name: '내 조건 수정', exact: true })).toHaveCount(0);
    await expect(closedReader.page.getByRole('button', { name: '기존 조건 대체하기', exact: true })).toHaveCount(0);
  });
  await check('no-raw-password-or-token-in-browser-web-storage', async () => {
    for (const page of pages) await noSensitiveStorage(page);
  });
  await check('no-external-or-nonfixture-browser-requests-and-no-api-mocks', async () => {
    requireSafe(externalRequests === 0 && blockedNonFixtureRequests === 0);
  });
  status = 'PASS';
} catch {
  // Never serialize Error, Playwright call logs, response bodies, URLs or inputs.
  failedCheck = currentCheck;
  if (lastJoinProbe?.page && !lastJoinProbe.page.isClosed()) {
    try {
      const fields = lastJoinProbe.page.getByRole('textbox');
      joinDiagnostics = {
        recordNumberMatches: typeof lastJoinProbe.participantId === 'string' ? await lastJoinProbe.page.getByText(lastJoinProbe.participantId, { exact: false }).count() : 0,
        textboxCount: await fields.count(),
        readonly: await fields.evaluateAll(nodes => nodes.map(node => Boolean(node.readOnly))),
        disabled: await fields.evaluateAll(nodes => nodes.map(node => Boolean(node.disabled))),
      };
    } catch { joinDiagnostics = { probeUnavailable: true }; }
  }
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  const evidence = {
    issue: 108,
    status,
    scope: 'actual-browser-to-isolated-Spring-PostgreSQL-Redis-loopback-OIDC',
    productionLogin: false,
    realCredentialsChanged: false,
    apiRouteMocks: 0,
    externalRequests,
    blockedNonFixtureRequests,
    checks,
    ...(failedCheck ? { failedCheck, failedAction: currentAction, authResponses, writeResponses, ...(joinDiagnostics ? { joinDiagnostics } : {}) } : {}),
    limitations: [
      'Confirmed-state and transactional write-race coverage belongs to the separate HTTP integration suite.',
      'The expired signed Bearer check uses a real local API request with a valid guest cookie; account-expiry UI behavior belongs to the independent unit suite.',
      'External request counts cover this browser and this script, not unrelated server processes.',
    ],
    at: new Date().toISOString(),
  };
  await mkdir(new URL('../docs/verification/', import.meta.url), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ status, passedChecks: checks.length, ...(failedCheck ? { failedCheck, failedAction: currentAction, authResponses, writeResponses, ...(joinDiagnostics ? { joinDiagnostics } : {}) } : {}), apiRouteMocks: 0, externalRequests }));
}
