import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./integration/evidence",
  testMatch: "evidence-contract.spec.ts",
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4188", launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? (process.env.CI ? undefined : "/usr/bin/chromium") } },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 4188 --strictPort",
    url: "http://127.0.0.1:4188",
    reuseExistingServer: false,
  },
  projects: [{ name: "desktop", use: devices["Desktop Chrome"] }, { name: "mobile", use: devices["Pixel 7"] }],
});
