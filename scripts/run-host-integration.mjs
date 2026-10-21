import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, openSync, closeSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, realpath, readdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = resolve(process.env.HOST_INTEGRATION_SERVER_REPO ?? join(web, '../server'));
const frozenRoot = resolve(process.env.HOST_INTEGRATION_FROZEN_RUNTIME ?? '/tmp/issue123-native-ui-readiness/server128');
const sourceRevision = '3982535765e878875a901dd9d28352358e594f6f';
const suite = process.env.HOST_INTEGRATION_SUITE ?? 'current-host';
if (!['current-host', 'account-recovery'].includes(suite)) throw new Error('UNKNOWN_INTEGRATION_SUITE');
const recoveryMode = suite === 'account-recovery';
const work = await mkdtemp(join(tmpdir(), 'meetme-host-current-'));
const dist = join(work, 'dist');
const origins = { web: 'https://localhost:19443', api: 'https://localhost:19444', denied: 'https://localhost:19445', control: 'http://127.0.0.1:19442' };
async function allFiles(directory, root = web) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const child = directory ? `${directory}/${entry.name}` : entry.name;
    return entry.isDirectory() ? allFiles(child, root) : [child];
  }))).flat().sort();
}
async function assetFingerprints() {
  return Object.fromEntries(await Promise.all((await allFiles('', dist)).map(async path => [path, digest(await readFile(join(dist, path)))])));
}
const inputFiles = ['scripts/run-host-integration.mjs', 'playwright.host-integration.config.ts', 'integration/host-creation/fixtures.ts', 'integration/host-creation/host-creation.spec.ts', 'integration/host-creation/HostIntegrationServer.java', ...(recoveryMode ? ['integration/host-creation/auth-recovery.spec.ts'] : []), ...(await allFiles('src')), 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json'];
const listeners = [];
const metadata = { mode: recoveryMode ? 'SIX_A_RECOVERY_NOT_LOSSLESS_EIGHT' : 'CURRENT_EIGHT_HTTPS_REGRESSION', completed: false, sourceRevision, actualProviderCalls: 0, actualOAuthProviderCalls: 0, productionAccess: false, checks: {}, limitations: ['Chromium desktop/narrow viewport, not physical mobile.', 'HTTPS localhost ports prove real credentialed CORS, not production subdomain isolation.', 'Primary synthetic precheck provider bypasses TwoStage, physical provider dispatch and financial budget enforcement.', 'Final analysis workers stay disabled: accepted versions/batch freeze only; no actual AI output, latency, cost or model accuracy.', 'Fresh test-only AuthEndToEnd PostgreSQL/Redis/local OIDC ownership; retired old Compose is archived, not active.'] };
const toolNames = ['PATH', 'LANG', 'LC_ALL', 'JAVA_HOME', 'JAVA_TOOL_OPTIONS', 'GRADLE_USER_HOME', 'DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'TESTCONTAINERS_HOST_OVERRIDE', 'TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE', 'PLAYWRIGHT_BROWSERS_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'];
const childEnv = { ...Object.fromEntries(toolNames.filter(n => process.env[n] !== undefined).map(n => [n, process.env[n]])), OPENAI_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', ANTHROPIC_API_KEY: '' };
let fixture; let fixtureClosed; let activeTests; let browserProbe; let cleanupPromise; let serverLog;
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: web, env: childEnv, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`LOCAL_TOOL_FAILED ${command} status=${result.status ?? 'spawn'}`);
  return result.stdout.trim();
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fingerprints() { return Object.fromEntries(await Promise.all(inputFiles.map(async p => [p, digest(await readFile(join(web, p)))]))); }
async function runtimeCheck() {
  const manifest = JSON.parse(await readFile(join(frozenRoot, 'runtime-source-manifest.json'), 'utf8'));
  for (const [p, hash] of Object.entries(manifest.source)) {
    if (!(p.startsWith('src/') || ['build.gradle.kts', 'settings.gradle.kts'].includes(p))) continue;
    const result = spawnSync('git', ['show', `${sourceRevision}:${p}`], { cwd: server, env: childEnv, maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0 || digest(result.stdout) !== hash) throw new Error('FROZEN_SOURCE_TARGET_MISMATCH');
  }
  for (const [p, hash] of Object.entries(manifest.frozen)) if (digest(await readFile(join(frozenRoot, 'runtime-final', p))) !== hash) throw new Error('FROZEN_CLASS_RESOURCE_MISMATCH');
  for (const [p, hash] of Object.entries(manifest.dependencyJars)) if (digest(await readFile(p)) !== hash) throw new Error('FROZEN_DEPENDENCY_MISMATCH');
  return { manifestSha256: digest(await readFile(join(frozenRoot, 'runtime-source-manifest.json'))), sourceProjectionFiles: Object.keys(manifest.source).length, frozenFiles: Object.keys(manifest.frozen).length, dependencyJars: Object.keys(manifest.dependencyJars).length };
}
async function probe(url) {
  return new Promise(resolveProbe => {
    const request = http.get(url, response => { let body = ''; response.on('data', b => { body += b; }); response.on('end', () => { try { resolveProbe(response.statusCode === 200 ? JSON.parse(body) : null); } catch { resolveProbe(null); } }); });
    request.setTimeout(1000, () => request.destroy()); request.on('error', () => resolveProbe(null));
  });
}
async function waitForFixture() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (fixture.exitCode !== null) throw new Error('FIXTURE_EXITED_BEFORE_READY');
    const health = await probe(`${origins.control}/health`);
    if (health) return health;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error('FIXTURE_STARTUP_TIMEOUT');
}
async function listen(port, tls, handler) {
  const listener = https.createServer(tls, handler);
  listener.on("connection", socket => socket.on("error", () => { metadata.fixtureSocketErrors = (metadata.fixtureSocketErrors ?? 0) + 1; }));
  await new Promise((resolveListen, reject) => { listener.once('error', reject); listener.listen(port, '127.0.0.1', resolveListen); }); listeners.push(listener);
}
async function createTls() {
  const ca = join(work, 'ca.pem'); const key = join(work, 'localhost.key'); const certificate = join(work, 'localhost.pem');
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'ca.key'), '-out', ca, '-days', '1', '-subj', '/CN=Meet me ephemeral integration CA', '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
  run('openssl', ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', join(work, 'localhost.csr'), '-subj', '/CN=localhost']);
  await writeFile(join(work, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n');
  run('openssl', ['x509', '-req', '-in', join(work, 'localhost.csr'), '-CA', ca, '-CAkey', join(work, 'ca.key'), '-CAcreateserial', '-out', certificate, '-days', '1', '-extfile', join(work, 'leaf.ext')]);
  await chmod(key, 0o600); await chmod(join(work, 'ca.key'), 0o600); run('openssl', ['verify', '-CAfile', ca, '-verify_hostname', 'localhost', certificate]);
  metadata.checks.certificateChain = true; return { ca, key: await readFile(key), cert: await readFile(certificate) };
}
function proxyApi(request, response) {
  const upstream = http.request({ hostname: '127.0.0.1', port: 19440, method: request.method, path: request.url, headers: request.headers }, remote => { response.writeHead(remote.statusCode, remote.headers); remote.pipe(response); });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); }); request.pipe(upstream);
}
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
async function serveWeb(request, response) {
  try {
    const path = decodeURIComponent(new URL(request.url, origins.web).pathname); let target = resolve(dist, `.${path}`);
    if (!target.startsWith(dist + sep) || !existsSync(target) || !extname(target)) target = join(dist, 'index.html');
    const actual = await realpath(target); if (!actual.startsWith(dist + sep)) { response.writeHead(403); response.end(); return; }
    response.writeHead(200, { 'Content-Type': contentTypes[extname(actual)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); createReadStream(actual).pipe(response);
  } catch { response.writeHead(404); response.end(); }
}
function cleanup() {
  cleanupPromise ??= (async () => {
    if (activeTests?.pid) { try { process.kill(-activeTests.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
    await browserProbe?.close();
    await Promise.all(listeners.map(listener => new Promise(resolveClose => { listener.closeAllConnections(); listener.close(resolveClose); })));
    if (fixture) {
      await writeFile(join(work, 'stop'), '');
      const exited = await Promise.race([fixtureClosed.then(() => true), new Promise(resolveTimeout => setTimeout(() => resolveTimeout(false), 15_000))]);
      if (!exited) { fixture.kill('SIGTERM'); await fixtureClosed; }
    }
    if (serverLog !== undefined) closeSync(serverLog);
    await Promise.all(['ca.key', 'localhost.key', 'untrusted-profile', 'profiles'].map(p => rm(join(work, p), { recursive: true, force: true })));
    metadata.checks.privateKeysAndProfilesRemoved = true;
  })(); return cleanupPromise;
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.once(signal, () => { metadata.completed = false; metadata.error = 'RUN_INTERRUPTED'; void cleanup().then(async () => { await writeFile(join(work, 'evidence.json'), JSON.stringify(metadata, null, 2) + '\n'); process.exit(code); }); });

try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('NODE24_REQUIRED');
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  metadata.sourceRevision = run('git', ['rev-parse', sourceRevision], { cwd: server }); metadata.webRevision = run('git', ['rev-parse', 'HEAD']); metadata.inputSha256 = await fingerprints(); metadata.runtime = await runtimeCheck();
  const javaHome = process.env.JAVA_HOME ?? '/tmp/meetme-jdk17'; const java = join(javaHome, 'bin/java'); const javac = join(javaHome, 'bin/javac');
  const version = spawnSync(java, ['-version'], { env: childEnv, encoding: 'utf8' }); if (!/version "17\./.test(version.stderr)) throw new Error('JAVA17_REQUIRED');
  const classpath = (await readFile(join(frozenRoot, 'runtime-frozen.classpath'), 'utf8')).trim(); const classes = join(work, 'launcher-classes');
  await mkdir(classes); run(javac, ['--add-modules', 'jdk.httpserver', '-cp', classpath, '-d', classes, 'integration/host-creation/HostIntegrationServer.java']); metadata.launcherClassSha256 = digest(await readFile(join(classes, 'com/meetme/integration/HostIntegrationServer.class')));
  console.log('Building current web and launching unchanged server classes with isolated test-only auth/provider fixture');
  run('node', ['node_modules/typescript/bin/tsc', '-b']); run('node', ['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'runner', '--outDir', dist], { env: { ...childEnv, VITE_API_BASE_URL: origins.api } });
  serverLog = openSync(join(work, 'server.log'), 'w'); fixture = spawn(java, ['--add-modules=jdk.httpserver', '-cp', `${classes}:${classpath}`, 'com.meetme.integration.HostIntegrationServer', work], { cwd: web, env: childEnv, stdio: ['ignore', serverLog, serverLog] }); fixtureClosed = new Promise(resolveExit => fixture.once('close', resolveExit));
  const health = await waitForFixture();
  if (health.fixture !== 'issue123-host-current-v1' || health.production !== false || health.primary_provider_fake !== true || health.api_origin !== origins.api || health.web_origin !== origins.web || !/^http:\/\/127\.0\.0\.1:\d+$/.test(health.oidc_origin) || !/^[a-f0-9]{12,64}$/.test(health.db_container)) throw new Error('ISOLATED_FIXTURE_HEALTH_MISMATCH');
  metadata.fixture = { ...health, db_container: health.db_container.slice(0, 12) };
  const tls = await createTls(); await listen(19443, tls, serveWeb); await listen(19444, tls, proxyApi); await listen(19445, tls, (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Unapproved local origin</title>'); });
  const denyProxy = http.createServer((_request, response) => { response.writeHead(403); response.end(); }); denyProxy.on('connection', socket => socket.on('error', () => { metadata.fixtureSocketErrors = (metadata.fixtureSocketErrors ?? 0) + 1; })); denyProxy.on('connect', (_request, socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')); await new Promise((resolveListen, reject) => { denyProxy.once('error', reject); denyProxy.listen(19446, '127.0.0.1', resolveListen); }); listeners.push(denyProxy);
  const { chromium } = await import('@playwright/test'); const executablePath = process.env.HOST_INTEGRATION_BROWSER_EXECUTABLE ?? '/usr/bin/chromium';
  const untrusted = await chromium.launchPersistentContext(join(work, 'untrusted-profile'), { executablePath, headless: true, ignoreHTTPSErrors: false, proxy: { server: 'http://127.0.0.1:19446', bypass: 'localhost,127.0.0.1' }, env: { ...childEnv, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '' } }); browserProbe = untrusted;
  try { const page = await untrusted.newPage(); let rejected = false; try { await page.goto(origins.web); } catch (error) { rejected = /ERR_CERT_AUTHORITY_INVALID/.test(error.message); } if (!rejected) throw new Error('UNTRUSTED_CA_NEGATIVE_CONTROL_FAILED'); metadata.checks.untrustedCaRejected = true; } finally { await untrusted.close(); browserProbe = undefined; }
  metadata.assetSha256 = await assetFingerprints();
  await mkdir(join(work, 'profiles')); const report = join(work, 'playwright.json');
  const testEnv = { ...childEnv, HOST_INTEGRATION_SUITE: suite, HOST_INTEGRATION_BROWSER_EXECUTABLE: executablePath, HOST_INTEGRATION_CA: tls.ca, HOST_INTEGRATION_PROFILES_DIR: join(work, 'profiles'), HOST_INTEGRATION_WEB_ORIGIN: origins.web, HOST_INTEGRATION_API_ORIGIN: origins.api, HOST_INTEGRATION_CONTROL_ORIGIN: origins.control, HOST_INTEGRATION_OIDC_ORIGIN: health.oidc_origin, HOST_INTEGRATION_DB_CONTAINER: health.db_container, HOST_INTEGRATION_DB_USER: health.db_user, HOST_INTEGRATION_DB_NAME: health.db_name, HOST_INTEGRATION_REPORT: report, HOST_INTEGRATION_OUTPUT: join(work, 'test-results') };
  console.log('Running current actual HTTPS/account/accepted-only tests; no page routing or paid provider');
  const testStatus = await new Promise((resolveTest, reject) => { const tests = spawn('node', ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.host-integration.config.ts', ...process.argv.slice(2), '--workers', '1', '--retries', '0'], { cwd: web, env: testEnv, stdio: 'inherit', detached: true }); activeTests = tests; tests.once('error', reject); tests.once('close', resolveTest); }); activeTests = undefined;
  metadata.sourceFiles = Object.keys(metadata.inputSha256).filter(path => path.startsWith('src/')).length;
  if (JSON.stringify(await fingerprints()) !== JSON.stringify(metadata.inputSha256)) throw new Error('INTEGRATION_SOURCE_CHANGED');
  if (JSON.stringify(await runtimeCheck()) !== JSON.stringify(metadata.runtime)) throw new Error('FROZEN_RUNTIME_CHANGED');
  if (JSON.stringify(await assetFingerprints()) !== JSON.stringify(metadata.assetSha256)) throw new Error('WEB_ASSETS_CHANGED');
  metadata.checks.stableInputAndRuntimeFingerprints = true; metadata.checks.stableWebAssets = true; metadata.completed = testStatus === 0;
  if (existsSync(report)) { const result = JSON.parse(await readFile(report, 'utf8')); metadata.tests = result.stats; if (result.stats.expected !== (recoveryMode ? 6 : 8) || result.stats.unexpected !== 0 || result.stats.flaky !== 0 || result.stats.skipped !== 0) throw new Error(recoveryMode ? 'EXACT_SIX_RECOVERY_NO_RETRY_NO_SKIP_REQUIRED' : 'EXACT_EIGHT_NO_RETRY_NO_SKIP_REQUIRED'); }
  if (!metadata.completed) throw new Error('BROWSER_INTEGRATION_ASSERTIONS_FAILED');
} catch (error) { metadata.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { await cleanup(); await writeFile(join(work, 'evidence.json'), JSON.stringify(metadata, null, 2) + '\n'); console.log(`Sanitized result: ${join(work, 'evidence.json')}`); }
