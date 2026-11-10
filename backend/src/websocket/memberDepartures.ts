/**
 * Why a member went out of a campaign, kept for a minute.
 *
 * A removal and a leave tell the member's open connections why
 * (`tellTableMemberLeft` in services/campaignMembers.ts), and record it here
 * just before the membership's delete commits (`takeMemberOut`). A
 * connection that was joining at that moment, or that reconnects soon after
 * (a computer that slept through it), finds only that the membership is
 * gone. This record lets it be told the same reason. Once it has run out,
 * or with no record at all, the reason is `not-member`.
 *
 * The record is per process: it lives in this backend process's memory, as
 * the live table's rooms do. A restart forgets it, and with more than one
 * backend process a join handled by another would find none and say
 * `not-member`.
 */

import type { MemberLeftReason, NotAMemberReason } from './utils';

/** How long a departure is remembered. */
export const DEPARTURE_MEMORY_MS = 60_000;

/** Oldest first: a key written again is moved to the end. */
const departures = new Map<string, { reason: MemberLeftReason; at: number }>();

const keyOf = (userId: string, campaignId: string) => `${userId}:${campaignId}`;

/** Record that `userId` went out of `campaignId`, and why. */
export function rememberDeparture(userId: string, campaignId: string, reason: MemberLeftReason): void {
  const now = Date.now();
  // Oldest first, so the ones that have run out are at the front.
  for (const [key, departure] of departures) {
    if (now - departure.at < DEPARTURE_MEMORY_MS) break;
    departures.delete(key);
  }
  const key = keyOf(userId, campaignId);
  departures.delete(key);
  departures.set(key, { reason, at: now });
}

/** Why `userId` is not a member of `campaignId`: the reason recorded in the last minute, or `not-member`. */
export function whyNotAMember(userId: string, campaignId: string): NotAMemberReason {
  const departure = departures.get(keyOf(userId, campaignId));
  if (!departure || Date.now() - departure.at >= DEPARTURE_MEMORY_MS) return 'not-member';
  return departure.reason;
}
