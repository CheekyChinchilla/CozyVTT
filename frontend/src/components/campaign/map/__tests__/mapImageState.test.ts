/**
 * What the map area shows while its picture loads.
 *
 * A map imported from an archive that left its picture out has none, and the
 * area showed "Loading map..." for good, with nothing to say what to do.
 */
import { describe, it, expect } from 'vitest';
import { mapImageState, pictureFor } from '../mapImageState';

describe('mapImageState', () => {
  it('says there is no map when none is loaded', () => {
    expect(mapImageState(null, false, null)).toBe('none');
  });

  it('says the map has no picture, instead of loading for ever', () => {
    expect(mapImageState({ imageUrl: '' }, false, null)).toBe('missing');
    expect(mapImageState({ imageUrl: null }, false, null)).toBe('missing');
  });

  it('is loading until the picture arrives, then ready', () => {
    expect(mapImageState({ imageUrl: '/api/assets/maps/x' }, false, null)).toBe('loading');
    expect(mapImageState({ imageUrl: '/api/assets/maps/x' }, true, null)).toBe('ready');
  });

  it('reports a picture that failed to load', () => {
    expect(mapImageState({ imageUrl: '/api/assets/maps/x' }, false, 'Failed to load map image')).toBe('error');
  });

  it('reports a new picture that failed to load while the one before it is still drawn', () => {
    expect(mapImageState({ imageUrl: '/api/assets/maps/y' }, true, 'Failed to load map image')).toBe('kept');
  });
});

describe('pictureFor', () => {
  const loaded = { mapId: 'map-a', url: '/api/assets/maps/x', image: 'picture x' };

  it('draws a map on its own picture', () => {
    expect(pictureFor(loaded, { id: 'map-a', imageUrl: '/api/assets/maps/x' })).toBe('picture x');
  });

  it('keeps a map on its previous picture while a new one loads', () => {
    expect(pictureFor(loaded, { id: 'map-a', imageUrl: '/api/assets/maps/y' })).toBe('picture x');
  });

  it("never draws another map on the last map's picture", () => {
    expect(pictureFor(loaded, { id: 'map-b', imageUrl: '/api/assets/maps/y' })).toBeNull();
  });

  it('draws another map at the same address on that picture', () => {
    expect(pictureFor(loaded, { id: 'map-b', imageUrl: '/api/assets/maps/x' })).toBe('picture x');
  });

  it('draws nothing for a map with no picture, or before any has loaded', () => {
    expect(pictureFor(loaded, { id: 'map-a', imageUrl: '' })).toBeNull();
    expect(pictureFor(loaded, null)).toBeNull();
    expect(pictureFor(null, { id: 'map-a', imageUrl: '/api/assets/maps/x' })).toBeNull();
  });
});
