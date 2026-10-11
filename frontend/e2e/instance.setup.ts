import { test as setup, expect } from '@playwright/test';
import { ADMIN, SETUP_TOKEN } from './instance';

setup('a fresh instance makes its first administrator through the setup wizard', async ({ page, request }) => {
  const status = (await (await request.get('/api/setup/status')).json()) as { setupCompleted: boolean };
  setup.skip(status.setupCompleted, 'The instance is set up already; the specs sign in as E2E_ADMIN_EMAIL.');
  expect(SETUP_TOKEN, 'E2E_SETUP_TOKEN must name the instance\'s setup token').not.toBe('');

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByLabel('Setup token').fill(SETUP_TOKEN);
  await page.getByLabel('Display Name').fill(ADMIN.displayName);
  await page.getByLabel('Email Address').fill(ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
  await page.getByLabel('Confirm Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Complete Setup' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Your Campaigns' })).toBeVisible();
});
