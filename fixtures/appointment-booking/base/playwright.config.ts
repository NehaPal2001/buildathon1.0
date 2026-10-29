import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e/specs',
  // One shared in-memory store: run serially, reset before each test (see e2e/fixtures.ts).
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Frozen clock so slot times and time-based rules are deterministic.
    env: { PORT: String(port), FAKE_NOW: '2026-03-02T08:00:00.000Z' },
  },
});
