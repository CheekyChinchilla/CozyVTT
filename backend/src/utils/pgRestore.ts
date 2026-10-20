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
import { databaseConnectionSettings, PRISMA_ONLY_PARAMETERS } from '../config/prismaClient';

/**
 * The PostgreSQL schema an instance keeps its data in: the one DATABASE_URL
 * names with `?schema=`, read as the app's own connection reads it, or
 * `public`. A backup holds that schema and a restore replaces it alone, so an
 * install sharing its database with other software leaves that software's
 * data as it was.
 */
export function instanceSchema(dbUrl: string): string {
  return databaseConnectionSettings(dbUrl).schema;
}

/**
 * The schema's name as SQL and pg_dump's patterns take it. `public` is
 * written bare, as every statement for it always has been; any other name is
 * quoted, so capitals, spaces or a reserved word mean the schema they spell,
 * and a double quote inside is doubled.
 */
function schemaIdentifier(schema: string): string {
  return schema === 'public' ? 'public' : `"${schema.replace(/"/g, '""')}"`;
}

/**
 * Statements run before the dump itself.
 *
 * The dump drops and recreates only the objects it contains. A backup taken on
 * an older CozyVTT does not know about tables added since, so when one of those
 * references a table the dump is about to drop, the drop fails and the restore
 * stops; and a table the dump does not mention would otherwise survive with
 * stale rows. Replacing the schema first makes a restore mean what the screen
 * says: afterwards the instance's schema holds the backup and nothing else.
 * Only that schema: on a database shared with other software, the other
 * schemas are not CozyVTT's. The statements sit at the top of the file psql
 * loads with --single-transaction, so a dump that fails to apply rolls the
 * schema back too. Migrations then run to bring an older backup up to the
 * running version.
 */
export function restorePreamble(schema: string): string[] {
  const name = schemaIdentifier(schema);
  return [`DROP SCHEMA ${name} CASCADE;`, `CREATE SCHEMA ${name};`];
}

/**
 * Statements run after the dump, in the same transaction.
 *
 * Login sessions live in the `session` table, beside the app's tables. New
 * backups leave its rows out (see buildDumpArgs), but every backup made
 * before that carries them, and a restore would bring back each sign-in
 * that had not yet expired, ones ended since by a password change or an
 * account removal included. So a restore ends by emptying the table, which
 * a very old backup may not have at all, hence the check.
 */
export function restoreTrailer(schema: string): string[] {
  const table = `${schemaIdentifier(schema)}.session`;
  return [`DO $$ BEGIN IF to_regclass('${table.replace(/'/g, "''")}') IS NOT NULL THEN DELETE FROM ${table}; END IF; END $$;`];
}

/**
 * The preamble and trailer of an instance that keeps its data in `public`.
 * The restore script (backend/scripts/restore.sh) handles that schema only,
 * appends the same trailer, and keepInStep.test.ts fails if the two differ.
 */
export const RESTORE_PREAMBLE = restorePreamble('public');
export const RESTORE_TRAILER = restoreTrailer('public');

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
/**
 * `ALTER <kind> <name> OWNER TO <role>;`, on one line. The lookahead settles
 * that the line ends with `;` before the name is searched, and the name stops
 * at the first ` OWNER TO `, so a long crafted line is read in one pass. The
 * pattern this replaces matched the same lines, but let the words of the kind
 * and the name overlap, and took minutes on one such line.
 */
const OWNERSHIP_LINE = /^ALTER [A-Z]+ (?=.*;$).+? OWNER TO .+;$/;
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
 * CozyVTT database has, in the schema this instance keeps its data in. A
 * backup of another schema is refused: loaded, its tables would land in the
 * schema it came from while the restore reported success. An instance with a
 * schema of its own also refuses tables in any other schema, which are not
 * its to replace; a backup of `public` restores everything it holds, as it
 * always has.
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
/** `CREATE TABLE <schema>.<table> (`, each name bare or quoted as pg_dump writes it. */
const CREATE_TABLE = /^CREATE TABLE ("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)\.("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*) \($/;

/** A name as pg_dump wrote it, without its quotes, read back from latin1 (see linesOf) as the UTF-8 the dump is in. */
function unquoted(name: string): string {
  const bare = name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name;
  return Buffer.from(bare, 'latin1').toString('utf8');
}

/** Why a backup of `found` (its schemas, sorted) is not one for an instance that keeps its data in `schema`. */
function anotherSchema(found: string[], schema: string): string {
  const names = found.map((name) => `"${name}"`).join(' and ');
  return (
    `it is a backup of the database schema${found.length > 1 ? 's' : ''} ${names}, and this instance keeps its data in the schema "${schema}". ` +
    'Restore it on an instance whose DATABASE_URL names the schema it came from'
  );
}
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
 * `dbUrl` is the instance's, which decides the schema replaced.
 */
export async function prepareDumpForRestore(sqlPath: string, outPath: string, dbUrl: string): Promise<PreparedDump> {
  const skipped: SkippedStatements = { settings: [], ownership: 0, privileges: 0 };
  let refused: string | null = null;
  let complete = false;
  const schema = instanceSchema(dbUrl);
  /** The tables the dump creates, by schema. */
  const tables = new Map<string, Set<string>>();

  // The whole database: readable by the backend's user alone.
  const out = createWriteStream(outPath, { encoding: 'latin1', mode: 0o600 });
  // A failed write (a full disk) arrives later as an 'error' event, often
  // while the loop below waits on the dump. Unheard, it would exit the
  // backend, so keep it and throw it from the next write.
  const failure: { error?: Error } = {};
  out.on('error', (err) => { failure.error = err; });
  const write = async (text: string) => {
    if (failure.error) throw failure.error;
    if (!out.write(text, 'latin1')) await once(out, 'drain');
  };
  let inCopy = false;
  let endedWithNewline = true;
  try {
    await write(`\\restrict ${randomBytes(32).toString('hex')}\n`);
    for (const line of restorePreamble(schema)) await write(line + '\n');

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
        if (table) {
          const [inSchema, name] = [unquoted(table[1]), unquoted(table[2])];
          if (!tables.has(inSchema)) tables.set(inSchema, new Set());
          tables.get(inSchema)?.add(name);
        }
      }
      if (keep) {
        await write(newline ? raw + '\n' : raw);
        endedWithNewline = newline;
      }
    }
    if (!endedWithNewline) await write('\n');
    for (const line of restoreTrailer(schema)) await write(line + '\n');
    if (failure.error) throw failure.error;
    out.end();
    // Until the file is closed, not only written: some filesystems (NFS over
    // its quota) report a failed write only when it is closed, after 'finish'.
    await once(out, 'close');
    if (failure.error) throw failure.error;
  } catch (err) {
    out.destroy();
    throw err;
  }

  if (refused === null) {
    const found = [...tables.keys()].sort();
    const elsewhere = found.filter((name) => name !== schema);
    const missing = REQUIRED_TABLES.filter((t) => !tables.get(schema)?.has(t));
    const backupOfAnother = elsewhere.some((name) => REQUIRED_TABLES.every((t) => tables.get(name)?.has(t)));
    if (inCopy) {
      refused = "it stops partway through a table's rows, so it was cut short";
    } else if (!complete) {
      refused = 'it does not end the way a complete pg_dump backup does, so it was cut short or is not a pg_dump backup';
    } else if ((schema !== 'public' && elsewhere.length > 0) || (missing.length > 0 && backupOfAnother)) {
      refused = anotherSchema(found, schema);
    } else if (missing.length > 0) {
      refused = `it does not create the ${missing.join(' and ')} table${missing.length > 1 ? 's' : ''}, so it is not a CozyVTT backup`;
    }
  }
  return { skipped, refused };
}

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
 * The address is the app's, and libpq refuses a setting it does not know
 * (`invalid URI query parameter`), so the ones only the app reads are left
 * out: `schema` (pg_dump is given the schema as --schema, see buildDumpArgs),
 * `connection_limit` and the rest of PRISMA_ONLY_PARAMETERS. The pg driver's
 * `sslmode=no-verify`, encryption without a certificate check, is libpq's
 * `require`. Every other setting reaches libpq exactly as written.
 *
 * An address that does not parse is passed on as it is, so an unusual one (a
 * Unix socket) still connects the way it did.
 */
export function pgConnection(dbUrl: string): { dbname: string; env: Record<string, string> } {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '' };
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    return { dbname: dbUrl, env };
  }
  let changed = false;

  // Pair by pair, so what is kept is not encoded again: URLSearchParams
  // would write a space as `+`, which libpq reads as a plus sign.
  const kept: string[] = [];
  for (const pair of parsed.search.slice(1).split('&')) {
    if (pair === '') continue;
    const at = pair.indexOf('=');
    const name = decodedOrAsIs(at < 0 ? pair : pair.slice(0, at));
    const value = at < 0 ? '' : decodedOrAsIs(pair.slice(at + 1));
    if (PRISMA_ONLY_PARAMETERS.includes(name)) {
      changed = true;
    } else if (name === 'sslmode' && value === 'no-verify') {
      kept.push('sslmode=require');
      changed = true;
    } else {
      kept.push(pair);
    }
  }
  if (changed) parsed.search = kept.length > 0 ? `?${kept.join('&')}` : '';

  if (parsed.password) {
    env.PGPASSWORD = decodeURIComponent(parsed.password);
    parsed.password = '';
    changed = true;
  }
  return { dbname: changed ? parsed.toString() : dbUrl, env };
}

/** A percent-encoded part of an address, decoded, or as written when it does not decode (a lone `%`). */
function decodedOrAsIs(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * Arguments for dumping the database at `dbUrl` to `sqlPath`. The dump drops
 * each object before recreating it, names no owner and no privilege, so it
 * loads under whichever database user the restoring instance has, and leaves
 * the login sessions' rows out.
 *
 * An instance that keeps its data in `public` is dumped whole, as it always
 * has been. One whose DATABASE_URL names a schema of its own shares its
 * database with other software, so its backup holds that schema alone.
 */
export function buildDumpArgs(dbUrl: string, sqlPath: string): string[] {
  const schema = instanceSchema(dbUrl);
  const name = schemaIdentifier(schema);
  return [
    '--dbname',
    pgConnection(dbUrl).dbname,
    '--file',
    sqlPath,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    ...(schema === 'public' ? [] : [`--schema=${name}`]),
    // The login sessions: a backup that carried them would sign every
    // sign-in of the day back in when restored (see restoreTrailer).
    `--exclude-table-data=${name}.session`,
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
