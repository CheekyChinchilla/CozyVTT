/**
 * Where the server converts a Horror d100 sheet from the shape versions
 * before 1.7.0 stored (horrorD100Sheet.ts): every sheet a request sends, and
 * every stored sheet it reads, in memory, without writing it (a read guard
 * for any sheet the conversion of the stored rows has not reached).
 *
 * Only a character's or template's own sheet is converted, and only when its
 * system, an older version's value read as its new one, is Horror d100. The
 * converter tells an old Horror d100 sheet from a new one by its content, and
 * cannot tell game systems apart: a Flexible sheet keeps any key it is sent,
 * the old sheet's among them, and is never handed to it.
 *
 * The conversion record (`converted`) holds the old sheet's values. It is
 * written in exactly three ways: by the conversion of a stored old row, a
 * character's or a template's (the boot step, a restore, or any server write
 * of that row, which keeps the record its conversion gives); by the
 * conversion of an old-shape sheet a request creates a character with; and
 * from the body of a request that creates a character, as a character file
 * exported from 1.7.0 carries one, bounded only by the body limit. An update
 * never writes one made from the request: it keeps the stored sheet's, or
 * stores none when the stored sheet has none.
 *
 * A template takes no record from a request, whether one is sent with it or
 * written by converting an old-shape sheet sent: it is every user's starting
 * point and holds no character's originals. A template an older version
 * stored keeps the record of its own conversion, whose list of values that
 * found no place may be the only copy of them, and every save of that
 * template keeps it. It is sent without the one entry that can name a
 * person: a second player name a sheet from before 1.3.0 held.
 */

import type { Prisma } from '@prisma/client';
import { isJsonValue } from '../utils/prisma-json';
import { normaliseGameSystem } from './gameSystemAliases';
import { KEPT_PLAYER_LABEL, convertHorrorD100Sheet } from './horrorD100Sheet';

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a character's or template's system, an older version's value read as its new one, is Horror d100. */
export function isHorrorD100(gameSystem: unknown): boolean {
  return normaliseGameSystem(gameSystem) === 'HORROR_D100';
}

/** The conversion record a sheet carries, if it carries one. */
function recordOf(sheet: unknown): Fields | undefined {
  return isRecord(sheet) && isRecord(sheet.converted) ? sheet.converted : undefined;
}

/**
 * A stored sheet as the server answers and reads it: an old Horror d100
 * sheet converted in memory, nothing written; any other sheet as it is
 * stored, the same value.
 */
export function sheetAsRead(gameSystem: unknown, data: Prisma.JsonValue, now: Date = new Date()): Prisma.JsonValue {
  if (!isHorrorD100(gameSystem)) return data;
  const { sheet } = convertHorrorD100Sheet(data, now);
  return sheet !== data && isJsonValue(sheet) ? sheet : data;
}

/**
 * A sheet a request sent, as the server takes it: an old Horror d100 sheet
 * converted, its record written by that conversion; any other sheet as it
 * was sent, the same value.
 */
export function sheetAsSent(gameSystem: unknown, data: unknown, now: Date = new Date()): unknown {
  if (!isHorrorD100(gameSystem)) return data;
  return convertHorrorD100Sheet(data, now).sheet;
}

/**
 * The sheet an update stores, with the record of the stored sheet (an old
 * one is converted here to find it, as it is answered) in place of whatever
 * the request sent under `converted`, or with none when the stored sheet has
 * none. Any sheet that is not a Horror d100 one comes back as it is.
 */
export function sheetKeepingConversionRecord(gameSystem: unknown, sheet: unknown, stored: unknown, now: Date = new Date()): unknown {
  if (!isHorrorD100(gameSystem) || !isRecord(sheet)) return sheet;
  const kept = recordOf(convertHorrorD100Sheet(stored, now).sheet);
  const { converted: _sent, ...rest } = sheet;
  return kept === undefined ? rest : { ...rest, converted: kept };
}

/** A Horror d100 sheet without its conversion record, as a template takes one from a request; any other sheet as it is. */
export function sheetWithoutConversionRecord<T>(gameSystem: unknown, sheet: T): T {
  if (!isHorrorD100(gameSystem) || !isRecord(sheet) || !('converted' in sheet)) return sheet;
  const { converted: _dropped, ...rest } = sheet;
  return rest as T;
}

/**
 * A Horror d100 sheet as a template sends it: its conversion record without
 * the second player name a sheet from before 1.3.0 could hold, which the
 * conversion lists among what it kept. A template is sent to every user, and
 * carries no player's name. The stored record keeps the entry. Any other
 * sheet comes back as it is.
 */
export function sheetWithoutKeptPlayerName<T>(gameSystem: unknown, sheet: T): T {
  if (!isHorrorD100(gameSystem) || !isRecord(sheet)) return sheet;
  const record = recordOf(sheet);
  if (!record || !Array.isArray(record.kept)) return sheet;
  const kept = record.kept.filter((item) => !(typeof item === 'string' && item.startsWith(`${KEPT_PLAYER_LABEL}: `)));
  if (kept.length === record.kept.length) return sheet;
  return { ...sheet, converted: { ...record, kept } } as T;
}
