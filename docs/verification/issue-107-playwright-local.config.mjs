import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

// Equivalent checked-in reproduction of the local system-Chromium config used
// for the independent synthetic desktop/mobile gate. Native has a separate script.
export default defineConfig({
  testDir: resolve('e2e'), timeout: 15_000, fullyParallel: true, workers: 2, retries: 0,
  reporter: [['json', { outputFile: resolve('.codex/tdd-evidence/issue-107-web-precheck-browser-green-result.json') }]],
  use: { baseURL: 'http://127.0.0.1:4175', launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --configLoader runner --host 127.0.0.1 --port 4175',
    cwd: process.cwd(), url: 'http://127.0.0.1:4175', reuseExistingServer: false,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }],
});
