import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Fixtures = { newTrustedContext: () => Promise<BrowserContext> };

export const test = base.extend<Fixtures>({
  newTrustedContext: async ({ viewport }, provide) => {
    const ca = process.env.HOST_INTEGRATION_CA;
    if (!ca) throw new Error("Run scripts/run-host-integration.mjs to create the local test CA");
    const profiles: string[] = [];
    const contexts: BrowserContext[] = [];
    const unexpectedOrigins = new Set<string>();
    try {
      await provide(async () => {
        const profile = await mkdtemp(join(process.env.HOST_INTEGRATION_PROFILES_DIR ?? tmpdir(), "meet-me-chromium-trusted-"));
        profiles.push(profile);
        const options = {
          executablePath: process.env.HOST_INTEGRATION_BROWSER_EXECUTABLE,
          headless: true,
          viewport,
          baseURL: "https://localhost:8443",
          ignoreHTTPSErrors: false,
          serviceWorkers: "block" as const,
          // A local deny-only proxy blocks non-loopback transport without
          // Playwright routing, which would synthesize CORS preflight replies.
          proxy: { server: "http://127.0.0.1:8446", bypass: "localhost,127.0.0.1" },
          acceptDownloads: false,
          // Disable proxy inheritance for this local-only browser, without changing HOME or system trust.
          env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", http_proxy: "", https_proxy: "", all_proxy: "" },
        };
        // Initialize Chromium's profile-scoped Custom certificate database.
        // Its native OS file chooser cannot be driven through Playwright's DOM
        // filechooser API. Provision the documented version-1 store while closed,
        // then require the native certificate UI to recognize the trusted root.
        const initialize = await chromium.launchPersistentContext(profile, options);
        try {
          if (initialize.browser()?.version() !== "151.0.7922.173") throw new Error("Certificate-store provisioning is verified for Chromium 151.0.7922.173 only");
          const certificates = await initialize.newPage();
          await certificates.goto("chrome://certificate-manager/local");
          await certificates.getByRole("link", { name: /Installed by you/ }).click();
          await expect(certificates.getByRole("button", { name: "Import to Trusted Certificates", exact: true })).toBeVisible();
        } finally { await initialize.close(); }
        const root = new X509Certificate(await readFile(ca));
        if (!root.ca || !root.verify(root.publicKey)) throw new Error("Expected a self-signed local CA");
        const database = new DatabaseSync(join(profile, "Default/ServerCertificate"));
        try {
          const columns = database.prepare("PRAGMA table_info(certificates)").all().map(column => column.name);
          expect(columns).toEqual(["sha256hash_hex", "der_cert", "trust_settings"]);
          expect(database.prepare("SELECT CAST(value AS INTEGER) AS version FROM meta WHERE key = 'version'").get()?.version).toBe(1);
          expect(database.prepare("SELECT count(*) AS total FROM certificates").get()?.total).toBe(0);
          // Official CertificateMetadata protobuf: trust { trust_type: TRUSTED(3) }.
          database.exec("BEGIN IMMEDIATE");
          database.prepare("INSERT INTO certificates VALUES (?, ?, ?)").run(
            createHash("sha256").update(root.raw).digest("hex"), root.raw, Buffer.from("0a020803", "hex"),
          );
          database.exec("COMMIT");
        } finally { database.close(); }
        const context = await chromium.launchPersistentContext(profile, options);
        contexts.push(context);
        const certificates = await context.newPage();
        await certificates.goto("chrome://certificate-manager/local");
        await certificates.getByRole("link", { name: /Installed by you/ }).click();
        await expect(certificates.getByText("Meet me ephemeral integration CA", { exact: true })).toBeVisible();
        await certificates.close();
        context.on("request", request => {
          const url = new URL(request.url());
          const allowed = ["https://localhost:8443", "https://localhost:8444", "https://localhost:8445"];
          if (allowed.includes(url.origin)) return;
          unexpectedOrigins.add(url.origin);
        });
        return context;
      });
    } finally {
      await Promise.allSettled(contexts.map(context => context.close()));
      await Promise.all(profiles.map(profile => rm(profile, { recursive: true, force: true })));
      expect(unexpectedOrigins.size, "No page request may leave the local integration origins").toBe(0);
    }
  },
  context: async ({ newTrustedContext }, provide) => { await provide(await newTrustedContext()); },
});

export { expect };
