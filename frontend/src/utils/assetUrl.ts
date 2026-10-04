// ============================================
// Asset URL helpers
//
// Asset references are stored in one of two shapes depending on how old the
// record is and which route wrote it:
//
//   "/api/assets/tokens/{uuid}"   the canonical form (see backend
//                                 utils/asset-urls.ts, which normalises on
//                                 write for characters, maps and tokens)
//   "{uuid}"                      a bare id, written by older paths
//
// Anything reading a stored reference has to cope with both, so the
// extraction lives here rather than being re-derived per component.
// ============================================

import { AssetType, AssetScope } from '@/types';

/**
 * Pull the asset id out of a stored reference, whichever shape it is in.
 * Returns null for empty/missing values.
 */
export function extractAssetId(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * The serving directory for each asset type, matching the backend's routes
 * under /api/assets/. This was copied into two components and had already
 * drifted from the enum: a DOCUMENT fell through a `?? 'tokens'` fallback and
 * was requested from the wrong route. One table, every value named, so a new
 * type fails to compile until it has a directory.
 */
export type AssetDirectory = 'maps' | 'tokens' | 'audio' | 'avatars' | 'documents';

export const ASSET_DIRECTORY: Record<AssetType, AssetDirectory> = {
  [AssetType.MAP]: 'maps',
  [AssetType.TOKEN]: 'tokens',
  [AssetType.AUDIO]: 'audio',
  [AssetType.AVATAR]: 'avatars',
  [AssetType.DOCUMENT]: 'documents',
  // Not uploadable: there is no route for it and no stored asset of this type.
  // The record has to be total, so it falls back to documents; a lookup here
  // means a record that should not exist, and the directory listing shows it.
  [AssetType.OTHER]: 'documents',
};

/** The directory an asset of this type is served from. */
export function assetDirectory(type: AssetType): AssetDirectory {
  return ASSET_DIRECTORY[type];
}

/**
 * What each scope is called in the interface.
 *
 * Written by hand in five components before this, which is how one of them
 * came to print the raw enum: a two-way check that named USER "Personal" and
 * fell through to `asset.scope` for the rest, so a campaign asset was labelled
 * CAMPAIGN where the rest of the app says Campaign.
 */
export const ASSET_SCOPE_LABEL: Record<AssetScope, string> = {
  [AssetScope.USER]: 'Personal',
  [AssetScope.CAMPAIGN]: 'Campaign',
  [AssetScope.GLOBAL]: 'Global',
};

/** The label for a scope. */
export function assetScopeLabel(scope: AssetScope): string {
  return ASSET_SCOPE_LABEL[scope];
}
