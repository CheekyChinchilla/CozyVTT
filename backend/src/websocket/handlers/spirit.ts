// ============================================
// Spirit layer handlers:
// spirit_layer.toggle / spirit_layer.style_change / spirit_layer.token.toggle
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { getSpiritVisibilityBatch, filterMapData } from '../../utils/spirit-layer';
import { sendSystemMessage } from '../utils';
import logger from '../../utils/logger';
import { Token } from '../shared';

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

      // Also broadcast updated filtered map data so clients update their spirit layer rendering
      // Fetch the campaign's current map to send role-filtered updates
      const campaignForMap = await prisma.campaign.findUnique({
        where: { id: socket.campaignId },
        select: { currentMapId: true },
      });

      if (campaignForMap?.currentMapId) {
        const currentMap = await prisma.map.findUnique({
          where: { id: campaignForMap.currentMapId },
        });

        if (currentMap) {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          const visibility = await getSpiritVisibilityBatch(
            socket.campaignId,
            campaignSockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
          );
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            const spiritVisible =
              authedSocket.role === 'DM'
                ? true
                : authedSocket.userId
                  ? (visibility.get(authedSocket.userId) ?? false)
                  : false;
            const filteredMap = filterMapData(
              {
                ...currentMap,
                tokens: currentMap.tokens as any,
                annotations: currentMap.annotations as any,
              },
              authedSocket.role || 'PLAYER',
              spiritVisible,
              authedSocket.userId
            );
            s.emit('map.changed', { mapId: currentMap.id, mapData: filteredMap, spiritVisible });
          }
        }
      }

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

      // Find and update the token
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const tokenIndex = tokensArray.findIndex((t) => t.id === tokenId);

      if (tokenIndex === -1) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }

      const token = tokensArray[tokenIndex];
      token.visible = visible;

      // Save updated tokens to database
      const updatedTokens = [...tokensArray];
      updatedTokens[tokenIndex] = token;

      await prisma.map.update({
        where: { id: mapId },
        data: { tokens: updatedTokens as any },
      });

      // Role-filtered broadcast: use per-socket filtering
      const sockets = await io.in(socket.campaignId).fetchSockets();
      const visibility = await getSpiritVisibilityBatch(
        socket.campaignId,
        sockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
      );

      for (const s of sockets) {
        const authedSocket = s as unknown as AuthenticatedSocket;
        const isSocketDM = authedSocket.role === 'DM';

        // DM always gets the event
        if (isSocketDM) {
          s.emit('spirit_layer.token.toggled', {
            mapId,
            tokenId,
            visible,
            token,
            toggledBy: socket.userId,
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        // Non-DMs: only notify if they can see the token after the change
        // Check spirit visibility for THIS receiver, not the sender
        const receiverSpiritVisible = authedSocket.userId ? (visibility.get(authedSocket.userId) ?? false) : false;

        // They must be able to see spirit layer (if spirit token) AND token must be visible
        if (token.layer === 'spirit' && !receiverSpiritVisible) {
          // Player can't see spirit tokens - skip
          continue;
        }

        if (visible) {
          // Token is now visible - notify player so it appears
          s.emit('spirit_layer.token.toggled', {
            mapId,
            tokenId,
            visible,
            token,
            toggledBy: socket.userId,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Token is now hidden - notify player so it disappears
          // Send minimal data (no full token details for hidden tokens)
          s.emit('spirit_layer.token.toggled', {
            mapId,
            tokenId,
            visible: false,
            toggledBy: socket.userId,
            timestamp: new Date().toISOString(),
          });
        }
      }

      logger.debug('spirit_layer.token.toggle', { tokenId, visible, userId: socket.userId, mapId });
    } catch (error) {
      logger.error('spirit_layer.token.toggle failed', { err: error });
      socket.emit('error', { message: 'Failed to toggle token visibility' });
    }
  });
}
