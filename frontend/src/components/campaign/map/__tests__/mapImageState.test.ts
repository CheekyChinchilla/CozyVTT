/**
 * What the map area shows while its picture loads.
 *
 * A map imported from an archive that left its picture out has none, and the
 * area showed "Loading map..." for good, with nothing to say what to do.
 */
import { describe, it, expect } from 'vitest';
import { mapImageState } from '../mapImageState';

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
});
