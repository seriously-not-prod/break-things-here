/**
 * Axe-core accessibility test configuration (#815).
 *
 * Extends the root playwright.config.ts but targets only the tests/a11y/
 * directory and runs in Chromium only (axe audits are browser-engine agnostic).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ...(process.env.CI ? [['junit', { outputFile: 'a11y-results.xml' }] as [string, object]] : []),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
