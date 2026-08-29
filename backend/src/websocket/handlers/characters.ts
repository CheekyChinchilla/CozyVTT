// ============================================
// Character handler: character.hp.update
// Players update their own HP; DM can update any character's HP.
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
}
