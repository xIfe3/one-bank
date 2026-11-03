import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the locally running stack:
 *   docker compose up -d && pnpm mail && pnpm dev
 * Uses the installed Google Chrome (channel: 'chrome') so no browser download is needed.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    channel: 'chrome',
    baseURL: process.env.WEB_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
