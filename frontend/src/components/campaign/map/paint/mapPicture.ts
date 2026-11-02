// ============================================
// Whether a map's picture is one Paint may change.
//
// Paint is offered on a map drawn in CozyVTT and on a map with no picture,
// never on an uploaded one. The map names only its picture's address, so
// the picture's asset is asked for, once a session (an asset's tags do not
// change after it is uploaded): a map picture of this campaign tagged
// DRAWN_MAP_TAG is a drawn one. A picture the server no longer has counts as
// none, so Paint is how such a map gets a picture again.
// ============================================

import { useEffect, useState } from 'react';
import { api } from '@/services/api';
import type { Asset } from '@/types';
import { extractAssetId } from '@/utils/assetUrl';
import { apiErrorStatus, errorSummary } from '@/utils/errors';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';

/**
 * What a map's picture is, for Paint: none at all; drawn in CozyVTT;
 * uploaded; gone from the server; or not known yet.
 */
export type MapPictureKind = 'none' | 'drawn' | 'uploaded' | 'gone' | 'unknown';

/** A map picture of this campaign carrying exactly DRAWN_MAP_TAG. */
export function isDrawnPicture(
  asset: { type: string; campaignId: string | null; tags: readonly string[] } | null | undefined,
  campaignId: string | undefined,
): boolean {
  return !!asset && !!campaignId && asset.type === 'MAP' && asset.campaignId === campaignId && asset.tags.includes(DRAWN_MAP_TAG);
}

type Answer = Asset | 'gone' | null;

/** Each picture asked for, by its asset's id, for the rest of the session. */
const asked = new Map<string, Promise<Answer>>();

/** A picture this page has just uploaded, so its map need not ask for it. */
export function rememberPictureAsset(asset: Asset): void {
  asked.set(asset.id, Promise.resolve(asset));
}

function ask(assetId: string): Promise<Answer> {
  let answer = asked.get(assetId);
  if (!answer) {
    answer = api.getAsset(assetId).then(
      (reply) => reply?.asset ?? null,
      (err: unknown): Answer => {
        if (apiErrorStatus(err) === 404) return 'gone';
        // Asked again next time: the connection may only have dropped.
        asked.delete(assetId);
        console.warn('[paint] Could not read a map picture:', errorSummary(err));
        return null;
      },
    );
    asked.set(assetId, answer);
  }
  return answer;
}

/** Whether the picture at `url` is one Paint made for this campaign; false for any it cannot tell. */
export async function pictureIsDrawn(url: string, campaignId: string | undefined): Promise<boolean> {
  const assetId = url ? extractAssetId(url) : null;
  if (!assetId) return false;
  const answer = await ask(assetId);
  return answer !== null && answer !== 'gone' && isDrawnPicture(answer, campaignId);
}

/** What the map's picture is, for the DM; 'unknown' for anyone else, who is never offered Paint. */
export function useMapPictureKind(
  map: { imageUrl?: string | null } | null | undefined,
  campaignId: string | undefined,
  isDM: boolean,
): MapPictureKind {
  const url = map ? map.imageUrl ?? '' : null;
  const assetId = url ? extractAssetId(url) : null;
  const [known, setKnown] = useState<{ url: string; kind: MapPictureKind } | null>(null);

  useEffect(() => {
    if (!isDM || !url || !assetId) return undefined;
    let current = true;
    void ask(assetId).then((answer) => {
      if (!current) return;
      const kind: MapPictureKind = answer === 'gone' ? 'gone'
        : answer === null ? 'unknown'
          : isDrawnPicture(answer, campaignId) ? 'drawn' : 'uploaded';
      setKnown({ url, kind });
    });
    return () => {
      current = false;
    };
  }, [isDM, url, assetId, campaignId]);

  if (!isDM || url === null) return 'unknown';
  if (url === '') return 'none';
  if (!assetId) return 'uploaded';
  return known?.url === url ? known.kind : 'unknown';
}
