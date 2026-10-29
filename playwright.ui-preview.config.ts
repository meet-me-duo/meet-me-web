import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./integration/ui-preview",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4175",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined,
  },
  webServer: {
    command: "node scripts/preview-ui.mjs",
    env: { VITE_API_BASE_URL: "https://ui-preview-must-not-connect.invalid" },
    url: "http://127.0.0.1:4175/__preview",
    reuseExistingServer: false,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
