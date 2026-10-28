import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./review-browser", fullyParallel: false, workers: 1, retries: 0,
  reporter: "list", outputDir: "../../../review-browser-results",
  use: { baseURL: "http://127.0.0.1:4273", channel: "msedge" },
  webServer: { command: "node node_modules/vite/bin/vite.js --configLoader runner --host 127.0.0.1 --port 4273", url: "http://127.0.0.1:4273", reuseExistingServer: false, cwd: "../../" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }, { name: "mobile", use: { ...devices["Pixel 7"] } }],
});
