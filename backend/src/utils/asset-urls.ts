/**
 * Asset URL Utilities
 * Ensures all asset URLs use the full path format: /api/assets/{type}/{uuid}
 */

/**
 * Check if a string is a valid UUID
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Normalize an asset URL to the full path format
 * If the input is already a full path, return it as-is
 * If the input is just a UUID, prepend the appropriate path
 *
 * @param url - The asset URL (either UUID or full path)
 * @param assetType - The type of asset ('maps', 'tokens', 'avatars', 'audio')
 * @returns The normalized full path URL
 *
 * @example
 * normalizeAssetUrl('bc5f19c0-158b-4330-a5cc-6133666a4fec', 'maps')
 * // => '/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec'
 *
 * normalizeAssetUrl('/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec', 'maps')
 * // => '/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec'
 */
export function normalizeAssetUrl(url: string | null | undefined, assetType: 'maps' | 'tokens' | 'avatars' | 'audio'): string | null {
  // Handle null/undefined
  if (url === null || url === undefined) {
    return null;
  }

  // If already a full path, return as-is
  if (url.startsWith('/api/assets/')) {
    return url;
  }

  // If it's a UUID, prepend the path
  if (isUUID(url)) {
    return `/api/assets/${assetType}/${url}`;
  }

  // If it's neither, assume it's a UUID and prepend anyway
  // (this handles cases where the UUID check might fail but it's still valid)
  return `/api/assets/${assetType}/${url}`;
}

/**
 * Normalize a map's asset URLs
 */
export function normalizeMapUrls(mapData: any): any {
  const normalized = { ...mapData };

  if (normalized.imageUrl) {
    normalized.imageUrl = normalizeAssetUrl(normalized.imageUrl, 'maps');
  }

  if (normalized.baseLayerUrl) {
    normalized.baseLayerUrl = normalizeAssetUrl(normalized.baseLayerUrl, 'maps');
  }

  if (normalized.spiritLayerUrl) {
    normalized.spiritLayerUrl = normalizeAssetUrl(normalized.spiritLayerUrl, 'maps');
  }

  return normalized;
}

/**
 * Normalize a token's asset URLs
 */
export function normalizeTokenUrls(tokenData: any): any {
  const normalized = { ...tokenData };

  if (normalized.imageUrl) {
    normalized.imageUrl = normalizeAssetUrl(normalized.imageUrl, 'tokens');
  }

  return normalized;
}

/**
 * Normalize a character's asset URLs
 */
export function normalizeCharacterUrls(characterData: any): any {
  const normalized = { ...characterData };

  if (normalized.tokenImageUrl) {
    normalized.tokenImageUrl = normalizeAssetUrl(normalized.tokenImageUrl, 'tokens');
  }

  return normalized;
}
