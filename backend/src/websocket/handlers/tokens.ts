// ============================================
// Token movement handlers
// token.move.start / token.move (throttled) / token.move.end
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { getSpiritVisibility, getSpiritVisibilityBatch, filterTokensByRole, filterTokensByLighting } from '../../utils/spirit-layer';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { Token, tokenMoveLimiter } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canControlToken } from '../../services/permissions';

/** Why a socket may not move a token, in the words the client already shows. */
const moveRefusal = (role: string | undefined): string =>
  role === 'SPECTATOR' ? 'Spectators cannot move tokens' : 'You do not have permission to move this token';

export function registerTokenHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * Who is sent a token's drag frames on a lit map: the DM's sockets, and the
   * players whose tokens could see the token where its drag began. Frames
   * arrive up to sixty times a second, so the line-of-sight check runs once,
   * on the start event or the first frame, and is reused until token.move.end
   * clears it. A player who could not see the token learns where it ended
   * up, if they can see it there, from the end event's own fan-out.
   */
  const dragRecipients = new Map<string, Set<string>>();
  async function dragRecipientsFor(mapId: string, tokenId: string): Promise<Set<string>> {
    const cached = dragRecipients.get(tokenId);
    if (cached) return cached;
    const ids = new Set<string>();
    const campaignId = socket.campaignId;
    if (!campaignId) return ids;
    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) return ids;
    const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
    const members = await io.in(campaignId).fetchSockets();
    const playerIds = members
      .map((s) => s as unknown as AuthenticatedSocket)
      .filter((a) => a.role !== 'DM' && a.userId)
      .map((a) => a.userId as string);
    const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
    for (const s of members) {
      if (s.id === socket.id) continue;
      const member = s as unknown as AuthenticatedSocket;
      if (member.role === 'DM') { ids.add(s.id); continue; }
      if (!member.userId) continue;
      const forRole = filterTokensByRole(tokens, member.role ?? 'PLAYER', spiritVisibility.get(member.userId) ?? false);
      const seen = filterTokensByLighting(
        forRole, member.userId, map.wallSegments as unknown as WallSegment[],
        map.width, map.height, map.gridSize, true, map.lights, map.globalIllumination
      );
      if (seen.some((t) => t.id === tokenId)) ids.add(s.id);
    }
    dragRecipients.set(tokenId, ids);
    return ids;
  }

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

      // The same rule the REST update route applies, so the channels cannot
      // drift: the DM, or a player (never a spectator) who controls it.
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: moveRefusal(socket.role) });
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
      } else if (!token.visible) {
        // A hidden token is the DM's secret, its id included.
        for (const s of await io.in(socket.campaignId).fetchSockets()) {
          if (s.id !== socket.id && (s as unknown as AuthenticatedSocket).role === 'DM') {
            s.emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
          }
        }
      } else if (map.lightingEnabled) {
        for (const id of await dragRecipientsFor(mapId, tokenId)) {
          io.to(id).emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
        }
      } else {
        // Unlit: every visible token is every player's to see.
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
        select: { width: true, height: true, campaignId: true, tokens: true, lightingEnabled: true },
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

      // Who may move this token, the same pair of checks token.move.start
      // makes. Nothing server-side ties a start event to the moves that follow
      // it, so this cannot lean on that one. Refusals are silent because this
      // fires up to 60 times a second and an error per frame would be its own
      // problem; token.move.end answers properly.
      if (!movingToken) {
        return;
      }

      if (!canControlToken(socket.role, movingToken.controlledBy, socket.userId)) {
        return;
      }

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
      } else if (!movingToken.visible) {
        // A hidden token is the DM's secret; its drag frames reach DMs only.
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        for (const s of campaignSockets) {
          if (s.id === socket.id) continue; // Exclude sender
          if ((s as unknown as AuthenticatedSocket).role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
          }
        }
      } else if (map.lightingEnabled) {
        // Lit: only those who could see the token where the drag began.
        for (const id of await dragRecipientsFor(mapId, tokenId)) {
          io.to(id).emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
        }
      } else {
        // Unlit: every visible token is every player's to see.
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
      // The drag is over; the next one is decided afresh.
      dragRecipients.delete(tokenId);

      // See token.move.start: one rule, shared with the REST update route.
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: moveRefusal(socket.role) });
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
        data: { tokens: toJson(updatedTokens) },
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
        // Dynamic lighting: per-player visibility filtering. The plane and
        // hidden-token rules (filterTokensByRole, the same call the map fetch
        // makes) come first, then line of sight, so a player is never sent a
        // token here that opening the map would not have given them, and the
        // payloads carry no DM notes.
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        const playerIds = campaignSockets
          .map((s) => s as unknown as AuthenticatedSocket)
          .filter((a) => a.role !== 'DM' && a.userId)
          .map((a) => a.userId as string);
        const spiritVisibility = await getSpiritVisibilityBatch(socket.campaignId, playerIds);
        for (const s of campaignSockets) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            continue;
          }
          if (!authedSocket.userId) continue;

          const forRole = filterTokensByRole(
            updatedTokens,
            authedSocket.role ?? 'PLAYER',
            spiritVisibility.get(authedSocket.userId) ?? false
          );
          const visible = filterTokensByLighting(
            forRole,
            authedSocket.userId,
            map.wallSegments as unknown as WallSegment[],
            map.width,
            map.height,
            map.gridSize,
            true,
            map.lights,
            map.globalIllumination
          );
          const visibleById = new Map(visible.map((t) => [t.id, t]));

          const moved = visibleById.get(tokenId);
          if (moved) {
            // Visible: position update AND the full token (frontend deduplicates),
            // in case this player did not have it yet.
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            s.emit('token:appeared', { token: moved, mapId });
          } else {
            s.emit('token:disappeared', { tokenId, mapId });
          }

          // If a player moved their OWN token, their view changed: re-sync all
          // OTHER tokens so those that left or entered view go at once.
          if (token.controlledBy === authedSocket.userId) {
            for (const otherToken of updatedTokens) {
              if (otherToken.id === tokenId) continue; // already handled above
              // Skip own tokens — always included by filterTokensByLighting
              if ((otherToken as Token).controlledBy === authedSocket.userId) continue;
              const other = visibleById.get(otherToken.id);
              if (other) {
                s.emit('token:appeared', { token: other, mapId });
              } else {
                s.emit('token:disappeared', { tokenId: otherToken.id, mapId });
              }
            }
          }
        }
      } else if (!token.visible) {
        // A hidden token is the DM's secret; its final position reaches DMs only.
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        for (const s of campaignSockets) {
          if ((s as unknown as AuthenticatedSocket).role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
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
