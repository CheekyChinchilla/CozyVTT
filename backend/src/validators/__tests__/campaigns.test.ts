/**
 * Atmosphere filters and spirit styles are matched against patterns, and a
 * pattern run over a megabyte of crafted text could hold the server. What
 * keeps that from happening is that an over-long value is refused on its
 * length before any pattern sees it, so that is what these check. They used
 * to time each parse against 50 ms, which a busy machine's scheduler or a
 * garbage collection could exceed on its own.
 */

import { SPIRIT_STYLE_PATTERN, VIBE_FILTER_PATTERN } from '../../utils/styleAllowlists';
import { CampaignSettingsSchema } from '../campaignImport';
import { UpdateCampaignSchema, VibePeriodSchema } from '../campaigns';

const period = (filter: string) => ({ name: 'Dusk', hue: '#336699', filter });

describe('an atmosphere period filter', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['', 'none', 'brightness(0.9) saturate(1.1)', '  contrast(1.10)  ', 'hue-rotate(-15deg)'])(
    'accepts %j, stored as sent',
    (filter) => {
      const result = VibePeriodSchema.safeParse(period(filter));
      expect(result.success).toBe(true);
      expect(result.data?.filter).toBe(filter);
    },
  );

  it.each(['url(x)', 'brightness(1) url(x)', 'blur(5px)', 'brightness(1)saturate(1)'])('refuses %j', (filter) => {
    const result = VibePeriodSchema.safeParse(period(filter));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'A period filter may only use brightness(), saturate(), contrast() and hue-rotate()',
    );
  });

  it('refuses a crafted 100,000-character filter without matching it against the pattern', () => {
    const test = jest.spyOn(VIBE_FILTER_PATTERN, 'test');
    const result = UpdateCampaignSchema.safeParse({ vibeSettings: { periods: [period(' '.repeat(100_000) + '!')] } });
    expect(result.success).toBe(false);
    expect(test).not.toHaveBeenCalled();
  });

  // Nothing after the length check looks at an over-long value.
  it('refuses an over-long filter on its length alone', () => {
    const result = VibePeriodSchema.safeParse(period(' '.repeat(300) + '!'));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('refuses a 1 MB filter without matching it against the pattern', () => {
    const test = jest.spyOn(VIBE_FILTER_PATTERN, 'test');
    const result = VibePeriodSchema.safeParse(period(' '.repeat(1_000_000) + '!'));
    expect(result.success).toBe(false);
    expect(test).not.toHaveBeenCalled();
  });

  it('still matches a filter of an ordinary length against the pattern', () => {
    const test = jest.spyOn(VIBE_FILTER_PATTERN, 'test');
    expect(VibePeriodSchema.safeParse(period('brightness(0.9)')).success).toBe(true);
    expect(test).toHaveBeenCalled();
  });

  it('is checked the same way in an imported campaign, a 1 MB filter never reaching the pattern', () => {
    const test = jest.spyOn(VIBE_FILTER_PATTERN, 'test');
    const result = CampaignSettingsSchema.safeParse({
      name: 'Imported',
      vibeSettings: { periods: [period(' '.repeat(1_000_000) + '!')] },
    });
    expect(test).not.toHaveBeenCalled();
    // The importer drops atmosphere settings it cannot use.
    expect(result.success).toBe(true);
    expect(result.data?.vibeSettings).toBeUndefined();
  });
});

describe('a spirit layer style', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses a 1 MB style on its length alone, without matching it against the pattern', () => {
    const test = jest.spyOn(SPIRIT_STYLE_PATTERN, 'test');
    const result = UpdateCampaignSchema.safeParse({ spiritLayerStyle: 'custom:#7c3aed' + ':'.repeat(1_000_000) });
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
    expect(test).not.toHaveBeenCalled();
  });

  it('is not matched against the pattern in an imported campaign when it is too long', () => {
    const test = jest.spyOn(SPIRIT_STYLE_PATTERN, 'test');
    const result = CampaignSettingsSchema.safeParse({ name: 'Imported', spiritLayerStyle: 'wispy'.repeat(200_000) });
    expect(result.data?.spiritLayerStyle).toBeUndefined();
    expect(test).not.toHaveBeenCalled();
  });

  it('is still matched against the pattern in an imported campaign otherwise', () => {
    const test = jest.spyOn(SPIRIT_STYLE_PATTERN, 'test');
    expect(CampaignSettingsSchema.parse({ name: 'Imported', spiritLayerStyle: 'dream' }).spiritLayerStyle).toBe('dream');
    expect(test).toHaveBeenCalled();
  });
});
