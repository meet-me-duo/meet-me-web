import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

const webServer = base.webServer;
if (!webServer || Array.isArray(webServer)) throw new Error("Expected the standard single preview server");

// Same synthetic suite and popup fixture as CI; use the free system Chromium.
export default defineConfig({
  ...base,
  retries: 0,
  workers: 2,
  outputDir: "test-results/local-e2e",
  reporter: [["list"], ["json", { outputFile: "test-results/local-browser.json" }]],
  use: { ...base.use, launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium" } },
  webServer: { ...webServer, reuseExistingServer: false },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "mobile", use: devices["Pixel 7"] },
  ],
});
