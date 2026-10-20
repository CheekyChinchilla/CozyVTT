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
 * Pull the asset id out of a stored URL.
 *
 * Accepts either form the app stores — a bare UUID or a full
 * `/api/assets/{type}/{uuid}` path — and returns null when the string is
 * neither. Needed wherever the server has to look the asset row up rather than
 * just serve the URL back, e.g. to check its scope.
 *
 * @example
 * extractAssetId('/api/assets/tokens/bc5f19c0-158b-4330-a5cc-6133666a4fec')
 * // => 'bc5f19c0-158b-4330-a5cc-6133666a4fec'
 */
export function extractAssetId(url: string | null | undefined): string | null {
  if (!url) return null;

  if (isUUID(url)) return url;

  const match = url.match(/\/api\/assets\/(?:maps|tokens|avatars|audio|documents)\/([^/?#]+)/);
  if (match && isUUID(match[1])) return match[1];

  return null;
}

/**
 * An address that points at this server: a path, relative or not. Stored as
 * a picture, it is requested by every viewer's browser with their session,
 * so the only such addresses a record may hold are an asset's own.
 */
export function isSameOriginPath(url: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(url) && (url.startsWith('/') || url.includes('..') || url.includes('\\'));
}

/** Exactly `/api/assets/{dir}/{uuid}` for one of the asset directories, and nothing more. */
export function isExactAssetAddress(url: string): boolean {
  return /^\/api\/assets\/(?:maps|tokens|avatars|audio|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url);
}
