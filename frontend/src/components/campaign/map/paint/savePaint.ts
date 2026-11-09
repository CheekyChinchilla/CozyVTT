// ============================================
// Saving what is painted as the map's picture.
//
// The picture is made as a PNG and written over the map's picture, when
// that is one Paint made (tagged DRAWN_MAP_TAG): the same asset under the
// same id (PUT /api/assets/:id/picture), so every link to it, the map, a
// shared Document, a note, shows the new painting. No earlier version is
// kept. The server answers the picture's address with a new version, and
// the map is pointed at it (PUT /maps/:id { imageUrl }), its size and grid
// unchanged, so tokens, walls, lights and fog stay where they are, and each
// open table loads the new picture as it loads any new one. Every other map
// of the campaign using that picture is pointed at the new address too, so
// a table on one of them sees it as well.
//
// A map whose picture is not one Paint made (none, gone, or changed
// elsewhere to an uploaded picture) gets a new picture uploaded, tagged
// DRAWN_MAP_TAG (services/drawnPicture.ts), within the server's map limit;
// an uploaded picture is never written over. A map that will not take the
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
  /** Whether the previous picture is one Paint made, which the save writes over. */
  previousIsDrawn(): Promise<boolean>;
  /** Write the PNG over the drawn picture with this id, answering the asset and the address the map is given next. */
  writeOver(assetId: string, png: Blob): Promise<{ asset: Asset; imageUrl: string }>;
  /** Upload the PNG as a new drawn picture, for a map with none. */
  upload(png: Blob): Promise<Asset>;
  /** Point the map being painted at a picture, by its address or its asset's id, answering the map. */
  pointMapAt(picture: string): Promise<CampaignMap>;
  /** The other maps of the campaign whose picture is the previous one: they change with it. */
  sharing: readonly string[];
  /** Point another map at the picture's new address. */
  pointOtherMapAt(mapId: string, address: string): Promise<unknown>;
  /** Delete an asset without force: a new upload the map refused. */
  remove(assetId: string): Promise<unknown>;
}

const quietly = (what: string) => (err: unknown) => {
  console.warn(`[paint] Could not ${what}:`, errorSummary(err));
};

/** Save: the map as pointed at the picture saved, and the picture. Rejects with why it could not. */
export async function savePaint(steps: SavePaintSteps): Promise<{ map: CampaignMap; asset: Asset }> {
  const png = await steps.makePng();
  if (!png) throw new DrawnPictureRefused(PNG_NOT_MADE);

  const previousId = extractAssetId(steps.previous);
  if (previousId && (await steps.previousIsDrawn())) {
    const { asset, imageUrl } = await steps.writeOver(previousId, png);
    const map = await steps.pointMapAt(imageUrl);
    for (const mapId of steps.sharing) {
      // The picture is saved: a map left behind shows it the next time it is loaded.
      await steps.pointOtherMapAt(mapId, imageUrl).catch(quietly('point another map using this picture at it'));
    }
    return { map, asset };
  }

  const asset = await steps.upload(png);
  try {
    return { map: await steps.pointMapAt(asset.id), asset };
  } catch (err) {
    await steps.remove(asset.id).catch(quietly('delete the picture of a save the map refused; it stays in the Asset Library'));
    throw err;
  }
}
