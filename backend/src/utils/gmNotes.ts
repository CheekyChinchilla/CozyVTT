/**
 * GM's Notes: the part of a character sheet that only the GM of the
 * character's campaign reads and writes.
 *
 * Today that is the top-level `notes` of a Horror d100 sheet, which the
 * editor labels GM's Notes. Every route and event that sends a sheet
 * passes it through `characterForReader`, every save by anyone else keeps
 * the stored notes (`sheetKeepingGmNotes`), and a character entering a
 * different campaign has them cleared (`sheetWithoutGmNotes`): they were
 * the last campaign's GM's, and a player who moved their character
 * into a campaign they run would otherwise be its GM and read them.
 *
 * The notes stay inside the stored sheet, so the schema, exports and imports
 * are unchanged. A database backup keeps them; a campaign export carries no
 * character sheets.
 */

import type { Prisma } from '@prisma/client';
import { isSupportedGameSystem, type GameSystem, type SupportedGameSystem } from '../game-systems';
import { prisma } from '../config/database';
import { toJson } from './prisma-json';
import { sheetAsRead } from '../legacy/sheetConversion';

/** The sheet field that is the GM's alone, by game system. */
const GM_ONLY_FIELD: Partial<Record<SupportedGameSystem, string>> = {
  HORROR_D100: 'notes',
};

/** The GM-only field of a stored row's system, if it has one. */
function gmOnlyField(gameSystem: GameSystem | null): string | undefined {
  return isSupportedGameSystem(gameSystem) ? GM_ONLY_FIELD[gameSystem] : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The sheet with its GM-only field taken out; any other sheet as it is. */
export function sheetWithoutGmNotes<T>(gameSystem: GameSystem | null, data: T): T {
  const field = gmOnlyField(gameSystem);
  if (!field || !isPlainObject(data) || !(field in data)) return data;
  const { [field]: _dropped, ...rest } = data;
  return rest as T;
}

/**
 * The sheet a save by someone other than the GM stores: what they sent,
 * with the GM-only field as it was stored, whatever they sent for it.
 */
export function sheetKeepingGmNotes(gameSystem: GameSystem | null, incoming: unknown, stored: unknown): unknown {
  const field = gmOnlyField(gameSystem);
  if (!field || !isPlainObject(incoming)) return incoming;
  const without = sheetWithoutGmNotes(gameSystem, incoming);
  return isPlainObject(stored) && field in stored ? { ...without, [field]: stored[field] } : without;
}

/**
 * The character as this reader is sent it. The GM always gets the field,
 * empty when nothing is written yet, so the editor knows to offer the box;
 * anyone else never gets it. A Horror d100 sheet still in the shape before
 * 1.7.0 is sent converted, and nothing is written.
 */
export function characterForReader<C extends { gameSystem: GameSystem | null; data: Prisma.JsonValue }>(
  stored: C,
  isGm: boolean
): C {
  // A sheet still in an older shape is sent converted (legacy/sheetConversion.ts).
  const data = sheetAsRead(stored.gameSystem, stored.data);
  const character = data === stored.data ? stored : { ...stored, data };
  const field = gmOnlyField(character.gameSystem);
  if (!field || !isPlainObject(character.data)) return character;
  if (!isGm) return { ...character, data: sheetWithoutGmNotes(character.gameSystem, character.data) };
  if (typeof character.data[field] === 'string') return character;
  return { ...character, data: { ...character.data, [field]: '' } };
}

/**
 * Clear a character's GM's Notes, for a character entering a campaign it
 * was not in: they belong to the GM of the campaign it came from, or of
 * one it left earlier. Read and written under the row's lock, so a save
 * landing meanwhile is neither lost nor brings them back. Call it inside the
 * transaction that changes the campaign.
 */
export async function clearGmNotes(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
  const character = await tx.character.findUnique({ where: { id: characterId }, select: { gameSystem: true, data: true } });
  if (!character) return;
  // A Horror d100 sheet still in the shape before 1.7.0 is written converted,
  // as every write of a sheet stores it.
  const without = sheetWithoutGmNotes(character.gameSystem, sheetAsRead(character.gameSystem, character.data));
  if (without === character.data) return;
  await tx.character.update({ where: { id: characterId }, data: { data: toJson(without) } });
}

/** Whether a user is the GM of a character: of the campaign it is in. */
export async function isGmOf(userId: string, campaignId: string | null): Promise<boolean> {
  if (!campaignId) return false;
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  return membership?.role === 'GM';
}

/** Whether a game system's sheets have a GM-only field at all. */
export function hasGmNotes(gameSystem: GameSystem | null): boolean {
  return gmOnlyField(gameSystem) !== undefined;
}
