import { AssetScope } from '@/types';
import type { Asset } from '@/types';

/**
 * The audio assets this DM may open to the table: global tracks, their own,
 * and this campaign's. The asset list the API returns is wider, it also
 * carries audio belonging to other campaigns this DM is in, and other
 * people's personal tracks, which the server refuses to set because a
 * campaign's audio belongs to that table and a stranger's file is not the
 * DM's to open to the room. Offering one gives a control that does nothing,
 * so the Atmosphere panel and the vibe period editor both pick from this.
 */
export function settableAudioAssets(
  assets: Asset[],
  userId: string | undefined,
  campaignId: string,
): Asset[] {
  return assets.filter(
    (a) =>
      a.scope === AssetScope.GLOBAL ||
      (a.scope === AssetScope.USER && a.uploadedById === userId) ||
      (a.scope === AssetScope.CAMPAIGN && a.campaignId === campaignId),
  );
}
