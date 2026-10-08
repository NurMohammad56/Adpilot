import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    timeout: 45000,
    env: {
      APP_MODE: 'demo',
      PORT: '4173',
      APP_ORIGIN: 'http://127.0.0.1:4173',
      DATA_FILE: `.data/e2e-${process.pid}.json`,
      STORAGE_PATH: `.data/e2e-uploads-${process.pid}`,
      STORAGE_DRIVER: 'local',
    },
  },
});
