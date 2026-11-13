/**
 * Initiative rules, per system.
 *
 * Every initiative roll in the app used to be a flat `1d20` regardless of
 * character or system, so a Dexterity 20 rogue and a Dexterity 8 wizard rolled
 * the same thing. These pin what each system actually does, including the two
 * cases that are easy to get wrong: Horror d100 does not roll for initiative
 * at all, and a 5E character's bonus is not only Dexterity.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { rollDice } from '../dice-parser';
import {
  fifthEditionBackfilledInitiativeBonus,
  fifthEditionInitiativeAdvantage,
  fifthEditionInitiativeModifier,
  fantasyD20InitiativeBonus,
  resolveCharacterInitiative,
  resolveStatBlockInitiative,
} from '../rules/initiative';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fifthEdition = (dexScore: number, initiativeBonus?: number, extra: object = {}) => ({
  stats: {
    strength: { score: 10, modifier: 0 },
    dexterity: { score: dexScore, modifier: Math.floor((dexScore - 10) / 2) },
    constitution: { score: 10, modifier: 0 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 10, modifier: 0 },
    charisma: { score: 10, modifier: 0 },
  },
  ...(initiativeBonus === undefined ? {} : { initiativeBonus }),
  ...extra,
});

// A level 1 character trained in Perception and Stealth (+3 each), with the
// Wisdom and Dexterity that make up the totals asked for. The totals are
// worked out from these parts; the stored `bonus` is left at 0 to show it is
// not read.
const fantasyD20 = (usedStat: string, perceptionBonus: number, stealthBonus: number) => ({
  level: 1,
  attributes: { wisdom: { modifier: perceptionBonus - 3 }, dexterity: { modifier: stealthBonus - 3 } },
  initiative: { usedStat, bonus: 0 },
  perception: { proficiencyRank: 'trained', itemBonus: 0, bonus: 0, senses: [] },
  skills: {
    stealth: { attribute: 'dexterity', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
  },
});

const horrorD100 = (dex: number) => ({
  characteristics: { STR: 10, CON: 10, SIZ: 10, INT: 10, POW: 10, DEX: dex, CHA: 10 },
});

// ---------------------------------------------------------------------------
// 5E
// ---------------------------------------------------------------------------

describe('5E initiative', () => {
  // The example from the bug report, verbatim.
  it('is d20 plus the Dexterity modifier', () => {
    expect(fifthEditionInitiativeModifier(fifthEdition(14))).toBe(2);
    const resolved = resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(14));
    expect(resolved).toEqual({ kind: 'roll', expression: '1d20+2', label: '1d20+2' });
  });

  it.each([
    [8, -1],
    [10, 0],
    [14, 2],
    [15, 2],
    [20, 5],
  ])('Dexterity %i gives %i', (score, expected) => {
    expect(fifthEditionInitiativeModifier(fifthEdition(score))).toBe(expected);
  });

  it('adds the manual bonus for feats and class features', () => {
    // A feat's flat +5 on top of Dexterity.
    expect(fifthEditionInitiativeModifier(fifthEdition(14, 5))).toBe(7);
    expect(resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(14, 5))).toMatchObject({ expression: '1d20+7' });
  });

  it('formats a negative total correctly', () => {
    expect(resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(8))).toMatchObject({ expression: '1d20-1' });
  });

  it('recomputes the modifier from the score, ignoring a stale stored one', () => {
    const stale = fifthEdition(20);
    stale.stats.dexterity.modifier = 0; // as if the score changed and this lagged
    expect(fifthEditionInitiativeModifier(stale)).toBe(5);
  });

  it('falls back to the stored modifier when no score is recorded', () => {
    const modOnly = { stats: { dexterity: { modifier: 3 } } };
    expect(fifthEditionInitiativeModifier(modOnly)).toBe(3);
  });
});

describe('5E migration of hand-typed initiative', () => {
  // The case that protects existing characters: initiative used to be one
  // hand-typed number. Deriving it must not quietly change anyone's total.
  it('reads a stored total as Dexterity plus a manual bonus', () => {
    // A character with a feat's +5, Dexterity 14, typed 7 by hand.
    const legacy = fifthEdition(14, undefined, { initiative: 7 });
    expect(fifthEditionBackfilledInitiativeBonus(legacy)).toBe(5);

    // And the total is unchanged once that bonus is applied.
    const migrated = { ...legacy, initiativeBonus: 5 };
    expect(fifthEditionInitiativeModifier(migrated)).toBe(7);
  });

  it('yields a zero bonus for a character whose total was just Dexterity', () => {
    expect(fifthEditionBackfilledInitiativeBonus(fifthEdition(14, undefined, { initiative: 2 }))).toBe(0);
  });

  // Caught in the browser: the sheet showed +7 while the dice rolled +2, because
  // the conversion only happened in the editor and the character had not been
  // re-saved. The roll has to read a legacy total the same way the sheet does.
  it('rolls a legacy character\'s full total without waiting for a re-save', () => {
    const legacy = fifthEdition(14, undefined, { initiative: 7 });
    expect(fifthEditionInitiativeModifier(legacy)).toBe(7);
    expect(resolveCharacterInitiative('FIFTH_EDITION', legacy)).toMatchObject({ expression: '1d20+7' });
  });

  it('prefers an explicit bonus over a stale stored total', () => {
    // Once the field exists it is authoritative — a stored total left over from
    // before must not override what the sheet now says.
    const migrated = fifthEdition(14, 5, { initiative: 999 });
    expect(fifthEditionInitiativeModifier(migrated)).toBe(7);
  });

  it('prefers an explicit zero bonus over a stored total', () => {
    // `0` is a real answer, not "unset" — someone who cleared the box means it.
    const cleared = fifthEdition(14, 0, { initiative: 7 });
    expect(fifthEditionInitiativeModifier(cleared)).toBe(2);
  });

  it('handles a stored total lower than the Dexterity modifier', () => {
    // Nothing in the rules produces this, but a hand-typed field can hold it and
    // the total still must not move.
    const legacy = fifthEdition(20, undefined, { initiative: 1 });
    expect(fifthEditionBackfilledInitiativeBonus(legacy)).toBe(-4);
    expect(fifthEditionInitiativeModifier({ ...legacy, initiativeBonus: -4 })).toBe(1);
  });

  it('leaves a character alone once the field exists', () => {
    expect(fifthEditionBackfilledInitiativeBonus(fifthEdition(14, 5, { initiative: 7 }))).toBeNull();
    expect(fifthEditionBackfilledInitiativeBonus(fifthEdition(14, 0, { initiative: 7 }))).toBeNull();
  });

  it('leaves a character with no stored initiative alone', () => {
    expect(fifthEditionBackfilledInitiativeBonus(fifthEdition(14))).toBeNull();
  });

  // Blank sheets ship `initiative: 0`, and the old field was typed by hand, so
  // plenty of characters never touched it. Reading that as a real total would
  // back-derive minus their Dexterity modifier and leave them rolling flat.
  it('treats a stored zero as never-filled-in rather than a real total', () => {
    const untouched = fifthEdition(16, undefined, { initiative: 0 });   // Dexterity +3
    expect(fifthEditionBackfilledInitiativeBonus(untouched)).toBeNull();
    expect(fifthEditionInitiativeModifier(untouched)).toBe(3);
    expect(resolveCharacterInitiative('FIFTH_EDITION', untouched)).toMatchObject({ expression: '1d20+3' });
  });
});

describe('5E advantage on initiative', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  /** Dice that come up 5, then 17, on a d20. */
  const fiveThenSeventeen = () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
  };

  it('rolls two d20s and keeps the higher when the sheet says so', () => {
    const sheet = fifthEdition(14, undefined, { initiativeAdvantage: true });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('advantage');
    expect(resolveCharacterInitiative('FIFTH_EDITION', sheet))
      .toEqual({ kind: 'roll', expression: '2d20kh1+2', label: '2d20kh1+2' });
  });

  it('keeps the higher die when rolled, and the modifier with it', () => {
    fiveThenSeventeen();
    const resolved = resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(14, 1, { initiativeAdvantage: true }));
    const rolled = rollDice((resolved as { expression: string }).expression);
    expect(rolled.rolls[0]).toMatchObject({ results: [5, 17], kept: [17] });
    expect(rolled.total).toBe(20);
  });

  it('rolls one d20 when the box is off', () => {
    fiveThenSeventeen();
    const sheet = fifthEdition(14, 1, { initiativeAdvantage: false });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('none');
    const resolved = resolveCharacterInitiative('FIFTH_EDITION', sheet);
    expect(resolved).toEqual({ kind: 'roll', expression: '1d20+3', label: '1d20+3' });
    expect(rollDice((resolved as { expression: string }).expression).total).toBe(8);
  });

  it('rolls a sheet stored before the box existed as it always did', () => {
    const stored = fifthEdition(14);
    expect('initiativeAdvantage' in stored).toBe(false);
    expect(fifthEditionInitiativeAdvantage(stored)).toBe('none');
    expect(resolveCharacterInitiative('FIFTH_EDITION', stored)).toEqual({ kind: 'roll', expression: '1d20+2', label: '1d20+2' });
  });

  it('keeps a negative modifier', () => {
    expect(resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(8, undefined, { initiativeAdvantage: true })))
      .toMatchObject({ expression: '2d20kh1-1' });
  });

  it('reads only true as the box ticked', () => {
    for (const stored of ['yes', 1, 'true', null]) {
      expect(resolveCharacterInitiative('FIFTH_EDITION', fifthEdition(14, undefined, { initiativeAdvantage: stored })))
        .toMatchObject({ expression: '1d20+2' });
    }
  });

  // Advantage and disadvantage together cancel to one d20. A level of
  // exhaustion and the poisoned condition each give disadvantage on every
  // ability check, and initiative is a Dexterity check.
  it('is cancelled by a level of exhaustion', () => {
    const sheet = fifthEdition(14, undefined, { initiativeAdvantage: true, exhaustionLevel: 1 });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('cancelled');
    expect(resolveCharacterInitiative('FIFTH_EDITION', sheet)).toMatchObject({ expression: '1d20+2' });
    expect(resolveCharacterInitiative('FIFTH_EDITION', { ...sheet, exhaustionLevel: 0 }))
      .toMatchObject({ expression: '2d20kh1+2' });
  });

  it('is cancelled by the poisoned condition', () => {
    const sheet = fifthEdition(14, undefined, { initiativeAdvantage: true, conditions: ['prone', 'poisoned'] });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('cancelled');
    expect(resolveCharacterInitiative('FIFTH_EDITION', sheet)).toMatchObject({ expression: '1d20+2' });
  });

  // A sheet saved before exhaustion had levels records it as a condition, with
  // no level beside it. That is at least one level.
  it.each([['exhausted'], ['Exhausted'], ['EXHAUSTED']])(
    'is cancelled by the condition %s from a sheet saved before exhaustion had levels',
    (name) => {
      const sheet = fifthEdition(14, undefined, { initiativeAdvantage: true, conditions: [name] });
      expect('exhaustionLevel' in sheet).toBe(false);
      expect(fifthEditionInitiativeAdvantage(sheet)).toBe('cancelled');
      expect(resolveCharacterInitiative('FIFTH_EDITION', sheet)).toMatchObject({ expression: '1d20+2' });
    },
  );

  // Frightened gives disadvantage only while the source of the fear is in
  // sight, which the sheet cannot tell, so it is left to the GM.
  it('is not cancelled by a condition that does not always give disadvantage on the roll', () => {
    const sheet = fifthEdition(14, undefined, { initiativeAdvantage: true, conditions: ['frightened', 'restrained'] });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('advantage');
    expect(resolveCharacterInitiative('FIFTH_EDITION', sheet)).toMatchObject({ expression: '2d20kh1+2' });
  });

  it('gives no disadvantage of its own to a character without the box', () => {
    const sheet = fifthEdition(14, undefined, { exhaustionLevel: 3, conditions: ['poisoned'] });
    expect(fifthEditionInitiativeAdvantage(sheet)).toBe('none');
    expect(resolveCharacterInitiative('FIFTH_EDITION', sheet)).toMatchObject({ expression: '1d20+2' });
  });

  it('is 5E only', () => {
    const sheet = { ...fantasyD20('perception', 9, 4), initiativeAdvantage: true };
    expect(resolveCharacterInitiative('FANTASY_D20', sheet)).toMatchObject({ expression: '1d20+9' });
  });
});

// ---------------------------------------------------------------------------
// Fantasy d20
// ---------------------------------------------------------------------------

describe('Fantasy d20 initiative', () => {
  // Previously every Fantasy d20 character rolled +0: the bonus field was shown on the
  // sheet but nothing ever calculated it.
  it('uses Perception by default', () => {
    expect(fantasyD20InitiativeBonus(fantasyD20('perception', 9, 4))).toBe(9);
    expect(resolveCharacterInitiative('FANTASY_D20', fantasyD20('perception', 9, 4)))
      .toMatchObject({ expression: '1d20+9' });
  });

  it('uses the named skill when the GM calls for one', () => {
    expect(fantasyD20InitiativeBonus(fantasyD20('stealth', 9, 4))).toBe(4);
    expect(resolveCharacterInitiative('FANTASY_D20', fantasyD20('stealth', 9, 4)))
      .toMatchObject({ expression: '1d20+4' });
  });

  it('falls back to Perception for a stat the sheet does not carry', () => {
    expect(fantasyD20InitiativeBonus(fantasyD20('lore:sailing', 9, 4))).toBe(9);
  });

  it('defaults to Perception when no choice is recorded', () => {
    const noChoice = { level: 1, attributes: { wisdom: { modifier: 3 } }, perception: { proficiencyRank: 'trained' }, skills: {} };
    expect(fantasyD20InitiativeBonus(noChoice)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Horror d100
// ---------------------------------------------------------------------------

describe('Horror d100 initiative', () => {
  // Combatants act in DEX order, highest first. There is no initiative
  // die. The code previously invented 1d10 + DEX/5.
  it('is the character\'s DEX, with nothing rolled', () => {
    expect(resolveCharacterInitiative('HORROR_D100', horrorD100(13)))
      .toEqual({ kind: 'fixed', value: 13, label: 'DEX 13' });
  });

  it('never returns a dice expression', () => {
    const resolved = resolveCharacterInitiative('HORROR_D100', horrorD100(8));
    expect(resolved?.kind).toBe('fixed');
    expect(resolved).not.toHaveProperty('expression');
  });

  it('orders characters by DEX', () => {
    const values = [horrorD100(16), horrorD100(9), horrorD100(12)].map(
      (c) => (resolveCharacterInitiative('HORROR_D100', c) as { value: number }).value
    );
    expect([...values].sort((a, b) => b - a)).toEqual([16, 12, 9]);
  });

  // The sheet keeps DEX as a number on the open rules' scale. The server
  // answers a sheet saved before 1.7.0 already converted.
  it('counts a DEX that is not a number as 0', () => {
    expect(resolveCharacterInitiative('HORROR_D100', { characteristics: { DEX: 'quick' } }))
      .toEqual({ kind: 'fixed', value: 0, label: 'DEX 0' });
    expect(resolveCharacterInitiative('HORROR_D100', { characteristics: {} }))
      .toEqual({ kind: 'fixed', value: 0, label: 'DEX 0' });
  });
});

// ---------------------------------------------------------------------------
// Fallbacks and NPCs
// ---------------------------------------------------------------------------

describe('systems without an initiative rule', () => {
  it('returns null for a flexible/custom sheet', () => {
    expect(resolveCharacterInitiative(null, { anything: true })).toBeNull();
  });

  it('returns null for an unknown system', () => {
    expect(resolveCharacterInitiative('SOMETHING_ELSE', {})).toBeNull();
  });

  it('returns null with no data at all', () => {
    expect(resolveCharacterInitiative('FIFTH_EDITION', null)).toBeNull();
  });
});

describe('NPC stat blocks', () => {
  it('derives a 5e monster\'s initiative from its Dexterity', () => {
    // SRD Goblin: Dex 14.
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { abilities: { dex: 14 } }))
      .toMatchObject({ expression: '1d20+2' });
  });

  it('returns null for a stat block with no recorded abilities', () => {
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { name: 'Mystery' })).toBeNull();
    expect(resolveStatBlockInitiative('FIFTH_EDITION', null)).toBeNull();
  });

  it('returns null for systems whose stat blocks are not structured this way', () => {
    expect(resolveStatBlockInitiative('FANTASY_D20', { abilities: { dex: 14 } })).toBeNull();
  });

  // A Horror d100 DEX of 80 is not a 5E score: read as one it is +35.
  it('returns null for a stat block labelled with another game system', () => {
    const character = { gameSystem: 'HORROR_D100', abilities: { dex: 80 } };
    expect(resolveStatBlockInitiative('FIFTH_EDITION', character)).toBeNull();
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { gameSystem: 'FANTASY_D20', abilities: { dex: 14 } })).toBeNull();
  });

  it('reads a stat block labelled with the campaign\'s game system, or with none', () => {
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { gameSystem: 'FIFTH_EDITION', abilities: { dex: 14 } }))
      .toMatchObject({ expression: '1d20+2' });
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { gameSystem: '', abilities: { dex: 14 } }))
      .toMatchObject({ expression: '1d20+2' });
  });
});
