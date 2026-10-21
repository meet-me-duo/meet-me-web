import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const web = 'http://localhost:18911';
const api = 'http://localhost:18910';
const evidencePath = 'docs/verification/issue-110-native.json';
const privateSentinel = 'ISSUE110_NATIVE_PRIVATE_RAW';
const checks = [];
const failures = [];
const contexts = [];
const tokens = new Set();
const requests = [];
const responseWork = [];
let externalRequests = 0;
let browser;
let stage = 'isolated-server-probe';
let action = 'probe';
const operationPath = url => new URL(url).pathname.startsWith('/api/operations/');
const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);

async function context() {
  const ctx = await browser.newContext(); contexts.push(ctx);
  // Continue every local request unchanged. No API or provider responses are mocked.
  await ctx.route('**/*', route => {
    if (!loopback(new URL(route.request().url()).hostname)) {
      externalRequests++;
      return route.abort();
    }
    return route.continue();
  });
  ctx.on('request', request => {
    if (operationPath(request.url())) requests.push({ request, stage });
  });
  ctx.on('response', response => {
    responseWork.push((async () => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/auth/refresh' && response.ok()) {
        const body = await response.json();
        if (typeof body.accessToken === 'string') tokens.add(body.accessToken);
      }
      if (operationPath(response.url()) && !/\bno-store\b/i.test(response.headers()['cache-control'] ?? '')) failures.push('operations-response-missing-no-store');
    })().catch(() => { failures.push('response-observation-failed'); }));
  });
  return ctx;
}

async function login(page, provider) {
  await page.goto(`${web}/login`);
  await page.getByRole('link', { name: `${provider}로 로그인`, exact: true }).click();
  await page.waitForURL(url => url.origin === web && !url.pathname.startsWith('/auth/'), { timeout: 20_000 });
}

async function assertPrivateBoundary(page) {
  await Promise.all(responseWork);
  const body = await page.locator('body').innerText();
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(body).not.toContain(privateSentinel);
  for (const token of tokens) {
    expect(body).not.toContain(token);
    expect(page.url()).not.toContain(token);
    expect(JSON.stringify(storage)).not.toContain(token);
  }
  expect(storage).toEqual({ local: {}, session: {} });
}

async function denied(page, expected) {
  const [response] = await Promise.all([
    page.waitForResponse(response => operationPath(response.url())),
    page.goto(`${web}/operations?operator_id=HOST&role=HOST`),
  ]);
  expect(response.status()).toBe(expected);
  await expect(page.getByRole('alert')).toHaveText(expected === 401 ? '운영자 인증이 필요합니다.' : '운영 조회 권한이 없습니다.');
  await expect(page.locator('.operations-list')).toHaveCount(0);
  await assertPrivateBoundary(page);
}

try {
  // Refuse real Google/Kakao endpoints even if another app occupies the test port.
  const probe = await fetch(`${api}/api/auth/google/start`, { redirect: 'manual' });
  const location = new URL(probe.headers.get('location') ?? 'https://invalid.test');
  if (!loopback(location.hostname)) throw new Error('isolated-provider-required');
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });

  stage = 'anonymous';
  const anonymous = await (await context()).newPage();
  await denied(anonymous, 401);
  checks.push('anonymous-real-http-401-host-hints-do-not-grant-access');

  stage = 'ordinary-account';
  const ordinary = await (await context()).newPage();
  await login(ordinary, 'Kakao');
  await denied(ordinary, 403);
  checks.push('actual-kakao-memory-account-real-http-403');

  stage = 'allowlisted-account';
  const operator = await (await context()).newPage();
  await login(operator, 'Google');
  action = 'room-list-navigation';
  const [listResponse] = await Promise.all([
    operator.waitForResponse(response => new URL(response.url()).pathname === '/api/operations/rooms'),
    operator.goto(`${web}/operations`),
  ]);
  expect(listResponse.status()).toBe(200);
  const list = await listResponse.json();
  const room = list.items[0];
  if (!room) throw new Error('synthetic-operation-room-seed-required');
  action = 'public-room-button-visible';
  const roomButton = operator.getByRole('button', { name: `방 ${room.id}`, exact: true });
  await expect(roomButton).toBeVisible();
  action = 'room-detail-click-and-response';
  const [roomResponse] = await Promise.all([
    operator.waitForResponse(response => new URL(response.url()).pathname === `/api/operations/rooms/${room.id}`),
    roomButton.click(),
  ]);
  expect(roomResponse.status()).toBe(200);
  const detail = await roomResponse.json();
  const invocation = detail.invocations[0];
  if (!invocation) throw new Error('synthetic-operation-invocation-seed-required');
  await expect(operator.getByRole('heading', { name: '현재 방 설정', exact: true })).toBeVisible();
  action = 'public-invocation-button-visible';
  const invocationButton = operator.getByRole('button', { name: `실행 ${invocation.id}`, exact: true });
  await expect(invocationButton).toBeVisible();
  action = 'invocation-detail-click-and-response';
  const [invocationResponse] = await Promise.all([
    operator.waitForResponse(response => new URL(response.url()).pathname === `/api/operations/invocations/${invocation.id}`),
    invocationButton.click(),
  ]);
  expect(invocationResponse.status()).toBe(200);
  const execution = await invocationResponse.json();
  await expect(operator.getByRole('heading', { name: '실행 기록 상세', exact: true })).toBeVisible();
  await expect(operator.getByRole('heading', { name: '로컬 client call 관측', exact: true })).toBeVisible();
  expect(execution.invocation.http_request_count).toBeNull();
  await expect(operator.locator('dt', { hasText: 'HTTP 요청 횟수' }).locator('+ dd')).toHaveText('알 수 없음');
  const coverage = operator.getByRole('heading', { name: '로컬 client call 관측', exact: true }).locator('..');
  if (execution.invocation.client_call_count === null) await expect(coverage).toContainText('알 수 없음');
  const articles = operator.locator('article.operations-attempt');
  await expect(articles).toHaveCount(execution.attempts.length);
  for (const [index, attempt] of execution.attempts.entries()) {
    const count = articles.nth(index).locator('dt', { hasText: '로컬 client call 수' }).locator('+ dd');
    await expect(count).toHaveText(attempt.client_calls == null ? '알 수 없음' : String(attempt.client_calls.length));
    if (attempt.input_tokens === null) await expect(articles.nth(index).locator('dt', { hasText: '입력 토큰' }).locator('+ dd')).toHaveText('알 수 없음');
  }
  await assertPrivateBoundary(operator);
  checks.push('actual-google-allowlisted-account-room-and-invocation-drilldown');
  checks.push('actual-summary-preserves-unknown-transport-usage-and-http-count');

  await Promise.all(responseWork);
  const allowed = requests.filter(item => item.stage === 'allowlisted-account');
  expect(allowed.length).toBeGreaterThanOrEqual(3);
  expect(tokens.size).toBeGreaterThan(0);
  for (const { request } of requests.filter(item => ['allowlisted-account', 'ordinary-account'].includes(item.stage))) {
    const header = request.headers().authorization ?? '';
    expect(header.startsWith('Bearer ')).toBe(true);
    expect(tokens.has(header.slice(7))).toBe(true);
  }
  checks.push('production-memory-supplier-attaches-actual-service-bearer');

  stage = 'logout';
  action = 'logout-click-and-unauthorized-response';
  await Promise.all([
    operator.waitForResponse(response => operationPath(response.url()) && response.status() === 401),
    operator.getByRole('button', { name: '로그아웃', exact: true }).click(),
  ]);
  await expect(operator.getByRole('alert')).toHaveText('운영자 인증이 필요합니다.');
  await expect(operator.locator('body')).not.toContainText(room.id);
  await expect(operator.locator('body')).not.toContainText(invocation.id);
  await expect(operator.locator('article.operations-attempt')).toHaveCount(0);
  await assertPrivateBoundary(operator);
  checks.push('actual-logout-revision-discards-private-summary-and-reloads-401');

  for (const { request, stage: requestStage } of requests) {
    expect(request.method()).toBe('GET');
    expect(request.headers()['x-user-id']).toBeUndefined();
    expect(request.headers()['x-operator-id']).toBeUndefined();
    const url = new URL(request.url());
    expect(url.searchParams.has('operator_id')).toBe(false);
    expect(url.searchParams.has('role')).toBe(false);
    if (requestStage === 'anonymous' || requestStage === 'logout') expect(request.headers().authorization).toBeUndefined();
    for (const token of tokens) expect(request.url()).not.toContain(token);
  }
  await Promise.all(responseWork);
  expect(externalRequests).toBe(0);
  expect(failures).toEqual([]);
  checks.push('all-operations-real-http-get-no-store-no-forged-identity');
  checks.push('credentials-absent-from-dom-url-and-browser-storage');
  await mkdir('docs/verification', { recursive: true });
  await operator.screenshot({ path: 'docs/verification/issue-110-native-logout.png', fullPage: true });
  await writeFile(evidencePath, JSON.stringify({ status: 'PASS', scope: 'actual-browser-to-isolated-Spring-PostgreSQL-Redis-local-HTTP-OIDC-JWKS',
    productionLogin: false, operatorActivation: false, credentialsProvisioned: false, externalRequests, apiRouteMocks: 0,
    operationsRequests: requests.length, checks, at: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, apiRouteMocks: 0, externalRequests }));
} catch {
  // Playwright exception text may embed headers, bodies, or callback URLs.
  await mkdir('docs/verification', { recursive: true });
  await writeFile(evidencePath, JSON.stringify({ status: 'FAIL', stage, action, checks, externalRequests, apiRouteMocks: 0,
    productionLogin: false, error: 'NATIVE_OPERATIONS_ASSERTION_FAILED', at: new Date().toISOString() }, null, 2) + '\n');
  console.error(JSON.stringify({ status: 'FAIL', stage, action, passedChecks: checks.length }));
  process.exitCode = 1;
} finally {
  for (const ctx of contexts) await ctx.close();
  await browser?.close();
}
