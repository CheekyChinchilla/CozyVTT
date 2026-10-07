// ============================================
// Light source handlers: light:add / light:remove / light:update /
// lights:replace / lights:request
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import { prisma } from '../../config/database';
import { LightSourceSchema, LightSourcesArraySchema, DUPLICATE_LIGHT_ID_MESSAGE } from '../../validators/walls';
import type { LightSource } from '../../types/walls';
import logger from '../../utils/logger';
import { emitToMapReaders } from '../utils';
import { mapEditLimiter, limiterKey, stateRequestAllowed, resendSightAfterChange } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap } from '../../services/permissions';
import { lightOutsideMap, LIGHT_OUTSIDE_MAP_MESSAGE } from '../../validators/maps';

/** What a light edit reads of the map to check it: whose it is, and its extent. */
const EXTENT = { campaignId: true, width: true, height: true, gridSize: true } as const;

export function registerLightHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * light:add — DM places a single light source.
   */
  socket.on('light:add', async (data: { mapId: string; light: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can add light sources' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, light } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = LightSourceSchema.safeParse(light);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      if (lightOutsideMap([parsed.data], map)) {
        socket.emit('error', { message: LIGHT_OUTSIDE_MAP_MESSAGE });
        return;
      }

      const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
      if (existing.length >= 200) {
        socket.emit('error', { message: 'Maximum 200 light sources per map' });
        return;
      }
      if (existing.some((l) => l.id === parsed.data.id)) {
        socket.emit('error', { message: DUPLICATE_LIGHT_ID_MESSAGE });
        return;
      }

      await prisma.map.update({ where: { id: mapId }, data: { lights: toJson([...existing, parsed.data]) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'light:added', { mapId, light: parsed.data });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('light:add failed', { err: error });
      socket.emit('error', { message: 'Failed to add light source' });
    }
  });

  /**
   * light:remove — DM removes a light source by id.
   */
  socket.on('light:remove', async (data: { mapId: string; lightId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove light sources' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, lightId } = data;
      if (!mapId || !lightId) { socket.emit('error', { message: 'mapId and lightId required' }); return; }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
      const filtered = existing.filter((l) => l.id !== lightId);

      await prisma.map.update({ where: { id: mapId }, data: { lights: toJson(filtered) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'light:removed', { mapId, lightId });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('light:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove light source' });
    }
  });

  /**
   * light:update — DM updates a light source (position, radius, color, enabled, etc.).
   */
  socket.on('light:update', async (data: { mapId: string; light: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can update light sources' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, light } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = LightSourceSchema.safeParse(light);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }

      const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
      const idx = existing.findIndex((l) => l.id === parsed.data.id);
      if (idx === -1) {
        socket.emit('error', { message: 'Light source not found' });
        return;
      }
      // Within the map's bounds; one stored outside them before they existed
      // may stay where it is.
      if (lightOutsideMap([parsed.data], map, [existing[idx]])) {
        socket.emit('error', { message: LIGHT_OUTSIDE_MAP_MESSAGE });
        return;
      }

      existing[idx] = parsed.data;
      await prisma.map.update({ where: { id: mapId }, data: { lights: toJson(existing) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'light:updated', { mapId, light: parsed.data });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('light:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update light source' });
    }
  });

  /**
   * lights:replace — DM bulk-replaces all light sources.
   */
  socket.on('lights:replace', async (data: { mapId: string; lights: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can replace light sources' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, lights } = data;
      if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

      const parsed = LightSourcesArraySchema.safeParse(lights);
      if (!parsed.success) {
        socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid lights array' });
        return;
      }

      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
      if (!map || map.campaignId !== socket.campaignId) {
        socket.emit('error', { message: 'Map not found' });
        return;
      }
      if (lightOutsideMap(parsed.data, map, map.lights)) {
        socket.emit('error', { message: LIGHT_OUTSIDE_MAP_MESSAGE });
        return;
      }

      await prisma.map.update({ where: { id: mapId }, data: { lights: toJson(parsed.data) } });

      await emitToMapReaders(io, socket.campaignId, mapId, 'lights:replaced', { mapId, lights: parsed.data });
      resendSightAfterChange(io, socket.campaignId, mapId);
    } catch (error) {
      logger.error('lights:replace failed', { err: error });
      socket.emit('error', { message: 'Failed to replace light sources' });
    }
  });

  /**
   * lights:request — Any campaign member requests current light sources on (re)join.
   */
  socket.on('lights:request', async (data: { mapId: string }) => {
    try {
      if (!socket.campaignId) return;
      if (!stateRequestAllowed(socket, 'lights:request')) return;
      const { mapId } = data;
      if (!mapId) return;

      const map = await prisma.map.findUnique({
        where: { id: mapId },
        select: { campaignId: true, lights: true, campaign: { select: { currentMapId: true } } },
      });
      if (!map || map.campaignId !== socket.campaignId) return;
      // A prepared map is the DM's alone; a player is answered only about
      // the map the campaign is showing.
      if (!canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;

      const lights = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
      socket.emit('lights:replaced', { mapId, lights });
    } catch (error) {
      logger.error('lights:request failed', { err: error });
    }
  });
}
