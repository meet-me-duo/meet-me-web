import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./integration/evidence",
  testMatch: "evidence-native.spec.ts",
  outputDir: "./test-results/evidence-native",
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: { baseURL: "http://127.0.0.1:4189", trace: "off", launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? (process.env.CI ? undefined : "/usr/bin/chromium") } },
  webServer: { command: "node node_modules/vite/bin/vite.js --config vite.evidence-native.config.ts --configLoader runner", url: "http://127.0.0.1:4189", reuseExistingServer: false },
  projects: [{ name: "desktop", use: devices["Desktop Chrome"] }, { name: "mobile", use: devices["Pixel 7"] }],
});
