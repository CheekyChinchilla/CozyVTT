import { describe, it, expect } from 'vitest';
import { buildCreatureStatBlock, type CreatureFormFields } from '../buildStatBlock';
import type { NpcStatBlock } from '@/types';

/** Form state equivalent to opening the editor on `source` and changing nothing. */
function formFrom(source: NpcStatBlock): CreatureFormFields {
  return {
    ac: source.ac,
    hpMax: source.hpMax ?? 10,
    speed: source.speed,
    abilities: source.abilities,
    creatureType: source.creatureType ?? '',
    alignment: source.alignment ?? '',
    challengeRating: source.challengeRating ?? '',
    traits: source.traits ?? [],
    actions: source.actions ?? [],
    bonusActions: source.bonusActions ?? [],
    reactions: source.reactions ?? [],
    legendaryActions: source.legendaryActions ?? [],
    damageVulnerabilities: source.damageVulnerabilities ?? '',
    damageResistances: source.damageResistances ?? '',
    damageImmunities: source.damageImmunities ?? '',
    conditionImmunities: source.conditionImmunities ?? '',
    senses: source.senses ?? '',
    languages: source.languages ?? '',
  };
}

/** An SRD Goblin as `creatureSeed.transformMonster` actually stores it. */
const goblin: NpcStatBlock = {
  ac: 15,
  hpMax: 7,
  hitDice: '2d6',
  speed: '30 ft.',
  abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  skills: { stealth: 6 },
  senses: 'darkvision 60 ft., passive Perception 9',
  languages: 'Common, Goblin',
  challengeRating: '1/4',
  xp: 50,
  creatureType: 'Small humanoid (goblinoid)',
  alignment: 'neutral evil',
  gameSystem: 'FIFTH_EDITION',
  notes: 'Nimble Escape',
};

describe('buildCreatureStatBlock', () => {
  describe('fields the form does not render', () => {
    // The bug this module exists for: the editor rebuilt the stat block from
    // form state alone, so renaming a duplicated SRD creature deleted its
    // skills and saves, silently removing them from the NPC roll picker.
    it('preserves skills when an unrelated field is edited', () => {
      const result = buildCreatureStatBlock(goblin, { ...formFrom(goblin), ac: 16 });

      expect(result.skills).toEqual({ stealth: 6 });
      expect(result.ac).toBe(16);
    });

    it('preserves saving throws', () => {
      const source: NpcStatBlock = { ...goblin, savingThrows: { dex: 4, wis: 2 } };
      const result = buildCreatureStatBlock(source, formFrom(source));

      expect(result.savingThrows).toEqual({ dex: 4, wis: 2 });
    });

    it.each(['hitDice', 'xp', 'notes', 'gameSystem'] as const)(
      'preserves %s',
      (field) => {
        const result = buildCreatureStatBlock(goblin, formFrom(goblin));
        expect(result[field]).toEqual(goblin[field]);
      }
    );

    it('round-trips an untouched stat block exactly', () => {
      const result = buildCreatureStatBlock(goblin, formFrom(goblin));
      expect(result).toEqual(goblin);
    });
  });

  describe('fields the form owns', () => {
    it('overwrites edited values', () => {
      const result = buildCreatureStatBlock(goblin, {
        ...formFrom(goblin),
        speed: '40 ft.',
        abilities: { str: 12, dex: 16, con: 10, int: 10, wis: 8, cha: 8 },
      });

      expect(result.speed).toBe('40 ft.');
      expect(result.abilities.dex).toBe(16);
    });

    // The counterpart risk to spreading the source: a cleared input must
    // actually clear, not silently fall back to the previous value.
    it('clears a field the user emptied rather than restoring the old value', () => {
      const result = buildCreatureStatBlock(goblin, { ...formFrom(goblin), languages: '' });

      expect(result.languages).toBeUndefined();
      expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty('languages');
    });

    it('does not copy the source abilities object by reference', () => {
      const form = formFrom(goblin);
      const result = buildCreatureStatBlock(goblin, form);

      expect(result.abilities).not.toBe(goblin.abilities);
    });

    it('drops name/description entries that are entirely blank', () => {
      const result = buildCreatureStatBlock(goblin, {
        ...formFrom(goblin),
        actions: [
          { name: 'Scimitar', description: '+4 to hit, 1d6+2 slashing.' },
          { name: '   ', description: '  ' },
        ],
      });

      expect(result.actions).toEqual([
        { name: 'Scimitar', description: '+4 to hit, 1d6+2 slashing.' },
      ]);
    });

    it('omits an emptied list instead of storing []', () => {
      const source: NpcStatBlock = { ...goblin, actions: [{ name: 'Scimitar', description: 'x' }] };
      const result = buildCreatureStatBlock(source, { ...formFrom(source), actions: [] });

      expect(result.actions).toBeUndefined();
    });
  });

  describe('creating a new creature', () => {
    it('builds a stat block with no source', () => {
      const form: CreatureFormFields = {
        ac: 12,
        hpMax: 4,
        speed: '30 ft.',
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 },
        creatureType: '',
        alignment: '',
        challengeRating: '0',
        traits: [],
        actions: [],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        damageVulnerabilities: '',
        damageResistances: '',
        damageImmunities: '',
        conditionImmunities: '',
        senses: '',
        languages: '',
      };

      const result = buildCreatureStatBlock(undefined, form);

      expect(result.ac).toBe(12);
      expect(result.abilities.wis).toBe(14);
      expect(result.challengeRating).toBe('0');
      expect(result.skills).toBeUndefined();
    });
  });
});
