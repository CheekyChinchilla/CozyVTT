/**
 * Character Templates Validation Tests
 * Tests to ensure character templates match validation schemas
 */

import { describe, it, expect } from '@jest/globals';
import { validateCharacterData } from '../../../validators/game-systems';
import { GameSystem } from '../../../game-systems';

// Import templates
import { getFifthEditionTemplates } from '../fifthEdition-templates';
import { getHorrorD100Templates } from '../horrorD100-templates';
import { getFantasyD20Templates } from '../fantasyD20-templates';

/**
 * A template's sheet, viewed as nested objects.
 *
 * `CharacterTemplate.data` is a `Record<string, unknown>` — the sheet's shape
 * depends on its game system, and no single type covers all three. Every
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
  describe('5E Templates', () => {
    const templates = getFifthEditionTemplates();

    it('should have blank and fighter templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank 5E Character');
      expect(names).toContain('Level 1 Fighter');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against 5E schema`, () => {
        const result = validateCharacterData(GameSystem.FIFTH_EDITION, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank 5E Character');
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
      const blank = templates.find(t => t.name === 'Blank 5E Character');
      expect(sheet(blank)?.spellcasting).toHaveProperty('class');
      expect(sheet(blank)?.spellcasting).toHaveProperty('ability');
      expect(sheet(blank)?.spellcasting).toHaveProperty('cantrips');
      expect(sheet(blank)?.spellcasting).toHaveProperty('slots');
      expect(sheet(blank)?.spellcasting.slots).toHaveProperty('1');
      expect(sheet(blank)?.spellcasting.slots['1']).toHaveProperty('total');
      expect(sheet(blank)?.spellcasting.slots['1']).toHaveProperty('expended');
    });
  });

  // SRD 5.1, "Fighter": "Hit Dice: 1d10 per fighter level", "Hit Points at
  // 1st Level: 10 + your Constitution modifier", "Saving Throws: Strength,
  // Constitution". The blank starter is a Fighter, and had a d8 and 8 HP.
  describe('5E level 1 Fighters', () => {
    interface FighterSheet {
      class: string;
      level: number;
      proficiencyBonus: number;
      stats: Record<string, { score: number; modifier: number }>;
      savingThrows: Record<string, { proficient: boolean; bonus: number }>;
      hp: { maximum: number; current: number };
      hitDice: { class: string; die: string; maximum: number; remaining: number }[];
    }
    const fighters = getFifthEditionTemplates()
      .map((t) => ({ name: t.name, data: t.data as unknown as FighterSheet }))
      .filter((t) => t.data.class === 'Fighter' && t.data.level === 1);
    const conModifier = (s: FighterSheet) => Math.floor((s.stats.constitution.score - 10) / 2);

    it('include the blank starter', () => {
      expect(fighters.map((t) => t.name)).toContain('Blank 5E Character');
    });

    it.each(fighters.map((t) => [t.name, t.data] as const))('%s has one d10 hit die', (_name, s) => {
      expect(s.hitDice).toEqual([expect.objectContaining({ die: 'd10', maximum: 1, remaining: 1 })]);
    });

    it.each(fighters.map((t) => [t.name, t.data] as const))('%s has 10 + CON hit points', (_name, s) => {
      expect(s.hp.maximum).toBe(10 + conModifier(s));
      expect(s.hp.current).toBe(s.hp.maximum);
    });

    it.each(fighters.map((t) => [t.name, t.data] as const))('%s is proficient in Strength and Constitution saves', (_name, s) => {
      for (const ability of ['strength', 'constitution']) {
        expect(s.savingThrows[ability]).toEqual({ proficient: true, bonus: s.stats[ability].modifier + s.proficiencyBonus });
      }
    });

    // SRD 5.1, "Armor" and "Fighting Style": chain mail is AC 16 (no
    // Dexterity), a shield adds 2, and the Defense fighting style adds 1 while
    // wearing armor. The Fighter shipped 18.
    it('gives the Level 1 Fighter in chain mail with a shield and Defense AC 19', () => {
      const fighter = getFifthEditionTemplates().find((t) => t.name === 'Level 1 Fighter');
      const data = fighter?.data as { armorClass: number; featuresAndTraits?: unknown; inventory: { name: string }[] };
      expect(data.inventory.map((item) => item.name)).toEqual(expect.arrayContaining(['Chain Mail', 'Shield']));
      expect(JSON.stringify(data)).toContain('Fighting Style: Defense');
      expect(data.armorClass).toBe(19);
    });
  });

  describe('Horror d100 Templates', () => {
    const templates = getHorrorD100Templates();

    it('should have the blank and example templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank Horror d100 Character');
      expect(names).toContain('Private Detective');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against Horror d100 schema`, () => {
        const result = validateCharacterData(GameSystem.HORROR_D100, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank Horror d100 Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('characterName');
      expect(sheet(blank)?.characterName).toBe('New Character');
    });

    it('describes the blank template by the system\'s name', () => {
      const blank = templates.find(t => t.name === 'Blank Horror d100 Character');
      expect(blank?.description).toBe('A blank character sheet for Horror d100');
    });

    it('blank template should have era field', () => {
      const blank = templates.find(t => t.name === 'Blank Horror d100 Character');
      expect(blank?.data).toHaveProperty('era');
      expect(sheet(blank)?.era).toBe('Modern');
    });

    it('derived attributes should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Horror d100 Character');
      expect(sheet(blank)?.hitPoints).toHaveProperty('maximum');
      expect(sheet(blank)?.hitPoints).toHaveProperty('current');
      expect(sheet(blank)?.powerPoints).toHaveProperty('maximum');
      expect(sheet(blank)?.sanity).toHaveProperty('starting');
      expect(sheet(blank)?.sanity).toHaveProperty('maximum');
      expect(sheet(blank)).toHaveProperty('move');
      expect(sheet(blank)?.skills).toHaveProperty('dodge');
      expect(sheet(blank)?.skills.dodge).toHaveProperty('value');
      expect(sheet(blank)?.skills.dodge).toHaveProperty('experienceCheck');
    });

    it('carries no conversion record, which only the server writes', () => {
      for (const template of templates) expect(template.data).not.toHaveProperty('converted');
    });
  });

  describe('Fantasy d20 Templates', () => {
    const templates = getFantasyD20Templates();

    it('should have blank and fighter templates', () => {
      expect(templates.length).toBeGreaterThanOrEqual(2);
      const names = templates.map(t => t.name);
      expect(names).toContain('Blank Fantasy d20 Character');
      expect(names).toContain('Level 1 Fighter');
    });

    templates.forEach((template) => {
      it(`should validate ${template.name} against Fantasy d20 schema`, () => {
        const result = validateCharacterData(GameSystem.FANTASY_D20, template.data);

        if (!result.success) {
          console.error(`Validation errors for ${template.name}:`, JSON.stringify(result.errors, null, 2));
        }

        expect(result.success).toBe(true);
      });
    });

    it('blank template should have characterName field', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(blank).toBeDefined();
      expect(blank?.data).toHaveProperty('characterName');
    });

    it('describes the blank template by the system\'s name', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(blank?.description).toBe('A blank character sheet for Fantasy d20');
    });

    // The sheet keeps its Alignment and Deity boxes for the characters that
    // hold them; a character started blank stores neither.
    it('stores no alignment or deity in the blank template', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(blank).toBeDefined();
      expect(blank?.data).not.toHaveProperty('alignment');
      expect(blank?.data).not.toHaveProperty('deity');
    });

    it('fighter template should have characterName field', () => {
      const fighter = templates.find(t => t.name === 'Level 1 Fighter');
      expect(fighter).toBeDefined();
      expect(fighter?.data).toHaveProperty('characterName');
      expect(sheet(fighter)?.characterName).toBe('Stout Defender');
    });

    it('should use attributes instead of abilityScores', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(blank?.data).toHaveProperty('attributes');
      expect(blank?.data).not.toHaveProperty('abilityScores');
    });

    it('skills should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('attribute');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('armorPenalty');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('itemBonus');
      expect(sheet(blank)?.skills.acrobatics).toHaveProperty('bonus');
    });

    it('armorClass should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(typeof sheet(blank)?.armorClass).toBe('object');
      expect(sheet(blank)?.armorClass).toHaveProperty('total');
      expect(sheet(blank)?.armorClass).toHaveProperty('proficiencyRank');
      expect(sheet(blank)?.armorClass).toHaveProperty('capDex');
      expect(sheet(blank)?.armorClass).toHaveProperty('itemBonus');
      expect(sheet(blank)?.armorClass).toHaveProperty('armorPenalty');
    });

    // The key attribute is the class's, which a blank sheet does not know yet:
    // the player chooses it in the editor, and the Class DC is stored then.
    it('stores no Class DC', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(sheet(blank)).toBeDefined();
      expect(sheet(blank)).not.toHaveProperty('classDC');
    });

    it('speed should be an object', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(typeof sheet(blank)?.speed).toBe('object');
      expect(sheet(blank)?.speed).toHaveProperty('land');
      expect(sheet(blank)?.speed).toHaveProperty('other');
    });

    it('hp should have ancestry and class fields', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
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
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
      expect(typeof sheet(blank)?.feats).toBe('object');
      expect(sheet(blank)?.feats).toHaveProperty('ancestryAndHeritage');
      expect(sheet(blank)?.feats).toHaveProperty('class');
      expect(sheet(blank)?.feats).toHaveProperty('skill');
      expect(sheet(blank)?.feats).toHaveProperty('general');
      expect(sheet(blank)?.feats).toHaveProperty('bonus');
    });

    it('spellcasting should have correct structure', () => {
      const blank = templates.find(t => t.name === 'Blank Fantasy d20 Character');
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

  describe('All Templates Cross-Check', () => {
    it('all templates should validate against their respective schemas', () => {
      const allTemplates = [
        ...getFifthEditionTemplates().map(t => ({ ...t, system: GameSystem.FIFTH_EDITION })),
        ...getHorrorD100Templates().map(t => ({ ...t, system: GameSystem.HORROR_D100 })),
        ...getFantasyD20Templates().map(t => ({ ...t, system: GameSystem.FANTASY_D20 })),
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
