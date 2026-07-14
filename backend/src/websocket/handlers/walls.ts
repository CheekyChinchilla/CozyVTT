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
import { mapEditLimiter } from '../shared';

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
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return; // 9.3 flood ceiling

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

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: [...existing, parsed.data] as any } });

      io.to(socket.campaignId).emit('wall:added', { mapId, segment: parsed.data });
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
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return; // 9.3 flood ceiling

      const { mapId, segmentId } = data;
      if (!mapId || !segmentId) { socket.emit('error', { message: 'mapId and segmentId required' }); return; }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, wallSegments: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.wallSegments) ? map.wallSegments : []) as unknown as WallSegment[];
      const filtered = existing.filter((s) => s.id !== segmentId);

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: filtered as any } });

      io.to(socket.campaignId).emit('wall:removed', { mapId, segmentId });
    } catch (error) {
      logger.error('wall:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove wall segment' });
    }
  });

  /**
   * wall:update — DM updates a wall segment (e.g., door open/close).
   * Players may only toggle unlocked doors.
   */
  socket.on('wall:update', async (data: { mapId: string; segment: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM' && socket.role !== 'PLAYER') {
        socket.emit('error', { message: 'Permission denied' });
        return;
      }
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return; // 9.3 flood ceiling

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
      const idx = existing.findIndex((s) => s.id === parsed.data.id);
      if (idx === -1) {
        socket.emit('error', { message: 'Wall segment not found' });
        return;
      }

      // Non-DM users may only toggle unlocked doors (door-closed ↔ door-open)
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
      }

      existing[idx] = parsed.data;
      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: existing as any } });

      io.to(socket.campaignId).emit('wall:updated', { mapId, segment: parsed.data });
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
      if (!mapEditLimiter.check(socket.id, 40, 1000)) return; // 9.3 flood ceiling

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

      await prisma.map.update({ where: { id: mapId }, data: { wallSegments: parsed.data as any } });

      io.to(socket.campaignId).emit('walls:replaced', { mapId, segments: parsed.data });
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
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, wallSegments: true },
      });
      if (!map || map.campaignId !== socket.campaignId) return;

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
      socket.to(socket.campaignId).emit('dm:editing', { mapId, timestamp: new Date().toISOString() });
    }
  }, 500);

  socket.on('dm:editing', (data: { mapId: string }) => {
    if (!socket.campaignId || socket.role !== 'DM') return;
    if (data?.mapId) emitDmEditing(data.mapId);
  });
}
