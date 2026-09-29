// ============================================
// Wall handlers: wall:add / wall:remove / wall:update / walls:replace /
// walls:request / dm:editing
// ============================================

import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { WallSegmentSchema, WallSegmentsArraySchema } from '../../validators/walls';
import type { WallSegment } from '../../types/walls';
import logger from '../../utils/logger';
import { emitToMapReaders } from '../utils';
import { mapEditLimiter, limiterKey, stateRequestAllowed, resendSightAfterChange } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap, canToggleDoor } from '../../services/permissions';

export function registerWallHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * wall:add — DM adds a single wall segment.
   */
  socket.on('wall:add', async (data: { mapId: string; segment: unknown }) => {
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

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, wallSegments: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      if (existing.length >= 5000) {
        socket.emit('error', { message: 'Maximum 5000 wall segments per map' });
        return;
      }

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: toJson([...existing, parsed.data]) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'wall:added', { mapId, segment: parsed.data });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('wall:add failed', { err: error });
      socket.emit('error', { message: 'Failed to add wall segment' });
    }
  });

  /**
   * wall:remove — DM removes a wall segment by id.
   */
  socket.on('wall:remove', async (data: { mapId: string; segmentId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove wall segments' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, segmentId } = data;
      if (!mapId || !segmentId) { socket.emit('error', { message: 'mapId and segmentId required' }); return; }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, wallSegments: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      const filtered = existing.filter((s) => s.id !== segmentId);

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: toJson(filtered) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'wall:removed', { mapId, segmentId });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('wall:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove wall segment' });
    }
  });

  /**
   * wall:update — Update a wall segment; a player may only open or close an unlocked door, and cannot move it.
   * Players may only toggle unlocked doors.
   */
  socket.on('wall:update', async (data: { mapId: string; segment: unknown }) => {
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

      // A player may toggle doors only on the map the campaign is showing;
      // a prepared map is the DM's until they switch to it.
      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, wallSegments: true, campaign: { select: { currentMapId: true } } },
      });
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      const idx = existing.findIndex((s) => s.id === parsed.data.id);
      if (idx === -1) {
        socket.emit('error', { message: 'Wall segment not found' });
        return;
      }

      // Non-DM users may only toggle unlocked doors (door-closed ↔ door-open),
      // and only that: the segment they send is otherwise ignored, so the door
      // stays where the DM drew it. Storing the whole segment let a player
      // move or stretch any unlocked door across the map by toggling it.
      // TODO(maps): a player's toggle is not checked against sight, so they
      // can open a door none of their tokens can see, and "That door is
      // locked" tells them a door is there. Refuse a toggle of a door the
      // player's tokens cannot see; MapCanvas should stop offering it too.
      let updated: WallSegment;
      if (socket.role !== 'DM') {
        const targetType = parsed.data.type;
        const currentType = existing[idx].type;
        // Locked doors cannot be opened by players
        if (currentType === 'door-locked') {
          socket.emit('error', { message: 'That door is locked' });
          return;
        }
        const isDoorToggle = targetType === 'door-open' || targetType === 'door-closed';
        const currentIsDoor = currentType === 'door-open' || currentType === 'door-closed';
        if (!isDoorToggle || !currentIsDoor) {
          socket.emit('error', { message: 'Players may only toggle doors' });
          return;
        }
        updated = { ...existing[idx], type: targetType };
      } else {
        updated = parsed.data;
      }

      existing[idx] = updated;
      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: toJson(existing) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'wall:updated', { mapId, segment: updated });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('wall:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update wall segment' });
    }
  });

  /**
   * walls:replace — DM bulk-replaces all wall segments.
   */
  socket.on('walls:replace', async (data: { mapId: string; segments: unknown }) => {
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

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: toJson(parsed.data) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'walls:replaced', { mapId, segments: parsed.data });
      resendSightAfterChange(io, socket.campaignId, mapId);
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

      const segments = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      socket.emit('walls:replaced', { mapId, segments });
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
