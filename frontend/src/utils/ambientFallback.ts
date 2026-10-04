/**
 * One track plays at a time, and the vibe owns it: the Atmosphere panel is a
 * live override, not a replacement. These decide when the vibe's own track
 * comes back, so a one-shot sound effect does not leave the table silent
 * until the next vibe switch.
 */

import type { VibeSettings } from '@/types';
import { vibePeriodAudioAssetId } from './vibeAudio';

/** The track the current vibe period names, or null when it names none. */
export function currentVibeTrack(
  vibeSettings: VibeSettings | undefined,
  currentVibe: string | null,
): string | null {
  if (!currentVibe) return null;
  const period = vibeSettings?.periods?.find((p) => p.name === currentVibe);
  return period ? vibePeriodAudioAssetId(period.audio) : null;
}

/**
 * What stopping the playing track sets: the vibe's own track comes back,
 * unless the playing track IS the vibe's, which stops it until the next
 * override or vibe switch.
 */
export function stopTarget(vibeTrackId: string | null, playingAssetId: string): string | null {
  return vibeTrackId && vibeTrackId !== playingAssetId ? vibeTrackId : null;
}

/**
 * What the DM's client sets when a non-looping track finishes: the vibe's
 * track, or nothing, which also clears the finished track from the stored
 * state so a player who joins later does not start it from the top. Only the
 * DM's client answers; everyone else just heard the track end.
 */
export function trackEndTarget(
  isDM: boolean,
  vibeTrackId: string | null,
): { assetId: string | null } | null {
  return isDM ? { assetId: vibeTrackId } : null;
}
