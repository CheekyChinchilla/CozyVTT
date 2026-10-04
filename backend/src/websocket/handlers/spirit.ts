// ============================================
// Spirit layer handlers:
// spirit_layer.toggle / spirit_layer.style_change / spirit_layer.token.toggle
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { sendSystemMessage } from '../utils';
import logger from '../../utils/logger';
import { isValidSpiritStyle } from '../../utils/styleAllowlists';
import { Token, broadcastMapData } from '../shared';
import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked } from '../../utils/mapTokens';
import { getState as getCombatState } from '../initiativeState';
import { resendInitiativeState } from './initiative';
import { bestEffort, campaignSockets } from '../utils';

export function registerSpiritHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * SPIRIT_LAYER.TOGGLE - DM toggles spirit layer visibility for the campaign.
   */
  socket.on('spirit_layer.toggle', async (data: { visible: boolean }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // DM only
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can toggle the spirit layer' });
        return;
      }

      const { visible } = data;

      if (typeof visible !== 'boolean') {
        socket.emit('error', { message: 'visible must be a boolean' });
        return;
      }

      // Update campaign in database
      await prisma.campaign.update({
        where: { id: socket.campaignId },
        data: { spiritLayerEnabled: visible },
      });

      // Broadcast to all campaign members (including sender for confirmation)
      io.to(socket.campaignId).emit('spirit_layer.toggled', {
        visible,
        toggledBy: socket.userId,
        timestamp: new Date().toISOString(),
      });

      // Also broadcast updated filtered map data so clients update their spirit layer rendering.
      // The change is saved by now: a failure to tell the table is logged,
      // and the chat notice below still goes out.
      const campaignId = socket.campaignId;
      await bestEffort('spirit_layer.toggle re-send', async () => {
        const campaignForMap = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { currentMapId: true },
        });
        if (!campaignForMap?.currentMapId) return;
        const currentMap = await prisma.map.findUnique({ where: { id: campaignForMap.currentMapId } });
        if (currentMap) await broadcastMapData(io, campaignId, currentMap);
        // Which plane a player sees decides which combatants they are sent
        if (getCombatState(campaignId).combatants.length > 0) {
          await resendInitiativeState(io, campaignId);
        }
      });

      // Send system message
      await sendSystemMessage(
        socket.campaignId,
        visible
          ? 'The spirit layer has been revealed...'
          : 'The spirit layer has been hidden.',
        { userId: socket.userId, action: 'spirit_layer.toggle', visible }
      );

      logger.info('spirit_layer.toggle', { visible, userId: socket.userId, campaignId: socket.campaignId });
    } catch (error) {
      logger.error('spirit_layer.toggle failed', { err: error });
      socket.emit('error', { message: 'Failed to toggle spirit layer' });
    }
  });

  /**
   * SPIRIT_LAYER.STYLE_CHANGE - DM changes the realm atmosphere style.
   * No DB write here — the REST API already persisted it.
   */
  socket.on('spirit_layer.style_change', (data: { style: string }) => {
    if (!socket.campaignId) return;
    if (socket.role !== 'DM') {
      socket.emit('error', { message: 'Only DMs can change spirit layer style' });
      return;
    }
    // Same allowlist as the REST write path: a named look or custom:#RRGGBB.
    // Every client renders the value as CSS.
    if (typeof data?.style !== 'string' || !isValidSpiritStyle(data.style)) {
      socket.emit('error', { message: 'Invalid spirit layer style' });
      return;
    }
    io.to(socket.campaignId).emit('spirit_layer.style_changed', { style: data.style });
  });

  /**
   * SPIRIT_LAYER.TOKEN.TOGGLE - DM toggles visibility of a specific token.
   * Role-filtered broadcast.
   */
  socket.on('spirit_layer.token.toggle', async (data: { mapId: string; tokenId: string; visible: boolean }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // DM only
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only the DM can toggle token visibility' });
        return;
      }

      const { mapId, tokenId, visible } = data;

      if (!mapId || !tokenId || typeof visible !== 'boolean') {
        socket.emit('error', { message: 'mapId, tokenId, and visible (boolean) required' });
        return;
      }

      // Fetch the map
      const map = await prisma.map.findUnique({
        where: { id: mapId },
      });

      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      // Find and update the token, in the list as it is under the map's
      // lock, like every other write to a map's tokens: a move or an add
      // landing meanwhile used to be written away.
      const updatedTokens = await withMapsLocked([mapId], async (tx) => {
        const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
        const tokens = readTokens(fresh.tokens);
        const index = tokens.findIndex((t) => t.id === tokenId);
        if (index === -1) return null;
        tokens[index] = { ...tokens[index], visible };
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
        return tokens;
      });
      const token: Token | undefined = updatedTokens?.find((t) => t.id === tokenId);

      if (!updatedTokens || !token) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }

      // The DM's own clients get the toggle with the token. Then everyone,
      // the DM included, gets the map again as they may see it: a player is
      // sent the token only if the map fetch would send it (visible, on
      // their plane, in their sight on a lit map), and never with the DM's
      // notes. This used to hand every player the whole token.
      const toggled = { mapId, tokenId, visible, token, toggledBy: socket.userId, timestamp: new Date().toISOString() };
      const campaignId = socket.campaignId;
      // The token is saved by now: a failure to tell the table is logged,
      // not reported to the DM as a failed toggle.
      await bestEffort('spirit_layer.token.toggle re-send', async () => {
        for (const s of await campaignSockets(io, campaignId)) {
          if ((s as unknown as AuthenticatedSocket).role === 'DM') s.emit('spirit_layer.token.toggled', toggled);
        }
        // Only when this is the map the table is on: map.changed puts every
        // client onto the map it carries.
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentMapId: true } });
        if (campaign?.currentMapId === mapId) {
          await broadcastMapData(io, campaignId, { ...map, tokens: toJson(updatedTokens) });
        }
        // Any token: revealing or hiding a player's own spirit-plane token
        // moves them between planes, which changes what they are sent of the
        // whole order, not only an entry of that token.
        if (getCombatState(campaignId).combatants.length > 0) {
          await resendInitiativeState(io, campaignId);
        }
      });

      logger.debug('spirit_layer.token.toggle', { tokenId, visible, userId: socket.userId, mapId });
    } catch (error) {
      logger.error('spirit_layer.token.toggle failed', { err: error });
      socket.emit('error', { message: 'Failed to toggle token visibility' });
    }
  });
}
