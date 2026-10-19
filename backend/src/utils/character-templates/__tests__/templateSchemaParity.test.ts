/**
 * The built-in templates must write the fields the schema declares.
 *
 * They did not. Each was written against an older shape and never caught up, so
 * it seeded fields nothing reads while leaving the declared ones empty. The
 * routes stored the body as it was sent at the time, so the undeclared fields
 * were saved and then ignored by every reader. What a player saw was a Fighter
 * with a blank Features tab while "Second Wind" sat in the database, and a
 * Pathfinder sheet reading "No strikes/attacks recorded" with a warhammer and a
 * crossbow stored on it. The routes now store Zod's parsed sheet, so such a
 * field would instead be dropped on the first save.
 *
 * Validating a template proves it is *acceptable*. It cannot prove the template
 * is not also carrying a field the schema quietly ignores — Zod strips unknown
 * keys rather than complaining. That gap is what these close.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { validateCharacterData } from '../../../validators/game-systems';
import { GameSystem } from '../../../game-systems';
import { getTemplatesForGameSystem } from '../index';
import {
  pf2eArmorClass,
  pf2eClassDC,
  pf2eSkillTotal,
  pf2eSaveTotal,
  pf2ePerceptionTotal,
  pf2eSpellAttack,
  pf2eSpellDC,
  pf2eTotalBulk,
  pf2eBulkLimits,
  pf2eMaxHitPoints,
  pf2eProficiencyBonus,
} from '../../rules/pathfinder2e';
import { dnd5eBackfilledSkillOtherBonus, dnd5eBackfilledSaveOtherBonus } from '../../rules/dnd5e';
import {
  cocHitPoints,
  cocMajorWoundThreshold,
  cocMagicPoints,
  cocMaxSanity,
  cocHalfAndFifth,
  cocDamageBonusAndBuild,
  cocMoveRate,
  cocDodgeBase,
  cocBlankSkills,
} from '../../rules/callOfCthulhu7e';

/** Top-level keys of a Zod object schema, read from its source. */
function schemaKeys(file: string, marker: string): Set<string> {
  const src = readFileSync(
    path.resolve(__dirname, '../../../validators/game-systems', file),
    'utf8'
  );
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`schema marker not found in ${file}: ${marker}`);
  const body = src.slice(start);
  const declared = body.slice(0, body.indexOf('\n});')).match(/^ {2}(\w+):/gm) ?? [];
  return new Set(declared.map((line) => line.trim().replace(':', '')));
}

const SYSTEMS: { system: GameSystem; file: string; marker: string }[] = [
  { system: GameSystem.DND_5E, file: 'dnd5e.schema.ts', marker: 'dnd5eCharacterDataSchema = z.object({' },
  { system: GameSystem.PATHFINDER_2E, file: 'pathfinder2e.schema.ts', marker: 'pathfinder2eCharacterDataSchema = z.object({' },
  { system: GameSystem.CALL_OF_CTHULHU_7E, file: 'callOfCthulhu7e.schema.ts', marker: 'callOfCthulhu7eCharacterDataSchema = z.object({' },
  { system: GameSystem.SHADOWRUN_6E, file: 'shadowrun6e.schema.ts', marker: 'shadowrun6eCharacterDataSchema = z.object({' },
];

describe('built-in templates match their schema', () => {
  for (const { system, file, marker } of SYSTEMS) {
    describe(system, () => {
      const declared = schemaKeys(file, marker);
      const templates = getTemplatesForGameSystem(system);

      it('has templates to check', () => {
        expect(templates.length).toBeGreaterThan(0);
      });

      for (const template of templates) {
        it(`${template.name} writes only declared fields`, () => {
          const undeclared = Object.keys(template.data).filter((key) => !declared.has(key));
          expect(undeclared).toEqual([]);
        });

        it(`${template.name} validates`, () => {
          const result = validateCharacterData(system, template.data);
          if (!result.success) {
            throw new Error(
              `${system} / ${template.name} failed validation: ` +
                JSON.stringify(result.errors.issues.slice(0, 4))
            );
          }
          expect(result.success).toBe(true);
        });
      }
    });
  }
});

/**
 * A template must not ship a derived total that contradicts the components it
 * stores alongside it.
 *
 * The Level 1 Fighter shipped Armor Class 18 and Class DC 17, each one higher
 * than its own recorded proficiency rank, item bonus and attribute give. The
 * read-only sheet printed the stored number, so those were what a player saw.
 */
describe('Pathfinder 2e templates agree with the rules maths', () => {
  for (const template of getTemplatesForGameSystem(GameSystem.PATHFINDER_2E)) {
    const data = template.data as Record<string, unknown>;

    it(`${template.name} stores the Armor Class its own components give`, () => {
      const stored = (data.armorClass as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(pf2eArmorClass(data));
    });

    it(`${template.name} stores the Class DC its own components give`, () => {
      const stored = (data.classDC as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(pf2eClassDC(data));
    });

    it(`${template.name} stores the saves and Perception its own components give`, () => {
      const saves = data.savingThrows as Record<'fortitude' | 'reflex' | 'will', { bonus: number }>;
      for (const save of ['fortitude', 'reflex', 'will'] as const) expect(saves[save].bonus).toBe(pf2eSaveTotal(data, save));
      expect((data.perception as { bonus: number }).bonus).toBe(pf2ePerceptionTotal(data));
    });

    it(`${template.name} stores the spell attack and spell DC its own components give`, () => {
      const spellcasting = data.spellcasting as { spellAttackBonus: { bonus: number }; spellDC: { dc: number } } | undefined;
      if (!spellcasting) return;
      expect(spellcasting.spellAttackBonus.bonus).toBe(pf2eSpellAttack(data));
      expect(spellcasting.spellDC.dc).toBe(pf2eSpellDC(data));
    });

    it(`${template.name} stores the hit points its ancestry, class, level and Constitution give`, () => {
      const hp = data.hp as { maximum: number; current: number; ancestryHp: number; classHpPerLevel: number };
      const con = (data.attributes as { constitution: { modifier: number } }).constitution.modifier;
      expect(hp.maximum).toBe(pf2eMaxHitPoints(hp.ancestryHp, hp.classHpPerLevel, data.level, con));
      expect(hp.current).toBe(hp.maximum);
    });

    // A strike records its attribute, rank and item bonus, as the editor
    // writes one, and its attack bonus is what they give.
    it(`${template.name} stores each strike's parts and the attack bonus they give`, () => {
      type Strike = { name: string; attackBonus?: number; attributeModifier?: string; proficiencyRank?: string; itemBonus?: number };
      const attributes = data.attributes as Record<string, { modifier: number }>;
      for (const strike of (data.strikes ?? []) as Strike[]) {
        expect(strike).toMatchObject({ attributeModifier: expect.any(String), proficiencyRank: expect.any(String), itemBonus: expect.any(Number) });
        const expected = (attributes[strike.attributeModifier!]?.modifier ?? NaN) + pf2eProficiencyBonus(data.level, strike.proficiencyRank) + strike.itemBonus!;
        expect({ strike: strike.name, attackBonus: strike.attackBonus }).toEqual({ strike: strike.name, attackBonus: expected });
      }
    });

    it(`${template.name} stores the Bulk its inventory and Strength give`, () => {
      const stored = data.bulk as { current: number; encumbered: number; maximum: number } | undefined;
      if (stored === undefined) return;
      const strength = (data.attributes as { strength?: { modifier?: number } } | undefined)?.strength?.modifier ?? 0;
      const { encumbered, maximum } = pf2eBulkLimits(strength);
      expect(stored).toEqual({ current: pf2eTotalBulk(data.inventory, data.currency).bulk, encumbered, maximum });
    });

    // The editor looks attributes up by their full name and offers the
    // traditions and casting types in lower case. A template that abbreviates
    // them has its skill totals recomputed without the attribute on first save.
    it(`${template.name} names attributes and spellcasting as the editor does`, () => {
      const attributes = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const skills = Object.values(data.skills as Record<string, { attribute: string }>).map((s) => s.attribute);
      const lore = ((data.loreSkills ?? []) as { attribute: string }[]).map((l) => l.attribute);
      const spellcasting = data.spellcasting as { tradition: string; type: string; keyAttribute: string };
      const classDC = data.classDC as { keyAttribute: string };
      const named = [...skills, ...lore, classDC.keyAttribute, spellcasting.keyAttribute];

      expect(named.filter((name) => !attributes.includes(name))).toEqual([]);
      expect(['arcane', 'divine', 'primal', 'occult']).toContain(spellcasting.tradition);
      expect(['prepared', 'spontaneous']).toContain(spellcasting.type);
    });

    it(`${template.name} stores the skill and lore totals its own components give`, () => {
      type Skill = { attribute: string; proficiencyRank: string; itemBonus?: number; armorPenalty?: number; bonus: number };
      const total = (skill: Skill) => pf2eSkillTotal(data, skill);
      const skills = [
        ...Object.values(data.skills as Record<string, Skill>),
        ...((data.loreSkills ?? []) as Skill[]),
      ];

      expect(skills.filter((skill) => skill.bonus !== total(skill))).toEqual([]);
    });
  }
});

/**
 * A D&D 5e template's skill and save totals are the ones its scores give, so a
 * character made from one opens with no other bonus to explain.
 */
describe('D&D 5e templates agree with the rules maths', () => {
  for (const template of getTemplatesForGameSystem(GameSystem.DND_5E)) {
    const data = template.data as Record<string, unknown>;

    it(`${template.name} stores the skill and save totals its scores give`, () => {
      const skills = Object.keys((data.skills ?? {}) as Record<string, unknown>);
      const saves = Object.keys((data.savingThrows ?? {}) as Record<string, unknown>);
      expect(skills.filter((key) => dnd5eBackfilledSkillOtherBonus(data, key) !== null)).toEqual([]);
      expect(saves.filter((key) => dnd5eBackfilledSaveOtherBonus(data, key) !== null)).toEqual([]);
    });
  }
});

// The Call of Cthulhu templates stored a major wound of 1 for 10 hit points,
// 13 hit points where CON and SIZ give 12, and halves rounded up.
describe('Call of Cthulhu templates agree with the rules maths', () => {
  for (const template of getTemplatesForGameSystem(GameSystem.CALL_OF_CTHULHU_7E)) {
    const data = template.data as {
      age?: unknown;
      characteristics: Record<string, { regular: number; half: number; fifth: number }>;
      derivedStats: {
        hp: { maximum: number; current: number; majorWoundThreshold: number };
        magicPoints: { maximum: number };
        sanity: { maximum: number };
        damageBonus: string;
        build: number;
        moveRate: number;
      };
      skills: { cthulhuMythos: { currentValue: number }; dodge: { baseValue: number } };
    };
    const c = (key: string) => data.characteristics[key].regular;

    it(`${template.name} stores each characteristic's half and fifth`, () => {
      for (const [key, entry] of Object.entries(data.characteristics)) {
        expect({ key, half: entry.half, fifth: entry.fifth }).toEqual({ key, ...cocHalfAndFifth(entry.regular) });
      }
    });

    it(`${template.name} stores the derived attributes its characteristics give`, () => {
      const hp = cocHitPoints(c('CON'), c('SIZ'));
      const { damageBonus, build } = cocDamageBonusAndBuild(c('STR'), c('SIZ'));
      expect(data.derivedStats.hp).toMatchObject({ maximum: hp, current: hp, majorWoundThreshold: cocMajorWoundThreshold(hp) });
      expect(data.derivedStats.magicPoints.maximum).toBe(cocMagicPoints(c('POW')));
      expect(data.derivedStats.sanity.maximum).toBe(cocMaxSanity(data.skills.cthulhuMythos.currentValue));
      expect({ damageBonus: data.derivedStats.damageBonus, build: data.derivedStats.build }).toEqual({ damageBonus, build });
      expect(data.derivedStats.moveRate).toBe(cocMoveRate(c('STR'), c('DEX'), c('SIZ'), Number(data.age) || 30));
      expect(data.skills.dodge.baseValue).toBe(cocDodgeBase(c('DEX')));
    });
  }
});

// The editor fills a sheet stored without skills from the same table, so a
// blank investigator made either way starts the same.
it('the blank Call of Cthulhu investigator has the rulebook\'s skill bases', () => {
  const blank = getTemplatesForGameSystem(GameSystem.CALL_OF_CTHULHU_7E).find((t) => t.name === 'Blank Call of Cthulhu 7e Character');
  const characteristics = (blank?.data as { characteristics: Record<string, { regular: number }> }).characteristics;
  expect(blank?.data.skills).toEqual(cocBlankSkills(characteristics.DEX.regular, characteristics.EDU.regular));
});
