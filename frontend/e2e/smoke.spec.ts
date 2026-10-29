import { test, expect, type Page } from '@playwright/test';
import { ADMIN, PRODUCTION } from './instance';
import { COMPACT_LAYOUT_QUERY } from '../src/constants/layout';

/** How far the page reaches past the screen's right edge. A phone widens its
 * layout to whatever overflows, so the window's width would hide it. */
const sidewaysOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - screen.width);

/** Whether this project's screen gets the campaign page's compact layout:
 * the browser is asked the app's own query, so the split is written once
 * (the phone and iphone projects do; the desktop and an iPad in landscape do
 * not). */
const onPhone = (page: Page) => page.evaluate((query) => window.matchMedia(query).matches, COMPACT_LAYOUT_QUERY);

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
  // WebKit on a small runner has taken over five seconds to finish the create.
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const live = page.waitForEvent('websocket', (socket) => socket.url().includes('/socket.io/'));
  await page.getByRole('button', { name: new RegExp(name) }).click();

  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const socket = await live;
  expect(socket.isClosed()).toBe(false);

  // On a phone the table is the compact layout: the map, and a bar along
  // the bottom whose buttons open the panels as sheets over it. Chat opens
  // the chat, and the page fits the screen with it open; the session rail's
  // hidden tab names once sat 200 pixels past the edge, so a phone's page
  // scrolled sideways.
  if (await onPhone(page)) {
    const bar = page.getByRole('navigation', { name: 'Table' });
    await expect(bar).toBeVisible();
    await expect(page.locator('[data-panel]')).toHaveCount(0);
    await bar.getByRole('button', { name: /^Chat/ }).click();
    await expect(page.getByRole('dialog', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Chat message' })).toBeVisible();
    expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  } else {
    await expect(page.getByRole('navigation', { name: 'Table' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();
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

test('fits the sign-in page and the dashboard on a phone without sideways scrolling', async ({ page }) => {
  await page.goto('/auth/login');
  test.skip(!(await onPhone(page)), 'A phone-sized check.');
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your Campaigns' })).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});
