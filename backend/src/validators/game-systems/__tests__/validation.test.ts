/**
 * Game Systems Validation Tests
 * Tests Zod schemas against example JSON files
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { GameSystem } from '../../../game-systems';
import {
  validateCharacterData,
  getBlankCharacterTemplate,
  dnd5eCharacterDataSchema,
  pathfinder2eCharacterDataSchema,
  shadowrun6eCharacterDataSchema,
  callOfCthulhu7eCharacterDataSchema,
} from '../index';

// Helper to load example JSON files. The Examples/ files use the campaign
// export envelope: { cozyVttVersion, exportedAt, character: { name, gameSystem, data } }
// — the character sheet payload the schemas validate lives at character.data.
function loadExampleJSON(filename: string): any {
  const examplesPath = path.join(__dirname, '../../../../..', 'Examples', filename);
  const content = fs.readFileSync(examplesPath, 'utf-8');
  const parsed = JSON.parse(content);
  return { data: parsed.character.data };
}

describe('Game Systems Validation', () => {
  describe('D&D 5e Validation', () => {
    it('should validate valid D&D 5e character data from example JSON', () => {
      const example = loadExampleJSON('DnD_5e_character.json');
      const result = validateCharacterData(GameSystem.DND_5E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.characterName).toBe('Elara Voss');
        expect(data.class).toBe('Wizard');
        expect(data.level).toBe(5);
      }
    });

    describe('skills of the player\'s own', () => {
      const sheetWith = (customSkills: unknown) => {
        const example = loadExampleJSON('DnD_5e_character.json');
        return { ...example.data, customSkills };
      };

      it('accepts a tool proficiency', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
          sheetWith([{ name: "Thieves' Tools", ability: 'dexterity', proficient: true, expertise: false }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts a manual bonus alongside', () => {
        expect(
          validateCharacterData(
            GameSystem.DND_5E,
            sheetWith([{ name: 'Cartography', ability: 'intelligence', otherBonus: 2 }])
          ).success
        ).toBe(true);
      });

      // A row exists from the moment it is added and is named afterwards.
      it('accepts a row that has not been named yet', () => {
        expect(validateCharacterData(GameSystem.DND_5E, sheetWith([{ name: '', ability: 'wisdom' }])).success)
          .toBe(true);
      });

      // An unrecognised ability would silently roll off nothing at all.
      it.each([
        ['a short form', 'dex'],
        ['an invented ability', 'luck'],
        ['nothing', undefined],
      ])('rejects %s as the ability', (_label, ability) => {
        expect(validateCharacterData(GameSystem.DND_5E, sheetWith([{ name: 'X', ability }])).success)
          .toBe(false);
      });

      it('rejects a name long enough to be used as storage', () => {
        expect(
          validateCharacterData(
            GameSystem.DND_5E,
            sheetWith([{ name: 'x'.repeat(61), ability: 'wisdom' }])
          ).success
        ).toBe(false);
      });

      it('rejects an absurd manual bonus', () => {
        expect(
          validateCharacterData(
            GameSystem.DND_5E,
            sheetWith([{ name: 'X', ability: 'wisdom', otherBonus: 999 }])
          ).success
        ).toBe(false);
      });

      it('accepts a sheet with none at all', () => {
        const example = loadExampleJSON('DnD_5e_character.json');
        expect(validateCharacterData(GameSystem.DND_5E, example.data).success).toBe(true);
      });
    });

    describe('weapon properties are not limited to the eleven the rules name', () => {
      const weaponWith = (properties: unknown) => {
        const example = loadExampleJSON('DnD_5e_character.json');
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
        expect(validateCharacterData(GameSystem.DND_5E, weaponWith(['finesse', 'moonforged'])).success)
          .toBe(true);
      });

      it('accepts a property with spaces and punctuation', () => {
        expect(validateCharacterData(GameSystem.DND_5E, weaponWith(["gnome's bane, +1"])).success)
          .toBe(true);
      });

      // Bounded only so the field cannot be used as storage.
      it('rejects one long enough to be used as storage', () => {
        expect(validateCharacterData(GameSystem.DND_5E, weaponWith(['x'.repeat(61)])).success)
          .toBe(false);
      });

      it('rejects an absurd number of them', () => {
        const many = Array.from({ length: 21 }, (_, i) => `prop${i}`);
        expect(validateCharacterData(GameSystem.DND_5E, weaponWith(many)).success).toBe(false);
      });
    });

    describe('an attack with more than one damage roll', () => {
      // A spear is 1d6 in one hand and 1d8 in two — "versatile (1d8)" in the
      // Weapons table (Basic Rules p. 48). One damage line cannot say that.
      const attackWith = (additionalDamage: unknown) => {
        const example = loadExampleJSON('DnD_5e_character.json');
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
          GameSystem.DND_5E,
          attackWith([{ label: 'Two-handed', damageRoll: '1d8+3', damageType: 'piercing' }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts several, for a spell with more than one mode', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
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
        expect(validateCharacterData(GameSystem.DND_5E, attackWith([{ label: '', damageRoll: '' }])).success)
          .toBe(true);
      });

      it('accepts an attack with no extra damage at all', () => {
        expect(validateCharacterData(GameSystem.DND_5E, attackWith(undefined)).success).toBe(true);
      });

      it('rejects a roll that is not text', () => {
        expect(validateCharacterData(GameSystem.DND_5E, attackWith([{ damageRoll: 8 }])).success)
          .toBe(false);
      });

      it('rejects an absurd number of rows', () => {
        const many = Array.from({ length: 11 }, () => ({ label: 'x', damageRoll: '1d4' }));
        expect(validateCharacterData(GameSystem.DND_5E, attackWith(many)).success).toBe(false);
      });
    });

    describe('the four proficiency boxes', () => {
      // Declared rather than left to survive by accident: the route stores the
      // body as sent, so an undeclared field persisted silently — which is how
      // the built-in templates came to seed fields nothing read.
      const sheetWith = (proficiencies: unknown) => {
        const example = loadExampleJSON('DnD_5e_character.json');
        return { ...example.data, proficiencies };
      };

      it('accepts the four boxes as free text', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
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
        expect(validateCharacterData(GameSystem.DND_5E, sheetWith({ languages: 'Common' })).success)
          .toBe(true);
      });

      // The editor used to guard against this shape, so sheets in the wild may
      // carry it. Rejecting one would leave its owner unable to save at all.
      it('still accepts the legacy array shape', () => {
        expect(validateCharacterData(GameSystem.DND_5E, sheetWith(['Light armor', 'Common'])).success)
          .toBe(true);
      });

      it('accepts a sheet with no proficiencies field at all', () => {
        const example = loadExampleJSON('DnD_5e_character.json');
        expect(validateCharacterData(GameSystem.DND_5E, example.data).success).toBe(true);
      });

      it('rejects a box that is not text', () => {
        expect(validateCharacterData(GameSystem.DND_5E, sheetWith({ languages: 42 })).success)
          .toBe(false);
      });
    });

    describe('featuresAndTraits accepts both the old and new shapes', () => {
      // Sheets written before features gained descriptions hold plain strings,
      // and so does any JSON a player exported. Rejecting those would make a
      // working sheet unsaveable the moment its owner opened it.
      const sheetWith = (featuresAndTraits: unknown) => {
        const example = loadExampleJSON('DnD_5e_character.json');
        return { ...example.data, featuresAndTraits };
      };

      it('accepts plain strings and reads them as names with no description', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
          sheetWith(['NakuDama-Amphibious', 'Aspiring Shadow Warrior'])
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect((result.data as { featuresAndTraits: unknown }).featuresAndTraits).toEqual([
            { name: 'NakuDama-Amphibious', description: '' },
            { name: 'Aspiring Shadow Warrior', description: '' },
          ]);
        }
      });

      it('accepts named entries with descriptions', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
          sheetWith([{ name: 'Second Wind', description: 'Regain 1d10 + fighter level.' }])
        );
        expect(result.success).toBe(true);
      });

      it('accepts a mixture, which is what a part-migrated sheet looks like', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
          sheetWith(['Darkvision', { name: 'Second Wind', description: 'Regain HP.' }])
        );
        expect(result.success).toBe(true);
      });

      it('defaults a missing description rather than rejecting the entry', () => {
        const result = validateCharacterData(GameSystem.DND_5E, sheetWith([{ name: 'Rage' }]));
        expect(result.success).toBe(true);
        if (result.success) {
          expect((result.data as { featuresAndTraits: unknown }).featuresAndTraits).toEqual([
            { name: 'Rage', description: '' },
          ]);
        }
      });

      it('rejects an entry with no name at all', () => {
        const result = validateCharacterData(
          GameSystem.DND_5E,
          sheetWith([{ description: 'orphaned' }])
        );
        expect(result.success).toBe(false);
      });
    });

    it('should fail validation for D&D 5e data missing required fields', () => {
      const invalidData = {
        characterName: 'Test',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.DND_5E, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank D&D 5e character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.DND_5E);
      const result = dnd5eCharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it('should validate minimal D&D 5e character with only required fields', () => {
      const example = loadExampleJSON('DnD_5e_character_minimal.json');
      const result = validateCharacterData(GameSystem.DND_5E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
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
      const example = loadExampleJSON('DnD_5e_character.json');
      const invalidData = {
        ...example.data,
        stats: {
          ...example.data.stats,
          strength: { score: 50, modifier: 20 }, // Invalid: score too high
        },
      };

      const result = validateCharacterData(GameSystem.DND_5E, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Pathfinder 2e Validation', () => {
    it('should validate valid Pathfinder 2e character data from example JSON', () => {
      const example = loadExampleJSON('Pathfinder_2e_character.json');
      const result = validateCharacterData(GameSystem.PATHFINDER_2E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.characterName).toBe('Seraphina Ashveil');
        expect(data.class).toBe('Wizard');
        expect(data.level).toBe(5);
        expect(data.ancestry).toBe('Elf');
      }
    });

    it('should fail validation for Pathfinder 2e data missing required fields', () => {
      const invalidData = {
        characterName: 'Test',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.PATHFINDER_2E, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank Pathfinder 2e character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.PATHFINDER_2E);
      const result = pathfinder2eCharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it('should validate minimal Pathfinder 2e character with only required fields', () => {
      const example = loadExampleJSON('Pathfinder_2e_character_minimal.json');
      const result = validateCharacterData(GameSystem.PATHFINDER_2E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
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
    // rank in Pathfinder, and the rank selector is right there in the UI. The
    // schema declared `string[]`, so adding a ritual made the whole sheet
    // unsavable: the PUT came back 400 and nothing the player had typed
    // survived. Both shapes are accepted now, so a sheet written against the
    // old declaration still loads.
    describe('rituals', () => {
      const withRituals = (rituals: unknown) => {
        const example = loadExampleJSON('Pathfinder_2e_character.json');
        return validateCharacterData(GameSystem.PATHFINDER_2E, {
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
      const example = loadExampleJSON('Pathfinder_2e_character.json');
      const invalidData = {
        ...example.data,
        savingThrows: {
          ...example.data.savingThrows,
          fortitude: {
            ...example.data.savingThrows.fortitude,
            proficiencyRank: 'invalid_rank', // Invalid proficiency rank
          },
        },
      };

      const result = validateCharacterData(GameSystem.PATHFINDER_2E, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Shadowrun 6e Validation', () => {
    // Shadowrun example JSONs no longer ship in Examples/ — these three
    // example-driven tests are skipped until replacement fixtures exist.
    // The blank-template and missing-fields tests below still cover the schema.
    it.skip('should validate valid Shadowrun 6e character data from example JSON', () => {
      const example = loadExampleJSON('Shadowrun_character.json');
      const result = validateCharacterData(GameSystem.SHADOWRUN_6E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.characterName).toBe('Ghost');
        expect(data.metatype).toBe('Human');
        expect(data.archetype).toBe('Street Samurai');
      }
    });

    it('should fail validation for Shadowrun 6e data missing required fields', () => {
      const invalidData = {
        characterName: 'Test Runner',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.SHADOWRUN_6E, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank Shadowrun 6e character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.SHADOWRUN_6E);
      const result = shadowrun6eCharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it.skip('should validate minimal Shadowrun 6e character with only required fields', () => {
      const example = loadExampleJSON('Shadowrun_character_minimal.json');
      const result = validateCharacterData(GameSystem.SHADOWRUN_6E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.characterName).toBe('Razor');
        expect(data.metatype).toBe('Human');
        expect(data.archetype).toBe('Street Samurai');
        // Optional fields should be undefined
        expect(data.magic).toBeUndefined();
        expect(data.contacts).toBeUndefined();
      }
    });

    it.skip('should fail validation for invalid essence value', () => {
      const example = loadExampleJSON('Shadowrun_character.json');
      const invalidData = {
        ...example.data,
        attributes: {
          ...example.data.attributes,
          special: {
            ...example.data.attributes.special,
            essence: { current: 7.0, maximum: 6.0 }, // Invalid: essence > 6
          },
        },
      };

      const result = validateCharacterData(GameSystem.SHADOWRUN_6E, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Call of Cthulhu 7e Validation', () => {
    it('should validate valid Call of Cthulhu 7e character data from example JSON', () => {
      const example = loadExampleJSON('Call_of_Cthulhu_7th_Edition_character.json');
      const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.investigatorName).toBe('Dr. Eleanor Voss');
        expect(data.occupation).toBe('Professor');
        expect(data.era).toBe('1920s');
      }
    });

    it('should fail validation for Call of Cthulhu 7e data missing required fields', () => {
      const invalidData = {
        investigatorName: 'Test Investigator',
        // Missing many required fields
      };

      const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.issues.length).toBeGreaterThan(0);
      }
    });

    it('should validate blank Call of Cthulhu 7e character template', () => {
      const template = getBlankCharacterTemplate(GameSystem.CALL_OF_CTHULHU_7E);
      const result = callOfCthulhu7eCharacterDataSchema.safeParse(template);

      expect(result.success).toBe(true);
    });

    it('should validate minimal Call of Cthulhu 7e character with only required fields', () => {
      const example = loadExampleJSON('Call_of_Cthulhu_7th_Edition_character_minimal.json');
      const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, example.data);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as any;
        expect(data.investigatorName).toBe('Dr. Sarah Chen');
        expect(data.occupation).toBe('Professor of Archaeology');
        expect(data.era).toBe('1920s');
        // Optional fields should be undefined
        expect(data.spellsAndMythos).toBeUndefined();
        expect(data.backstory).toBeUndefined();
      }
    });

    it('should fail validation for invalid characteristic value', () => {
      const example = loadExampleJSON('Call_of_Cthulhu_7th_Edition_character.json');
      const invalidData = {
        ...example.data,
        characteristics: {
          ...example.data.characteristics,
          STR: { regular: 150, half: 75, fifth: 30 }, // Invalid: regular > 100
        },
      };

      const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, invalidData);

      expect(result.success).toBe(false);
    });

    it('should fail validation for sanity greater than 99', () => {
      const example = loadExampleJSON('Call_of_Cthulhu_7th_Edition_character.json');
      const invalidData = {
        ...example.data,
        derivedStats: {
          ...example.data.derivedStats,
          sanity: {
            ...example.data.derivedStats.sanity,
            current: 120, // Invalid: sanity > 99
          },
        },
      };

      const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('Blank Character Templates', () => {
    it('should create valid blank template for all game systems', () => {
      const systems = [
        GameSystem.DND_5E,
        GameSystem.PATHFINDER_2E,
        GameSystem.SHADOWRUN_6E,
        GameSystem.CALL_OF_CTHULHU_7E,
      ];

      systems.forEach((system) => {
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

      const result = validateCharacterData(GameSystem.DND_5E, invalidData);

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

      const result = validateCharacterData(GameSystem.DND_5E, invalidData);

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
