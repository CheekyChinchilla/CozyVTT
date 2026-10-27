// ============================================
// Drawing handlers: drawing:add / drawing:remove / drawing:clear_mine /
// drawing:clear / drawing:preview / drawings:request
//
// A drawing is a row of MapDrawing. Every write takes the map's lock and
// reads the map, its campaign and the drawing under it, so a write that
// arrives with an Edit Map, or with other writes to the same map, applies
// one after another; the count and the points a map's markup layer holds
// are taken there too. Who may draw, erase and be sent a drawing is
// utils/drawingRules.ts, the file the draw tool offers by. Every event is
// answered through its acknowledgement when one is passed (see ../ack.ts),
// except the preview, which is dropped without a word when refused, as a
// drag frame is. Drawing text is never logged.
// ============================================

import { Server } from 'socket.io';
import type { MapDrawing, Prisma } from '@prisma/client';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import logger from '../../utils/logger';
import { withMapsLocked } from '../../utils/mapTokens';
import { ackFrom, refuseRequest } from '../ack';
import { echoedOpId } from '../opId';
import { campaignSockets, emitToMapReadersAs } from '../utils';
import { withinCeiling, stateRequestAllowed, drawingPreviewLimiter, DRAWING_PREVIEWS_PER_SECOND, limiterKey } from '../shared';
import {
  canReadMap, canDraw, drawRefusal, canDrawOnLayer, canEraseDrawing, eraseRefusal, drawingSentTo, DRAW_LAYER_REFUSAL,
} from '../../services/permissions';
import {
  DrawingAddEventSchema, DrawingRemoveEventSchema, DrawingClearMineEventSchema, DrawingClearEventSchema,
  DrawingPreviewEventSchema, DrawingsRequestEventSchema, drawingOutsideMap, markupLimitReached,
  DRAWING_OUTSIDE_MAP_MESSAGE, MARKUP_FULL_MESSAGE, MARKUP_POINTS_FULL_MESSAGE,
} from '../../validators/drawings';
import {
  drawingSent, drawingsFor, markupHeld,
  type DrawingAddedBroadcast, type DrawingRemovedBroadcast, type DrawingsClearedBroadcast, type DrawingPreviewedBroadcast,
  type DrawingsStateBroadcast,
} from '../../services/mapDrawings';

/** What a drawing write reads of the map under its lock: whose it is, its extent, and its campaign's state. */
const LOCKED_MAP = {
  campaignId: true, width: true, height: true, gridSize: true,
  campaign: { select: { status: true, playersMayDraw: true, currentMapId: true } },
} as const satisfies Prisma.MapSelect;

type LockedMap = Prisma.MapGetPayload<{ select: typeof LOCKED_MAP }>;
type Locked<T> = { refused: string } | { done: T };
/** Whether a stroke's frames go on, and the map the campaign was showing when that was decided. */
type PreviewDecision = { allowed: boolean; currentMapId: string | null };

/**
 * How many times each campaign's current map has changed in this process.
 * A preview decision made before the last change is made again, so a
 * stroke under way on the map the table has left stops reaching players at
 * the next frame.
 */
const currentMapChanges = new Map<string, number>();

/** The campaign has switched maps (PUT .../maps/:id/set-current): every stroke under way is decided again. */
export function currentMapChanged(campaignId: string): void {
  currentMapChanges.set(campaignId, (currentMapChanges.get(campaignId) ?? 0) + 1);
}

const MAP_NOT_FOUND = 'Map not found';
const DRAWING_NOT_FOUND = 'Drawing not found';
const CLEAR_DM_ONLY = 'Only the DM can clear the drawings';

/**
 * How long a preview's decision, whether its sender may draw there and the
 * map the campaign is showing, is reused, at most. Frames come up to 20 a
 * second per stroke; each would otherwise read the map and its campaign.
 * A pause, Players may draw turned off or a map switch reaches a stroke
 * already under way within this long.
 */
const PREVIEW_DECISION_MS = 1000;

/** The map read under the lock, or null when it is not one of this campaign's that this member may read. */
async function readableMap(tx: Prisma.TransactionClient, mapId: string, campaignId: string, role: string | undefined): Promise<LockedMap | null> {
  const map = await tx.map.findUnique({ where: { id: mapId }, select: LOCKED_MAP });
  if (!map || map.campaignId !== campaignId || !canReadMap(role, mapId, map.campaign.currentMapId)) return null;
  return map;
}

/** What was cleared, for the DM and for everyone else. */
async function clearWhere(tx: Prisma.TransactionClient, where: Prisma.MapDrawingWhereInput): Promise<{ all: number; forEveryone: number }> {
  const forEveryone = await tx.mapDrawing.count({ where: { ...where, audience: 'ALL' } });
  const { count } = await tx.mapDrawing.deleteMany({ where });
  return { all: count, forEveryone };
}

export function registerDrawingHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * drawing:add — Draw on a map: the DM, or a player while Players may draw is on and the session is live.
   * The drawing is stored as the sender's, a player's for everyone; a map's
   * markup layer holds DRAWING_LIMITS.maxMarkupPerMap drawings and
   * maxMarkupPointsPerMap points, counted under the lock (markupHeld,
   * markupLimitReached). Answered
   * `{ ok: true, id, opId }`; `drawing:added` goes to each reader the
   * drawing may be sent to, the sender included, with the `opId` and the
   * `previewId` it ends.
   */
  socket.on('drawing:add', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'drawing:add', ack)) return;
      const parsed = DrawingAddEventSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? 'Invalid drawing');
        return;
      }
      const { mapId, drawing, previewId } = parsed.data;
      const campaignId = socket.campaignId;
      const role = socket.role;
      const userId = socket.userId!;

      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<MapDrawing>> => {
        const map = await readableMap(tx, mapId, campaignId, role);
        if (!map) return { refused: MAP_NOT_FOUND };
        if (!canDraw(role, map.campaign)) return { refused: drawRefusal(role, map.campaign) };
        if (!canDrawOnLayer(role, drawing.layer)) return { refused: DRAW_LAYER_REFUSAL };
        if (drawingOutsideMap(drawing.points, map)) return { refused: DRAWING_OUTSIDE_MAP_MESSAGE };
        const limit = markupLimitReached(await markupHeld(tx, mapId, drawing.points.length), drawing.points.length);
        if (limit) return { refused: limit === 'drawings' ? MARKUP_FULL_MESSAGE : MARKUP_POINTS_FULL_MESSAGE };
        // The id is the server's, so no client's id ever meets a row of
        // another campaign's; a player's drawing is for everyone.
        const row = await tx.mapDrawing.create({
          data: {
            mapId,
            authorId: userId,
            kind: drawing.kind,
            layer: drawing.layer,
            audience: role === 'DM' ? drawing.audience : 'ALL',
            color: drawing.color,
            fillColor: drawing.fillColor,
            width: drawing.width,
            rotation: drawing.rotation,
            sortKey: drawing.sortKey,
            points: drawing.points,
            text: drawing.text,
          },
        });
        return { done: row };
      });
      if ('refused' in outcome) {
        refuse(outcome.refused);
        return;
      }

      const row = outcome.done;
      const sent = drawingSent(row);
      const labels = { ...echoedOpId(data), ...(previewId ? { previewId } : {}) };
      await emitToMapReadersAs(io, campaignId, mapId, 'drawing:added', (reader) =>
        drawingSentTo(reader, row) ? { event: 'drawing:added', data: { mapId, drawing: sent, ...labels } satisfies DrawingAddedBroadcast } : null
      );
      ack?.({ ok: true, id: row.id, ...echoedOpId(data) });
    } catch (error) {
      logger.error('drawing:add failed', { err: error, userId: socket.userId });
      refuse('Failed to add the drawing');
    }
  });

  /**
   * drawing:remove — Erase one drawing: the DM any, a player their own, at any time.
   * A drawing the sender is not sent, or one on another map, is answered as
   * one that does not exist. `drawing:removed` goes to those who had it.
   */
  socket.on('drawing:remove', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'drawing:remove', ack)) return;
      const parsed = DrawingRemoveEventSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? DRAWING_NOT_FOUND);
        return;
      }
      const { mapId, drawingId } = parsed.data;
      const campaignId = socket.campaignId;
      const role = socket.role;

      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<MapDrawing>> => {
        if (!(await readableMap(tx, mapId, campaignId, role))) return { refused: MAP_NOT_FOUND };
        const drawing = await tx.mapDrawing.findUnique({ where: { id: drawingId } });
        if (!drawing || drawing.mapId !== mapId || !drawingSentTo(role, drawing)) return { refused: DRAWING_NOT_FOUND };
        if (!canEraseDrawing(role, socket.userId, drawing)) return { refused: eraseRefusal(role) };
        await tx.mapDrawing.delete({ where: { id: drawingId } });
        return { done: drawing };
      });
      if ('refused' in outcome) {
        refuse(outcome.refused);
        return;
      }

      const removed = outcome.done;
      await emitToMapReadersAs(io, campaignId, mapId, 'drawing:removed', (reader) =>
        drawingSentTo(reader, removed) ? { event: 'drawing:removed', data: { mapId, drawingId, ...echoedOpId(data) } satisfies DrawingRemovedBroadcast } : null
      );
      ack?.({ ok: true, ...echoedOpId(data) });
    } catch (error) {
      logger.error('drawing:remove failed', { err: error, userId: socket.userId });
      refuse('Failed to erase the drawing');
    }
  });

  /**
   * drawing:clear_mine — Erase every drawing of the sender's on a map's markup layer, at any time; never a spectator.
   * A player's clear leaves the drawings for the DM alone they wrote while in
   * the DM's seat, as drawing:remove does (canEraseDrawing).
   * `drawings:cleared`, naming the sender as `authorId`, goes to the readers
   * who had any of them.
   */
  socket.on('drawing:clear_mine', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'drawing:clear_mine', ack)) return;
      const userId = socket.userId!;
      const role = socket.role;
      if (!canEraseDrawing(role, userId, { authorId: userId, audience: 'ALL' })) {
        refuse(eraseRefusal(role));
        return;
      }
      const parsed = DrawingClearMineEventSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? MAP_NOT_FOUND);
        return;
      }
      const { mapId } = parsed.data;
      const campaignId = socket.campaignId;

      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<{ all: number; forEveryone: number }>> => {
        if (!(await readableMap(tx, mapId, campaignId, role))) return { refused: MAP_NOT_FOUND };
        return { done: await clearWhere(tx, { mapId, layer: 'MARKUP', authorId: userId, ...(role === 'DM' ? {} : { audience: 'ALL' as const }) }) };
      });
      if ('refused' in outcome) {
        refuse(outcome.refused);
        return;
      }

      const { all, forEveryone } = outcome.done;
      const cleared = { mapId, layer: 'MARKUP', authorId: userId, ...echoedOpId(data) } satisfies DrawingsClearedBroadcast;
      await emitToMapReadersAs(io, campaignId, mapId, 'drawings:cleared', (reader) =>
        (reader === 'DM' ? all : forEveryone) > 0 ? { event: 'drawings:cleared', data: cleared } : null
      );
      ack?.({ ok: true, ...echoedOpId(data) });
    } catch (error) {
      logger.error('drawing:clear_mine failed', { err: error, userId: socket.userId });
      refuse('Failed to clear your drawings');
    }
  });

  /**
   * drawing:clear — DM erases every drawing on one layer of a map, the markup layer so far.
   * `drawings:cleared` goes to the readers who had any of them.
   */
  socket.on('drawing:clear', async (data: unknown, ackArg?: unknown) => {
    const ack = ackFrom(ackArg);
    const refuse = (message: string) => refuseRequest(socket, ack, message);
    try {
      if (!socket.campaignId) {
        refuse('Not authenticated to a campaign');
        return;
      }
      if (!withinCeiling(socket, 'drawing:clear', ack)) return;
      if (socket.role !== 'DM') {
        refuse(CLEAR_DM_ONLY);
        return;
      }
      const parsed = DrawingClearEventSchema.safeParse(data);
      if (!parsed.success) {
        refuse(parsed.error.issues[0]?.message ?? MAP_NOT_FOUND);
        return;
      }
      const { mapId, layer } = parsed.data;
      const campaignId = socket.campaignId;

      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<{ all: number; forEveryone: number }>> => {
        if (!(await readableMap(tx, mapId, campaignId, 'DM'))) return { refused: MAP_NOT_FOUND };
        return { done: await clearWhere(tx, { mapId, layer }) };
      });
      if ('refused' in outcome) {
        refuse(outcome.refused);
        return;
      }

      const { all, forEveryone } = outcome.done;
      const cleared = { mapId, layer, ...echoedOpId(data) } satisfies DrawingsClearedBroadcast;
      await emitToMapReadersAs(io, campaignId, mapId, 'drawings:cleared', (reader) =>
        (reader === 'DM' ? all : forEveryone) > 0 ? { event: 'drawings:cleared', data: cleared } : null
      );
      ack?.({ ok: true, ...echoedOpId(data) });
    } catch (error) {
      logger.error('drawing:clear failed', { err: error, userId: socket.userId });
      refuse('Failed to clear the drawings');
    }
  });

  /**
   * Whether this socket may preview a stroke on this map now, and the map
   * the campaign is showing, decided at most once a PREVIEW_DECISION_MS per
   * stroke and reused for its frames, and made again at once when the
   * campaign switches maps (currentMapChanged). The room is read on every
   * frame, in memory, so a socket that has left the campaign since is not
   * sent one.
   */
  const previewDecisions = new Map<string, {
    campaignId: string; mapId: string; role: string | undefined; switches: number; at: number; deciding: Promise<PreviewDecision>;
  }>();
  function previewDecision(previewId: string, mapId: string, campaignId: string): Promise<PreviewDecision> {
    const now = Date.now();
    const switches = currentMapChanges.get(campaignId) ?? 0;
    const cached = previewDecisions.get(previewId);
    if (
      cached && cached.campaignId === campaignId && cached.mapId === mapId && cached.role === socket.role
      && cached.switches === switches && now - cached.at < PREVIEW_DECISION_MS
    ) return cached.deciding;
    for (const [id, entry] of previewDecisions) if (now - entry.at >= PREVIEW_DECISION_MS) previewDecisions.delete(id);
    const role = socket.role;
    const deciding = (async (): Promise<PreviewDecision> => {
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: LOCKED_MAP });
      if (!map || map.campaignId !== campaignId) return { allowed: false, currentMapId: null };
      const currentMapId = map.campaign.currentMapId;
      return { allowed: canReadMap(role, mapId, currentMapId) && canDraw(role, map.campaign), currentMapId };
    })();
    previewDecisions.set(previewId, { campaignId, mapId, role, switches, at: now, deciding });
    return deciding;
  }

  /**
   * drawing:preview — One frame of a stroke on its way, or of the laser pointer, from someone who may draw there now; nothing is stored.
   * `drawing:previewed` goes to every other socket that may read the map and
   * be sent the stroke; a player's and the laser pointer's are for
   * everyone. Frames past DRAWING_PREVIEWS_PER_SECOND a user, refused ones
   * and malformed ones are dropped without an answer.
   */
  socket.on('drawing:preview', async (data: unknown) => {
    try {
      const campaignId = socket.campaignId;
      if (!campaignId) return;
      if (!drawingPreviewLimiter.check(limiterKey(socket), DRAWING_PREVIEWS_PER_SECOND, 1000)) return;
      const parsed = DrawingPreviewEventSchema.safeParse(data);
      if (!parsed.success) return;
      const { mapId, preview } = parsed.data;

      const { allowed, currentMapId } = await previewDecision(preview.previewId, mapId, campaignId);
      if (preview.end) previewDecisions.delete(preview.previewId);
      if (!allowed) return;

      const shown = { ...preview, audience: socket.role === 'DM' && !preview.laser ? preview.audience : 'ALL' as const };
      const frame = { mapId, userId: socket.userId, preview: shown } satisfies DrawingPreviewedBroadcast;
      for (const s of await campaignSockets(io, campaignId)) {
        if (s.id === socket.id) continue;
        const reader = (s as unknown as AuthenticatedSocket).role;
        if (canReadMap(reader, mapId, currentMapId) && drawingSentTo(reader, shown)) s.emit('drawing:previewed', frame);
      }
    } catch (error) {
      logger.error('drawing:preview failed', { err: error, userId: socket.userId });
    }
  });

  socket.on('disconnect', () => {
    previewDecisions.clear();
  });

  /**
   * drawings:request — Any campaign member asks for a map's drawings, on (re)join and on opening a map.
   * Answered with `drawings:state`, the drawings the sender may be sent in
   * drawing order, decided by their role when the answer goes, after the
   * read; nothing for a map they may not read.
   */
  socket.on('drawings:request', async (data: unknown) => {
    try {
      if (!socket.campaignId) return;
      if (!stateRequestAllowed(socket, 'drawings:request')) return;
      const parsed = DrawingsRequestEventSchema.safeParse(data);
      if (!parsed.success) return;
      const { mapId } = parsed.data;
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, campaign: { select: { currentMapId: true } } } });
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;
      const drawings = await drawingsFor(mapId, 'DM');
      socket.emit('drawings:state', { mapId, drawings: drawings.filter((d) => drawingSentTo(socket.role, d)) } satisfies DrawingsStateBroadcast);
    } catch (error) {
      logger.error('drawings:request failed', { err: error });
    }
  });
}
