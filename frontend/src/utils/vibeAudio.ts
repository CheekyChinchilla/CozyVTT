/**
 * What a vibe period's `audio` value means, decided once for both packages.
 *
 * The field holds the id of an audio asset to play for the whole table while
 * that period is the vibe. It used to be a free-text note, so stored settings
 * can carry anything; only a value shaped like an asset id counts as a track,
 * and everything else means the period has no audio. The server uses this to
 * decide what a vibe switch plays, the client to decide what the period
 * editor's picker shows, so the two must agree.
 *
 * This file exists byte-for-byte in backend/src/utils and frontend/src/utils;
 * a parity test fails if the copies drift. It is self-contained on purpose.
 */

const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The asset id a period's stored `audio` names, or null when it names none. */
export function vibePeriodAudioAssetId(audio: unknown): string | null {
  return typeof audio === 'string' && ASSET_ID_PATTERN.test(audio) ? audio : null;
}
