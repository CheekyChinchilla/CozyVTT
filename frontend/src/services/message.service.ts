// ============================================
// Message Service
// Handles chat message history API calls
// ============================================

import apiClient from './api';
import type { MessageHistoryPage } from '@/types';

/**
 * A page of chat history, newest first.
 *
 * Returns the whole page rather than just the messages: the panel needs the
 * server's `hasMore` and `nextCursor`. It used to unwrap and discard them, which
 * left the panel guessing whether more history existed from the page's length —
 * and a short page is exactly what a campaign full of dice rolls produced.
 *
 * @param cursor - From the previous page's `pagination.nextCursor`. Omit for the
 *                 newest page. Opaque: pass it back untouched.
 */
export async function getMessages(
  campaignId: string,
  limit: number = 50,
  cursor?: string
): Promise<MessageHistoryPage> {
  const params: { limit?: number; cursor?: string } = { limit };
  if (cursor) {
    params.cursor = cursor;
  }

  return apiClient.getMessages(campaignId, params);
}
