/**
 * Asset URL Utilities — Unit Tests
 */

import {
  normalizeAssetUrl,
  normalizeMapUrls,
  normalizeTokenUrls,
  normalizeCharacterUrls,
} from './asset-urls';

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
// normalizeMapUrls
// ============================================

describe('normalizeMapUrls', () => {
  it('normalizes imageUrl', () => {
    const result = normalizeMapUrls({ imageUrl: VALID_UUID });
    expect(result.imageUrl).toBe(`/api/assets/maps/${VALID_UUID}`);
  });

  it('normalizes baseLayerUrl', () => {
    const result = normalizeMapUrls({ baseLayerUrl: VALID_UUID });
    expect(result.baseLayerUrl).toBe(`/api/assets/maps/${VALID_UUID}`);
  });

  it('normalizes spiritLayerUrl', () => {
    const result = normalizeMapUrls({ spiritLayerUrl: VALID_UUID });
    expect(result.spiritLayerUrl).toBe(`/api/assets/maps/${VALID_UUID}`);
  });

  it('does not modify unrelated fields', () => {
    const result = normalizeMapUrls({ name: 'Dungeon Level 1', imageUrl: VALID_UUID });
    expect(result.name).toBe('Dungeon Level 1');
  });

  it('leaves URL fields absent if not present in the input', () => {
    const result = normalizeMapUrls({ name: 'test' });
    expect(result.imageUrl).toBeUndefined();
    expect(result.baseLayerUrl).toBeUndefined();
  });
});

// ============================================
// normalizeTokenUrls
// ============================================

describe('normalizeTokenUrls', () => {
  it('normalizes imageUrl to tokens path', () => {
    const result = normalizeTokenUrls({ imageUrl: VALID_UUID });
    expect(result.imageUrl).toBe(`/api/assets/tokens/${VALID_UUID}`);
  });

  it('does not modify unrelated fields', () => {
    const result = normalizeTokenUrls({ name: 'Goblin', imageUrl: VALID_UUID });
    expect(result.name).toBe('Goblin');
  });
});

// ============================================
// normalizeCharacterUrls
// ============================================

describe('normalizeCharacterUrls', () => {
  it('normalizes tokenImageUrl to tokens path', () => {
    const result = normalizeCharacterUrls({ tokenImageUrl: VALID_UUID });
    expect(result.tokenImageUrl).toBe(`/api/assets/tokens/${VALID_UUID}`);
  });

  it('does not modify unrelated fields', () => {
    const result = normalizeCharacterUrls({ characterName: 'Thorin', tokenImageUrl: VALID_UUID });
    expect(result.characterName).toBe('Thorin');
  });

  it('leaves tokenImageUrl absent if not present', () => {
    const result = normalizeCharacterUrls({ characterName: 'Thorin' });
    expect(result.tokenImageUrl).toBeUndefined();
  });
});
