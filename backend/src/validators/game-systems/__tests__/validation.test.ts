/**
 * Game Systems Validation Tests
 * Tests Zod schemas against example JSON files
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { GameSystem, SUPPORTED_GAME_SYSTEMS } from '../../../game-systems';
import {
  validateCharacterData,
  getBlankCharacterTemplate,
  fifthEditionCharacterDataSchema,
  fantasyD20CharacterDataSchema,
  HorrorD100SheetSchema,
} from '../index';
import type {
  FifthEditionCharacterData,
  FantasyD20CharacterData,
  HorrorD100Sheet,
} from '../index';

// The sheet type each example file is expected to hold. The files are read
// without validation, so this is an expectation: whether each one really has
// that shape is what the tests below check.
interface ExampleSheets {
  '5e_character.json': FifthEditionCharacterData;
  '5e_character_minimal.json': FifthEditionCharacterData;
  'fantasy_d20_character.json': FantasyD20CharacterData;
  'fantasy_d20_character_minimal.json': FantasyD20CharacterData;
  'horror_d100_character.json': HorrorD100Sheet;
  'horror_d100_character_minimal.json': HorrorD100Sheet;
}

// Helper to load example JSON files. The Examples/ files use the campaign
// export envelope: { cozyVttVersion, exportedAt, character: { name, gameSystem, data } }
// — the character sheet payload the schemas validate lives at character.data.
function loadExampleJSON<F extends keyof ExampleSheets>(filename: F): { data: ExampleSheets[F] } {
  const examplesPath = path.join(__dirname, '../../../../..', 'Examples', filename);
  const content = fs.readFileSync(examplesPath, 'utf-8');
  const parsed = JSON.parse(content) as { character: { data: ExampleSheets[F] } };
  return { data: parsed.character.data };
}

/** A Horror d100 sheet as versions before 1.7.0 stored it, from the server's fixtures of that shape. */
function oldHorrorD100Sheet(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../../legacy/__fixtures__/horror-d100-sheets/${name}.json`), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${name}.json holds no sheet`);
  return { ...parsed };
}

describe('Game Systems Validation', () => {
  describe('5E Validation', () => {
    it('should validate valid 5E character data from example JSON', () => {
      const example = loadExampleJSON('5e_character.json');
      const result = validateCharacterData(GameSystem.FIFTH_EDITION, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as FifthEditionCharacterData;
        expect(data.characterName).toBe('Elara Voss');
        expect(data.class).toBe('Wizard');
        expect(data.level).toBe(5);
      }
    });

    describe('skills of the player\'s own', () => {
      const sheetWith = (customSkills: unknown) => {
        const example = loadExampleJSON('5e_character.json');
        return { ...example.data, customSkills };
      };

      it('accepts a tool proficiency', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith([{ name: "Thieves' Tools", ability: 'dexterity', proficient: true, expertise: false }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts a manual bonus alongside', () => {
        expect(
          validateCharacterData(
            GameSystem.FIFTH_EDITION,
            sheetWith([{ name: 'Cartography', ability: 'intelligence', otherBonus: 2 }])
          ).success
        ).toBe(true);
      });

      // A row exists from the moment it is added and is named afterwards.
      it('accepts a row that has not been named yet', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith([{ name: '', ability: 'wisdom' }])).success)
          .toBe(true);
      });

      // An unrecognised ability would silently roll off nothing at all.
      it.each([
        ['a short form', 'dex'],
        ['an invented ability', 'luck'],
        ['nothing', undefined],
      ])('rejects %s as the ability', (_label, ability) => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith([{ name: 'X', ability }])).success)
          .toBe(false);
      });

      it('rejects a name long enough to be used as storage', () => {
        expect(
          validateCharacterData(
            GameSystem.FIFTH_EDITION,
            sheetWith([{ name: 'x'.repeat(61), ability: 'wisdom' }])
          ).success
        ).toBe(false);
      });

      it('rejects an absurd manual bonus', () => {
        expect(
          validateCharacterData(
            GameSystem.FIFTH_EDITION,
            sheetWith([{ name: 'X', ability: 'wisdom', otherBonus: 999 }])
          ).success
        ).toBe(false);
      });

      it('accepts a sheet with none at all', () => {
        const example = loadExampleJSON('5e_character.json');
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, example.data).success).toBe(true);
      });
    });

    describe('advantage on initiative', () => {
      const sheetWith = (initiativeAdvantage: unknown) => ({
        ...loadExampleJSON('5e_character.json').data,
        initiativeAdvantage,
      });

      it.each([true, false])('keeps %s', (value) => {
        const result = validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith(value));
        expect(result.success && (result.data as FifthEditionCharacterData).initiativeAdvantage).toBe(value);
      });

      it.each([['text', 'yes'], ['a number', 1]])('refuses %s', (_label, value) => {
        const result = validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith(value));
        expect(result.success).toBe(false);
        if (!result.success) expect(result.errors.issues[0].path).toEqual(['initiativeAdvantage']);
      });

      it('accepts a sheet stored before it existed', () => {
        const stored: Record<string, unknown> = { ...loadExampleJSON('5e_character.json').data };
        delete stored.initiativeAdvantage;
        const result = validateCharacterData(GameSystem.FIFTH_EDITION, stored);
        expect(result.success).toBe(true);
        if (result.success) expect('initiativeAdvantage' in result.data).toBe(false);
      });

      it('is off on a new blank sheet', () => {
        expect((getBlankCharacterTemplate(GameSystem.FIFTH_EDITION) as FifthEditionCharacterData).initiativeAdvantage).toBe(false);
      });
    });

    describe('weapon properties are not limited to the eleven the rules name', () => {
      const weaponWith = (properties: unknown) => {
        const example = loadExampleJSON('5e_character.json');
        return {
          ...example.data,
          attacks: [
            {
              name: 'Moonforged Blade',
              attackBonus: 5,
              damageRoll: '1d8+3',
              damageType: 'slashing',
              range: 5,
              properties,
              notes: '',
            },
          ],
        };
      };

      // Homebrew is normal, and the sheet draws a badge for whatever is stored.
      it('accepts a property of the player\'s own invention', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, weaponWith(['finesse', 'moonforged'])).success)
          .toBe(true);
      });

      it('accepts a property with spaces and punctuation', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, weaponWith(["gnome's bane, +1"])).success)
          .toBe(true);
      });

      // Bounded only so the field cannot be used as storage.
      it('rejects one long enough to be used as storage', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, weaponWith(['x'.repeat(61)])).success)
          .toBe(false);
      });

      it('rejects an absurd number of them', () => {
        const many = Array.from({ length: 21 }, (_, i) => `prop${i}`);
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, weaponWith(many)).success).toBe(false);
      });
    });

    describe('an attack with more than one damage roll', () => {
      // A spear is 1d6 in one hand and 1d8 in two — "versatile (1d8)" in the
      // Weapons table (SRD 5.1, "Weapons"). One damage line cannot say that.
      const attackWith = (additionalDamage: unknown) => {
        const example = loadExampleJSON('5e_character.json');
        return {
          ...example.data,
          attacks: [
            {
              name: 'Spear',
              attackBonus: 5,
              damageRoll: '1d6+3',
              damageType: 'piercing',
              range: 5,
              properties: ['thrown', 'versatile'],
              notes: '',
              additionalDamage,
            },
          ],
        };
      };

      it('accepts a versatile weapon carrying its two-handed die', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          attackWith([{ label: 'Two-handed', damageRoll: '1d8+3', damageType: 'piercing' }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts several, for a spell with more than one mode', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          attackWith([
            { label: 'At 3rd level', damageRoll: '2d8' },
            { label: 'At 5th level', damageRoll: '3d8' },
          ])
        );
        expect(result.success).toBe(true);
      });

      // A row exists from the moment it is added and is filled in afterwards,
      // so a half-typed row must not block the save.
      it('accepts a row that is still empty', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, attackWith([{ label: '', damageRoll: '' }])).success)
          .toBe(true);
      });

      it('accepts an attack with no extra damage at all', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, attackWith(undefined)).success).toBe(true);
      });

      it('rejects a roll that is not text', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, attackWith([{ damageRoll: 8 }])).success)
          .toBe(false);
      });

      it('rejects an absurd number of rows', () => {
        const many = Array.from({ length: 11 }, () => ({ label: 'x', damageRoll: '1d4' }));
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, attackWith(many)).success).toBe(false);
      });
    });

    describe('the four proficiency boxes', () => {
      // Declared because the editor writes them: the routes store the parsed
      // sheet, so an undeclared field would be dropped on save.
      const sheetWith = (proficiencies: unknown) => {
        const example = loadExampleJSON('5e_character.json');
        return { ...example.data, proficiencies };
      };

      it('accepts the four boxes as free text', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith({
            armor: 'All armor, shields',
            weapons: 'Simple, martial',
            tools: "Thieves' tools",
            languages: "Common, Elvish, Thieves' Cant, Druidic",
          })
        );
        expect(result.success).toBe(true);
      });

      it('accepts a sheet that fills in only some of them', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith({ languages: 'Common' })).success)
          .toBe(true);
      });

      // The editor used to guard against this shape, so sheets in the wild may
      // carry it. Rejecting one would leave its owner unable to save at all.
      it('still accepts the legacy array shape', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith(['Light armor', 'Common'])).success)
          .toBe(true);
      });

      it('accepts a sheet with no proficiencies field at all', () => {
        const example = loadExampleJSON('5e_character.json');
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, example.data).success).toBe(true);
      });

      it('rejects a box that is not text', () => {
        expect(validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith({ languages: 42 })).success)
          .toBe(false);
      });
    });

    describe('featuresAndTraits accepts both the old and new shapes', () => {
      // Sheets written before features gained descriptions hold plain strings,
      // and so does any JSON a player exported. Rejecting those would make a
      // working sheet unsaveable the moment its owner opened it.
      const sheetWith = (featuresAndTraits: unknown) => {
        const example = loadExampleJSON('5e_character.json');
        return { ...example.data, featuresAndTraits };
      };

      it('accepts plain strings and reads them as names with no description', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith(['MarshKin-Amphibious', 'Aspiring Shadow Warrior'])
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect((result.data as { featuresAndTraits: unknown }).featuresAndTraits).toEqual([
            { name: 'MarshKin-Amphibious', description: '' },
            { name: 'Aspiring Shadow Warrior', description: '' },
          ]);
        }
      });

      it('accepts named entries with descriptions', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith([{ name: 'Second Wind', description: 'Regain 1d10 + fighter level.' }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts a mixture, which is what a part-migrated sheet looks like', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith(['Darkvision', { name: 'Second Wind', description: 'Regain HP.' }])
        );
        expect(result.success).toBe(true);
      });

      it('defaults a missing description rather than rejecting the entry', () => {
        const result = validateCharacterData(GameSystem.FIFTH_EDITION, sheetWith([{ name: 'Rage' }]));
        expect(result.success).toBe(true);
        if (result.success) {
          expect((result.data as { featuresAndTraits: unknown }).featuresAndTraits).toEqual([
            { name: 'Rage', description: '' },
          ]);
        }
      });

      it('rejects an entry with no name at all', () => {
        const result = validateCharacterData(
          GameSystem.FIFTH_EDITION,
          sheetWith([{ description: 'orphaned' }])
        );
        expect(result.success).toBe(false);
      });
    });

    it('should fail validation for 5E data missing required fields', () => {
      const invalidData = {
        characterName: 'Test',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.FIFTH_EDITION, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank 5E character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.FIFTH_EDITION);
      const result = fifthEditionCharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it('should validate minimal 5E character with only required fields', () => {
      const example = loadExampleJSON('5e_character_minimal.json');
      const result = validateCharacterData(GameSystem.FIFTH_EDITION, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as FifthEditionCharacterData;
        expect(data.characterName).toBe('Grunk the Fighter');
        expect(data.class).toBe('Fighter');
        expect(data.level).toBe(1);
        expect(data.race).toBe('Human');
        expect(data.proficiencyBonus).toBe(2);
        // Optional fields should be undefined
        expect(data.spellcasting).toBeUndefined();
        expect(data.background).toBeUndefined();
      }
    });

    it('should fail validation for invalid ability scores', () => {
      const example = loadExampleJSON('5e_character.json');
      const invalidData = {
        ...example.data,
        stats: {
          ...example.data.stats,
          strength: { score: 50, modifier: 20 }, // Invalid: score too high
        },
      };

      const result = validateCharacterData(GameSystem.FIFTH_EDITION, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Fantasy d20 Validation', () => {
    it('should validate valid Fantasy d20 character data from example JSON', () => {
      const example = loadExampleJSON('fantasy_d20_character.json');
      const result = validateCharacterData(GameSystem.FANTASY_D20, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as FantasyD20CharacterData;
        expect(data.characterName).toBe('Seraphina Ashveil');
        expect(data.class).toBe('Wizard');
        expect(data.level).toBe(5);
        expect(data.ancestry).toBe('Elf');
      }
    });

    it('should fail validation for Fantasy d20 data missing required fields', () => {
      const invalidData = {
        characterName: 'Test',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.FANTASY_D20, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank Fantasy d20 character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.FANTASY_D20);
      const result = fantasyD20CharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it('should validate minimal Fantasy d20 character with only required fields', () => {
      const example = loadExampleJSON('fantasy_d20_character_minimal.json');
      const result = validateCharacterData(GameSystem.FANTASY_D20, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as FantasyD20CharacterData;
        expect(data.characterName).toBe('Aria the Ranger');
        expect(data.class).toBe('Ranger');
        expect(data.level).toBe(1);
        expect(data.ancestry).toBe('Elf');
        expect(data.heritage).toBe('Woodland Elf');
        // Optional fields should be undefined
        expect(data.spellcasting).toBeUndefined();
        expect(data.background).toBeUndefined();
      }
    });

    // The editor's Add Ritual button writes { name, rank } — a ritual has a
    // rank in Fantasy d20, and the rank selector is right there in the UI. The
    // schema declared `string[]`, so adding a ritual made the whole sheet
    // unsavable: the PUT came back 400 and nothing the player had typed
    // survived. Both shapes are accepted now, so a sheet written against the
    // old declaration still loads.
    describe('rituals', () => {
      const withRituals = (rituals: unknown) => {
        const example = loadExampleJSON('fantasy_d20_character.json');
        return validateCharacterData(GameSystem.FANTASY_D20, {
          ...example.data,
          spellcasting: { ...example.data.spellcasting, rituals },
        });
      };

      it('accepts a ritual with a name and a rank, which is what the editor writes', () => {
        const result = withRituals([{ name: 'Consecrate', rank: 2 }]);
        expect(result.success).toBe(true);
      });

      it('still accepts a bare string, which is what the schema used to declare', () => {
        expect(withRituals(['Consecrate']).success).toBe(true);
      });

      it('accepts the two side by side, so a part-upgraded sheet still loads', () => {
        expect(withRituals(['Consecrate', { name: 'Planar Binding', rank: 6 }]).success).toBe(true);
      });

      it('still rejects a ritual with no name', () => {
        expect(withRituals([{ rank: 2 }]).success).toBe(false);
        expect(withRituals([{ name: '', rank: 2 }]).success).toBe(false);
      });

      it('still rejects a rank outside 1-10', () => {
        expect(withRituals([{ name: 'Consecrate', rank: 0 }]).success).toBe(false);
        expect(withRituals([{ name: 'Consecrate', rank: 11 }]).success).toBe(false);
      });
    });

    it('should fail validation for invalid proficiency rank', () => {
      const example = loadExampleJSON('fantasy_d20_character.json');
      const invalidData = {
        ...example.data,
        savingThrows: {
          ...example.data.savingThrows,
          fortitude: {
            ...example.data.savingThrows!.fortitude,
            proficiencyRank: 'invalid_rank', // Invalid proficiency rank
          },
        },
      };

      const result = validateCharacterData(GameSystem.FANTASY_D20, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Horror d100 Validation', () => {
    it('should validate valid Horror d100 character data from example JSON', () => {
      const example = loadExampleJSON('horror_d100_character.json');
      const result = validateCharacterData(GameSystem.HORROR_D100, example.data);

      expect(result.success ? [] : result.errors.issues).toEqual([]);
      if (result.success) {
        const data = result.data as HorrorD100Sheet;
        expect(data.characterName).toBe('Dr. Eleanor Voss');
        expect(data.profession).toBe('Scholar');
        expect(data.era).toBe('1920s');
        expect(data.converted).toBeUndefined();
      }
    });

    it('should fail validation for Horror d100 data missing required fields', () => {
      const invalidData = {
        characterName: 'Test Character',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.HORROR_D100, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.map((issue) => issue.path.join('.'))).toEqual(
          expect.arrayContaining(['profession', 'era', 'characteristics'])
        );
      }
    });

    it('should validate blank Horror d100 character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.HORROR_D100);
      const result = HorrorD100SheetSchema.safeParse(template);

      expect(result.success ? [] : result.error.issues).toEqual([]);
    });

    it('should validate minimal Horror d100 character with only required fields', () => {
      const example = loadExampleJSON('horror_d100_character_minimal.json');
      const result = validateCharacterData(GameSystem.HORROR_D100, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as HorrorD100Sheet;
        expect(data.characterName).toBe('Dr. Sarah Chen');
        expect(data.profession).toBe('Scholar');
        expect(data.era).toBe('1920s');
        // Optional fields should be undefined
        expect(data.skills).toBeUndefined();
        expect(data.story).toBeUndefined();
      }
    });

    it('should fail validation for a characteristic above the highest rating', () => {
      const example = loadExampleJSON('horror_d100_character.json');
      const invalidData = {
        ...example.data,
        characteristics: { ...example.data.characteristics, STR: 1000 },
      };

      const result = validateCharacterData(GameSystem.HORROR_D100, invalidData);

      expect(result.success).toBe(false);
    });

    it('should fail validation for sanity greater than 99', () => {
      const example = loadExampleJSON('horror_d100_character.json');
      const invalidData = {
        ...example.data,
        sanity: { ...example.data.sanity!, current: 120 },
      };

      const result = validateCharacterData(GameSystem.HORROR_D100, invalidData);

      expect(result.success).toBe(false);
    });

    it('should refuse a sheet in the shape before 1.7.0, which the routes convert first', () => {
      const result = validateCharacterData(GameSystem.HORROR_D100, oldHorrorD100Sheet('v1.6.0-example-minimal'));

      expect(result.success).toBe(false);
    });
  });

  describe('Blank Character Templates', () => {
    it('should create valid blank template for all game systems', () => {
      SUPPORTED_GAME_SYSTEMS.forEach((system) => {
        const template = getBlankCharacterTemplate(system);
        const result = validateCharacterData(system, template);

        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages for missing fields', () => {
      const invalidData = {
        characterName: 'Test',
        playerName: 'Player',
        // Missing class, level, etc.
      };

      const result = validateCharacterData(GameSystem.FIFTH_EDITION, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        const errorPaths = result.errors.issues.map((issue) => issue.path.join('.'));
        expect(errorPaths).toContain('class');
        expect(errorPaths).toContain('level');
      }
    });

    it('should provide clear error messages for wrong types', () => {
      const invalidData = {
        characterName: 'Test',
        playerName: 'Player',
        class: 'Wizard',
        level: 'five', // Should be number
      };

      const result = validateCharacterData(GameSystem.FIFTH_EDITION, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        const levelError = result.errors.issues.find(
          (issue) => issue.path.join('.') === 'level'
        );
        expect(levelError).toBeDefined();
        expect(levelError?.code).toBe('invalid_type');
      }
    });
  });
});
