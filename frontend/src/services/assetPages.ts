// ============================================
// Every page of an asset list
// ============================================
//
// For the short lists a select offers in full: the sound files the
// Atmosphere panel and the vibe periods can play, and the documents a DM can
// share. Each fetched one page, the newest 50 or 100 assets of every campaign
// the user is in, and then kept the ones it could offer, so an asset past that
// page was never offered. The picture pickers, whose libraries can be large,
// search and page instead (AssetGrid).

import api from './api';
import type { Asset } from '@/types';

/** The most a server sends in one page. */
const PAGE_SIZE = 100;

/** Stop after this many pages, which no library of sounds or documents reaches. */
const MAX_PAGES = 50;

type ListParams = Omit<NonNullable<Parameters<typeof api.listAssets>[0]>, 'page' | 'limit'>;

/** Every asset GET /api/assets lists for these filters, page by page. */
export async function listEveryAsset(params: ListParams): Promise<Asset[]> {
  const all: Asset[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await api.listAssets({ ...params, page, limit: PAGE_SIZE });
    all.push(...(res.assets ?? []));
    if (page >= (res.pagination?.totalPages ?? 1)) break;
  }
  return all;
}
