import { readFileSync } from 'fs';
import path from 'path';
import {
  ABILITY_KEYS,
  carryingCapacity,
  FIFTH_EDITION_SKILLS,
  abilityModifier,
  decomposeBonus,
  derivedBonus,
  findSkill,
  normalizeSkillKey,
  parseChallengeRating,
  proficiencyBonusForCR,
  proficiencyBonusForLevel,
  fifthEditionCustomSkillBonus,
  readCustomSkills,
  type FifthEditionCustomSkill,
  fifthEditionDerivedSkillBonus,
  fifthEditionDerivedSaveBonus,
  fifthEditionSkillBonus,
  fifthEditionSaveBonus,
  fifthEditionBackfilledSkillOtherBonus,
  fifthEditionBackfilledSaveOtherBonus,
} from '../fifthEdition';

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [7, -2],
    [8, -1],
    [10, 0],
    [14, 2],
    [20, 5],
    [30, 10],
  ])('score %i is %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });

  it('is 0 for non-finite input', () => {
    expect(abilityModifier(NaN)).toBe(0);
  });
});

describe('parseChallengeRating', () => {
  it.each([
    ['0', 0],
    ['1/8', 0.125],
    ['1/4', 0.25],
    ['1/2', 0.5],
    ['5', 5],
  ])('parses %s', (cr, expected) => {
    expect(parseChallengeRating(cr)).toBe(expected);
  });

  it('returns null for unparseable input', () => {
    expect(parseChallengeRating('—')).toBeNull();
    expect(parseChallengeRating('1/0')).toBeNull();
  });
});

describe('proficiencyBonusForCR', () => {
  // The full SRD table. Duplicated from the frontend suite deliberately: the
  // point is that both projects independently agree on the rule.
  it.each([
    ['0', 2],
    ['1/8', 2],
    ['1/4', 2],
    ['1/2', 2],
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

  it('falls back to +2 for a missing CR', () => {
    expect(proficiencyBonusForCR(null)).toBe(2);
  });
});

describe('proficiencyBonusForLevel', () => {
  it('matches the CR curve at every character level', () => {
    for (let level = 1; level <= 20; level += 1) {
      expect(proficiencyBonusForLevel(level)).toBe(proficiencyBonusForCR(String(level)));
    }
  });
});

describe('the skill list', () => {
  it('has the eighteen 5e skills with valid abilities', () => {
    expect(FIFTH_EDITION_SKILLS).toHaveLength(18);
    for (const skill of FIFTH_EDITION_SKILLS) {
      expect(ABILITY_KEYS).toContain(skill.ability);
    }
  });
});

describe('normalizeSkillKey', () => {
  // Open5e — the SRD import source — uses snake_case, which never matched the
  // camelCase lookup the roll picker used.
  it.each([
    ['animal_handling', 'animalHandling'],
    ['sleight_of_hand', 'sleightOfHand'],
    ['Animal Handling', 'animalHandling'],
    ['perception', 'perception'],
  ])('%s resolves to %s', (input, expected) => {
    expect(normalizeSkillKey(input)).toBe(expected);
  });

  it('keeps unknown skills rather than discarding them', () => {
    expect(findSkill('basket weaving')).toBeNull();
    expect(normalizeSkillKey('Basket Weaving')).toBe('Basket Weaving');
  });
});

describe('derivedBonus / decomposeBonus', () => {
  it('gives a Wisdom 14 commoner +4 Perception', () => {
    expect(derivedBonus(abilityModifier(14), proficiencyBonusForCR('0'), 'proficient')).toBe(4);
  });

  it("reads the SRD Goblin's Stealth +6 as expertise", () => {
    expect(decomposeBonus(6, abilityModifier(14), proficiencyBonusForCR('1/4'))).toBe('expertise');
  });

  it('reports an unreconcilable bonus as custom', () => {
    expect(decomposeBonus(30, 2, 2)).toBe('custom');
  });

  it('round-trips every derived level', () => {
    for (const level of ['none', 'proficient', 'expertise'] as const) {
      for (const abilityMod of [-2, 0, 3, 5]) {
        for (const pb of [2, 3, 5, 9]) {
          expect(decomposeBonus(derivedBonus(abilityMod, pb, level), abilityMod, pb)).toBe(level);
        }
      }
    }
  });
});

describe('skills of the player\'s own', () => {
  // "Proficiency with a tool allows you to add your proficiency bonus to any
  // ability check you make using that tool" (SRD 5.1, "Tools") — the same
  // arithmetic as a skill, which is why this reuses derivedBonus.
  const sheet = {
    proficiencyBonus: 3,
    stats: {
      strength: { score: 8, modifier: -1 },
      dexterity: { score: 16, modifier: 3 },
      wisdom: { score: 12, modifier: 1 },
    },
  };

  const skill = (over: Partial<FifthEditionCustomSkill> = {}): FifthEditionCustomSkill => ({
    name: "Thieves' Tools",
    ability: 'dexterity',
    proficient: false,
    expertise: false,
    ...over,
  });

  it('is the bare ability modifier when not proficient', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill())).toBe(3);
  });

  it('adds the proficiency bonus when proficient', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill({ proficient: true }))).toBe(6);
  });

  it('doubles it for expertise', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill({ proficient: true, expertise: true }))).toBe(9);
  });

  // Expertise means expertise, whatever the proficient box says.
  it('doubles for expertise even if proficient was left unticked', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill({ expertise: true }))).toBe(9);
  });

  it('adds a manual bonus on top', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill({ proficient: true, otherBonus: 2 }))).toBe(8);
  });

  it('handles a negative ability modifier', () => {
    expect(fifthEditionCustomSkillBonus(sheet, skill({ ability: 'strength', proficient: true }))).toBe(2);
  });

  // A stored modifier that has drifted from the score must not skew the check.
  it('recomputes from the score rather than trusting a stale modifier', () => {
    const stale = { proficiencyBonus: 2, stats: { dexterity: { score: 16, modifier: 99 } } };
    expect(fifthEditionCustomSkillBonus(stale, skill())).toBe(3);
  });

  it('falls back to the level-1 proficiency bonus when none is recorded', () => {
    const noPb = { level: 1, stats: { dexterity: { score: 14, modifier: 2 } } };
    expect(fifthEditionCustomSkillBonus(noPb, skill({ proficient: true }))).toBe(4);
  });

  it('treats an ability the sheet does not have as no modifier', () => {
    expect(fifthEditionCustomSkillBonus({ proficiencyBonus: 3 }, skill({ proficient: true }))).toBe(3);
  });

  describe('readCustomSkills', () => {
    it('reads a well-formed row', () => {
      const data = { customSkills: [{ name: 'Thieves\' Tools', ability: 'dexterity', proficient: true, expertise: false }] };
      expect(readCustomSkills(data)).toEqual([
        { name: "Thieves' Tools", ability: 'dexterity', proficient: true, expertise: false },
      ]);
    });

    it('trims the name', () => {
      const data = { customSkills: [{ name: '  Vehicles (Water)  ', ability: 'wisdom' }] };
      expect(readCustomSkills(data)[0].name).toBe('Vehicles (Water)');
    });

    // A row exists from the moment it is added and is named afterwards.
    it('drops a nameless row', () => {
      expect(readCustomSkills({ customSkills: [{ name: '   ', ability: 'dexterity' }] })).toEqual([]);
    });

    // An unrecognised ability would silently roll off Strength.
    it.each([['missing', undefined], ['unknown', 'luck'], ['short form', 'dex']])(
      'drops a row whose ability is %s',
      (_label, ability) => {
        expect(readCustomSkills({ customSkills: [{ name: 'X', ability }] })).toEqual([]);
      }
    );

    it('keeps a manual bonus but omits an unusable one', () => {
      expect(readCustomSkills({ customSkills: [{ name: 'A', ability: 'wisdom', otherBonus: 2 }] })[0].otherBonus).toBe(2);
      expect(readCustomSkills({ customSkills: [{ name: 'B', ability: 'wisdom', otherBonus: 'two' }] })[0].otherBonus).toBeUndefined();
    });

    it.each([['no field', {}], ['not an array', { customSkills: 'none' }], ['nothing', undefined]])(
      'returns nothing for %s',
      (_label, data) => {
        expect(readCustomSkills(data)).toEqual([]);
      }
    );
  });
});

// SRD 5.1, "Lifting and Carrying": Strength times 15, and twice that to
// push, drag or lift.
describe('carryingCapacity', () => {
  it('is fifteen pounds a point of Strength, and twice that to push, drag or lift', () => {
    expect(carryingCapacity(10)).toEqual({ carry: 150, pushDragLift: 300 });
    expect(carryingCapacity(18)).toEqual({ carry: 270, pushDragLift: 540 });
  });

  it('is nothing for a score that is not a number or below 0', () => {
    expect(carryingCapacity(Number.NaN)).toEqual({ carry: 0, pushDragLift: 0 });
    expect(carryingCapacity(-3)).toEqual({ carry: 0, pushDragLift: 0 });
  });
});

describe('parity with the frontend copy', () => {
  // No shared package exists between the two projects, so this module is
  // duplicated. Drift would mean the editor derives one number while the server
  // validates against another; this makes that a test failure instead.
  it('is byte-for-byte identical to frontend/src/utils/rules/fifthEdition.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../fifthEdition.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../../frontend/src/utils/rules/fifthEdition.ts'),
      'utf8'
    );

    expect(backendCopy).toBe(frontendCopy);
  });

  // Same arrangement for the Fantasy d20 maths, which the read-only sheet, the
  // editor and the template checks all read. Drift would let a template ship an
  // Armor Class the sheet then disagreed with — which is the bug it was added
  // for.
  it('rules/fantasyD20.ts is byte-for-byte identical to the frontend copy', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../fantasyD20.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../../frontend/src/utils/rules/fantasyD20.ts'),
      'utf8'
    );

    expect(backendCopy).toBe(frontendCopy);
  });

  // The Horror d100 derived attributes, which the sheets work out and the
  // template checks hold the built-in characters to.
  it('rules/horrorD100.ts is byte-for-byte identical to the frontend copy', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../horrorD100.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../../frontend/src/utils/rules/horrorD100.ts'),
      'utf8'
    );

    expect(backendCopy).toBe(frontendCopy);
  });

  // Same arrangement for the initiative rules, which the server uses to decide
  // what is rolled while the sheets use it to decide what to display. If the two
  // drift, a character shows one initiative and rolls another.
  it('is byte-for-byte identical to frontend/src/utils/rules/initiative.ts', () => {
    const backendCopy = readFileSync(path.resolve(__dirname, '../initiative.ts'), 'utf8');
    const frontendCopy = readFileSync(
      path.resolve(__dirname, '../../../../../frontend/src/utils/rules/initiative.ts'),
      'utf8'
    );

    expect(backendCopy).toBe(frontendCopy);
  });
});

describe('skill and saving throw totals on a character sheet', () => {
  const sheet = (extra: Record<string, unknown>) => ({
    level: 5,
    proficiencyBonus: 3,
    stats: {
      strength: { score: 10, modifier: 0 },
      dexterity: { score: 16, modifier: 3 },
      constitution: { score: 10, modifier: 0 },
      intelligence: { score: 10, modifier: 0 },
      wisdom: { score: 12, modifier: 1 },
      charisma: { score: 8, modifier: -1 },
    },
    ...extra,
  });

  it('derives a skill from its ability, doubling proficiency for expertise', () => {
    const data = sheet({ skills: { stealth: { proficient: true, expertise: true, bonus: 0 } } });
    expect(fifthEditionDerivedSkillBonus(data, 'stealth')).toBe(9);
    expect(fifthEditionDerivedSkillBonus(data, 'animalHandling')).toBe(1);
  });

  it('never doubles proficiency for a saving throw', () => {
    const data = sheet({ savingThrows: { dexterity: { proficient: true, bonus: 0 } } });
    expect(fifthEditionDerivedSaveBonus(data, 'dexterity')).toBe(6);
  });

  it('adds the other bonus to the derived total', () => {
    const data = sheet({
      skills: { stealth: { proficient: false, expertise: false, bonus: 99, otherBonus: 1 } },
      savingThrows: { wisdom: { proficient: true, bonus: 99, otherBonus: -1 } },
    });
    expect(fifthEditionSkillBonus(data, 'stealth')).toBe(4);
    expect(fifthEditionSaveBonus(data, 'wisdom')).toBe(3);
  });

  it('uses the stored total of an entry saved before the other bonus existed', () => {
    const data = sheet({ skills: { stealth: { proficient: false, expertise: false, bonus: 5 } } });
    expect(fifthEditionSkillBonus(data, 'stealth')).toBe(5);
  });

  it('reads the difference back as the other bonus, once', () => {
    const data = sheet({
      skills: {
        stealth: { proficient: false, expertise: false, bonus: 5 },
        acrobatics: { proficient: false, expertise: false, bonus: 3 },
        perception: { proficient: false, expertise: false, bonus: 7, otherBonus: 0 },
      },
      savingThrows: { charisma: { proficient: false, bonus: -1 }, wisdom: { proficient: true, bonus: 0 } },
    });
    expect(fifthEditionBackfilledSkillOtherBonus(data, 'stealth')).toBe(2);
    expect(fifthEditionBackfilledSkillOtherBonus(data, 'acrobatics')).toBeNull();
    expect(fifthEditionBackfilledSkillOtherBonus(data, 'perception')).toBeNull();
    expect(fifthEditionBackfilledSaveOtherBonus(data, 'charisma')).toBeNull();
    expect(fifthEditionBackfilledSaveOtherBonus(data, 'wisdom')).toBe(-4);
  });

  it('records nothing for a total that is not a whole number', () => {
    const data = sheet({ skills: { stealth: { proficient: false, expertise: false, bonus: 2.5 } } });
    expect(fifthEditionBackfilledSkillOtherBonus(data, 'stealth')).toBeNull();
    expect(fifthEditionSkillBonus(data, 'stealth')).toBe(3);
  });
});
