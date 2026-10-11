/**
 * Keeper's Notes: the part of a character sheet that only the DM of the
 * character's campaign (the Keeper, in Call of Cthulhu) reads and writes.
 *
 * Today that is the top-level `notes` of a Call of Cthulhu sheet, which the
 * editor labels Keeper's Notes. Every route and event that sends a sheet
 * passes it through `characterForReader`, every save by anyone else keeps
 * the stored notes (`sheetKeepingKeeperNotes`), and a character entering a
 * different campaign has them cleared (`sheetWithoutKeeperNotes`): they were
 * the last campaign's Keeper's, and a player who moved their investigator
 * into a campaign they run would otherwise be its Keeper and read them.
 *
 * The notes stay inside the stored sheet, so the schema, exports and imports
 * are unchanged; the DM's campaign export carries them.
 */

import type { GameSystem, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { toJson } from './prisma-json';

/** The sheet field that is the Keeper's alone, by game system. */
const KEEPER_ONLY_FIELD: Partial<Record<GameSystem, string>> = {
  CALL_OF_CTHULHU_7E: 'notes',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The sheet with its Keeper-only field taken out; any other sheet as it is. */
export function sheetWithoutKeeperNotes<T>(gameSystem: GameSystem | null, data: T): T {
  const field = gameSystem ? KEEPER_ONLY_FIELD[gameSystem] : undefined;
  if (!field || !isPlainObject(data) || !(field in data)) return data;
  const { [field]: _dropped, ...rest } = data;
  return rest as T;
}

/**
 * The sheet a save by someone other than the Keeper stores: what they sent,
 * with the Keeper-only field as it was stored, whatever they sent for it.
 */
export function sheetKeepingKeeperNotes(gameSystem: GameSystem | null, incoming: unknown, stored: unknown): unknown {
  const field = gameSystem ? KEEPER_ONLY_FIELD[gameSystem] : undefined;
  if (!field || !isPlainObject(incoming)) return incoming;
  const without = sheetWithoutKeeperNotes(gameSystem, incoming);
  return isPlainObject(stored) && field in stored ? { ...without, [field]: stored[field] } : without;
}

/**
 * The character as this reader is sent it. The Keeper always gets the field,
 * empty when nothing is written yet, so the editor knows to offer the box;
 * anyone else never gets it.
 */
export function characterForReader<C extends { gameSystem: GameSystem | null; data: Prisma.JsonValue }>(
  character: C,
  keeper: boolean
): C {
  const field = character.gameSystem ? KEEPER_ONLY_FIELD[character.gameSystem] : undefined;
  if (!field || !isPlainObject(character.data)) return character;
  if (!keeper) return { ...character, data: sheetWithoutKeeperNotes(character.gameSystem, character.data) };
  if (typeof character.data[field] === 'string') return character;
  return { ...character, data: { ...character.data, [field]: '' } };
}

/**
 * Clear a character's Keeper's Notes, for a character entering a campaign it
 * was not in: they belong to the Keeper of the campaign it came from, or of
 * one it left earlier. Read and written under the row's lock, so a save
 * landing meanwhile is neither lost nor brings them back. Call it inside the
 * transaction that changes the campaign.
 */
export async function clearKeeperNotes(tx: Prisma.TransactionClient, characterId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
  const character = await tx.character.findUnique({ where: { id: characterId }, select: { gameSystem: true, data: true } });
  if (!character) return;
  const without = sheetWithoutKeeperNotes(character.gameSystem, character.data);
  if (without === character.data) return;
  await tx.character.update({ where: { id: characterId }, data: { data: toJson(without) } });
}

/** Whether a user is the Keeper of a character: the DM of the campaign it is in. */
export async function isKeeperOf(userId: string, campaignId: string | null): Promise<boolean> {
  if (!campaignId) return false;
  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { role: true },
  });
  return membership?.role === 'DM';
}

/** Whether a game system's sheets have a Keeper-only field at all. */
export function hasKeeperNotes(gameSystem: GameSystem | null): boolean {
  return gameSystem !== null && KEEPER_ONLY_FIELD[gameSystem] !== undefined;
}
