// Playwright E2E config. Local-first: assumes the Lattice stack (backend
// services + Vite dev server on :3000) is ALREADY running — no webServer
// block on purpose, so `npm run e2e` never starts or stops anything.
//
// One-time prerequisite: npx playwright install chromium
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
