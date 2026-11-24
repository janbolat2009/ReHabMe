// E2E: boots an isolated API (fresh SQLite, local auth, ML service deliberately absent) + the Vite dev server.
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 3101
const WEB_PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    // Uses the locally installed Chrome when available (no browser download needed); CI installs Chromium.
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'node server/index.js',
      port: API_PORT,
      reuseExistingServer: false,
      env: { APP_ENV: 'development', PORT: String(API_PORT), DATABASE_PATH: 'test-results/e2e.sqlite', LOG_LEVEL: 'warn', ML_SERVICE_URL: 'http://127.0.0.1:1', CORS_ORIGINS: `http://localhost:${WEB_PORT}` },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: `http://localhost:${API_PORT}`, VITE_AUTH_PROVIDER: 'local' },
    },
  ],
})
