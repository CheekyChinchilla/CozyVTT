// ============================================
// Sending a picture Paint made: uploaded into the campaign's library, as a
// map picture tagged DRAWN_MAP_TAG, through the same upload as any other;
// or written over the drawn picture it replaces, by Save. Written once here
// for Draw a map and Save, so the fields, their order and the size check
// cannot differ between them.
// ============================================

import { api } from './api';
import { AssetScope, AssetType, type Asset } from '@/types';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';
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
 * Refused here, before anything is sent, when `png` is over the server's
 * limit for a map picture (MAX_MAP_SIZE_MB).
 */
async function refuseOverLimit(png: Blob): Promise<void> {
  // The limit as the server has it, or the usual one where it cannot be read.
  const config = await api.getServerConfig().catch(() => undefined);
  const limit = getUploadLimit(config, AssetType.MAP);
  if (png.size > limit) {
    throw new DrawnPictureRefused(`This picture is ${megabytes(png.size)}, over this server's limit of ${formatUploadLimit(limit)} for a map picture.`);
  }
}

/** The server's answer, or the words for the proxy in front of it refusing the size, which it says nothing of. */
async function sent<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (err) {
    if (apiErrorStatus(err) === 413) {
      throw new DrawnPictureRefused('This picture is too large for this server to take. Its administrator can raise the limit.');
    }
    throw err;
  }
}

const pictureFile = (png: Blob) => new File([png], DRAWN_PICTURE_FILE, { type: 'image/png' });

/**
 * Upload `png` into the campaign's library and answer the asset: Draw a
 * map's blank picture, and a map's first painting when it has no drawn
 * picture to write over.
 */
export async function uploadDrawnPicture(png: Blob, campaignId: string): Promise<Asset> {
  await refuseOverLimit(png);
  // The type first: the server reads the parts in order, and names the
  // type's limit only if it has read the type before the file.
  const form = new FormData();
  form.append('type', AssetType.MAP);
  form.append('scope', AssetScope.CAMPAIGN);
  form.append('name', DRAWN_PICTURE_NAME);
  form.append('tags', DRAWN_MAP_TAG);
  form.append('campaignId', campaignId);
  form.append('file', pictureFile(png));
  return (await sent(api.uploadAsset(form))).asset;
}

/**
 * Write `png` over the drawn picture with this id, under the same id
 * (Paint's Save), and answer the asset and the address to give its map.
 */
export async function replaceDrawnPicture(png: Blob, assetId: string): Promise<{ asset: Asset; imageUrl: string }> {
  await refuseOverLimit(png);
  const form = new FormData();
  form.append('file', pictureFile(png));
  const { asset, imageUrl } = await sent(api.replaceDrawnPicture(assetId, form));
  return { asset, imageUrl };
}
