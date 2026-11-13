/**
 * The example characters are built from their systems' open rules.
 *
 * Every built-in template and every file in `Examples/` names only rules
 * elements its system's open rules have, each recorded in OPEN_CONTENT_NAMES
 * with where it is: its class, ancestry and the rest, its features, spells,
 * items and attacks, and the proficiencies, languages, conditions, weapon
 * properties or traits, possessions and skill specialisations it lists. A Fantasy d20 example leaves alignment and deity empty,
 * for the player to fill. And every example is a sheet its
 * schema keeps whole, so what it shows is what a player gets.
 */

import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { GameSystem, SUPPORTED_GAME_SYSTEMS, isSupportedGameSystem, type SupportedGameSystem } from '../../../game-systems';
import { validateCharacterData } from '../../../validators/game-systems';
import { builtInTemplates } from '../../../__tests__/helpers/builtInTemplates';
import { OPEN_CONTENT_NAMES } from '../../../__tests__/helpers/openContentNames';
import {
  HORROR_D100_BLASPHEMOUS_LORE, HORROR_D100_FIXED_SKILLS, HORROR_D100_SPECIALISED_SKILLS,
  horrorD100FixedSkillBase, horrorD100LanguageOwnBase, type HorrorD100FixedSkillKey,
} from '../../rules/horrorD100';
import { OLD_STORY_TITLES } from '../../../legacy/horrorD100Sheet';

type Sheet = Record<string, unknown>;

interface Example {
  label: string;
  system: SupportedGameSystem;
  data: Sheet;
}

const EXAMPLES_DIR = path.resolve(__dirname, '../../../../..', 'Examples');

function exampleFiles(): Example[] {
  return readdirSync(EXAMPLES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const parsed = JSON.parse(readFileSync(path.join(EXAMPLES_DIR, file), 'utf8')) as {
        character?: { gameSystem?: unknown; data?: Sheet };
      };
      const system = parsed.character?.gameSystem;
      if (!isSupportedGameSystem(system)) throw new Error(`Examples/${file} names no supported game system`);
      return { label: `Examples/${file}`, system, data: parsed.character?.data ?? {} };
    });
}

const SYSTEM_NAMES: Record<SupportedGameSystem, string> = {
  [GameSystem.FIFTH_EDITION]: '5E',
  [GameSystem.FANTASY_D20]: 'Fantasy d20',
  [GameSystem.HORROR_D100]: 'Horror d100',
};

const EXAMPLES: Example[] = [
  ...SUPPORTED_GAME_SYSTEMS.flatMap((system) =>
    builtInTemplates(system).map((t) => ({ label: `the ${SYSTEM_NAMES[system]} template "${t.name}"`, system, data: t.data }))
  ),
  ...exampleFiles(),
];

/** `value` when it is a plain object, or an empty one. */
function record(value: unknown): Sheet {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Sheet) : {};
}

/** `value[key]` when `value` is a plain object. */
function at(value: unknown, key: string): unknown {
  return record(value)[key];
}

/** A filled-in text field, as a list of none or one. */
function text(value: unknown): string[] {
  return typeof value === 'string' && value.trim() !== '' ? [value] : [];
}

/** The names in a list whose entries are a string or an object holding `key`. */
function names(value: unknown, key = 'name'): string[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => (typeof entry === 'string' ? text(entry) : text(at(entry, key))));
}

/** The entries of a free-text box that lists several, split at commas, semicolons and line breaks. */
function entries(value: unknown): string[] {
  return text(value).flatMap((box) => box.split(/[,;\n]/)).map((entry) => entry.trim().replace(/^and\s+/i, '')).filter(Boolean);
}

/** The names each entry of a list holds in its own list at `key`. */
function namesWithin(value: unknown, key: string): string[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => names(at(entry, key)));
}

/** The values each system stores at the places a sheet names a rules element. */
const RULES_ELEMENTS: Record<SupportedGameSystem, (sheet: Sheet) => string[]> = {
  [GameSystem.FIFTH_EDITION]: (d) => [
    ...text(d.class),
    ...text(d.race),
    ...text(d.background),
    ...names(d.hitDice, 'class'),
    ...names(d.featuresAndTraits),
    ...text(at(d.spellcasting, 'class')),
    ...names(at(d.spellcasting, 'cantrips')),
    ...names(at(d.spellcasting, 'spells')),
    ...names(d.customSkills),
    ...names(d.inventory),
    ...names(d.attacks),
    ...namesWithin(d.attacks, 'properties'),
    ...names(d.proficienciesAndLanguages).flatMap(entries),
    ...['armor', 'weapons', 'tools'].flatMap((key) => entries(at(d.proficiencies, key))),
    ...names(d.conditions),
  ],
  [GameSystem.FANTASY_D20]: (d) => [
    ...text(d.ancestry),
    ...text(d.heritage),
    ...text(d.background),
    ...text(d.class),
    ...names(at(d.perception, 'senses')),
    ...names(d.loreSkills),
    ...Object.values(record(d.feats)).flatMap((feats) => names(feats)),
    ...names(d.classFeatures),
    ...['cantrips', 'spells', 'innateSpells', 'rituals'].flatMap((key) => names(at(d.spellcasting, key))),
    ...names(at(at(d.spellcasting, 'focusSpells'), 'spells')),
    ...names(d.inventory),
    ...names(d.strikes),
    ...namesWithin(d.strikes, 'traits'),
    ...names(d.conditions),
    ...names(d.languages),
  ],
  [GameSystem.HORROR_D100]: (d) => [
    ...text(d.profession),
    ...names(at(d.skills, 'own')),
    // The other languages are the world's, not the rules'.
    ...Object.keys(HORROR_D100_SPECIALISED_SKILLS)
      .filter((key) => key !== 'languageOther')
      .flatMap((key) => names(at(d.skills, key), 'specialty')),
    ...names(d.spells),
    ...names(d.weapons),
    ...names(d.weapons, 'skill'),
    ...names(d.armor),
    ...names(d.possessions),
  ],
};

/** The highest rating a starting skill is raised to at the normal power level (open d100 rules, p. 8, Step Seven: Profession and Skills). */
const STARTING_SKILL_LIMIT = 75;

/**
 * The skills of the professions the Horror d100 examples have, as the sheet
 * names them: those the profession lists, and those each example chose where
 * it lets a player choose (open d100 rules, p. 22, Detective; p. 25,
 * Scholar). A Language (Other) counts under that name whatever the language.
 */
const STARTING_PROFESSION_SKILLS: Record<string, readonly string[]> = {
  // Its six, and Brawl, Insight, Stealth and Track of those it offers.
  Detective: ['Firearm (Handgun)', 'Knowledge (Law)', 'Listen', 'Persuade', 'Spot', 'Research', 'Brawl', 'Insight', 'Stealth', 'Track'],
  // Its five, and five Knowledge skills of the field of study.
  Scholar: [
    'Language (Other)', 'Language (Own)', 'Persuade', 'Research', 'Teach',
    'Knowledge (History)', 'Knowledge (Archaeology)', 'Knowledge (Anthropology)', 'Knowledge (Occult)', 'Knowledge (Natural History)',
  ],
  // The blank sheet raises nothing.
  Student: [],
};

/** The base chance of a weapon skill's specialty the examples hold (open d100 rules, p. 202, Modern Missile Weapons: a revolver's base chance). */
const WEAPON_SPECIALTY_BASE: Record<string, number> = { 'Firearm (Handgun)': 20 };

/** Every key path in a plain-object tree, arrays descended by index. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value as Sheet).flatMap(([key, child]) => {
      const keyPath = prefix ? `${prefix}.${key}` : key;
      return [keyPath, ...keyPaths(child, keyPath)];
    });
  }
  return [];
}

describe('the example characters', () => {
  it('include every system\'s templates, and the files in Examples/', () => {
    for (const system of SUPPORTED_GAME_SYSTEMS) {
      expect(EXAMPLES.filter((e) => e.system === system && !e.label.startsWith('Examples/')).length).toBeGreaterThan(0);
    }
    expect(EXAMPLES.filter((e) => e.label.startsWith('Examples/')).length).toBeGreaterThan(0);
  });

  describe.each(EXAMPLES.map((e) => [e.label, e] as const))('%s', (_label, example) => {
    it('names only rules elements its open rules have', () => {
      const listed = OPEN_CONTENT_NAMES[example.system];
      expect(RULES_ELEMENTS[example.system](example.data).filter((name) => !listed.has(name))).toEqual([]);
    });

    it('is a sheet its schema accepts and keeps whole', () => {
      const result = validateCharacterData(example.system, example.data);
      if (!result.success) throw new Error(JSON.stringify(result.errors.issues.slice(0, 4)));
      const kept = new Set(keyPaths(result.data));
      expect(keyPaths(example.data).filter((keyPath) => !kept.has(keyPath))).toEqual([]);
    });

    // A weapon's Ammo is the rounds loaded in it, so no more than the notes
    // say it holds; spare rounds are written in its notes.
    if (example.system === GameSystem.HORROR_D100) {
      it('loads no weapon with more rounds than it holds', () => {
        const weapons = example.data.weapons;
        const overloaded = (Array.isArray(weapons) ? weapons : []).flatMap((weapon) => {
          const holds = /(\d+)-round/.exec(text(at(weapon, 'notes'))[0] ?? '');
          const ammo = at(weapon, 'ammo');
          return holds && typeof ammo === 'number' && ammo > Number(holds[1]) ? [`${String(at(weapon, 'name'))}: ${ammo} in ${holds[1]}`] : [];
        });
        expect(overloaded).toEqual([]);
      });
    }

    if (example.system === GameSystem.HORROR_D100) {
      // A character built on the open d100 rules starts each skill at its
      // base chance and adds points, so none is below it (open d100 rules,
      // pp. 33-34, Alphabetical Skill List). Blasphemous Lore starts at 0.
      it('rates no skill below its base chance', () => {
        const skills = record(example.data.skills);
        const characteristics = record(example.data.characteristics);
        const number = (value: unknown) => (typeof value === 'number' ? value : undefined);
        const [DEX, INT, POW, EDU] = ['DEX', 'INT', 'POW', 'EDU'].map((key) => number(characteristics[key]));
        const below: string[] = [];
        const check = (name: string, entry: unknown, base: number) => {
          const value = number(at(entry, 'value'));
          if (value !== undefined && value < base) below.push(`${name}: ${value}, base ${base}`);
        };
        for (const key of Object.keys(HORROR_D100_FIXED_SKILLS) as HorrorD100FixedSkillKey[]) {
          if (skills[key] !== undefined) check(HORROR_D100_FIXED_SKILLS[key].name, skills[key], horrorD100FixedSkillBase(key, { DEX, INT, POW }));
        }
        if (skills.languageOwn !== undefined) check('Language (Own)', skills.languageOwn, horrorD100LanguageOwnBase(INT ?? 0, EDU));
        for (const [key, skill] of Object.entries(HORROR_D100_SPECIALISED_SKILLS)) {
          for (const entry of Array.isArray(skills[key]) ? (skills[key] as unknown[]) : []) {
            const specialty = String(at(entry, 'specialty'));
            const base = key === 'knowledge' && specialty === HORROR_D100_BLASPHEMOUS_LORE ? 0 : skill.base;
            if (base !== null) check(`${skill.name} (${specialty})`, entry, base);
          }
        }
        expect(below).toEqual([]);
      });

      // A starting character's skill points (open d100 rules, p. 8, Step
      // Seven: Profession and Skills; p. 9, Education (Option)). At the
      // normal power level the professional pool is 20 times EDU where the
      // sheet uses EDU, and 250 points where it does not; it goes to the
      // profession's skills. The personal pool is 10 times INT and goes to
      // any skill. No skill is raised past 75%. An example that raises a
      // skill spends both pools exactly.
      it('spends exactly the skill points the rules give a starting character', () => {
        const skills = record(example.data.skills);
        const characteristics = record(example.data.characteristics);
        const number = (value: unknown) => (typeof value === 'number' ? value : undefined);
        const [DEX, INT, POW, EDU] = ['DEX', 'INT', 'POW', 'EDU'].map((key) => number(characteristics[key]));
        const profession = STARTING_PROFESSION_SKILLS[String(example.data.profession)];
        if (profession === undefined) throw new Error(`No skill list recorded for the profession ${String(example.data.profession)}`);
        let onProfession = 0;
        let elsewhere = 0;
        const pastLimit: string[] = [];
        const spend = (name: string, entry: unknown, base: number) => {
          const points = (number(at(entry, 'value')) ?? base) - base;
          if (points > 0 && base + points > STARTING_SKILL_LIMIT) pastLimit.push(`${name}: ${base + points}`);
          if (profession.includes(name)) onProfession += points;
          else elsewhere += points;
        };
        for (const key of Object.keys(HORROR_D100_FIXED_SKILLS) as HorrorD100FixedSkillKey[]) {
          if (skills[key] !== undefined) spend(HORROR_D100_FIXED_SKILLS[key].name, skills[key], horrorD100FixedSkillBase(key, { DEX, INT, POW }));
        }
        if (skills.languageOwn !== undefined) spend('Language (Own)', skills.languageOwn, horrorD100LanguageOwnBase(INT ?? 0, EDU));
        for (const [key, skill] of Object.entries(HORROR_D100_SPECIALISED_SKILLS)) {
          for (const entry of Array.isArray(skills[key]) ? (skills[key] as unknown[]) : []) {
            const specialty = String(at(entry, 'specialty'));
            const name = `${skill.name} (${specialty})`;
            const base = key === 'knowledge' && specialty === HORROR_D100_BLASPHEMOUS_LORE ? 0 : skill.base ?? WEAPON_SPECIALTY_BASE[name];
            if (base === undefined) throw new Error(`No base chance recorded for ${name}`);
            spend(skill.name === 'Language (Other)' ? skill.name : name, entry, base);
          }
        }
        // A skill of the character's own has no base chance, so its whole rating is bought.
        for (const entry of Array.isArray(skills.own) ? (skills.own as unknown[]) : []) spend(String(at(entry, 'name')), entry, 0);

        const professional = EDU === undefined ? 250 : EDU * 20;
        const personal = (INT ?? 0) * 10;
        expect(pastLimit).toEqual([]);
        if (onProfession + elsewhere === 0) return;
        expect({ spent: onProfession + elsewhere, outsideTheProfession: elsewhere <= personal })
          .toEqual({ spent: professional + personal, outsideTheProfession: true });
      });

      // The fist's range in the rules' table (open d100 rules, p. 197,
      // Primitive Melee Weapons); "Touch" is a spell's range there.
      it('gives a fist the range the rules\' weapon table gives it', () => {
        const fists = (Array.isArray(example.data.weapons) ? example.data.weapons : []).filter((weapon) => at(weapon, 'name') === 'Fist');
        expect(fists.map((weapon) => ({ damage: at(weapon, 'damage'), range: at(weapon, 'range') })))
          .toEqual(fists.map(() => ({ damage: '1D3+dm', range: 'Short' })));
      });

      // The sheet before 1.7.0 had eleven fixed boxes for a character's
      // story. An example shows the notes as they are now: a few, with titles
      // written for this character.
      it('tells its story in a few notes of its own, none titled as a box of the sheet before 1.7.0 was', () => {
        const titles = names(example.data.story, 'title');
        expect(titles.length).toBeLessThanOrEqual(4);
        expect(titles.filter((title) => OLD_STORY_TITLES.includes(title))).toEqual([]);
      });
    }

    if (example.system === GameSystem.FANTASY_D20) {
      it('leaves alignment and deity for the player to add', () => {
        expect(Object.keys(example.data).filter((key) => key === 'alignment' || key === 'deity')).toEqual([]);
      });
    }
  });

  // The list holds the names the examples use, each with its source.
  it.each(SUPPORTED_GAME_SYSTEMS.map((system) => [SYSTEM_NAMES[system], system] as const))('%s: every listed name is used and has a source', (_name, system) => {
    const used = new Set(EXAMPLES.filter((e) => e.system === system).flatMap((e) => RULES_ELEMENTS[system](e.data)));
    const listed = [...OPEN_CONTENT_NAMES[system].entries()];
    expect(listed.filter(([name]) => !used.has(name)).map(([name]) => name)).toEqual([]);
    expect(listed.filter(([, source]) => source.trim() === '').map(([name]) => name)).toEqual([]);
  });
});
