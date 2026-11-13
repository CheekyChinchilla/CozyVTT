// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * The Horror d100 sheet as versions before 1.7.0 stored it, and its
 * conversion into the sheet rebuilt on the open d100 rules
 * (validators/game-systems/horrorD100Sheet.schema.ts).
 *
 * The sheet before 1.7.0 held characteristics on a scale of 0 to 100, with
 * other skills, formulas and tabs. The conversion:
 *
 * - divides each characteristic by 5, rounded to nearest; APP becomes CHA,
 *   and EDU stays as the rules' optional EDU. A value below the open range is
 *   kept as it comes out.
 * - works hit points and power points out on the new characteristics,
 *   keeping the damage taken and the points spent; keeps starting Sanity as
 *   stored, sets maximum Sanity from Knowledge (Blasphemous Lore) and brings
 *   current Sanity down to it where it was higher; sets MOV to 10. The damage modifier, the major wound level and the
 *   experience bonus are worked out wherever the sheet shows them, so are not
 *   stored; the old formula notes are dropped.
 * - keeps every skill's rating exactly as saved, under the open rules' skill
 *   it becomes. A skill the rebuilt sheet does not list becomes one of the
 *   character's own when it was used (a rating other than where it started, a
 *   specialisation, a note or an experience check), and is dropped when it
 *   was left as it started.
 * - turns each backstory box that is not empty into a titled story note, in
 *   the sheet's order, and adds notes for long-term insanity, talents and
 *   Luck's notes.
 * - keeps weapons, possessions, contacts and appearance as typed, and moves
 *   the GM's notes untouched; nothing else is given them.
 * - writes `converted`, the record of the old values, under CozyVTT's names,
 *   which also marks the sheet as converted, so a second conversion changes
 *   nothing.
 *
 * It reads the old sheet by its content, never through a schema; it never
 * invents a value, never trims text (white space alone is kept as it is) and
 * never throws. Whatever it cannot place is listed, with its value, in what
 * it returns and in the record's `kept`; so is every value it keeps outside
 * today's limits, such as a backstory longer than a sheet now takes.
 *
 * This folder is the one place the old sheet's keys are written.
 */

import { HorrorD100SheetSchema } from '../validators/game-systems/horrorD100Sheet.schema';
import {
  HORROR_D100_BLASPHEMOUS_LORE,
  HORROR_D100_FIXED_SKILLS,
  HORROR_D100_HUMAN_MOVE,
  HORROR_D100_SPECIALISED_SKILLS,
  horrorD100MaximumHitPoints,
  horrorD100MaximumPowerPoints,
  horrorD100MaximumSanity,
  horrorD100NewSkills,
} from '../utils/rules/horrorD100';

type Fields = Record<string, unknown>;

/**
 * An old value as the conversion record keeps it: a skill by the name the
 * rebuilt sheet has for it, with its experience check where the rebuilt sheet has no place
 * for one (Status and Blasphemous Lore).
 */
interface OriginalSkill {
  name: string;
  value: number;
  experienceCheck?: boolean;
}

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a value holds nothing that could be lost. Text of white space alone is text. */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value === '';
  if (Array.isArray(value)) return value.length === 0;
  return isRecord(value) && Object.keys(value).length === 0;
}

/** Whether a field is there at all. */
function present(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** A number, or a string holding only one; undefined for anything else. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && /^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(value)) return Number(value);
  return undefined;
}

/** What the conversion could not place, each as a short label and the value. */
class Kept {
  readonly items: string[] = [];
  /** Each item's label as a log may print it, in step with `items`. */
  private readonly forLog: string[] = [];
  /** Labels built from text a player typed, each with the fixed words a log prints in its place. */
  private readonly typed = new Map<string, string>();

  /** Lists a value the conversion could not place, unless it holds nothing. */
  value(label: string, value: unknown): void {
    if (isBlank(value)) return;
    this.items.push(`${label}: ${JSON.stringify(value) ?? String(value)}`);
    this.forLog.push(this.logLabel(label));
  }

  /** Lists a line that is already whole, such as a limit a kept value is outside. */
  line(label: string, text: string): void {
    this.items.push(`${label}: ${text}`);
    this.forLog.push(label);
  }

  /**
   * Says a label holds text a player typed, and what a log prints in its
   * place from here on; the label itself, to end that.
   */
  typedLabel(label: string, inLog: string): void {
    if (label === inLog) this.typed.delete(label);
    else this.typed.set(label, inLog);
  }

  private logLabel(label: string): string {
    for (const [typed, inLog] of this.typed) {
      if (label === typed) return inLog;
      if (label.startsWith(`${typed}, `)) return `${inLog}${label.slice(typed.length)}`;
    }
    return label;
  }

  /** What was listed, by label, each once, with nothing a player typed: for the log. */
  logLabels(): string[] {
    return [...new Set(this.forLog)];
  }

  /** Lists a value the conversion drops as worked out, unless it is what such a value is. */
  unless(label: string, value: unknown, expected: (value: unknown) => boolean): void {
    if (!expected(value)) this.value(label, value);
  }

  /** Lists every field of `fields` the conversion does not read. */
  rest(fields: Fields, read: readonly string[], label: (key: string) => string): void {
    for (const [key, value] of Object.entries(fields)) if (!read.includes(key)) this.value(label(key), value);
  }
}

const isNumber = (value: unknown): boolean => value === undefined || value === null || numberOf(value) !== undefined;
const isText = (value: unknown): boolean => value === undefined || value === null || typeof value === 'string';
const isTick = (value: unknown): boolean => value === undefined || value === null || typeof value === 'boolean';

/** The keys of the old sheet. Any other is listed. */
const OLD_KEYS = [
  'themeColor', 'investigatorName', 'occupation', 'era', 'characteristics', 'playerName', 'player', 'age', 'sex',
  'residence', 'birthplace', 'derivedStats', 'skills', 'combat', 'conditions', 'pulpTalents', 'spellsAndMythos',
  'possessions', 'wealth', 'backstory', 'contacts', 'appearance', 'notes',
];

/** The old characteristics, and the name each has now. */
const OLD_CHARACTERISTICS = [
  ['STR', 'STR'], ['CON', 'CON'], ['SIZ', 'SIZ'], ['DEX', 'DEX'], ['APP', 'CHA'], ['INT', 'INT'], ['POW', 'POW'], ['EDU', 'EDU'],
] as const;

/** The old backstory boxes, in the sheet's order, each with the title the sheet showed. */
const OLD_BACKSTORY = [
  ['description', 'Background & History'],
  ['personalDescription', 'Description'],
  ['ideology', 'Beliefs'],
  ['significantPeople', 'Important People'],
  ['meaningfulLocations', 'Important Places'],
  ['treasuredPossessions', 'Prized Belongings'],
  ['traits', 'Personality Traits'],
  ['injuriesAndScars', 'Old Injuries'],
  ['phobiasAndManias', 'Fears & Compulsions'],
  ['arcaneTomesAndSpells', 'Books & Spells'],
  ['encountersWithStrangeEntities', 'Strange Encounters'],
] as const;

/** The titles a converted sheet's story notes get from the old boxes, and from the old template's shorter forms of two of them. */
export const OLD_STORY_TITLES: readonly string[] = [...OLD_BACKSTORY.map(([, title]) => title), 'Background', 'Personality', 'Fears'];

/** The old conditions kept as they are; long-term insanity becomes a note. */
const KEPT_CONDITIONS = ['unconscious', 'dying', 'majorWound', 'temporaryInsanity'];

/** The text of the note a sheet ticked for long-term insanity gets. */
const LONG_TERM_INSANITY = 'Ticked on this character\'s sheet before it was rebuilt.';

/** The lore skill's name in the conversion record, the rebuilt sheet's; and the name of the second copy the old sheet kept beside the spells. */
const LORE_LABEL = `Knowledge (${HORROR_D100_BLASPHEMOUS_LORE})`;
const LORE_BESIDE_SPELLS_LABEL = `${LORE_LABEL}, as noted beside the spells`;

/** The old sheet's block of hand-to-hand skills, in the rebuilt sheet's names. */
const MELEE_LABEL = 'Brawl and Melee Weapon';

/** What a value the old sheet kept under its pre-1.3.0 player key is listed as. */
export const KEPT_PLAYER_LABEL = 'player';

/** The most the old sheet took for its lore score. */
const LORE_MOST = 99;

/**
 * Where a plain skill of the old sheet goes: a skill with one rating; a
 * specialty of a specialised skill, named here or, where `specialty` is
 * null, by the old row's own specialisation; or the character's own skills,
 * when the old sheet's starting rating, `oldBase`, shows it was used.
 */
type Target =
  | { fixed: keyof typeof HORROR_D100_FIXED_SKILLS; noCheck?: true }
  | { list: keyof typeof HORROR_D100_SPECIALISED_SKILLS; specialty: string | null }
  | { own: string; oldBase: number };

/**
 * Each plain skill of the old sheet, by its key: where it goes, and the name
 * its old rating has in the conversion record and in what is kept. The name
 * is the rebuilt sheet's for the skill it became, or a plain one of
 * CozyVTT's for a skill with no counterpart.
 */
const OLD_SKILLS: Readonly<Record<string, { label: string; to: Target }>> = {
  accounting: { label: 'Knowledge (Accounting)', to: { list: 'knowledge', specialty: 'Accounting' } },
  anthropology: { label: 'Knowledge (Anthropology)', to: { list: 'knowledge', specialty: 'Anthropology' } },
  appraise: { label: 'Appraise', to: { fixed: 'appraise' } },
  archaeology: { label: 'Knowledge (Archaeology)', to: { list: 'knowledge', specialty: 'Archaeology' } },
  artCraft: { label: 'Art or Craft', to: { own: 'Art or Craft', oldBase: 5 } },
  charm: { label: 'Charm', to: { own: 'Charm', oldBase: 15 } },
  climb: { label: 'Climb', to: { fixed: 'climb' } },
  // Status takes no experience check (open d100 rules, p. 51, Status); an old
  // one is kept in the conversion record.
  creditRating: { label: 'Status', to: { fixed: 'status', noCheck: true } },
  disguise: { label: 'Disguise', to: { fixed: 'disguise' } },
  dodge: { label: 'Dodge', to: { fixed: 'dodge' } },
  driveAuto: { label: 'Drive (Automobile)', to: { list: 'drive', specialty: 'Automobile' } },
  electricalRepair: { label: 'Repair (Electrical)', to: { list: 'repair', specialty: 'Electrical' } },
  fastTalk: { label: 'Fast Talk', to: { fixed: 'fastTalk' } },
  firstAid: { label: 'First Aid', to: { fixed: 'firstAid' } },
  history: { label: 'Knowledge (History)', to: { list: 'knowledge', specialty: 'History' } },
  intimidate: { label: 'Intimidate', to: { own: 'Intimidate', oldBase: 15 } },
  jump: { label: 'Jump', to: { fixed: 'jump' } },
  law: { label: 'Knowledge (Law)', to: { list: 'knowledge', specialty: 'Law' } },
  libraryUse: { label: 'Research', to: { fixed: 'research' } },
  listen: { label: 'Listen', to: { fixed: 'listen' } },
  // Fine Manipulation covers picking locks (open d100 rules, p. 39, Fine Manipulation).
  locksmith: { label: 'Fine Manipulation', to: { fixed: 'fineManipulation' } },
  mechanicalRepair: { label: 'Repair (Mechanical)', to: { list: 'repair', specialty: 'Mechanical' } },
  medicine: { label: 'Medicine', to: { fixed: 'medicine' } },
  // A Knowledge specialty in the rules' profession lists (open d100 rules, p. 22, Farmer).
  naturalWorld: { label: 'Knowledge (Natural History)', to: { list: 'knowledge', specialty: 'Natural History' } },
  navigate: { label: 'Navigate', to: { fixed: 'navigate' } },
  occult: { label: 'Knowledge (Occult)', to: { list: 'knowledge', specialty: 'Occult' } },
  operateHeavyMachinery: { label: 'Heavy Machine', to: { list: 'heavyMachine', specialty: null } },
  persuade: { label: 'Persuade', to: { fixed: 'persuade' } },
  pilot: { label: 'Pilot', to: { list: 'pilot', specialty: null } },
  psychoanalysis: { label: 'Psychotherapy', to: { fixed: 'psychotherapy' } },
  // Reading a person's character and motives is Insight (open d100 rules, p. 42, Insight).
  psychology: { label: 'Insight', to: { fixed: 'insight' } },
  ride: { label: 'Ride', to: { list: 'ride', specialty: null } },
  sleightOfHand: { label: 'Sleight of Hand', to: { fixed: 'sleightOfHand' } },
  spotHidden: { label: 'Spot', to: { fixed: 'spot' } },
  stealth: { label: 'Stealth', to: { fixed: 'stealth' } },
  survival: { label: 'Survival', to: { own: 'Survival', oldBase: 10 } },
  swim: { label: 'Swim', to: { fixed: 'swim' } },
  throw: { label: 'Throw', to: { fixed: 'throw' } },
  track: { label: 'Track', to: { fixed: 'track' } },
};

/** The old skills block's keys, in the order the old sheet listed them. */
export const OLD_SKILL_ORDER: readonly string[] = [
  'accounting', 'anthropology', 'appraise', 'archaeology', 'artCraft', 'charm', 'climb', 'creditRating', 'cthulhuMythos',
  'disguise', 'dodge', 'driveAuto', 'electricalRepair', 'fastTalk', 'fighting', 'firearms', 'firstAid', 'history',
  'intimidate', 'jump', 'languageOwn', 'languageOther', 'law', 'libraryUse', 'listen', 'locksmith', 'mechanicalRepair',
  'medicine', 'naturalWorld', 'navigate', 'occult', 'operateHeavyMachinery', 'persuade', 'pilot', 'psychoanalysis',
  'psychology', 'ride', 'science', 'sleightOfHand', 'spotHidden', 'stealth', 'survival', 'swim', 'throw', 'track',
  'customSkills',
];

/**
 * Top-level keys only the old Horror d100 sheet has. No 5E, Fantasy d20,
 * Flexible or rebuilt Horror d100 schema declares one, so no sheet those
 * schemas stored holds one. A key the other sheets also use (`backstory`,
 * `playerName`, `skills`) tells nothing.
 */
export const OLD_ONLY_KEYS: readonly string[] = ['investigatorName', 'occupation', 'pulpTalents', 'spellsAndMythos'];

/** The old sheet's derived attributes: `derivedStats` holding one of these. */
export const OLD_DERIVED_KEYS: readonly string[] = ['magicPoints', 'luck', 'sanity'];

/**
 * Skill keys only the old Horror d100 sheet has. No other system's skills
 * block declares one, nor the rebuilt sheet's; the skills the old sheet
 * shares with other systems (`history`, `survival`, `occult`, `charm`) tell
 * nothing.
 */
export const OLD_ONLY_SKILLS: readonly string[] = [
  'cthulhuMythos', 'creditRating', 'libraryUse', 'spotHidden', 'psychoanalysis', 'operateHeavyMachinery',
  'mechanicalRepair', 'electricalRepair', 'naturalWorld', 'driveAuto', 'locksmith', 'artCraft', 'fighting', 'firearms',
];

/**
 * How far a sheet with no game system recorded looks like the Horror d100
 * sheet before 1.7.0, for the script that guesses a system from a sheet's
 * shape (scripts/migrate-characters.ts). `'signature'` is STR stored as a
 * value with its half and fifth, which no other sheet has; `'likely'` is the
 * old sheet's profession key beside an era and characteristics; else null.
 * Unlike isOldHorrorD100Sheet it is asked of sheets of any system, so one old
 * key alone tells it nothing.
 */
export function oldHorrorD100Likeness(data: unknown): 'signature' | 'likely' | null {
  if (!isRecord(data)) return null;
  const characteristics = data.characteristics;
  const strength = isRecord(characteristics) ? characteristics.STR : undefined;
  if (isRecord(strength) && strength.regular !== undefined && strength.half !== undefined && strength.fifth !== undefined) return 'signature';
  return data.occupation && data.era && characteristics ? 'likely' : null;
}

/**
 * Whether a Horror d100 sheet is in the shape versions before 1.7.0 stored,
 * and so is to be converted: it carries no conversion record, and holds a
 * key only that shape has (the old name, profession, talents or spells key),
 * the old derived attributes, a characteristic stored as `{ regular }` or
 * named APP, or a skill key only the old sheet has, in the old sheet's row.
 *
 * It tells an old Horror d100 sheet from a new one by content, never by the
 * version that wrote it. It does not tell game systems apart: a caller hands
 * it only sheets of characters whose system is Horror d100, its old value
 * read through the alias table. A Flexible sheet keeps any key it is sent.
 */
export function isOldHorrorD100Sheet(data: unknown): data is Fields {
  if (!isRecord(data) || isRecord(data.converted)) return false;
  if (OLD_ONLY_KEYS.some((key) => Object.hasOwn(data, key))) return true;
  const { characteristics, derivedStats, skills } = data;
  if (isRecord(derivedStats) && OLD_DERIVED_KEYS.some((key) => Object.hasOwn(derivedStats, key))) return true;
  if (isRecord(characteristics)
    && (Object.hasOwn(characteristics, 'APP') || Object.values(characteristics).some((value) => isRecord(value) && Object.hasOwn(value, 'regular')))) {
    return true;
  }
  return isRecord(skills) && OLD_ONLY_SKILLS.some((key) => isOldSkillRow(skills[key]));
}

/** An old skill row, holding `currentValue`, or a group of them, as Fighting and Firearms were. */
function isOldSkillRow(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.hasOwn(value, 'currentValue') || Object.values(value).some((member) => isRecord(member) && Object.hasOwn(member, 'currentValue'));
}

/** An old skill row's rating, the row given whole or as a bare number. */
function oldRating(raw: unknown): number | undefined {
  return isRecord(raw) ? numberOf(raw.currentValue) : numberOf(raw);
}

/** The character's Blasphemous Lore: the larger of the old skill and the score kept beside the spells, at most 99. */
function blasphemousLore(old: Fields): number | undefined {
  const skill = isRecord(old.skills) ? oldRating(old.skills.cthulhuMythos) : undefined;
  const box = isRecord(old.spellsAndMythos) ? numberOf(old.spellsAndMythos.cthulhuMythos) : undefined;
  const found = [skill, box].filter((value): value is number => value !== undefined);
  return found.length > 0 ? Math.min(LORE_MOST, Math.max(...found)) : undefined;
}

/** One skill row of the old sheet, once read. */
interface OldRow {
  value: number;
  check: boolean;
  notes?: string;
  specialization?: string;
}

/**
 * Reads one skill row of the old sheet, given whole or as a bare number. A
 * row whose rating is not a number is listed whole and read as nothing.
 * `also` names further fields the caller reads itself.
 */
function readRow(raw: unknown, label: string, kept: Kept, also: readonly string[] = []): OldRow | undefined {
  const fields = isRecord(raw) ? raw : numberOf(raw) !== undefined ? { currentValue: raw } : undefined;
  const value = fields ? numberOf(fields.currentValue) : undefined;
  if (!fields || value === undefined) {
    kept.value(label, raw);
    return undefined;
  }
  kept.unless(`${label}, base`, fields.baseValue, isNumber);
  kept.unless(`${label}, experience check`, fields.improvementChecked, isTick);
  kept.unless(`${label}, notes`, fields.notes, isText);
  kept.unless(`${label}, specialisation`, fields.specialization, isText);
  kept.rest(fields, ['baseValue', 'currentValue', 'improvementChecked', 'specialization', 'notes', ...also], (key) => `${label}, ${key}`);
  const row: OldRow = { value, check: fields.improvementChecked === true };
  if (typeof fields.notes === 'string' && fields.notes !== '') row.notes = fields.notes;
  if (typeof fields.specialization === 'string' && fields.specialization !== '') row.specialization = fields.specialization;
  return row;
}

/** A text field of a row the caller reads itself, or '' where it holds none. */
function rowText(raw: unknown, key: string, label: string, kept: Kept): string {
  const value = isRecord(raw) ? raw[key] : undefined;
  if (typeof value === 'string') return value;
  kept.value(`${label}, ${key}`, value);
  return '';
}

/** A rated skill on the new sheet. */
function rated(row: OldRow, check: boolean = row.check): Fields {
  return row.notes === undefined ? { value: row.value, experienceCheck: check } : { value: row.value, experienceCheck: check, notes: row.notes };
}

/** A name with its specialisation after it, where it has one. */
function withSpecialty(name: string, specialty: string | undefined): string {
  return specialty === undefined ? name : `${name} (${specialty})`;
}

/** The old skills block as the new one, with every old rating for the record. */
function convertSkills(
  old: Fields,
  characteristics: Partial<Record<string, number>>,
  lore: number | undefined,
  kept: Kept
): { skills: Fields; originals: OriginalSkill[] } {
  const fixed: Fields = {};
  const lists = new Map<string, Fields[]>(Object.keys(HORROR_D100_SPECIALISED_SKILLS).map((key) => [key, []]));
  const own: Fields[] = [];
  const originals: OriginalSkill[] = [];
  let languageOwn: Fields | undefined;
  const addTo = (list: string, entry: Fields) => lists.get(list)?.push(entry);
  const noSpecialization = (row: OldRow, label: string) => kept.value(`${label}, specialisation`, row.specialization);

  /**
   * The entries of an old list, each named by its `field` and labelled by
   * `labelOf`, handed to `into` with the name read.
   */
  const entries = (
    raw: unknown,
    group: string,
    field: 'specialization' | 'language' | 'name',
    labelOf: (typed: string) => string,
    into: (row: OldRow, name: string, label: string) => void
  ) => {
    if (raw === undefined) return;
    if (!Array.isArray(raw)) {
      kept.value(group, raw);
      return;
    }
    for (const entry of raw) {
      const given = isRecord(entry) ? entry[field] : undefined;
      const label = labelOf(typeof given === 'string' ? given : '');
      // For this entry, a log prints the list's name in place of what the player typed.
      kept.typedLabel(label, labelOf(''));
      const row = readRow(entry, label, kept, field === 'specialization' ? [] : [field]);
      if (row) {
        const name = field === 'specialization' ? row.specialization ?? '' : rowText(entry, field, label, kept);
        originals.push({ name: label, value: row.value });
        into(row, name, label);
      }
      kept.typedLabel(label, label);
    }
  };
  /** "Group (name)", or the group alone where the name is blank. */
  const named = (group: string, alone: string = group) => (typed: string) => (typed.trim() === '' ? alone : `${group} (${typed})`);

  for (const key of OLD_SKILL_ORDER) {
    const raw = old[key];
    const plain = OLD_SKILLS[key];
    if (plain) {
      const row = readRow(raw, plain.label, kept);
      if (!row) continue;
      const { to } = plain;
      const takesSpecialty = 'own' in to || ('list' in to && to.specialty === null);
      originals.push({
        name: takesSpecialty ? withSpecialty(plain.label, row.specialization) : plain.label,
        value: row.value,
        ...('fixed' in to && to.noCheck && row.check ? { experienceCheck: true } : {}),
      });
      if (!takesSpecialty) noSpecialization(row, plain.label);
      if ('fixed' in to) {
        fixed[to.fixed] = rated(row, to.noCheck ? false : row.check);
      } else if ('list' in to) {
        addTo(to.list, { specialty: to.specialty ?? row.specialization ?? '', ...rated(row) });
      } else {
        const used = row.value !== to.oldBase || row.specialization !== undefined || row.notes !== undefined || row.check;
        if (used) own.push({ name: withSpecialty(to.own, row.specialization), ...rated(row) });
      }
    } else if (key === 'cthulhuMythos') {
      // Knowledge (Blasphemous Lore) takes no experience check (open d100 rules, p. 43,
      // Knowledge Specialties); an old one is kept in the conversion record.
      const row = readRow(raw, LORE_LABEL, kept);
      if (row) {
        originals.push({ name: LORE_LABEL, value: row.value, ...(row.check ? { experienceCheck: true } : {}) });
        noSpecialization(row, LORE_LABEL);
      }
      if (lore !== undefined) {
        addTo('knowledge', {
          specialty: HORROR_D100_BLASPHEMOUS_LORE,
          value: lore,
          experienceCheck: false,
          ...(row?.notes !== undefined ? { notes: row.notes } : {}),
        });
      }
    } else if (key === 'fighting' || key === 'firearms') {
      if (raw === undefined) continue;
      if (!isRecord(raw)) {
        kept.value(key === 'fighting' ? MELEE_LABEL : 'Firearm', raw);
        continue;
      }
      if (key === 'fighting') {
        const brawl = readRow(raw.brawl, 'Brawl', kept);
        if (brawl) {
          originals.push({ name: 'Brawl', value: brawl.value });
          noSpecialization(brawl, 'Brawl');
          fixed.brawl = rated(brawl);
        }
        entries(raw.custom, 'Melee Weapon', 'specialization', named('Melee Weapon'), (row, name) => addTo('meleeWeapon', { specialty: name, ...rated(row) }));
        kept.rest(raw, ['brawl', 'custom'], (field) => `${MELEE_LABEL}, ${field}`);
      } else {
        for (const [gun, specialty] of [['handgun', 'Handgun'], ['rifle', 'Rifle'], ['shotgun', 'Shotgun']] as const) {
          const label = `Firearm (${specialty})`;
          const row = readRow(raw[gun], label, kept);
          if (!row) continue;
          originals.push({ name: label, value: row.value });
          noSpecialization(row, label);
          addTo('firearm', { specialty, ...rated(row) });
        }
        entries(raw.custom, 'Firearm', 'specialization', named('Firearm'), (row, name) => addTo('firearm', { specialty: name, ...rated(row) }));
        kept.rest(raw, ['handgun', 'rifle', 'shotgun', 'custom'], (field) => `Firearm, ${field}`);
      }
    } else if (key === 'languageOwn') {
      const row = readRow(raw, 'Language (Own)', kept, ['language']);
      if (!row) continue;
      originals.push({ name: 'Language (Own)', value: row.value });
      noSpecialization(row, 'Language (Own)');
      languageOwn = { language: rowText(raw, 'language', 'Language (Own)', kept), ...rated(row) };
    } else if (key === 'languageOther') {
      entries(raw, 'Language (Other)', 'language', named('Language', 'Language (Other)'), (row, name, label) => {
        noSpecialization(row, label);
        addTo('languageOther', { specialty: name, ...rated(row) });
      });
    } else if (key === 'science') {
      entries(raw, 'Science', 'specialization', named('Science'), (row, name) => addTo('science', { specialty: name, ...rated(row) }));
    } else if (key === 'customSkills') {
      const ownSkill = 'A skill of the character\'s own';
      entries(raw, ownSkill, 'name', (typed) => (typed.trim() === '' ? ownSkill : typed), (row, name, label) => {
        noSpecialization(row, label);
        own.push({ name, ...rated(row) });
      });
    }
  }
  kept.rest(old, OLD_SKILL_ORDER, (key) => `Skills, ${key}`);

  const skills: Fields = {
    ...horrorD100NewSkills({ DEX: characteristics.DEX, INT: characteristics.INT, POW: characteristics.POW, EDU: characteristics.EDU }),
    ...fixed,
    ...(languageOwn ? { languageOwn } : {}),
    ...Object.fromEntries(lists),
    own,
  };
  return { skills, originals };
}

/**
 * Hit points or power points on the new characteristics. The new maximum is
 * worked out where the characteristics allow, and the old one kept where
 * they do not; the damage taken, or the points spent, carry over.
 */
function convertPool(
  raw: unknown,
  label: string,
  newMaximum: number | undefined,
  neverBelowZero: boolean,
  workedOut: readonly string[],
  kept: Kept
): { now?: Fields; original?: Fields } {
  if (!present(raw)) return {};
  if (!isRecord(raw)) {
    kept.value(label, raw);
    return {};
  }
  const oldMaximum = numberOf(raw.maximum);
  const oldCurrent = numberOf(raw.current);
  if (oldMaximum === undefined) kept.value(`${label}, maximum`, raw.maximum);
  if (oldCurrent === undefined) kept.value(`${label}, current`, raw.current);
  for (const field of workedOut) kept.unless(`${label}, ${field}`, raw[field], field === 'formula' ? isText : isNumber);
  kept.rest(raw, ['maximum', 'current', ...workedOut], (field) => `${label}, ${field}`);
  const original: Fields = {
    ...(oldMaximum !== undefined ? { maximum: oldMaximum } : {}),
    ...(oldCurrent !== undefined ? { current: oldCurrent } : {}),
  };
  const maximum = newMaximum ?? oldMaximum;
  if (maximum === undefined) return { original };
  const current = oldMaximum !== undefined && oldCurrent !== undefined ? maximum - (oldMaximum - oldCurrent) : oldCurrent ?? maximum;
  return { now: { maximum, current: neverBelowZero ? Math.max(0, current) : current }, original };
}

/**
 * A Horror d100 sheet in the shape before 1.7.0 as the sheet rebuilt on the
 * open d100 rules, with what could not be placed. Anything else, a sheet
 * already converted among it, comes back as it was, the same value, with
 * nothing listed.
 *
 * The result is the new sheet as far as the old one held it. A sheet the
 * old schema took passes the new one, with two exceptions no real sheet is
 * likely to meet: talents that join into a story note longer than a note
 * takes, and a specialisation long enough to carry an own skill's name past
 * its limit. Both are stored whole, listed among what was kept with the
 * limit, and refused at the next save until the player shortens that field.
 * A sheet that was malformed stays as malformed as it was, and the schema
 * says where.
 *
 * `keptLabels` names what was kept for a log: each label once, with a fixed
 * name in place of any text a player typed (a skill's or a language's name).
 */
export function convertHorrorD100Sheet(data: unknown, now: Date): { sheet: unknown; kept: string[]; keptLabels: string[] } {
  if (!isOldHorrorD100Sheet(data)) return { sheet: data, kept: [], keptLabels: [] };
  const old = data;
  const kept = new Kept();
  const sheet: Fields = {};
  const story: Fields[] = [];
  const originalSkills: OriginalSkill[] = [];
  const record: Fields = { from: 1, at: Number.isNaN(now.getTime()) ? '' : now.toISOString() };
  const copy = (from: string, to: string) => {
    if (present(old[from])) sheet[to] = old[from];
  };

  copy('themeColor', 'themeColor');
  copy('investigatorName', 'characterName');
  copy('occupation', 'profession');
  copy('era', 'era');
  copy('playerName', 'playerName');
  // Before 1.3.0 the player's name was `player`.
  const { player, playerName } = old;
  if (!isBlank(player)) {
    if (typeof player === 'string' && isBlank(playerName)) sheet.playerName = player;
    else if (player !== playerName) {
      kept.value(KEPT_PLAYER_LABEL, player);
    }
  }
  for (const key of ['age', 'sex', 'residence', 'birthplace']) copy(key, key);

  // Characteristics: a fifth, rounded to nearest; APP is CHA.
  const characteristics: Partial<Record<string, number>> = {};
  const originalCharacteristics: Record<string, number> = {};
  const oldCharacteristics = old.characteristics;
  if (present(oldCharacteristics)) {
    if (!isRecord(oldCharacteristics)) {
      kept.value('Characteristics', oldCharacteristics);
    } else {
      for (const [from, to] of OLD_CHARACTERISTICS) {
        const raw = oldCharacteristics[from];
        const fields = isRecord(raw) ? raw : undefined;
        const given = fields ? fields.regular : raw;
        const value = numberOf(given);
        if (value === undefined) {
          kept.value(to, given);
        } else {
          originalCharacteristics[to] = value;
          characteristics[to] = Math.round(value / 5);
        }
        if (fields) {
          kept.unless(`${to}, half`, fields.half, isNumber);
          kept.unless(`${to}, fifth`, fields.fifth, isNumber);
          kept.rest(fields, ['regular', 'half', 'fifth'], (key) => `${to}, ${key}`);
        }
      }
      kept.rest(oldCharacteristics, OLD_CHARACTERISTICS.map(([from]) => from), (key) => `Characteristics, ${key}`);
      sheet.characteristics = characteristics;
    }
  }
  record.characteristics = originalCharacteristics;

  // Hit points, power points, Sanity, MOV; Luck, the damage modifier and build into the record.
  const lore = blasphemousLore(old);
  let luckNotes: string | undefined;
  const derived = old.derivedStats;
  if (present(derived)) {
    if (!isRecord(derived)) {
      kept.value('Derived attributes', derived);
    } else {
      const { CON, SIZ, POW } = characteristics;
      const hitPoints = convertPool(
        derived.hp, 'Hit points', CON !== undefined && SIZ !== undefined ? horrorD100MaximumHitPoints(CON, SIZ) : undefined,
        false, ['formula', 'majorWoundThreshold'], kept
      );
      if (hitPoints.now) sheet.hitPoints = hitPoints.now;
      if (hitPoints.original && !isBlank(hitPoints.original)) record.hitPoints = hitPoints.original;
      const powerPoints = convertPool(
        derived.magicPoints, 'Power points', POW !== undefined ? horrorD100MaximumPowerPoints(POW) : undefined, true, ['formula'], kept
      );
      if (powerPoints.now) sheet.powerPoints = powerPoints.now;
      if (powerPoints.original && !isBlank(powerPoints.original)) record.powerPoints = powerPoints.original;

      const sanity = derived.sanity;
      if (present(sanity)) {
        if (!isRecord(sanity)) {
          kept.value('Sanity', sanity);
        } else {
          const original: Fields = {};
          const converted: Fields = {};
          for (const field of ['starting', 'maximum', 'current']) {
            const value = numberOf(sanity[field]);
            if (value === undefined) kept.value(`Sanity, ${field}`, sanity[field]);
            else original[field] = value;
          }
          kept.unless('Sanity, formula', sanity.formula, isText);
          kept.rest(sanity, ['starting', 'maximum', 'current', 'formula'], (field) => `Sanity, ${field}`);
          if (original.starting !== undefined) converted.starting = original.starting;
          const maximum = horrorD100MaximumSanity(lore ?? 0);
          converted.maximum = maximum;
          // Never above the new maximum; the old number stays in the record.
          if (typeof original.current === 'number') converted.current = Math.min(original.current, maximum);
          sheet.sanity = converted;
          if (!isBlank(original)) record.sanity = original;
        }
      }

      const luck = derived.luck;
      if (isRecord(luck)) {
        const score = numberOf(luck.score);
        if (score === undefined) kept.value('Luck', luck.score);
        else record.luck = score;
        if (typeof luck.notes === 'string') {
          if (luck.notes !== '') luckNotes = luck.notes;
        } else {
          kept.value('Luck, notes', luck.notes);
        }
        kept.rest(luck, ['score', 'notes'], (field) => `Luck, ${field}`);
      } else if (numberOf(luck) !== undefined) {
        record.luck = numberOf(luck);
      } else {
        kept.value('Luck', luck);
      }

      if (typeof derived.damageBonus === 'string') {
        if (derived.damageBonus !== '') record.damageModifier = derived.damageBonus;
      } else {
        kept.value('Damage modifier', derived.damageBonus);
      }
      const build = numberOf(derived.build);
      if (build === undefined) kept.value('Strength and size step', derived.build);
      else record.build = build;
      const move = numberOf(derived.moveRate);
      if (move === undefined) kept.value('MOV', derived.moveRate);
      else record.move = move;
      // MOV is 10 for a human (open d100 rules, p. 15, Movement).
      sheet.move = HORROR_D100_HUMAN_MOVE;

      // The old Dodge box copied the Dodge skill; the skill is kept.
      const dodge = derived.dodge;
      if (isRecord(dodge)) {
        kept.unless('Dodge box', dodge.value, isNumber);
        kept.unless('Dodge box, formula', dodge.formula, isText);
        kept.unless('Dodge box, experience check', dodge.improvementChecked, isTick);
        kept.rest(dodge, ['value', 'formula', 'improvementChecked'], (field) => `Dodge box, ${field}`);
      } else {
        kept.value('Dodge box', dodge);
      }
      kept.rest(derived, ['hp', 'magicPoints', 'sanity', 'luck', 'damageBonus', 'build', 'moveRate', 'dodge'], (field) => `Derived attributes, ${field}`);
    }
  }

  // Skills. Lore known only from the score beside the spells still needs its
  // Knowledge row, so a sheet with no skills block then gets one at base.
  const oldSkills = old.skills;
  if (present(oldSkills) && !isRecord(oldSkills)) kept.value('Skills', oldSkills);
  if (isRecord(oldSkills) || lore !== undefined) {
    const converted = convertSkills(isRecord(oldSkills) ? oldSkills : {}, characteristics, lore, kept);
    sheet.skills = converted.skills;
    originalSkills.push(...converted.originals);
  }

  // Weapons, kept as typed.
  const combat = old.combat;
  if (present(combat)) {
    if (!isRecord(combat)) {
      kept.value('Weapons', combat);
    } else {
      if (Array.isArray(combat.weapons)) sheet.weapons = combat.weapons;
      else kept.value('Weapons', combat.weapons);
      kept.rest(combat, ['weapons'], (field) => `Weapons, ${field}`);
    }
  }

  // Conditions; long-term insanity becomes a note.
  let longTermInsanity = false;
  const conditions = old.conditions;
  if (present(conditions)) {
    if (!isRecord(conditions)) {
      kept.value('Conditions', conditions);
    } else {
      const ticked: Fields = {};
      for (const key of KEPT_CONDITIONS) {
        const value = conditions[key];
        if (typeof value === 'boolean') ticked[key] = value;
        else kept.value(`Conditions, ${key}`, value);
      }
      const insanity = conditions.indefiniteInsanity;
      if (insanity === true) longTermInsanity = true;
      else kept.unless('Long-term insanity', insanity, isTick);
      kept.rest(conditions, [...KEPT_CONDITIONS, 'indefiniteInsanity'], (field) => `Conditions, ${field}`);
      sheet.conditions = ticked;
    }
  }

  // Talents become a note.
  let talents: string | undefined;
  const oldTalents = old.pulpTalents;
  if (Array.isArray(oldTalents)) {
    const lines: string[] = [];
    for (const talent of oldTalents) {
      if (typeof talent === 'string') {
        if (talent !== '') lines.push(talent);
      } else {
        kept.value('Talents', talent);
      }
    }
    if (lines.length > 0) talents = lines.join('\n');
  } else if (typeof oldTalents === 'string') {
    if (oldTalents !== '') talents = oldTalents;
  } else {
    kept.value('Talents', oldTalents);
  }

  // Spells, and the lore score kept beside them.
  const spells = old.spellsAndMythos;
  if (present(spells)) {
    if (!isRecord(spells)) {
      kept.value('Spells', spells);
    } else {
      if (Array.isArray(spells.spells)) sheet.spells = spells.spells;
      else kept.value('Spells', spells.spells);
      const box = numberOf(spells.cthulhuMythos);
      if (box === undefined) kept.value(LORE_BESIDE_SPELLS_LABEL, spells.cthulhuMythos);
      else originalSkills.push({ name: LORE_BESIDE_SPELLS_LABEL, value: box });
      kept.rest(spells, ['spells', 'cthulhuMythos'], (field) => `Spells, ${field}`);
    }
  }

  copy('possessions', 'possessions');

  const wealth = old.wealth;
  if (present(wealth)) {
    if (!isRecord(wealth)) {
      kept.value('Wealth', wealth);
    } else {
      const converted: Fields = {};
      if (present(wealth.spendingLevel)) converted.level = wealth.spendingLevel;
      for (const field of ['cash', 'assets', 'notes']) if (present(wealth[field])) converted[field] = wealth[field];
      kept.rest(wealth, ['spendingLevel', 'cash', 'assets', 'notes'], (field) => `Wealth, ${field}`);
      sheet.wealth = converted;
    }
  }

  // The backstory boxes become titled notes, in the sheet's order.
  const backstory = old.backstory;
  if (present(backstory)) {
    if (!isRecord(backstory)) {
      kept.value('Story', backstory);
    } else {
      for (const [key, title] of OLD_BACKSTORY) {
        const text = backstory[key];
        if (typeof text === 'string') {
          if (text !== '') story.push({ title, text });
        } else {
          kept.value(title, text);
        }
      }
      kept.rest(backstory, OLD_BACKSTORY.map(([key]) => key), (field) => `Story, ${field}`);
    }
  }
  if (longTermInsanity) story.push({ title: 'Long-term insanity', text: LONG_TERM_INSANITY });
  if (talents !== undefined) story.push({ title: 'Talents', text: talents });
  if (luckNotes !== undefined) story.push({ title: 'Luck', text: luckNotes });
  if (story.length > 0) sheet.story = story;

  copy('contacts', 'contacts');
  copy('appearance', 'appearance');
  // The GM's notes, untouched, and only here.
  copy('notes', 'notes');

  kept.rest(old, OLD_KEYS, (key) => key);

  record.skills = originalSkills;
  record.kept = kept.items;
  sheet.converted = record;

  // What is kept outside today's limits: text longer, lists fuller or
  // numbers further than the schema takes.
  const limits = HorrorD100SheetSchema.safeParse(sheet);
  if (!limits.success) {
    for (const issue of limits.error.issues) {
      if (issue.code === 'too_big' || issue.code === 'too_small') kept.line(issue.path.map(String).join('.'), issue.message);
    }
  }
  return { sheet, kept: [...kept.items], keptLabels: kept.logLabels() };
}
