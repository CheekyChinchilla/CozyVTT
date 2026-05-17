import { Server } from 'socket.io';
import { throttle } from 'lodash';
import { AuthenticatedSocket, authenticateSocket, authenticateCampaign } from './auth';
import { prisma } from '../config/database';
import { rollDice, parseDiceExpression, DiceParserError } from '../utils/dice-parser';
import { sendSystemMessage } from './utils';
import { getSpiritVisibility, filterMapData, filterTokensByLighting } from '../utils/spirit-layer';
import { findVibePeriod, normalizeVibeSettings } from '../utils/vibe-presets';
import { WallSegmentSchema, WallSegmentsArraySchema, FogOperationSchema, LightSourceSchema, LightSourcesArraySchema } from '../validators/walls';
import type { WallSegment, FogState, FogOperation, LightSource } from '../types/walls';
import {
  getState as getCombatState,
  setState as setCombatState,
  clearState as clearCombatState,
  sortCombatants,
  type CombatantEntry,
} from './initiativeState';

/**
 * WebSocket Event Handlers
 * Per SOW Section 6: WebSocket Event Specification
 *
 * Handled events:
 * - connect / disconnect: Connection lifecycle
 * - authenticate: Campaign room joining with membership verification
 * - token.move.start, token.move, token.move.end: Real-time token movement
 * - dice.roll: Dice rolling with full expression support
 * - chat.message: Campaign chat messages
 * - spirit_layer.toggle: Spirit layer visibility (DM-only)
 * - spirit_layer.token.toggle: Per-token spirit visibility
 * - vibe.update: Vibe tracker period changes
 */

// Token interface matching SOW Section 4.2
interface Token {
  id: string;
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  layer: 'token' | 'spirit';
  visible: boolean;
  controlledBy?: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, any>;
  displayMode?: 'pog' | 'top-down' | 'full-art';
  statBlock?: Record<string, any> | null;
  creatureTemplateId?: string | null;
}

/**
 * Rate Limiter for WebSocket Events
 * Tracks timestamps of recent events per user
 * Per SOW Section 10.3: Rate Limiting
 */
class RateLimiter {
  private events: Map<string, number[]> = new Map();

  /**
   * Check if user is within rate limit
   * @param userId - User ID
   * @param limit - Maximum number of events allowed
   * @param windowMs - Time window in milliseconds
   * @returns true if within limit, false if exceeded
   */
  check(userId: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const userEvents = this.events.get(userId) || [];

    // Remove timestamps outside the time window
    const recentEvents = userEvents.filter((timestamp) => now - timestamp < windowMs);

    // Check if user has exceeded the limit
    if (recentEvents.length >= limit) {
      return false;
    }

    // Add current event timestamp
    recentEvents.push(now);
    this.events.set(userId, recentEvents);

    return true;
  }

  /**
   * Clear old events periodically to prevent memory leaks
   */
  cleanup(windowMs: number): void {
    const now = Date.now();
    for (const [userId, timestamps] of this.events.entries()) {
      const recentEvents = timestamps.filter((timestamp) => now - timestamp < windowMs);
      if (recentEvents.length === 0) {
        this.events.delete(userId);
      } else {
        this.events.set(userId, recentEvents);
      }
    }
  }
}

// Rate limiter instances
const diceRollLimiter = new RateLimiter();
const chatMessageLimiter = new RateLimiter();
const fogOperationLimiter = new RateLimiter(); // Max 10 fog ops/second per socket

// Cleanup old events every 5 minutes
setInterval(() => {
  diceRollLimiter.cleanup(60 * 1000); // Dice rolls: 1 minute window
  chatMessageLimiter.cleanup(60 * 1000); // Chat messages: 1 minute window
  fogOperationLimiter.cleanup(5 * 1000); // Fog ops: 5 second window
}, 5 * 60 * 1000);

// ── Fog/Wall Helpers ─────────────────────────────────────────────────────────

function buildWsFogState(map: { width: number; height: number; gridSize: number }): FogState {
  // One fog cell per grid square so fog perfectly aligns with the visible grid.
  const cellPx = map.gridSize;
  const fogCols = map.width;   // grid columns
  const fogRows = map.height;  // grid rows
  return {
    fogCols,
    fogRows,
    cellPx,
    revealed: new Array(fogCols * fogRows).fill(false),
  };
}

/**
 * Load fog state from DB, rebuilding from scratch if the stored cell size no longer
 * matches the map's current grid size (e.g. after a cellPx migration or grid resize).
 */
function loadFogState(map: { width: number; height: number; gridSize: number }, stored: FogState | null): FogState {
  const expected = buildWsFogState(map);
  if (!stored || stored.cellPx !== expected.cellPx || stored.fogCols !== expected.fogCols || stored.fogRows !== expected.fogRows) {
    return expected; // Reset: stale/misaligned fog data
  }
  return stored;
}

function applyWsFogOperation(fog: FogState, operation: FogOperation): void {
  const total = fog.fogCols * fog.fogRows;
  switch (operation.op) {
    case 'reveal_all':
      fog.revealed.fill(true);
      break;
    case 'hide_all':
      fog.revealed.fill(false);
      break;
    case 'reveal':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = true;
      }
      break;
    case 'hide':
      for (const idx of operation.cells) {
        if (idx >= 0 && idx < total) fog.revealed[idx] = false;
      }
      break;
  }
}

/** Derive the list of revealed cell indices from a FogState for player broadcasts. */
function revealedCellIndices(fog: FogState): number[] {
  return fog.revealed.reduce<number[]>((acc, v, i) => {
    if (v) acc.push(i);
    return acc;
  }, []);
}

/**
 * Register all WebSocket event handlers
 * @param io - Socket.io server instance
 */
export function registerEventHandlers(io: Server): void {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log(`🔌 WebSocket connection attempt: ${socket.id}`);

    // CRITICAL: Authenticate the socket connection
    const authenticated = await authenticateSocket(socket);

    if (!authenticated) {
      console.log(`❌ Rejecting unauthenticated WebSocket connection: ${socket.id}`);
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
      return;
    }

    // Add socket to user's personal room (for direct messaging)
    if (socket.userId) {
      socket.join(socket.userId);
      console.log(`✅ Socket ${socket.id} joined user room: ${socket.userId}`);
    }

    // Send connection acknowledgment
    socket.emit('connected', {
      userId: socket.userId,
      timestamp: new Date().toISOString(),
    });

    // ============================================
    // AUTHENTICATE EVENT
    // User requests to join a campaign room
    // ============================================
    socket.on('authenticate', async (data: { campaignId: string }) => {
      try {
        console.log(`🔐 Authentication request for campaign: ${data.campaignId}`);

        if (!data.campaignId || typeof data.campaignId !== 'string') {
          socket.emit('error', { message: 'Campaign ID required' });
          return;
        }

        // Authenticate campaign membership
        const result = await authenticateCampaign(socket, data.campaignId);

        if (!result.success) {
          socket.emit('error', { message: result.error });
          return;
        }

        // SECURITY: Enforce single campaign context per socket
        // Leave previous campaign room if exists
        if (socket.campaignId && socket.campaignId !== data.campaignId) {
          await socket.leave(socket.campaignId);
          console.log(`🚪 Socket ${socket.id} left previous campaign: ${socket.campaignId}`);

          // Notify old campaign that user left
          socket.to(socket.campaignId).emit('user.left', {
            userId: socket.userId,
            timestamp: new Date().toISOString(),
          });
        }

        // Join the campaign room
        socket.join(data.campaignId);
        socket.campaignId = data.campaignId; // Update stored campaign ID
        console.log(`✅ Socket ${socket.id} joined campaign room: ${data.campaignId}`);

        // Notify the user they've been authenticated
        socket.emit('authenticated', {
          userId: socket.userId,
          campaignId: data.campaignId,
          role: result.role,
          timestamp: new Date().toISOString(),
        });

        // Get user information for system message
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        // Send system message to campaign
        if (user) {
          await sendSystemMessage(
            data.campaignId,
            `${user.displayName} has joined the campaign.`,
            { userId: socket.userId, action: 'user.joined' }
          );
        }

        // Also emit user.joined event for backwards compatibility
        const socketsInRoom = await io.in(data.campaignId).fetchSockets();
        console.log(`📡 Broadcasting user.joined to ${socketsInRoom.length - 1} other sockets in campaign ${data.campaignId}`);
        socket.to(data.campaignId).emit('user.joined', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });

        console.log(`✅ User ${socket.userId} authenticated to campaign ${data.campaignId} as ${result.role}`);
      } catch (error) {
        console.error('❌ Authentication error:', error);
        socket.emit('error', { message: 'Authentication failed' });
      }
    });

    // ============================================
    // TOKEN MOVEMENT EVENTS
    // Per SOW Section 6.2: Token Movement
    // ============================================

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

        // Fetch the map
        const map = await prisma.map.findUnique({
          where: { id: mapId },
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

        // Permission check: DM can move any token, players can only move their own
        if (socket.role !== 'DM' && token.controlledBy !== socket.userId) {
          socket.emit('error', { message: 'You do not have permission to move this token' });
          return;
        }

        // Spectators cannot move tokens (already handled by controlledBy check, but explicit)
        if (socket.role === 'SPECTATOR') {
          socket.emit('error', { message: 'Spectators cannot move tokens' });
          return;
        }

        // Spirit layer check: non-DMs cannot interact with spirit tokens when spirit layer is disabled
        if (token.layer === 'spirit' && socket.role !== 'DM') {
          const spiritVisible = await getSpiritVisibility(socket.campaignId, socket.userId!);
          if (!spiritVisible) {
            socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
            return;
          }
        }

        // Role-filtered broadcast for spirit tokens
        if (token.layer === 'spirit') {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            if (s.id === socket.id) continue; // Exclude sender
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === 'DM') {
              s.emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
            } else if (authedSocket.userId) {
              const canSee = await getSpiritVisibility(socket.campaignId, authedSocket.userId);
              if (canSee) {
                s.emit('token.move.start', { tokenId, mapId, movedBy: socket.userId });
              }
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (excluding sender)
          socket.to(socket.campaignId).emit('token.move.start', {
            tokenId,
            mapId,
            movedBy: socket.userId,
          });
        }

        console.log(`🎮 Token move started: ${tokenId} by ${socket.userId} on map ${mapId}`);
      } catch (error) {
        console.error('❌ Error in token.move.start:', error);
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

        const { tokenId, mapId, x, y } = data;

        if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
          return; // Silently ignore invalid data during rapid updates
        }

        // Fetch the map for bounds validation
        const map = await prisma.map.findUnique({
          where: { id: mapId },
          select: { width: true, height: true, campaignId: true },
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
        const fullMap = await prisma.map.findUnique({
          where: { id: mapId },
          select: { tokens: true },
        });
        const movingTokens = (Array.isArray(fullMap?.tokens) ? fullMap!.tokens : []) as unknown as Token[];
        const movingToken = movingTokens.find((t) => t.id === tokenId);

        // Role-filtered broadcast for spirit tokens
        if (movingToken && movingToken.layer === 'spirit') {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            if (s.id === socket.id) continue; // Exclude sender
            const authedSocket = s as unknown as AuthenticatedSocket;
            // Only send spirit token movement to DMs and players with spirit visibility
            if (authedSocket.role === 'DM') {
              s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            } else if (authedSocket.userId) {
              const canSee = await getSpiritVisibility(socket.campaignId, authedSocket.userId);
              if (canSee) {
                s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
              }
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (excluding sender)
          socket.to(socket.campaignId).emit('token.moved', {
            tokenId,
            mapId,
            x,
            y,
            movedBy: socket.userId,
          });
        }
      } catch (error) {
        console.error('❌ Error in token.move:', error);
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

        const { tokenId, mapId, x, y } = data;

        if (!tokenId || !mapId || typeof x !== 'number' || typeof y !== 'number') {
          socket.emit('error', { message: 'Invalid token move data' });
          return;
        }

        // Fetch the map
        const map = await prisma.map.findUnique({
          where: { id: mapId },
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

        // Permission check: DM can move any token, players can only move their own
        if (socket.role !== 'DM' && token.controlledBy !== socket.userId) {
          socket.emit('error', { message: 'You do not have permission to move this token' });
          return;
        }

        // Spirit layer check: non-DMs cannot interact with spirit tokens when spirit layer is disabled
        if (token.layer === 'spirit' && socket.role !== 'DM') {
          const spiritVisible = await getSpiritVisibility(socket.campaignId, socket.userId!);
          if (!spiritVisible) {
            socket.emit('error', { message: 'You cannot interact with spirit layer tokens' });
            return;
          }
        }

        // Update token position
        token.position = { x, y };

        // Update the tokens array in database
        const updatedTokens = [...tokensArray];
        updatedTokens[tokenIndex] = token;

        await prisma.map.update({
          where: { id: mapId },
          data: { tokens: updatedTokens as any },
        });

        // Role-filtered broadcast for spirit tokens
        if (token.layer === 'spirit') {
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === 'DM') {
              s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
            } else if (authedSocket.userId) {
              const canSee = await getSpiritVisibility(socket.campaignId, authedSocket.userId);
              if (canSee) {
                s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
              }
            }
          }
        } else if (map.lightingEnabled) {
          // Dynamic lighting: per-player visibility filtering
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            if (authedSocket.role === 'DM') {
              s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
              continue;
            }
            if (!authedSocket.userId) continue;

            // Compute which tokens are visible for this player after the move
            const allVisible = filterTokensByLighting(
              updatedTokens,
              authedSocket.userId,
              map.wallSegments as unknown as WallSegment[],
              map.width,
              map.height,
              map.gridSize,
              true,
              map.lights
            );
            const visibleIds = new Set(allVisible.map((t) => t.id));

            if (visibleIds.has(tokenId)) {
              // Token is visible: send position update AND appeared (frontend deduplicates)
              s.emit('token.moved', { tokenId, mapId, x, y, movedBy: socket.userId });
              // Also send full token data in case this player didn't have it yet
              s.emit('token:appeared', { token: { ...token, position: { x, y } }, mapId });
            } else {
              s.emit('token:disappeared', { tokenId, mapId });
            }

            // If a player moved their OWN token, their view frustum changed —
            // re-sync all OTHER tokens so NPCs that left/entered view appear/disappear immediately.
            if (token.controlledBy === authedSocket.userId) {
              for (const otherToken of updatedTokens) {
                if (otherToken.id === tokenId) continue; // already handled above
                // Skip own tokens — always included by filterTokensByLighting
                if ((otherToken as Token).controlledBy === authedSocket.userId) continue;
                if (visibleIds.has(otherToken.id)) {
                  s.emit('token:appeared', { token: otherToken, mapId });
                } else {
                  s.emit('token:disappeared', { tokenId: otherToken.id, mapId });
                }
              }
            }
          }
        } else {
          // Normal token - broadcast to all campaign members (including sender for confirmation)
          io.to(socket.campaignId).emit('token.moved', {
            tokenId,
            mapId,
            x,
            y,
            movedBy: socket.userId,
          });
        }

        console.log(`✅ Token move completed: ${tokenId} to (${x}, ${y}) by ${socket.userId}`);
      } catch (error) {
        console.error('❌ Error in token.move.end:', error);
        socket.emit('error', { message: 'Failed to finalize token movement' });
      }
    });

    // ============================================
    // DICE ROLL EVENT
    // Per SOW Section 6.3: Dice Rolling
    // ============================================

    /**
     * DICE.ROLL - User rolls dice
     * Validates expression, calculates result, saves to database, and broadcasts to campaign
     * Rate limited to 30 rolls per minute per user
     *
     * SECURITY: Uses server-authenticated socket.campaignId only
     * Client does NOT send campaignId - prevents campaign spoofing attacks
     */
    socket.on('dice.roll', async (data: { expression: string; characterName?: string; purpose?: string; secret?: boolean }) => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        const { expression, characterName, purpose, secret } = data;

        // Validate expression is provided
        if (!expression || typeof expression !== 'string') {
          socket.emit('error', { message: 'Dice expression required' });
          return;
        }

        // Rate limiting: 30 rolls per minute per user
        if (!diceRollLimiter.check(socket.userId!, 30, 60 * 1000)) {
          socket.emit('error', { message: 'Rate limit exceeded. Maximum 30 dice rolls per minute.' });
          return;
        }

        // Validate expression syntax (without rolling)
        try {
          parseDiceExpression(expression);
        } catch (error) {
          if (error instanceof DiceParserError) {
            socket.emit('error', { message: `Invalid dice expression: ${error.message}` });
            return;
          }
          throw error;
        }

        // Roll the dice
        const rollResult = rollDice(expression);

        // Get user information
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // SECURITY: Save ALL rolls to database (including secret rolls for audit)
        // Secret rolls are marked but still saved for DM oversight and dispute resolution
        const diceRoll = await prisma.diceRoll.create({
          data: {
            campaignId: socket.campaignId,
            userId: socket.userId!,
            expression,
            result: rollResult.total,
            breakdown: rollResult as any, // Store full RollResult
            characterName: characterName || null,
            purpose: purpose || null,
            secret: secret || false, // Mark as secret for visibility filtering
          },
        });

        // Create system message for dice roll
        // Secret rolls are marked differently in chat
        await prisma.message.create({
          data: {
            campaignId: socket.campaignId,
            userId: socket.userId,
            type: 'DICE_ROLL',
            content: `${user.displayName}${characterName ? ` (${characterName})` : ''} rolled ${expression}${purpose ? ` for ${purpose}` : ''}${secret ? ' (SECRET)' : ''}`,
            metadata: {
              diceRollId: diceRoll.id,
              expression,
              result: rollResult.total,
              breakdown: JSON.parse(JSON.stringify(rollResult)),
              characterName: characterName || null,
              purpose: purpose || null,
              secret: secret || false, // Mark in metadata for client filtering
            } as any,
          },
        });

        // Broadcast result with role-based filtering
        const rollData = {
          userId: socket.userId,
          userName: user.displayName,
          characterName: characterName || null,
          expression,
          result: rollResult.total,
          breakdown: rollResult,
          purpose: purpose || null,
          timestamp: new Date().toISOString(),
          secret: secret || false,
        };

        if (secret) {
          // Secret roll - send to roller (always)
          socket.emit('dice.rolled', rollData);

          // SECURITY: Also send to DM(s) for audit/oversight
          // Follows Spirit Layer pattern: DMs see everything, players see filtered
          const campaignSockets = await io.in(socket.campaignId).fetchSockets();
          for (const s of campaignSockets) {
            const authedSocket = s as unknown as AuthenticatedSocket;
            // Send to DMs only (excluding the original roller if they're DM)
            if (authedSocket.role === 'DM' && authedSocket.userId !== socket.userId) {
              s.emit('dice.rolled.secret', {
                ...rollData,
                originalRoller: socket.userId,
                isAuditView: true, // Flag so DM UI can style differently
              });
            }
          }
        } else {
          // Normal roll - broadcast to all campaign members
          io.to(socket.campaignId).emit('dice.rolled', rollData);
        }

        console.log(`🎲 Dice rolled${secret ? ' (SECRET)' : ''}: ${expression} = ${rollResult.total} by ${user.displayName} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in dice.roll:', error);
        if (error instanceof DiceParserError) {
          socket.emit('error', { message: `Dice roll failed: ${error.message}` });
        } else {
          socket.emit('error', { message: 'Failed to roll dice' });
        }
      }
    });

    // ============================================
    // DICE CLEAR HISTORY EVENT
    // DM can clear dice roll history for all campaign members
    // ============================================

    /**
     * DICE.CLEAR_HISTORY - DM clears dice roll history
     * Broadcasts to all campaign members to clear their roll history
     * DM-only action
     */
    socket.on('dice.clearHistory', async () => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        // Verify user is DM
        const campaign = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { ownerId: true },
        });

        if (!campaign || campaign.ownerId !== socket.userId) {
          socket.emit('error', { message: 'Only the DM can clear roll history' });
          return;
        }

        // Broadcast to all campaign members (including DM)
        io.to(socket.campaignId).emit('dice.historyCleared');

        console.log(`🗑️ Dice history cleared by DM in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in dice.clearHistory:', error);
        socket.emit('error', { message: 'Failed to clear dice history' });
      }
    });

    // ============================================
    // CHAT MESSAGE EVENT
    // Per SOW Section 6.4: Chat Messages
    // ============================================

    /**
     * CHAT.MESSAGE - User sends chat message
     * Validates content, saves to database, and broadcasts to campaign
     * Rate limited to 5 messages per minute per user
     *
     * SECURITY: Uses server-authenticated socket.campaignId only
     * Client does NOT send campaignId - prevents campaign spoofing attacks
     */
    socket.on('chat.message', async (data: { content: string; type: 'PLAYER' | 'DM' }) => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        const { content, type } = data;

        // Validate content is provided
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          socket.emit('error', { message: 'Message content required' });
          return;
        }

        // Validate message length (max 2000 characters)
        if (content.length > 2000) {
          socket.emit('error', { message: 'Message too long. Maximum 2000 characters.' });
          return;
        }

        // Validate message type
        if (type !== 'PLAYER' && type !== 'DM') {
          socket.emit('error', { message: 'Invalid message type. Must be PLAYER or DM.' });
          return;
        }

        // Rate limiting: respect campaign's chatCooldown settings
        const campaignSettings = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { chatCooldownEnabled: true, chatCooldownSeconds: true },
        });

        if (campaignSettings?.chatCooldownEnabled) {
          const windowMs = (campaignSettings.chatCooldownSeconds ?? 5) * 1000;
          if (!chatMessageLimiter.check(`${socket.userId}:${socket.campaignId}`, 1, windowMs)) {
            socket.emit('error', { message: `Rate limit: wait ${campaignSettings.chatCooldownSeconds}s between messages.` });
            return;
          }
        }

        // Get user information
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        // Save to database
        const message = await prisma.message.create({
          data: {
            campaignId: socket.campaignId,
            userId: socket.userId!,
            type,
            content: content.trim(),
            // metadata is optional for chat messages
          },
        });

        // Broadcast to all campaign members (including sender)
        io.to(socket.campaignId).emit('chat.message', {
          id: message.id,
          userId: socket.userId,
          userName: user.displayName,
          content: content.trim(),
          type,
          timestamp: message.createdAt.toISOString(),
        });

        console.log(`💬 Chat message: ${type} from ${user.displayName} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in chat.message:', error);
        socket.emit('error', { message: 'Failed to send chat message' });
      }
    });

    // ============================================
    // SPIRIT LAYER EVENTS
    // Per SOW Section 14: Spirit Layer Implementation
    // ============================================

    /**
     * SPIRIT_LAYER.TOGGLE - DM toggles spirit layer visibility for the campaign
     * Updates campaign.spiritLayerEnabled and broadcasts to all campaign members
     * Role-filtered: players receive the event so their UI updates accordingly
     */
    socket.on('spirit_layer.toggle', async (data: { visible: boolean }) => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        // DM only
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only the DM can toggle the spirit layer' });
          return;
        }

        const { visible } = data;

        if (typeof visible !== 'boolean') {
          socket.emit('error', { message: 'visible must be a boolean' });
          return;
        }

        // Update campaign in database
        await prisma.campaign.update({
          where: { id: socket.campaignId },
          data: { spiritLayerEnabled: visible },
        });

        // Broadcast to all campaign members (including sender for confirmation)
        io.to(socket.campaignId).emit('spirit_layer.toggled', {
          visible,
          toggledBy: socket.userId,
          timestamp: new Date().toISOString(),
        });

        // Also broadcast updated filtered map data so clients update their spirit layer rendering
        // Fetch the campaign's current map to send role-filtered updates
        const campaignForMap = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { currentMapId: true },
        });

        if (campaignForMap?.currentMapId) {
          const currentMap = await prisma.map.findUnique({
            where: { id: campaignForMap.currentMapId },
          });

          if (currentMap) {
            const campaignSockets = await io.in(socket.campaignId).fetchSockets();
            await Promise.all(
              campaignSockets.map(async (s) => {
                const authedSocket = s as unknown as AuthenticatedSocket;
                const spiritVisible =
                  authedSocket.role === 'DM'
                    ? true
                    : authedSocket.userId
                      ? await getSpiritVisibility(socket.campaignId!, authedSocket.userId)
                      : false;
                const filteredMap = filterMapData(
                  {
                    ...currentMap,
                    tokens: currentMap.tokens as any,
                    annotations: currentMap.annotations as any,
                  },
                  authedSocket.role || 'PLAYER',
                  spiritVisible,
                  authedSocket.userId
                );
                s.emit('map.changed', { mapId: currentMap.id, mapData: filteredMap, spiritVisible });
              })
            );
          }
        }

        // Send system message
        await sendSystemMessage(
          socket.campaignId,
          visible
            ? 'The spirit layer has been revealed...'
            : 'The spirit layer has been hidden.',
          { userId: socket.userId, action: 'spirit_layer.toggle', visible }
        );

        console.log(`👻 Spirit layer ${visible ? 'enabled' : 'disabled'} by ${socket.userId} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in spirit_layer.toggle:', error);
        socket.emit('error', { message: 'Failed to toggle spirit layer' });
      }
    });

    /**
     * SPIRIT_LAYER.STYLE_CHANGE - DM changes the realm atmosphere style
     * Broadcasts the new style string to all campaign members so they update in real time
     * without needing a page refresh. No DB write here — the REST API (updateCampaign)
     * already persisted it before this event is emitted from the client.
     */
    socket.on('spirit_layer.style_change', (data: { style: string }) => {
      if (!socket.campaignId) return;
      if (socket.role !== 'DM') {
        socket.emit('error', { message: 'Only DMs can change spirit layer style' });
        return;
      }
      io.to(socket.campaignId).emit('spirit_layer.style_changed', { style: data.style });
    });

    /**
     * SPIRIT_LAYER.TOKEN.TOGGLE - DM toggles visibility of a specific token
     * Updates token.visible in the Map.tokens JSON array
     * Role-filtered broadcast: non-DMs only receive if spirit layer is enabled and token is now visible
     */
    socket.on('spirit_layer.token.toggle', async (data: { mapId: string; tokenId: string; visible: boolean }) => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        // DM only
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only the DM can toggle token visibility' });
          return;
        }

        const { mapId, tokenId, visible } = data;

        if (!mapId || !tokenId || typeof visible !== 'boolean') {
          socket.emit('error', { message: 'mapId, tokenId, and visible (boolean) required' });
          return;
        }

        // Fetch the map
        const map = await prisma.map.findUnique({
          where: { id: mapId },
        });

        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        // Find and update the token
        const tokensArray = (Array.isArray(map.tokens) ? map.tokens : []) as unknown as Token[];
        const tokenIndex = tokensArray.findIndex((t) => t.id === tokenId);

        if (tokenIndex === -1) {
          socket.emit('error', { message: 'Token not found' });
          return;
        }

        const token = tokensArray[tokenIndex];
        token.visible = visible;

        // Save updated tokens to database
        const updatedTokens = [...tokensArray];
        updatedTokens[tokenIndex] = token;

        await prisma.map.update({
          where: { id: mapId },
          data: { tokens: updatedTokens as any },
        });

        // Role-filtered broadcast: use per-socket filtering
        const sockets = await io.in(socket.campaignId).fetchSockets();

        for (const s of sockets) {
          const authedSocket = s as unknown as AuthenticatedSocket;
          const isSocketDM = authedSocket.role === 'DM';

          // DM always gets the event
          if (isSocketDM) {
            s.emit('spirit_layer.token.toggled', {
              mapId,
              tokenId,
              visible,
              token,
              toggledBy: socket.userId,
              timestamp: new Date().toISOString(),
            });
            continue;
          }

          // Non-DMs: only notify if they can see the token after the change
          // Check spirit visibility for THIS receiver, not the sender
          const receiverSpiritVisible = await getSpiritVisibility(socket.campaignId, authedSocket.userId!);

          // They must be able to see spirit layer (if spirit token) AND token must be visible
          if (token.layer === 'spirit' && !receiverSpiritVisible) {
            // Player can't see spirit tokens - skip
            continue;
          }

          if (visible) {
            // Token is now visible - notify player so it appears
            s.emit('spirit_layer.token.toggled', {
              mapId,
              tokenId,
              visible,
              token,
              toggledBy: socket.userId,
              timestamp: new Date().toISOString(),
            });
          } else {
            // Token is now hidden - notify player so it disappears
            // Send minimal data (no full token details for hidden tokens)
            s.emit('spirit_layer.token.toggled', {
              mapId,
              tokenId,
              visible: false,
              toggledBy: socket.userId,
              timestamp: new Date().toISOString(),
            });
          }
        }

        console.log(`👻 Token ${tokenId} visibility set to ${visible} by ${socket.userId} on map ${mapId}`);
      } catch (error) {
        console.error('❌ Error in spirit_layer.token.toggle:', error);
        socket.emit('error', { message: 'Failed to toggle token visibility' });
      }
    });

    // ============================================
    // VIBE TRACKER EVENT
    // Per SOW Section 18.3: Vibe Tracker Details
    // ============================================

    /**
     * VIBE.UPDATE - DM changes the current vibe period
     * Updates campaign.currentVibe and broadcasts period data to all campaign members
     * Frontend applies CSS filters based on the broadcast data
     */
    socket.on('vibe.update', async (data: { period: string }) => {
      try {
        if (!socket.campaignId) {
          socket.emit('error', { message: 'Not authenticated to a campaign' });
          return;
        }

        // DM only
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only the DM can change the vibe' });
          return;
        }

        const { period } = data;

        if (!period || typeof period !== 'string') {
          socket.emit('error', { message: 'period (string) is required' });
          return;
        }

        // Fetch campaign vibe settings
        const campaign = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { vibeSettings: true, currentVibe: true },
        });

        if (!campaign) {
          socket.emit('error', { message: 'Campaign not found' });
          return;
        }

        // Normalize settings to handle old and new formats
        const vibeSettings = normalizeVibeSettings(campaign.vibeSettings);

        // Check if vibe tracker is enabled
        if (!vibeSettings.enabled) {
          socket.emit('error', { message: 'Vibe tracker is not enabled for this campaign' });
          return;
        }

        // Find the requested period in settings
        const vibePeriod = findVibePeriod(vibeSettings, period);

        if (!vibePeriod) {
          const availablePeriods = vibeSettings.periods.map((p: { name: string }) => p.name).join(', ');
          socket.emit('error', {
            message: `Unknown vibe period '${period}'. Available: ${availablePeriods}`,
          });
          return;
        }

        // Update campaign currentVibe
        await prisma.campaign.update({
          where: { id: socket.campaignId },
          data: { currentVibe: vibePeriod.name },
        });

        // Broadcast to all campaign members (including sender for confirmation)
        io.to(socket.campaignId).emit('vibe.updated', {
          period: vibePeriod.name,
          hue: vibePeriod.hue,
          filter: vibePeriod.filter,
          audio: vibePeriod.audio,
          updatedBy: socket.userId,
          timestamp: new Date().toISOString(),
        });

        // Send system message
        const periodDisplayName = vibePeriod.name.charAt(0).toUpperCase() + vibePeriod.name.slice(1);
        await sendSystemMessage(
          socket.campaignId,
          `Time advances to ${periodDisplayName}.`,
          { userId: socket.userId, action: 'vibe.update', period: vibePeriod.name }
        );

        console.log(`🌅 Vibe changed to '${vibePeriod.name}' by ${socket.userId} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in vibe.update:', error);
        socket.emit('error', { message: 'Failed to update vibe' });
      }
    });

    // ============================================
    // MAP CHANGE EVENT
    // DM switches to a different map
    // Broadcasts role-filtered map data to all campaign members
    // ============================================
    socket.on('map.change', async (data: { mapId: string }) => {
      try {
        if (!socket.campaignId) return;

        // DM only
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only DMs can change the map' });
          return;
        }

        const { mapId } = data;
        if (!mapId) {
          socket.emit('error', { message: 'mapId required' });
          return;
        }

        // Verify map belongs to this campaign
        const map = await prisma.map.findUnique({ where: { id: mapId } });
        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        // Broadcast role-filtered map data to each connected campaign member.
        // spiritVisible is included in the payload so the client knows whether
        // to show the spirit overlay for this specific viewer.
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        await Promise.all(
          campaignSockets.map(async (s) => {
            const authedSocket = s as unknown as AuthenticatedSocket;
            const spiritVisible =
              authedSocket.role === 'DM'
                ? true
                : authedSocket.userId
                  ? await getSpiritVisibility(socket.campaignId!, authedSocket.userId)
                  : false;
            const filteredMap = filterMapData(
              {
                ...map,
                tokens: map.tokens as any,
                annotations: map.annotations as any,
              },
              authedSocket.role || 'PLAYER',
              spiritVisible,
              authedSocket.userId
            );
            s.emit('map.changed', { mapId, mapData: filteredMap, spiritVisible });
          })
        );

        console.log(`🗺️ Map changed to ${mapId} by ${socket.userId} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in map.change:', error);
        socket.emit('error', { message: 'Failed to broadcast map change' });
      }
    });

    // ============================================
    // ATMOSPHERE EVENTS
    // Per SOW Section 18: Atmosphere & Immersion
    // ============================================

    /**
     * ATMOSPHERE.EFFECT.SET — DM sets a visual particle overlay on the map canvas.
     * Valid values: 'rain' | 'mist' | 'leaves' | 'sparkles' | 'snow' | null (clear)
     * Persists to campaign.vibeSettings JSON; broadcasts to all members.
     */
    socket.on('atmosphere.effect.set', async (data: { effect: string | null }) => {
      try {
        if (!socket.campaignId) return;

        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only the DM can set atmosphere effects' });
          return;
        }

        const VALID_EFFECTS = ['rain', 'mist', 'leaves', 'sparkles', 'snow', 'wind'];
        const effect = data.effect === null || VALID_EFFECTS.includes(data.effect)
          ? data.effect
          : null;

        // Fetch existing vibeSettings so we preserve all other keys
        const campaign = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { vibeSettings: true },
        });
        const existing = (campaign?.vibeSettings as Record<string, any>) ?? {};

        await prisma.campaign.update({
          where: { id: socket.campaignId },
          data: { vibeSettings: { ...existing, atmosphereEffect: effect } as any },
        });

        io.to(socket.campaignId).emit('atmosphere.effect.updated', {
          effect,
          setBy: socket.userId,
          timestamp: new Date().toISOString(),
        });

        console.log(`🌦️ Atmosphere effect set to '${effect ?? 'none'}' by ${socket.userId} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in atmosphere.effect.set:', error);
        socket.emit('error', { message: 'Failed to set atmosphere effect' });
      }
    });

    /**
     * ATMOSPHERE.AUDIO.SET — DM queues or stops ambient audio for all players.
     * assetId: UUID of an AUDIO asset, or null to stop.
     * Persists to campaign.vibeSettings JSON; broadcasts resolved audioUrl to all.
     */
    socket.on('atmosphere.audio.set', async (data: { assetId: string | null; volume?: number; loop?: boolean }) => {
      try {
        if (!socket.campaignId) return;

        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only the DM can control ambient audio' });
          return;
        }

        let audioUrl: string | null = null;

        if (data.assetId) {
          const asset = await prisma.asset.findUnique({
            where: { id: data.assetId },
          });

          if (!asset || asset.type !== 'AUDIO') {
            socket.emit('error', { message: 'Audio asset not found' });
            return;
          }

          // Verify asset is accessible to this campaign (global or belongs to this campaign)
          if (asset.scope === 'CAMPAIGN' && asset.campaignId !== socket.campaignId) {
            socket.emit('error', { message: 'Asset does not belong to this campaign' });
            return;
          }

          audioUrl = `/api/assets/audio/${data.assetId}`;
        }

        const volume = typeof data.volume === 'number'
          ? Math.min(1, Math.max(0, data.volume))
          : 0.5;
        const loop = data.loop !== false; // default true

        // Persist atmosphere audio state alongside existing vibeSettings keys
        const campaign = await prisma.campaign.findUnique({
          where: { id: socket.campaignId },
          select: { vibeSettings: true },
        });
        const existing = (campaign?.vibeSettings as Record<string, any>) ?? {};

        await prisma.campaign.update({
          where: { id: socket.campaignId },
          data: {
            vibeSettings: {
              ...existing,
              atmosphereAudio: data.assetId
                ? { assetId: data.assetId, volume, loop }
                : null,
            } as any,
          },
        });

        io.to(socket.campaignId).emit('atmosphere.audio.updated', {
          assetId: data.assetId,
          audioUrl,
          volume,
          loop,
          setBy: socket.userId,
          timestamp: new Date().toISOString(),
        });

        console.log(`🎵 Atmosphere audio set to '${data.assetId ?? 'none'}' by ${socket.userId} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in atmosphere.audio.set:', error);
        socket.emit('error', { message: 'Failed to set atmosphere audio' });
      }
    });

    // ============================================
    // CHARACTER HP UPDATE
    // Players update their own HP; DM can update any character's HP.
    // Saves to DB and broadcasts to all campaign members.
    // ============================================
    socket.on('character.hp.update', async (data: { characterId: string; delta: number }) => {
      try {
        const { characterId, delta } = data;

        if (!characterId || typeof delta !== 'number' || !Number.isFinite(delta)) {
          socket.emit('error', { message: 'characterId (string) and delta (number) are required' });
          return;
        }

        // Fetch the character
        const character = await prisma.character.findUnique({
          where: { id: characterId },
        });

        if (!character) {
          socket.emit('error', { message: 'Character not found' });
          return;
        }

        // Verify character belongs to this campaign
        const membership = await prisma.campaignMembership.findFirst({
          where: { campaignId: socket.campaignId, characterIds: { has: characterId } },
        });

        if (!membership) {
          socket.emit('error', { message: 'Character is not in this campaign' });
          return;
        }

        // Permission: character owner or DM
        if (character.userId !== socket.userId && socket.role !== 'DM') {
          socket.emit('error', { message: 'You do not have permission to update this character\'s HP' });
          return;
        }

        // System-aware HP read + apply delta
        const charData = character.data as Record<string, any>;
        let current: number;
        let max: number;
        let temp: number;

        switch (character.gameSystem) {
          case 'DND_5E':
          case 'PATHFINDER_2E': {
            if (!charData.hp || typeof charData.hp.maximum !== 'number') {
              socket.emit('error', { message: 'Character does not have HP tracking' });
              return;
            }
            max = charData.hp.maximum;
            temp = typeof charData.hp.temporary === 'number' ? charData.hp.temporary : 0;
            current = Math.max(0, Math.min(max, (typeof charData.hp.current === 'number' ? charData.hp.current : max) + delta));
            charData.hp.current = current;
            break;
          }
          case 'CALL_OF_CTHULHU_7E': {
            if (!charData.derivedStats?.hp || typeof charData.derivedStats.hp.maximum !== 'number') {
              socket.emit('error', { message: 'Character does not have HP tracking' });
              return;
            }
            max = charData.derivedStats.hp.maximum;
            temp = 0;
            current = Math.max(0, Math.min(max, (typeof charData.derivedStats.hp.current === 'number' ? charData.derivedStats.hp.current : max) + delta));
            charData.derivedStats.hp.current = current;
            break;
          }
          default:
            socket.emit('error', { message: 'HP tracking not supported for this game system' });
            return;
        }

        // Save updated character data
        await prisma.character.update({
          where: { id: characterId },
          data: { data: charData },
        });

        // Broadcast updated HP to all campaign members
        io.to(socket.campaignId!).emit('character.hp.updated', {
          characterId,
          hp: { current, max, temp },
        });

      } catch (error) {
        console.error('❌ Error in character.hp.update:', error);
        socket.emit('error', { message: 'Failed to update character HP' });
      }
    });

    // ============================================
    // DISCONNECT EVENT
    // Clean up when user disconnects
    // ============================================
    socket.on('disconnect', async (reason: string) => {
      console.log(`❌ WebSocket disconnected: ${socket.id} (${reason})`);

      // Notify campaign members if user was in a campaign
      if (socket.campaignId) {
        // Get user information for system message
        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { displayName: true },
        });

        // Send system message to campaign (best-effort — campaign may have been deleted)
        if (user) {
          try {
            await sendSystemMessage(
              socket.campaignId,
              `${user.displayName} has left the campaign.`,
              { userId: socket.userId, action: 'user.left' }
            );
          } catch {
            // Swallow — campaign was deleted or DB unavailable; disconnect must still complete cleanly
          }
        }

        // Also emit user.left event for backwards compatibility
        const socketsInRoom = await io.in(socket.campaignId).fetchSockets();
        console.log(`📡 Broadcasting user.left to ${socketsInRoom.length} sockets in campaign ${socket.campaignId}`);
        socket.to(socket.campaignId).emit('user.left', {
          userId: socket.userId,
          timestamp: new Date().toISOString(),
        });
      }

      // Leave all rooms
      socket.rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });
    });

    // ============================================
    // INITIATIVE TRACKER EVENTS
    // DM-only controls; state broadcasts to all campaign members
    // ============================================

    /**
     * Shared helper: broadcast full initiative state to all campaign members.
     * Called after every mutation.
     */
    async function broadcastInitiativeState(campaignId: string) {
      const state = getCombatState(campaignId);
      io.to(campaignId).emit('initiative.state', state);
    }

    /**
     * INITIATIVE.ADD — DM adds a token to the combatant list.
     * Payload: { tokenId, mapId }
     * The token's current metadata (name, image, hp, type) is read from the DB.
     */
    socket.on('initiative.add', async (data: { tokenId: string; mapId: string }) => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

        const { tokenId, mapId } = data;
        if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }

        const map = await prisma.map.findUnique({ where: { id: mapId } });
        if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

        const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
        const token = tokens.find((t: any) => t.id === tokenId);
        if (!token) { socket.emit('error', { message: 'Token not found' }); return; }

        const state = getCombatState(socket.campaignId);

        // Idempotent — don't add duplicates
        if (state.combatants.some((c) => c.tokenId === tokenId)) {
          socket.emit('error', { message: 'Token is already in initiative' });
          return;
        }

        const entry: CombatantEntry = {
          tokenId,
          name: token.name,
          imageUrl: token.imageUrl || '',
          initiative: token.initiative ?? null,
          hp: token.hp ?? null,
          type: token.type ?? 'npc',
          disposition: token.disposition ?? null,
        };

        state.combatants = sortCombatants([...state.combatants, entry]);
        setCombatState(socket.campaignId, state);
        await broadcastInitiativeState(socket.campaignId);
        console.log(`⚔️ Initiative: added token ${token.name} to campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in initiative.add:', error);
        socket.emit('error', { message: 'Failed to add to initiative' });
      }
    });

    /**
     * INITIATIVE.REMOVE — DM removes a token from the combatant list.
     * Payload: { tokenId }
     */
    socket.on('initiative.remove', async (data: { tokenId: string }) => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

        const { tokenId } = data;
        if (!tokenId) { socket.emit('error', { message: 'tokenId required' }); return; }

        const state = getCombatState(socket.campaignId);
        state.combatants = state.combatants.filter((c) => c.tokenId !== tokenId);

        // If we just removed the current combatant, advance to the next one
        if (state.currentTokenId === tokenId) {
          state.currentTokenId = state.combatants[0]?.tokenId ?? null;
        }

        setCombatState(socket.campaignId, state);
        await broadcastInitiativeState(socket.campaignId);
      } catch (error) {
        console.error('❌ Error in initiative.remove:', error);
        socket.emit('error', { message: 'Failed to remove from initiative' });
      }
    });

    /**
     * INITIATIVE.SET — DM manually sets a token's initiative value.
     * Payload: { tokenId, value: number | null }
     * Also persists the value to token.initiative in the DB.
     */
    socket.on('initiative.set', async (data: { tokenId: string; mapId: string; value: number | null }) => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can modify initiative' }); return; }

        const { tokenId, mapId, value } = data;
        if (!tokenId || !mapId) { socket.emit('error', { message: 'tokenId and mapId required' }); return; }
        if (value !== null && typeof value !== 'number') { socket.emit('error', { message: 'value must be a number or null' }); return; }

        // Persist to DB token record
        const map = await prisma.map.findUnique({ where: { id: mapId } });
        if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

        const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
        const tokenIndex = tokens.findIndex((t: any) => t.id === tokenId);
        if (tokenIndex !== -1) {
          tokens[tokenIndex] = { ...tokens[tokenIndex], initiative: value };
          await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });
        }

        // Update in-memory combat state
        const state = getCombatState(socket.campaignId);
        const combatantIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);
        if (combatantIndex !== -1) {
          state.combatants[combatantIndex].initiative = value;
          state.combatants = sortCombatants(state.combatants);
          setCombatState(socket.campaignId, state);
        }

        await broadcastInitiativeState(socket.campaignId);
        console.log(`⚔️ Initiative: set ${tokenId} initiative to ${value} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in initiative.set:', error);
        socket.emit('error', { message: 'Failed to set initiative value' });
      }
    });

    /**
     * INITIATIVE.ROLL — DM rolls initiative for a token using a dice expression.
     * Payload: { tokenId, mapId, expression, characterName? }
     * Rolls dice, saves result, updates state, broadcasts roll + state.
     */
    socket.on('initiative.roll', async (data: { tokenId: string; mapId: string; expression: string; characterName?: string }) => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can roll initiative' }); return; }

        const { tokenId, mapId, expression, characterName } = data;
        if (!tokenId || !mapId || !expression) { socket.emit('error', { message: 'tokenId, mapId, and expression required' }); return; }

        // Validate expression
        try { parseDiceExpression(expression); } catch (err) {
          if (err instanceof DiceParserError) { socket.emit('error', { message: `Invalid expression: ${err.message}` }); return; }
          throw err;
        }

        // Fetch token name from DB for logging
        const map = await prisma.map.findUnique({ where: { id: mapId } });
        if (!map || map.campaignId !== socket.campaignId) { socket.emit('error', { message: 'Map not found' }); return; }

        const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
        const tokenIndex = tokens.findIndex((t: any) => t.id === tokenId);
        if (tokenIndex === -1) { socket.emit('error', { message: 'Token not found' }); return; }

        const token = tokens[tokenIndex];
        const rollResult = rollDice(expression);
        const rolledValue = rollResult.total;

        // Persist to token
        tokens[tokenIndex] = { ...token, initiative: rolledValue };
        await prisma.map.update({ where: { id: mapId }, data: { tokens: tokens as any } });

        // Update in-memory state — add to combatants if not already present
        const state = getCombatState(socket.campaignId);
        const existingIndex = state.combatants.findIndex((c) => c.tokenId === tokenId);
        if (existingIndex !== -1) {
          state.combatants[existingIndex].initiative = rolledValue;
        } else {
          state.combatants.push({
            tokenId,
            name: token.name,
            imageUrl: token.imageUrl || '',
            initiative: rolledValue,
            hp: token.hp ?? null,
            type: token.type ?? 'npc',
            disposition: token.disposition ?? null,
          });
        }
        state.combatants = sortCombatants(state.combatants);
        setCombatState(socket.campaignId, state);

        // Get user info for roll broadcast
        const user = await prisma.user.findUnique({ where: { id: socket.userId }, select: { displayName: true } });

        // Broadcast the roll result so it appears in the dice log
        const rollData = {
          userId: socket.userId,
          userName: user?.displayName ?? 'DM',
          characterName: characterName || token.name,
          expression,
          result: rolledValue,
          breakdown: rollResult,
          purpose: `${token.name} Initiative`,
          timestamp: new Date().toISOString(),
          secret: false,
        };
        io.to(socket.campaignId).emit('dice.rolled', rollData);

        await broadcastInitiativeState(socket.campaignId);
        console.log(`⚔️ Initiative: rolled ${expression} = ${rolledValue} for ${token.name} in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in initiative.roll:', error);
        socket.emit('error', { message: 'Failed to roll initiative' });
      }
    });

    /**
     * INITIATIVE.REORDER — DM drags combatants into a custom order.
     * Payload: { orderedTokenIds: string[] }
     * Applies the given order directly (overrides sorting by value).
     */
    socket.on('initiative.reorder', async (data: { orderedTokenIds: string[] }) => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can reorder initiative' }); return; }

        const { orderedTokenIds } = data;
        if (!Array.isArray(orderedTokenIds)) { socket.emit('error', { message: 'orderedTokenIds must be an array' }); return; }

        const state = getCombatState(socket.campaignId);
        const combatantMap = new Map(state.combatants.map((c) => [c.tokenId, c]));
        const reordered: CombatantEntry[] = [];
        for (const id of orderedTokenIds) {
          const c = combatantMap.get(id);
          if (c) reordered.push(c);
        }
        // Keep any combatants not in the orderedTokenIds at the end
        for (const c of state.combatants) {
          if (!reordered.includes(c)) reordered.push(c);
        }
        state.combatants = reordered;
        setCombatState(socket.campaignId, state);
        await broadcastInitiativeState(socket.campaignId);
      } catch (error) {
        console.error('❌ Error in initiative.reorder:', error);
        socket.emit('error', { message: 'Failed to reorder initiative' });
      }
    });

    /**
     * INITIATIVE.START — DM begins combat (round 1, first combatant active).
     * Payload: none
     */
    socket.on('initiative.start', async () => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can start combat' }); return; }

        const state = getCombatState(socket.campaignId);
        if (state.combatants.length === 0) { socket.emit('error', { message: 'Add combatants before starting combat' }); return; }

        state.active = true;
        state.round = 1;
        state.currentTokenId = state.combatants[0].tokenId;
        setCombatState(socket.campaignId, state);
        await broadcastInitiativeState(socket.campaignId);
        console.log(`⚔️ Combat started in campaign ${socket.campaignId} — Round 1, first: ${state.combatants[0].name}`);
      } catch (error) {
        console.error('❌ Error in initiative.start:', error);
        socket.emit('error', { message: 'Failed to start combat' });
      }
    });

    /**
     * INITIATIVE.NEXT — DM advances to the next combatant.
     * Wraps around to the start of the list and increments the round counter.
     * Payload: none
     */
    socket.on('initiative.next', async () => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can advance the turn' }); return; }

        const state = getCombatState(socket.campaignId);
        if (!state.active || state.combatants.length === 0) { socket.emit('error', { message: 'Combat is not active' }); return; }

        const currentIndex = state.combatants.findIndex((c) => c.tokenId === state.currentTokenId);
        const nextIndex = currentIndex + 1;

        if (nextIndex >= state.combatants.length) {
          // Wrap around — new round
          state.round += 1;
          state.currentTokenId = state.combatants[0].tokenId;
        } else {
          state.currentTokenId = state.combatants[nextIndex].tokenId;
        }

        setCombatState(socket.campaignId, state);
        await broadcastInitiativeState(socket.campaignId);
        console.log(`⚔️ Initiative advanced in campaign ${socket.campaignId} — Round ${state.round}, current: ${state.currentTokenId}`);
      } catch (error) {
        console.error('❌ Error in initiative.next:', error);
        socket.emit('error', { message: 'Failed to advance initiative' });
      }
    });

    /**
     * INITIATIVE.END — DM ends combat and clears all state.
     * Payload: none
     */
    socket.on('initiative.end', async () => {
      try {
        if (!socket.campaignId) { socket.emit('error', { message: 'Not authenticated to a campaign' }); return; }
        if (socket.role !== 'DM') { socket.emit('error', { message: 'Only the DM can end combat' }); return; }

        clearCombatState(socket.campaignId);
        io.to(socket.campaignId).emit('initiative.state', {
          active: false,
          round: 0,
          currentTokenId: null,
          combatants: [],
        });
        console.log(`⚔️ Combat ended in campaign ${socket.campaignId}`);
      } catch (error) {
        console.error('❌ Error in initiative.end:', error);
        socket.emit('error', { message: 'Failed to end combat' });
      }
    });

    /**
     * INITIATIVE.REQUEST_STATE — Client requests current state on (re)connect.
     * Payload: none
     */
    socket.on('initiative.request_state', () => {
      if (!socket.campaignId) return;
      const state = getCombatState(socket.campaignId);
      socket.emit('initiative.state', state);
    });

    // ============================================
    // WALL & FOG OF WAR EVENTS
    // Per WALLS_DYNAMIC_LIGHTING_PLAN.md Session 82
    // All write events are DM-only; validated before persisting.
    // ============================================

    /**
     * wall:add — DM adds a single wall segment.
     * Broadcasts wall:added to all campaign members after persisting.
     */
    socket.on('wall:add', async (data: { mapId: string; segment: unknown }) => {
      try {
        if (!socket.campaignId) return;
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only DMs can add wall segments' });
          return;
        }

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
        console.error('❌ Error in wall:add:', error);
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
        console.error('❌ Error in wall:remove:', error);
        socket.emit('error', { message: 'Failed to remove wall segment' });
      }
    });

    /**
     * wall:update — DM updates a wall segment (e.g., door open/close).
     */
    socket.on('wall:update', async (data: { mapId: string; segment: unknown }) => {
      try {
        if (!socket.campaignId) return;
        if (socket.role !== 'DM' && socket.role !== 'PLAYER') {
          socket.emit('error', { message: 'Permission denied' });
          return;
        }

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
        console.error('❌ Error in wall:update:', error);
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
        console.error('❌ Error in walls:replace:', error);
        socket.emit('error', { message: 'Failed to replace wall segments' });
      }
    });

    /**
     * fog:operation — DM applies a fog operation (reveal/hide cells).
     * Throttled to 10 operations/second per socket.
     * DM receives full fogState; players receive only revealed cell indices.
     */
    socket.on('fog:operation', async (data: { mapId: string; operation: unknown }) => {
      try {
        if (!socket.campaignId) return;
        if (socket.role !== 'DM') {
          socket.emit('error', { message: 'Only DMs can modify fog of war' });
          return;
        }

        // Throttle: max 10 fog ops/second
        if (!fogOperationLimiter.check(socket.id, 10, 1000)) {
          return; // Silently drop — brush strokes fire fast, flooding is expected
        }

        const { mapId, operation } = data;
        if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

        const parsed = FogOperationSchema.safeParse(operation);
        if (!parsed.success) {
          socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid fog operation' });
          return;
        }

        const map = await prisma.map.findUnique({
          where: { id: mapId },
          select: { campaignId: true, fogData: true, width: true, height: true, gridSize: true },
        });
        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        const fog: FogState = loadFogState(map, map.fogData as FogState | null);
        applyWsFogOperation(fog, parsed.data);

        await prisma.map.update({ where: { id: mapId }, data: { fogData: fog as any } });

        // Broadcast: DM gets full state; all others get revealed-cell indices + grid metadata
        const campaignSockets = await io.in(socket.campaignId).fetchSockets();
        for (const s of campaignSockets) {
          const authed = s as unknown as AuthenticatedSocket;
          if (authed.role === 'DM') {
            s.emit('fog:updated', { mapId, fogState: fog });
          } else {
            s.emit('fog:cells', {
              mapId,
              revealedCells: revealedCellIndices(fog),
              fogCols: fog.fogCols,
              fogRows: fog.fogRows,
              cellPx: fog.cellPx,
            });
          }
        }
      } catch (error) {
        console.error('❌ Error in fog:operation:', error);
        socket.emit('error', { message: 'Failed to apply fog operation' });
      }
    });

    /**
     * fog:request_state — Any campaign member requests current fog state on (re)join.
     * DM receives full fogState; players receive revealed-cell list.
     */
    socket.on('fog:request_state', async (data: { mapId: string }) => {
      try {
        if (!socket.campaignId) return;
        const { mapId } = data;
        if (!mapId) return;

        const map = await prisma.map.findUnique({
          where: { id: mapId },
          select: { campaignId: true, fogData: true, width: true, height: true, gridSize: true },
        });
        if (!map || map.campaignId !== socket.campaignId) return;

        const fog: FogState = loadFogState(map, map.fogData as FogState | null);

        if (socket.role === 'DM') {
          socket.emit('fog:updated', { mapId, fogState: fog });
        } else {
          socket.emit('fog:cells', {
            mapId,
            revealedCells: revealedCellIndices(fog),
            fogCols: fog.fogCols,
            fogRows: fog.fogRows,
            cellPx: fog.cellPx,
          });
        }
      } catch (error) {
        console.error('❌ Error in fog:request_state:', error);
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
        console.error('❌ Error in walls:request:', error);
      }
    });

    // ── Light Source Events ─────────────────────────────────────────────────

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

        const { mapId, light } = data;
        if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

        const parsed = LightSourceSchema.safeParse(light);
        if (!parsed.success) {
          socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
          return;
        }

        const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        if (existing.length >= 200) {
          socket.emit('error', { message: 'Maximum 200 light sources per map' });
          return;
        }

        await prisma.map.update({ where: { id: mapId }, data: { lights: [...existing, parsed.data] as any } });

        io.to(socket.campaignId).emit('light:added', { mapId, light: parsed.data });
      } catch (error) {
        console.error('❌ Error in light:add:', error);
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

        const { mapId, lightId } = data;
        if (!mapId || !lightId) { socket.emit('error', { message: 'mapId and lightId required' }); return; }

        const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        const existing = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        const filtered = existing.filter((l) => l.id !== lightId);

        await prisma.map.update({ where: { id: mapId }, data: { lights: filtered as any } });

        io.to(socket.campaignId).emit('light:removed', { mapId, lightId });
      } catch (error) {
        console.error('❌ Error in light:remove:', error);
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

        const { mapId, light } = data;
        if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

        const parsed = LightSourceSchema.safeParse(light);
        if (!parsed.success) {
          socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid light source' });
          return;
        }

        const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true, lights: true } });
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

        existing[idx] = parsed.data;
        await prisma.map.update({ where: { id: mapId }, data: { lights: existing as any } });

        io.to(socket.campaignId).emit('light:updated', { mapId, light: parsed.data });
      } catch (error) {
        console.error('❌ Error in light:update:', error);
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

        const { mapId, lights } = data;
        if (!mapId) { socket.emit('error', { message: 'mapId required' }); return; }

        const parsed = LightSourcesArraySchema.safeParse(lights);
        if (!parsed.success) {
          socket.emit('error', { message: parsed.error.issues[0]?.message ?? 'Invalid lights array' });
          return;
        }

        const map = await prisma.map.findUnique({ where: { id: mapId }, select: { campaignId: true } });
        if (!map || map.campaignId !== socket.campaignId) {
          socket.emit('error', { message: 'Map not found' });
          return;
        }

        await prisma.map.update({ where: { id: mapId }, data: { lights: parsed.data as any } });

        io.to(socket.campaignId).emit('lights:replaced', { mapId, lights: parsed.data });
      } catch (error) {
        console.error('❌ Error in lights:replace:', error);
        socket.emit('error', { message: 'Failed to replace light sources' });
      }
    });

    /**
     * lights:request — Any campaign member requests current light sources on (re)join.
     */
    socket.on('lights:request', async (data: { mapId: string }) => {
      try {
        if (!socket.campaignId) return;
        const { mapId } = data;
        if (!mapId) return;

        const map = await prisma.map.findUnique({
          where: { id: mapId },
          select: { campaignId: true, lights: true },
        });
        if (!map || map.campaignId !== socket.campaignId) return;

        const lights = (Array.isArray(map.lights) ? map.lights : []) as unknown as LightSource[];
        socket.emit('lights:replaced', { mapId, lights });
      } catch (error) {
        console.error('❌ Error in lights:request:', error);
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

    // ============================================
    // PING/PONG HEARTBEAT
    // Connection health monitoring
    // ============================================
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });

    // ============================================
    // ERROR HANDLER
    // Catch unhandled socket errors
    // ============================================
    socket.on('error', (error: Error) => {
      console.error('❌ Socket error:', error);
    });
  });
}
