// ============================================
// Token movement handlers
// token.move.start / token.move (throttled) / token.move.end
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { getSpiritVisibility, getSpiritVisibilityBatch, filterTokensByLighting } from '../../utils/spirit-layer';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { Token, tokenMoveLimiter } from '../shared';

export function registerTokenHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * TOKEN.MOVE.START - User begins dragging a token
   * Validates permission and broadcasts to campaign
   */
  socket.on('token.move.start', async (data: { tokenId: string; mapId: string }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { tokenId, mapId } = data;

      if (!tokenId || !mapId) {
        socket.emit('error', { message: 'tokenId and mapId required' });
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

      // Get tokens array
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const token = tokensArray.find((t) => t.id === tokenId);

      if (!token) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }

      // Permission check: DM can move any token, players can only move their own
      if (socket.role !== 'DM' && token.controlledBy !== socket.userId) {
        socket.emit('error', { message: 'You do not have permission to move this token' });
        return;
      }

      // Spectators cannot move tokens (already handled by controlledBy check, but explicit)
      if (socket.role === 'SPECTATOR') {
        socket.emit('error', { message: 'Spectators cannot move tokens' });
        return;
      }

      // Spirit layer check: non-DMs cannot interact with spirit tokens when spirit layer is disabled
      if (token.layer === 'spirit' && socket.role !== 'DM') {
        const spiritVisible = await getSpiritVisibility(socket.campaignId, socket.userId!);
        if (!spiritVisible) {
          socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
          return;
        }
      }

      // Role-filtered broadcast for spirit tokens
      if (token.layer === 'spirit') {
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        const visibility = await getSpiritVisibilityBatch(
          socket.campaignId,
          campaignSockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
        );
        for (const s of campaignSockets) {
          if (s.id === socket.id) continue; // Exclude sender
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
          } else if (authedSocket.userId && visibility.get(authedSocket.userId)) {
            s.emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
          }
        }
      } else {
        // Normal token - broadcast to all campaign members (excluding sender)
        socket.to(socket.campaignId).emit('token.move.start', {
          tokenId,
          mapId,
          movedBy: socket.userId,
        });
      }

      logger.debug('token.move.start', { tokenId, userId: socket.userId, mapId });
    } catch (error) {
      logger.error('token.move.start failed', { err: error });
      socket.emit('error', { message: 'Failed to start token movement' });
    }
  });

  /**
   * TOKEN.MOVE - Position updates during drag (throttled to 60/s)
   * Validates coordinates and broadcasts to campaign
   */
  const handleTokenMove = throttle(async (socket: AuthenticatedSocket, data: { tokenId: string; mapId: string; x: number; y: number }) => {
    try {
      if (!socket.campaignId) {
        return; // Silently ignore if not authenticated
      }

      // Flood ceiling: drop excess frames silently — the 16ms throttle
      // already paces legitimate drags well under this limit.
      if (!tokenMoveLimiter.check(socket.id, 150, 1000)) {
        return;
      }

      const { tokenId, mapId, x, y } = data;

      if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
        return; // Silently ignore invalid data during rapid updates
      }

      // Single fetch covers bounds validation AND the spirit-layer check below
      // (this handler fires up to ~60×/s during a drag, so one query per frame
      // instead of two is the meaningful per-frame win).
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { width: true, height: true, campaignId: true, tokens: true },
      });

      if (!map || map.campaignId !== socket.campaignId) {
        return; // Silently ignore invalid map during rapid updates
      }

      // Validate coordinates are within map bounds
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
        socket.emit('error', { message: 'Token position out of bounds' });
        return;
      }

      // Get the token to check if it's a spirit layer token
      const movingTokens = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const movingToken = movingTokens.find((t) => t.id === tokenId);

      // Role-filtered broadcast for spirit tokens
      if (movingToken && movingToken.layer === 'spirit') {
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        const visibility = await getSpiritVisibilityBatch(
          socket.campaignId,
          campaignSockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
        );
        for (const s of campaignSockets) {
          if (s.id === socket.id) continue; // Exclude sender
          const authedSocket = s as unknown as AuthenticatedSocket;
          // Only send spirit token movement to DMs and players with spirit visibility
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
          } else if (authedSocket.userId && visibility.get(authedSocket.userId)) {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
          }
        }
      } else {
        // Normal token - broadcast to all campaign members (excluding sender)
        socket.to(socket.campaignId).emit('token.moved', {
          tokenId,
          mapId,
          x,
          y,
          movedBy: socket.userId,
        });
      }
    } catch (error) {
      logger.error('token.move failed', { err: error });
    }
  }, 16); // 16ms = ~60fps (1000ms / 60fps = 16.67ms)

  socket.on('token.move', (data: { tokenId: string; mapId: string; x: number; y: number }) => {
    handleTokenMove(socket, data);
  });

  /**
   * TOKEN.MOVE.END - User finishes dragging (final position)
   * Updates database and broadcasts to campaign
   */
  socket.on('token.move.end', async (data: { tokenId: string; mapId: string; x: number; y: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      // Flood ceiling: drop excess finalize writes silently. Shares the
      // per-socket budget with token.move; a normal drag stays far under it.
      if (!tokenMoveLimiter.check(socket.id, 150, 1000)) {
        return;
      }

      const { tokenId, mapId, x, y } = data;

      if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
        socket.emit('error', { message: 'Invalid token move data' });
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

      // Validate coordinates are within map bounds
      if (x < 0 || x >= map.width || y < 0 || y >= map.height) {
        socket.emit('error', { message: 'Token position out of bounds' });
        return;
      }

      // Get tokens array
      const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
      const tokenIndex = tokensArray.findIndex((t) => t.id === tokenId);

      if (tokenIndex === -1) {
        socket.emit('error', { message: 'Token not found' });
        return;
      }

      const token = tokensArray[tokenIndex];

      // Permission check: DM can move any token, players can only move their own
      if (socket.role !== 'DM' && token.controlledBy !== socket.userId) {
        socket.emit('error', { message: 'You do not have permission to move this token' });
        return;
      }

      // Spirit layer check: non-DMs cannot interact with spirit tokens when spirit layer is disabled
      if (token.layer === 'spirit' && socket.role !== 'DM') {
        const spiritVisible = await getSpiritVisibility(socket.campaignId, socket.userId!);
        if (!spiritVisible) {
          socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
          return;
        }
      }

      // Update token position
      token.position = { x, y };

      // Update the tokens array in database
      const updatedTokens = [...tokensArray];
      updatedTokens[tokenIndex] = token;

      await prisma.map.update({
        where: { id: mapId },
        data: { tokens: updatedTokens as any },
      });

      // Role-filtered broadcast for spirit tokens
      if (token.layer === 'spirit') {
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        const visibility = await getSpiritVisibilityBatch(
          socket.campaignId,
          campaignSockets.map((s) => (s as unknown as AuthenticatedSocket).userId).filter((id): id is string => !!id)
        );
        for (const s of campaignSockets) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
          } else if (authedSocket.userId && visibility.get(authedSocket.userId)) {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
          }
        }
      } else if (map.lightingEnabled) {
        // Dynamic lighting: per-player visibility filtering
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        for (const s of campaignSockets) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            continue;
          }
          if (!authedSocket.userId) continue;

          // Compute which tokens are visible for this player after the move
          const allVisible = filterTokensByLighting(
            updatedTokens,
            authedSocket.userId,
            map.wallSegments as unknown as WallSegment[],
            map.width,
            map.height,
            map.gridSize,
            true,
            map.lights
          );
          const visibleIds = new Set(allVisible.map((t) => t.id));

          if (visibleIds.has(tokenId)) {
            // Token is visible: send position update AND appeared (frontend deduplicates)
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            // Also send full token data in case this player didn't have it yet
            s.emit('token:appeared', { token: { ...token, position: { x, y } }, mapId });
          } else {
            s.emit('token:disappeared', { tokenId, mapId });
          }

          // If a player moved their OWN token, their view frustum changed —
          // re-sync all OTHER tokens so NPCs that left/entered view appear/disappear immediately.
          if (token.controlledBy === authedSocket.userId) {
            for (const otherToken of updatedTokens) {
              if (otherToken.id === tokenId) continue; // already handled above
              // Skip own tokens — always included by filterTokensByLighting
              if ((otherToken as Token).controlledBy === authedSocket.userId) continue;
              if (visibleIds.has(otherToken.id)) {
                s.emit('token:appeared', { token: otherToken, mapId });
              } else {
                s.emit('token:disappeared', { tokenId: otherToken.id, mapId });
              }
            }
          }
        }
      } else {
        // Normal token - broadcast to all campaign members (including sender for confirmation)
        io.to(socket.campaignId).emit('token.moved', {
          tokenId,
          mapId,
          x,
          y,
          movedBy: socket.userId,
        });
      }

      logger.debug('token.move.end', { tokenId, x, y, userId: socket.userId });
    } catch (error) {
      logger.error('token.move.end failed', { err: error });
      socket.emit('error', { message: 'Failed to finalize token movement' });
    }
  });
}
