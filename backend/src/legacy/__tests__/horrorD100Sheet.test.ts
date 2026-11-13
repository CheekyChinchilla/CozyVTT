/**
 * The conversion of a Horror d100 sheet from the shape versions before 1.7.0
 * stored into the sheet rebuilt on the open d100 rules.
 *
 * One fixture per version a database can start from (the templates and the
 * example files of 1.3.0, 1.5.0 and 1.6.0, and a sheet from before 1.3.0
 * naming its player `player`), and the rows a database can hold that no
 * version wrote: a malformed row, and text over today's limits. Each is
 * small, hand-written, and in the old sheet's own keys.
 */

import fs from 'fs';
import path from 'path';
import { OLD_ONLY_KEYS, OLD_ONLY_SKILLS, OLD_SKILL_ORDER, convertHorrorD100Sheet, isOldHorrorD100Sheet } from '../horrorD100Sheet';
import { HorrorD100SheetSchema, type HorrorD100Sheet } from '../../validators/game-systems/horrorD100Sheet.schema';
import { horrorD100CharacterDataSchema } from '../horrorD100OldSheet.schema';
import { fifthEditionCharacterDataSchema } from '../../validators/game-systems/fifthEdition.schema';
import { fantasyD20CharacterDataSchema } from '../../validators/game-systems/fantasyD20.schema';
import { flexibleCharacterDataSchema } from '../../validators/game-systems/flexible.schema';
import { SHEET_LIST_MAX, SHEET_LONG_TEXT_MAX } from '../../validators/game-systems/sheetLimits';
import { GameSystem } from '../../game-systems';
import { builtInTemplates } from '../../__tests__/helpers/builtInTemplates';
import { FLEXIBLE_TEMPLATES } from '../../utils/character-templates/flexible-templates';
import { normaliseGameSystem } from '../gameSystemAliases';
import { horrorD100NewSkills } from '../../utils/rules/horrorD100';

type Fields = Record<string, unknown>;

const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');
const NOW = new Date('2026-11-12T08:00:00.000Z');

/** Every fixture an older version could have stored as it is. */
const STORED_BY_A_VERSION = ['v1.3.0-detective', 'v1.5.0-blank', 'v1.6.0-detective-played', 'v1.6.0-example', 'v1.6.0-example-minimal', 'pre-1.3.0-player'];
const ALL_FIXTURES = [...STORED_BY_A_VERSION, 'malformed'];

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixture(name: string): Fields {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
  if (!isFields(parsed)) throw new Error(`${name}.json does not hold a sheet`);
  return parsed;
}

/** The converted sheet as the conversion wrote it, and what it listed. */
function convert(data: unknown): { sheet: unknown; kept: string[] } {
  return convertHorrorD100Sheet(data, NOW);
}

/** The converted sheet, read through the new schema, which it must pass. */
function converted(data: unknown): { sheet: HorrorD100Sheet; kept: string[] } {
  const { sheet, kept } = convert(data);
  const result = HorrorD100SheetSchema.safeParse(sheet);
  if (!result.success) throw new Error(`the converted sheet does not pass the schema: ${JSON.stringify(result.error.issues, null, 2)}`);
  return { sheet: result.data, kept };
}

/** A copy of an old sheet with one value at `at` replaced. */
function withValue(sheet: Fields, at: (string | number)[], value: unknown): Fields {
  const copy: unknown = JSON.parse(JSON.stringify(sheet));
  let node: unknown = copy;
  for (const step of at.slice(0, -1)) node = (isFields(node) || Array.isArray(node)) ? (node as Record<string | number, unknown>)[step] : undefined;
  const last = at[at.length - 1];
  if (Array.isArray(node) && typeof last === 'number') node[last] = value;
  else if (isFields(node)) node[String(last)] = value;
  if (!isFields(copy)) throw new Error('not a sheet');
  return copy;
}

/** Every string a value holds, with where it is. */
function strings(value: unknown, at: string[] = []): { at: string[]; text: string }[] {
  if (typeof value === 'string') return [{ at, text: value }];
  if (Array.isArray(value)) return value.flatMap((entry, i) => strings(entry, [...at, String(i)]));
  if (isFields(value)) return Object.entries(value).flatMap(([key, entry]) => strings(entry, [...at, key]));
  return [];
}

/** Every key a value's objects have. */
function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (isFields(value)) return Object.entries(value).flatMap(([key, entry]) => [key, ...keys(entry)]);
  return [];
}

/** Every path to a value inside a sheet, its objects and lists included. */
function paths(value: unknown, at: (string | number)[] = []): (string | number)[][] {
  const below = Array.isArray(value)
    ? value.flatMap((entry, i) => paths(entry, [...at, i]))
    : isFields(value) ? Object.entries(value).flatMap(([key, entry]) => paths(entry, [...at, key])) : [];
  return at.length > 0 ? [at, ...below] : below;
}

/** Every number a value holds. */
function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (isFields(value)) return Object.values(value).flatMap(numbers);
  return [];
}

/**
 * The strings of the old sheet that the converted one holds nowhere. A
 * formula note, which only repeated the old rules, is the one string the
 * conversion drops; an empty string holds nothing; a string holding only a
 * number is read as that number. A string of white space alone must be found
 * as it is, in a value or listed.
 */
function lostStrings(old: Fields, result: unknown): string[] {
  const kept = strings(result).map((found) => found.text);
  const keptNumbers = numbers(result);
  const found = (text: string) => text.trim() === ''
    ? kept.some((value) => value === text || value.endsWith(`: ${JSON.stringify(text)}`) || value.includes(`(${text})`) || value.endsWith(`\n${text}`))
    : kept.some((value) => value.includes(text) || value.includes(JSON.stringify(text).slice(1, -1)));
  return strings(old)
    .filter(({ at, text }) => at[at.length - 1] !== 'formula' && text !== '')
    .map(({ text }) => text)
    .filter((text) => !(/^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(text) && keptNumbers.includes(Number(text))))
    .filter((text) => !found(text));
}

describe('which sheets are in the shape before 1.7.0', () => {
  it.each(ALL_FIXTURES)('%s is', (name) => {
    expect(isOldHorrorD100Sheet(fixture(name))).toBe(true);
  });

  it('is told by a characteristic\'s shape when nothing else names the old sheet', () => {
    expect(isOldHorrorD100Sheet({ characteristics: { STR: { regular: 60 } } })).toBe(true);
    expect(isOldHorrorD100Sheet({ characteristics: { APP: 50 } })).toBe(true);
    expect(isOldHorrorD100Sheet({ skills: { spotHidden: { currentValue: 50 } } })).toBe(true);
  });

  it('is not a converted sheet, a sheet made in the new shape, or anything that is no sheet', () => {
    expect(isOldHorrorD100Sheet(convert(fixture('v1.6.0-example')).sheet)).toBe(false);
    expect(isOldHorrorD100Sheet({ characterName: 'Ada', profession: 'Detective', era: 'Modern', characteristics: { STR: 12 } })).toBe(false);
    for (const value of [null, undefined, [], 'sheet', 42, {}]) expect(isOldHorrorD100Sheet(value)).toBe(false);
  });

  it('is never a sheet that carries the conversion record, whatever else it holds', () => {
    expect(isOldHorrorD100Sheet({ ...fixture('v1.6.0-example'), converted: { from: 1 } })).toBe(false);
  });
});

describe('a sheet of another game system', () => {
  const EXAMPLES = path.join(__dirname, '../../../../Examples');
  const exampleSheets: [string, unknown][] = fs.readdirSync(EXAMPLES)
    .filter((file) => file.endsWith('.json'))
    .map((file): [string, unknown] => {
      const parsed: unknown = JSON.parse(fs.readFileSync(path.join(EXAMPLES, file), 'utf8'));
      const character = isFields(parsed) && isFields(parsed.character) ? parsed.character : {};
      return [`Examples/${file}`, normaliseGameSystem(character.gameSystem) === GameSystem.HORROR_D100 ? undefined : character.data];
    })
    .filter(([, data]) => data !== undefined);
  const others: [string, unknown][] = [
    ...builtInTemplates(GameSystem.FIFTH_EDITION).map((template): [string, unknown] => [`the 5E template ${template.name}`, template.data]),
    ...builtInTemplates(GameSystem.FANTASY_D20).map((template): [string, unknown] => [`the Fantasy d20 template ${template.name}`, template.data]),
    ...Object.entries(FLEXIBLE_TEMPLATES).map(([name, make]): [string, unknown] => [`the Flexible template ${name}`, make().data]),
    ...exampleSheets,
  ];

  it('is read from every 5E, Fantasy d20 and Flexible template and example file', () => {
    expect(exampleSheets.length).toBe(4);
    expect(others.length).toBeGreaterThanOrEqual(10);
  });

  it.each(others)('%s is not an old Horror d100 sheet, and the conversion leaves it as it is', (_label, data) => {
    const before = JSON.stringify(data);
    expect(isOldHorrorD100Sheet(data)).toBe(false);
    expect(convert(data)).toEqual({ sheet: data, kept: [], keptLabels: [] });
    expect(convert(data).sheet).toBe(data);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('cannot carry a key that tells an old Horror d100 sheet, by what its schema stores', () => {
    for (const schema of [fifthEditionCharacterDataSchema, fantasyD20CharacterDataSchema, flexibleCharacterDataSchema]) {
      const declared = Object.keys(schema.shape);
      expect(declared.filter((key) => OLD_ONLY_KEYS.includes(key) || key === 'characteristics' || key === 'derivedStats')).toEqual([]);
    }
    expect(Object.keys(HorrorD100SheetSchema.shape).filter((key) => OLD_ONLY_KEYS.includes(key) || key === 'derivedStats')).toEqual([]);
    for (const skills of [fifthEditionCharacterDataSchema.shape.skills, fantasyD20CharacterDataSchema.shape.skills, HorrorD100SheetSchema.shape.skills]) {
      expect(Object.keys(skills.unwrap().shape).filter((key) => OLD_ONLY_SKILLS.includes(key))).toEqual([]);
    }
  });

  it('is not told by a key the other sheets share with the old one', () => {
    expect(isOldHorrorD100Sheet({ characterName: 'Ada', backstory: 'Grew up by the sea.', playerName: 'Sam' })).toBe(false);
    expect(isOldHorrorD100Sheet({ skills: { history: { proficient: true }, survival: { proficient: false }, occult: {}, law: {} } })).toBe(false);
    expect(isOldHorrorD100Sheet({ characterName: 'Ada', customSkills: [{ name: 'Gaming set' }], player: 'Sam', combat: {} })).toBe(false);
    expect(isOldHorrorD100Sheet({ characteristics: { STR: 12, EDU: 14 } })).toBe(false);
    // The unreleased system's sheet, which 1.7.0 leaves with no system, names a
    // skill firearms in a shape of its own, beside derived attributes of its own.
    expect(isOldHorrorD100Sheet({ skills: { firearms: { rank: 6, linkedAttribute: 'agility' } }, derivedStats: { initiative: 8 } })).toBe(false);
  });

  it('is told by a skill key only the old sheet has, in the old sheet\'s row', () => {
    expect(isOldHorrorD100Sheet({ skills: { firearms: { handgun: { baseValue: 20, currentValue: 35 } } } })).toBe(true);
    expect(isOldHorrorD100Sheet({ skills: { creditRating: { baseValue: 0, currentValue: 30 } } })).toBe(true);
    expect(isOldHorrorD100Sheet({ derivedStats: { magicPoints: { maximum: 12, current: 12 } } })).toBe(true);
  });
});

describe('the characteristics', () => {
  it('are divided by 5 and rounded to nearest: STR 60 to 12, 62 to 12, 63 to 13, APP 65 to CHA 13', () => {
    const regular = (value: number) => ({ regular: value, half: Math.floor(value / 2), fifth: Math.floor(value / 5) });
    const old = withValue(fixture('v1.6.0-example-minimal'), ['characteristics'], {
      STR: regular(60), CON: regular(62), SIZ: regular(63), DEX: regular(98), APP: regular(65), INT: regular(100), POW: regular(2), EDU: regular(7),
    });
    expect(converted(old).sheet.characteristics).toEqual({ STR: 12, CON: 12, SIZ: 13, DEX: 20, CHA: 13, INT: 20, POW: 0, EDU: 1 });
  });

  it('come out so for each fixture of an older version', () => {
    expect(converted(fixture('v1.3.0-detective')).sheet.characteristics).toEqual({ STR: 12, CON: 12, SIZ: 13, DEX: 14, CHA: 11, INT: 14, POW: 12, EDU: 13 });
    expect(converted(fixture('v1.5.0-blank')).sheet.characteristics).toEqual({ STR: 10, CON: 10, SIZ: 10, DEX: 10, CHA: 10, INT: 10, POW: 10, EDU: 10 });
    expect(converted(fixture('v1.6.0-example')).sheet.characteristics).toEqual({ STR: 9, CON: 11, SIZ: 10, DEX: 10, CHA: 13, INT: 16, POW: 12, EDU: 17 });
    expect(converted(fixture('pre-1.3.0-player')).sheet.characteristics).toEqual({ STR: 8, CON: 14, SIZ: 9, DEX: 12, CHA: 13, INT: 15, POW: 11, EDU: 14 });
  });

  it('keep their original values in the conversion record, under CozyVTT\'s names', () => {
    expect(converted(fixture('v1.6.0-example')).sheet.converted?.characteristics).toEqual({
      STR: 45, CON: 55, SIZ: 50, DEX: 50, CHA: 65, INT: 80, POW: 60, EDU: 85,
    });
  });

  it('keep a value below the open range', () => {
    const old = withValue(fixture('v1.6.0-example-minimal'), ['characteristics', 'SIZ'], { regular: 20, half: 10, fifth: 4 });
    expect(converted(old).sheet.characteristics.SIZ).toBe(4);
  });

  it('leave EDU out where the old sheet had none', () => {
    const old = fixture('v1.6.0-example-minimal');
    const characteristics = old.characteristics;
    if (!isFields(characteristics)) throw new Error('no characteristics');
    delete characteristics.EDU;
    expect(converted(old).sheet.characteristics).not.toHaveProperty('EDU');
  });

  it('leave out a value that is not a number, and list it', () => {
    const { sheet, kept } = convert(fixture('malformed'));
    expect(isFields(sheet) && sheet.characteristics).toEqual({ CON: 11, SIZ: 13, DEX: 10, POW: 12 });
    expect(kept).toContain('STR: "sixty"');
  });
});

describe('hit points and power points', () => {
  it('are worked out on the new characteristics, keeping the damage taken and the points spent', () => {
    const { sheet } = converted(fixture('v1.6.0-detective-played'));
    // CON 12 and SIZ 13: 25 halved and rounded up. Five points of damage taken.
    expect(sheet.hitPoints).toEqual({ maximum: 13, current: 8 });
    // POW 12; eight points spent.
    expect(sheet.powerPoints).toEqual({ maximum: 12, current: 4 });
    expect(sheet.converted?.hitPoints).toEqual({ maximum: 12, current: 7 });
    expect(sheet.converted?.powerPoints).toEqual({ maximum: 12, current: 4 });
  });

  it('let hit points go below 0, as the rules track them, and power points not', () => {
    let old = withValue(fixture('v1.6.0-detective-played'), ['derivedStats', 'hp'], { maximum: 12, current: -2, formula: '', majorWoundThreshold: 6 });
    old = withValue(old, ['characteristics', 'POW'], { regular: 45, half: 22, fifth: 9 });
    old = withValue(old, ['derivedStats', 'magicPoints'], { maximum: 10, current: 0, formula: '' });
    const { sheet } = converted(old);
    expect(sheet.hitPoints).toEqual({ maximum: 13, current: -1 });
    expect(sheet.powerPoints).toEqual({ maximum: 9, current: 0 });
  });

  it('are full on a sheet that took no damage', () => {
    expect(converted(fixture('pre-1.3.0-player')).sheet.hitPoints).toEqual({ maximum: 12, current: 12 });
    expect(converted(fixture('v1.5.0-blank')).sheet.hitPoints).toEqual({ maximum: 10, current: 10 });
  });

  it('are left for the sheet to work out where the old sheet had none', () => {
    const { sheet } = converted(fixture('v1.6.0-example-minimal'));
    expect(sheet).not.toHaveProperty('hitPoints');
    expect(sheet).not.toHaveProperty('powerPoints');
    expect(sheet).not.toHaveProperty('sanity');
    expect(sheet).not.toHaveProperty('move');
  });
});

describe('Blasphemous Lore and Sanity', () => {
  it('take the larger of the lore skill and the score beside the spells, and set maximum Sanity from it', () => {
    const { sheet } = converted(fixture('v1.6.0-detective-played'));
    expect(sheet.skills?.knowledge.find((entry) => entry.specialty === 'Blasphemous Lore')).toEqual({
      specialty: 'Blasphemous Lore', value: 6, experienceCheck: false, notes: 'Saw too much',
    });
    // 100 less 6; starting Sanity and current Sanity kept as stored.
    expect(sheet.sanity).toEqual({ starting: 60, maximum: 94, current: 52 });
  });

  it('bring current Sanity down to the new maximum, keeping the old number in the record', () => {
    // Lore skill 4 and box 6: the old sheet's maximum was 95, the new one is 94.
    const old = withValue(fixture('v1.6.0-detective-played'), ['derivedStats', 'sanity'], { starting: 60, maximum: 95, current: 95, formula: 'POW' });
    const { sheet } = converted(old);
    expect(sheet.sanity).toEqual({ starting: 60, maximum: 94, current: 94 });
    expect(sheet.converted?.sanity).toEqual({ starting: 60, maximum: 95, current: 95 });
  });

  it('keep both lore values in the conversion record', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.converted?.skills ?? [];
    expect(skills).toContainEqual({ name: 'Knowledge (Blasphemous Lore)', value: 4 });
    expect(skills).toContainEqual({ name: 'Knowledge (Blasphemous Lore), as noted beside the spells', value: 6 });
  });

  it('cap the lore at 99, which leaves a maximum Sanity of 1', () => {
    let old = withValue(fixture('v1.6.0-example'), ['skills', 'cthulhuMythos', 'currentValue'], 100);
    old = withValue(old, ['spellsAndMythos', 'cthulhuMythos'], 50);
    old = withValue(old, ['derivedStats', 'sanity'], { starting: 60, maximum: 0, current: 0, formula: '' });
    const { sheet } = converted(old);
    expect(sheet.skills?.knowledge.find((entry) => entry.specialty === 'Blasphemous Lore')?.value).toBe(99);
    expect(sheet.sanity?.maximum).toBe(1);
  });

  it('build the skills block at base for lore known only from the score beside the spells', () => {
    const old = withValue(fixture('v1.6.0-example-minimal'), ['spellsAndMythos'], { cthulhuMythos: 7, spells: [] });
    const { sheet } = converted(old);
    expect(sheet.skills).toEqual({
      ...horrorD100NewSkills(sheet.characteristics),
      knowledge: [{ specialty: 'Blasphemous Lore', value: 7, experienceCheck: false }],
    });
    expect(sheet.converted?.skills).toEqual([{ name: 'Knowledge (Blasphemous Lore), as noted beside the spells', value: 7 }]);
    expect(converted(fixture('v1.6.0-example-minimal')).sheet).not.toHaveProperty('skills');
  });

  it('give a maximum Sanity of 99 to a character with none', () => {
    expect(converted(fixture('v1.5.0-blank')).sheet.sanity).toEqual({ starting: 50, maximum: 99, current: 50 });
    expect(converted(fixture('v1.6.0-example')).sheet.sanity).toEqual({ starting: 60, maximum: 97, current: 58 });
  });
});

describe('MOV, the damage modifier, build and Luck', () => {
  it('set MOV to 10 and keep the old move rate, damage modifier, build and Luck in the record', () => {
    const { sheet } = converted(fixture('v1.6.0-detective-played'));
    expect(sheet.move).toBe(10);
    expect(sheet.converted).toMatchObject({ move: 8, damageModifier: '+1d4', build: 1, luck: 41 });
    expect(sheet).not.toHaveProperty('damageModifier');
  });

  it('turn Luck\'s notes into a story note', () => {
    expect(converted(fixture('v1.6.0-detective-played')).sheet.story).toContainEqual({ title: 'Luck', text: 'Spent 14 on the warehouse job.' });
  });
});

describe('the skills', () => {
  it('keep every rating exactly as saved, under the skill each becomes, below the new base too', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    expect(skills).toMatchObject({
      appraise: { value: 5 }, climb: { value: 20 }, disguise: { value: 30 }, dodge: { value: 35 }, fastTalk: { value: 40 },
      firstAid: { value: 30 }, jump: { value: 20 }, listen: { value: 50 }, medicine: { value: 1 }, navigate: { value: 10 },
      persuade: { value: 50 }, sleightOfHand: { value: 30 }, stealth: { value: 45 }, swim: { value: 20 }, throw: { value: 20 },
      track: { value: 40 }, brawl: { value: 50 }, research: { value: 50 }, psychotherapy: { value: 1 },
    });
  });

  it('move Locksmith to Fine Manipulation, Psychology to Insight, Natural World to Knowledge (Natural History) and Handgun to Firearm (Handgun)', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    expect(skills?.fineManipulation).toEqual({ value: 45, experienceCheck: false });
    expect(skills?.insight).toEqual({ value: 55, experienceCheck: true });
    expect(skills?.knowledge).toContainEqual({ specialty: 'Natural History', value: 30, experienceCheck: false });
    expect(skills?.firearm).toContainEqual({ specialty: 'Handgun', value: 55, experienceCheck: true });
  });

  it('put each skill the open rules hold as a specialty in its list, keeping specialisations as typed', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    const rated = (specialty: string, value: number, experienceCheck = false) => ({ specialty, value, experienceCheck });
    expect(skills?.knowledge).toEqual([
      rated('Accounting', 10), rated('Anthropology', 1), rated('Archaeology', 1),
      { ...rated('Blasphemous Lore', 6), notes: 'Saw too much' },
      rated('History', 5), rated('Law', 40), rated('Natural History', 30), rated('Occult', 5),
    ]);
    expect(skills?.drive).toEqual([rated('Automobile', 45)]);
    expect(skills?.repair).toEqual([rated('Electrical', 15), rated('Mechanical', 10)]);
    expect(skills?.firearm).toEqual([rated('Handgun', 55, true), rated('Rifle', 25), rated('Shotgun', 30), rated('Bow', 18)]);
    expect(skills?.meleeWeapon).toEqual([rated('Knife', 40)]);
    expect(skills?.heavyMachine).toEqual([rated('', 1)]);
    expect(skills?.pilot).toEqual([rated('Boat', 11)]);
    expect(skills?.ride).toEqual([rated('', 5)]);
    expect(skills?.science).toEqual([rated('Chemistry', 21)]);
    expect(skills?.languageOther).toEqual([rated('Latin', 26)]);
    expect(skills?.languageOwn).toEqual({ language: 'English', value: 65, experienceCheck: false });
  });

  it('keep every experience check and skill note, but none on Status or Blasphemous Lore', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    expect(skills?.spot).toEqual({ value: 65, experienceCheck: true, notes: 'Never forgets a face' });
    expect(skills?.status).toEqual({ value: 30, experienceCheck: false });
    expect(converted(fixture('v1.6.0-example')).sheet.skills?.status).toEqual({ value: 45, experienceCheck: false, notes: 'Sets how she lives' });
  });

  it('keep an experience check on Status or Blasphemous Lore in the conversion record', () => {
    const old = withValue(fixture('v1.6.0-detective-played'), ['skills', 'cthulhuMythos', 'improvementChecked'], true);
    const { sheet } = converted(old);
    expect(sheet.converted?.skills).toContainEqual({ name: 'Status', value: 30, experienceCheck: true });
    expect(sheet.converted?.skills).toContainEqual({ name: 'Knowledge (Blasphemous Lore)', value: 4, experienceCheck: true });
    expect(sheet.converted?.skills.filter((skill) => skill.experienceCheck !== undefined)).toHaveLength(2);
    expect(converted(fixture('v1.6.0-example')).sheet.converted?.skills).toContainEqual({ name: 'Status', value: 45 });
  });

  it('keep a skill the rebuilt sheet does not list as the character\'s own when it was raised or given a specialisation, and drop it when untouched', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    expect(skills?.own).toEqual([
      { name: 'Art or Craft (Photography)', value: 25, experienceCheck: false },
      { name: 'Charm', value: 40, experienceCheck: false },
      { name: 'Intimidate', value: 45, experienceCheck: false },
      { name: 'Lip Reading', value: 21, experienceCheck: true },
    ]);
    expect(converted(fixture('v1.5.0-blank')).sheet.skills?.own).toEqual([]);
  });

  it('keep one of those skills when a note, a tick or a lowered rating shows it was used', () => {
    let old = withValue(fixture('v1.5.0-blank'), ['skills', 'survival', 'notes'], 'Lived rough one winter');
    old = withValue(old, ['skills', 'intimidate', 'improvementChecked'], true);
    old = withValue(old, ['skills', 'charm', 'currentValue'], 10);
    expect(converted(old).sheet.skills?.own).toEqual([
      { name: 'Charm', value: 10, experienceCheck: false },
      { name: 'Intimidate', value: 15, experienceCheck: true },
      { name: 'Survival', value: 10, experienceCheck: false, notes: 'Lived rough one winter' },
    ]);
  });

  it('start the skills the old sheet did not have at their open-rules base', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.skills;
    // INT 14 and POW 12 for Gaming.
    expect(skills).toMatchObject({
      bargain: { value: 5 }, command: { value: 5 }, demolition: { value: 1 }, gaming: { value: 26 }, grapple: { value: 25 },
      hide: { value: 10 }, martialArts: { value: 1 }, perform: { value: 5 }, sense: { value: 10 }, strategy: { value: 1 }, teach: { value: 10 },
    });
    expect(skills?.art).toEqual([]);
    expect(skills?.etiquette).toEqual([]);
  });

  it('list every old rating in the conversion record, named as the rebuilt sheet names the skill it became', () => {
    const skills = converted(fixture('v1.6.0-detective-played')).sheet.converted?.skills ?? [];
    for (const original of [
      { name: 'Fine Manipulation', value: 45 }, { name: 'Research', value: 50 }, { name: 'Spot', value: 65 }, { name: 'Status', value: 30, experienceCheck: true },
      { name: 'Insight', value: 55 }, { name: 'Knowledge (Natural History)', value: 30 }, { name: 'Art or Craft (Photography)', value: 25 },
      { name: 'Survival', value: 10 }, { name: 'Brawl', value: 50 }, { name: 'Melee Weapon (Knife)', value: 40 },
      { name: 'Firearm (Handgun)', value: 55 }, { name: 'Firearm (Bow)', value: 18 }, { name: 'Language (Own)', value: 65 },
      { name: 'Language (Latin)', value: 26 }, { name: 'Science (Chemistry)', value: 21 }, { name: 'Pilot (Boat)', value: 11 },
      { name: 'Lip Reading', value: 21 }, { name: 'Knowledge (Occult)', value: 5 },
      { name: 'Knowledge (Blasphemous Lore), as noted beside the spells', value: 6 },
    ]) {
      expect(skills).toContainEqual(original);
    }
    // 41 plain rows, Brawl and one melee weapon, three firearms and one more,
    // one language, one science, one skill of the character's own, and the
    // score beside the spells.
    expect(skills).toHaveLength(51);
  });
});

describe('the backstory', () => {
  it('becomes titled notes in the sheet\'s order, empty boxes dropped, then long-term insanity, talents and Luck', () => {
    expect(converted(fixture('v1.6.0-detective-played')).sheet.story).toEqual([
      { title: 'Background & History', text: 'Left the police after a falling out and took up private work.' },
      { title: 'Beliefs', text: 'Everyone has something to hide.' },
      { title: 'Important People', text: '   ' },
      { title: 'Important Places', text: 'The office above the laundry.' },
      { title: 'Personality Traits', text: 'Dry humour, too much coffee.' },
      { title: 'Strange Encounters', text: 'Something in a warehouse he will not describe.' },
      { title: 'Long-term insanity', text: 'Ticked on this character\'s sheet before it was rebuilt.' },
      { title: 'Talents', text: 'Keen eye\nHard to rattle' },
      { title: 'Luck', text: 'Spent 14 on the warehouse job.' },
    ]);
  });

  it('gives every box of a full sheet its note, titled as the sheet showed it', () => {
    expect(converted(fixture('v1.6.0-example')).sheet.story?.map((note) => note.title)).toEqual([
      'Background & History', 'Description', 'Beliefs', 'Important People', 'Important Places', 'Prized Belongings',
      'Personality Traits', 'Old Injuries', 'Fears & Compulsions', 'Books & Spells', 'Strange Encounters', 'Luck',
    ]);
  });

  it('leaves no notes where every box is blank', () => {
    expect(converted(fixture('v1.5.0-blank')).sheet).not.toHaveProperty('story');
  });
});

describe('everything else', () => {
  it('keeps the weapons as typed', () => {
    const old = fixture('v1.6.0-detective-played');
    expect(convert(old).sheet).toMatchObject({ weapons: isFields(old.combat) ? old.combat.weapons : null });
  });

  it('keeps the conditions, the spells, the possessions, wealth, contacts and appearance', () => {
    const { sheet } = converted(fixture('v1.6.0-detective-played'));
    expect(sheet.conditions).toEqual({ unconscious: false, dying: false, majorWound: true, temporaryInsanity: false });
    expect(sheet.spells).toEqual(['Ward of the Threshold']);
    expect(sheet.possessions).toEqual([{ name: 'Coat', notes: 'Long and worn' }, { name: 'Camera' }]);
    expect(sheet.wealth).toEqual({ level: 'Average', cash: 72.5, assets: 'A small office and an old car', notes: 'Owes rent' });
    expect(sheet.contacts).toEqual([{ name: 'Rook', role: 'Fence', notes: 'Owes him a favour' }]);
    expect(sheet.appearance).toEqual({ age: '35', height: 'Tall', weight: 'Heavy', eyes: 'Brown', hair: 'Greying', skin: 'Weathered' });
  });

  it('keeps the name, profession, era, player and the rest of the top of the sheet', () => {
    const { sheet } = converted(fixture('v1.6.0-detective-played'));
    expect(sheet).toMatchObject({
      themeColor: '#335577', characterName: 'Jack Moran', playerName: 'Sam Okafor', profession: 'Private Detective',
      era: 'Modern', age: '35', sex: 'Male', residence: 'A harbour city', birthplace: 'Upstate',
    });
  });

  it('moves the player of a sheet from before 1.3.0 into its player name', () => {
    expect(converted(fixture('pre-1.3.0-player')).sheet.playerName).toBe('  Sam Okafor ');
  });

  it('lists a second player name where the sheet already names one', () => {
    const { sheet, kept } = convert(fixture('malformed'));
    expect(isFields(sheet) && sheet.playerName).toBe('Morgan');
    expect(kept).toContain('player: "Lee"');
  });

  it('drops the old player name only where it is exactly the player name', () => {
    const same = withValue(fixture('v1.6.0-detective-played'), ['player'], 'Sam Okafor');
    expect(convert(same).kept).toEqual([]);
    const differs = withValue(fixture('v1.6.0-detective-played'), ['player'], 'sam okafor ');
    expect(convert(differs).kept).toEqual(['player: "sam okafor "']);
    expect(convert(differs).sheet).toMatchObject({ playerName: 'Sam Okafor' });
  });
});

describe('the GM\'s notes', () => {
  it.each(ALL_FIXTURES)('stay in notes and appear nowhere else in %s', (name) => {
    const old = fixture(name);
    const { sheet, kept } = convert(old);
    const notes = typeof old.notes === 'string' ? old.notes : '';
    if (!notes) return;
    expect(isFields(sheet) && sheet.notes).toBe(notes);
    const elsewhere = strings(sheet).filter(({ at, text }) => !(at.length === 1 && at[0] === 'notes') && text.includes(notes.trim()));
    expect(elsewhere).toEqual([]);
    expect(kept.filter((item) => item.includes(notes.trim()))).toEqual([]);
  });
});

describe('text', () => {
  it('is never trimmed', () => {
    const old = withValue(fixture('v1.6.0-example'), ['backstory', 'traits'], '\n  Methodical.\n\n  Slow to trust.  \n');
    const { sheet } = converted(withValue(old, ['occupation'], ' Professor '));
    expect(sheet.story).toContainEqual({ title: 'Personality Traits', text: '\n  Methodical.\n\n  Slow to trust.  \n' });
    expect(sheet.profession).toBe(' Professor ');
    const malformed = convert(fixture('malformed')).sheet;
    expect(malformed).toMatchObject({ characterName: '  Patchwork  ', notes: '  The GM\'s secret: Lee is a twin.  ' });
  });

  it('is kept exactly where it holds only white space: specialisations, notes, boxes, talents and Luck\'s notes', () => {
    let old = withValue(fixture('v1.6.0-detective-played'), ['skills', 'science', 0, 'specialization'], '   ');
    old = withValue(old, ['skills', 'pilot', 'specialization'], '  ');
    old = withValue(old, ['skills', 'climb', 'specialization'], ' ');
    old = withValue(old, ['skills', 'climb', 'notes'], '\t');
    old = withValue(old, ['skills', 'survival', 'notes'], ' ');
    old = withValue(old, ['pulpTalents'], ['Keen eye', '  ']);
    old = withValue(old, ['derivedStats', 'luck', 'notes'], '\n');
    const { sheet, kept } = converted(old);
    expect(sheet.skills?.science).toEqual([{ specialty: '   ', value: 21, experienceCheck: false }]);
    expect(sheet.skills?.pilot).toEqual([{ specialty: '  ', value: 11, experienceCheck: false }]);
    expect(sheet.skills?.climb).toEqual({ value: 20, experienceCheck: false, notes: '\t' });
    expect(kept).toEqual(['Climb, specialisation: " "']);
    expect(sheet.skills?.own).toContainEqual({ name: 'Survival', value: 10, experienceCheck: false, notes: ' ' });
    expect(sheet.story).toContainEqual({ title: 'Talents', text: 'Keen eye\n  ' });
    expect(sheet.story).toContainEqual({ title: 'Luck', text: '\n' });
  });
});

describe('a second conversion', () => {
  it.each(ALL_FIXTURES)('changes nothing in %s', (name) => {
    const first = convert(fixture(name));
    const snapshot = JSON.stringify(first.sheet);
    const second = convertHorrorD100Sheet(first.sheet, new Date('2027-01-01T00:00:00.000Z'));
    expect(second.sheet).toBe(first.sheet);
    expect(second.kept).toEqual([]);
    expect(JSON.stringify(second.sheet)).toBe(snapshot);
  });

  it('changes nothing in a sheet made in the new shape, nor in anything that is no sheet', () => {
    const fresh = { characterName: 'Ada', profession: 'Detective', era: 'Modern', characteristics: { STR: 12 } };
    expect(convert(fresh).sheet).toBe(fresh);
    for (const value of [null, undefined, [], 'sheet', 42]) expect(convert(value)).toEqual({ sheet: value, kept: [], keptLabels: [] });
  });
});

describe('a malformed row', () => {
  it('converts without throwing, and lists everything it could not place', () => {
    expect(convert(fixture('malformed')).kept).toEqual([
      'player: "Lee"',
      'STR: "sixty"',
      'DEX, note: "steady hands"',
      'Characteristics, LUCK: 40',
      'Hit points, maximum: "ten"',
      'Power points: "full"',
      'Luck: "lucky"',
      'Luck, notes: 7',
      'Damage modifier: 3',
      'Strength and size step: "big"',
      'Derived attributes, stamina: 12',
      'Climb: {"baseValue":20,"currentValue":"high","improvementChecked":"yes"}',
      'Melee Weapon: "knife"',
      'Language (Other): "Dutch"',
      'Spot, flair: "keen"',
      'Spot, specialisation: "Tracks"',
      'Skills, dreaming: {"currentValue":33}',
      'Weapons: "a club"',
      'Weapons, armour: "leather"',
      'Conditions, dying: "maybe"',
      'Long-term insanity: "sometimes"',
      'Conditions, bleeding: true',
      'Spells: "none"',
      'Knowledge (Blasphemous Lore), as noted beside the spells: "a little"',
      'Spells, tomes: 2',
      'Wealth: "comfortable"',
      'Background & History: 42',
      'Story, favouriteFood: "Soup"',
      'background: "Came from the hills."',
      'experience: [1,2,3]',
    ]);
  });

  it('loses nothing: every text it held is in the converted sheet or its record', () => {
    const old = fixture('malformed');
    const { sheet } = convert(old);
    expect(lostStrings(old, sheet)).toEqual([]);
    expect(isFields(sheet) && sheet.converted).toMatchObject({ kept: convert(old).kept });
  });

  it.each(STORED_BY_A_VERSION)('loses nothing from %s whatever one of its values is replaced with', (name) => {
    const original = fixture(name);
    const notes = typeof original.notes === 'string' ? original.notes : undefined;
    for (const at of paths(original)) {
      for (const junk of [null, 'junk text', 7, [], {}, true]) {
        const old = withValue(original, at, junk);
        let result: { sheet: unknown; kept: string[] } = { sheet: undefined, kept: [] };
        expect(() => { result = convert(old); }).not.toThrow();
        const lost = lostStrings(old, result.sheet);
        if (lost.length > 0) throw new Error(`replacing ${at.join('.')} with ${JSON.stringify(junk)} lost ${JSON.stringify(lost)}`);
        if (notes && at[0] !== 'notes') {
          expect(result.kept.some((item) => item.includes(notes))).toBe(false);
        }
      }
    }
  });
});

describe('a row over today\'s limits', () => {
  it('keeps its text and lists whole, and lists them as over the limits', () => {
    const long = 'x'.repeat(SHEET_LONG_TEXT_MAX + 5);
    let old = withValue(fixture('v1.6.0-example'), ['backstory', 'description'], long);
    old = withValue(old, ['spellsAndMythos', 'spells'], Array.from({ length: SHEET_LIST_MAX + 1 }, (_, i) => `Spell ${i}`));
    const { sheet, kept } = convert(old);
    expect(isFields(sheet) && Array.isArray(sheet.story) && sheet.story[0]).toEqual({ title: 'Background & History', text: long });
    expect(isFields(sheet) && Array.isArray(sheet.spells) && sheet.spells.length).toBe(SHEET_LIST_MAX + 1);
    expect(kept).toEqual([
      'spells: Can hold at most 500 entries',
      'story.0.text: Can be at most 100,000 characters',
    ]);
    expect(isFields(sheet) && sheet.converted).toMatchObject({ kept });
  });
});

describe('a sheet the old schema took that the new one refuses', () => {
  const issuesOf = (sheet: unknown) => {
    const parsed = HorrorD100SheetSchema.safeParse(sheet);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
  };

  it('keeps talents that join into a note longer than a note takes, whole, and lists the limit', () => {
    const talents = Array.from({ length: 200 }, (_, index) => `${index} ${'t'.repeat(990)}`);
    const old = { ...fixture('v1.5.0-blank'), pulpTalents: talents };
    expect(horrorD100CharacterDataSchema.safeParse(old).success).toBe(true);
    const { sheet, kept } = convert(old);
    expect(isFields(sheet) && sheet.story).toEqual([{ title: 'Talents', text: talents.join('\n') }]);
    expect(issuesOf(sheet)).toEqual(['story.0.text']);
    expect(kept.filter((item) => item.startsWith('story.0.text: '))).toHaveLength(1);
  });

  it('keeps an own skill whose specialisation carries its name past the limit, whole, and lists the limit', () => {
    const specialisation = 's'.repeat(995);
    const old = withValue(fixture('v1.5.0-blank'), ['skills', 'charm', 'specialization'], specialisation);
    expect(horrorD100CharacterDataSchema.safeParse(old).success).toBe(true);
    const { sheet, kept } = convert(old);
    expect(isFields(sheet) && isFields(sheet.skills) && sheet.skills.own).toEqual([{ name: `Charm (${specialisation})`, value: 15, experienceCheck: false }]);
    expect(issuesOf(sheet)).toEqual(['skills.own.0.name']);
    expect(kept.filter((item) => item.startsWith('skills.own.0.name: '))).toHaveLength(1);
  });
});

describe('what a log may print of what was kept', () => {
  it('names each kind once, with the list\'s name in place of a name the player typed', () => {
    const typed = 'SECRET-TYPED-NAME my diary';
    let old = fixture('v1.5.0-blank');
    old = withValue(old, ['skills', 'customSkills'], [
      { name: typed, baseValue: 0, currentValue: 30, specialization: 'kept one' },
      { name: `${typed} two`, baseValue: 0, currentValue: 31, specialization: 'kept two', flair: 'x' },
      { name: 'Climb', baseValue: 0, currentValue: 32, specialization: 'kept three' },
    ]);
    old = withValue(old, ['skills', 'languageOther'], [{ language: typed, baseValue: 1, currentValue: 20, specialization: 'kept four' }]);
    old = withValue(old, ['skills', 'fighting', 'custom'], [{ specialization: typed, baseValue: 25, currentValue: 'high' }]);
    old = withValue(old, ['skills', 'climb', 'specialization'], 'sea cliffs');
    old = withValue(old, ['wealth', 'Climb'], 'a field named as the third own skill is');
    const { kept, keptLabels } = convertHorrorD100Sheet(old, NOW);

    expect(kept.filter((item) => item.includes(typed)).length).toBeGreaterThan(3);
    expect(keptLabels.filter((label) => label.includes('SECRET') || label.includes('diary'))).toEqual([]);
    expect(keptLabels).toEqual([
      'Climb, specialisation',
      'Melee Weapon',
      'Language (Other), specialisation',
      'A skill of the character\'s own, specialisation',
      'A skill of the character\'s own, flair',
      'Wealth, Climb',
    ]);
  });

  it('is every label of a malformed sheet as its items give it, where none holds a typed name', () => {
    const { kept, keptLabels } = convertHorrorD100Sheet(fixture('malformed'), NOW);
    expect(keptLabels).toEqual([...new Set(kept.map((item) => item.slice(0, item.indexOf(': '))))]);
  });
});

describe('the record the rebuilt sheet\'s wording test reads', () => {
  const file = path.resolve(__dirname, '../../../../frontend/src/components/character-sheets/horror-d100/__tests__/convertedRecord.json');

  it('is the record of a sheet holding every old skill, with everything a malformed sheet kept', () => {
    const played = fixture('v1.6.0-detective-played');
    expect(OLD_SKILL_ORDER.filter((key) => !isFields(played.skills) || !Object.hasOwn(played.skills, key))).toEqual([]);
    const { sheet } = convert(played);
    const record = isFields(sheet) ? sheet.converted : undefined;
    if (!isFields(record)) throw new Error('the conversion wrote no record');
    const expected = { ...record, kept: convert(fixture('malformed')).kept };
    if (process.env.WRITE_CONVERTED_RECORD === '1') fs.writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(expected);
  });
});

describe('the converted sheet', () => {
  it.each(STORED_BY_A_VERSION)('passes the new schema where the old schema took %s', (name) => {
    const old = fixture(name);
    expect(horrorD100CharacterDataSchema.safeParse(old).success).toBe(true);
    expect(HorrorD100SheetSchema.safeParse(convert(old).sheet).error?.issues ?? []).toEqual([]);
  });

  it.each(ALL_FIXTURES)('names none of the old sheet\'s keys in %s', (name) => {
    const old = new Set([
      'investigatorName', 'occupation', 'player', 'derivedStats', 'combat', 'pulpTalents', 'spellsAndMythos', 'backstory',
      'APP', 'cthulhuMythos', 'creditRating', 'libraryUse', 'spotHidden', 'psychoanalysis', 'psychology', 'locksmith',
      'naturalWorld', 'customSkills', 'currentValue', 'baseValue', 'improvementChecked', 'specialization', 'magicPoints',
      'moveRate', 'damageBonus', 'spendingLevel', 'half', 'fifth', 'regular',
    ]);
    expect(keys(convert(fixture(name)).sheet).filter((key) => old.has(key))).toEqual([]);
  });

  it('records when it was converted, and from which shape', () => {
    expect(converted(fixture('v1.6.0-example-minimal')).sheet.converted).toEqual({
      from: 1,
      at: '2026-11-12T08:00:00.000Z',
      characteristics: { STR: 50, CON: 60, SIZ: 55, DEX: 50, CHA: 65, INT: 80, POW: 70, EDU: 85 },
      skills: [],
      kept: [],
    });
  });
});
