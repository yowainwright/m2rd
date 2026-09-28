import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, '.next/cache/playwright');
const testDir = resolve(root, 'tests/e2e');
const port = process.env.M2RD_PREVIEW_PORT || '54784';
const baseURL = `http://127.0.0.1:${port}/m2rd/`;

export default defineConfig({
  outputDir,
  testDir,
  timeout: 30_000,
  workers: 2,
  webServer: {
    cwd: root,
    command: 'pnpm run preview',
    url: baseURL,
    reuseExistingServer: false,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
});
