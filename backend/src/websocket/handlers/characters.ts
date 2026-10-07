// ============================================
// Character handlers: character.hp.update, character.hitdice.spend
// Players act on their own characters; the DM may act on any of them.
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { toJson } from '../../utils/prisma-json';
import type { DnD5eHitDice } from '../../game-systems/dnd5e';
import { withinCeiling } from '../shared';

/** The parts of a character blob this handler touches — see `charData` below. */
interface HpBlock {
  current?: unknown;
  maximum?: unknown;
  temporary?: unknown;
}
/** One hit dice pool as it sits in the blob, read loosely: only `remaining` is touched. */
type HitDiceEntry = Partial<Record<keyof DnD5eHitDice, unknown>>;
interface CharacterHitDiceData {
  hitDice?: unknown;
  [key: string]: unknown;
}
interface CharacterHpData {
  /** D&D 5e and Pathfinder 2e keep HP at the top level. */
  hp?: HpBlock;
  /** Call of Cthulhu 7e keeps it under derived stats. */
  derivedStats?: { hp?: HpBlock };
  [key: string]: unknown;
}

type Refusal = { error: string };

/**
 * The sheet with `delta` applied to its current hit points, clamped to 0 and
 * the maximum, or why it cannot be.
 *
 * Only the HP-bearing corners of the sheet are described: the blob is a full
 * character in one of several systems, and nothing else is read or written.
 * The values stay `unknown` until the checks below establish they are numbers.
 */
function applyHpDelta(
  gameSystem: string | null,
  stored: unknown,
  delta: number
): { data: CharacterHpData; hp: { current: number; max: number; temp: number } } | Refusal {
  const charData = stored as CharacterHpData;
  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E': {
      if (!charData?.hp || typeof charData.hp.maximum !== 'number') {
        return { error: 'Character does not have HP tracking' };
      }
      const max = charData.hp.maximum;
      const temp = typeof charData.hp.temporary === 'number' ? charData.hp.temporary : 0;
      const current = Math.max(0, Math.min(max, (typeof charData.hp.current === 'number' ? charData.hp.current : max) + delta));
      return { data: { ...charData, hp: { ...charData.hp, current } }, hp: { current, max, temp } };
    }
    case 'CALL_OF_CTHULHU_7E': {
      if (!charData?.derivedStats?.hp || typeof charData.derivedStats.hp.maximum !== 'number') {
        return { error: 'Character does not have HP tracking' };
      }
      const max = charData.derivedStats.hp.maximum;
      const current = Math.max(0, Math.min(max, (typeof charData.derivedStats.hp.current === 'number' ? charData.derivedStats.hp.current : max) + delta));
      return {
        data: { ...charData, derivedStats: { ...charData.derivedStats, hp: { ...charData.derivedStats.hp, current } } },
        hp: { current, max, temp: 0 },
      };
    }
    default:
      return { error: 'HP tracking not supported for this game system' };
  }
}

/** The sheet with one die spent from the pool at `index`, or why it cannot be. */
function spendHitDie(stored: unknown, index: number): { data: CharacterHitDiceData } | Refusal {
  const charData = stored as CharacterHitDiceData;
  const pools = Array.isArray(charData?.hitDice) ? (charData.hitDice as HitDiceEntry[]) : null;
  if (!pools || !pools[index]) return { error: 'No hit dice pool at that position' };
  const remaining = typeof pools[index].remaining === 'number' ? (pools[index].remaining as number) : 0;
  if (remaining <= 0) return { error: 'No hit dice remaining to spend' };
  const hitDice = pools.map((entry, at) => (at === index ? { ...entry, remaining: remaining - 1 } : entry));
  return { data: { ...charData, hitDice } };
}

export function registerCharacterHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('character.hp.update', async (data: { characterId: string; delta: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // Each change holds the character's row for a transaction, so a burst
      // of them would hold every database connection the instance has.
      if (!withinCeiling(socket, 'character.hp.update')) return;

      const { characterId, delta } = data;

      if (!characterId || typeof delta !== 'number' || !Number.isFinite(delta)) {
        socket.emit('error', { message: 'characterId (string) and delta (number) are required' });
        return;
      }

      // Fetch the character
      const character = await prisma.character.findUnique({
        where: { id: characterId },
      });

      if (!character) {
        socket.emit('error', { message: 'Character not found' });
        return;
      }

      // Verify character belongs to this campaign
      const membership = await prisma.campaignMembership.findFirst({
        where: { campaignId: socket.campaignId, characterIds: { has: characterId } },
      });

      if (!membership) {
        socket.emit('error', { message: 'Character is not in this campaign' });
        return;
      }

      // A spectator is watching, not playing: not even a character they own,
      // since a token bound to it follows the sheet on every screen. The DM
      // can still cover for them.
      if (socket.role === 'SPECTATOR') {
        socket.emit('error', { message: 'Spectators cannot change a character' });
        return;
      }

      // Permission: character owner or DM
      if (character.userId !== socket.userId && socket.role !== 'DM') {
        socket.emit('error', { message: 'You do not have permission to update this character\'s HP' });
        return;
      }

      // Read and written under the row's lock, afresh. Reading before the
      // lock and writing the whole sheet back undid any save that landed in
      // between; a save arriving now waits for this one instead.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;
        const applied = applyHpDelta(character.gameSystem, fresh.data, delta);
        if ('error' in applied) return applied;
        await tx.character.update({ where: { id: characterId }, data: { data: toJson(applied.data) } });
        return applied;
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const { current, max, temp } = outcome.hp;

      // Broadcast updated HP to all campaign members
      io.to(socket.campaignId!).emit('character.hp.updated', {
        characterId,
        hp: { current, max, temp },
      });

    } catch (error) {
      logger.error('character.hp.update failed', { err: error });
      socket.emit('error', { message: 'Failed to update character HP' });
    }
  });

  /**
   * CHARACTER.HITDICE.SPEND — spend one D&D 5e hit die.
   *
   * The roll itself goes through `dice.roll` like every other roll; this only
   * decrements the pool, so the count cannot be inflated by a client that
   * simply declines to send it. Same permission rule as HP: the character's
   * owner, or the DM covering for an absent player.
   */
  socket.on('character.hitdice.spend', async (data: { characterId: string; index: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      if (!withinCeiling(socket, 'character.hitdice.spend')) return;

      const { characterId, index } = data ?? {};

      if (!characterId || typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        socket.emit('error', { message: 'characterId (string) and index (integer) are required' });
        return;
      }

      const character = await prisma.character.findUnique({ where: { id: characterId } });
      if (!character) {
        socket.emit('error', { message: 'Character not found' });
        return;
      }

      const membership = await prisma.campaignMembership.findFirst({
        where: { campaignId: socket.campaignId, characterIds: { has: characterId } },
      });
      if (!membership) {
        socket.emit('error', { message: 'Character is not in this campaign' });
        return;
      }

      // As for hit points: a spectator changes nothing, the DM may.
      if (socket.role === 'SPECTATOR') {
        socket.emit('error', { message: 'Spectators cannot change a character' });
        return;
      }

      if (character.userId !== socket.userId && socket.role !== 'DM') {
        socket.emit('error', { message: 'You do not have permission to spend this character\'s hit dice' });
        return;
      }

      if (character.gameSystem !== 'DND_5E') {
        socket.emit('error', { message: 'Hit dice are not tracked for this game system' });
        return;
      }

      // Under the row's lock and read afresh, for the reason given for hit
      // points above.
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;
        const fresh = await tx.character.findUnique({ where: { id: characterId }, select: { data: true } });
        if (!fresh) return { error: 'Character not found' } as const;
        const spent = spendHitDie(fresh.data, index);
        if ('error' in spent) return spent;
        return { updated: await tx.character.update({ where: { id: characterId }, data: { data: toJson(spent.data) } }) };
      });
      if ('error' in outcome) {
        socket.emit('error', { message: outcome.error });
        return;
      }
      const updated = outcome.updated;

      // The sheet blob changed, so this goes out as `character.updated` — the
      // event an open character sheet already refreshes on — rather than a
      // narrow one of its own that nothing would listen to. No token art or
      // name changed, so nothing needs to repaint the map.
      io.to(socket.campaignId).emit('character.updated', {
        characterId,
        character: updated,
        userId: socket.userId,
        tokensChanged: false,
      });

    } catch (error) {
      logger.error('character.hitdice.spend failed', { err: error });
      socket.emit('error', { message: 'Failed to spend hit die' });
    }
  });
}
