/**
 * How a backup is written and how a restore loads it.
 *
 * Lifted out of the admin route so the flags that make a backup portable and a
 * restore safe are stated in one place and can be checked by a test. All of
 * them matter:
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

/**
 * Ownership and privilege statements name the database user of the instance
 * the backup came from. A backup made under one user name and restored on an
 * instance whose `.env` names another, which is what moving to a new machine
 * produces, failed with "role does not exist" on the first of them. Backups
 * are now written without either (see buildDumpArgs), and a restore drops any
 * it finds in an older backup: everything the dump creates is then owned by
 * the user running the restore, which is the one the app connects as.
 */
const OWNERSHIP_LINE = /^ALTER [A-Z][A-Z ]* .+ OWNER TO .+;$/;
const PRIVILEGE_LINE = /^(?:GRANT|REVOKE) /;

/** Whether `line` is an `ALTER ... OWNER TO ...` statement. */
export function isOwnershipStatement(line: string): boolean {
  return OWNERSHIP_LINE.test(line);
}

/** Whether `line` is a GRANT or REVOKE statement. */
export function isPrivilegeStatement(line: string): boolean {
  return PRIVILEGE_LINE.test(line);
}

/** Table data in a dump sits between `COPY ... FROM stdin;` and a line holding `\.`. */
const COPY_START = /^COPY .* FROM stdin;$/;
const COPY_END = '\\.';

/** What prepareDumpForRestore left out, for the log. */
export interface SkippedStatements {
  settings: string[];
  ownership: number;
  privileges: number;
}

/**
 * Write the file psql actually loads: the preamble, then the dump without the
 * statements this server would reject. Streams line by line, since a dump can
 * be far larger than memory. Rows inside a COPY block are never inspected, so
 * a row that happens to start like a statement is left exactly as it is.
 */
export async function prepareDumpForRestore(
  sqlPath: string,
  outPath: string
): Promise<{ skipped: SkippedStatements }> {
  const skipped: SkippedStatements = { settings: [], ownership: 0, privileges: 0 };
  const out = createWriteStream(outPath);
  const write = async (line: string) => {
    if (!out.write(line + '\n')) await once(out, 'drain');
  };
  for (const line of RESTORE_PREAMBLE) await write(line);

  const lines = readline.createInterface({ input: createReadStream(sqlPath), crlfDelay: Infinity });
  let inCopy = false;
  for await (const line of lines) {
    if (inCopy) {
      if (line === COPY_END) inCopy = false;
    } else if (COPY_START.test(line)) {
      inCopy = true;
    } else if (isSettingUnknownToServer(line)) {
      skipped.settings.push(line);
      continue;
    } else if (isOwnershipStatement(line)) {
      skipped.ownership++;
      continue;
    } else if (isPrivilegeStatement(line)) {
      skipped.privileges++;
      continue;
    }
    await write(line);
  }
  out.end();
  await once(out, 'finish');
  return { skipped };
}

/**
 * Arguments for dumping the database at `dbUrl` to `sqlPath`. The dump drops
 * each object before recreating it, and names no owner and no privilege, so
 * it loads under whichever database user the restoring instance has.
 */
export function buildDumpArgs(dbUrl: string, sqlPath: string): string[] {
  return ['--dbname', dbUrl, '--file', sqlPath, '--clean', '--if-exists', '--no-owner', '--no-privileges'];
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
