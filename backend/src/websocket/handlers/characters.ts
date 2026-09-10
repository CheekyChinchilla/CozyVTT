// ============================================
// Character handlers: character.hp.update, character.hitdice.spend
// Players act on their own characters; the DM may act on any of them.
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { toJson } from '../../utils/prisma-json';

/** The parts of a character blob this handler touches — see `charData` below. */
interface HpBlock {
  current?: unknown;
  maximum?: unknown;
  temporary?: unknown;
}
/** One hit dice pool: `total` is the pool ("5d8"), `remaining` how many are left. */
interface HitDiceEntry {
  class?: unknown;
  total?: unknown;
  remaining?: unknown;
}
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

export function registerCharacterHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('character.hp.update', async (data: { characterId: string; delta: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

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

      // Permission: character owner or DM
      if (character.userId !== socket.userId && socket.role !== 'DM') {
        socket.emit('error', { message: 'You do not have permission to update this character\'s HP' });
        return;
      }

      // System-aware HP read + apply delta.
      //
      // Only the HP-bearing corners of the sheet are described here: the blob is
      // a full character in one of several systems, and this handler reads and
      // writes nothing else. The values stay `unknown` because the guards below
      // are what establish they are numbers — those guards are pre-existing, and
      // typing them out is the whole reason this is no longer `any`.
      const charData = character.data as unknown as CharacterHpData;
      let current: number;
      let max: number;
      let temp: number;

      switch (character.gameSystem) {
        case 'DND_5E':
        case 'PATHFINDER_2E': {
          if (!charData.hp || typeof charData.hp.maximum !== 'number') {
            socket.emit('error', { message: 'Character does not have HP tracking' });
            return;
          }
          max = charData.hp.maximum;
          temp = typeof charData.hp.temporary === 'number' ? charData.hp.temporary : 0;
          current = Math.max(0, Math.min(max, (typeof charData.hp.current === 'number' ? charData.hp.current : max) + delta));
          charData.hp.current = current;
          break;
        }
        case 'CALL_OF_CTHULHU_7E': {
          if (!charData.derivedStats?.hp || typeof charData.derivedStats.hp.maximum !== 'number') {
            socket.emit('error', { message: 'Character does not have HP tracking' });
            return;
          }
          max = charData.derivedStats.hp.maximum;
          temp = 0;
          current = Math.max(0, Math.min(max, (typeof charData.derivedStats.hp.current === 'number' ? charData.derivedStats.hp.current : max) + delta));
          charData.derivedStats.hp.current = current;
          break;
        }
        default:
          socket.emit('error', { message: 'HP tracking not supported for this game system' });
          return;
      }

      // Save updated character data
      await prisma.character.update({
        where: { id: characterId },
        data: { data: toJson(charData) },
      });

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

      if (character.userId !== socket.userId && socket.role !== 'DM') {
        socket.emit('error', { message: 'You do not have permission to spend this character\'s hit dice' });
        return;
      }

      if (character.gameSystem !== 'DND_5E') {
        socket.emit('error', { message: 'Hit dice are not tracked for this game system' });
        return;
      }

      const charData = character.data as unknown as CharacterHitDiceData;
      const pools = Array.isArray(charData.hitDice) ? (charData.hitDice as HitDiceEntry[]) : null;
      if (!pools || !pools[index]) {
        socket.emit('error', { message: 'No hit dice pool at that position' });
        return;
      }

      const entry = pools[index];
      const remaining = typeof entry.remaining === 'number' ? entry.remaining : 0;
      if (remaining <= 0) {
        socket.emit('error', { message: 'No hit dice remaining to spend' });
        return;
      }

      entry.remaining = remaining - 1;

      await prisma.character.update({
        where: { id: characterId },
        data: { data: toJson(charData) },
      });

      io.to(socket.campaignId).emit('character.hitdice.spent', {
        characterId,
        index,
        remaining: entry.remaining,
      });

    } catch (error) {
      logger.error('character.hitdice.spend failed', { err: error });
      socket.emit('error', { message: 'Failed to spend hit die' });
    }
  });
}
