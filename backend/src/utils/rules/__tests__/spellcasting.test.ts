/**
 * Spell save DC and spell attack bonus.
 *
 * Both were plain number boxes on the sheet, typed in by hand, while the same
 * sheet derived initiative and passive Perception. The templates shipped DC 8
 * and attack +0, which are wrong for every character that has ever existed —
 * the lowest legal DC at level 1 is 10.
 *
 * Formulas from the Basic Rules, "Spellcasting Ability" (page 24):
 *   Spell save DC       = 8 + proficiency bonus + spellcasting ability modifier
 *   Spell attack modifier =   proficiency bonus + spellcasting ability modifier
 *
 * Each also takes a manual adjustment, because items exist that change these
 * without changing either input, and they do not always change both — a Wand of
 * the War Mage adds to attack rolls only. That mirrors the "other bonus" the
 * sheet already offers for initiative and passive Perception.
 */

import {
  dnd5eSpellSaveDC,
  dnd5eSpellAttackBonus,
  spellcastingAbilityKey,
  spellcastingAbilityModifier,
  exhaustionLevel,
  exhaustionEffects,
  hasSpellcasting,
} from '../dnd5e';

/** A sheet with one ability score and a named spellcasting ability. */
function sheet(opts: {
  ability?: string;
  score?: number;
  proficiencyBonus?: number;
  level?: number;
  dcBonus?: number;
  attackBonus?: number;
}) {
  const { ability = 'Intelligence', score = 16, proficiencyBonus, level, dcBonus, attackBonus } = opts;
  return {
    ...(proficiencyBonus !== undefined ? { proficiencyBonus } : {}),
    ...(level !== undefined ? { level } : {}),
    stats: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 10, modifier: 0 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score, modifier: 0 },
      wisdom: { score, modifier: 0 },
      charisma: { score, modifier: 0 },
    },
    spellcasting: {
      ability,
      ...(dcBonus !== undefined ? { spellSaveDCOtherBonus: dcBonus } : {}),
      ...(attackBonus !== undefined ? { spellAttackOtherBonus: attackBonus } : {}),
    },
  };
}

describe('spellcastingAbilityKey', () => {
  it.each([
    ['Intelligence', 'intelligence'],
    ['intelligence', 'intelligence'],
    ['INT', 'intelligence'],
    ['int', 'intelligence'],
    ['Wis', 'wisdom'],
    ['  charisma  ', 'charisma'],
  ])('reads %j as %s', (input, expected) => {
    expect(spellcastingAbilityKey(input)).toBe(expected);
  });

  it.each([['', null], ['   ', null], ['nonsense', null], [undefined, null], [42, null]])(
    'reads %j as no ability',
    (input, expected) => {
      expect(spellcastingAbilityKey(input)).toBe(expected);
    }
  );
});

describe('spellcastingAbilityModifier', () => {
  it('recomputes from the score, ignoring a stale stored modifier', () => {
    const data = sheet({ ability: 'Intelligence', score: 18 });
    data.stats.intelligence.modifier = 0; // stale
    expect(spellcastingAbilityModifier(data)).toBe(4);
  });

  it('is zero when the sheet names no spellcasting ability', () => {
    expect(spellcastingAbilityModifier(sheet({ ability: '' }))).toBe(0);
  });

  it('is zero for a sheet with no stats at all', () => {
    expect(spellcastingAbilityModifier({ spellcasting: { ability: 'Intelligence' } })).toBe(0);
  });
});

describe('dnd5eSpellSaveDC', () => {
  it('is 8 + proficiency + ability modifier', () => {
    // Level 1 wizard, INT 16 (+3), proficiency +2 -> 8 + 2 + 3 = 13
    expect(dnd5eSpellSaveDC(sheet({ score: 16, proficiencyBonus: 2 }))).toBe(13);
  });

  it.each([
    [10, 2, 10], // INT 10 (+0), PB +2  -> 8 + 2 + 0
    [20, 6, 19], // INT 20 (+5), PB +6  -> 8 + 6 + 5
    [8, 2, 9], //  INT 8  (-1), PB +2  -> 8 + 2 - 1
  ])('INT %i with proficiency +%i gives DC %i', (score, proficiencyBonus, expected) => {
    expect(dnd5eSpellSaveDC(sheet({ score, proficiencyBonus }))).toBe(expected);
  });

  it('never comes out below 10 for a real level 1 caster', () => {
    // The templates shipped 8, which no character can legitimately have.
    const lowest = dnd5eSpellSaveDC(sheet({ score: 10, proficiencyBonus: 2 }));
    expect(lowest).toBeGreaterThanOrEqual(10);
  });

  it('adds a manual bonus, for items that raise it', () => {
    expect(dnd5eSpellSaveDC(sheet({ score: 16, proficiencyBonus: 2, dcBonus: 2 }))).toBe(15);
  });

  it('accepts a negative manual adjustment', () => {
    expect(dnd5eSpellSaveDC(sheet({ score: 16, proficiencyBonus: 2, dcBonus: -1 }))).toBe(12);
  });

  it('falls back to the proficiency bonus implied by level', () => {
    // No proficiencyBonus recorded; level 5 implies +3. 8 + 3 + 3 = 14.
    expect(dnd5eSpellSaveDC(sheet({ score: 16, level: 5 }))).toBe(14);
  });
});

describe('dnd5eSpellAttackBonus', () => {
  it('is proficiency + ability modifier', () => {
    expect(dnd5eSpellAttackBonus(sheet({ score: 16, proficiencyBonus: 2 }))).toBe(5);
  });

  it('is exactly the save DC minus 8, before any manual adjustment', () => {
    const data = sheet({ score: 18, proficiencyBonus: 4 });
    expect(dnd5eSpellAttackBonus(data)).toBe(dnd5eSpellSaveDC(data) - 8);
  });

  it('takes its own manual bonus, separate from the save DC', () => {
    // A Wand of the War Mage adds to attack rolls and not to the save DC, so
    // one shared adjustment would be wrong.
    const data = sheet({ score: 16, proficiencyBonus: 2, attackBonus: 2 });
    expect(dnd5eSpellAttackBonus(data)).toBe(7);
    expect(dnd5eSpellSaveDC(data)).toBe(13);
  });

  it('is the bare proficiency bonus for a sheet naming no ability', () => {
    expect(dnd5eSpellAttackBonus(sheet({ ability: '', proficiencyBonus: 3 }))).toBe(3);
  });
});

describe('sheets that are missing pieces', () => {
  it.each([undefined, null, {}, { spellcasting: {} }, 'nonsense'])(
    'does not throw for %j',
    (data) => {
      expect(() => dnd5eSpellSaveDC(data)).not.toThrow();
      expect(() => dnd5eSpellAttackBonus(data)).not.toThrow();
    }
  );
});

/**
 * Exhaustion.
 *
 * Basic Rules, Appendix A: six cumulative levels, each carrying every level
 * below it, with level 6 being death. It used to be a single checkbox in the
 * conditions list, which cannot record which level a character is on.
 */
describe('exhaustion', () => {
  it.each([
    [0, []],
    [1, ['Disadvantage on ability checks']],
    [2, ['Disadvantage on ability checks', 'Speed halved']],
  ])('level %i lists %j', (level, expected) => {
    expect(exhaustionEffects(level)).toEqual(expected);
  });

  it('is cumulative — level 3 carries levels 1 and 2', () => {
    expect(exhaustionEffects(3)).toEqual([
      'Disadvantage on ability checks',
      'Speed halved',
      'Disadvantage on attack rolls and saving throws',
    ]);
  });

  it('level 6 is death, and lists all six', () => {
    const effects = exhaustionEffects(6);
    expect(effects).toHaveLength(6);
    expect(effects[5]).toBe('Death');
  });

  it('clamps a level above 6 rather than reading past the end', () => {
    expect(exhaustionLevel(9)).toBe(6);
    expect(exhaustionEffects(9)).toHaveLength(6);
  });

  it('treats a negative level as none', () => {
    expect(exhaustionLevel(-2)).toBe(0);
    expect(exhaustionEffects(-2)).toEqual([]);
  });

  it.each([undefined, null, 'three', NaN, {}])('reads %j as no exhaustion', (value) => {
    expect(exhaustionLevel(value)).toBe(0);
    expect(exhaustionEffects(value)).toEqual([]);
  });

  it('truncates a fractional level', () => {
    expect(exhaustionLevel(2.7)).toBe(2);
  });
});

/**
 * Whether the sheet should show a spellcasting panel at all.
 *
 * `data.spellcasting` is an object on every sheet, so testing it for truth gave
 * a barbarian one — reading "Wizard Spellcasting", because the templates seeded
 * that class into every character.
 */
describe('hasSpellcasting', () => {
  it('is false for a sheet with an empty spellcasting block', () => {
    expect(
      hasSpellcasting({ spellcasting: { class: '', ability: '', cantrips: [], spells: [] } })
    ).toBe(false);
  });

  it('is false when there is no spellcasting block at all', () => {
    expect(hasSpellcasting({})).toBe(false);
    expect(hasSpellcasting(null)).toBe(false);
  });

  it('is true once an ability is named', () => {
    expect(hasSpellcasting({ spellcasting: { ability: 'Intelligence' } })).toBe(true);
  });

  it('is true for a cantrip, even with no ability recorded', () => {
    expect(hasSpellcasting({ spellcasting: { cantrips: ['Fire Bolt'] } })).toBe(true);
  });

  it('is true for a spell', () => {
    expect(hasSpellcasting({ spellcasting: { spells: [{ name: 'Shield' }] } })).toBe(true);
  });

  it('is true for a slot, and false when every slot is zero', () => {
    expect(hasSpellcasting({ spellcasting: { slots: { '1': { total: 2, expended: 0 } } } })).toBe(true);
    expect(hasSpellcasting({ spellcasting: { slots: { '1': { total: 0, expended: 0 } } } })).toBe(false);
  });
});
