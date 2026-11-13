// ============================================
// Dice Service
// Handles roll history API calls
// ============================================

import apiClient from './api';
import type { DiceRolledEvent } from '@/types';

/**
 * Get roll history for a campaign.
 *
 * Rolls have always been stored server-side; this is what reads them back, so
 * the dice panel survives a refresh or a reconnect instead of starting empty.
 *
 * Visibility is decided by the server, not here: a player receives public rolls
 * plus their own secret ones, and a GM receives everything. Nothing that the
 * caller is not entitled to see is sent over the wire, so there is no filtering
 * to do on this side.
 *
 * @param campaignId - Campaign ID
 * @param limit - Number of rolls to fetch (default 50, max 100)
 * @returns Rolls ordered newest first
 */
export async function getDiceRolls(
  campaignId: string,
  limit: number = 50
): Promise<DiceRolledEvent[]> {
  const response = await apiClient.getDiceRolls(campaignId, { limit });
  return response.rolls;
}
