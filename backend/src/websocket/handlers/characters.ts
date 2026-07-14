// ============================================
// Character handler: character.hp.update
// Players update their own HP; DM can update any character's HP.
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';

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

      // System-aware HP read + apply delta
      const charData = character.data as Record<string, any>;
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
        data: { data: charData },
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
