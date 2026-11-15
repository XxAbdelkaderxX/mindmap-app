import { defineConfig, devices } from '@playwright/test';

const chromium = { browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'phone-portrait', use: { ...devices['iPhone 13'], ...chromium } },
    { name: 'phone-landscape', use: { ...devices['iPhone 13 landscape'], ...chromium } },
    { name: 'small-phone', use: { ...devices['iPhone SE'], ...chromium } },
    { name: 'android-landscape', use: { ...devices['Pixel 7 landscape'], ...chromium } },
    { name: 'tablet', use: { ...devices['iPad Mini landscape'], ...chromium } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
