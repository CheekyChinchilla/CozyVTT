/**
 * When the vibe's own track comes back after an Atmosphere-panel override.
 * Stopping an override returns to the vibe's track; stopping the vibe's own
 * track means silence; a finished one-shot brings the vibe's track back on
 * the DM's say-so and on nobody else's.
 */

import { describe, it, expect } from 'vitest';
import { currentVibeTrack, stopTarget, trackEndTarget } from '../ambientFallback';
import type { VibeSettings } from '@/types';

const TRACK = '11111111-1111-4111-8111-111111111111';
const settings: VibeSettings = {
  enabled: true,
  periods: [
    { name: 'battle', hue: '#FF9966', filter: 'none', audio: TRACK },
    { name: 'camp', hue: '#FF9966', filter: 'none', audio: null },
    { name: 'legacy', hue: '#FF9966', filter: 'none', audio: 'birds_chirping.mp3' },
  ],
};

describe('currentVibeTrack', () => {
  it('names the current period track and nothing else', () => {
    expect(currentVibeTrack(settings, 'battle')).toBe(TRACK);
    expect(currentVibeTrack(settings, 'camp')).toBeNull();
    expect(currentVibeTrack(settings, 'legacy')).toBeNull();
    expect(currentVibeTrack(settings, 'unknown')).toBeNull();
    expect(currentVibeTrack(settings, null)).toBeNull();
    expect(currentVibeTrack(undefined, 'battle')).toBeNull();
  });
});

describe('stopTarget', () => {
  it('returns to the vibe track when an override stops', () => {
    expect(stopTarget(TRACK, 'other-asset')).toBe(TRACK);
  });
  it('stops outright when the vibe track itself stops, or the vibe has none', () => {
    expect(stopTarget(TRACK, TRACK)).toBeNull();
    expect(stopTarget(null, 'other-asset')).toBeNull();
  });
});

describe('trackEndTarget', () => {
  it("the DM's client re-asserts the vibe track, or clears the finished one", () => {
    expect(trackEndTarget(true, TRACK)).toEqual({ assetId: TRACK });
    expect(trackEndTarget(true, null)).toEqual({ assetId: null });
  });
  it('everyone else stays quiet', () => {
    expect(trackEndTarget(false, TRACK)).toBeNull();
  });
});
