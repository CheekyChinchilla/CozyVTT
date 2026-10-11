/**
 * The instance the smoke tests run against, from the environment:
 *
 *   E2E_BASE_URL        its address; http://localhost:8080 unless set
 *   E2E_SETUP_TOKEN     the setup wizard's token (SETUP_TOKEN in its .env),
 *                       needed only while the instance has not been set up
 *   E2E_ADMIN_EMAIL     the administrator the setup spec makes, and every
 *   E2E_ADMIN_PASSWORD  other spec signs in as
 *   E2E_PRODUCTION      set to 1 when the address is the production stack,
 *                       whose nginx sends the page's security headers
 *
 * Against an instance that is already set up, the administrator must exist.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
export const SETUP_TOKEN = process.env.E2E_SETUP_TOKEN ?? '';
export const PRODUCTION = process.env.E2E_PRODUCTION === '1';

export const ADMIN = {
  displayName: 'Smoke Test Admin',
  email: process.env.E2E_ADMIN_EMAIL ?? 'smoke-admin@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Smoke-Test-Passw0rd!',
};
