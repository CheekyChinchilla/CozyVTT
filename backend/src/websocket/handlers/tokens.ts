// ============================================
// Token movement handlers
// token.move.start / token.move (throttled) / token.move.end
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import {
  canActOnTokenPlane, getSpiritVisibilityBatch, filterTokensByRole, filterTokensByLighting, playerSightOnLitMap,
  tokenForRecipient, viewerIdFor,
} from '../../utils/spirit-layer';
import type { Map as MapRow } from '@prisma/client';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { Token, tokenMoveLimiter, limiterKey, withinCeiling } from '../shared';
import { readTokens, toJson } from '../../utils/prisma-json';
import { withMapsLocked, clampTokenPosition } from '../../utils/mapTokens';
import { canControlToken, canMoveTokensNow, canReadMap, PAUSED_MOVE_REFUSAL } from '../../services/permissions';
import { campaignSockets, stillInCampaign } from '../utils';

/** How one member is sent a dragged token. */
interface FrameRecipient {
  /** Whether they may see the token where it is put: always, off a lit map. */
  sees: (token: Token) => boolean;
  /** The token as they are sent it, with only the fields they may have. */
  shown: (token: Token) => Token;
}

/** Who a drag's frames may reach, and which of them have the token now. */
interface DragAudience {
  recipients: Map<string, FrameRecipient>;
  holding: Set<string>;
}

/** Why a socket may not move a token, in the words the client already shows. */
const moveRefusal = (role: string | undefined): string =>
  role === 'SPECTATOR' ? 'Spectators cannot move tokens' : 'You do not have permission to move this token';

export function registerTokenHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * Who is sent a token's drag frames: the DM's sockets, and the players the
   * map fetch would send the token to where each frame puts it. On a lit map
   * that means their tokens can see that position, so a token carried out of
   * a player's sight stops reaching them, and they are told it has gone, at
   * the frame that takes it out; one carried into their sight is sent to
   * them there. Frames arrive up to sixty times a second, so the expensive
   * part (who may have the token at all, and each player's line of sight) is
   * decided once, on the start event or the first frame, and each frame only
   * tests its position against it. The decision is reused until
   * token.move.end clears it, or until the token is hidden, shown or moved to
   * the other plane mid-drag, which changes who may see it and so decides
   * again. Who may see it also turns on each player's plane, their role, the
   * map on screen, and on a lit map the walls, lights and their own tokens,
   * which can change mid-drag without touching the token, so the decision is
   * made again at least every DRAG_DECISION_MS (LIT_DRAG_DECISION_MS on a lit
   * map) as well.
   */
  const DRAG_DECISION_MS = 1000;
  const LIT_DRAG_DECISION_MS = 250;
  const drags = new Map<string, { seenAs: string; at: number; deciding: Promise<DragAudience> }>();
  const seenAs = (token: Pick<Token, 'visible' | 'layer'>) => `${token.visible !== false}|${token.layer}`;
  function dragAudienceFor(mapId: string, token: Token, lit: boolean): Promise<DragAudience> {
    const cached = drags.get(token.id);
    const now = Date.now();
    const sameSight = cached !== undefined && cached.seenAs === seenAs(token);
    if (sameSight && now - cached.at < (lit ? LIT_DRAG_DECISION_MS : DRAG_DECISION_MS)) return cached.deciding;
    // The promise is cached, not its result, so frames that arrive while the
    // first one is still being decided wait for it instead of deciding again.
    // Decided again for the same drag, who has the token is what the frames
    // so far have left them with; a change of visibility or plane has its own
    // fan-out, so who has it then starts again from where it stands.
    const previous = sameSight ? cached.deciding : null;
    const deciding = decideDragAudience(mapId, token.id).then(async (audience) => {
      const before = previous ? await previous.catch(() => null) : null;
      if (before) audience.holding = before.holding;
      return audience;
    });
    drags.set(token.id, { seenAs: seenAs(token), at: now, deciding });
    return deciding;
  }
  async function decideDragAudience(mapId: string, tokenId: string): Promise<DragAudience> {
    const audience: DragAudience = { recipients: new Map(), holding: new Set() };
    const campaignId = socket.campaignId;
    if (!campaignId) return audience;
    const map = await prisma.map.findUnique({
      where: { id: mapId },
      include: { campaign: { select: { currentMapId: true } } },
    });
    if (!map) return audience;
    const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
    const token = tokens.find((t) => t.id === tokenId);
    if (!token) return audience;
    const members = await campaignSockets(io, campaignId);
    const playerIds = members
      .map((s) => s as unknown as AuthenticatedSocket)
      .filter((a) => a.role !== 'DM' && a.userId)
      .map((a) => a.userId as string);
    const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
    for (const s of stillInCampaign(members, campaignId)) {
      if (s.id === socket.id) continue;
      const recipient = frameRecipient(s as unknown as AuthenticatedSocket, map, tokens, tokenId, spiritVisibility);
      if (!recipient) continue;
      audience.recipients.set(s.id, recipient);
      if (recipient.sees(token)) audience.holding.add(s.id);
    }
    return audience;
  }

  /**
   * How one member is sent a token while it is dragged, or null when they
   * may not have it wherever it goes: every DM, and a player for whom the
   * role filter keeps it (visible, on their plane), with the line of sight
   * their tokens have on a lit map. A map the DM is preparing is theirs
   * until they switch to it.
   */
  function frameRecipient(
    member: AuthenticatedSocket,
    map: MapRow & { campaign: { currentMapId: string | null } },
    tokens: Token[],
    tokenId: string,
    spiritVisibility: Map<string, boolean>
  ): FrameRecipient | null {
    if (!canReadMap(member.role, map.id, map.campaign.currentMapId)) return null;
    if (member.role === 'DM') return { sees: () => true, shown: (t) => t };
    if (!member.userId) return null;
    const forRole = filterTokensByRole(tokens, member.role ?? 'PLAYER', spiritVisibility.get(member.userId) ?? false, member.userId);
    if (!forRole.some((t) => t.id === tokenId)) return null;
    const viewer = viewerIdFor(member.role, member.userId);
    const shown = (t: Token) => tokenForRecipient(t, viewer);
    if (!map.lightingEnabled) return { sees: () => true, shown };
    const sight = playerSightOnLitMap(
      forRole, viewer, map.wallSegments as unknown as WallSegment[],
      map.width, map.height, map.gridSize, map.lights, map.globalIllumination
    );
    return { sees: (t) => sight.seesToken(t), shown };
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

  /**
   * The start of a drag, to the members decided for it who have the token
   * where it stands.
   */
  async function emitDragStart(token: Token, mapId: string, lit: boolean): Promise<void> {
    const audience = await dragAudienceFor(mapId, token, lit);
    // Decided once for the whole drag, so each event goes only to those of
    // them still in this campaign: a socket that authenticated into another
    // since is not sent its old table's token positions. Reading the room
    // is in memory, with no database work per frame.
    for (const s of await campaignSockets(io, socket.campaignId!)) {
      if (audience.holding.has(s.id)) {
        s.emit('token.move.start', { tokenId: token.id, mapId, movedBy: moverShownTo(token, s as unknown as AuthenticatedSocket) });
      }
    }
  }

  /**
   * One drag frame. Each member decided for the drag is tested at the
   * frame's position: one who sees it there is sent the frame, and first the
   * token itself if they do not have it; one who had it and no longer sees
   * it is told it has gone, and sent nothing more until it comes back.
   */
  async function emitDragFrame(token: Token, mapId: string, lit: boolean, x: number, y: number): Promise<void> {
    const audience = await dragAudienceFor(mapId, token, lit);
    const there: Token = { ...token, position: { x, y } };
    for (const s of await campaignSockets(io, socket.campaignId!)) {
      const recipient = audience.recipients.get(s.id);
      if (!recipient) continue;
      if (recipient.sees(there)) {
        if (!audience.holding.has(s.id)) {
          s.emit('token:appeared', { token: recipient.shown(there), mapId });
          audience.holding.add(s.id);
        }
        s.emit('token.moved', { tokenId: token.id, mapId, x, y, dragging: true, movedBy: moverShownTo(token, s as unknown as AuthenticatedSocket) });
      } else if (audience.holding.delete(s.id)) {
        s.emit('token:disappeared', { tokenId: token.id, mapId });
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

      // Flood ceiling, before any work: a start reads the whole map before
      // any of its refusals, and on a lit map decides line of sight for the
      // drag. A drag sends one, so it has a budget of its own, apart from
      // the frames.
      if (!withinCeiling(socket, 'token.move.start')) return;

      const { tokenId, mapId } = data;

      if (!tokenId || !mapId) {
        socket.emit('error', { message: 'tokenId and mapId required' });
        return;
      }

      // A new drag: whoever this token's frames went to last time is decided
      // afresh, in case the last drag never reached token.move.end. Cleared
      // before the first await, so frames sent right behind this event share
      // the one decision instead of making one this then throws away.
      drags.delete(tokenId);

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

      await emitDragStart(token, mapId, map.lightingEnabled);

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
      // already paces legitimate drags well under this limit. Frames have
      // this budget to themselves; the start and the drop have their own.
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

      // To those decided for the drag who can see this position (on a lit
      // map; everyone decided for it otherwise). Marked as a frame: a page
      // draws the token where it is being carried but leaves where it
      // stands, which decides sight and explored memory, until the drop, so
      // carrying a player's token about reveals nothing on the way.
      await emitDragFrame(movingToken, mapId, map.lightingEnabled, x, y);
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

      // Flood ceiling, before any work: each drop is a write under the
      // map's lock and, on a lit map, line of sight for every player. A drag
      // ends with one, so the drops have a budget of their own; the frames
      // keep theirs.
      if (!withinCeiling(socket, 'token.move.end')) return;

      const { tokenId, mapId, x: dropX, y: dropY } = data;

      // Whole squares, as the client always sends: other clients draw a
      // fraction half a square from where sight and stored position count it.
      if (!tokenId || !mapId || !Number.isInteger(dropX) || !Number.isInteger(dropY)) {
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
      if (dropX < 0 || dropX >= map.width || dropY < 0 || dropY >= map.height) {
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
      // The whole footprint on the map, the rule the client applies before
      // it sends a drop; everyone, the mover included, is told where it went.
      const { x, y } = clampTokenPosition({ x: dropX, y: dropY }, token.size ?? { width: 1, height: 1 }, map);
      // The drag is over; the next one is decided afresh. Who its frames
      // went to is kept for a refused drop, below.
      const sawTheDrag = drags.get(tokenId)?.deciding;
      drags.delete(tokenId);
      const campaignId = socket.campaignId;

      /**
       * A drop refused after the token was picked up: the mover's screen has
       * already drawn it, and the frames reached everyone the drag went to.
       * Tell them where the token is; the correction names no mover, since
       * nobody moved it. Only when the drag began here with frames this
       * socket was allowed to send (`sawTheDrag`), or `evenWithoutDrag` says
       * the mover is told regardless. And only a screen that opening the map
       * now would give the token to: the drag may be long over (a cancelled
       * hold sends no token.move.end), and the DM may since have hidden the
       * token and moved it somewhere secret. On a lit map a frame may have
       * taken the token from a screen, or given it one that cannot see where
       * it stands; each is put back in step.
       */
      const putBack = async (evenWithoutDrag: boolean) => {
        if (!sawTheDrag && !evenWithoutDrag) return;
        const audience = sawTheDrag ? await sawTheDrag : null;
        const told = stillInCampaign(await campaignSockets(io, campaignId), campaignId)
          .filter((s) => s.id === socket.id || audience?.recipients.has(s.id));
        const playerIds = told
          .map((s) => s as unknown as AuthenticatedSocket)
          .filter((a) => a.role !== 'DM' && a.userId)
          .map((a) => a.userId as string);
        const spiritVisibility = await getSpiritVisibilityBatch(campaignId, playerIds);
        const back = { tokenId, mapId, x: token.position.x, y: token.position.y, movedBy: null };
        for (const s of told) {
          const recipient = frameRecipient(s as unknown as AuthenticatedSocket, map, tokensArray, tokenId, spiritVisibility);
          const holds = s.id === socket.id || audience === null || audience.holding.has(s.id);
          if (recipient && recipient.sees(token)) {
            if (!holds) s.emit('token:appeared', { token: recipient.shown(token), mapId });
            s.emit('token.moved', back);
          } else if (holds && s.id !== socket.id && recipient) {
            s.emit('token:disappeared', { tokenId, mapId });
          }
        }
      };

      // See token.move.start: one rule, shared with the REST update route.
      // Control can be taken away mid-drag (a demotion, a new controller).
      if (!canControlToken(socket.role, token.controlledBy, socket.userId)) {
        socket.emit('error', { message: moveRefusal(socket.role) });
        await putBack(false);
        return;
      }

      // The same plane rule the REST update route applies.
      if (!(await canActOnTokenPlane(socket.role, token, socket.campaignId, socket.userId!))) {
        socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
        await putBack(false);
        return;
      }

      // And the same session rule: a player's move waits for the session.
      // A pause can land after the token was picked up; the mover controls
      // the token, so they are told where it is whenever they may see it.
      if (!canMoveTokensNow(socket.role, map.campaign.status)) {
        socket.emit('error', { message: PAUSED_MOVE_REFUSAL });
        await putBack(true);
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
