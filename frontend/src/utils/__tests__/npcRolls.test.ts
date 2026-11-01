import { describe, it, expect } from 'vitest';
import type { NpcStatBlock } from '@/types';
import type { RollOption } from '../characterRolls';
import {
  buildNpcRolls,
  extractAttackBonus,
  extractDiceExpressions,
  systemSupportsNpcRolls,
} from '../npcRolls';

/** SRD Goblin: Dex 14, CR 1/4, Stealth +6 (doubled proficiency). */
const goblin: NpcStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '30 ft.',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  skills: { stealth: 6 },
  challengeRating: '1/4',
  actions: [
    {
      name: 'Scimitar',
      description: 'Melee Weapon Attack: +4 to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage.',
    },
  ],
};

const find = (options: RollOption[], text: string) =>
  options.find((o) => o.label.includes(text));

describe('extractAttackBonus', () => {
  it('reads a positive bonus', () => {
    expect(extractAttackBonus('Melee Weapon Attack: +4 to hit')).toBe(4);
  });

  it('reads a negative bonus', () => {
    expect(extractAttackBonus('Ranged Weapon Attack: -1 to hit')).toBe(-1);
  });

  it('tolerates spacing', () => {
    expect(extractAttackBonus('+ 7 to hit')).toBe(7);
  });

  it('returns null when there is no attack', () => {
    expect(extractAttackBonus('The creature regains 10 hit points.')).toBeNull();
    expect(extractAttackBonus('')).toBeNull();
  });
});

describe('extractDiceExpressions', () => {
  it('finds every dice expression in order', () => {
    expect(
      extractDiceExpressions('Hit: 5 (1d6 + 2) slashing plus 3 (1d6) fire damage.')
    ).toEqual(['1d6+2', '1d6']);
  });

  it('ignores bare numbers', () => {
    expect(extractDiceExpressions('+10 to hit, 15 damage')).toEqual([]);
  });
});

describe('buildNpcRolls — D&D 5e', () => {
  const rolls = buildNpcRolls(goblin, 'DND_5E');

  it('offers all six ability checks', () => {
    expect(rolls.abilities).toHaveLength(6);
    expect(find(rolls.abilities, 'DEX')?.expression).toBe('1d20+2');
  });

  it('offers all six saves even when none are proficient', () => {
    expect(rolls.savingThrows).toHaveLength(6);
    // Goblin has no save proficiencies, so each falls back to the ability mod.
    expect(find(rolls.savingThrows, 'Dexterity Save')?.expression).toBe('1d20+2');
  });

  it('uses the stored bonus for a skill', () => {
    expect(find(rolls.skills, 'Stealth')?.expression).toBe('1d20+6');
  });

  it('labels the skill with its ability', () => {
    expect(find(rolls.skills, 'Stealth')?.label).toContain('(DEX)');
  });

  it('parses attack and damage from the action text', () => {
    expect(find(rolls.combat, 'Attack')?.expression).toBe('1d20+4');
    expect(find(rolls.combat, 'Damage')?.expression).toBe('1d6+2');
  });

  it('marks damage as not supporting advantage', () => {
    expect(find(rolls.combat, 'Damage')?.supportsAdvantage).toBe(false);
    expect(find(rolls.combat, 'Attack')?.supportsAdvantage).toBe(true);
  });

  // The snake_case keys the SRD importer stores never matched the old lookup,
  // so these skills lost their ability label entirely.
  it('resolves Open5e snake_case skill keys', () => {
    const withSnakeCase = buildNpcRolls(
      { ...goblin, skills: { animal_handling: 4 } },
      'DND_5E'
    );
    const row = find(withSnakeCase.skills, 'Animal Handling');
    expect(row).toBeDefined();
    expect(row?.label).toContain('(WIS)');
  });

  it('marks an expert skill distinctly from a proficient one', () => {
    const expert = buildNpcRolls(
      { ...goblin, proficiencies: { skills: { stealth: 'expertise' } } },
      'DND_5E'
    );
    expect(find(expert.skills, 'Stealth')?.label).toContain('◆');
  });

  it('renders a negative bonus correctly', () => {
    const weak = buildNpcRolls(
      { ...goblin, abilities: { ...goblin.abilities, str: 6 } },
      'DND_5E'
    );
    expect(find(weak.abilities, 'STR')?.expression).toBe('1d20-2');
  });
});

// The dice in an action's text are offered only when the parser rolls them;
// more than 100 dice, a die over d1000 or a bonus over 9,999 the server refuses.
describe('buildNpcRolls — dice the parser refuses', () => {
  it('offers no damage roll for them', () => {
    const titan: NpcStatBlock = {
      ...goblin,
      actions: [{ name: 'Crush', description: 'Melee Weapon Attack: +12 to hit. Hit: 700 (200d6) bludgeoning damage, or 3 (1d6) on a miss.' }],
    };
    const damage = buildNpcRolls(titan, 'DND_5E').combat.filter((o) => o.purpose.startsWith('Crush Damage'));
    expect(damage.map((o) => o.expression)).toEqual(['1d6']);
  });
});

describe('buildNpcRolls — Pathfinder 2e', () => {
  // PF2e prints final modifiers; nothing is derived from ranks or level.
  const pf2eCreature: NpcStatBlock = {
    ac: 18,
    speed: '25 feet',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attributeModifiers: { str: 4, dex: 2, con: 3, int: -1, wis: 1, cha: 0 },
    level: 5,
    savingThrows: { fortitude: 11, reflex: 7, will: 9 },
    skills: { athletics: 12 },
  };

  const rolls = buildNpcRolls(pf2eCreature, 'PATHFINDER_2E');

  it('uses the printed attribute modifier rather than deriving one', () => {
    expect(find(rolls.abilities, 'STR')?.expression).toBe('1d20+4');
  });

  it('offers the three PF2e saves with their proper names', () => {
    expect(rolls.savingThrows).toHaveLength(3);
    expect(find(rolls.savingThrows, 'Fortitude')?.expression).toBe('1d20+11');
    expect(find(rolls.savingThrows, 'Will')?.expression).toBe('1d20+9');
  });

  it('uses the printed skill modifier verbatim', () => {
    expect(find(rolls.skills, 'Athletics')?.expression).toBe('1d20+12');
  });

  it('falls back to deriving from scores for a creature entered 5e-style', () => {
    const legacy = buildNpcRolls(
      { ...pf2eCreature, attributeModifiers: undefined, abilities: { ...pf2eCreature.abilities, str: 18 } },
      'PATHFINDER_2E'
    );
    expect(find(legacy.abilities, 'STR')?.expression).toBe('1d20+4');
  });
});

describe('buildNpcRolls — systems without a d20 model', () => {
  // The defect this fixes: a Call of Cthulhu NPC was offered 1d20 + ability
  // modifier rolls for a percentile system with no ability modifiers.
  it.each(['CALL_OF_CTHULHU_7E', 'SHADOWRUN_6E'])('offers nothing for %s', (system) => {
    const rolls = buildNpcRolls(goblin, system);

    expect(rolls.abilities).toHaveLength(0);
    expect(rolls.skills).toHaveLength(0);
    expect(rolls.savingThrows).toHaveLength(0);
    expect(rolls.combat).toHaveLength(0);
  });

  it('reports which systems have a modelled structure', () => {
    expect(systemSupportsNpcRolls('DND_5E')).toBe(true);
    expect(systemSupportsNpcRolls('PATHFINDER_2E')).toBe(true);
    expect(systemSupportsNpcRolls('CALL_OF_CTHULHU_7E')).toBe(false);
    expect(systemSupportsNpcRolls('SHADOWRUN_6E')).toBe(false);
    expect(systemSupportsNpcRolls(null)).toBe(false);
  });
});

describe('buildNpcRolls — edge cases', () => {
  it('returns nothing for a token with no stat block', () => {
    const rolls = buildNpcRolls(null);
    expect(rolls.abilities).toHaveLength(0);
    expect(rolls.combat).toHaveLength(0);
  });

  it('treats an unknown system as 5e, since the stat block shape is 5e', () => {
    const rolls = buildNpcRolls(goblin, 'SOME_FUTURE_SYSTEM');
    expect(rolls.abilities).toHaveLength(6);
  });

  it('defaults to 5e when no system is given', () => {
    expect(buildNpcRolls(goblin).abilities).toHaveLength(6);
  });

  it('survives a stat block with no abilities recorded', () => {
    const bare = { ac: 10, speed: '30 ft.' } as NpcStatBlock;
    const rolls = buildNpcRolls(bare, 'DND_5E');
    expect(find(rolls.abilities, 'STR')?.expression).toBe('1d20+0');
  });
});
