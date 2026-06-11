import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4317',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // NOT 4173: that is `vite preview`'s default port, and a stale preview of a
    // prod build (no e2e harness) silently hijacks the suite via reuseExistingServer.
    command: 'npm run dev -- --host 127.0.0.1 --port 4317 --strictPort',
    url: 'http://127.0.0.1:4317/?e2e=1',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_E2E: '1',
    },
  },
  projects: [
    {
      name: 'android-webview-smoke',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
    },
  ],
});
