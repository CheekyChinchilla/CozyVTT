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
import { canControlToken, canMoveTokensNow, canReadMap, PAUSED_MOVE_REFUSAL } from '../../services/permissions';
import { campaignSockets, stillInCampaign } from '../utils';

/** Why a socket may not move a token, in the words the client already shows. */
const moveRefusal = (role: string | undefined): string =>
  role === 'SPECTATOR' ? 'Spectators cannot move tokens' : 'You do not have permission to move this token';

export function registerTokenHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * Who is sent a token's drag frames: the DM's sockets, and the players the
   * map fetch would send the token to, which on a lit map also means their
   * tokens could see it where its drag began. Frames arrive up to sixty times
   * a second, so the decision, line of sight included, runs once,
   * on the start event or the first frame, and is reused until token.move.end
   * clears it, or until the token is hidden, shown or moved to the other
   * plane mid-drag, which changes who may see it and so decides again. A
   * player who could not see the token learns where it ended up, if they can
   * see it there, from the end event's own fan-out.
   */
  const dragRecipients = new Map<string, { seenAs: string; deciding: Promise<Set<string>> }>();
  const seenAs = (token: Pick<Token, 'visible' | 'layer'>) => `${token.visible !== false}|${token.layer}`;
  function dragRecipientsFor(mapId: string, token: Token): Promise<Set<string>> {
    const cached = dragRecipients.get(token.id);
    if (cached && cached.seenAs === seenAs(token)) return cached.deciding;
    // The promise is cached, not its result, so frames that arrive while the
    // first one is still being decided wait for it instead of deciding again.
    const deciding = decideDragRecipients(mapId, token.id);
    dragRecipients.set(token.id, { seenAs: seenAs(token), deciding });
    return deciding;
  }
  async function decideDragRecipients(mapId: string, tokenId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    const campaignId = socket.campaignId;
    if (!campaignId) return ids;
    const map = await prisma.map.findUnique({
      where: { id: mapId },
      include: { campaign: { select: { currentMapId: true } } },
    });
    if (!map) return ids;
    const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
    const members = await campaignSockets(io, campaignId);
    const playerIds = members
      .map((s) => s as unknown as AuthenticatedSocket)
      .filter((a) => a.role !== 'DM' && a.userId)
      .map((a) => a.userId as string);
    const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
    for (const s of stillInCampaign(members, campaignId)) {
      if (s.id === socket.id) continue;
      const member = s as unknown as AuthenticatedSocket;
      // A map the DM is preparing is theirs until they switch to it.
      if (!canReadMap(member.role, mapId, map.campaign.currentMapId)) continue;
      if (member.role === 'DM') { ids.add(s.id); continue; }
      if (!member.userId) continue;
      const forRole = filterTokensByRole(tokens, member.role ?? 'PLAYER', spiritVisibility.get(member.userId) ?? false, member.userId);
      const seen = filterTokensByLighting(
        forRole, viewerIdFor(member.role, member.userId), map.wallSegments as unknown as WallSegment[],
        map.width, map.height, map.gridSize, map.lightingEnabled, map.lights, map.globalIllumination
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
   * each applied a different subset of those rules. A map the DM is
   * preparing reaches only DMs, as its fetch does. Each recipient is told
   * of the mover what they may know.
   */
  async function emitMoveToVisibleSockets(
    event: string,
    token: Token,
    mapId: string,
    currentMapId: string | null,
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
    for (const s of stillInCampaign(members, campaignId)) {
      if (!includeSender && s.id === socket.id) continue;
      const recipient = s as unknown as AuthenticatedSocket;
      if (!canReadMap(recipient.role, mapId, currentMapId)) continue;
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
    const recipients = await dragRecipientsFor(mapId, token);
    // Decided once for the whole drag, so each frame goes only to those of
    // them still in this campaign: a socket that authenticated into another
    // since is not sent its old table's token positions. Reading the room
    // is in memory, with no database work per frame.
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

      // Flood ceiling: drop excess starts silently. A start reads the whole
      // map before any of its refusals, and a drag sends one, so it shares
      // the per-user budget of token.move and token.move.end.
      if (!tokenMoveLimiter.check(limiterKey(socket), 150, 1000)) {
        return;
      }

      const { tokenId, mapId } = data;

      if (!tokenId || !mapId) {
        socket.emit('error', { message: 'tokenId and mapId required' });
        return;
      }

      // A new drag: whoever this token's frames went to last time is decided
      // afresh, in case the last drag never reached token.move.end. Cleared
      // before the first await, so frames sent right behind this event share
      // the one decision instead of making one this then throws away.
      dragRecipients.delete(tokenId);

      // Fetch the map, with the campaign's status for the pause rule below
      // and its current map: a map the DM is preparing is not a player's to
      // touch until it is shown (canReadMap, the rule its fetch applies)
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true, currentMapId: true } } },
      });

      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
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

      await emitMoveToDragRecipients('token.move.start', token, mapId, { tokenId, mapId });

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
        select: { width: true, height: true, campaignId: true, tokens: true, lightingEnabled: true, campaign: { select: { status: true, currentMapId: true } } },
      });

      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
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

      // Who may move this token, the same checks token.move.start makes.
      // Nothing server-side ties a start event to the moves that follow it,
      // so this cannot lean on that one. Refusals are silent because this
      // fires up to 60 times a second and an error per frame would be its own
      // problem; token.move.end answers properly.
      if (!movingToken) {
        return;
      }

      if (!canControlToken(socket.role, movingToken.controlledBy, socket.userId)) {
        return;
      }

      // The plane rule, as on the start and the drop. It reads the database
      // only for a spirit-layer token moved by someone other than the DM.
      if (!(await canActOnTokenPlane(socket.role, movingToken, socket.campaignId, socket.userId!))) {
        return;
      }

      // A player's frames are dropped through a pause too, or the token
      // would still wander on everyone else's screen.
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        return;
      }

      // To those decided when the drag began (on a lit map, those who could
      // see the token there), not decided again for every frame.
      await emitMoveToDragRecipients('token.moved', movingToken, mapId, { tokenId, mapId, x, y });
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
      // per-user budget with token.move; a normal drag stays far under it.
      if (!tokenMoveLimiter.check(limiterKey(socket), 150, 1000)) {
        return;
      }

      const { tokenId, mapId, x, y } = data;

      if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
        socket.emit('error', { message: 'Invalid token move data' });
        return;
      }

      // Fetch the map, with the campaign's status for the pause rule below
      // and its current map, for whether this socket may move tokens on it
      // and who is told
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        include: { campaign: { select: { status: true, currentMapId: true } } },
      });

      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
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
      // The drag is over; the next one is decided afresh. Who its frames
      // went to is kept for a refused drop, below.
      const sawTheDrag = dragRecipients.get(tokenId)?.deciding;
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
        // A pause can land after the token was picked up: the mover's screen
        // has already drawn the drop, and the frames sent before the pause
        // reached everyone the drag went to. Tell them all where the token
        // is. The correction names no mover, since nobody moved it.
        const back = { tokenId, mapId, x: token.position.x, y: token.position.y, movedBy: null };
        socket.emit('token.moved', back);
        if (sawTheDrag) {
          const recipients = await sawTheDrag;
          for (const s of await campaignSockets(io, socket.campaignId)) {
            if (recipients.has(s.id)) s.emit('token.moved', back);
          }
        }
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
        for (const s of stillInCampaign(members, socket.campaignId)) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          if (authedSocket.role === 'DM') {
            s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            continue;
          }
          if (!authedSocket.userId) continue;
          if (!canReadMap(authedSocket.role, mapId, map.campaign.currentMapId)) continue;

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
        await emitMoveToVisibleSockets(
          'token.moved', token, mapId, map.campaign.currentMapId, { tokenId, mapId, x, y }, true
        );
      }

      logger.debug('token.move.end', { tokenId, x, y, userId: socket.userId });
    } catch (error) {
      logger.error('token.move.end failed', { err: error });
      socket.emit('error', { message: 'Failed to finalize token movement' });
    }
  });
}
