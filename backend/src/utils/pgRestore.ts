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
import { randomBytes } from 'crypto';
import { once } from 'events';

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
 * Statements run after the dump, in the same transaction.
 *
 * Login sessions live in `public.session`, beside the app's tables. New
 * backups leave its rows out (see buildDumpArgs), but every backup made
 * before that carries them, and a restore would bring back each sign-in
 * that had not yet expired, ones ended since by a password change or an
 * account removal included. So a restore ends by emptying the table, which
 * a very old backup may not have at all, hence the check. The restore
 * script (backend/scripts/restore.sh) appends the same statement, and
 * keepInStep.test.ts fails if the two differ.
 */
export const RESTORE_TRAILER = [
  "DO $$ BEGIN IF to_regclass('public.session') IS NOT NULL THEN DELETE FROM public.session; END IF; END $$;",
];

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

/**
 * What a file has to look like before any of it is loaded.
 *
 * A restore replaces the whole database, so it may only start from a complete
 * backup, and psql cannot tell one from a broken file: an empty dump, or one
 * cut short before its CREATE TABLEs, loads without an error, the schema
 * replacement above commits, and the instance is left empty while the restore
 * reports success. So a file is refused unless, outside its table data, it
 * ends with the trailer pg_dump writes last and creates the tables every
 * CozyVTT database has.
 *
 * psql also runs whatever the file says, as the database owner. A backslash
 * command such as `\!` runs a shell command in the backend container, `COPY
 * ... PROGRAM` runs one in the database container, and a `COMMIT` would make
 * the drops at the top permanent partway through. pg_dump starts no line with
 * any of those, so a line that starts with one is refused. The backslash half
 * is also closed at the source: the file psql loads opens with `\restrict`
 * under a key the backup cannot know, which makes psql refuse every other
 * backslash command, wherever it sits, until it exits. The dump's own
 * `\restrict` and `\unrestrict` lines are dropped, since the second would end
 * that protection early.
 *
 * The COPY and transaction checks are not a sandbox. They look at the start
 * of a line only, and the COPY one is case-sensitive, so a lowercase `copy
 * ... to program`, an indented statement, a second statement on the same
 * line, or a DO block that EXECUTEs one all get through. The SQL runs with
 * the database owner's full rights, which on the Docker setup is a superuser
 * that can run programs in the database container. A restore is only as safe
 * as the file, which is why the restore screen and the deployment guide say
 * to restore only backups this dashboard or the backup script made, on an
 * instance you trust.
 */
const DUMP_COMPLETE = '-- PostgreSQL database dump complete';
const RESTRICTED_MODE_LINE = /^\\(?:un)?restrict /;
const CREATE_TABLE = /^CREATE TABLE public\.(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*)) \($/;
const TRANSACTION_CONTROL =
  /^(?:BEGIN|START TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|PREPARE TRANSACTION)\b/i;

/** Tables every CozyVTT database has; a dump that does not create them is not a backup of one. */
export const REQUIRED_TABLES = ['User', '_prisma_migrations'];

/** What prepareDumpForRestore left out, for the log. */
export interface SkippedStatements {
  settings: string[];
  ownership: number;
  privileges: number;
}

/** The result of preparing a dump: why it must not be loaded, or null when it may be. */
export interface PreparedDump {
  skipped: SkippedStatements;
  refused: string | null;
}

/** The first characters of a line, for a refusal message. */
function excerpt(line: string): string {
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

/**
 * Split a file into lines on `\n` only, keeping every other byte as it is.
 *
 * Read as latin1, so each byte maps to one character and back: a dump in any
 * encoding, or with a carriage return inside a value, is written out exactly
 * as it came in. (readline decoded as UTF-8, replacing any byte that was not,
 * and also split at a lone `\r`.) The checks only need ASCII, and match on the
 * line without a trailing `\r`, so a dump saved with Windows line endings is
 * read the same as one without.
 */
async function* linesOf(path: string): AsyncGenerator<{ raw: string; statement: string; newline: boolean }> {
  let rest = '';
  const emit = (raw: string, newline: boolean) => ({
    raw,
    statement: raw.endsWith('\r') ? raw.slice(0, -1) : raw,
    newline,
  });
  for await (const chunk of createReadStream(path, { encoding: 'latin1' })) {
    rest += chunk as string;
    let at = rest.indexOf('\n');
    while (at >= 0) {
      yield emit(rest.slice(0, at), true);
      rest = rest.slice(at + 1);
      at = rest.indexOf('\n');
    }
  }
  if (rest.length > 0) yield emit(rest, false);
}

/**
 * Write the file psql actually loads: restricted mode, the preamble, then the
 * dump without the statements this server would reject. Streams line by line,
 * since a dump can be far larger than memory. Rows inside a COPY block are
 * never inspected, so a row that happens to start like a statement is left
 * exactly as it is.
 *
 * `refused` says why the file is not a backup that can be loaded (see
 * DUMP_COMPLETE above), and a caller must not load a file that was refused.
 */
export async function prepareDumpForRestore(sqlPath: string, outPath: string): Promise<PreparedDump> {
  const skipped: SkippedStatements = { settings: [], ownership: 0, privileges: 0 };
  let refused: string | null = null;
  let complete = false;
  const tables = new Set<string>();

  const out = createWriteStream(outPath, { encoding: 'latin1' });
  const write = async (text: string) => {
    if (!out.write(text, 'latin1')) await once(out, 'drain');
  };
  await write(`\\restrict ${randomBytes(32).toString('hex')}\n`);
  for (const line of RESTORE_PREAMBLE) await write(line + '\n');

  let inCopy = false;
  let endedWithNewline = true;
  for await (const { raw, statement, newline } of linesOf(sqlPath)) {
    let keep = true;
    if (inCopy) {
      if (statement === COPY_END) inCopy = false;
    } else if (COPY_START.test(statement)) {
      inCopy = true;
    } else if (statement.startsWith('COPY ')) {
      refused ??= `it runs a COPY that is not table data: ${excerpt(statement)}`;
    } else if (RESTRICTED_MODE_LINE.test(statement)) {
      keep = false;
    } else if (statement.startsWith('\\')) {
      refused ??= `it runs a psql command: ${excerpt(statement)}`;
    } else if (TRANSACTION_CONTROL.test(statement)) {
      refused ??= `it takes control of the transaction the restore runs in: ${excerpt(statement)}`;
    } else if (statement === DUMP_COMPLETE) {
      complete = true;
    } else if (isSettingUnknownToServer(statement)) {
      skipped.settings.push(statement);
      keep = false;
    } else if (isOwnershipStatement(statement)) {
      skipped.ownership++;
      keep = false;
    } else if (isPrivilegeStatement(statement)) {
      skipped.privileges++;
      keep = false;
    } else {
      const table = CREATE_TABLE.exec(statement);
      if (table) tables.add(table[1] ?? table[2]);
    }
    if (keep) {
      await write(newline ? raw + '\n' : raw);
      endedWithNewline = newline;
    }
  }
  if (!endedWithNewline) await write('\n');
  for (const line of RESTORE_TRAILER) await write(line + '\n');
  out.end();
  await once(out, 'finish');

  if (refused === null) {
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (inCopy) {
      refused = "it stops partway through a table's rows, so it was cut short";
    } else if (!complete) {
      refused = 'it does not end the way a complete pg_dump backup does, so it was cut short or is not a pg_dump backup';
    } else if (missing.length > 0) {
      refused = `it does not create the ${missing.join(' and ')} table${missing.length > 1 ? 's' : ''}, so it is not a CozyVTT backup`;
    }
  }
  return { skipped, refused };
}

/**
 * Arguments for dumping the database at `dbUrl` to `sqlPath`. The dump drops
 * each object before recreating it, names no owner and no privilege, so it
 * loads under whichever database user the restoring instance has, and leaves
 * the login sessions' rows out.
 */
/**
 * How pg_dump and psql are told where the database is: the address with the
 * password taken out, and the password in the environment as PGPASSWORD.
 *
 * A process's arguments are visible to every local user in the host's
 * process list (unless /proc is mounted with hidepid), so an address with
 * the password in it showed the database password to anyone on the machine
 * for as long as a backup or restore ran. libpq reads PGPASSWORD instead,
 * which only the same user or root can read. The environment handed over is
 * the path and the password alone; the tools need nothing else of the app's.
 *
 * An address that does not parse, or carries no password, is passed on as it
 * is, so an unusual one (a Unix socket, a passwordless local server) still
 * connects the way it did.
 */
export function pgConnection(dbUrl: string): { dbname: string; env: Record<string, string> } {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '' };
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return { dbname: dbUrl, env };
  }
  if (!parsed.password) return { dbname: dbUrl, env };
  env.PGPASSWORD = decodeURIComponent(parsed.password);
  parsed.password = '';
  return { dbname: parsed.toString(), env };
}

export function buildDumpArgs(dbUrl: string, sqlPath: string): string[] {
  return [
    '--dbname',
    pgConnection(dbUrl).dbname,
    '--file',
    sqlPath,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    // The login sessions: a backup that carried them would sign every
    // sign-in of the day back in when restored (see RESTORE_TRAILER).
    '--exclude-table-data=public.session',
  ];
}

/** Arguments for restoring `sqlPath` into the database at `dbUrl`. */
export function buildRestoreArgs(dbUrl: string, sqlPath: string): string[] {
  return [
    '--dbname',
    pgConnection(dbUrl).dbname,
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
