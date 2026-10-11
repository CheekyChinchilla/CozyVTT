// ============================================
// Wall handlers: wall:add / wall:remove / wall:update / walls:replace /
// walls:request / dm:editing
// ============================================

import { Server } from 'socket.io';
import { throttle } from '../../utils/throttle';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { WallSegmentSchema, WallSegmentsArraySchema, DUPLICATE_WALL_ID_MESSAGE } from '../../validators/walls';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { emitToMapReaders, emitToMapReadersAs } from '../utils';
import {
  filterTokensByRole, getSpiritVisibility, playerSightOnLitMap, viewerIdFor, wallChangeReachesPlayers, wallChangeSentTo,
  wallListChangeReachesPlayers, wallSentTo, wallsReplacedSentTo, wallsSentTo, type PlayerSight,
} from '../../utils/spirit-layer';
import { mapEditLimiter, limiterKey, stateRequestAllowed, resendSightAfterChange } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap, canToggleDoor } from '../../services/permissions';
import { wallOutsideMap, WALL_OUTSIDE_MAP_MESSAGE } from '../../validators/maps';
import { withMapsLocked } from '../../utils/mapTokens';
import { echoedOpId } from '../opId';

/** What a wall edit reads of the map to check it: whose it is, and its extent. */
const EXTENT = { campaignId: true, width: true, height: true, gridSize: true } as const;

/**
 * Every edit below reads the map's whole wall list, changes it and writes it
 * back. They run under the map's lock and read the list after taking it, so
 * edits sent together (a door placed on a wall is a remove and up to three
 * adds in one tick) apply one after another instead of each overwriting the
 * last. A refusal is returned as its message.
 */
type Locked<T> = { refused: string; current?: WallSegment } | { done: T };

/**
 * What a player's tokens can see of a lit map, for which doors they may open
 * or close: null on a map without dynamic lighting, where every door is
 * theirs to try, and on one they may not read, which the toggle then refuses.
 * Read without the map's lock: it reads the player's plane, which is a
 * database read of its own, and casts rays from each of their tokens, and a
 * player can send forty toggles a second.
 */
async function doorSightFor(
  mapId: string,
  campaignId: string,
  role: string | undefined,
  userId: string
): Promise<PlayerSight | null> {
  const map = await prisma.map.findUnique({
    where: { id: mapId },
    select: {
      ...EXTENT, wallSegments: true, tokens: true, lightingEnabled: true, lights: true, globalIllumination: true,
      campaign: { select: { currentMapId: true } },
    },
  });
  if (!map || map.campaignId !== campaignId || !map.lightingEnabled) return null;
  if (!canReadMap(role, mapId, map.campaign.currentMapId)) return null;
  const spiritVisible = await getSpiritVisibility(campaignId, userId);
  return playerSightOnLitMap(
    filterTokensByRole(map.tokens, role ?? 'PLAYER', spiritVisible, userId), viewerIdFor(role, userId), map.wallSegments,
    map.width, map.height, map.gridSize, map.lights, map.globalIllumination
  );
}

export function registerWallHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * wall:add — DM adds a single wall segment.
   */
  socket.on('wall:add', async (data: { mapId: string; segment: unknown; opId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can add wall segments' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, segment } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = WallSegmentSchema.safeParse(segment);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid wall segment' });
        return;
      }

      const campaignId = socket.campaignId;
      const added = parsed.data;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<null>> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, wallSegments: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };
        if (wallOutsideMap([added], map)) return { refused: WALL_OUTSIDE_MAP_MESSAGE };

        const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
        if (existing.length >= 5000) return { refused: 'Maximum 5000 wall segments per map' };
        if (existing.some((w) => w.id === added.id)) return { refused: DUPLICATE_WALL_ID_MESSAGE };

        await tx.map.update({ where: { id: mapId }, data: { wallSegments: toJson([...existing, added]) } });
        return { done: null };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      await emitToMapReadersAs(io, campaignId, mapId, 'wall:added', (role) => ({
        event: 'wall:added', data: { mapId, segment: wallSentTo(role, added), ...echoedOpId(data) },
      }));
      resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('wall:add failed', { err: error });
      socket.emit('error', { message: 'Failed to add wall segment' });
    }
  });

  /**
   * wall:remove — DM removes a wall segment by id.
   */
  socket.on('wall:remove', async (data: { mapId: string; segmentId: string; opId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove wall segments' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, segmentId } = data;
      if (!mapId || !segmentId) { socket.emit('error', { message: 'mapId and segmentId required' }); return; }

      const campaignId = socket.campaignId;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<null>> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { campaignId: true, wallSegments: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };

        const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
        const filtered = existing.filter((s) => s.id !== segmentId);
        await tx.map.update({ where: { id: mapId }, data: { wallSegments: toJson(filtered) } });
        return { done: null };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      await emitToMapReaders(io, campaignId, mapId, 'wall:removed', { mapId, segmentId, ...echoedOpId(data) });
      resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('wall:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove wall segment' });
    }
  });

  /**
   * wall:update — Update a wall segment; a player may only open or close an unlocked door, and cannot move it.
   * Players may only toggle unlocked doors.
   */
  socket.on('wall:update', async (data: { mapId: string; segment: unknown; opId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (!canToggleDoor(socket.role)) {
        socket.emit('error', { message: 'Spectators cannot open or close doors' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, segment } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = WallSegmentSchema.safeParse(segment);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid wall segment' });
        return;
      }

      const campaignId = socket.campaignId;
      const role = socket.role;
      const userId = socket.userId!;
      const sent = parsed.data;
      // A player's sight on a lit map, worked out before the lock is taken,
      // so no edit of this map waits on it; the door is judged against it
      // under the lock, where it is and as it is then.
      const sight = role === 'DM' ? null : await doorSightFor(mapId, campaignId, role, userId);
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<{ before: WallSegment; after: WallSegment }>> => {
        // A player may toggle doors only on the map the campaign is showing;
        // a prepared map is the DM's until they switch to it.
        const map = await tx.map.findUnique({
          where: { id: mapId },
          select: { ...EXTENT, wallSegments: true, lightingEnabled: true, campaign: { select: { currentMapId: true } } },
        });
        if (!map || map.campaignId !== campaignId || !canReadMap(role, mapId, map.campaign.currentMapId)) {
          return { refused: 'Map not found' };
        }

        const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
        const idx = existing.findIndex((s) => s.id === sent.id);
        if (idx === -1) return { refused: 'Wall segment not found' };

        // Non-DM users may only toggle unlocked doors (door-closed ↔ door-open),
        // and only that: the segment they send is otherwise ignored, so the door
        // stays where the DM drew it. Storing the whole segment let a player
        // move or stretch any unlocked door across the map by toggling it.
        let updated: WallSegment;
        if (role !== 'DM') {
          const isDoor = ['door-open', 'door-closed', 'door-locked'].includes(existing[idx].type);
          if (!isDoor) return { refused: 'Players may only toggle doors', current: existing[idx] };
          // On a lit map, only a door one of their tokens can see, by the rule
          // the map shows doors by; asked before whether it is locked, so a
          // door in the dark tells them nothing. The door is judged where it
          // is now, so one the DM moved since the sight was worked out is
          // refused if it went out of it, and on a map lit since then, with
          // no sight worked out, no door is seen yet.
          // TODO(maps): manual fog is not asked. A player can still toggle a
          // door in unrevealed squares, which their screen covers, and learn
          // from the answer that it is there. Refuse a door with no revealed
          // square on either side of its middle, and offer none in the
          // client's doorAccess.ts.
          const door = existing[idx];
          if (map.lightingEnabled && !(sight?.seesPoint((door.x1 + door.x2) / 2, (door.y1 + door.y2) / 2) ?? false)) {
            return { refused: 'You cannot see that door', current: door };
          }
          const targetType = sent.type;
          const currentType = existing[idx].type;
          // Locked doors cannot be opened by players. The refusal carries the
          // segment, so the player's page, which drew the door open as it
          // asked, is put back.
          if (currentType === 'door-locked') return { refused: 'That door is locked', current: existing[idx] };
          const isDoorToggle = targetType === 'door-open' || targetType === 'door-closed';
          const currentIsDoor = currentType === 'door-open' || currentType === 'door-closed';
          if (!isDoorToggle || !currentIsDoor) return { refused: 'Players may only toggle doors', current: existing[idx] };
          updated = { ...existing[idx], type: targetType };
        } else {
          // The DM may move a wall, within the map's bounds. One stored outside
          // them before they existed may stay where it is.
          if (wallOutsideMap([sent], map, [existing[idx]])) return { refused: WALL_OUTSIDE_MAP_MESSAGE };
          updated = sent;
        }

        const before = existing[idx];
        existing[idx] = updated;
        await tx.map.update({ where: { id: mapId }, data: { wallSegments: toJson(existing) } });
        return { done: { before, after: updated } };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        // The wall as this socket may see it, with no operation id, so its page
        // takes it in place of what it drew; a locked door stays closed to
        // anyone but the DM.
        if (outcome.current) socket.emit('wall:updated', { mapId, segment: wallSentTo(role, outcome.current) });
        return;
      }

      // A member whose copy of the wall is unchanged, a player's of a closed
      // door locked or unlocked, is told nothing, and is not sent the map again.
      const { before, after } = outcome.done;
      await emitToMapReadersAs(io, campaignId, mapId, 'wall:updated', (role) =>
        wallChangeSentTo(role, mapId, before, after, echoedOpId(data))
      );
      if (wallChangeReachesPlayers(before, after)) resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('wall:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update wall segment' });
    }
  });

  /**
   * walls:replace — DM bulk-replaces all wall segments.
   */
  socket.on('walls:replace', async (data: { mapId: string; segments: unknown; opId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can replace wall segments' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, segments } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = WallSegmentsArraySchema.safeParse(segments);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid segments array' });
        return;
      }

      const campaignId = socket.campaignId;
      const next = parsed.data;
      // Answers the list it replaced, so each member is told only of a change to their copy.
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked<unknown>> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, wallSegments: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };
        if (wallOutsideMap(next, map, map.wallSegments)) return { refused: WALL_OUTSIDE_MAP_MESSAGE };

        await tx.map.update({ where: { id: mapId }, data: { wallSegments: toJson(next) } });
        return { done: map.wallSegments };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      // A player whose walls are as they were, closed doors locked or
      // unlocked, is told nothing, and is not sent the map again.
      const before = outcome.done;
      await emitToMapReadersAs(io, campaignId, mapId, 'walls:replaced', (role) =>
        wallsReplacedSentTo(role, mapId, before, next, echoedOpId(data))
      );
      if (wallListChangeReachesPlayers(before, next)) resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('walls:replace failed', { err: error });
      socket.emit('error', { message: 'Failed to replace wall segments' });
    }
  });

  /**
   * walls:request — Any campaign member requests current wall segments on (re)join.
   */
  socket.on('walls:request', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (!stateRequestAllowed(socket, 'walls:request')) return;
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, wallSegments: true, campaign: { select: { currentMapId: true } } },
      });
      if (!map || map.campaignId !== socket.campaignId) return;
      // A prepared map is the DM's alone; a player is answered only about
      // the map the campaign is showing.
      if (!canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;

      // A locked door goes to anyone but the DM as a closed one.
      socket.emit('walls:replaced', { mapId, segments: wallsSentTo(socket.role, map.wallSegments) });
    } catch (error) {
      logger.error('walls:request failed', { err: error });
    }
  });

  /**
   * dm:editing — DM notifies players they are actively editing the map.
   * Throttled to once per 500ms; players show a transient indicator.
   */
  const emitDmEditing = throttle((mapId: string) => {
    if (socket.campaignId) {
      void emitToMapReaders(io, socket.campaignId, mapId, 'dm:editing', { mapId, timestamp: new Date().toISOString() }, socket.id)
        .catch((err: unknown) => logger.error('dm:editing failed', { err }));
    }
  }, 500);

  socket.on('dm:editing', (data: { mapId: string }) => {
    if (!socket.campaignId || socket.role !== 'DM') return;
    if (data?.mapId) emitDmEditing(data.mapId);
  });
}
