import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Quote Reply for Gemini (Manifest V3)
 * Runs against Chromium with extension loading fixtures.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 35000,
  expect: {
    timeout: 7000,
  },
  fullyParallel: false, // Keep serial to avoid profile lock contention
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker avoids multiple chrome processes locking .test-user-data
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
