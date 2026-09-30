// ============================================
// The campaign's ambient track, set from one place
// ============================================
//
// Setting a track is what opens it to the campaign: the read rule lets a
// member fetch whatever their campaign is playing, because the sound is not
// relayed through the server, each player's browser fetches the file itself.
// So every setter has to ask the same question the serving route asks, of the
// acting DM. Both the Atmosphere panel's handler and the vibe switch go
// through here, so that question is asked once, the persisted state has one
// shape, and the broadcast is the same event however the track was chosen.

import { Server } from 'socket.io';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { readJsonObject, toJson } from '../utils/prisma-json';
import { canReadAsset } from './permissions';

export interface SetAmbientAudioResult {
  ok: boolean;
  /** On refusal: what to tell the DM. */
  message?: string;
}

/**
 * Set or stop the campaign's ambient track, persist it, and tell the room.
 *
 * `assetId: null` stops the audio. A track the acting DM cannot read answers
 * the same as one that does not exist, so the reply cannot be used to
 * discover which ids are real. The admin exemption stays off: an admin may
 * read any file, but setting one here is not reading it, it opens the file
 * to everyone at the table.
 */
export async function setCampaignAmbientAudio(
  io: Server,
  campaignId: string,
  actingUserId: string,
  assetId: string | null,
  opts: { volume?: number; loop?: boolean } = {},
): Promise<SetAmbientAudioResult> {
  let audioUrl: string | null = null;

  if (assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });

    if (!asset || asset.type !== 'AUDIO') {
      return { ok: false, message: 'Audio asset not found' };
    }

    if (asset.scope === 'CAMPAIGN' && asset.campaignId !== campaignId) {
      return { ok: false, message: 'Asset does not belong to this campaign' };
    }

    if (!(await canReadAsset(asset, actingUserId, false))) {
      return { ok: false, message: 'Audio asset not found' };
    }

    audioUrl = `/api/assets/audio/${assetId}`;
  }

  const volume = typeof opts.volume === 'number'
    ? Math.min(1, Math.max(0, opts.volume))
    : 0.5;
  const loop = opts.loop !== false; // default true

  // Persist atmosphere audio state alongside existing vibeSettings keys
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { vibeSettings: true },
  });
  const existing = readJsonObject(campaign?.vibeSettings) ?? {};

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      vibeSettings: toJson({
        ...existing,
        atmosphereAudio: assetId ? { assetId, volume, loop } : null,
      }),
    },
  });

  io.to(campaignId).emit('atmosphere.audio.updated', {
    assetId,
    audioUrl,
    volume,
    loop,
    setBy: actingUserId,
    timestamp: new Date().toISOString(),
  });

  logger.info('atmosphere audio set', { assetId: assetId ?? 'none', userId: actingUserId, campaignId });
  return { ok: true };
}

/**
 * The volume the table last used for ambience, for a setter that has no
 * volume of its own (the vibe switch). Falls back to the player default.
 */
export async function lastAmbientVolume(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { vibeSettings: true },
  });
  const settings = readJsonObject(campaign?.vibeSettings) ?? {};
  const audio = settings.atmosphereAudio;
  if (audio && typeof audio === 'object' && !Array.isArray(audio)) {
    const volume = (audio as Record<string, unknown>).volume;
    if (typeof volume === 'number') return Math.min(1, Math.max(0, volume));
  }
  return 0.5;
}
