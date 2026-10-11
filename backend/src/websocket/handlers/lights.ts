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
import { emitToMapReadersAs } from '../utils';
import {
  lightChangeReachesPlayers, lightChangeSentTo, lightReachesPlayers, lightRemovalSentTo, lightsSentTo,
} from '../../utils/spirit-layer';
import { mapEditLimiter, limiterKey, stateRequestAllowed, resendSightAfterChange } from '../shared';
import { toJson } from '../../utils/prisma-json';
import { canReadMap } from '../../services/permissions';
import { lightOutsideMap, LIGHT_OUTSIDE_MAP_MESSAGE } from '../../validators/maps';
import { withMapsLocked } from '../../utils/mapTokens';
import { echoedOpId } from '../opId';

/** What a light edit reads of the map to check it: whose it is, and its extent. */
const EXTENT = { campaignId: true, width: true, height: true, gridSize: true } as const;

/**
 * Every edit below reads the map's whole light list, changes it and writes it
 * back, under the map's lock and reading the list after taking it, so edits
 * sent together apply one after another instead of each overwriting the
 * last. A refusal is returned as its message.
 */
type Locked = { refused: string } | { done: true };

export function registerLightHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * light:add — DM places a single light source.
   */
  socket.on('light:add', async (data: { mapId: string; light: unknown; opId?: unknown }) => {
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

      const campaignId = socket.campaignId;
      const added = parsed.data;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };
        if (lightOutsideMap([added], map)) return { refused: LIGHT_OUTSIDE_MAP_MESSAGE };

        const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        if (existing.length >= 200) return { refused: 'Maximum 200 light sources per map' };
        if (existing.some((l) => l.id === added.id)) return { refused: DUPLICATE_LIGHT_ID_MESSAGE };

        await tx.map.update({ where: { id: mapId }, data: { lights: toJson([...existing, added]) } });
        return { done: true };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      // A light that is off goes to the DM alone, and players are not sent
      // the map again for it.
      await emitToMapReadersAs(io, campaignId, mapId, 'light:added', (role) =>
        role === 'DM' || lightReachesPlayers(added) ? { event: 'light:added', data: { mapId, light: added, ...echoedOpId(data) } } : null
      );
      if (lightReachesPlayers(added)) resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('light:add failed', { err: error });
      socket.emit('error', { message: 'Failed to add light source' });
    }
  });

  /**
   * light:remove — DM removes a light source by id.
   */
  socket.on('light:remove', async (data: { mapId: string; lightId: string; opId?: unknown }) => {
    try {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can remove light sources' });
        return;
      }
      if (!mapEditLimiter.check(limiterKey(socket), 40, 1000)) return; // flood ceiling, per user

      const { mapId, lightId } = data;
      if (!mapId || !lightId) { socket.emit('error', { message: 'mapId and lightId required' }); return; }

      const campaignId = socket.campaignId;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<{ refused: string } | { done: LightSource | undefined }> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };

        const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        const filtered = existing.filter((l) => l.id !== lightId);
        await tx.map.update({ where: { id: mapId }, data: { lights: toJson(filtered) } });
        return { done: existing.find((l) => l.id === lightId) };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      // A light that was off was the DM's alone, so its going is too.
      const removed = outcome.done;
      await emitToMapReadersAs(io, campaignId, mapId, 'light:removed', (role) =>
        lightRemovalSentTo(role, mapId, lightId, removed, echoedOpId(data))
      );
      if (lightReachesPlayers(removed)) resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('light:remove failed', { err: error });
      socket.emit('error', { message: 'Failed to remove light source' });
    }
  });

  /**
   * light:update — DM updates a light source (position, radius, color, enabled, etc.).
   */
  socket.on('light:update', async (data: { mapId: string; light: unknown; opId?: unknown }) => {
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

      const campaignId = socket.campaignId;
      const updated = parsed.data;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<{ refused: string } | { done: LightSource }> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };

        const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        const idx = existing.findIndex((l) => l.id === updated.id);
        if (idx === -1) return { refused: 'Light source not found' };
        // Within the map's bounds; one stored outside them before they existed
        // may stay where it is.
        if (lightOutsideMap([updated], map, [existing[idx]])) return { refused: LIGHT_OUTSIDE_MAP_MESSAGE };

        const before = existing[idx];
        existing[idx] = updated;
        await tx.map.update({ where: { id: mapId }, data: { lights: toJson(existing) } });
        return { done: before };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      // Anyone but the DM has only the lights that are on: one turned on
      // appears for them, one turned off goes, and one that stays off is
      // neither sent nor followed by the map.
      const before = outcome.done;
      await emitToMapReadersAs(io, campaignId, mapId, 'light:updated', (role) =>
        lightChangeSentTo(role, mapId, before, updated, echoedOpId(data))
      );
      if (lightChangeReachesPlayers(before, updated)) resendSightAfterChange(io, campaignId, mapId);
    } catch (error) {
      logger.error('light:update failed', { err: error });
      socket.emit('error', { message: 'Failed to update light source' });
    }
  });

  /**
   * lights:replace — DM bulk-replaces all light sources.
   */
  socket.on('lights:replace', async (data: { mapId: string; lights: unknown; opId?: unknown }) => {
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

      const campaignId = socket.campaignId;
      const next = parsed.data;
      const outcome = await withMapsLocked([mapId], async (tx): Promise<Locked> => {
        const map = await tx.map.findUnique({ where: { id: mapId }, select: { ...EXTENT, lights: true } });
        if (!map || map.campaignId !== campaignId) return { refused: 'Map not found' };
        if (lightOutsideMap(next, map, map.lights)) return { refused: LIGHT_OUTSIDE_MAP_MESSAGE };

        await tx.map.update({ where: { id: mapId }, data: { lights: toJson(next) } });
        return { done: true };
      });
      if ('refused' in outcome) {
        socket.emit('error', { message: outcome.refused });
        return;
      }

      await emitToMapReadersAs(io, campaignId, mapId, 'lights:replaced', (role) => ({
        event: 'lights:replaced', data: { mapId, lights: lightsSentTo(role, next), ...echoedOpId(data) },
      }));
      resendSightAfterChange(io, campaignId, mapId);
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

      // A light that is off goes to the DM alone.
      socket.emit('lights:replaced', { mapId, lights: lightsSentTo(socket.role, map.lights) });
    } catch (error) {
      logger.error('lights:request failed', { err: error });
    }
  });
}
