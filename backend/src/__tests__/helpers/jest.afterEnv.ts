/**
 * Runs inside every test file, after jest's own hooks are installed.
 *
 * Jest gives each test file its own module registry, so each file that
 * touches the database builds its own Prisma clients: the app's (through
 * config/database.ts) and the test helpers'. Workers are reused across
 * files, and a client that is never disconnected keeps its connections
 * until the worker exits, so a full run accumulated one pool per file per
 * worker and reached PostgreSQL's connection ceiling late in the run, with
 * unrelated suites failing on "too many clients already". Every file now
 * lets both clients go when it finishes.
 *
 * This hook is declared before anything in the test file, and jest runs a
 * file's top-level afterAll hooks in the order they were declared, so it runs
 * first. A file whose own afterAll then queries the database, to clean up,
 * opens a client again, and has to end that afterAll with its own
 * `$disconnect()`.
 */
afterAll(async () => {
  const cached = (global as unknown as { prisma?: { $disconnect(): Promise<void> } }).prisma;
  if (cached) await cached.$disconnect();
  // The helpers' client, whether or not this file imported it: an unused
  // client has no connections and disconnecting it costs nothing.
  const helpers = (await import('./db')) as { prisma: { $disconnect(): Promise<void> } };
  await helpers.prisma.$disconnect();
});
