import { test, expect, type Page } from '@playwright/test';
import { ADMIN, PRODUCTION } from './instance';

/** How far the page reaches past the screen's right edge. A phone widens its
 * layout to whatever overflows, so the window's width would hide it. */
const sidewaysOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - screen.width);

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('signs in and out', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your Campaigns' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out of CozyVTT' }).click();

  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});

test('creates a campaign and opens its table, with a live connection through the proxy', async ({ page }, testInfo) => {
  const name = `Smoke ${testInfo.project.name} ${Date.now()}`;
  await signIn(page);

  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create Campaign' });
  await dialog.getByLabel('Campaign Name').fill(name);
  await dialog.getByRole('button', { name: 'Create Campaign' }).click();
  await expect(dialog).toBeHidden();

  const live = page.waitForEvent('websocket', (socket) => socket.url().includes('/socket.io/'));
  await page.getByRole('button', { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const socket = await live;
  expect(socket.isClosed()).toBe(false);

  // On a phone the table opens behind a notice; past it, the table fits the
  // screen. The session rail's tab names (hidden text) once sat 200 pixels
  // past the edge there, so the whole page scrolled sideways.
  if (testInfo.project.name === 'phone') {
    await page.getByRole('button', { name: 'Continue anyway' }).click();
    await expect(page.getByRole('heading', { name: 'Desktop Required' })).toBeHidden();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  }
});

test('answers the API with JSON, and serves the page with its security headers', async ({ page }) => {
  const config = await page.request.get('/api/config');
  expect(config.ok()).toBe(true);
  expect(config.headers()['content-type']).toContain('application/json');

  test.skip(!PRODUCTION, 'Only the production stack\'s nginx sends the page\'s headers (E2E_PRODUCTION=1).');
  const response = await page.goto('/auth/login');
  const headers = response?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('fits the sign-in page and the dashboard on a phone without sideways scrolling', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'A phone-sized check.');
  await page.goto('/auth/login');
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your Campaigns' })).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});
