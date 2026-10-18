import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = resolve(process.env.HOST_INTEGRATION_SERVER_REPO ?? join(web, "../meet-me-server"));
const sourceRevision = "91eb2505ddf6b4db549a5bc2b8b07f11e514d0b0";
const project = `meetme-host-${process.pid}-${Date.now()}`;
const work = await mkdtemp(join(tmpdir(), "meetme-host-integration-"));
const source = join(work, "server");
const dist = join(work, "dist");
const composeFile = join(web, "integration/host-creation/compose.yml");
const log = join(work, "build.log");
const inputFiles = ["scripts/run-host-integration.mjs", "playwright.host-integration.config.ts", "integration/host-creation/compose.yml", "integration/host-creation/fixtures.ts", "integration/host-creation/host-creation.spec.ts"];
const origins = { web: "https://localhost:8443", api: "https://localhost:8444", denied: "https://localhost:8445" };
const listeners = [];
const metadata = { sourceRevision, webRevision: "", completed: false, actualProviderCalls: null, checks: {}, limitations: ["Local Chromium desktop/mobile viewport; not a real mobile device", "Worker, rate limit and retention disabled only for this isolated run", "Localhost ports test cross-origin CORS, not production subdomain host isolation", "No provider interpretation, recommendations, social login or production verification"] };
let composeStarted = false;
let composeEnv;
let apiHost;
let activeTests;
let browserProbe;
let cleanupPromise;
let interrupted = false;

// Pass tool/cache configuration only; never copy operational credentials to builds or runtimes.
const childEnv = Object.fromEntries(["PATH", "LANG", "LC_ALL", "JAVA_HOME", "JAVA_TOOL_OPTIONS", "GRADLE_USER_HOME", "GRADLE_OPTS", "COREPACK_HOME", "PNPM_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "PLAYWRIGHT_BROWSERS_PATH", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"].filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: web, env: childEnv, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`Tool failed: ${command} ${args[0] ?? ""}; see local logs (${result.status ?? "spawn"})`);
  return result.stdout.trim();
}
function compose(args) { return run("docker", ["compose", "-p", project, "-f", composeFile, ...args], { env: composeEnv }); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function fingerprints() { return Object.fromEntries(await Promise.all(inputFiles.map(async path => [path, digest(await readFile(join(web, path)))]))); }
function cleanup() {
  cleanupPromise ??= (async () => {
    if (activeTests?.pid) { try { process.kill(-activeTests.pid, "SIGTERM"); } catch { /* Already exited. */ } }
    await browserProbe?.close();
    await Promise.all(listeners.map(listener => new Promise(resolveClose => { listener.closeAllConnections(); listener.close(resolveClose); })));
    if (composeStarted) { try { compose(["down", "--volumes", "--remove-orphans"]); } catch { metadata.cleanupFailed = true; process.exitCode = 1; } }
    await Promise.all(["ca.key", "localhost.key", "untrusted-profile", "profiles"].map(path => rm(join(work, path), { recursive: true, force: true })));
    metadata.checks.privateKeysAndProfilesRemoved = true;
  })();
  return cleanupPromise;
}
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => {
    interrupted = true;
    metadata.completed = false;
    metadata.error = "Run interrupted";
    void cleanup().then(async () => {
      await writeFile(join(work, "evidence.json"), JSON.stringify(metadata, null, 2) + "\n");
      process.exit(code);
    });
  });
}
async function waitForApi() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const healthy = await new Promise(resolveProbe => {
      const request = http.get(`http://${apiHost}:8080/actuator/health`, response => { response.resume(); resolveProbe(response.statusCode === 200); });
      request.setTimeout(1000, () => request.destroy());
      request.on("error", () => resolveProbe(false));
    });
    if (healthy) return;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error("Isolated API did not become healthy in 120 seconds");
}
async function listen(port, tls, handler) {
  const listener = https.createServer(tls, handler);
  await new Promise((resolveListen, reject) => { listener.once("error", reject); listener.listen(port, "127.0.0.1", resolveListen); });
  listeners.push(listener);
}
async function createTls() {
  const ca = join(work, "ca.pem"), key = join(work, "localhost.key"), certificate = join(work, "localhost.pem");
  run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(work, "ca.key"), "-out", ca, "-days", "1", "-subj", "/CN=Meet me ephemeral integration CA", "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0", "-addext", "keyUsage=critical,keyCertSign,cRLSign"]);
  run("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", join(work, "localhost.csr"), "-subj", "/CN=localhost"]);
  await writeFile(join(work, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  run("openssl", ["x509", "-req", "-in", join(work, "localhost.csr"), "-CA", ca, "-CAkey", join(work, "ca.key"), "-CAcreateserial", "-out", certificate, "-days", "1", "-extfile", join(work, "leaf.ext")]);
  await chmod(key, 0o600); await chmod(join(work, "ca.key"), 0o600);
  run("openssl", ["verify", "-CAfile", ca, "-verify_hostname", "localhost", certificate]);
  metadata.checks.certificateChain = true;
  return { ca, key: await readFile(key), cert: await readFile(certificate) };
}
function proxyApi(request, response) {
  const upstream = http.request({ hostname: apiHost, port: 8080, method: request.method, path: request.url, headers: request.headers }, remote => {
    response.writeHead(remote.statusCode, remote.headers); remote.pipe(response);
  });
  upstream.on("error", () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.pipe(upstream);
}
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
async function serveWeb(request, response) {
  try {
    const path = decodeURIComponent(new URL(request.url, origins.web).pathname);
    let target = resolve(dist, `.${path}`);
    if (!target.startsWith(dist + sep)) target = join(dist, "index.html");
    if (!existsSync(target) || !extname(target)) target = join(dist, "index.html");
    const actual = await realpath(target);
    if (!actual.startsWith(dist + sep)) { response.writeHead(403); response.end(); return; }
    response.writeHead(200, { "Content-Type": contentTypes[extname(actual)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    createReadStream(actual).pipe(response);
  } catch { response.writeHead(404); response.end(); }
}

try {
  console.log("Preparing fixed server revision in an isolated directory");
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("The isolated certificate fixture requires Node 24 or newer");
  run("docker", ["info", "--format", "{{.ServerVersion}}"]);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
}

try {
  if (process.exitCode) throw new Error("Preflight failed");
  run("git", ["-C", server, "cat-file", "-e", `${sourceRevision}^{commit}`]);
  metadata.webRevision = run("git", ["rev-parse", "HEAD"]);
  metadata.inputSha256 = await fingerprints();
  const archive = spawnSync("git", ["-C", server, "archive", sourceRevision], { maxBuffer: 64 * 1024 * 1024 });
  if (archive.status !== 0) throw new Error("Cannot read fixed server revision");
  await mkdir(source); await writeFile(join(work, "server.tar"), archive.stdout);
  run("tar", ["-xf", join(work, "server.tar"), "-C", source]);
  const java = join(childEnv.JAVA_HOME ?? "", "bin/java");
  if (!childEnv.JAVA_HOME || !existsSync(java)) throw new Error("Set JAVA_HOME to a local JDK 17; no system installation is attempted");
  const version = spawnSync(java, ["-version"], { env: childEnv, encoding: "utf8" });
  if (!/version "17\./.test(version.stderr)) throw new Error("The fixed backend requires JDK 17");
  console.log("Building the unchanged server and web bundle (local logs only)");
  const build = spawnSync("bash", ["./gradlew", "--no-daemon", "bootJar"], { cwd: source, env: childEnv, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  await writeFile(log, (build.stdout ?? "") + (build.stderr ?? ""));
  if (build.error || build.status !== 0) throw new Error("Fixed server build failed; inspect build.log");
  const jar = join(source, "build/libs/meet-me-server-0.0.1-SNAPSHOT.jar");
  metadata.serverJarSha256 = digest(await readFile(jar));
  const bundleEnv = { ...childEnv, VITE_API_BASE_URL: origins.api };
  run("corepack", ["pnpm", "exec", "tsc", "-b"], { env: bundleEnv });
  run("corepack", ["pnpm", "exec", "vite", "build", "--configLoader", "runner", "--outDir", dist], { env: bundleEnv });
  metadata.checks.webBuild = true;
  composeEnv = { ...childEnv, HOST_INTEGRATION_JAR: jar };
  composeStarted = true;
  compose(["up", "--detach", "--wait", "--wait-timeout", "120"]);
  const db = compose(["ps", "--quiet", "db"]);
  const api = compose(["ps", "--quiet", "api"]);
  const runtimeEnv = Object.fromEntries(JSON.parse(run("docker", ["inspect", api, "--format", "{{json .Config.Env}}"])).map(value => {
    const separator = value.indexOf("="); return [value.slice(0, separator), value.slice(separator + 1)];
  }));
  if (runtimeEnv.GEMINI_API_KEY !== "" || runtimeEnv.OPENAI_API_KEY !== "" || runtimeEnv.RELIABILITY_ENABLED !== "false") throw new Error("Runtime must have empty provider keys and disabled workers");
  metadata.checks.runtimeProviderKeysEmptyAndWorkersDisabled = true;
  const network = run("docker", ["inspect", "--format", "{{range $name, $value := .NetworkSettings.Networks}}{{$name}}{{end}}", api]);
  if (run("docker", ["network", "inspect", network, "--format", "{{.Internal}}"] ) !== "true") throw new Error("Runtime network must be internal");
  apiHost = run("docker", ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", api]);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(apiHost)) throw new Error("Expected one local IPv4 container address");
  await waitForApi();
  metadata.checks.internalRuntimeNetwork = true;
  const tls = await createTls();
  await listen(8443, tls, serveWeb); await listen(8444, tls, proxyApi);
  await listen(8445, tls, (_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end("<!doctype html><title>Unapproved local origin</title>"); });
  const denyProxy = http.createServer((_request, response) => { response.writeHead(403); response.end(); });
  denyProxy.on("connect", (_request, socket) => socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"));
  await new Promise((resolveListen, reject) => { denyProxy.once("error", reject); denyProxy.listen(8446, "127.0.0.1", resolveListen); });
  listeners.push(denyProxy);
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.HOST_INTEGRATION_BROWSER_EXECUTABLE;
  const untrusted = await chromium.launchPersistentContext(join(work, "untrusted-profile"), { executablePath, headless: true, ignoreHTTPSErrors: false, proxy: { server: "http://127.0.0.1:8446", bypass: "localhost,127.0.0.1" }, env: { ...childEnv, HTTP_PROXY: "", HTTPS_PROXY: "", http_proxy: "", https_proxy: "" } });
  browserProbe = untrusted;
  metadata.browserVersion = untrusted.browser()?.version();
  try {
    const page = await untrusted.newPage();
    let rejected = false;
    try { await page.goto(origins.web); } catch (error) { rejected = /ERR_CERT_AUTHORITY_INVALID/.test(error.message); }
    if (!rejected) throw new Error("TLS negative control did not reject an untrusted local CA");
    metadata.checks.untrustedCaRejected = true;
  } finally { await untrusted.close(); browserProbe = undefined; }
  const report = join(work, "playwright.json");
  await mkdir(join(work, "profiles"));
  const testEnv = { ...childEnv, ...(executablePath ? { HOST_INTEGRATION_BROWSER_EXECUTABLE: executablePath } : {}), HOST_INTEGRATION_CA: tls.ca, HOST_INTEGRATION_PROFILES_DIR: join(work, "profiles"), HOST_INTEGRATION_WEB_ORIGIN: origins.web, HOST_INTEGRATION_API_ORIGIN: origins.api, HOST_INTEGRATION_DB_CONTAINER: db, HOST_INTEGRATION_REPORT: report, HOST_INTEGRATION_OUTPUT: join(work, "test-results") };
  console.log("Running real HTTPS browser/API/DB tests with provider workers disabled");
  // Keep the local HTTPS/proxy event loop serving requests while tests run.
  const testStatus = await new Promise((resolveTest, reject) => {
    const tests = spawn("corepack", ["pnpm", "exec", "playwright", "test", "--config", "playwright.host-integration.config.ts", ...process.argv.slice(2)], { cwd: web, env: testEnv, stdio: "inherit", detached: true });
    activeTests = tests;
    tests.once("error", reject);
    tests.once("close", code => resolveTest(code));
  });
  activeTests = undefined;
  if (interrupted) throw new Error("Run interrupted");
  const admittedAttempts = run("docker", ["exec", db, "psql", "-U", "meetme", "-d", "meetme", "-tAc", "SELECT count(*) FROM coordination_attempts"]);
  metadata.admittedAttempts = Number(admittedAttempts);
  if (metadata.admittedAttempts !== 0) throw new Error("Expected zero admitted attempts");
  metadata.checks.zeroAdmittedAttempts = true;
  // Actual provider calls are independently precluded by the internal-only
  // runtime network, disabled workers and explicitly empty provider keys.
  metadata.actualProviderCalls = 0;
  if (JSON.stringify(await fingerprints()) !== JSON.stringify(metadata.inputSha256)) throw new Error("Integration source changed during execution");
  metadata.checks.stableInputFingerprints = true;
  metadata.completed = testStatus === 0;
  if (existsSync(report)) {
    const result = JSON.parse(await readFile(report, "utf8"));
    metadata.tests = { expected: result.stats.expected, unexpected: result.stats.unexpected, flaky: result.stats.flaky, skipped: result.stats.skipped };
  }
  if (!metadata.completed) throw new Error("Browser integration tests failed; inspect local test results");
} catch (error) {
  metadata.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  await cleanup();
  await writeFile(join(work, "evidence.json"), JSON.stringify(metadata, null, 2) + "\n");
  console.log(`Sanitized result: ${join(work, "evidence.json")}`);
}
