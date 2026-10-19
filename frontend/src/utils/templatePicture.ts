/**
 * A character template's picture.
 *
 * Every user can see a template, so its picture has to be a global asset that
 * every user can load; the server refuses any other. A character's own
 * picture is nearly always its player's upload, so it is left out of a
 * template made from the character unless it is global, and the user is told.
 */

import api from '@/services/api';
import { extractAssetId } from './assetUrl';
import { AssetScope } from '@/types';

const WHY = "a template's picture has to be a global asset, so that everyone who copies the template can see it.";

/** Said when a sheet save in Edit Template came with a token picture. */
export const TEMPLATE_PICTURE_NOT_USED = `Template sheet saved, without the token picture you chose: ${WHY}`;

/** Said when Save as Template left the character's picture out. */
export const TEMPLATE_PUBLISHED_WITHOUT_PICTURE = `Template published, without the character's picture: ${WHY}`;

/**
 * The picture a template made from a character may carry: the character's,
 * when it is a global asset, and otherwise none. One that cannot be looked up
 * is left out too, since the server would refuse it.
 */
export async function pictureForTemplate(tokenImageUrl: string | null | undefined): Promise<string | null> {
  const id = extractAssetId(tokenImageUrl);
  if (!tokenImageUrl || !id) return null;
  try {
    const { asset } = await api.getAsset(id);
    return asset.scope === AssetScope.GLOBAL ? tokenImageUrl : null;
  } catch {
    return null;
  }
}
