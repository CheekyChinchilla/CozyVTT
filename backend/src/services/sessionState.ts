/**
 * Session State Management Service
 * Session State Management
 *
 * Handles capture and restoration of campaign game state including:
 * - Token positions
 * - Current map
 * - Vibe tracker settings
 * - Spirit layer visibility
 * - Map annotations
 */

import type { CampaignStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import type { Token } from '../websocket/shared';
import { readJsonArray, readTokens } from '../utils/prisma-json';
import { createTurnQueue } from '../utils/turnQueue';

/**
 * Game State Interface
 * Saved State JSON Structure
 */
export interface GameState {
  sessionId?: string;
  savedAt: string;
  mapId: string | null;
  tokens: Token[];
  spiritLayerVisible: boolean;
  currentVibe: string | null;
  annotations: unknown[];
}

/**
 * Capture the current game state for a campaign
 * State Persistence
 *
 * @param campaignId - Campaign ID
 * @param sessionId - Optional session ID to include in state
 * @param db - The transaction a session step holds, so the snapshot is read
 *   on its connection: read through the shared client, it needed a second
 *   connection while holding one.
 * @returns GameState object
 */
export async function captureGameState(
  campaignId: string,
  sessionId?: string,
  db: Prisma.TransactionClient = prisma
): Promise<GameState> {
  try {
    // Get campaign with current map
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      include: {
        currentMap: {
          select: {
            id: true,
            tokens: true,
            annotations: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Build state object
    const state: GameState = {
      sessionId: sessionId || undefined,
      savedAt: new Date().toISOString(),
      mapId: campaign.currentMapId,
      tokens: readTokens(campaign.currentMap?.tokens),
      spiritLayerVisible: campaign.spiritLayerEnabled,
      currentVibe: campaign.currentVibe,
      annotations: readJsonArray(campaign.currentMap?.annotations),
    };

    logger.info(`📸 Captured game state for campaign ${campaignId}`);
    return state;
  } catch (error) {
    logger.error('❌ Error capturing game state', { err: error });
    throw error;
  }
}

/** Session steps waiting their turn for each campaign in this process (see utils/turnQueue.ts). */
const sessionTurns = createTurnQueue();

/**
 * How many session steps in this process are waiting their turn for a
 * campaign, not counting the one under way. A test reads it to know a step
 * is waiting before it goes on.
 */
export function sessionStepsWaitingFor(campaignId: string): number {
  return sessionTurns.waitingFor(campaignId);
}

/**
 * Run `work` holding the campaign's row, so that the session steps for one
 * campaign (start, pause, end, resume, and a status change in settings) run
 * one at a time, each seeing what the one before it left. Without it two
 * Starts both found no session running and made two, and a Pause beside an
 * End marked the ended session PAUSED.
 *
 * A step waits its turn in this process first, holding no connection: one
 * waiting on the row lock inside its transaction held a pooled connection,
 * and a burst of steps on one campaign could take the whole pool. Everything
 * `work` reads goes through `tx`, for the same reason.
 *
 * `campaign` is null when the campaign does not exist.
 */
export async function withSessionsHeld<T>(
  campaignId: string,
  work: (tx: Prisma.TransactionClient, campaign: { status: CampaignStatus } | null) => Promise<T>,
): Promise<T> {
  const release = await sessionTurns.turnFor(campaignId);
  try {
    return await prisma.$transaction(async (tx) => {
      const [campaign] = await tx.$queryRaw<{ status: CampaignStatus }[]>`
        SELECT status FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
      return work(tx, campaign ?? null);
    });
  } finally {
    release();
  }
}

/**
 * The session that has started and not ended, running or paused. There is at
 * most one while every step goes through `withSessionsHeld`; older versions
 * could leave two, and the newest is the one the campaign page shows.
 */
export async function openSession(tx: Prisma.TransactionClient, campaignId: string) {
  return tx.session.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
}

/**
 * Get the next session number for a campaign
 * Auto-increments based on existing sessions
 *
 * @param campaignId - Campaign ID
 * @returns Next session number
 */
export async function getNextSessionNumber(campaignId: string, db: Prisma.TransactionClient = prisma): Promise<number> {
  const lastSession = await db.session.findFirst({
    where: { campaignId },
    orderBy: { sessionNumber: 'desc' },
    select: { sessionNumber: true },
  });

  return (lastSession?.sessionNumber || 0) + 1;
}
