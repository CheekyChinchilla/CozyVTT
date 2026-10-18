// ============================================
// Ping handlers: map.ping
//
// A ping is a transient "look here" gesture — a dot with rings radiating out
// of it, drawn at a point on the map for everyone in the campaign. Nothing is
// persisted: the event is broadcast and forgotten, and each client expires its
// own copy after a couple of seconds.
//
// Only the sender's userId travels with the ping. Clients already hold the
// campaign roster, so they resolve the display name (and the colour derived
// from the id) locally. The one database read is the map, to check it, after
// the per-user limit, so a burst of pings costs at most ten reads.
// ============================================

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../auth';
import logger from '../../utils/logger';
import { emitToMapReaders } from '../utils';
import { pingLimiter } from '../shared';
import { prisma } from '../../config/database';
import { canReadMap } from '../../services/permissions';

/** Max pings per user per window, and the window itself. */
const PING_LIMIT = 10;
const PING_WINDOW_MS = 10 * 1000;

export function registerPingHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * MAP.PING — user points at a location.
   * Coordinates are in map pixels (not grid cells), so a ping lands exactly
   * where the cursor was rather than snapping to a square.
   * SECURITY: broadcasts to the server-authenticated socket.campaignId only.
   */
  socket.on('map.ping', async (data: { mapId: string; x: number; y: number }) => {
    try {
      if (!socket.campaignId) {
        socket.emit('error', { message: 'Not authenticated to a campaign' });
        return;
      }

      const { mapId, x, y } = data ?? {};

      if (!mapId || typeof mapId !== 'string') return;
      if (typeof x !== 'number' || typeof y !== 'number') return;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      // Silent drop over the limit — see the note in shared.ts.
      if (!pingLimiter.check(socket.userId!, PING_LIMIT, PING_WINDOW_MS)) return;

      // A map of this campaign the sender may read, as every other map event
      // checks: a ping naming another campaign's map, or a player's on a map
      // the DM is preparing, is dropped like one over the limit.
      const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, campaign: { select: { currentMapId: true } } } });
      if (!map || map.campaignId !== socket.campaignId || !canReadMap(socket.role, mapId, map.campaign.currentMapId)) return;

      // The sender included, so they see their own ping as well; a ping on
      // a map the DM is preparing reaches only the DM.
      await emitToMapReaders(io, socket.campaignId, mapId, 'map.pinged', {
        mapId,
        x,
        y,
        userId: socket.userId,
      });
    } catch (error) {
      logger.error('map.ping failed', { err: error, userId: socket.userId });
    }
  });
}
