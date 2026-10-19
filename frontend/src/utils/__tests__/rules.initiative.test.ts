/**
 * Initiative rules, per system.
 *
 * Every initiative roll in the app used to be a flat `1d20` regardless of
 * character or system, so a Dexterity 20 rogue and a Dexterity 8 wizard rolled
 * the same thing. These pin what each system actually does, including the two
 * cases that are easy to get wrong: Call of Cthulhu does not roll for initiative
 * at all, and a D&D character's bonus is not only Dexterity.
 */

import { describe, it, expect } from 'vitest';
import {
  dnd5eBackfilledInitiativeBonus,
  dnd5eInitiativeModifier,
  pf2eInitiativeBonus,
  resolveCharacterInitiative,
  resolveStatBlockInitiative,
} from '../rules/initiative';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dnd5e = (dexScore: number, initiativeBonus?: number, extra: object = {}) => ({
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
const pf2e = (usedStat: string, perceptionBonus: number, stealthBonus: number) => ({
  level: 1,
  attributes: { wisdom: { modifier: perceptionBonus - 3 }, dexterity: { modifier: stealthBonus - 3 } },
  initiative: { usedStat, bonus: 0 },
  perception: { proficiencyRank: 'trained', itemBonus: 0, bonus: 0, senses: [] },
  skills: {
    stealth: { attribute: 'dexterity', proficiencyRank: 'trained', armorPenalty: 0, itemBonus: 0, bonus: 0 },
  },
});

const coc = (dex: number) => ({
  characteristics: { DEX: { regular: dex, half: Math.floor(dex / 2), fifth: Math.floor(dex / 5) } },
});

const sr6 = (base: number, dicePools: string) => ({
  derivedStats: { initiative: { meatspace: { base, dicePools, formula: 'Reaction + Intuition' } } },
});

// ---------------------------------------------------------------------------
// D&D 5e
// ---------------------------------------------------------------------------

describe('D&D 5e initiative', () => {
  // The example from the bug report, verbatim.
  it('is d20 plus the Dexterity modifier', () => {
    expect(dnd5eInitiativeModifier(dnd5e(14))).toBe(2);
    const resolved = resolveCharacterInitiative('DND_5E', dnd5e(14));
    expect(resolved).toEqual({ kind: 'roll', expression: '1d20+2', label: '1d20+2' });
  });

  it.each([
    [8, -1],
    [10, 0],
    [14, 2],
    [15, 2],
    [20, 5],
  ])('Dexterity %i gives %i', (score, expected) => {
    expect(dnd5eInitiativeModifier(dnd5e(score))).toBe(expected);
  });

  it('adds the manual bonus for feats and class features', () => {
    // Alert: a flat +5 on top of Dexterity.
    expect(dnd5eInitiativeModifier(dnd5e(14, 5))).toBe(7);
    expect(resolveCharacterInitiative('DND_5E', dnd5e(14, 5))).toMatchObject({ expression: '1d20+7' });
  });

  it('formats a negative total correctly', () => {
    expect(resolveCharacterInitiative('DND_5E', dnd5e(8))).toMatchObject({ expression: '1d20-1' });
  });

  it('recomputes the modifier from the score, ignoring a stale stored one', () => {
    const stale = dnd5e(20);
    stale.stats.dexterity.modifier = 0; // as if the score changed and this lagged
    expect(dnd5eInitiativeModifier(stale)).toBe(5);
  });

  it('falls back to the stored modifier when no score is recorded', () => {
    const modOnly = { stats: { dexterity: { modifier: 3 } } };
    expect(dnd5eInitiativeModifier(modOnly)).toBe(3);
  });
});

describe('D&D 5e migration of hand-typed initiative', () => {
  // The case that protects existing characters: initiative used to be one
  // hand-typed number. Deriving it must not quietly change anyone's total.
  it('reads a stored total as Dexterity plus a manual bonus', () => {
    // Alert character, Dexterity 14, typed 7 by hand.
    const legacy = dnd5e(14, undefined, { initiative: 7 });
    expect(dnd5eBackfilledInitiativeBonus(legacy)).toBe(5);

    // And the total is unchanged once that bonus is applied.
    const migrated = { ...legacy, initiativeBonus: 5 };
    expect(dnd5eInitiativeModifier(migrated)).toBe(7);
  });

  it('yields a zero bonus for a character whose total was just Dexterity', () => {
    expect(dnd5eBackfilledInitiativeBonus(dnd5e(14, undefined, { initiative: 2 }))).toBe(0);
  });

  // Caught in the browser: the sheet showed +7 while the dice rolled +2, because
  // the conversion only happened in the editor and the character had not been
  // re-saved. The roll has to read a legacy total the same way the sheet does.
  it('rolls a legacy character\'s full total without waiting for a re-save', () => {
    const legacy = dnd5e(14, undefined, { initiative: 7 });
    expect(dnd5eInitiativeModifier(legacy)).toBe(7);
    expect(resolveCharacterInitiative('DND_5E', legacy)).toMatchObject({ expression: '1d20+7' });
  });

  it('prefers an explicit bonus over a stale stored total', () => {
    // Once the field exists it is authoritative — a stored total left over from
    // before must not override what the sheet now says.
    const migrated = dnd5e(14, 5, { initiative: 999 });
    expect(dnd5eInitiativeModifier(migrated)).toBe(7);
  });

  it('prefers an explicit zero bonus over a stored total', () => {
    // `0` is a real answer, not "unset" — someone who cleared the box means it.
    const cleared = dnd5e(14, 0, { initiative: 7 });
    expect(dnd5eInitiativeModifier(cleared)).toBe(2);
  });

  it('handles a stored total lower than the Dexterity modifier', () => {
    // Nothing in the rules produces this, but a hand-typed field can hold it and
    // the total still must not move.
    const legacy = dnd5e(20, undefined, { initiative: 1 });
    expect(dnd5eBackfilledInitiativeBonus(legacy)).toBe(-4);
    expect(dnd5eInitiativeModifier({ ...legacy, initiativeBonus: -4 })).toBe(1);
  });

  it('leaves a character alone once the field exists', () => {
    expect(dnd5eBackfilledInitiativeBonus(dnd5e(14, 5, { initiative: 7 }))).toBeNull();
    expect(dnd5eBackfilledInitiativeBonus(dnd5e(14, 0, { initiative: 7 }))).toBeNull();
  });

  it('leaves a character with no stored initiative alone', () => {
    expect(dnd5eBackfilledInitiativeBonus(dnd5e(14))).toBeNull();
  });

  // Blank sheets ship `initiative: 0`, and the old field was typed by hand, so
  // plenty of characters never touched it. Reading that as a real total would
  // back-derive minus their Dexterity modifier and leave them rolling flat.
  it('treats a stored zero as never-filled-in rather than a real total', () => {
    const untouched = dnd5e(16, undefined, { initiative: 0 });   // Dexterity +3
    expect(dnd5eBackfilledInitiativeBonus(untouched)).toBeNull();
    expect(dnd5eInitiativeModifier(untouched)).toBe(3);
    expect(resolveCharacterInitiative('DND_5E', untouched)).toMatchObject({ expression: '1d20+3' });
  });
});

// ---------------------------------------------------------------------------
// Pathfinder 2e
// ---------------------------------------------------------------------------

describe('Pathfinder 2e initiative', () => {
  // Previously every PF2e character rolled +0: the bonus field was shown on the
  // sheet but nothing ever calculated it.
  it('uses Perception by default', () => {
    expect(pf2eInitiativeBonus(pf2e('perception', 9, 4))).toBe(9);
    expect(resolveCharacterInitiative('PATHFINDER_2E', pf2e('perception', 9, 4)))
      .toMatchObject({ expression: '1d20+9' });
  });

  it('uses the named skill when the GM calls for one', () => {
    expect(pf2eInitiativeBonus(pf2e('stealth', 9, 4))).toBe(4);
    expect(resolveCharacterInitiative('PATHFINDER_2E', pf2e('stealth', 9, 4)))
      .toMatchObject({ expression: '1d20+4' });
  });

  it('falls back to Perception for a stat the sheet does not carry', () => {
    expect(pf2eInitiativeBonus(pf2e('lore:sailing', 9, 4))).toBe(9);
  });

  it('defaults to Perception when no choice is recorded', () => {
    const noChoice = { level: 1, attributes: { wisdom: { modifier: 3 } }, perception: { proficiencyRank: 'trained' }, skills: {} };
    expect(pf2eInitiativeBonus(noChoice)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Call of Cthulhu 7e
// ---------------------------------------------------------------------------

describe('Call of Cthulhu 7e initiative', () => {
  // The Keeper Rulebook: "Rank in DEX Order: Highest goes first." There is no
  // initiative die. The code previously invented 1d10 + DEX/5.
  it('is the investigator\'s DEX, with nothing rolled', () => {
    expect(resolveCharacterInitiative('CALL_OF_CTHULHU_7E', coc(65)))
      .toEqual({ kind: 'fixed', value: 65, label: 'DEX 65' });
  });

  it('never returns a dice expression', () => {
    const resolved = resolveCharacterInitiative('CALL_OF_CTHULHU_7E', coc(40));
    expect(resolved?.kind).toBe('fixed');
    expect(resolved).not.toHaveProperty('expression');
  });

  it('orders investigators by DEX', () => {
    const values = [coc(80), coc(45), coc(60)].map(
      (c) => (resolveCharacterInitiative('CALL_OF_CTHULHU_7E', c) as { value: number }).value
    );
    expect([...values].sort((a, b) => b - a)).toEqual([80, 60, 45]);
  });

  it('accepts a lowercase characteristics key', () => {
    const lower = { characteristics: { dex: { regular: 55 } } };
    expect(resolveCharacterInitiative('CALL_OF_CTHULHU_7E', lower))
      .toMatchObject({ kind: 'fixed', value: 55 });
  });
});

// ---------------------------------------------------------------------------
// Shadowrun 6e
// ---------------------------------------------------------------------------

describe('Shadowrun 6e initiative', () => {
  it('rolls the recorded dice pool plus the base', () => {
    expect(resolveCharacterInitiative('SHADOWRUN_6E', sr6(2, '1d6')))
      .toEqual({ kind: 'roll', expression: '1d6+2', label: '1d6+2' });
  });

  it('handles augmented characters with extra initiative dice', () => {
    expect(resolveCharacterInitiative('SHADOWRUN_6E', sr6(11, '3d6')))
      .toMatchObject({ expression: '3d6+11' });
  });

  it('refuses a dice pool it cannot parse rather than building a broken expression', () => {
    expect(resolveCharacterInitiative('SHADOWRUN_6E', sr6(2, 'one die'))).toBeNull();
    expect(resolveCharacterInitiative('SHADOWRUN_6E', sr6(2, '1d6 + Reaction'))).toBeNull();
    expect(resolveCharacterInitiative('SHADOWRUN_6E', sr6(2, ''))).toBeNull();
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
    expect(resolveCharacterInitiative('DND_5E', null)).toBeNull();
  });
});

describe('NPC stat blocks', () => {
  it('derives a 5e monster\'s initiative from its Dexterity', () => {
    // SRD Goblin: Dex 14.
    expect(resolveStatBlockInitiative('DND_5E', { abilities: { dex: 14 } }))
      .toMatchObject({ expression: '1d20+2' });
  });

  it('returns null for a stat block with no recorded abilities', () => {
    expect(resolveStatBlockInitiative('DND_5E', { name: 'Mystery' })).toBeNull();
    expect(resolveStatBlockInitiative('DND_5E', null)).toBeNull();
  });

  it('returns null for systems whose stat blocks are not structured this way', () => {
    expect(resolveStatBlockInitiative('PATHFINDER_2E', { abilities: { dex: 14 } })).toBeNull();
  });
});
