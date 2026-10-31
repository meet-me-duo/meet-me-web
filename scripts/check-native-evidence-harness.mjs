import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fixed loopback-only preflight. Never discover or connect to a deployed service.
export async function checkNativeEvidenceHarness(fetcher = fetch) {
  const control = await fetcher("http://127.0.0.1:18933/health", { signal: AbortSignal.timeout(3000), redirect: "error" });
  if (!control.ok) throw new Error("Synthetic fixture control is unavailable");
  const metadata = await control.json();
  if (metadata.fixture !== "experimental-v2-native" || metadata.synthetic !== true || metadata.realModelCalls !== false) {
    throw new Error("Native evidence requires the synthetic-provider fixture with real model calls disabled");
  }
  const application = await fetcher("http://127.0.0.1:18932/v3/api-docs", { signal: AbortSignal.timeout(3000), redirect: "error" });
  if (!application.ok) throw new Error("Isolated application OpenAPI is unavailable");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await checkNativeEvidenceHarness();
  } catch {
    console.error("Native evidence harness is unavailable or is not synthetic-only. Start the isolated synthetic-provider application and control server on loopback ports 18932/18933 before running test:evidence:native. No provider request was sent by this preflight.");
    process.exitCode = 1;
  }
}
