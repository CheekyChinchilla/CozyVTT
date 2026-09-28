// ============================================
// Token movement handlers
// token.move.start / token.move (throttled) / token.move.end
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { canActOnTokenPlane, getSpiritVisibilityBatch, filterTokensByRole, filterTokensByLighting, viewerIdFor } from '../../utils/spirit-layer';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { Token, tokenMoveLimiter, limiterKey } from '../shared';
import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked } from '../../utils/mapTokens';
import { canControlToken, canMoveTokensNow, PAUSED_MOVE_REFUSAL } from '../../services/permissions';
import { campaignSockets } from '../utils';

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
  const dragRecipients = new Map<string, Promise<Set<string>>>();
  function dragRecipientsFor(mapId: string, tokenId: string): Promise<Set<string>> {
    const cached = dragRecipients.get(tokenId);
    if (cached) return cached;
    // The promise is cached, not its result, so frames that arrive while the
    // first one is still being decided wait for it instead of deciding again.
    const deciding = decideDragRecipients(mapId, tokenId);
    dragRecipients.set(tokenId, deciding);
    return deciding;
  }
  async function decideDragRecipients(mapId: string, tokenId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const campaignId = socket.campaignId;
    if (!campaignId) return ids;
    const map = await prisma.map.findUnique({ where: { id: mapId } });
    if (!map) return ids;
    const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
    const members = await campaignSockets(io, campaignId);
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
      const forRole = filterTokensByRole(tokens, member.role ?? 'PLAYER', spiritVisibility.get(member.userId) ?? false, member.userId);
      const seen = filterTokensByLighting(
        forRole, viewerIdFor(member.role, member.userId), map.wallSegments as unknown as WallSegment[],
        map.width, map.height, map.gridSize, true, map.lights, map.globalIllumination
      );
      if (seen.some((t) => t.id === tokenId)) ids.add(s.id);
    }
    return ids;
  }

  /**
   * Who a recipient is told moved the token. An obscured token's controller
   * is part of what obscuring hides (the roster maps the id to a name), so
   * while a token is obscured only the DM and the mover's own screens learn
   * who moved it; anyone else is told null.
   */
  function moverShownTo(token: Token, recipient: AuthenticatedSocket): string | null {
    const mover = socket.userId ?? null;
    if (token.obscured !== true) return mover;
    return recipient.role === 'DM' || recipient.userId === socket.userId ? mover : null;
  }

  /**
   * A move event to everyone the map fetch would send this token to: every
   * DM, and a player for whom the role filter keeps it (visible, on their
   * plane). One path for every token, so a hidden token and a spirit-plane
   * token get the same treatment moving that they get when the map is
   * opened; the four branches this replaced (spirit, hidden, lit, unlit)
   * each applied a different subset of those rules. Each recipient is told
   * of the mover what they may know.
   */
  async function emitMoveToVisibleSockets(
    event: string,
    token: Token,
    payload: Record<string, unknown>,
    includeSender: boolean
  ): Promise<void> {
    const campaignId = socket.campaignId!;
    const members = await campaignSockets(io, campaignId);
    const playerIds = members
      .map((s) => s as unknown as AuthenticatedSocket)
      .filter((a) => a.role !== 'DM' && a.userId)
      .map((a) => a.userId as string);
    const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
    for (const s of members) {
      if (!includeSender && s.id === socket.id) continue;
      const recipient = s as unknown as AuthenticatedSocket;
      if (recipient.role !== 'DM') {
        if (!recipient.userId) continue;
        const sent = filterTokensByRole([token], recipient.role ?? 'PLAYER', spiritVisibility.get(recipient.userId) ?? false, recipient.userId);
        if (sent.length === 0) continue;
      }
      s.emit(event, { ...payload, movedBy: moverShownTo(token, recipient) });
    }
  }

  /** The same, to the sockets decided for this drag on a lit map. */
  async function emitMoveToDragRecipients(
    event: string,
    token: Token,
    mapId: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const recipients = await dragRecipientsFor(mapId, token.id);
    if (token.obscured !== true) {
      for (const id of recipients) io.to(id).emit(event, { ...payload, movedBy: socket.userId });
      return;
    }
    for (const s of await campaignSockets(io, socket.campaignId!)) {
      if (recipients.has(s.id)) {
        s.emit(event, { ...payload, movedBy: moverShownTo(token, s as unknown as AuthenticatedSocket) });
      }
    }
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

      // Fetch the map, with the campaign's status for the pause rule below
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true } } },
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

      // The same plane rule the REST update route applies.
      if (!(await canActOnTokenPlane(socket.role, token, socket.campaignId, socket.userId!))) {
        socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
        return;
      }

      // And the same session rule: a player's drag waits for the session.
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        return;
      }

      // A new drag: whoever this token's frames went to last time is decided
      // afresh, in case the last drag never reached token.move.end.
      dragRecipients.delete(tokenId);

      if (map.lightingEnabled) {
        await emitMoveToDragRecipients('token.move.start', token, mapId, { tokenId, mapId });
      } else {
        await emitMoveToVisibleSockets('token.move.start', token, { tokenId, mapId }, false);
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
      if (!tokenMoveLimiter.check(limiterKey(socket), 150, 1000)) {
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
        select: { width: true, height: true, campaignId: true, tokens: true, lightingEnabled: true, campaign: { select: { status: true } } },
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

      // A player's frames are dropped through a pause too, or the token
      // would still wander on everyone else's screen.
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        return;
      }

      if (map.lightingEnabled) {
        // Lit: only those who could see the token where the drag began.
        await emitMoveToDragRecipients('token.moved', movingToken, mapId, { tokenId, mapId, x, y });
      } else {
        await emitMoveToVisibleSockets('token.moved', movingToken, { tokenId, mapId, x, y }, false);
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
      if (!tokenMoveLimiter.check(limiterKey(socket), 150, 1000)) {
        return;
      }

      const { tokenId, mapId, x, y } = data;

      if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
        socket.emit('error', { message: 'Invalid token move data' });
        return;
      }

      // Fetch the map, with the campaign's status for the pause rule below
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true } } },
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

      // The same plane rule the REST update route applies.
      if (!(await canActOnTokenPlane(socket.role, token, socket.campaignId, socket.userId!))) {
        socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
        return;
      }

      // And the same session rule: a player's move waits for the session.
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        // A pause can land after the token was picked up, and the mover's
        // screen has already drawn the drop. Tell it where the token is.
        socket.emit('token.moved', {
          tokenId, mapId, x: token.position.x, y: token.position.y, movedBy: socket.userId ?? null,
        });
        return;
      }

      // Update token position, in the list as it is under the map's lock: a
      // DM's add or delete landing during the drag used to be written away.
      token.position = { x, y };
      const updatedTokens = await withMapsLocked([mapId], async (tx) => {
        const fresh = await tx.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
        const tokens = readTokens(fresh.tokens);
        const index = tokens.findIndex((t) => t.id === tokenId);
        if (index !== -1) tokens[index] = { ...tokens[index], position: { x, y } };
        await tx.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });
        return tokens;
      });

      if (map.lightingEnabled) {
        // Dynamic lighting: per-player visibility filtering. The plane and
        // hidden-token rules (filterTokensByRole, the same call the map fetch
        // makes) come first, then line of sight, so a player is never sent a
        // token here that opening the map would not have given them, and the
        // payloads carry no DM notes.
        const members = await campaignSockets(io, socket.campaignId);
        const playerIds = members
          .map((s) => s as unknown as AuthenticatedSocket)
          .filter((a) => a.role !== 'DM' && a.userId)
          .map((a) => a.userId as string);
        const spiritVisibility = await getSpiritVisibilityBatch(socket.campaignId, playerIds);
        for (const s of members) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            continue;
          }
          if (!authedSocket.userId) continue;

          const viewer = viewerIdFor(authedSocket.role, authedSocket.userId);
          const forRole = filterTokensByRole(
            updatedTokens,
            authedSocket.role ?? 'PLAYER',
            spiritVisibility.get(authedSocket.userId) ?? false,
            authedSocket.userId
          );
          const visible = filterTokensByLighting(
            forRole,
            viewer,
            map.wallSegments as unknown as WallSegment[],
            map.width,
            map.height,
            map.gridSize,
            true,
            map.lights,
            map.globalIllumination
          );
          const visibleById = new Map(visible.map((t) => [t.id, t]));
          // Only a token this player may have at all is ever named to them:
          // hidden and off-plane tokens are not in forRole, so no
          // token:disappeared carries their ids.
          const mayHave = new Set(forRole.map((t) => t.id));

          const moved = visibleById.get(tokenId);
          if (moved) {
            // Visible: position update AND the full token (frontend deduplicates),
            // in case this player did not have it yet.
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: moverShownTo(token, authedSocket) });
            s.emit('token:appeared', { token: moved, mapId });
          } else if (mayHave.has(tokenId)) {
            s.emit('token:disappeared', { tokenId, mapId });
          }

          // If a player moved their OWN token, their view changed: re-sync all
          // OTHER tokens so those that left or entered view go at once.
          if (viewer && token.controlledBy === viewer) {
            for (const otherToken of forRole) {
              if (otherToken.id === tokenId) continue; // already handled above
              // Skip own tokens — always included by filterTokensByLighting
              if ((otherToken as Token).controlledBy === viewer) continue;
              const other = visibleById.get(otherToken.id);
              if (other) {
                s.emit('token:appeared', { token: other, mapId });
              } else {
                s.emit('token:disappeared', { tokenId: otherToken.id, mapId });
              }
            }
          }
        }
      } else {
        // The sender included, as confirmation that the write went through.
        await emitMoveToVisibleSockets('token.moved', token, { tokenId, mapId, x, y }, true);
      }

      logger.debug('token.move.end', { tokenId, x, y, userId: socket.userId });
    } catch (error) {
      logger.error('token.move.end failed', { err: error });
      socket.emit('error', { message: 'Failed to finalize token movement' });
    }
  });
}
