/**
 * Runs in every jest worker before its test files load.
 *
 * Each worker holds two Prisma clients (the app's and the test helpers'), and
 * Prisma sizes each pool at twice the CPU count plus one. Three workers on a
 * four-core machine can therefore open sixty or more connections at once, and
 * a full run that also fires parallel requests reached PostgreSQL's default
 * ceiling of a hundred: unrelated suites failed with "too many clients
 * already". Five connections a client is plenty for a test file, and keeps
 * the whole run far below the ceiling whatever the machine.
 */
const url = process.env.DATABASE_URL;
if (url && !/[?&]connection_limit=/.test(url)) {
  process.env.DATABASE_URL = `${url}${url.includes('?') ? '&' : '?'}connection_limit=5`;
}
