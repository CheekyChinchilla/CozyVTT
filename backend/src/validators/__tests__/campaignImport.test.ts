import { CampaignSettingsSchema } from '../campaignImport';

/**
 * An archive's atmosphere and spirit settings are allowlisted like the live
 * write paths, but a bad value falls back to the default instead of refusing
 * the whole campaign: an archive is one file, and one field outside the
 * allowlist should not cost the maps, characters and creatures inside it.
 */
describe('CampaignSettingsSchema allowlist fallbacks', () => {
  const base = { name: 'Imported' };

  it('keeps valid atmosphere and spirit settings', () => {
    const parsed = CampaignSettingsSchema.parse({
      ...base,
      spiritLayerStyle: 'custom:#7c3aed:dream',
      vibeSettings: { periods: [{ name: 'Dusk', hue: '#FF9966', filter: 'brightness(0.85) hue-rotate(10deg)' }], extra: true },
    });
    expect(parsed.spiritLayerStyle).toBe('custom:#7c3aed:dream');
    expect(parsed.vibeSettings).toMatchObject({ extra: true });
  });

  it('drops a spirit style outside the allowlist and still imports the campaign', () => {
    const parsed = CampaignSettingsSchema.parse({ ...base, spiritLayerStyle: 'custom:url(https://evil.example/x.svg):wispy' });
    expect(parsed.name).toBe('Imported');
    expect(parsed.spiritLayerStyle).toBeUndefined();
  });

  it('drops atmosphere settings with a filter outside the allowlist', () => {
    const parsed = CampaignSettingsSchema.parse({
      ...base,
      vibeSettings: { periods: [{ name: 'Dusk', hue: '#FF9966', filter: 'url(https://evil.example/f.svg#x)' }] },
    });
    expect(parsed.vibeSettings).toBeUndefined();
  });
});
