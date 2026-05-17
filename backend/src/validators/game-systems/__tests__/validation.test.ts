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

// Helper to load example JSON files
function loadExampleJSON(filename: string): any {
  const examplesPath = path.join(__dirname, '../../../../..', 'Examples', filename);
  const content = fs.readFileSync(examplesPath, 'utf-8');
  return JSON.parse(content);
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
    it('should validate valid Shadowrun 6e character data from example JSON', () => {
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

    it('should validate minimal Shadowrun 6e character with only required fields', () => {
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

    it('should fail validation for invalid essence value', () => {
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
