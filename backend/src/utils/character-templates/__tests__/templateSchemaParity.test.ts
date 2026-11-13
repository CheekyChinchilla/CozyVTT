/**
 * The built-in templates must write the fields the schema declares.
 *
 * They did not. Each was written against an older shape and never caught up, so
 * it seeded fields nothing reads while leaving the declared ones empty. The
 * routes stored the body as it was sent at the time, so the undeclared fields
 * were saved and then ignored by every reader. What a player saw was a Fighter
 * with a blank Features tab while "Second Wind" sat in the database, and a
 * Fantasy d20 sheet reading "No strikes/attacks recorded" with a warhammer and a
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
import { GameSystem, type SupportedGameSystem } from '../../../game-systems';
import { builtInTemplates } from '../../../__tests__/helpers/builtInTemplates';
import {
  fantasyD20ArmorClass,
  fantasyD20ClassDC,
  fantasyD20SkillTotal,
  fantasyD20SaveTotal,
  fantasyD20PerceptionTotal,
  fantasyD20SpellAttack,
  fantasyD20SpellDC,
  fantasyD20TotalBulk,
  fantasyD20BulkLimits,
  fantasyD20MaxHitPoints,
  fantasyD20ProficiencyBonus,
} from '../../rules/fantasyD20';
import { fifthEditionBackfilledSkillOtherBonus, fifthEditionBackfilledSaveOtherBonus } from '../../rules/fifthEdition';
import {
  HORROR_D100_BLASPHEMOUS_LORE,
  HORROR_D100_FIXED_SKILLS,
  HORROR_D100_HUMAN_MOVE,
  horrorD100FixedSkillBase,
  horrorD100LanguageOwnBase,
  horrorD100MaximumHitPoints,
  horrorD100MaximumPowerPoints,
  horrorD100MaximumSanity,
  horrorD100NewSkills,
  type HorrorD100FixedSkillKey,
} from '../../rules/horrorD100';
import type { HorrorD100Sheet } from '../../../validators/game-systems/horrorD100Sheet.schema';

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

const SYSTEMS: { system: SupportedGameSystem; file: string; marker: string }[] = [
  { system: GameSystem.FIFTH_EDITION, file: 'fifthEdition.schema.ts', marker: 'fifthEditionCharacterDataSchema = z.object({' },
  { system: GameSystem.FANTASY_D20, file: 'fantasyD20.schema.ts', marker: 'fantasyD20CharacterDataSchema = z.object({' },
  { system: GameSystem.HORROR_D100, file: 'horrorD100Sheet.schema.ts', marker: 'HorrorD100SheetSchema = z.object({' },
];

describe('built-in templates match their schema', () => {
  for (const { system, file, marker } of SYSTEMS) {
    describe(system, () => {
      const declared = schemaKeys(file, marker);
      const templates = builtInTemplates(system);

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
describe('Fantasy d20 templates agree with the rules maths', () => {
  for (const template of builtInTemplates(GameSystem.FANTASY_D20)) {
    const data = template.data as Record<string, unknown>;

    it(`${template.name} stores the Armor Class its own components give`, () => {
      const stored = (data.armorClass as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(fantasyD20ArmorClass(data));
    });

    it(`${template.name} stores the Class DC its own components give`, () => {
      const stored = (data.classDC as { total?: number } | undefined)?.total;
      if (stored === undefined) return;
      expect(stored).toBe(fantasyD20ClassDC(data));
    });

    it(`${template.name} stores the saves and Perception its own components give`, () => {
      const saves = data.savingThrows as Record<'fortitude' | 'reflex' | 'will', { bonus: number }>;
      for (const save of ['fortitude', 'reflex', 'will'] as const) expect(saves[save].bonus).toBe(fantasyD20SaveTotal(data, save));
      expect((data.perception as { bonus: number }).bonus).toBe(fantasyD20PerceptionTotal(data));
    });

    it(`${template.name} stores the spell attack and spell DC its own components give`, () => {
      const spellcasting = data.spellcasting as { spellAttackBonus: { bonus: number }; spellDC: { dc: number } } | undefined;
      if (!spellcasting) return;
      expect(spellcasting.spellAttackBonus.bonus).toBe(fantasyD20SpellAttack(data));
      expect(spellcasting.spellDC.dc).toBe(fantasyD20SpellDC(data));
    });

    it(`${template.name} stores the hit points its ancestry, class, level and Constitution give`, () => {
      const hp = data.hp as { maximum: number; current: number; ancestryHp: number; classHpPerLevel: number };
      const con = (data.attributes as { constitution: { modifier: number } }).constitution.modifier;
      expect(hp.maximum).toBe(fantasyD20MaxHitPoints(hp.ancestryHp, hp.classHpPerLevel, data.level, con));
      expect(hp.current).toBe(hp.maximum);
    });

    // A strike records its attribute, rank and item bonus, as the editor
    // writes one, and its attack bonus is what they give.
    it(`${template.name} stores each strike's parts and the attack bonus they give`, () => {
      type Strike = { name: string; attackBonus?: number; attributeModifier?: string; proficiencyRank?: string; itemBonus?: number };
      const attributes = data.attributes as Record<string, { modifier: number }>;
      for (const strike of (data.strikes ?? []) as Strike[]) {
        expect(strike).toMatchObject({ attributeModifier: expect.any(String), proficiencyRank: expect.any(String), itemBonus: expect.any(Number) });
        const expected = (attributes[strike.attributeModifier!]?.modifier ?? NaN) + fantasyD20ProficiencyBonus(data.level, strike.proficiencyRank) + strike.itemBonus!;
        expect({ strike: strike.name, attackBonus: strike.attackBonus }).toEqual({ strike: strike.name, attackBonus: expected });
      }
    });

    it(`${template.name} stores the Bulk its inventory and Strength give`, () => {
      const stored = data.bulk as { current: number; encumbered: number; maximum: number } | undefined;
      if (stored === undefined) return;
      const strength = (data.attributes as { strength?: { modifier?: number } } | undefined)?.strength?.modifier ?? 0;
      const { encumbered, maximum } = fantasyD20BulkLimits(strength);
      expect(stored).toEqual({ current: fantasyD20TotalBulk(data.inventory, data.currency).bulk, encumbered, maximum });
    });

    // The editor looks attributes up by their full name and offers the
    // traditions and casting types in lower case. A template that abbreviates
    // them has its skill totals recomputed without the attribute on first save.
    it(`${template.name} names attributes and spellcasting as the editor does`, () => {
      const attributes = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const skills = Object.values(data.skills as Record<string, { attribute: string }>).map((s) => s.attribute);
      const lore = ((data.loreSkills ?? []) as { attribute: string }[]).map((l) => l.attribute);
      const spellcasting = data.spellcasting as { tradition: string; type: string; keyAttribute: string };
      // The blank template stores no Class DC.
      const classDC = data.classDC as { keyAttribute: string } | undefined;
      const named = [...skills, ...lore, ...(classDC ? [classDC.keyAttribute] : []), spellcasting.keyAttribute];

      expect(named.filter((name) => !attributes.includes(name))).toEqual([]);
      expect(['arcane', 'divine', 'primal', 'occult']).toContain(spellcasting.tradition);
      expect(['prepared', 'spontaneous']).toContain(spellcasting.type);
    });

    it(`${template.name} stores the skill and lore totals its own components give`, () => {
      type Skill = { attribute: string; proficiencyRank: string; itemBonus?: number; armorPenalty?: number; bonus: number };
      const total = (skill: Skill) => fantasyD20SkillTotal(data, skill);
      const skills = [
        ...Object.values(data.skills as Record<string, Skill>),
        ...((data.loreSkills ?? []) as Skill[]),
      ];

      expect(skills.filter((skill) => skill.bonus !== total(skill))).toEqual([]);
    });
  }
});

/**
 * A 5E template's skill and save totals are the ones its scores give, so a
 * character made from one opens with no other bonus to explain.
 */
describe('5E templates agree with the rules maths', () => {
  for (const template of builtInTemplates(GameSystem.FIFTH_EDITION)) {
    const data = template.data as Record<string, unknown>;

    it(`${template.name} stores the skill and save totals its scores give`, () => {
      const skills = Object.keys((data.skills ?? {}) as Record<string, unknown>);
      const saves = Object.keys((data.savingThrows ?? {}) as Record<string, unknown>);
      expect(skills.filter((key) => fifthEditionBackfilledSkillOtherBonus(data, key) !== null)).toEqual([]);
      expect(saves.filter((key) => fifthEditionBackfilledSaveOtherBonus(data, key) !== null)).toEqual([]);
    });
  }
});

// The Horror d100 templates once stored a major wound of 1 for 10 hit points,
// 13 hit points where CON and SIZ gave 12, and halves rounded up. Each now
// stores what the open d100 rules work out from its characteristics.
describe('Horror d100 templates agree with the rules maths', () => {
  for (const template of builtInTemplates(GameSystem.HORROR_D100)) {
    const result = validateCharacterData(GameSystem.HORROR_D100, template.data);
    if (!result.success) throw new Error(`${template.name} does not pass its schema`);
    const data = result.data as HorrorD100Sheet;
    const c = data.characteristics;
    const lore = data.skills?.knowledge.find((row) => row.specialty === HORROR_D100_BLASPHEMOUS_LORE)?.value ?? 0;

    it(`${template.name} stores the derived attributes its characteristics give`, () => {
      const hitPoints = horrorD100MaximumHitPoints(c.CON, c.SIZ);
      expect(data.hitPoints).toEqual({ maximum: hitPoints, current: hitPoints });
      const powerPoints = horrorD100MaximumPowerPoints(c.POW);
      expect(data.powerPoints).toEqual({ maximum: powerPoints, current: powerPoints });
      // Sanity starts at five times POW (open d100 rules, p. 16, Sanity Points).
      expect(data.sanity).toEqual({ starting: c.POW * 5, maximum: horrorD100MaximumSanity(lore), current: c.POW * 5 });
      expect(data.move).toBe(HORROR_D100_HUMAN_MOVE);
    });

    it(`${template.name} gives every skill it does not raise its base chance`, () => {
      const skills = data.skills;
      if (!skills) throw new Error(`${template.name} has no skills`);
      for (const key of Object.keys(HORROR_D100_FIXED_SKILLS) as HorrorD100FixedSkillKey[]) {
        expect({ key, atLeastBase: skills[key].value >= horrorD100FixedSkillBase(key, c) }).toEqual({ key, atLeastBase: true });
      }
      expect(skills.languageOwn.value).toBeGreaterThanOrEqual(horrorD100LanguageOwnBase(c.INT, c.EDU));
    });
  }
});

// The editor fills a sheet stored without skills from the same table, so a
// blank character made either way starts the same.
it('the blank Horror d100 character has every skill at its base', () => {
  const blank = builtInTemplates(GameSystem.HORROR_D100).find((t) => t.name === 'Blank Horror d100 Character');
  const { characteristics } = blank?.data as { characteristics: { DEX: number; INT: number; POW: number; EDU: number } };
  expect(blank?.data.skills).toEqual({
    ...horrorD100NewSkills(characteristics),
    knowledge: [{ specialty: HORROR_D100_BLASPHEMOUS_LORE, value: 0, experienceCheck: false }],
  });
});
