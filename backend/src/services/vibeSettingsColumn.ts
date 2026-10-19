// ============================================
// Writing a campaign's vibe settings, a part at a time
// ============================================
//
// `Campaign.vibeSettings` is one JSON column holding three things written by
// different hands: the vibe periods (the period editor), the ambient track
// and the weather (the table's live controls). Each writer used to read the
// whole column and write it back with its part changed, so two writes close
// together lost one: periods saved as the track changed put the old track
// back, and the other way round. Each writer here changes its own part in
// one statement, so neither can undo the other.

import { prisma } from '../config/database';

/** The parts the table's live controls own, which a period save leaves as stored. */
const LIVE_KEYS = ['atmosphereAudio', 'atmosphereEffect'] as const;
type LiveKey = (typeof LIVE_KEYS)[number];

/** Set the ambient track or the weather, leaving the rest of the column as it stands. */
export async function setVibeSettingsLiveKey(campaignId: string, key: LiveKey, value: unknown): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Campaign"
    SET "vibeSettings" = jsonb_set(
          CASE WHEN jsonb_typeof("vibeSettings") = 'object' THEN "vibeSettings" ELSE '{}'::jsonb END,
          ARRAY[${key}]::text[],
          ${JSON.stringify(value ?? null)}::jsonb,
          true
        ),
        "updatedAt" = NOW()
    WHERE id = ${campaignId}`;
}

/**
 * Replace the period editor's part of the column (the periods, `enabled` and
 * anything else it sends), keeping the track and the weather as they are
 * stored at that moment. The caller's own values for those are ignored: only
 * the live controls set them, after checking the track may be played.
 */
export async function replaceVibeSettingsKeepingLive(campaignId: string, settings: Record<string, unknown>): Promise<void> {
  const incoming: Record<string, unknown> = { ...settings };
  for (const key of LIVE_KEYS) delete incoming[key];
  await prisma.$executeRaw`
    UPDATE "Campaign"
    SET "vibeSettings" = ${JSON.stringify(incoming)}::jsonb || (
          SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
          FROM jsonb_each(CASE WHEN jsonb_typeof("vibeSettings") = 'object' THEN "vibeSettings" ELSE '{}'::jsonb END)
          WHERE key IN ('atmosphereAudio', 'atmosphereEffect')
        ),
        "updatedAt" = NOW()
    WHERE id = ${campaignId}`;
}
