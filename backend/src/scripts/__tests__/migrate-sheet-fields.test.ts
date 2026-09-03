/**
 * The one-off migration that moves sheets onto the fields the app reads.
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
} from '../migrate-sheet-fields';

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

  it('leaves the editor structured proficiencies object alone', () => {
    // The editor binds four text boxes to an object of this shape and folds it
    // into proficienciesAndLanguages itself on save. Only the flat template
    // array is the migration's business.
    const structured = { armor: 'Plate', weapons: 'Longsword', tools: '', languages: 'Common' };
    const out = dnd({ proficiencies: structured });
    expect(out.proficiencies).toEqual(structured);
  });

  it('does not overwrite personality the player has already written', () => {
    const out = dnd({
      personalityTraits: 'From the template.',
      ideals: 'Template ideal.',
      personality: { traits: 'Mine, thanks.' },
    });

    expect(out.personality).toEqual({
      traits: 'Mine, thanks.',
      ideals: 'Template ideal.',
    });
    expect(out).not.toHaveProperty('personalityTraits');
  });

  it('does not overwrite an allies entry the player has written', () => {
    const out = dnd({
      allies: 'Template allies',
      alliesAndOrganizations: { name: 'The Harpers', description: 'Old friends' },
    });
    expect(out.alliesAndOrganizations).toEqual({
      name: 'The Harpers',
      description: 'Old friends',
    });
    expect(out).not.toHaveProperty('allies');
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

  it('does not clobber strikes the player already has', () => {
    const mine = [{ name: 'Mine', type: 'melee' }];
    const out = pf2e({ strikes: mine, attacks: [{ name: 'From the template' }] });
    expect(out.strikes).toEqual(mine);
    expect(out).not.toHaveProperty('attacks');
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

  it('does not overwrite a playerName that is already set', () => {
    const out = coc({ player: 'Old', playerName: 'Current' });
    expect(out.playerName).toBe('Current');
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
