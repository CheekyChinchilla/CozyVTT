import { CampaignSettingsSchema, MapDataSchema, CreatureTemplateSchema } from '../campaignImport';

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

describe('MapDataSchema tokens', () => {
  const map = {
    name: 'Arena', imageAssetRef: 'assets/arena.png', width: 10, height: 10, gridSize: 50, feetPerSquare: 5,
    tokens: [{
      name: 'Veiled', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, obscured: true,
    }],
  };

  it('keeps whether a token is obscured, so an exported campaign comes back as it was', () => {
    const parsed = MapDataSchema.parse(map);
    expect(parsed.tokens[0].obscured).toBe(true);
  });

  it('treats a token that says nothing about it as not obscured', () => {
    const parsed = MapDataSchema.parse({ ...map, tokens: [{ name: 'Plain', position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }] });
    expect(parsed.tokens[0].obscured).toBe(false);
  });
});

describe('CreatureTemplateSchema allowlist fallbacks', () => {
  const base = { name: 'Bandit', statBlock: { ac: 12, speed: '30 ft.', abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 } } };

  it('keeps a disposition and display mode the app knows', () => {
    const parsed = CreatureTemplateSchema.parse({ ...base, disposition: 'friendly', displayMode: 'top-down' });
    expect(parsed.disposition).toBe('friendly');
    expect(parsed.displayMode).toBe('top-down');
  });

  it('drops a disposition or display mode outside the allowlist and still imports the creature', () => {
    // The importer falls back to hostile and pog for a missing value; a
    // hand-edited "Hostile" is not stored as a fourth disposition.
    const parsed = CreatureTemplateSchema.parse({ ...base, disposition: 'Hostile', displayMode: 'cutout' });
    expect(parsed.name).toBe('Bandit');
    expect(parsed.disposition).toBeUndefined();
    expect(parsed.displayMode).toBeUndefined();
  });
});
