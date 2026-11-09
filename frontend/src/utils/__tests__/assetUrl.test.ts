/**
 * Reading the asset a stored picture address names.
 *
 * A drawn map's picture is written over in place by each save in Paint, and
 * the map is given its address with a new version,
 * `/api/assets/maps/<id>?v=<n>`, so every open table loads the new picture.
 * The version names the same asset: the Map Library's thumbnail, Edit Map's
 * picked picture, Paint's own checks and the delete of a drawn map's picture
 * all read the id without it.
 */

import { describe, it, expect } from 'vitest';
import { assetAddressVersion, extractAssetId } from '../assetUrl';

const ID = 'bc5f19c0-158b-4330-a5cc-6133666a4fec';

describe('extractAssetId', () => {
  it('reads the id of an address, a bare id and a versioned map picture alike', () => {
    expect(extractAssetId(`/api/assets/maps/${ID}`)).toBe(ID);
    expect(extractAssetId(ID)).toBe(ID);
    expect(extractAssetId(`/api/assets/maps/${ID}?v=1730000000000`)).toBe(ID);
  });

  it('answers null for nothing', () => {
    expect(extractAssetId('')).toBeNull();
    expect(extractAssetId(null)).toBeNull();
  });
});

describe('assetAddressVersion', () => {
  it("is a map picture address's version, for an address made from its id", () => {
    expect(assetAddressVersion(`/api/assets/maps/${ID}?v=1730000000000`)).toBe('?v=1730000000000');
  });

  it('is empty for an address with none, or with any other query', () => {
    expect(assetAddressVersion(`/api/assets/maps/${ID}`)).toBe('');
    expect(assetAddressVersion(`/api/assets/maps/${ID}?x=1`)).toBe('');
    expect(assetAddressVersion(null)).toBe('');
  });
});
