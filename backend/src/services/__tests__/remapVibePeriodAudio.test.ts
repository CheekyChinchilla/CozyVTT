/**
 * An imported campaign's vibe periods must point at the imported copies of
 * their audio assets. The archive names assets by the exporting instance's
 * ids, which mean nothing here; a track left out of the export, or an old
 * free-text note, becomes no audio instead of a dangling reference.
 */

import { remapVibePeriodAudio, remapAtmosphereAudio } from '../campaignImporter';

const OLD = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NEW = '11111111-2222-3333-4444-555555555555';

const settings = (audio: string | null) => ({
  enabled: true,
  periods: [
    { name: 'battle', hue: '#FF9966', filter: 'none', audio },
    { name: 'camp', hue: '#FF9966', filter: 'none', audio: null },
  ],
});

describe('remapVibePeriodAudio', () => {
  it('points a period at the imported copy of its track', () => {
    const out = remapVibePeriodAudio(settings(OLD), new Map([[OLD, NEW]]));
    expect((out!.periods as Array<{ audio: string | null }>)[0].audio).toBe(NEW);
    expect((out!.periods as Array<{ audio: string | null }>)[1].audio).toBeNull();
  });

  it('drops a track the archive does not carry', () => {
    const out = remapVibePeriodAudio(settings(OLD), new Map());
    expect((out!.periods as Array<{ audio: string | null }>)[0].audio).toBeNull();
  });

  it('drops an old free-text note', () => {
    const out = remapVibePeriodAudio(settings('birds_chirping.mp3'), new Map([[OLD, NEW]]));
    expect((out!.periods as Array<{ audio: string | null }>)[0].audio).toBeNull();
  });

  it('answers null when no period names audio, so nothing is rewritten', () => {
    expect(remapVibePeriodAudio(settings(null), new Map())).toBeNull();
    expect(remapVibePeriodAudio(undefined, new Map())).toBeNull();
    expect(remapVibePeriodAudio('junk', new Map())).toBeNull();
  });
});

describe('remapAtmosphereAudio', () => {
  const vibe = (atmosphereAudio: unknown) => ({ periods: [], atmosphereAudio });

  it('points the ambient track at the imported copy, keeping its volume and looping', () => {
    expect(remapAtmosphereAudio(vibe({ assetId: OLD, volume: 0.25, loop: false }), new Map([[OLD, NEW]]))).toEqual({
      assetId: NEW, volume: 0.25, loop: false,
    });
  });

  it('drops a track the import did not bring in, or that is not an asset id', () => {
    expect(remapAtmosphereAudio(vibe({ assetId: OLD, volume: 0.5, loop: true }), new Map())).toBeUndefined();
    expect(remapAtmosphereAudio(vibe({ assetId: 'rain.mp3' }), new Map([[OLD, NEW]]))).toBeUndefined();
    expect(remapAtmosphereAudio(vibe(null), new Map([[OLD, NEW]]))).toBeUndefined();
  });

  it('holds the volume between silent and full, as the Atmosphere panel does', () => {
    expect(remapAtmosphereAudio(vibe({ assetId: OLD, volume: 7 }), new Map([[OLD, NEW]]))).toEqual({ assetId: NEW, volume: 1, loop: true });
    expect(remapAtmosphereAudio(vibe({ assetId: OLD, volume: 'loud' }), new Map([[OLD, NEW]]))?.volume).toBe(0.5);
  });
});
