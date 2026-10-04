/**
 * An imported campaign's vibe periods must point at the imported copies of
 * their audio assets. The archive names assets by the exporting instance's
 * ids, which mean nothing here; a track left out of the export, or an old
 * free-text note, becomes no audio instead of a dangling reference.
 */

import { remapVibePeriodAudio } from '../campaignImporter';

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
