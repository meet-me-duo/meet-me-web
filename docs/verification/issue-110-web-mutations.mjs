// Reproducible local fault checks in an ignored, isolated directory. No source is mutated in place.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Ancestor module resolution reuses the existing dependencies without junction creation.
const isolated = join(repo, "node_modules", `.issue110-independent-${Date.now()}`);
const hash = data => createHash("sha256").update(data).digest("hex");
const sources = ["src/api/operations.ts", "src/pages/OperationsPage.tsx", "src/pages/OperationsPage.css"];
const uiTest = "src/pages/OperationsPage.acceptance.test.tsx";
const apiTest = "src/api/operations.acceptance.test.ts";
const transportApiTest = "src/api/operations.transport.test.ts";
const transportUiTest = "src/pages/OperationsPage.transport.test.tsx";
const original = Object.fromEntries(await Promise.all(sources.map(async path => [path, await readFile(join(repo, path))])));
const mutations = [
  { name: "control", tests: [uiTest, apiTest, transportApiTest, transportUiTest] },
  { name: "null-to-zero", tests: [uiTest], file: sources[1], from: 'n === null ? unknown : String(n)', to: 'String(n ?? 0)' },
  { name: "known-subtotal-called-total", tests: [uiTest], file: sources[1], from: '알려진 비용 소계', to: '전체 비용' },
  { name: "unsafe-field-echo", tests: [uiTest], file: sources[1], from: '<header><span className="eyebrow subtle">', to: '{result && <pre>{JSON.stringify(result.data)}</pre>}<header><span className="eyebrow subtle">' },
  { name: "deny-retains-stale-summary", tests: [uiTest], file: sources[1], changes: [
    ['setState({ status: "loading" });', '// Deliberate fault: keep the last summary while loading.'],
    ['setState({ status: "error", message: operationsMessage(error) });', 'if (!(error instanceof OperationsError && [401, 403].includes(error.status))) setState({ status: "error", message: operationsMessage(error) });'],
  ] },
  { name: "allowlist-validation-bypass", tests: [apiTest], file: sources[0], from: 'const result = schema.parse(await response.json());', to: 'const result = await response.json();' },
  { name: "transport-unknown-zero", tests: [transportApiTest], file: sources[0], from: 'client_call_count: count.nullable().optional().default(null)', to: 'client_call_count: count.nullable().optional().default(null).transform(n => n ?? 0)' },
  { name: "transport-status-success", tests: [transportApiTest], file: sources[0], from: 'http_status: count.min(100).max(599).nullable(),', to: 'http_status: count.min(100).max(599).nullable().transform(() => 200),' },
];
await mkdir(join(isolated, "src/test"), { recursive: true });
await copyFile(join(repo, "src/test/setup.ts"), join(isolated, "src/test/setup.ts"));
await writeFile(join(isolated, "package.json"), '{"type":"module","private":true}\n');
await writeFile(join(isolated, "vite.config.ts"), `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], cacheDir: "./.isolated-vite-cache", test: {
  environment: "jsdom", setupFiles: "./src/test/setup.ts", include: ["cases/*/src/**/*.test.{ts,tsx}"]
} });\n`);
const evidence = { isolated, sourceHashes: Object.fromEntries(sources.map(path => [path, hash(original[path])])), cases: [] };
for (const mutation of mutations) {
  const root = join(isolated, "cases", mutation.name);
  for (const path of [...sources, ...mutation.tests]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(repo, path), join(root, path));
  }
  if (mutation.file) {
    let text = original[mutation.file].toString("utf8");
    for (const [from, to] of mutation.changes ?? [[mutation.from, mutation.to]]) {
      if (!text.includes(from)) throw new Error(`Mutation target missing: ${mutation.name}`);
      text = text.replace(from, to);
    }
    await writeFile(join(root, mutation.file), text);
  }
  evidence.cases.push({ name: mutation.name, tests: await Promise.all(mutation.tests.map(async path => ({ path, sha256: hash(await readFile(join(root, path))) }))) });
}
const prefix = process.argv[2] ?? "19";
if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error("Invalid evidence label");
const manifest = join(repo, `docs/verification/issue-110-web-logs/${prefix}-isolated-mutation-manifest.json`);
await writeFile(manifest, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ isolated, manifest }));
