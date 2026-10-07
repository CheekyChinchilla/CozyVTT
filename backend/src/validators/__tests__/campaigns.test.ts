import { SPIRIT_STYLE_PATTERN } from '../../utils/styleAllowlists';
import { CampaignSettingsSchema } from '../campaignImport';
import { UpdateCampaignSchema, VibePeriodSchema } from '../campaigns';

const period = (filter: string) => ({ name: 'Dusk', hue: '#336699', filter });

describe('an atmosphere period filter', () => {
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

  it('answers a crafted 100,000-character filter within 50 ms', () => {
    const started = performance.now();
    const result = UpdateCampaignSchema.safeParse({ vibeSettings: { periods: [period(' '.repeat(100_000) + '!')] } });
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.success).toBe(false);
  });

  // Nothing after the length check looks at an over-long value.
  it('refuses an over-long filter on its length alone', () => {
    const result = VibePeriodSchema.safeParse(period(' '.repeat(300) + '!'));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('refuses a 1 MB filter within 50 ms', () => {
    const started = performance.now();
    const result = VibePeriodSchema.safeParse(period(' '.repeat(1_000_000) + '!'));
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.success).toBe(false);
  });

  it('is checked the same way in an imported campaign, 1 MB within 50 ms', () => {
    const started = performance.now();
    const result = CampaignSettingsSchema.safeParse({
      name: 'Imported',
      vibeSettings: { periods: [period(' '.repeat(1_000_000) + '!')] },
    });
    expect(performance.now() - started).toBeLessThan(50);
    // The importer drops atmosphere settings it cannot use.
    expect(result.success).toBe(true);
    expect(result.data?.vibeSettings).toBeUndefined();
  });
});

describe('a spirit layer style', () => {
  afterEach(() => jest.restoreAllMocks());

  it('refuses a 1 MB style on its length alone, within 50 ms', () => {
    const started = performance.now();
    const result = UpdateCampaignSchema.safeParse({ spiritLayerStyle: 'custom:#7c3aed' + ':'.repeat(1_000_000) });
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['too_big']);
  });

  it('is not matched against the pattern in an imported campaign when it is too long', () => {
    const test = jest.spyOn(SPIRIT_STYLE_PATTERN, 'test');
    const started = performance.now();
    const result = CampaignSettingsSchema.safeParse({ name: 'Imported', spiritLayerStyle: 'wispy'.repeat(200_000) });
    expect(performance.now() - started).toBeLessThan(50);
    expect(result.data?.spiritLayerStyle).toBeUndefined();
    expect(test).not.toHaveBeenCalled();
  });

  it('is still matched against the pattern in an imported campaign otherwise', () => {
    const test = jest.spyOn(SPIRIT_STYLE_PATTERN, 'test');
    expect(CampaignSettingsSchema.parse({ name: 'Imported', spiritLayerStyle: 'dream' }).spiritLayerStyle).toBe('dream');
    expect(test).toHaveBeenCalled();
  });
});
