// ============================================
// Saving what is painted as the map's picture.
//
// The picture is made as a PNG and uploaded as a new campaign map picture
// tagged DRAWN_MAP_TAG (services/drawnPicture.ts), within the server's map
// limit; the map is pointed at it (PUT /maps/:id { imageUrl }), its size
// and grid unchanged, so tokens, walls, lights and fog stay where they are.
// Then the picture the map had is deleted, if Paint made it, without force:
// the server keeps one anything else still uses (409), and a picture
// uploaded by hand is never deleted this way. A map that will not take the
// new picture takes it with it: the upload is deleted again.
// ============================================

import type { Asset, CampaignMap } from '@/types';
import { extractAssetId } from '@/utils/assetUrl';
import { errorSummary } from '@/utils/errors';
import { DrawnPictureRefused } from '@/services/drawnPicture';

/** What a browser that made no PNG of the picture is told. */
export const PNG_NOT_MADE = 'This browser could not make the picture to save. Try again.';

/** The steps of a save, each the page's; the tests pass their own. */
export interface SavePaintSteps {
  /** The map's picture address before this save, or '' for none. */
  previous: string;
  makePng(): Promise<Blob | null>;
  upload(png: Blob): Promise<Asset>;
  /** Point the map at the picture with this id, answering the map. */
  pointMapAt(assetId: string): Promise<CampaignMap>;
  /** Whether the previous picture is one Paint made. */
  previousIsDrawn(): Promise<boolean>;
  /** Delete an asset without force. */
  remove(assetId: string): Promise<unknown>;
}

const quietly = (what: string) => (err: unknown) => {
  console.warn(`[paint] Could not delete ${what}; it stays in the Asset Library:`, errorSummary(err));
};

/** Save: the map as pointed at the new picture, and the picture. Rejects with why it could not. */
export async function savePaint(steps: SavePaintSteps): Promise<{ map: CampaignMap; asset: Asset }> {
  const png = await steps.makePng();
  if (!png) throw new DrawnPictureRefused(PNG_NOT_MADE);
  const asset = await steps.upload(png);
  let map: CampaignMap;
  try {
    map = await steps.pointMapAt(asset.id);
  } catch (err) {
    await steps.remove(asset.id).catch(quietly('the picture of a save the map refused'));
    throw err;
  }
  const previousId = extractAssetId(steps.previous);
  if (previousId && previousId !== asset.id && (await steps.previousIsDrawn())) {
    await steps.remove(previousId).catch(quietly('the picture this save replaced'));
  }
  return { map, asset };
}
