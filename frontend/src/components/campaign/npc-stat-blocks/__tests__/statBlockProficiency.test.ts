import { describe, it, expect } from 'vitest';
import type { NpcStatBlock } from '@/types';
import {
  changeAbilitiesOrRating,
  formatSaveList,
  formatSkillList,
  getProficiencyBonus,
  readSaveRows,
  readSkillRows,
  recomputeDerivedBonuses,
  removeCustomSkill,
  setBonusOverride,
  setProficiencyBonusOverride,
  setProficiencyLevel,
} from '../statBlockProficiency';

/** The worked example from the bug report: a commoner with Wisdom 14. */
const commoner: NpcStatBlock = {
  ac: 10,
  hpMax: 4,
  speed: '30 ft.',
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 },
  challengeRating: '0',
};

/** An SRD Goblin exactly as the importer stores it — totals only, no metadata. */
const goblin: NpcStatBlock = {
  ac: 15,
  hpMax: 7,
  speed: '30 ft.',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  skills: { stealth: 6 },
  challengeRating: '1/4',
};

const skill = (sb: NpcStatBlock, key: string) => readSkillRows(sb).find((r) => r.key === key)!;
const save = (sb: NpcStatBlock, key: string) => readSaveRows(sb).find((r) => r.key === key)!;

describe('getProficiencyBonus', () => {
  it('derives from challenge rating', () => {
    expect(getProficiencyBonus(commoner)).toBe(2);
    expect(getProficiencyBonus({ ...commoner, challengeRating: '9' })).toBe(4);
  });

  it('prefers an explicit override', () => {
    const sb = { ...commoner, proficiencies: { bonusOverride: 5 } };
    expect(getProficiencyBonus(sb)).toBe(5);
  });
});

describe('reading legacy stat blocks', () => {
  // The key backward-compatibility property: no stored number changes, but the
  // editor can now say why it is what it is.
  it("infers expertise from the Goblin's printed Stealth +6", () => {
    const row = skill(goblin, 'stealth');
    expect(row.level).toBe('expertise');
    expect(row.bonus).toBe(6);
  });

  it('infers proficiency from a plain total', () => {
    const sb: NpcStatBlock = { ...commoner, savingThrows: { wis: 4 } };
    expect(save(sb, 'wis').level).toBe('proficient');
  });

  it('marks a total that does not decompose as custom and keeps it exactly', () => {
    const sb: NpcStatBlock = { ...commoner, skills: { perception: 17 } };
    const row = skill(sb, 'perception');
    expect(row.level).toBe('custom');
    expect(row.bonus).toBe(17);
  });

  it('treats an absent entry as not proficient', () => {
    expect(skill(commoner, 'perception').level).toBe('none');
    expect(skill(commoner, 'perception').bonus).toBe(2); // the raw Wis modifier
  });

  it('lists all eighteen skills plus any custom ones', () => {
    const sb: NpcStatBlock = { ...commoner, skills: { basketWeaving: 3 } };
    const rows = readSkillRows(sb);
    expect(rows).toHaveLength(19);
    expect(rows.find((r) => r.key === 'basketWeaving')?.isCustomSkill).toBe(true);
  });

  it('always lists all six saves', () => {
    expect(readSaveRows(commoner)).toHaveLength(6);
  });
});

describe('setting proficiency', () => {
  // The exact scenario in the bug report.
  it('gives a Wisdom 14 commoner +4 Perception when made proficient', () => {
    const updated = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');

    expect(updated.skills?.perception).toBe(4);
    expect(updated.proficiencies?.skills?.perception).toBe('proficient');
  });

  it('doubles proficiency for expertise', () => {
    const updated = setProficiencyLevel(commoner, 'skills', 'perception', 'expertise');
    expect(updated.skills?.perception).toBe(6);
  });

  it('works for saving throws', () => {
    const updated = setProficiencyLevel(commoner, 'saves', 'wis', 'proficient');
    expect(updated.savingThrows?.wis).toBe(4);
  });

  // Storing eighteen "not proficient" entries would bloat every stat block and
  // change what the roll picker lists.
  it('removes the entry when set back to none', () => {
    const proficient = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');
    const cleared = setProficiencyLevel(proficient, 'skills', 'perception', 'none');

    expect(cleared.skills).toBeUndefined();
    expect(cleared.proficiencies).toBeUndefined();
  });

  it('leaves other skills untouched', () => {
    const withStealth = setProficiencyLevel(goblin, 'skills', 'perception', 'proficient');
    expect(withStealth.skills?.stealth).toBe(6);
    expect(withStealth.proficiencies?.skills?.stealth).toBe('expertise');
  });
});

describe('overrides', () => {
  it('stores an explicit bonus and marks it custom', () => {
    const updated = setBonusOverride(commoner, 'skills', 'perception', 9);

    expect(updated.skills?.perception).toBe(9);
    expect(updated.proficiencies?.skills?.perception).toBe('custom');
  });

  it('keeps the current value when switching a row into override mode', () => {
    const proficient = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');
    const custom = setProficiencyLevel(proficient, 'skills', 'perception', 'custom');

    expect(custom.skills?.perception).toBe(4);
  });

  it('exposes what the derived value would be, for comparison', () => {
    const custom = setBonusOverride(commoner, 'skills', 'perception', 9);
    const row = skill(custom, 'perception');

    expect(row.bonus).toBe(9);
    expect(row.derived).toBe(4);
  });

  it('applies a proficiency-bonus override across every derived row', () => {
    const proficient = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');
    const overridden = setProficiencyBonusOverride(proficient, 5);

    expect(overridden.skills?.perception).toBe(7); // +2 Wis, +5 override
  });

  it('clearing the proficiency-bonus override returns to the CR value', () => {
    const proficient = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');
    const overridden = setProficiencyBonusOverride(proficient, 5);
    const cleared = setProficiencyBonusOverride(overridden, null);

    expect(cleared.skills?.perception).toBe(4);
    expect(cleared.proficiencies?.bonusOverride).toBeUndefined();
  });
});

describe('implausible overrides', () => {
  // The number from the bug report. Overrides stay allowed, but a commoner with
  // a +30 save is flagged so an accident is visible rather than silent.
  it('flags a +30 save on a Wisdom 14 commoner', () => {
    const cheat = setBonusOverride(commoner, 'saves', 'wis', 30);
    expect(save(cheat, 'wis').implausible).toBe(true);
  });

  it('does not flag a value the creature could actually reach', () => {
    const plausible = setBonusOverride(commoner, 'skills', 'perception', 6);
    expect(skill(plausible, 'perception').implausible).toBe(false);
  });

  it('scales the allowance with challenge rating', () => {
    // +16 is absurd at CR 0 but ordinary for a CR 24 creature.
    const weak = setBonusOverride(commoner, 'skills', 'perception', 16);
    expect(skill(weak, 'perception').implausible).toBe(true);

    const mighty = setBonusOverride(
      { ...commoner, challengeRating: '24', abilities: { ...commoner.abilities, wis: 20 } },
      'skills',
      'perception',
      16
    );
    expect(skill(mighty, 'perception').implausible).toBe(false);
  });

  it('never flags a derived bonus', () => {
    const derived = setProficiencyLevel(commoner, 'skills', 'perception', 'expertise');
    expect(skill(derived, 'perception').implausible).toBe(false);
  });

  it('flags an implausibly negative override', () => {
    const cheat = setBonusOverride(commoner, 'skills', 'perception', -20);
    expect(skill(cheat, 'perception').implausible).toBe(true);
  });
});

describe('recomputeDerivedBonuses', () => {
  // Raising a creature's Wisdom has to move its Perception, or the editor shows
  // a number the rules disagree with.
  it('follows a changed ability score', () => {
    const proficient = setProficiencyLevel(commoner, 'skills', 'perception', 'proficient');
    expect(proficient.skills?.perception).toBe(4);

    const stronger = recomputeDerivedBonuses({
      ...proficient,
      abilities: { ...proficient.abilities, wis: 18 },
    });
    expect(stronger.skills?.perception).toBe(6); // +4 Wis, +2 proficiency
  });

  it('follows a changed challenge rating', () => {
    const proficient = setProficiencyLevel(commoner, 'saves', 'wis', 'proficient');
    expect(proficient.savingThrows?.wis).toBe(4);

    const tougher = recomputeDerivedBonuses({ ...proficient, challengeRating: '9' });
    expect(tougher.savingThrows?.wis).toBe(6); // +2 Wis, +4 proficiency
  });

  it('leaves custom values alone', () => {
    const custom = setBonusOverride(commoner, 'skills', 'perception', 9);
    const recomputed = recomputeDerivedBonuses({
      ...custom,
      abilities: { ...custom.abilities, wis: 20 },
    });

    expect(recomputed.skills?.perception).toBe(9);
  });

  it('preserves custom skills', () => {
    const sb: NpcStatBlock = { ...commoner, skills: { basketWeaving: 3 } };
    const recomputed = recomputeDerivedBonuses(sb);

    expect(recomputed.skills?.basketWeaving).toBe(3);
  });

  // Round-tripping an untouched SRD creature must not alter a single number.
  it('does not change a legacy stat block it merely read', () => {
    const recomputed = recomputeDerivedBonuses(goblin);
    expect(recomputed.skills).toEqual({ stealth: 6 });
  });
});

describe('removeCustomSkill', () => {
  it('drops the row', () => {
    const sb: NpcStatBlock = { ...commoner, skills: { basketWeaving: 3 } };
    const removed = removeCustomSkill(sb, 'basketWeaving');

    expect(removed.skills).toBeUndefined();
  });

  it('leaves standard skills alone', () => {
    const sb: NpcStatBlock = { ...goblin, skills: { stealth: 6, basketWeaving: 3 } };
    const removed = removeCustomSkill(sb, 'basketWeaving');

    expect(removed.skills).toEqual({ stealth: 6 });
  });
});

/**
 * Changing an ability score or the challenge rating moves every save and
 * skill that follows it, a creature from the SRD included.
 *
 * Its rows carry no proficiency, so they were inferred from the stored total
 * against the new numbers, which no longer fit: the row froze as custom and
 * kept its old total. A Goblin given Dexterity 16 kept Stealth +6, and typing
 * "16" passed through Dexterity 1 and froze every row there. Each row's level
 * is now recorded before the change, so the totals follow it.
 */
describe('changeAbilitiesOrRating', () => {
  const stealth = (sb: NpcStatBlock) => readSkillRows(sb).find((r) => r.key === 'stealth')!;

  it("keeps the Goblin's Stealth expertise when its Dexterity rises", () => {
    const changed = changeAbilitiesOrRating(goblin, { abilities: { ...goblin.abilities, dex: 16 } });
    expect(changed.skills?.stealth).toBe(7);
    expect(stealth(changed).level).toBe('expertise');
  });

  it('follows the score typed, through the digits on the way', () => {
    let sb = goblin;
    for (const dex of [1, 16]) sb = changeAbilitiesOrRating(sb, { abilities: { ...sb.abilities, dex } });
    expect(sb.skills?.stealth).toBe(7);
  });

  it('moves the totals with the challenge rating', () => {
    // CR 5: proficiency +3, so expertise in Stealth with Dex 14 is 2 + 6.
    expect(changeAbilitiesOrRating(goblin, { challengeRating: '5' }).skills?.stealth).toBe(8);
  });

  it('keeps a value set by hand', () => {
    const custom = setBonusOverride(goblin, 'skills', 'stealth', 11);
    expect(changeAbilitiesOrRating(custom, { abilities: { ...custom.abilities, dex: 18 } }).skills?.stealth).toBe(11);
  });
});

describe('formatSaveList and formatSkillList', () => {
  it('print negative bonuses with a minus and name the ability or skill', () => {
    expect(formatSaveList({ dex: -1, wis: 3 })).toBe('Dex -1, Wis +3');
    expect(formatSkillList({ sleightOfHand: -2, perception: 4 })).toBe('Sleight of Hand -2, Perception +4');
  });

  it('prints a save it does not know as written, uncut', () => {
    expect(formatSaveList({ fortitude: 5 })).toBe('Fortitude +5');
  });
});
