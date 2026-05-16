import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration (#681).
 * Run: npm run test:e2e
 * All tests run against the local Docker stack: backend :4000, frontend :5173
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['junit', { outputFile: 'playwright-results.xml' }] as [string, object]] : []),
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'echo "Assuming dev stack is already running"',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 10000,
      },
});
