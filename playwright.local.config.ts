import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected the standard single preview server");
const port = process.env.LOCAL_E2E_PORT ?? "4173";
const origin = `http://127.0.0.1:${port}`;

// Same synthetic suite and popup fixture as CI; use the free system Chromium.
export default defineConfig({
  ...base,
  retries: 0,
  workers: 2,
  outputDir: "test-results/local-e2e",
  reporter: [["list"], ["json", { outputFile: "test-results/local-browser.json" }]],
  use: { ...base.use, baseURL: origin, launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" } },
  webServer: { ...webServer, command: webServer.command.replace("--port 4173", `--port ${port}`), url: origin, reuseExistingServer: false },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "mobile", use: devices["Pixel 7"] },
  ],
});
