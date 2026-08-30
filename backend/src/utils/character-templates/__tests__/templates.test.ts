/**
 * Character Templates Validation Tests
 * Tests to ensure character templates match validation schemas
 */

import { describe, it, expect } from '@jest/globals';
import { validateCharacterData } from '../../../validators/game-systems';
import { GameSystem } from '../../../game-systems';

// Import templates
import { getDnD5eTemplates } from '../dnd5e-templates';
import { getCoC7eTemplates } from '../callOfCthulhu7e-templates';
import { getPF2eTemplates } from '../pathfinder2e-templates';
import { getSR6Templates } from '../shadowrun6e-templates';

/**
 * A template's sheet, viewed as nested objects.
 *
 * `CharacterTemplate.data` is a `Record<string, unknown>` — the sheet's shape
 * depends on its game system, and no single type covers all four. Every
 * assertion below checks *structure* (`toHaveProperty`), never a leaf value,
 * so describing the nesting is all that is needed.
 */
interface SheetShape {
  [key: string]: SheetShape;
}
function sheet(template: { data: Record<string, unknown> } | undefined): SheetShape | undefined {
  return template?.data as SheetShape | undefined;
}


describe('Character Templates Validation', () => {
  describe('D&D 5e Templates', () => {
    const templates = getDnD5eTemplates();

    it('should have blank and fighter templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank D&D 5e Character');
      expect(names).toContain('Level 1 Fighter');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against D&D 5e schema`, () => {
        const result = validateCharacterData(GameSystem.DND_5E, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank D&D 5e Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('characterName');
    });

    it('fighter template should have characterName field', () => {
      const fighter = templates.find(t => t.name === 'Level 1 Fighter');
      expect(fighter).toBeDefined();
      expect(fighter?.data).toHaveProperty('characterName');
      expect(sheet(fighter)?.characterName).toBe('Brave Fighter');
    });

    it('spellcasting should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank D&D 5e Character');
      expect(sheet(blank)?.spellcasting).toHaveProperty('class');
      expect(sheet(blank)?.spellcasting).toHaveProperty('ability');
      expect(sheet(blank)?.spellcasting).toHaveProperty('cantrips');
      expect(sheet(blank)?.spellcasting).toHaveProperty('slots');
      expect(sheet(blank)?.spellcasting.slots).toHaveProperty('1');
      expect(sheet(blank)?.spellcasting.slots['1']).toHaveProperty('total');
      expect(sheet(blank)?.spellcasting.slots['1']).toHaveProperty('expended');
    });
  });

  describe('Call of Cthulhu 7e Templates', () => {
    const templates = getCoC7eTemplates();

    it('should have blank and private investigator templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank Call of Cthulhu 7e Character');
      expect(names).toContain('Private Investigator');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against CoC 7e schema`, () => {
        const result = validateCharacterData(GameSystem.CALL_OF_CTHULHU_7E, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have investigatorName field', () => {
      const blank = templates.find(t => t.name === 'Blank Call of Cthulhu 7e Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('investigatorName');
      expect(sheet(blank)?.investigatorName).toBe('Blank Investigator');
    });

    it('blank template should have era field', () => {
      const blank = templates.find(t => t.name === 'Blank Call of Cthulhu 7e Character');
      expect(blank?.data).toHaveProperty('era');
      expect(sheet(blank)?.era).toBe('Modern');
    });

    it('derivedStats should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Call of Cthulhu 7e Character');
      expect(sheet(blank)?.derivedStats).toHaveProperty('hp');
      expect(sheet(blank)?.derivedStats.hp).toHaveProperty('formula');
      expect(sheet(blank)?.derivedStats.hp).toHaveProperty('majorWoundThreshold');
      expect(sheet(blank)?.derivedStats).toHaveProperty('luck');
      expect(sheet(blank)?.derivedStats.luck).toHaveProperty('score');
      expect(sheet(blank)?.derivedStats.luck).toHaveProperty('notes');
      expect(sheet(blank)?.derivedStats).toHaveProperty('moveRate');
      expect(sheet(blank)?.derivedStats).toHaveProperty('dodge');
      expect(sheet(blank)?.derivedStats.dodge).toHaveProperty('value');
      expect(sheet(blank)?.derivedStats.dodge).toHaveProperty('formula');
      expect(sheet(blank)?.derivedStats.dodge).toHaveProperty('improvementChecked');
    });
  });

  describe('Pathfinder 2e Templates', () => {
    const templates = getPF2eTemplates();

    it('should have blank and fighter templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank Pathfinder 2e Character');
      expect(names).toContain('Level 1 Fighter');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against PF2e schema`, () => {
        const result = validateCharacterData(GameSystem.PATHFINDER_2E, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('characterName');
    });

    it('fighter template should have characterName field', () => {
      const fighter = templates.find(t => t.name === 'Level 1 Fighter');
      expect(fighter).toBeDefined();
      expect(fighter?.data).toHaveProperty('characterName');
      expect(sheet(fighter)?.characterName).toBe('Dwarven Defender');
    });

    it('should use attributes instead of abilityScores', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank?.data).toHaveProperty('attributes');
      expect(blank?.data).not.toHaveProperty('abilityScores');
    });

    it('skills should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('attribute');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('armorPenalty');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('itemBonus');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('bonus');
    });

    it('armorClass should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof sheet(blank)?.armorClass).toBe('object');
      expect(sheet(blank)?.armorClass).toHaveProperty('total');
      expect(sheet(blank)?.armorClass).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.armorClass).toHaveProperty('capDex');
      expect(sheet(blank)?.armorClass).toHaveProperty('itemBonus');
      expect(sheet(blank)?.armorClass).toHaveProperty('armorPenalty');
    });

    it('classDC should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof sheet(blank)?.classDC).toBe('object');
      expect(sheet(blank)?.classDC).toHaveProperty('total');
      expect(sheet(blank)?.classDC).toHaveProperty('keyAttribute');
      expect(sheet(blank)?.classDC).toHaveProperty('proficiencyRank');
    });

    it('speed should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof sheet(blank)?.speed).toBe('object');
      expect(sheet(blank)?.speed).toHaveProperty('land');
      expect(sheet(blank)?.speed).toHaveProperty('other');
    });

    it('hp should have ancestry and class fields', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(sheet(blank)?.hp).toHaveProperty('ancestryHp');
      expect(sheet(blank)?.hp).toHaveProperty('classHpPerLevel');
      expect(sheet(blank)?.hp).toHaveProperty('resistances');
      expect(sheet(blank)?.hp).toHaveProperty('immunities');
      expect(sheet(blank)?.hp).toHaveProperty('weaknesses');
    });

    it('inventory items should have invested field', () => {
      const fighter = templates.find(t => t.name === 'Level 1 Fighter');
      // `inventory` is an array rather than a nested object, so it steps out of
      // SheetShape here.
      const inventory = sheet(fighter)?.inventory as unknown as unknown[] | undefined;
      expect(inventory?.length).toBeGreaterThan(0);
      inventory?.forEach((item) => {
        expect(item).toHaveProperty('invested');
      });
    });

    it('feats should be an object with categories', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof sheet(blank)?.feats).toBe('object');
      expect(sheet(blank)?.feats).toHaveProperty('ancestryAndHeritage');
      expect(sheet(blank)?.feats).toHaveProperty('class');
      expect(sheet(blank)?.feats).toHaveProperty('skill');
      expect(sheet(blank)?.feats).toHaveProperty('general');
      expect(sheet(blank)?.feats).toHaveProperty('bonus');
    });

    it('spellcasting should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(sheet(blank)?.spellcasting).toHaveProperty('type');
      expect(sheet(blank)?.spellcasting).toHaveProperty('keyAttribute');
      expect(sheet(blank)?.spellcasting).toHaveProperty('spellAttackBonus');
      expect(sheet(blank)?.spellcasting.spellAttackBonus).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.spellcasting.spellAttackBonus).toHaveProperty('itemBonus');
      expect(sheet(blank)?.spellcasting.spellAttackBonus).toHaveProperty('bonus');
      expect(sheet(blank)?.spellcasting).toHaveProperty('spellDC');
      expect(sheet(blank)?.spellcasting.spellDC).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.spellcasting.spellDC).toHaveProperty('itemBonus');
      expect(sheet(blank)?.spellcasting.spellDC).toHaveProperty('dc');
      expect(sheet(blank)?.spellcasting).toHaveProperty('cantrips');
      expect(sheet(blank)?.spellcasting).toHaveProperty('spells');
      expect(sheet(blank)?.spellcasting).toHaveProperty('focusSpells');
      expect(sheet(blank)?.spellcasting.focusSpells).toHaveProperty('focusPoints');
      expect(sheet(blank)?.spellcasting.focusSpells).toHaveProperty('spells');
      expect(sheet(blank)?.spellcasting).toHaveProperty('innateSpells');
      expect(sheet(blank)?.spellcasting).toHaveProperty('rituals');
    });
  });

  describe('Shadowrun 6e Templates', () => {
    const templates = getSR6Templates();

    it('should have blank and street samurai templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank Shadowrun 6e Character');
      expect(names).toContain('Street Samurai');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against SR6 schema`, () => {
        const result = validateCharacterData(GameSystem.SHADOWRUN_6E, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank Shadowrun 6e Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('characterName');
    });

    it('street samurai template should have characterName field', () => {
      const samurai = templates.find(t => t.name === 'Street Samurai');
      expect(samurai).toBeDefined();
      expect(samurai?.data).toHaveProperty('characterName');
      expect(sheet(samurai)?.characterName).toBe('Chrome Warrior');
    });

    it('attributes should have correct nested structure', () => {
      const blank = templates.find(t => t.name === 'Blank Shadowrun 6e Character');
      expect(sheet(blank)?.attributes).toHaveProperty('physical');
      expect(sheet(blank)?.attributes).toHaveProperty('mental');
      expect(sheet(blank)?.attributes).toHaveProperty('special');
      expect(sheet(blank)?.attributes.physical).toHaveProperty('body');
      expect(sheet(blank)?.attributes.physical.body).toHaveProperty('base');
      expect(sheet(blank)?.attributes.physical.body).toHaveProperty('augmented');
      expect(sheet(blank)?.attributes.special).toHaveProperty('essence');
      expect(sheet(blank)?.attributes.special.essence).toHaveProperty('current');
      expect(sheet(blank)?.attributes.special.essence).toHaveProperty('maximum');
    });
  });

  describe('All Templates Cross-Check', () => {
    it('all templates should validate against their respective schemas', () => {
      const allTemplates = [
        ...getDnD5eTemplates().map(t => ({ ...t, system: GameSystem.DND_5E })),
        ...getCoC7eTemplates().map(t => ({ ...t, system: GameSystem.CALL_OF_CTHULHU_7E })),
        ...getPF2eTemplates().map(t => ({ ...t, system: GameSystem.PATHFINDER_2E })),
        ...getSR6Templates().map(t => ({ ...t, system: GameSystem.SHADOWRUN_6E })),
      ];

      let totalValidated = 0;
      let totalFailed = 0;

      allTemplates.forEach((template) => {
        const result = validateCharacterData(template.system, template.data);
        if (result.success) {
          totalValidated++;
        } else {
          totalFailed++;
          console.error(`FAILED: ${template.name} (${template.system})`, JSON.stringify(result.errors, null, 2));
        }
      });

      expect(totalFailed).toBe(0);
      expect(totalValidated).toBeGreaterThan(0);
    });
  });
});
