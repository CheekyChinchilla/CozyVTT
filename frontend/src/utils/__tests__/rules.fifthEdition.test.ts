import { describe, it, expect } from 'vitest';
import {
  ABILITY_KEYS,
  FIFTH_EDITION_SKILLS,
  abilityModifier,
  decomposeBonus,
  derivedBonus,
  findSkill,
  formatModifier,
  normalizeSkillKey,
  parseChallengeRating,
  passiveScore,
  proficiencyBonusForCR,
  proficiencyBonusForLevel,
  skillLabel,
} from '../rules/fifthEdition';

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [3, -4],
    [7, -2],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [14, 2],
    [15, 2],
    [18, 4],
    [20, 5],
    [30, 10],
  ])('score %i is %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });

  // floor, not truncate — a score of 7 is -2, and truncation would give -1.
  it('rounds down for odd scores below 10', () => {
    expect(abilityModifier(7)).toBe(-2);
    expect(abilityModifier(5)).toBe(-3);
  });

  it('is 0 for non-finite input rather than NaN', () => {
    expect(abilityModifier(NaN)).toBe(0);
    expect(abilityModifier(Infinity)).toBe(0);
  });
});

describe('formatModifier', () => {
  it.each([
    [3, '+3'],
    [0, '+0'],
    [-1, '-1'],
  ])('%i renders as %s', (mod, expected) => {
    expect(formatModifier(mod)).toBe(expected);
  });
});

describe('parseChallengeRating', () => {
  it.each([
    ['0', 0],
    ['1/8', 0.125],
    ['1/4', 0.25],
    ['1/2', 0.5],
    ['1', 1],
    ['21', 21],
    ['  5  ', 5],
    ['1 / 4', 0.25],
  ])('parses %s', (cr, expected) => {
    expect(parseChallengeRating(cr)).toBe(expected);
  });

  it.each([['—'], [''], ['unknown'], [null], [undefined], ['1/0']])(
    'returns null for %s',
    (cr) => {
      expect(parseChallengeRating(cr as string)).toBeNull();
    }
  );

  it('accepts a number directly', () => {
    expect(parseChallengeRating(0.25)).toBe(0.25);
  });
});

describe('proficiencyBonusForCR', () => {
  // SRD 5.1, "Proficiency Bonus by Challenge Rating": the table in full. This
  // is the rule the whole feature rests on, so every band boundary is pinned.
  it.each([
    ['0', 2],
    ['1/8', 2],
    ['1/4', 2],
    ['1/2', 2],
    ['1', 2],
    ['4', 2],
    ['5', 3],
    ['8', 3],
    ['9', 4],
    ['12', 4],
    ['13', 5],
    ['16', 5],
    ['17', 6],
    ['20', 6],
    ['21', 7],
    ['24', 7],
    ['25', 8],
    ['28', 8],
    ['29', 9],
    ['30', 9],
  ])('CR %s gives %i', (cr, expected) => {
    expect(proficiencyBonusForCR(cr)).toBe(expected);
  });

  it('falls back to +2 when the CR is missing or unparseable', () => {
    expect(proficiencyBonusForCR(null)).toBe(2);
    expect(proficiencyBonusForCR('')).toBe(2);
    expect(proficiencyBonusForCR('—')).toBe(2);
  });

  it('caps at +9 above CR 30', () => {
    expect(proficiencyBonusForCR('99')).toBe(9);
  });
});

describe('proficiencyBonusForLevel', () => {
  // A CR N monster and a level N character share the curve.
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [7, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])('level %i gives %i', (level, expected) => {
    expect(proficiencyBonusForLevel(level)).toBe(expected);
  });

  it('matches the CR curve for every character level', () => {
    for (let level = 1; level <= 20; level += 1) {
      expect(proficiencyBonusForLevel(level)).toBe(proficiencyBonusForCR(String(level)));
    }
  });

  it('floors invalid levels at +2', () => {
    expect(proficiencyBonusForLevel(0)).toBe(2);
    expect(proficiencyBonusForLevel(-3)).toBe(2);
  });
});

describe('the skill list', () => {
  it('has the eighteen 5e skills', () => {
    expect(FIFTH_EDITION_SKILLS).toHaveLength(18);
  });

  it('uses only real ability keys', () => {
    for (const skill of FIFTH_EDITION_SKILLS) {
      expect(ABILITY_KEYS).toContain(skill.ability);
    }
  });

  it('has unique keys', () => {
    const keys = FIFTH_EDITION_SKILLS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each([
    ['perception', 'wis'],
    ['stealth', 'dex'],
    ['athletics', 'str'],
    ['arcana', 'int'],
    ['persuasion', 'cha'],
    ['animalHandling', 'wis'],
    ['sleightOfHand', 'dex'],
  ])('%s uses %s', (key, ability) => {
    expect(findSkill(key)?.ability).toBe(ability);
  });
});

describe('findSkill / normalizeSkillKey', () => {
  // The live bug this fixes: the SRD importer stores Open5e's snake_case keys,
  // which never matched the camelCase lookup, so those skills silently lost
  // their ability association in the roll picker.
  it.each([
    ['animal_handling', 'animalHandling'],
    ['sleight_of_hand', 'sleightOfHand'],
    ['Animal Handling', 'animalHandling'],
    ['animal handling', 'animalHandling'],
    ['animal-handling', 'animalHandling'],
    ['ANIMALHANDLING', 'animalHandling'],
    ['Perception', 'perception'],
    ['stealth', 'stealth'],
  ])('%s resolves to %s', (input, expected) => {
    expect(normalizeSkillKey(input)).toBe(expected);
  });

  it('returns null for an unknown skill', () => {
    expect(findSkill('basket weaving')).toBeNull();
  });

  it('keeps an unknown skill name rather than discarding it', () => {
    expect(normalizeSkillKey('  Basket Weaving  ')).toBe('Basket Weaving');
  });

  it('labels a known key and falls back for an unknown one', () => {
    expect(skillLabel('sleightOfHand')).toBe('Sleight of Hand');
    expect(skillLabel('basketWeaving')).toBe('basketWeaving');
  });
});

describe('derivedBonus', () => {
  // The worked example from the bug report: a commoner with Wisdom 14 who is
  // proficient in Perception has +4 (+2 Wis, +2 proficiency).
  it('gives a Wisdom 14 commoner +4 Perception', () => {
    expect(derivedBonus(abilityModifier(14), proficiencyBonusForCR('0'), 'proficient')).toBe(4);
  });

  it('doubles proficiency for expertise', () => {
    // Goblin: Dex 14 (+2), CR 1/4 (PB +2), Stealth +6 as printed.
    expect(derivedBonus(abilityModifier(14), proficiencyBonusForCR('1/4'), 'expertise')).toBe(6);
  });

  it('adds nothing when not proficient', () => {
    expect(derivedBonus(2, 3, 'none')).toBe(2);
  });

  it('handles negative ability modifiers', () => {
    expect(derivedBonus(abilityModifier(8), 2, 'proficient')).toBe(1);
  });
});

describe('decomposeBonus', () => {
  it('recognises a plain ability check', () => {
    expect(decomposeBonus(2, 2, 3)).toBe('none');
  });

  it('recognises proficiency', () => {
    expect(decomposeBonus(5, 2, 3)).toBe('proficient');
  });

  it('recognises expertise', () => {
    expect(decomposeBonus(8, 2, 3)).toBe('expertise');
  });

  it('reports anything that does not decompose as custom', () => {
    expect(decomposeBonus(30, 2, 2)).toBe('custom');
    expect(decomposeBonus(4, 2, 3)).toBe('custom');
  });

  it('round-trips every derived level', () => {
    for (const level of ['none', 'proficient', 'expertise'] as const) {
      for (const abilityMod of [-2, 0, 3, 5]) {
        for (const pb of [2, 3, 5, 9]) {
          const total = derivedBonus(abilityMod, pb, level);
          expect(decomposeBonus(total, abilityMod, pb)).toBe(level);
        }
      }
    }
  });

  it("reads the SRD Goblin's printed Stealth +6 as expertise", () => {
    const dexMod = abilityModifier(14);
    const pb = proficiencyBonusForCR('1/4');
    expect(decomposeBonus(6, dexMod, pb)).toBe('expertise');
  });
});

describe('passiveScore', () => {
  it('is 10 plus the check bonus', () => {
    expect(passiveScore(0)).toBe(10);
    expect(passiveScore(3)).toBe(13);
    expect(passiveScore(-1)).toBe(9);
  });

  it('falls back to the base for a non-numeric bonus', () => {
    expect(passiveScore(NaN)).toBe(10);
    expect(passiveScore(Infinity)).toBe(10);
  });

  // The reported bug, as reported: Wisdom 12, proficiency +2, expertise in
  // Perception. The sheet showed Perception +5 in both places but a passive
  // score of 13 in the view — proficiency counted once instead of twice,
  // because the passive number was stored separately rather than derived.
  it('counts expertise in Perception, matching the skill bonus', () => {
    const wisMod = abilityModifier(12);
    const pb = proficiencyBonusForLevel(1);

    const proficientOnly = derivedBonus(wisMod, pb, 'proficient');
    const withExpertise = derivedBonus(wisMod, pb, 'expertise');

    expect(proficientOnly).toBe(3);
    expect(withExpertise).toBe(5);

    expect(passiveScore(proficientOnly)).toBe(13);
    expect(passiveScore(withExpertise)).toBe(15);
  });

  it('always equals 10 + the displayed skill bonus, at every proficiency level', () => {
    for (const level of ['none', 'proficient', 'expertise'] as const) {
      for (const score of [8, 10, 12, 17, 20]) {
        for (const pb of [2, 3, 4, 6]) {
          const bonus = derivedBonus(abilityModifier(score), pb, level);
          expect(passiveScore(bonus)).toBe(10 + bonus);
        }
      }
    }
  });
});

// The byte-for-byte parity check against backend/src/utils/rules/fifthEdition.ts lives
// in the backend suite (backend/src/utils/rules/__tests__/fifthEdition.test.ts), which
// already has @types/node. Keeping it there avoids adding a Node type
// dependency to the browser project purely for one test.
