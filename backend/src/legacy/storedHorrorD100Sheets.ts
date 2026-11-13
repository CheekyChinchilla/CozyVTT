/**
 * Converting every stored Horror d100 sheet from the shape versions before
 * 1.7.0 stored into the rebuilt one (horrorD100Sheet.ts).
 *
 * It runs before the server listens (server.ts), whatever version the
 * instance upgraded from, and right after an Admin Panel restore brings an
 * older backup's database up to date (routes/admin.ts), before the restore
 * answers. A sheet it has not reached yet, because it failed or was stopped,
 * is still answered converted (sheetConversion.ts), and the next run takes
 * it.
 *
 * Only characters and character templates whose system is Horror d100 are
 * looked at; 1.7.0's migration renamed every stored system value, so the
 * column holds the new one. PostgreSQL picks the old sheets out by their keys
 * and answers with ids alone, so no sheet is loaded to find them, and a sheet
 * made on 1.7.0 or later is never loaded at all: sheets can be large and
 * many, and a start must not need the memory to hold them. Each sheet is
 * then read and converted on its own: its row is locked
 * (`SELECT ... FOR UPDATE`), read again, converted from that fresh copy and
 * written in one statement, in a transaction of its own, so a backend
 * stopped part-way leaves every sheet either as it was or fully converted.
 * The write bumps `updatedAt`, so a page loaded before it that saves with
 * the time it loaded is refused with 409. The conversion record the sheet
 * carries afterwards marks it, so a second run changes nothing.
 *
 * A PostgreSQL advisory lock, held on a connection of its own for the whole
 * run, lets one run at a time convert: a second process starting at the same
 * moment waits, then finds nothing left. It waits a minute at most, then
 * converts without the lock, which is safe since each sheet is converted
 * under its own row's lock. A sheet that fails is logged and
 * left as it was, and the run goes on.
 */

import { Client } from 'pg';
import { Prisma, type PrismaClient } from '@prisma/client';
import { databaseConnectionSettings } from '../config/prismaClient';
import logger from '../utils/logger';
import { toJson } from '../utils/prisma-json';
import { errorCode } from '../utils/errors';
import { OLD_DERIVED_KEYS, OLD_ONLY_KEYS, OLD_ONLY_SKILLS, convertHorrorD100Sheet, isOldHorrorD100Sheet } from './horrorD100Sheet';

/** The advisory lock's two keys: "Cozy" in ASCII, and the release that converts. */
export const STORED_SHEETS_LOCK = [0x436f7a79, 1610] as const;
const LOCK_KEYS = STORED_SHEETS_LOCK;

/**
 * How long a run waits for another's lock, by default, before converting
 * without it: a start or a restore never waits without end, and each sheet is
 * still converted under its own row's lock, so two runs cannot convert one
 * sheet twice.
 */
const LOCK_WAIT_MS = 60_000;
const LOCK_RETRY_MS = 500;

/** How many ids are listed at a time to find the sheets still to convert. */
const PAGE = 500;

/** Which table a sheet is in. */
export type StoredSheetTable = 'Character' | 'CharacterTemplate';

export interface StoredSheetsConverted {
  /** Sheets converted and written. */
  converted: number;
  /** Each converted sheet that kept values it could not place, with what it kept. */
  kept: { id: string; items: string[] }[];
  /** Each sheet that could not be converted, left as it was, with why. */
  failed: { id: string; error: string }[];
}

export interface ConvertStoredSheetsOptions {
  /** The database address; the server's DATABASE_URL when left out. */
  databaseUrl?: string;
  /**
   * Called once each sheet is converted and written. An error it throws stops
   * the run there, as a backend stopped between two sheets would be.
   */
  onConverted?: (sheet: { table: StoredSheetTable; id: string }) => void | Promise<void>;
  /** How long to wait for another run's lock before converting without it. */
  lockWaitMs?: number;
}

/** `value` where it is a JSON object, else an empty one, so `jsonb_each` never meets anything else. */
const objectOrEmpty = (value: Prisma.Sql): Prisma.Sql => Prisma.sql`CASE WHEN jsonb_typeof(${value}) = 'object' THEN ${value} ELSE '{}'::jsonb END`;

/**
 * The query listing one page of ids of the Horror d100 sheets in `table`
 * still in the shape before 1.7.0, those after the id `after`. It selects
 * ids alone, and its test on the sheet is isOldHorrorD100Sheet's, written
 * for PostgreSQL from the same lists of keys: no conversion record, and a
 * key only the old sheet has, the old derived attributes, a characteristic
 * named APP or stored as `{ regular }`, or an old-only skill key holding an
 * old row or a group of them. A test holds the two to the same answer.
 */
export function oldSheetIdsQuery(table: StoredSheetTable, after: string): Prisma.Sql {
  const from = table === 'Character' ? Prisma.sql`"Character"` : Prisma.sql`"CharacterTemplate"`;
  const characteristics = Prisma.sql`data -> 'characteristics'`;
  const derived = Prisma.sql`data -> 'derivedStats'`;
  return Prisma.sql`
    SELECT id FROM ${from}
    WHERE "gameSystem" = 'HORROR_D100' AND id > ${after}
      AND jsonb_typeof(data) = 'object'
      AND COALESCE(jsonb_typeof(data -> 'converted'), '') <> 'object'
      AND (
        jsonb_exists_any(data, ${[...OLD_ONLY_KEYS]}::text[])
        OR jsonb_exists_any(${objectOrEmpty(derived)}, ${[...OLD_DERIVED_KEYS]}::text[])
        OR jsonb_exists(${objectOrEmpty(characteristics)}, 'APP')
        OR EXISTS (
          SELECT 1 FROM jsonb_each(${objectOrEmpty(characteristics)}) AS c
          WHERE jsonb_exists(${objectOrEmpty(Prisma.sql`c.value`)}, 'regular'))
        OR EXISTS (
          SELECT 1 FROM jsonb_each(${objectOrEmpty(Prisma.sql`data -> 'skills'`)}) AS s
          WHERE s.key = ANY(${[...OLD_ONLY_SKILLS]}::text[])
            AND (
              jsonb_exists(${objectOrEmpty(Prisma.sql`s.value`)}, 'currentValue')
              OR EXISTS (
                SELECT 1 FROM jsonb_each(${objectOrEmpty(Prisma.sql`s.value`)}) AS m
                WHERE jsonb_exists(${objectOrEmpty(Prisma.sql`m.value`)}, 'currentValue'))))
      )
    ORDER BY id LIMIT ${PAGE}`;
}

/**
 * The ids of every Horror d100 sheet in `table` still in the shape before
 * 1.7.0, listed a page at a time. No sheet is loaded: the database tests
 * each one where it is stored.
 */
export async function oldSheetIds(prisma: PrismaClient, table: StoredSheetTable): Promise<string[]> {
  const ids: string[] = [];
  let after = '';
  for (;;) {
    const page = await prisma.$queryRaw<Array<{ id: string }>>(oldSheetIdsQuery(table, after));
    for (const row of page) ids.push(row.id);
    if (page.length < PAGE) return ids;
    after = page[page.length - 1].id;
  }
}

/** Takes the advisory lock, trying until `waitMs` has passed. Whether it was taken. */
async function takeLock(lock: Client, waitMs: number): Promise<boolean> {
  const giveUpAt = Date.now() + waitMs;
  for (;;) {
    const { rows } = await lock.query<{ taken: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS taken', [...LOCK_KEYS]);
    if (rows[0]?.taken) return true;
    const left = giveUpAt - Date.now();
    if (left <= 0) return false;
    await new Promise((resolve) => setTimeout(resolve, Math.min(LOCK_RETRY_MS, left)));
  }
}

/**
 * Converts one sheet under its row's lock, from the copy read under it.
 * Returns what it kept, with the labels a log may print, or null when the
 * sheet needed no conversion by then (converted meanwhile, or no longer a
 * Horror d100 one).
 */
async function convertOne(prisma: PrismaClient, table: StoredSheetTable, id: string): Promise<{ kept: string[]; keptLabels: string[] } | null> {
  return prisma.$transaction(async (tx) => {
    let fresh: { gameSystem: string | null; data: unknown } | null;
    if (table === 'Character') {
      await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${id} FOR UPDATE`;
      fresh = await tx.character.findUnique({ where: { id }, select: { gameSystem: true, data: true } });
    } else {
      await tx.$queryRaw`SELECT id FROM "CharacterTemplate" WHERE id = ${id} FOR UPDATE`;
      fresh = await tx.characterTemplate.findUnique({ where: { id }, select: { gameSystem: true, data: true } });
    }
    if (!fresh || fresh.gameSystem !== 'HORROR_D100' || !isOldHorrorD100Sheet(fresh.data)) return null;
    const { sheet, kept, keptLabels } = convertHorrorD100Sheet(fresh.data, new Date());
    // A template keeps the record of its own conversion, as a character does (sheetConversion.ts).
    if (table === 'Character') await tx.character.update({ where: { id }, data: { data: toJson(sheet) } });
    else await tx.characterTemplate.update({ where: { id }, data: { data: toJson(sheet) } });
    return { kept, keptLabels };
  });
}

/**
 * Converts every stored Horror d100 sheet still in the shape before 1.7.0,
 * characters and character templates, and logs what it converted, what each
 * sheet kept that it could not place, and what failed. A sheet that fails is
 * left as it was and the run goes on; the run itself throws only when the
 * database cannot be reached, or `onConverted` throws.
 */
export async function convertStoredHorrorD100Sheets(
  prisma: PrismaClient,
  options: ConvertStoredSheetsOptions = {},
): Promise<StoredSheetsConverted> {
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set, so there is no database to convert.');
  const lock = new Client(databaseConnectionSettings(url).pool);
  // A connection PostgreSQL drops would otherwise end the process. The run is
  // safe without the lock: every sheet is converted under its own row's lock.
  lock.on('error', (error: Error) => {
    logger.warn('The connection holding the Horror d100 conversion lock was lost; the conversion goes on without it', { detail: error.message });
  });
  const result: StoredSheetsConverted = { converted: 0, kept: [], failed: [] };
  await lock.connect();
  let locked = false;
  try {
    const waitMs = options.lockWaitMs ?? LOCK_WAIT_MS;
    locked = await takeLock(lock, waitMs);
    if (!locked) {
      logger.warn('Another process held the Horror d100 conversion lock past the wait, so this run converts without it, each sheet still locked on its own', { waitedMs: waitMs });
    }
    for (const table of ['Character', 'CharacterTemplate'] as const) {
      for (const id of await oldSheetIds(prisma, table)) {
        let done: { kept: string[]; keptLabels: string[] } | null;
        try {
          done = await convertOne(prisma, table, id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.failed.push({ id, error: message });
          logger.error('A stored Horror d100 sheet could not be converted, and is left as it was', { table, id, code: errorCode(error), detail: message });
          continue;
        }
        if (done === null) continue;
        const { kept } = done;
        result.converted += 1;
        if (kept.length > 0) {
          result.kept.push({ id, items: kept });
          // Labels and a count: the values are the player's, as is a name typed
          // for a skill or a language, and stay in the sheet's record.
          logger.warn('A converted Horror d100 sheet kept values it could not place, in its conversion record', {
            table, id, keptCount: kept.length, keptLabels: done.keptLabels,
          });
        }
        await options.onConverted?.({ table, id });
      }
    }
  } finally {
    if (locked) await lock.query('SELECT pg_advisory_unlock($1, $2)', [...LOCK_KEYS]).catch(() => undefined);
    await lock.end().catch(() => undefined);
  }
  if (result.converted > 0 || result.failed.length > 0) {
    logger.info('Converted the stored Horror d100 sheets to the rebuilt sheet', {
      converted: result.converted,
      keptValues: result.kept.length,
      failed: result.failed.length,
    });
  }
  return result;
}

/**
 * The conversion as the server runs it before it listens. A failure of the
 * whole run is logged and the server starts all the same: every sheet not
 * yet converted is answered converted and converted when it is saved, and
 * the next start tries again.
 */
export async function convertStoredHorrorD100SheetsAtStart(prisma: PrismaClient): Promise<void> {
  try {
    await convertStoredHorrorD100Sheets(prisma);
  } catch (error) {
    logger.error(
      'Converting the stored Horror d100 sheets did not finish. They are still answered in the rebuilt shape and converted as they are saved; the next start tries again.',
      { code: errorCode(error), detail: error instanceof Error ? error.message : String(error) },
    );
  }
}
