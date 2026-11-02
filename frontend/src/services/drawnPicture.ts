// ============================================
// Uploading a picture Paint made: into the campaign's library, as a map
// picture tagged drawn-map, through the same upload as any other. Written
// once here for Draw a map and Save, so the fields and their order cannot
// differ between them.
// ============================================

import { api } from './api';
import { AssetScope, AssetType, type Asset } from '@/types';
import { DRAWN_MAP_TAG } from '@/components/campaign/map/paint/drawnMapSize';
import { formatUploadLimit, getUploadLimit } from '@/utils/uploadLimits';
import { apiErrorStatus } from '@/utils/errors';

/**
 * Every drawn picture's name in the Asset Library, never the map's: a
 * picture is listed to whoever may list it, and a name could say what is
 * being prepared.
 */
export const DRAWN_PICTURE_NAME = 'Drawn map';
const DRAWN_PICTURE_FILE = 'drawn-map.png';

/** Why a drawn picture was not uploaded, in words to show as they are. */
export class DrawnPictureRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawnPictureRefused';
  }
}

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Upload `png` into the campaign's library and answer the asset. Refused
 * here, before anything is sent, when it is over the server's limit for a
 * map picture (MAX_MAP_SIZE_MB); the server's own answer otherwise.
 */
export async function uploadDrawnPicture(png: Blob, campaignId: string): Promise<Asset> {
  // The limit as the server has it, or the usual one where it cannot be read.
  const config = await api.getServerConfig().catch(() => undefined);
  const limit = getUploadLimit(config, AssetType.MAP);
  if (png.size > limit) {
    throw new DrawnPictureRefused(`This picture is ${megabytes(png.size)}, over this server's limit of ${formatUploadLimit(limit)} for a map picture.`);
  }
  // The type first: the server reads the parts in order, and names the
  // type's limit only if it has read the type before the file.
  const form = new FormData();
  form.append('type', AssetType.MAP);
  form.append('scope', AssetScope.CAMPAIGN);
  form.append('name', DRAWN_PICTURE_NAME);
  form.append('tags', DRAWN_MAP_TAG);
  form.append('campaignId', campaignId);
  form.append('file', new File([png], DRAWN_PICTURE_FILE, { type: 'image/png' }));
  try {
    return (await api.uploadAsset(form)).asset;
  } catch (err) {
    // The proxy in front of the server answers this, with no words of its own.
    if (apiErrorStatus(err) === 413) {
      throw new DrawnPictureRefused('This picture is too large for this server to take. Its administrator can raise the limit.');
    }
    throw err;
  }
}
