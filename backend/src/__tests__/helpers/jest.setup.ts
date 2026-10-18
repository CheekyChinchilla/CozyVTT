/**
 * Runs in every jest worker before its test files load.
 *
 * Each worker holds two Prisma clients (the app's and the test helpers'), and
 * each client's pg pool opens up to ten connections unless the address sets
 * `connection_limit` (config/prismaClient.ts). A full run with several
 * workers that also fires parallel requests once reached PostgreSQL's default
 * ceiling of a hundred: unrelated suites failed with "too many clients
 * already". Five connections a client is plenty for a test file, and keeps
 * the whole run far below the ceiling whatever the machine.
 */
const url = process.env.DATABASE_URL;
if (url && !/[?&]connection_limit=/.test(url)) {
  process.env.DATABASE_URL = `${url}${url.includes('?') ? '&' : '?'}connection_limit=5`;
}
