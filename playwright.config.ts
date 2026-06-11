import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: {
    // 4317, not vite's default preview port 4173: stale `vite preview`
    // servers from other checkouts squat on 4173 and reuseExistingServer
    // would silently run the whole suite against their old builds.
    baseURL: 'http://127.0.0.1:4317',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
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
