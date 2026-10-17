import { chromium, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Independent native oracle. This file never fulfills/routes a synthetic API
// response. Only the separate loopback test harness controls the provider/worker.
const api = process.env.MEETME_PRECHECK_NATIVE_API ?? 'http://localhost:18920';
const web = process.env.MEETME_PRECHECK_NATIVE_WEB ?? 'http://localhost:18921';
const control = process.env.MEETME_PRECHECK_NATIVE_CONTROL ?? 'http://127.0.0.1:18922';
const evidencePath = 'docs/verification/issue-107-native-browser.json';
const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
for (const address of [api, web, control]) {
  const parsed = new URL(address);
  if (!loopback(parsed.hostname) || parsed.protocol !== 'http:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('ISOLATED_LOOPBACK_REQUIRED');
}
const checks = []; const contexts = []; const scenarioContexts = []; const responseWork = []; const requests = [];
const tokens = new Set(); const accessByContext = new Map();
let browser; let host; let isolatedFixture = false; let stage = 'fixture-health'; let action = 'probe'; let externalRequests = 0;
let runtimeManifestHash = null; let nativeArtifacts = null;
const failures = [];
const sourceFiles = ['src/api/client.ts', 'src/api/precheck.ts', 'src/api/types.ts', 'src/pages/RoomPage.tsx', 'src/components/SubmissionCheckPanel.tsx', 'src/components/GuestParticipation.tsx', 'src/components/GuestAccessPanel.tsx'];
const hashes = async files => Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const sourceBefore = await hashes(sourceFiles);
const runtimeManifestPath = process.env.MEETME_PRECHECK_NATIVE_MANIFEST ?? '/tmp/issue107-native-runtime-manifest.json';
const nativeDist = process.env.MEETME_PRECHECK_NATIVE_DIST ?? '/tmp/meetme-precheck-native-dist';
async function artifactFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? artifactFiles(join(directory, entry.name)) : [join(directory, entry.name)]))).flat().sort();
}

async function command(path, body = {}) {
  const response = await fetch(`${control}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  expect(response.status, `test control ${path}`).toBe(200); return response.json();
}
async function state() { const response = await fetch(`${control}/state`, { signal: AbortSignal.timeout(10_000) }); expect(response.status).toBe(200); return response.json(); }
async function context(scenario = true) {
  const ctx = await browser.newContext({ locale: 'ko-KR' }); contexts.push(ctx); if (scenario) scenarioContexts.push(ctx);
  await ctx.route('**/*', route => {
    if (!loopback(new URL(route.request().url()).hostname)) { externalRequests++; return route.abort(); }
    return route.continue();
  });
  ctx.on('request', request => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/')) requests.push({ context: ctx, method: request.method(), path: url.pathname }); });
  ctx.on('response', response => {
    responseWork.push((async () => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/auth/refresh' && response.ok()) { const body = await response.json(); if (typeof body.accessToken === 'string') { tokens.add(body.accessToken); accessByContext.set(ctx, body.accessToken); } }
      if (path.includes('/submission/checks') && !/\bno-store\b/i.test(response.headers()['cache-control'] ?? '')) failures.push('PRIVATE_CHECK_RESPONSE_WITHOUT_NO_STORE');
    })().catch(() => { failures.push('RESPONSE_OBSERVATION_FAILED'); }));
  });
  return ctx;
}
async function real(ctx, path, { method = 'GET', body, bearer } = {}) {
  const response = await ctx.request.fetch(`${api}${path}`, { method, headers: { Origin: web, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, ...(body === undefined ? {} : { data: body }) });
  return response;
}
const privatePath = code => `/api/rooms/${code}/submission/checks`;
async function current(ctx, code, bearer) { const response = await real(ctx, `${privatePath(code)}/current`, { bearer }); expect(response.status(), 'actual own check GET').toBe(200); return response.json(); }
async function login(page) {
  await page.goto(`${web}/login`); await page.getByRole('link', { name: 'Google로 로그인', exact: true }).click();
  await page.waitForURL(url => url.origin === web && !url.pathname.startsWith('/auth/'), { timeout: 20_000 });
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  await expect.poll(() => accessByContext.has(page.context()), { timeout: 10_000 }).toBe(true);
}
async function reset(scenario, extra = {}) {
  await Promise.all(responseWork);
  for (const ctx of scenarioContexts.splice(0)) await ctx.close();
  return command('/reset', { scenario, manual_only: true, ...extra });
}
async function guest(code, name, password = 'synthetic-native-password') {
  const ctx = await context(); const page = await ctx.newPage(); await page.goto(`${web}/rooms/${code}`);
  await page.getByLabel('이름', { exact: true }).fill(name);
  if (password !== null) await page.getByLabel('참여 암호 (선택)').fill(password);
  const joined = page.waitForResponse(response => new URL(response.url()).pathname === `/api/rooms/${code}/participants` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '참여하기', exact: true }).click(); expect((await joined).status()).toBe(201);
  await expect(page.getByRole('textbox', { name: /시간·장소 조건/ })).toBeVisible();
  return { ctx, page };
}
async function submit(page, code, raw) {
  if (!await page.getByRole('textbox', { name: /시간·장소 조건/ }).count()) await page.getByRole('button', { name: '내 조건 수정', exact: true }).click();
  await page.getByRole('textbox', { name: /시간·장소 조건/ }).fill(raw);
  const posted = page.waitForResponse(response => new URL(response.url()).pathname === privatePath(code) && response.request().method() === 'POST');
  await page.getByRole('button', { name: /조건 제출하기|수정 내용 확인|수정 내용 저장/ }).click();
  expect((await posted).status(), 'actual save+enqueue').toBe(202);
}
async function provider(verdict, extra = {}) { return command('/provider', { verdict, ...extra }); }
const runOne = () => command('/worker/run-one');
async function clear(page, code) { await provider('CLEAR'); expect((await runOne()).ran).toBe(true); await expect(page.getByRole('heading', { name: '조건 제출을 완료했어요', exact: true })).toBeVisible({ timeout: 12_000 }); return current(page.context(), code); }
async function close(code) { const response = await real(host, `/api/rooms/${code}/close`, { method: 'POST', bearer: accessByContext.get(host), body: { confirm_early: true } }); expect(response.status(), 'actual HOST close').toBe(200); return response.json(); }
async function storageBoundary(page, privateTexts = []) {
  await Promise.all(responseWork); const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const body = await page.locator('body').innerText();
  for (const secret of tokens) { expect(storage.includes(secret)).toBe(false); expect(body.includes(secret)).toBe(false); expect(page.url().includes(secret)).toBe(false); }
  for (const raw of privateTexts) { expect(storage.includes(raw)).toBe(false); expect(page.url().includes(raw)).toBe(false); }
}
async function markCheck(check) { checks.push(check); console.log(JSON.stringify({ status: 'CHECK_PASS', check })); }
const choices = raw => ({ question: '오전과 오후 중 어느 시간인가요?', source_excerpt: '7~8시', options: [{ id: 'AM', text: '오전', proposed_text: raw.replace('7~8시', '오전 7~8시') }, { id: 'PM', text: '오후', proposed_text: raw.replace('7~8시', '오후 7~8시') }] });

try {
  action = 'health-contract';
  const healthResponse = await fetch(`${control}/health`, { signal: AbortSignal.timeout(10_000) }); expect(healthResponse.status).toBe(200);
  const health = await healthResponse.json(); expect(health.fixture).toBe('issue107-isolated-native-v1'); expect(health.production).toBe(false); expect(health.api_origin).toBe(api); expect(health.web_origin).toBe(web);
  isolatedFixture = true;
  runtimeManifestHash = createHash('sha256').update(await readFile(runtimeManifestPath)).digest('hex');
  nativeArtifacts = await hashes(await artifactFiles(nativeDist));
  action = 'oidc-redirect-probe';
  const oauthProbe = await fetch(`${api}/api/auth/google/start`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  expect(loopback(new URL(oauthProbe.headers.get('location') ?? 'https://invalid.test').hostname)).toBe(true);
  action = 'launch-browser';
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium' });
  action = 'login-host'; host = await context(false); await login(await host.newPage());

  stage = 'save-choice-direct-clear'; action = 'seed-and-join';
  const room = await reset(stage); const owner = await guest(room.invite_code, 'native-owner');
  const raw = '내일 7~8시 가능, 온라인만 가능';
  action = 'save-before-worker'; await submit(owner.page, room.invite_code, raw);
  let saved = await current(owner.ctx, room.invite_code); expect(saved.candidate.raw_text).toBe(raw); expect(saved.accepted).toBeNull(); expect(saved.submission_complete).toBe(false);
  const sourceReference = saved.candidate.interpretation_reference_at;
  expect((await state()).provider_calls).toBe(0); await expect(owner.page.getByRole('heading', { name: '조건 제출을 완료했어요', exact: true })).toHaveCount(0);
  await expect(owner.page.getByText(/확인 중|확인하고/)).toBeVisible(); await markCheck('N01-real-POST202-durable-candidate-pending-without-false-completion');
  action = 'choice-and-explicit-confirm'; await provider('NEEDS_CHOICE', choices(raw)); expect((await runOne()).ran).toBe(true);
  await expect(owner.page.getByText('오전과 오후 중 어느 시간인가요?', { exact: true })).toBeVisible({ timeout: 12_000 });
  const answerCount = () => requests.filter(request => request.context === owner.ctx && request.method === 'POST' && request.path.endsWith('/answer')).length;
  const beforeChoice = answerCount(); await owner.page.getByRole('button', { name: /오전/ }).click();
  await expect(owner.page.getByText('내일 오전 7~8시 가능, 온라인만 가능', { exact: true })).toBeVisible(); expect(answerCount()).toBe(beforeChoice);
  const answerResponse = owner.page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/answer') && response.request().method() === 'POST');
  await owner.page.getByRole('button', { name: /선택한 내용으로 확인|선택 확정|선택한 내용.*확인/ }).click(); expect((await answerResponse).status()).toBe(202);
  saved = await current(owner.ctx, room.invite_code); expect(saved.submission_complete).toBe(false); expect(saved.candidate.raw_text).toBe('내일 오전 7~8시 가능, 온라인만 가능');
  saved = await clear(owner.page, room.invite_code); expect(saved.submission_complete).toBe(true); expect(saved.accepted.raw_text).toBe(saved.candidate.raw_text); expect(saved.accepted.confirmation_source).toBe('PRECHECK'); expect(saved.accepted.interpretation_reference_at).toBe(sourceReference);
  await markCheck('N02-real-question-explicit-full-choice-recheck-CLEAR');
  action = 'direct-edit'; const ambiguousEdit = '토요일 7~8시 온라인만 가능'; await submit(owner.page, room.invite_code, ambiguousEdit);
  await provider('NEEDS_CHOICE', choices(ambiguousEdit)); await runOne(); await owner.page.getByRole('button', { name: '직접 수정', exact: true }).click();
  const direct = '토요일 오후 7시부터 8시까지 온라인만 가능'; await owner.page.getByRole('textbox', { name: /시간·장소 조건|직접 수정/ }).fill(direct);
  const directResponse = owner.page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/answer') && response.request().method() === 'POST');
  await owner.page.getByRole('button', { name: '수정한 내용 확인', exact: true }).click(); expect((await directResponse).status()).toBe(202);
  saved = await clear(owner.page, room.invite_code); expect(saved.accepted.raw_text).toBe(direct); await markCheck('N03-real-direct-full-input-recheck-CLEAR');
  action = 'broad-and-reload'; const broad = '주말 아무 때나 가능'; await submit(owner.page, room.invite_code, broad); saved = await clear(owner.page, room.invite_code); expect(saved.accepted.raw_text).toBe(broad);
  const postsBeforeReload = requests.filter(request => request.context === owner.ctx && request.method === 'POST' && request.path.startsWith(privatePath(room.invite_code))).length;
  const callsBeforeReload = (await state()).provider_calls; await owner.page.reload(); await expect(owner.page.getByText(broad, { exact: true })).toBeVisible();
  expect(requests.filter(request => request.context === owner.ctx && request.method === 'POST' && request.path.startsWith(privatePath(room.invite_code))).length).toBe(postsBeforeReload);
  expect((await state()).provider_calls).toBe(callsBeforeReload); await storageBoundary(owner.page, [raw, direct, broad]); await markCheck('N04-broad-intent-preserved-given-synthetic-CLEAR');
  action = 'two-tab-CAS-and-explicit-replay'; const base = await current(owner.ctx, room.invite_code);
  const secondTab = await owner.ctx.newPage(); await secondTab.goto(`${web}/rooms/${room.invite_code}`); await expect(secondTab.getByText(broad, { exact: true })).toBeVisible();
  const tabs = [owner.page, secondTab]; const tabInputs = ['첫 탭 원문', '둘째 탭 원문'];
  for (const [index, tab] of tabs.entries()) { await tab.getByRole('button', { name: '내 조건 수정', exact: true }).click(); await tab.getByRole('textbox', { name: /시간·장소 조건/ }).fill(tabInputs[index]); }
  const arrivals = tabs.map(tab => tab.waitForResponse(response => new URL(response.url()).pathname === privatePath(room.invite_code) && response.request().method() === 'POST'));
  await Promise.all(tabs.map(tab => tab.getByRole('button', { name: /수정 내용 확인|수정 내용 저장/ }).click()));
  const concurrent = await Promise.all(arrivals); expect(concurrent.map(response => response.status()).sort()).toEqual([202, 409]);
  const commands = concurrent.map(response => response.request().postDataJSON()); expect(commands.map(body => body.expected_revision)).toEqual([base.candidate.revision, base.candidate.revision]);
  const winner = concurrent.findIndex(response => response.status() === 202); const loser = 1 - winner;
  await expect(tabs[loser].getByRole('alert')).toBeVisible(); await expect(tabs[loser].getByRole('textbox', { name: /시간·장소 조건/ })).toHaveValue(tabInputs[loser]);
  const replay = await real(owner.ctx, privatePath(room.invite_code), { method: 'POST', body: commands[winner] }); expect(replay.status()).toBe(202);
  const afterReplay = await current(owner.ctx, room.invite_code); expect(afterReplay.candidate.revision).toBe(base.candidate.revision + 1); expect(afterReplay.candidate.raw_text).toBe(tabInputs[winner]); expect((await state()).provider_calls).toBe(callsBeforeReload);
  await markCheck('N11-real-reload-read-only-concurrent-CAS-one-winner-explicit-idempotency-replay');

  for (const closure of ['manual', 'deadline']) {
    stage = `pending-${closure}-closure`; action = 'barrier'; const seeded = await reset(stage); const pending = await guest(seeded.invite_code, `pending-${closure}`);
    await submit(pending.page, seeded.invite_code, raw); await provider('CLEAR', { barrier: true }); const running = runOne(); running.catch(() => undefined);
    await expect.poll(async () => (await state()).in_flight, { timeout: 10_000 }).toBe(1);
    action = 'close-before-clear';
    if (closure === 'manual') await close(seeded.invite_code);
    else {
      await command('/room/deadline', { seconds: 0 });
      const rejected = await real(pending.ctx, privatePath(seeded.invite_code), { method: 'POST', body: { request_id: randomUUID(), expected_revision: 1, raw_text: raw } });
      expect(rejected.status()).toBe(409);
      // Execute the actual periodic deadline service once. Passing the deadline
      // rejects writes immediately; the physical room closes on its scheduler tick.
      await command('/room/run-deadline-closure');
    }
    await command('/provider/release'); await running;
    const excluded = await current(pending.ctx, seeded.invite_code);
    console.log(JSON.stringify({ status: 'DIAGNOSTIC', closure, collection: excluded.room.collection_status, check: excluded.check?.status, accepted: excluded.accepted !== null, complete: excluded.submission_complete, applied: excluded.applied_to_result }));
    expect(excluded.room.collection_status).toBe('CLOSED'); expect(excluded.accepted).toBeNull(); expect(excluded.submission_complete).toBe(false); expect(excluded.applied_to_result).toBe(false);
    expect((await state()).frozen_synthetic_texts).toEqual([]); await pending.page.reload(); await expect(pending.page.getByText(/이번 결과.*반영되지/)).toBeVisible();
    await markCheck(`N05-${closure}-real-closure-does-not-wait-for-provider-late-CLEAR-not-accepted`);
  }

  stage = 'accepted-freeze-and-real-proof'; action = 'two-accepted';
  const frozenRoom = await reset(stage); const first = await guest(frozenRoom.invite_code, 'native-first'); const second = await guest(frozenRoom.invite_code, 'native-second');
  const oldFirst = '첫 참여자 마지막 확인 완료본'; const oldSecond = '두번째 참여자 마지막 확인 완료본';
  await submit(first.page, frozenRoom.invite_code, oldFirst); await clear(first.page, frozenRoom.invite_code); await submit(second.page, frozenRoom.invite_code, oldSecond); await clear(second.page, frozenRoom.invite_code);
  const pendingEdit = '마감 때 아직 확인중인 새 수정'; await submit(first.page, frozenRoom.invite_code, pendingEdit); const third = await guest(frozenRoom.invite_code, 'native-third'); await submit(third.page, frozenRoom.invite_code, '최초 미확인 조건');
  await close(frozenRoom.invite_code); expect((await state()).frozen_synthetic_texts.slice().sort()).toEqual([oldFirst, oldSecond].sort());
  const applied = await current(first.ctx, frozenRoom.invite_code); expect(applied.accepted.raw_text).toBe(oldFirst); expect(applied.candidate.raw_text).toBe(pendingEdit); expect(applied.submission_complete).toBe(false); expect(applied.applied_to_result).toBe(true);
  const omitted = await current(third.ctx, frozenRoom.invite_code); expect(omitted.accepted).toBeNull(); expect(omitted.applied_to_result).toBe(false);
  const frozenCalls = (await state()).provider_calls; await runOne(); await runOne(); expect((await state()).provider_calls).toBe(frozenCalls); expect((await state()).frozen_synthetic_texts.slice().sort()).toEqual([oldFirst, oldSecond].sort()); await markCheck('N06-real-batch-freezes-only-accepted-pending-edit-uses-prior-version');
  action = 'actual-password-proof'; const recordsResponse = await real(first.ctx, `/api/rooms/${frozenRoom.invite_code}/guest-records`); expect(recordsResponse.status()).toBe(200); const record = (await recordsResponse.json()).records.find(item => item.display_name === 'native-first'); expect(Boolean(record)).toBe(true);
  const restored = await context(); const restoredPage = await restored.newPage(); await restoredPage.goto(`${web}/rooms/${frozenRoom.invite_code}`); await restoredPage.getByRole('combobox', { name: '다시 접근할 참여 기록' }).selectOption(record.participant_id);
  await restoredPage.getByLabel('기록 암호 (선택)').fill('synthetic-wrong-password'); await restoredPage.getByRole('button', { name: '기록에 다시 접근', exact: true }).click(); await expect(restoredPage.getByRole('alert')).toBeVisible();
  for (const text of [pendingEdit, oldFirst, oldSecond]) await expect(restoredPage.locator('body')).not.toContainText(text);
  await restoredPage.getByLabel('기록 암호 (선택)').fill('synthetic-native-password'); await restoredPage.getByRole('button', { name: '기록에 다시 접근', exact: true }).click(); await expect(restoredPage.getByText(pendingEdit, { exact: true })).toBeVisible();
  expect((await current(restored, frozenRoom.invite_code)).candidate.raw_text).toBe(pendingEdit); expect((await restored.cookies()).some(cookie => cookie.httpOnly)).toBe(true);
  await expect(restoredPage.locator('body')).not.toContainText(oldSecond);
  const hostOwn = await current(host, frozenRoom.invite_code, accessByContext.get(host)); expect(hostOwn.candidate).toBeNull(); expect(hostOwn.accepted).toBeNull();
  for (const text of [pendingEdit, oldFirst, oldSecond]) expect(JSON.stringify(hostOwn).includes(text)).toBe(false);
  await storageBoundary(restoredPage, [pendingEdit, oldFirst]); await markCheck('N07-real-password-issued-HttpOnly-proof-own-read-host-not-other-owner');

  stage = 'blind-proof-and-invalid-bearer'; action = 'unprotected-guest';
  const blindRoom = await reset(stage); const original = await guest(blindRoom.invite_code, 'native-unprotected', null); await submit(original.page, blindRoom.invite_code, raw); await provider('NEEDS_CHOICE', choices(raw)); await runOne();
  const ownQuestion = await current(original.ctx, blindRoom.invite_code); expect(ownQuestion.check.status).toBe('NEEDS_CHOICE'); expect(ownQuestion.check.question).not.toBeNull();
  const blindRecords = await real(original.ctx, `/api/rooms/${blindRoom.invite_code}/guest-records`); const blindRecord = (await blindRecords.json()).records.find(item => item.display_name === 'native-unprotected');
  const blind = await context(); const blindPage = await blind.newPage(); await blindPage.goto(`${web}/rooms/${blindRoom.invite_code}`); await blindPage.getByRole('combobox', { name: '다시 접근할 참여 기록' }).selectOption(blindRecord.participant_id); await blindPage.getByRole('button', { name: '기록에 다시 접근', exact: true }).click(); await expect(blindPage.getByRole('textbox', { name: '새 참여 조건', exact: true })).toHaveValue('');
  expect(requests.filter(request => request.context === blind && request.path.includes('/submission/checks')).length).toBe(0);
  for (const suffix of ['/current', `/${ownQuestion.check.id}/retry`, `/${ownQuestion.check.id}/cancel`]) {
    const denied = await real(blind, `${privatePath(blindRoom.invite_code)}${suffix}`, suffix === '/current' ? {} : { method: 'POST', body: { request_id: randomUUID(), expected_revision: ownQuestion.candidate.revision, expected_check_version: ownQuestion.check.version } });
    expect(denied.status()).toBe(403); const problem = await denied.text();
    for (const text of [raw, ownQuestion.check.question.text, ...ownQuestion.check.question.options.map(option => option.proposed_text)]) expect(problem.includes(text)).toBe(false);
  }
  const replacement = 'blind가 새로 저장한 조건'; await blindPage.getByRole('textbox', { name: '새 참여 조건', exact: true }).fill(replacement); await blindPage.getByRole('button', { name: '기존 조건 대체하기', exact: true }).click(); await expect(blindPage.getByRole('status')).toContainText(/원문.*저장/); await expect(blindPage.getByRole('status')).toContainText(/확인.*반영/);
  expect((await real(blind, `${privatePath(blindRoom.invite_code)}/current`)).status()).toBe(403); const replaced = await current(original.ctx, blindRoom.invite_code); expect(replaced.candidate.raw_text).toBe(replacement); expect(replaced.submission_complete).toBe(false);
  await markCheck('N08-real-REPLACE_ONLY-blind-save-check-no-read-or-accepted-elevation');
  action = 'invalid-bearer-precedence'; const invalid = await real(original.ctx, `${privatePath(blindRoom.invite_code)}/current`, { bearer: 'synthetic-invalid-bearer' }); expect(invalid.status()).toBe(401); expect((await invalid.text()).includes(replacement)).toBe(false);
  const invalidWrite = await real(original.ctx, privatePath(blindRoom.invite_code), { method: 'POST', bearer: 'synthetic-invalid-bearer', body: { request_id: randomUUID(), expected_revision: replaced.candidate.revision, raw_text: '인증 우회로 저장되면 안 되는 조건' } }); expect(invalidWrite.status()).toBe(401); expect((await current(original.ctx, blindRoom.invite_code)).candidate.raw_text).toBe(replacement); await markCheck('N09-real-invalid-Bearer-wins-over-valid-guest-cookie');

  stage = 'actual-account-epoch-and-late-provider'; action = 'guest-private-question';
  const epochRoom = await reset(stage); const epochGuest = await guest(epochRoom.invite_code, 'native-epoch-guest'); await submit(epochGuest.page, epochRoom.invite_code, raw); await provider('NEEDS_CHOICE', choices(raw)); await runOne(); await expect(epochGuest.page.getByText('오전과 오후 중 어느 시간인가요?', { exact: true })).toBeVisible({ timeout: 12_000 });
  await login(epochGuest.page); await epochGuest.page.goto(`${web}/rooms/${epochRoom.invite_code}`); await expect(epochGuest.page.getByRole('textbox', { name: /시간·장소 조건/ })).toBeVisible(); await expect(epochGuest.page.locator('body')).not.toContainText(raw);
  const accountRaw = '로그아웃 뒤 복구되면 안 되는 계정 전용 원문'; await submit(epochGuest.page, epochRoom.invite_code, accountRaw); await provider('CLEAR', { barrier: true }); const lateAccount = runOne(); lateAccount.catch(() => undefined); await expect.poll(async () => (await state()).in_flight, { timeout: 10_000 }).toBe(1);
  await epochGuest.page.getByRole('button', { name: '로그아웃', exact: true }).click(); await epochGuest.page.goto(`${web}/rooms/${epochRoom.invite_code}`); await command('/provider/release'); await lateAccount;
  await expect(epochGuest.page.locator('body')).not.toContainText(accountRaw); expect((await current(epochGuest.ctx, epochRoom.invite_code)).candidate.raw_text).toBe(raw); await storageBoundary(epochGuest.page, [raw, accountRaw]);
  await markCheck('N10-real-OIDC-account-priority-logout-and-late-private-provider-isolation');

  await Promise.all(responseWork); expect(externalRequests).toBe(0); expect(failures).toEqual([]); expect(await hashes(sourceFiles)).toEqual(sourceBefore);
  expect(createHash('sha256').update(await readFile(runtimeManifestPath)).digest('hex')).toBe(runtimeManifestHash); expect(await hashes(await artifactFiles(nativeDist))).toEqual(nativeArtifacts);
  await mkdir('docs/verification', { recursive: true });
  await writeFile(evidencePath, JSON.stringify({ status: 'PASS', scope: 'actual-browser-Spring-PostgreSQL-Redis-RS256-loopback-OIDC-real-guest-proof-synthetic-provider', sourceFiles: sourceBefore, runtimeManifestSha256: runtimeManifestHash, nativeArtifacts, scriptSha256: createHash('sha256').update(await readFile('scripts/verify-precheck-native.mjs')).digest('hex'), checks, apiRouteMocks: 0, externalRequests, actualModelCalls: 0, actualOAuthProviderCalls: 0, productionAccess: false, controls: 'separate-loopback-test-only-provider-worker-fixture', requestsObserved: requests.length, at: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, apiRouteMocks: 0, externalRequests, actualModelCalls: 0 }));
} catch (error) {
  const scriptLine = String(error?.stack ?? '').match(/verify-precheck-native\.mjs:(\d+):/)?.[1] ?? null;
  const errorKind = ['Error', 'TypeError', 'AssertionError', 'TimeoutError'].includes(error?.name) ? error.name : 'OTHER';
  const strictLocator = String(error?.message ?? '').includes('strict mode violation');
  const page = scenarioContexts.at(-1)?.pages().at(-1);
  const checkingLocatorMatches = page ? await page.getByText(/확인 중|확인하고/).count().catch(() => null) : null;
  const checkingVisible = page ? await page.getByText(/확인 중|확인하고/).first().isVisible().catch(() => null) : null;
  if (page) {
    let text = await page.locator('body').innerText().catch(() => 'BODY_UNAVAILABLE');
    for (const token of tokens) text = text.replaceAll(token, '<redacted>');
    await mkdir('.codex/tdd-evidence', { recursive: true });
    await writeFile('.codex/tdd-evidence/issue-107-native-browser-failure-body.txt', text);
    if (stage === 'save-choice-direct-clear' && action === 'save-before-worker') {
      let message = String(error?.message ?? '');
      for (const token of tokens) message = message.replaceAll(token, '<redacted>');
      message = message.replace(/https?:\/\/[^\s)]+/g, '<redacted-url>').replace(/(?:cookie|authorization)[^\n]*/gi, '<redacted-header>');
      await writeFile('.codex/tdd-evidence/issue-107-native-browser-pending-assertion.txt', message);
    }
  }
  await mkdir('docs/verification', { recursive: true });
  await writeFile(evidencePath, JSON.stringify({ status: 'FAIL', stage, action, checks, error: 'NATIVE_PRECHECK_ASSERTION_FAILED', sourceFiles: sourceBefore, apiRouteMocks: 0, externalRequests, actualModelCalls: 0, actualOAuthProviderCalls: 0, productionAccess: false, at: new Date().toISOString() }, null, 2) + '\n');
  console.error(JSON.stringify({ status: 'FAIL', stage, action, passedChecks: checks.length, errorKind, scriptLine, strictLocator, checkingLocatorMatches, checkingVisible })); process.exitCode = 1;
} finally {
  // Release local barriers before closing browser contexts; never leave fixture
  // worker threads parked if a browser assertion failed midway through a race.
  if (isolatedFixture) await fetch(`${control}/provider/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(2000) }).catch(() => undefined);
  for (const ctx of contexts) await ctx.close().catch(() => undefined); await browser?.close();
}
