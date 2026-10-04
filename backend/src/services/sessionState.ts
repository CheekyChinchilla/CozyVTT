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

import { prisma } from '../config/database';
import logger from '../utils/logger';
import type { Token } from '../websocket/shared';
import { readJsonArray, readTokens } from '../utils/prisma-json';

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
 * @returns GameState object
 */
export async function captureGameState(
  campaignId: string,
  sessionId?: string
): Promise<GameState> {
  try {
    // Get campaign with current map
    const campaign = await prisma.campaign.findUnique({
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

/**
 * Get the most recent session for a campaign
 * Useful for resuming the last session
 *
 * @param campaignId - Campaign ID
 * @returns Session record or null
 */
export async function getLastSession(campaignId: string) {
  return await prisma.session.findFirst({
    where: { campaignId },
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
export async function getNextSessionNumber(campaignId: string): Promise<number> {
  const lastSession = await prisma.session.findFirst({
    where: { campaignId },
    orderBy: { sessionNumber: 'desc' },
    select: { sessionNumber: true },
  });

  return (lastSession?.sessionNumber || 0) + 1;
}
