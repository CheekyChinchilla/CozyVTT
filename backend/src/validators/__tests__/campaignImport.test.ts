import { CampaignSettingsSchema, MapDataSchema, CreatureTemplateSchema, TokenTemplateImportSchema } from '../campaignImport';

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

/**
 * A token in an archive is stored as it arrives, so it is held to what the
 * live routes accept. A value outside an allowlist falls back to the default,
 * like the creature templates above, instead of refusing the whole map.
 */
describe('MapDataSchema token allowlists and limits', () => {
  const map = (token: Record<string, unknown>) => ({
    name: 'Arena', imageAssetRef: 'assets/arena.png', width: 10, height: 10, gridSize: 50, feetPerSquare: 5,
    tokens: [{ name: 'T', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, ...token }],
  });

  it('keeps a layer, type, disposition and display mode the app knows', () => {
    const t = MapDataSchema.parse(map({ layer: 'spirit', type: 'player', disposition: 'hostile', displayMode: 'full-art' })).tokens[0];
    expect([t.layer, t.type, t.disposition, t.displayMode]).toEqual(['spirit', 'player', 'hostile', 'full-art']);
  });

  it('falls back on a value outside the allowlists and still imports the token', () => {
    // 'Spirit' would vanish for players (the role filter matches exact
    // strings) and 'Hostile' would be refused the next time the DM edited
    // the token; the live routes take none of these.
    const t = MapDataSchema.parse(map({ layer: 'Spirit', type: 'Monster', disposition: 'Hostile', displayMode: 'cutout' })).tokens[0];
    expect([t.layer, t.type, t.disposition, t.displayMode]).toEqual(['token', 'npc', null, 'pog']);
  });

  it('holds a token to the live size limit, since size decides what its player can see', () => {
    expect(MapDataSchema.parse(map({ size: { width: 100, height: 100 } })).tokens[0].size).toEqual({ width: 1, height: 1 });
  });

  it('holds conditions and hit points to the live limits, one condition at a time', () => {
    const t = MapDataSchema.parse(map({ conditions: ['Prone', 'x'.repeat(100)], hp: { current: 1, max: 999999, temp: 0 } })).tokens[0];
    expect(t.conditions).toEqual(['Prone']);
    expect(t.hp).toBeNull();
  });
});

// An imported token is stored as it arrives, and Duplicate or Edit Token
// then sends it through the live routes, which require a name and a UUID for
// any link. One that fell short was refused there, long after the import.
describe('MapDataSchema token names and links', () => {
  const map = (token: Record<string, unknown>) => ({
    name: 'Arena', imageAssetRef: 'assets/arena.png', width: 10, height: 10, gridSize: 50, feetPerSquare: 5,
    tokens: [{ name: 'T', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, ...token }],
  });

  it('gives a token with no name one the live routes accept', () => {
    expect(MapDataSchema.parse(map({ name: '' })).tokens[0].name).toBe('Unnamed token');
    expect(MapDataSchema.parse(map({ name: '   ' })).tokens[0].name).toBe('Unnamed token');
    expect(MapDataSchema.parse(map({ name: ' Troll ' })).tokens[0].name).toBe('Troll');
  });

  it('drops a creature template link that is not a UUID, and keeps one that is', () => {
    expect(MapDataSchema.parse(map({ creatureTemplateId: 'template-7' })).tokens[0].creatureTemplateId).toBeNull();
    const id = '0b6f4e7c-6a55-4d4b-9c49-2c8e0d3f5a11';
    expect(MapDataSchema.parse(map({ creatureTemplateId: id })).tokens[0].creatureTemplateId).toBe(id);
  });
});

describe('TokenTemplateImportSchema allowlists', () => {
  it('keeps values the app knows', () => {
    const t = TokenTemplateImportSchema.parse({ name: 'Guard', type: 'npc', disposition: 'friendly', displayMode: 'top-down', size: { width: 2, height: 2 } });
    expect([t.type, t.disposition, t.displayMode, t.size]).toEqual(['npc', 'friendly', 'top-down', { width: 2, height: 2 }]);
  });

  it('falls back on a value outside the allowlists or limits', () => {
    // The importer applies its own defaults (object, pog, 1x1) to what is
    // dropped here.
    const t = TokenTemplateImportSchema.parse({ name: 'Guard', type: 'Monster', disposition: 'Hostile', displayMode: 'cutout', size: { width: 50, height: 50 } });
    expect(t.type).toBe('object');
    expect(t.disposition).toBeNull();
    expect(t.displayMode).toBeUndefined();
    expect(t.size).toBeUndefined();
  });
});
