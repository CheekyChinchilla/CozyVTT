/**
 * The transforms that move sheets onto the fields the app reads, used by the
 * one-off migration and by every character save.
 *
 * This edits players' characters in place, so what matters is not that it
 * moves the right things but that it cannot lose anything. Each transform is
 * checked against a sheet that has already been edited by hand — the case where
 * a careless merge would overwrite somebody's work with a template default.
 */

import {
  migrateDnD5e,
  migratePathfinder2e,
  migrateCallOfCthulhu,
  migrateLegacySheetFields,
} from '../sheetFieldMigrations';

/** Run a transform and return just the sheet. */
const run = (fn: (s: Record<string, unknown>, n: string[]) => Record<string, unknown>) =>
  (sheet: Record<string, unknown>) => fn(sheet, []);

const dnd = run(migrateDnD5e);
const pf2e = run(migratePathfinder2e);
const coc = run(migrateCallOfCthulhu);

describe('D&D 5e', () => {
  it('keeps a hand-typed feature list and appends what was hidden', () => {
    const out = dnd({
      featuresAndTraits: ['NakuDama-Amphibious', 'Aspiring Shadow Warrior'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
    });

    expect(out.featuresAndTraits).toEqual([
      { name: 'NakuDama-Amphibious', description: '' },
      { name: 'Aspiring Shadow Warrior', description: '' },
      { name: 'Second Wind', description: 'Regain 1d10.' },
    ]);
    expect(out).not.toHaveProperty('features');
  });

  it('never splits a typed name to invent a description', () => {
    const out = dnd({ featuresAndTraits: ['Fighting Style: Defense', 'Rage (2/day)'] });
    expect(out.featuresAndTraits).toEqual([
      { name: 'Fighting Style: Defense', description: '' },
      { name: 'Rage (2/day)', description: '' },
    ]);
  });

  it('folds proficiencies and languages into one list without duplicating', () => {
    const out = dnd({
      proficiencies: ['All armor', 'Simple weapons'],
      languages: ['Common', 'Dwarvish'],
      proficienciesAndLanguages: ['All armor'],
    });

    expect(out.proficienciesAndLanguages).toEqual([
      'All armor',
      'Simple weapons',
      'Common',
      'Dwarvish',
    ]);
    expect(out).not.toHaveProperty('proficiencies');
    expect(out).not.toHaveProperty('languages');
  });

  /**
   * The merge decided it had achieved something by comparing list lengths, which
   * is not the same question. A destination already holding a case-variant
   * duplicate, or an entry that is not a string, makes the deduplicated result
   * no longer than what was there — so the merge was judged a no-op and skipped,
   * while the source fields were deleted anyway.
   *
   * Unlike the template-versus-typed cases below, nothing is redundant here:
   * these entries exist nowhere else afterwards.
   */
  it('keeps a new language when the destination already holds a duplicate', () => {
    const out = dnd({
      proficienciesAndLanguages: ['Common', 'common'],
      proficiencies: ['Elvish'],
    });

    expect(out.proficienciesAndLanguages).toContain('Elvish');
    expect(out).not.toHaveProperty('proficiencies');
  });

  it('keeps a new language when the destination holds something malformed', () => {
    const out = dnd({
      proficienciesAndLanguages: [{ not: 'a string' }, 'Common'],
      languages: ['Draconic'],
    });

    expect(out.proficienciesAndLanguages).toContain('Draconic');
    // And the malformed entry is left where it was rather than filtered away.
    expect(out.proficienciesAndLanguages).toContainEqual({ not: 'a string' });
    expect(out).not.toHaveProperty('languages');
  });

  it('keeps a source entry it cannot merge rather than dropping it', () => {
    // A non-string in the source has nowhere to go in a list of strings. It
    // stays put instead of vanishing.
    const out = dnd({ languages: [{ tongue: 'Druidic' }] });
    expect(out.languages).toEqual([{ tongue: 'Druidic' }]);
  });

  it('adds old languages to the Languages box of a sheet that has the four boxes', () => {
    // A 1.2.2 sheet edited on 1.3.0 or 1.4.0: the editor wrote the boxes and
    // left the old `languages` beside them. The boxes are what the sheet shows,
    // so a language only in the flat list would be invisible, then gone at the
    // next save, which rebuilds the flat list from the boxes.
    const out = dnd({
      proficiencies: { armor: '', weapons: '', tools: '', languages: 'Elvish' },
      languages: ['Common', 'elvish'],
      proficienciesAndLanguages: ['Elvish'],
    });

    expect(out.proficiencies).toEqual({ armor: '', weapons: '', tools: '', languages: 'Elvish, Common' });
    expect(out.proficienciesAndLanguages).toEqual(['Elvish', 'Common']);
    expect(out).not.toHaveProperty('languages');
  });

  it('leaves the editor structured proficiencies object alone', () => {
    // The editor binds four text boxes to an object of this shape and folds it
    // into proficienciesAndLanguages itself on save. Only the flat template
    // array is the migration's business.
    const structured = { armor: 'Plate', weapons: 'Longsword', tools: '', languages: 'Common' };
    const out = dnd({ proficiencies: structured });
    expect(out.proficiencies).toEqual(structured);
  });

  it('does not overwrite personality the player has already written, and keeps the older text after it', () => {
    const notes: string[] = [];
    const out = migrateDnD5e({
      personalityTraits: 'From the template.',
      ideals: 'Template ideal.',
      bonds: 'Same text.',
      personality: { traits: 'Mine, thanks.', bonds: 'same text.' },
    }, notes);

    expect(out.personality).toEqual({
      traits: 'Mine, thanks.\n\nFrom the template.',
      ideals: 'Template ideal.',
      bonds: 'same text.',
    });
    for (const old of ['personalityTraits', 'ideals', 'bonds']) expect(out).not.toHaveProperty(old);
    expect(notes.join('; ')).toMatch(/added 1 older personality field\(s\) after/);
  });

  it('does not overwrite an allies entry the player has written, and keeps the older text after it', () => {
    const out = dnd({
      allies: 'Template allies',
      alliesAndOrganizations: { name: 'The Harpers', description: 'Old friends' },
    });
    expect(out.alliesAndOrganizations).toEqual({
      name: 'The Harpers',
      description: 'Old friends\n\nTemplate allies',
    });
    expect(out).not.toHaveProperty('allies');
  });

  it('drops an allies entry the sheet already holds', () => {
    const out = dnd({ allies: 'The Harpers', alliesAndOrganizations: { name: 'the harpers' } });
    expect(out.alliesAndOrganizations).toEqual({ name: 'the harpers' });
    expect(out).not.toHaveProperty('allies');
  });

  it('keeps template features whose description differs from the player\'s', () => {
    const out = dnd({
      featuresAndTraits: [{ name: 'Second Wind', description: 'My note.' }],
      features: [{ name: 'Second Wind', description: 'Regain 1d10 + level.' }],
    });
    expect(out.featuresAndTraits).toEqual([
      { name: 'Second Wind', description: 'My note.' },
      { name: 'Second Wind', description: 'Regain 1d10 + level.' },
    ]);
    expect(out).not.toHaveProperty('features');
  });

  it('keeps a features field holding an entry it cannot read', () => {
    const notes: string[] = [];
    const out = migrateDnD5e({ features: [{ name: 'Second Wind' }, { description: 'No name, but text.' }] }, notes);
    expect(out.featuresAndTraits).toEqual([{ name: 'Second Wind', description: '' }]);
    expect(out.features).toEqual([{ name: 'Second Wind' }, { description: 'No name, but text.' }]);
    expect(notes.join('; ')).toMatch(/kept 'features'/);
  });

  it('leaves a sheet with nothing to move untouched', () => {
    const sheet = { characterName: 'Nakudama', level: 3 };
    expect(dnd(sheet)).toEqual(sheet);
  });

  it('is idempotent', () => {
    const once = dnd({
      featuresAndTraits: ['NakuDama-Frog Leap'],
      features: [{ name: 'Second Wind', description: 'Regain 1d10.' }],
      proficiencies: ['All armor'],
      languages: ['Common'],
      personalityTraits: 'Brave.',
      allies: 'The unit',
    });
    expect(dnd(once)).toEqual(once);
    expect(dnd(dnd(once))).toEqual(once);
  });
});

describe('Pathfinder 2e', () => {
  it('moves attacks to strikes, mapping the melee/ranged word to type', () => {
    const out = pf2e({
      attacks: [
        { name: 'Warhammer', range: 'melee', attackBonus: 7, damageRoll: '1d8+3' },
        { name: 'Crossbow', range: 'ranged', attackBonus: 5, damageRoll: '1d8' },
      ],
    });

    expect(out.strikes).toEqual([
      { name: 'Warhammer', type: 'melee', attackBonus: 7, damageRoll: '1d8+3' },
      { name: 'Crossbow', type: 'ranged', attackBonus: 5, damageRoll: '1d8' },
    ]);
    expect(out).not.toHaveProperty('attacks');
  });

  it('keeps the strikes the player already has and adds the template attacks after them', () => {
    const notes: string[] = [];
    const mine = [{ name: 'Longsword', type: 'melee', attackBonus: 8 }];
    const out = migratePathfinder2e({
      strikes: mine,
      attacks: [
        { name: 'longsword', range: 'melee', attackBonus: 7 },
        { name: 'Shortbow', range: 'ranged', attackBonus: 5 },
      ],
    }, notes);
    expect(out.strikes).toEqual([...mine, { name: 'Shortbow', type: 'ranged', attackBonus: 5 }]);
    expect(out).not.toHaveProperty('attacks');
    expect(notes.join('; ')).toMatch(/moved 1 attack\(s\) to strikes/);
  });

  it('keeps attacks it cannot move', () => {
    const notes: string[] = [];
    const attacks = [{ name: 'Warhammer', range: 'melee' }, 'Kick', { damageRoll: '1d4' }];
    const out = migratePathfinder2e({ strikes: [{ name: 'Fist' }], attacks }, notes);
    expect(out.strikes).toEqual([{ name: 'Fist' }, { name: 'Warhammer', type: 'melee' }]);
    expect(out.attacks).toEqual(attacks);
    expect(notes.join('; ')).toMatch(/kept 'attacks'/);
  });

  it('keeps a specialAbilities field that is not a list', () => {
    const out = pf2e({ specialAbilities: 'Shield Block' });
    expect(out.specialAbilities).toBe('Shield Block');
  });

  it('adds a top-level sense, resistance or immunity the nested list lacks before dropping it', () => {
    const notes: string[] = [];
    const out = migratePathfinder2e({
      senses: ['Darkvision (60 feet)', 'darkvision'],
      resistances: ['cold 5'],
      hp: { maximum: 21, resistances: [], immunities: [] },
      perception: { bonus: 6, senses: ['Darkvision'] },
    }, notes);
    expect((out.perception as { senses: string[] }).senses).toEqual(['Darkvision', 'Darkvision (60 feet)']);
    expect((out.hp as { resistances: string[] }).resistances).toEqual(['cold 5']);
    expect(out).not.toHaveProperty('senses');
    expect(out).not.toHaveProperty('resistances');
  });

  it('keeps a top-level list with nowhere to go', () => {
    const out = pf2e({ senses: ['Darkvision'] });
    expect(out.senses).toEqual(['Darkvision']);
  });

  it('moves special abilities into class features, keeping descriptions', () => {
    const out = pf2e({
      specialAbilities: [
        { name: 'Attack of Opportunity', description: 'Strike a creature that moves past.' },
      ],
      classFeatures: ['Bravery'],
    });

    expect(out.classFeatures).toEqual([
      { name: 'Bravery', description: '' },
      { name: 'Attack of Opportunity', description: 'Strike a creature that moves past.' },
    ]);
    expect(out).not.toHaveProperty('specialAbilities');
  });

  it('adds only the special abilities class features do not already hold', () => {
    const out = pf2e({
      specialAbilities: [{ name: 'Shield Block', description: '' }, { name: 'Bravery', description: 'Will save +1.' }],
      classFeatures: [{ name: 'Shield Block', description: 'Mine.' }, 'Bravery'],
    });
    expect(out.classFeatures).toEqual([{ name: 'Shield Block', description: 'Mine.' }, { name: 'Bravery', description: 'Will save +1.' }]);
  });

  it('drops the stray top-level copies but keeps the nested ones', () => {
    const out = pf2e({
      senses: ['Darkvision'],
      resistances: ['fire 5'],
      immunities: ['poison'],
      hp: { maximum: 21, resistances: ['fire 5'], immunities: ['poison'] },
      perception: { bonus: 6, senses: ['Darkvision'] },
    });

    expect(out).not.toHaveProperty('senses');
    expect(out).not.toHaveProperty('resistances');
    expect(out).not.toHaveProperty('immunities');
    expect(out.hp).toEqual({ maximum: 21, resistances: ['fire 5'], immunities: ['poison'] });
    expect(out.perception).toEqual({ bonus: 6, senses: ['Darkvision'] });
  });

  it('is idempotent', () => {
    const once = pf2e({
      attacks: [{ name: 'Warhammer', range: 'melee' }],
      specialAbilities: [{ name: 'Shield Block', description: 'Prevent damage.' }],
      senses: ['Darkvision'],
    });
    expect(pf2e(once)).toEqual(once);
  });
});

describe('Call of Cthulhu 7e', () => {
  it('moves player to playerName', () => {
    const out = coc({ player: 'Tyke' });
    expect(out.playerName).toBe('Tyke');
    expect(out).not.toHaveProperty('player');
  });

  it('does not overwrite a playerName that is already set, and keeps the other name', () => {
    const notes: string[] = [];
    const out = migrateCallOfCthulhu({ player: 'Old', playerName: 'Current' }, notes);
    expect(out.playerName).toBe('Current');
    expect(out.player).toBe('Old');
    expect(notes.join('; ')).toMatch(/kept 'player'/);
  });

  it('drops a player that matches playerName', () => {
    const out = coc({ player: 'tyke', playerName: 'Tyke' });
    expect(out).not.toHaveProperty('player');
  });

  it('drops a blank player rather than writing an empty name', () => {
    // The schema requires a non-empty name when the field is present, so an
    // empty string here would make the sheet fail to save.
    const out = coc({ player: '' });
    expect(out).not.toHaveProperty('player');
    expect(out).not.toHaveProperty('playerName');
  });

  it('is idempotent', () => {
    const once = coc({ player: 'Tyke' });
    expect(coc(once)).toEqual(once);
  });
});

describe('migrateLegacySheetFields', () => {
  it('returns a sheet with no older fields as it was sent', () => {
    const sheet = { characterName: 'Aldra', featuresAndTraits: ['  Second Wind  '] };
    expect(migrateLegacySheetFields('DND_5E', sheet)).toBe(sheet);
  });

  it('moves the older fields of the system it is given', () => {
    expect(migrateLegacySheetFields('CALL_OF_CTHULHU_7E', { player: 'Pat' })).toEqual({ playerName: 'Pat' });
    expect(migrateLegacySheetFields('PATHFINDER_2E', { attacks: [{ name: 'Bow', range: 'ranged' }] })).toEqual({
      strikes: [{ name: 'Bow', type: 'ranged' }],
    });
  });

  it('leaves anything that is not a sheet, or has no system, alone', () => {
    expect(migrateLegacySheetFields('DND_5E', null)).toBeNull();
    expect(migrateLegacySheetFields('DND_5E', ['features'])).toEqual(['features']);
    const sheet = { player: 'Pat' };
    expect(migrateLegacySheetFields(null, sheet)).toBe(sheet);
    expect(migrateLegacySheetFields('SHADOWRUN_6E', sheet)).toBe(sheet);
  });
});
