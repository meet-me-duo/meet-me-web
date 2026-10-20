import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const web = 'http://localhost:5173';
const api = 'http://localhost:8080';
const roomName = `격리 브라우저 계정 모임 ${Date.now()}`;
const checks = [];
const failures = [];
let browser;
let currentCheck = 'loopback-provider-probe';
const checkIds = [
  "anonymous-host-login-gate-both-providers",
  "google-oidc-cookie-refresh-bearer-profile-create",
  "own-host-archive-expiry",
  "same-provider-new-device-durable-account-archive",
  "kakao-oidc-and-cross-account-archive-isolation",
  "guest-participation-without-login",
  "explicit-verified-guest-claim-preserves-member-rights",
  "member-join-without-name-or-password-no-host-rights",
  "explicit-claim-existing-account-participation-conflict",
  "device-logout-preserves-other-device-refresh",
  "same-cookie-multi-tab-refresh-serialized-by-browser-lock",
  "all-device-logout-clears-sensitive-account-ui"
];
function completed(id) {
  checks.push(id);
  currentCheck = checkIds[checks.length] ?? 'external-network-audit';
}
const contexts = [];
const { expect } = await import('@playwright/test');
async function context() {
  const ctx = await browser.newContext(); contexts.push(ctx);
  await ctx.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) { failures.push('external-request-blocked'); return route.abort(); }
    return route.continue();
  });
  return ctx;
}
function responseWait(page, predicate) {
  return page.waitForResponse(predicate).catch(() => undefined);
}
async function login(page, provider, returnPath = '/create') {
  await page.goto(`${web}${returnPath}`);
  await page.getByRole('link', { name: `${provider}로 로그인`, exact: true }).click();
  await page.waitForURL(url => url.origin === web && !url.pathname.startsWith('/auth/'), { timeout: 20000 });
}
try {
  // Refuse to run against real provider endpoints, even when a different app occupies localhost:8080.
  const probe = await fetch(`${api}/api/auth/google/start`, { redirect: 'manual' });
  const location = new URL(probe.headers.get('location') ?? 'https://invalid.test');
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('isolated-provider-required');
  currentCheck = checkIds[0];
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const hostContext = await context(); const host = await hostContext.newPage();
  await host.goto(`${web}/create`);
  await expect(host.getByRole('link', { name: 'Google로 로그인', exact: true })).toBeVisible();
  await expect(host.getByRole('link', { name: 'Kakao로 로그인', exact: true })).toBeVisible();
  await expect(host.getByLabel('모임 목적 / 이름')).toHaveCount(0);
  completed('anonymous-host-login-gate-both-providers');
  await login(host, 'Google');
  await expect(host.getByLabel('모임 목적 / 이름')).toBeVisible();
  await expect(host.getByLabel('주최자 이름')).toHaveCount(0);
  await host.getByLabel('모임 목적 / 이름').fill(roomName);
  await host.getByRole('button', { name: /다음 단계/ }).click();
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await host.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  const roomPath = new URL(host.url()).pathname;
  await expect(host.getByRole('heading', { name: '모임이 만들어졌어요' })).toBeVisible();
  completed('google-oidc-cookie-refresh-bearer-profile-create');
  await host.getByRole('link', { name: '내가 만든 모임', exact: true }).click();
  await expect(host.getByRole('link', { name: roomName, exact: true })).toBeVisible();
  await expect(host.getByRole('listitem').filter({ has: host.getByRole('link', { name: roomName, exact: true }) }).getByText(/정리 예정/)).toBeVisible();
  completed('own-host-archive-expiry');
  const deviceContext = await context(); const device = await deviceContext.newPage();
  await login(device, 'Google', '/account/rooms');
  await expect(device.getByRole('link', { name: roomName, exact: true })).toBeVisible();
  completed('same-provider-new-device-durable-account-archive');
  const otherContext = await context(); const other = await otherContext.newPage();
  await login(other, 'Kakao', '/account/rooms');
  await expect(other.getByText('아직 만든 모임이 없어요.')).toBeVisible();
  completed('kakao-oidc-and-cross-account-archive-isolation');
  const guestContext = await context(); const guest = await guestContext.newPage();
  await guest.goto(`${web}${roomPath}`);
  await guest.getByLabel('이름', { exact: true }).fill('격리 게스트');
  const joinedResponse = responseWait(guest, response => response.url().endsWith('/participants') && response.request().method() === 'POST');
  await guest.getByRole('button', { name: '참여하기', exact: true }).click();
  const guestParticipant = (await (await joinedResponse).json()).viewer.context_id;
  await expect(guest.getByRole('heading', { name: roomName, exact: true })).toBeVisible();
  completed('guest-participation-without-login');
  await guest.getByRole('link', { name: '로그인', exact: true }).click();
  await login(guest, 'Kakao', '/login');
  await guest.goto(`${web}${roomPath}`);
  const claim = guest.getByRole('button', { name: '이 브라우저의 기존 참여 연결', exact: true });
  await expect(claim).toBeVisible();
  const claimResponse = responseWait(guest, response => response.url().endsWith('/claim') && response.request().method() === 'POST');
  await claim.click();
  const claimedResponse = await claimResponse;
  expect(claimedResponse.status()).toBe(200);
  expect((await claimedResponse.json()).viewer.context_id).toBe(guestParticipant);
  await expect(guest.locator('.room-kicker')).toContainText('격리 게스트');
  await expect(guest.getByRole('button', { name: '입력 마감하기', exact: true })).toHaveCount(0);
  completed('explicit-verified-guest-claim-preserves-member-rights');
  // Create a separate room so the same account can also exercise the new-member path.
  await host.goto(`${web}/create`);
  await host.getByLabel('모임 목적 / 이름').fill('격리 회원 참여 모임');
  await host.getByRole('button', { name: /다음 단계/ }).click();
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await host.waitForURL(/\/rooms\/[A-Za-z0-9_-]{22}$/);
  const memberRoomPath = new URL(host.url()).pathname;
  await other.goto(`${web}${memberRoomPath}`);
  await expect(other.getByRole('button', { name: '계정으로 참여', exact: true })).toBeVisible();
  await expect(other.getByLabel('이름', { exact: true })).toHaveCount(0);
  await other.getByRole('button', { name: '계정으로 참여', exact: true }).click();
  await expect(other.getByRole('button', { name: '입력 마감하기', exact: true })).toHaveCount(0);
  completed('member-join-without-name-or-password-no-host-rights');
  const conflictContext = await context(); const conflict = await conflictContext.newPage();
  await conflict.goto(`${web}${roomPath}`);
  await conflict.getByLabel('이름', { exact: true }).fill('충돌 보존 게스트');
  await conflict.getByRole('button', { name: '참여하기', exact: true }).click();
  await conflict.getByRole('link', { name: '로그인', exact: true }).click();
  await login(conflict, 'Kakao', '/login');
  await conflict.goto(`${web}${roomPath}`);
  const claimDisclosure = conflict.getByText('이 브라우저의 이전 참여 연결');
  await claimDisclosure.click();
  await conflict.getByRole('button', { name: '이 브라우저의 기존 참여 연결', exact: true }).click();
  await expect(conflict.getByRole('alert')).toBeVisible();
  await expect(conflict.getByRole('alert')).toContainText(/이미|참여|연결/);
  completed('explicit-claim-existing-account-participation-conflict');
  await host.goto(`${web}/account/rooms`);
  await device.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(device.getByRole('link', { name: 'Google로 로그인', exact: true })).toBeVisible();
  await host.reload();
  await expect(host.getByRole('link', { name: roomName, exact: true })).toBeVisible();
  completed('device-logout-preserves-other-device-refresh');
  const parallelTab = await hostContext.newPage();
  await Promise.all([host.reload(), parallelTab.goto(`${web}/account/rooms`)]);
  await expect(host.getByRole('link', { name: roomName, exact: true })).toBeVisible();
  await expect(parallelTab.getByRole('link', { name: roomName, exact: true })).toBeVisible();
  completed('same-cookie-multi-tab-refresh-serialized-by-browser-lock');
  await host.getByRole('button', { name: '모든 기기 로그아웃', exact: true }).click();
  await expect(host.getByRole('link', { name: 'Google로 로그인', exact: true })).toBeVisible();
  await parallelTab.reload();
  await expect(parallelTab.getByRole('link', { name: 'Google로 로그인', exact: true })).toBeVisible();
  completed('all-device-logout-clears-sensitive-account-ui');
  if (failures.length) throw new Error('unexpected-network');
  const evidence = { scope: 'actual-browser-to-isolated-Spring-PostgreSQL-Redis-local-HTTP-OIDC-JWKS', productionLogin: false, credentialsProvisioned: false, externalRequests: 0, apiRouteMocks: 0, checks, status: 'PASS', at: new Date().toISOString() };
  await writeFile('docs/verification/issue-109-after-108-native.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', count: checks.length, productionLogin: false }));
} catch {
  // Playwright errors can contain private DOM, response data and request URLs.
  // Record only the fixed assertion identifier, never the Error or call log.
  const evidence = { status: 'FAIL', checks, failedCheck: currentCheck, externalRequests: failures.length, apiRouteMocks: 0, productionLogin: false, at: new Date().toISOString() };
  await writeFile('docs/verification/issue-109-after-108-native.json', JSON.stringify(evidence, null, 2) + '\n');
  console.error(JSON.stringify({ status: 'FAIL', passedChecks: checks.length, failedCheck: currentCheck }));
  process.exitCode = 1;
} finally { for (const ctx of contexts) await ctx.close().catch(() => {}); await browser?.close().catch(() => {}); }
