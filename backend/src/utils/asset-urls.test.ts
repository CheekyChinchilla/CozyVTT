/**
 * Asset URL Utilities — Unit Tests
 */

import { normalizeAssetUrl, extractAssetId, isExactAssetAddress, mapPictureAddress } from './asset-urls';

const VALID_UUID = 'bc5f19c0-158b-4330-a5cc-6133666a4fec';

// ============================================
// normalizeAssetUrl
// ============================================

describe('normalizeAssetUrl', () => {
  it('returns null for null input', () => {
    expect(normalizeAssetUrl(null, 'maps')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeAssetUrl(undefined, 'maps')).toBeNull();
  });

  it('returns a full path unchanged if already normalized', () => {
    const full = '/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec';
    expect(normalizeAssetUrl(full, 'maps')).toBe(full);
  });

  it('prepends the path for a bare UUID', () => {
    expect(normalizeAssetUrl(VALID_UUID, 'maps')).toBe(
      `/api/assets/maps/${VALID_UUID}`
    );
  });

  it('prepends the correct path for each asset type', () => {
    expect(normalizeAssetUrl(VALID_UUID, 'tokens')).toBe(
      `/api/assets/tokens/${VALID_UUID}`
    );
    expect(normalizeAssetUrl(VALID_UUID, 'avatars')).toBe(
      `/api/assets/avatars/${VALID_UUID}`
    );
    expect(normalizeAssetUrl(VALID_UUID, 'audio')).toBe(
      `/api/assets/audio/${VALID_UUID}`
    );
  });

  it('prepends the path for non-UUID strings as a fallback', () => {
    const result = normalizeAssetUrl('some-filename.png', 'maps');
    expect(result).toBe('/api/assets/maps/some-filename.png');
  });

  it('does not double-prepend when called twice on the same value', () => {
    const once = normalizeAssetUrl(VALID_UUID, 'maps');
    const twice = normalizeAssetUrl(once!, 'maps');
    expect(twice).toBe(once);
  });
});

// ============================================
// A map picture's address with its version
// ============================================

describe('a map picture address with a version', () => {
  const address = `/api/assets/maps/${VALID_UUID}`;

  it('is an exact asset address, read as the asset it names', () => {
    expect(isExactAssetAddress(`${address}?v=1730000000000`)).toBe(true);
    expect(extractAssetId(`${address}?v=1730000000000`)).toBe(VALID_UUID);
  });

  it('is made from an id and a version', () => {
    expect(mapPictureAddress(VALID_UUID, 1730000000000)).toBe(`${address}?v=1730000000000`);
  });

  it('carries nothing but v and digits, and only under maps', () => {
    for (const refused of [
      `${address}?v=`, `${address}?v=1a`, `${address}?v=1&x=2`, `${address}?x=1`, `${address}?V=1`,
      `${address}#v=1`, `${address}?v=1#x`, `${address}?v=12345678901234567`,
      `/api/assets/tokens/${VALID_UUID}?v=1`, `/api/assets/documents/${VALID_UUID}?v=1`,
    ]) {
      expect([refused, isExactAssetAddress(refused)]).toEqual([refused, false]);
    }
  });
});
