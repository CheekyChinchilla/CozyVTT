// ============================================
// What saving the vibe periods does to the table
// ============================================
//
// Every member's page shows the periods and the vibe's tint, so a save sends
// each of them the periods as saved and the vibe they leave. The vibe owns the
// soundtrack (see atmosphereAudio), so its track follows the period in force:
// an edited period's new track plays, and a vibe that ends takes its track
// with it. A track the DM put on over the vibe from the Atmosphere panel is
// left playing.

import { Server } from 'socket.io';
import type { Prisma } from '@prisma/client';
import { findVibePeriod, normalizeVibeSettings, VibeSettings } from '../utils/vibe-presets';
import { vibePeriodAudioAssetId } from '../utils/vibeAudio';
import { readJsonObject } from '../utils/prisma-json';
import { lastAmbientVolume, setCampaignAmbientAudio } from './atmosphereAudio';

/**
 * The vibe a save leaves: the period in force under its saved spelling, or
 * none once it is renamed or deleted. Periods are matched ignoring case, as
 * a switch matches them, so a change only to a period's capitals keeps it in
 * force; pages match the stored name exactly, so it takes the new spelling.
 */
export function vibeAfterSave(saved: VibeSettings, currentVibe: string | null): string | null {
  if (!currentVibe) return null;
  return findVibePeriod(saved, currentVibe)?.name ?? null;
}

/** The track the table is playing, from a campaign's stored vibe settings. */
function playingTrack(vibeSettings: Prisma.JsonValue): string | null {
  const audio = readJsonObject(vibeSettings)?.atmosphereAudio;
  if (!audio || typeof audio !== 'object' || Array.isArray(audio)) return null;
  const assetId = (audio as Record<string, unknown>).assetId;
  return typeof assetId === 'string' ? assetId : null;
}

/**
 * Tell the table about a save, and move the soundtrack with the vibe.
 *
 * `before` is the campaign as it was stored before the save, `saved` as it
 * is stored after it: its vibe and what is playing are read fresh, so a
 * switch that landed meanwhile, and the track that switch started, are left
 * as they are. Every period's track was checked before the save was stored,
 * so a refusal here is a track removed in between: the table is then
 * silenced, as a switch to that period would.
 */
export async function announceVibeSave(
  io: Server,
  campaignId: string,
  actingUserId: string,
  before: { currentVibe: string | null; vibeSettings: Prisma.JsonValue },
  saved: { currentVibe: string | null; vibeSettings: Prisma.JsonValue },
): Promise<void> {
  io.to(campaignId).emit('vibe.settings.updated', {
    campaignId,
    vibeSettings: saved.vibeSettings,
    currentVibe: saved.currentVibe,
    updatedBy: actingUserId,
    timestamp: new Date().toISOString(),
  });

  if (!before.currentVibe) return;
  const was = findVibePeriod(normalizeVibeSettings(before.vibeSettings), before.currentVibe);
  const now = saved.currentVibe ? findVibePeriod(normalizeVibeSettings(saved.vibeSettings), saved.currentVibe) : null;
  const oldTrack = was ? vibePeriodAudioAssetId(was.audio) : null;
  const newTrack = now ? vibePeriodAudioAssetId(now.audio) : null;
  const playing = playingTrack(saved.vibeSettings);
  const vibeHasTheSoundtrack = playing === null || playing === oldTrack;
  if (newTrack === oldTrack || !vibeHasTheSoundtrack || playing === newTrack) return;

  const volume = await lastAmbientVolume(campaignId);
  const result = await setCampaignAmbientAudio(io, campaignId, actingUserId, newTrack, { volume });
  if (!result.ok) await setCampaignAmbientAudio(io, campaignId, actingUserId, null, { volume });
}
