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
      expect(fighter?.data.characterName).toBe('Brave Fighter');
    });

    it('spellcasting should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank D&D 5e Character');
      expect(blank?.data.spellcasting).toHaveProperty('class');
      expect(blank?.data.spellcasting).toHaveProperty('ability');
      expect(blank?.data.spellcasting).toHaveProperty('cantrips');
      expect(blank?.data.spellcasting).toHaveProperty('slots');
      expect(blank?.data.spellcasting.slots).toHaveProperty('1');
      expect(blank?.data.spellcasting.slots['1']).toHaveProperty('total');
      expect(blank?.data.spellcasting.slots['1']).toHaveProperty('expended');
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
      expect(blank?.data.investigatorName).toBe('Blank Investigator');
    });

    it('blank template should have era field', () => {
      const blank = templates.find(t => t.name === 'Blank Call of Cthulhu 7e Character');
      expect(blank?.data).toHaveProperty('era');
      expect(blank?.data.era).toBe('Modern');
    });

    it('derivedStats should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Call of Cthulhu 7e Character');
      expect(blank?.data.derivedStats).toHaveProperty('hp');
      expect(blank?.data.derivedStats.hp).toHaveProperty('formula');
      expect(blank?.data.derivedStats.hp).toHaveProperty('majorWoundThreshold');
      expect(blank?.data.derivedStats).toHaveProperty('luck');
      expect(blank?.data.derivedStats.luck).toHaveProperty('score');
      expect(blank?.data.derivedStats.luck).toHaveProperty('notes');
      expect(blank?.data.derivedStats).toHaveProperty('moveRate');
      expect(blank?.data.derivedStats).toHaveProperty('dodge');
      expect(blank?.data.derivedStats.dodge).toHaveProperty('value');
      expect(blank?.data.derivedStats.dodge).toHaveProperty('formula');
      expect(blank?.data.derivedStats.dodge).toHaveProperty('improvementChecked');
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
      expect(fighter?.data.characterName).toBe('Dwarven Defender');
    });

    it('should use attributes instead of abilityScores', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank?.data).toHaveProperty('attributes');
      expect(blank?.data).not.toHaveProperty('abilityScores');
    });

    it('skills should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank?.data.skills.acrobatics).toHaveProperty('attribute');
      expect(blank?.data.skills.acrobatics).toHaveProperty('proficiencyRank');
      expect(blank?.data.skills.acrobatics).toHaveProperty('armorPenalty');
      expect(blank?.data.skills.acrobatics).toHaveProperty('itemBonus');
      expect(blank?.data.skills.acrobatics).toHaveProperty('bonus');
    });

    it('armorClass should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof blank?.data.armorClass).toBe('object');
      expect(blank?.data.armorClass).toHaveProperty('total');
      expect(blank?.data.armorClass).toHaveProperty('proficiencyRank');
      expect(blank?.data.armorClass).toHaveProperty('capDex');
      expect(blank?.data.armorClass).toHaveProperty('itemBonus');
      expect(blank?.data.armorClass).toHaveProperty('armorPenalty');
    });

    it('classDC should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof blank?.data.classDC).toBe('object');
      expect(blank?.data.classDC).toHaveProperty('total');
      expect(blank?.data.classDC).toHaveProperty('keyAttribute');
      expect(blank?.data.classDC).toHaveProperty('proficiencyRank');
    });

    it('speed should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof blank?.data.speed).toBe('object');
      expect(blank?.data.speed).toHaveProperty('land');
      expect(blank?.data.speed).toHaveProperty('other');
    });

    it('hp should have ancestry and class fields', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank?.data.hp).toHaveProperty('ancestryHp');
      expect(blank?.data.hp).toHaveProperty('classHpPerLevel');
      expect(blank?.data.hp).toHaveProperty('resistances');
      expect(blank?.data.hp).toHaveProperty('immunities');
      expect(blank?.data.hp).toHaveProperty('weaknesses');
    });

    it('inventory items should have invested field', () => {
      const fighter = templates.find(t => t.name === 'Level 1 Fighter');
      expect(fighter?.data.inventory.length).toBeGreaterThan(0);
      fighter?.data.inventory.forEach((item: any) => {
        expect(item).toHaveProperty('invested');
      });
    });

    it('feats should be an object with categories', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(typeof blank?.data.feats).toBe('object');
      expect(blank?.data.feats).toHaveProperty('ancestryAndHeritage');
      expect(blank?.data.feats).toHaveProperty('class');
      expect(blank?.data.feats).toHaveProperty('skill');
      expect(blank?.data.feats).toHaveProperty('general');
      expect(blank?.data.feats).toHaveProperty('bonus');
    });

    it('spellcasting should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Pathfinder 2e Character');
      expect(blank?.data.spellcasting).toHaveProperty('type');
      expect(blank?.data.spellcasting).toHaveProperty('keyAttribute');
      expect(blank?.data.spellcasting).toHaveProperty('spellAttackBonus');
      expect(blank?.data.spellcasting.spellAttackBonus).toHaveProperty('proficiencyRank');
      expect(blank?.data.spellcasting.spellAttackBonus).toHaveProperty('itemBonus');
      expect(blank?.data.spellcasting.spellAttackBonus).toHaveProperty('bonus');
      expect(blank?.data.spellcasting).toHaveProperty('spellDC');
      expect(blank?.data.spellcasting.spellDC).toHaveProperty('proficiencyRank');
      expect(blank?.data.spellcasting.spellDC).toHaveProperty('itemBonus');
      expect(blank?.data.spellcasting.spellDC).toHaveProperty('dc');
      expect(blank?.data.spellcasting).toHaveProperty('cantrips');
      expect(blank?.data.spellcasting).toHaveProperty('spells');
      expect(blank?.data.spellcasting).toHaveProperty('focusSpells');
      expect(blank?.data.spellcasting.focusSpells).toHaveProperty('focusPoints');
      expect(blank?.data.spellcasting.focusSpells).toHaveProperty('spells');
      expect(blank?.data.spellcasting).toHaveProperty('innateSpells');
      expect(blank?.data.spellcasting).toHaveProperty('rituals');
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
      expect(samurai?.data.characterName).toBe('Chrome Warrior');
    });

    it('attributes should have correct nested structure', () => {
      const blank = templates.find(t => t.name === 'Blank Shadowrun 6e Character');
      expect(blank?.data.attributes).toHaveProperty('physical');
      expect(blank?.data.attributes).toHaveProperty('mental');
      expect(blank?.data.attributes).toHaveProperty('special');
      expect(blank?.data.attributes.physical).toHaveProperty('body');
      expect(blank?.data.attributes.physical.body).toHaveProperty('base');
      expect(blank?.data.attributes.physical.body).toHaveProperty('augmented');
      expect(blank?.data.attributes.special).toHaveProperty('essence');
      expect(blank?.data.attributes.special.essence).toHaveProperty('current');
      expect(blank?.data.attributes.special.essence).toHaveProperty('maximum');
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
