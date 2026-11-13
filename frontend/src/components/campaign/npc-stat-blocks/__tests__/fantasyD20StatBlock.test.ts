import { describe, it, expect } from 'vitest';
import type { NpcStatBlock } from '@/types';
import {
  FANTASY_D20_SAVES,
  FANTASY_D20_SKILLS,
  formatFantasyD20Saves,
  isFantasyD20Implausible,
  readAttributeModifiers,
  setAttributeModifier,
  setFantasyD20Bonus,
} from '../fantasyD20StatBlock';

/** A Fantasy d20 creature as its stat block prints: modifiers, level, three saves. */
const fantasyD20Creature: NpcStatBlock = {
  ac: 18,
  speed: '25 feet',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  attributeModifiers: { str: 4, dex: 2, con: 3, int: -1, wis: 1, cha: 0 },
  level: 5,
  savingThrows: { fortitude: 11, reflex: 7, will: 9 },
  skills: { Athletics: 12 },
};

describe('the Fantasy d20 structure', () => {
  it('has three saves, not six ability saves', () => {
    expect(FANTASY_D20_SAVES).toHaveLength(3);
    expect(FANTASY_D20_SAVES.map((s) => s.key)).toEqual(['fortitude', 'reflex', 'will']);
  });

  it('has the sixteen core skills', () => {
    expect(FANTASY_D20_SKILLS).toHaveLength(16);
    expect(FANTASY_D20_SKILLS).toContain('Thievery');
    expect(FANTASY_D20_SKILLS).toContain('Occultism');
    // These are 5e skills with no Fantasy d20 equivalent.
    expect(FANTASY_D20_SKILLS).not.toContain('Perception');
    expect(FANTASY_D20_SKILLS).not.toContain('Insight');
  });
});

describe('readAttributeModifiers', () => {
  // Fantasy d20 prints "Str +4" with no score behind it, so inventing one would be
  // wrong. Explicit modifiers win.
  it('uses the printed modifiers', () => {
    const mods = readAttributeModifiers(fantasyD20Creature);
    expect(mods.str).toBe(4);
    expect(mods.int).toBe(-1);
  });

  it('falls back to deriving from scores for a creature entered 5e-style', () => {
    const legacy: NpcStatBlock = {
      ...fantasyD20Creature,
      attributeModifiers: undefined,
      abilities: { ...fantasyD20Creature.abilities, str: 18, int: 8 },
    };
    const mods = readAttributeModifiers(legacy);

    expect(mods.str).toBe(4);
    expect(mods.int).toBe(-1);
  });
});

describe('setAttributeModifier', () => {
  it('stores the modifier explicitly rather than as a score', () => {
    const updated = setAttributeModifier(fantasyD20Creature, 'str', 6);

    expect(updated.attributeModifiers?.str).toBe(6);
    // The 5e score field is left alone, so switching systems back is lossless.
    expect(updated.abilities.str).toBe(10);
  });

  it('materialises the full set when only some were stored', () => {
    const bare: NpcStatBlock = { ...fantasyD20Creature, attributeModifiers: undefined };
    const updated = setAttributeModifier(bare, 'dex', 5);

    expect(updated.attributeModifiers?.dex).toBe(5);
    expect(updated.attributeModifiers?.wis).toBe(0);
  });
});

describe('setFantasyD20Bonus', () => {
  it('stores a value verbatim — nothing is derived in Fantasy d20', () => {
    const updated = setFantasyD20Bonus(fantasyD20Creature, 'savingThrows', 'fortitude', 14);
    expect(updated.savingThrows?.fortitude).toBe(14);
  });

  it('removes an entry when cleared', () => {
    const updated = setFantasyD20Bonus(fantasyD20Creature, 'skills', 'Athletics', null);
    expect(updated.skills).toBeUndefined();
  });

  it('leaves other entries alone', () => {
    const updated = setFantasyD20Bonus(fantasyD20Creature, 'savingThrows', 'will', 10);
    expect(updated.savingThrows?.fortitude).toBe(11);
  });
});

describe('isFantasyD20Implausible', () => {
  // A loose typo-catcher, not the game's benchmark table.
  it('accepts values in range for the level', () => {
    expect(isFantasyD20Implausible(12, 5)).toBe(false);
    expect(isFantasyD20Implausible(17, 5)).toBe(false); // level 5 extreme Perception
  });

  it('flags a value far too high for the level', () => {
    expect(isFantasyD20Implausible(40, 2)).toBe(true);
  });

  it('accommodates high-level creatures that legitimately exceed +30', () => {
    // A level 15 extreme skill is +33 in the published benchmarks.
    expect(isFantasyD20Implausible(33, 15)).toBe(false);
  });

  it('says nothing when the level is unknown', () => {
    expect(isFantasyD20Implausible(40, undefined)).toBe(false);
  });
});

describe('formatFantasyD20Saves', () => {
  it('prints the way a stat block does', () => {
    expect(formatFantasyD20Saves({ fortitude: 11, reflex: 7, will: 9 })).toBe(
      'Fort +11, Ref +7, Will +9'
    );
  });

  it('handles a negative modifier', () => {
    expect(formatFantasyD20Saves({ will: -1 })).toBe('Will -1');
  });

  it('omits saves that are not recorded', () => {
    expect(formatFantasyD20Saves({ fortitude: 5 })).toBe('Fort +5');
  });
});
