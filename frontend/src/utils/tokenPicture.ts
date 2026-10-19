/**
 * A character's token picture, chosen in a sheet editor and uploaded when the
 * sheet is saved. Every editor checks and uploads it the same way; this is the
 * one copy.
 */

import { AssetType } from '@/types';
import type { ServerConfig } from '@/types';
import { api } from '@/services/api';
import { assetNameFrom } from './assetName';
import { getUploadLimit, formatUploadLimit } from './uploadLimits';

/** Why a file cannot be a token picture, or null when it can. */
export function tokenPictureProblem(file: File, serverConfig: ServerConfig | undefined): string | null {
  if (!file.type.startsWith('image/')) return 'Please select an image file';
  const limit = getUploadLimit(serverConfig, AssetType.TOKEN);
  if (file.size > limit) return `Image must be smaller than ${formatUploadLimit(limit)}`;
  return null;
}

/**
 * Upload a character's token picture and give the URL its token reads. It goes
 * into the character's campaign's library, or the owner's own without one,
 * named after the character. The file is sent last: the server reads the parts
 * in order, so it knows the asset type even when it stops an oversize file
 * part way.
 */
export async function uploadTokenPicture(file: File, characterName: string, campaignId: string | null | undefined): Promise<string> {
  const form = new FormData();
  form.append('type', 'TOKEN');
  if (campaignId) {
    form.append('scope', 'CAMPAIGN');
    form.append('campaignId', campaignId);
  } else {
    form.append('scope', 'USER');
  }
  form.append('name', assetNameFrom(`${characterName.trim() || 'Character'} Token`));
  form.append('file', file);
  const { asset } = await api.uploadAsset(form);
  return `/api/assets/tokens/${asset.id}`;
}
