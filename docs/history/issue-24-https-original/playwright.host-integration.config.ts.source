import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./integration/host-creation",
  testMatch: "host-creation.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["json", { outputFile: process.env.HOST_INTEGRATION_REPORT }]],
  outputDir: process.env.HOST_INTEGRATION_OUTPUT ?? "/tmp/meet-me-host-integration-results",
  use: {
    browserName: "chromium",
    baseURL: "https://localhost:8443",
    ignoreHTTPSErrors: false,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "chromium-desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "chromium-mobile-viewport", use: { viewport: { width: 390, height: 844 } } },
  ],
});
