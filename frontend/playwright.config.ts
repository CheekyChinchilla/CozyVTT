import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/instance';

/**
 * End-to-end smoke tests: a real browser against a running CozyVTT. CI runs
 * them against the production stack, built and started with Docker Compose
 * (.github/workflows/ci.yml), so the bundled nginx, the page's security
 * headers and the live connection through the proxy are all in the path.
 * They are few on purpose: unit and component tests cover behaviour, and
 * these check that the pieces still meet.
 *
 * The first project finishes the setup wizard on a fresh instance; the other
 * two run the smoke tests after it, at a desktop and a phone size. One worker,
 * since they share the instance. Settings are in e2e/instance.ts.
 */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /instance\.setup\.ts/ },
    { name: 'desktop', testMatch: /\.spec\.ts/, use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'phone', testMatch: /\.spec\.ts/, use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
  ],
});
