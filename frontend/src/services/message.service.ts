// ============================================
// Message Service
// Handles chat message history API calls
// ============================================

import apiClient from './api';
import type { Message } from '@/types';

/**
 * Get message history for a campaign
 * @param campaignId - Campaign ID
 * @param limit - Number of messages to fetch (default 50, max 100)
 * @param before - Cursor for pagination (get messages before this timestamp)
 * @returns Array of messages, ordered newest first
 */
export async function getMessages(
  campaignId: string,
  limit: number = 50,
  before?: string
): Promise<Message[]> {
  const params: { limit?: number; before?: string } = { limit };
  if (before) {
    params.before = before;
  }

  const response = await apiClient.getMessages(campaignId, params);
  return response.messages;
}
