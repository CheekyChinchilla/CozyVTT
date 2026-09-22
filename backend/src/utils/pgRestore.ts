/**
 * The psql arguments a restore runs with.
 *
 * Lifted out of the admin route so the flags that make a restore safe are
 * stated in one place and can be checked by a test. Both of them matter:
 *
 * A backup is written with `pg_dump --clean --if-exists`, so the dump begins by
 * dropping every table it is about to recreate. Run without care, a file that
 * was truncated or corrupted applies those drops, fails partway through
 * recreating them, and leaves the instance with neither the old data nor the
 * new. psql also exits 0 in that case, so the caller reports success.
 */

import { createReadStream, createWriteStream } from 'fs';
import { once } from 'events';
import readline from 'readline';

/**
 * Statements run before the dump itself.
 *
 * The dump drops and recreates only the objects it contains. A backup taken on
 * an older CozyVTT does not know about tables added since, so when one of those
 * references a table the dump is about to drop, the drop fails and the restore
 * stops; and a table the dump does not mention would otherwise survive with
 * stale rows. Replacing the schema first makes a restore mean what the screen
 * says: afterwards the database holds the backup and nothing else. The
 * statements sit at the top of the file psql loads with --single-transaction,
 * so a dump that fails to apply rolls the schema back too. Migrations then run
 * to bring an older backup up to the running version.
 */
export const RESTORE_PREAMBLE = ['DROP SCHEMA public CASCADE;', 'CREATE SCHEMA public;'];

/**
 * Settings a newer pg_dump writes that an older server rejects.
 *
 * The dump opens with SET statements for the session that loads it. A client
 * newer than the server can name a setting the server has never heard of:
 * pg_dump 17 and later set `transaction_timeout`, which PostgreSQL 15 and 16
 * refuse as an unrecognized configuration parameter, and with ON_ERROR_STOP
 * that one line fails the whole restore. Every Admin Dashboard backup made
 * while the backend image carried a newer client than the database has the
 * line, so a restore drops it. Each of these is a "no limit" default for the
 * loading session; leaving one out changes nothing about what is restored.
 */
const SETTINGS_UNKNOWN_TO_OLDER_SERVERS = ['transaction_timeout'];

const UNKNOWN_SETTING_LINE = new RegExp(`^SET (?:${SETTINGS_UNKNOWN_TO_OLDER_SERVERS.join('|')}) = `);

/** Whether `line` is a SET statement for a setting the server may not know. */
export function isSettingUnknownToServer(line: string): boolean {
  return UNKNOWN_SETTING_LINE.test(line);
}

/** The first statement of the dump body; the SET preamble ends before it. */
const DUMP_BODY_LINE = /^(?:DROP|CREATE|ALTER|COPY|SELECT|INSERT) /;

/**
 * Write the file psql actually loads: the preamble, then the dump with the
 * settings the server would reject removed from its header. Streams line by
 * line, since a dump can be far larger than memory. Filtering stops at the
 * first statement of the body so a data row is never mistaken for a setting.
 */
export async function prepareDumpForRestore(
  sqlPath: string,
  outPath: string
): Promise<{ removed: string[] }> {
  const removed: string[] = [];
  const out = createWriteStream(outPath);
  const write = async (line: string) => {
    if (!out.write(line + '\n')) await once(out, 'drain');
  };
  for (const line of RESTORE_PREAMBLE) await write(line);

  const lines = readline.createInterface({ input: createReadStream(sqlPath), crlfDelay: Infinity });
  let inHeader = true;
  for await (const line of lines) {
    if (inHeader && DUMP_BODY_LINE.test(line)) inHeader = false;
    if (inHeader && isSettingUnknownToServer(line)) {
      removed.push(line);
      continue;
    }
    await write(line);
  }
  out.end();
  await once(out, 'finish');
  return { removed };
}

/** Arguments for restoring `sqlPath` into the database at `dbUrl`. */
export function buildRestoreArgs(dbUrl: string, sqlPath: string): string[] {
  return [
    '--dbname',
    dbUrl,
    '--file',
    sqlPath,
    // Stop at the first statement that fails, and exit non-zero so the caller
    // knows. psql otherwise carries on to the end of the dump and still exits 0.
    '-v',
    'ON_ERROR_STOP=1',
    // Wrap the restore in one transaction, so a dump that fails halfway takes
    // its own drops back out with it and the existing data is still there.
    '--single-transaction',
  ];
}
