import assert from "node:assert/strict";
import test from "node:test";
import { checkNativeEvidenceHarness } from "./check-native-evidence-harness.mjs";

const metadata = { fixture: "experimental-v2-native", synthetic: true, realModelCalls: false };
test("native preflight requires synthetic-only metadata before checking the application", async () => {
  for (const invalid of [{ ...metadata, realModelCalls: true }, { ...metadata, synthetic: false }, { ...metadata, fixture: "other" }]) {
    const calls = [];
    await assert.rejects(checkNativeEvidenceHarness(async url => {
      calls.push(url);
      return { ok: true, json: async () => invalid };
    }), /synthetic-provider/);
    assert.deepEqual(calls, ["http://127.0.0.1:18933/health"]);
  }
});
test("native preflight fails when the isolated application is unavailable", async () => {
  await assert.rejects(checkNativeEvidenceHarness(async url => url.endsWith("/health")
    ? { ok: true, json: async () => metadata }
    : { ok: false }), /OpenAPI/);
});
test("native preflight succeeds only with both fixed loopback dependencies", async () => {
  const calls = [];
  await checkNativeEvidenceHarness(async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "error");
    return { ok: true, json: async () => metadata };
  });
  assert.deepEqual(calls, ["http://127.0.0.1:18933/health", "http://127.0.0.1:18932/v3/api-docs"]);
});
