// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * SkillsList Component
 *
 * A Horror d100 character's skills, by the open d100 rules' categories: each
 * with its base chance, its rating, its experience check and its notes. A
 * skill held once for each specialty lists its specialties, and the
 * character's own skills come last. In the editor each category has one add
 * control for all its skills that come in specialties, under its rows.
 */

import React from 'react';
import { Check, Dices, NotebookPen, Plus, X } from 'lucide-react';
import NumberField from '../../../ui/NumberField';
import ListLimitNote from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import {
  HORROR_D100_FIREARM_LIST_MAX,
  HORROR_D100_OWN_SKILL_LIST_MAX,
  HORROR_D100_VALUE_MAX,
  SHEET_LIST_MAX,
  SHEET_LONG_TEXT_MAX,
  SHEET_SHORT_TEXT_MAX,
} from '@/constants/sheetLimits';
import {
  HORROR_D100_OWN_LANGUAGE_NAME,
  HORROR_D100_SKILL_CATEGORIES,
  horrorD100SpecialtyName,
  horrorD100TakesExperienceCheck,
  type HorrorD100SkillEntry,
} from '@/constants/horrorD100SkillNames';
import {
  HORROR_D100_FIXED_SKILLS,
  HORROR_D100_SPECIALISED_SKILLS,
  horrorD100FixedSkillBase,
  horrorD100LanguageOwnBase,
  type HorrorD100FixedSkillKey,
  type HorrorD100SpecialisedSkillKey,
} from '@/utils/rules/horrorD100';
import { HORROR_D100_SPECIALTIES_OFFERED, horrorD100SpecialtyBase, type HorrorD100Specialisation } from '../specialisations';
import { shouldUseWhiteText } from '@/utils/themeColor';
import { sheetRoll } from '../../useSheetRolls';
import type {
  HorrorD100SheetOwnSkill,
  HorrorD100SheetSkill,
  HorrorD100SheetSkills,
  HorrorD100SheetSpecialty,
} from '@/types/game-systems/horrorD100Sheet';

interface SkillsListProps {
  /** The skills block from character data; a sheet read as stored may lack some of it. */
  skills: Partial<HorrorD100SheetSkills>;

  /** The characteristics the base chances of Dodge, Gaming and the own language are worked out from. */
  characteristics?: { DEX?: number; INT?: number; POW?: number; EDU?: number };

  /** The header colour in use (a preset's or a custom one), which a ticked box is filled with. */
  tickColour?: string;

  /** Edit mode */
  editable?: boolean;

  /** Edit mode: the parts of the skills block that changed, each whole. */
  onChange?: (changed: Partial<HorrorD100SheetSkills>) => void;

  /** Click to roll 1d100. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

/** A text box on a skill row, for its name or its specialty. */
interface RowTextBox {
  value: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

/** The fields every skill row can change. */
type SkillPatch = Partial<Pick<HorrorD100SheetSkill, 'value' | 'experienceCheck' | 'notes'>>;

/** The choice that adds a specialty to be named. */
const OTHER = 'Other';

/** How many entries a list of skills holds at most. */
function listMax(key: HorrorD100SpecialisedSkillKey | 'own'): number {
  if (key === 'firearm') return HORROR_D100_FIREARM_LIST_MAX;
  return key === 'own' ? HORROR_D100_OWN_SKILL_LIST_MAX : SHEET_LIST_MAX;
}

/**
 * How wide each column of a skill row is: the tick, the name, the base
 * chance, the rating, and in the editor the notes and remove buttons. The
 * header over the rows draws its labels with the same widths, so each sits
 * over its column.
 *
 * Below `sm` a row takes two lines: the tick and the name fill the first
 * (the name's basis is the row less the tick and the gap, 1.75 rem), and the
 * numbers go under the name (`ml-7`). From `sm` up it is one line. A button
 * on a row is 44 px on a touch screen, and so is the column kept for it.
 */
const COLUMN = {
  tick: 'w-5 shrink-0',
  name: 'flex-1 min-w-0 basis-[calc(100%-1.75rem)] sm:basis-0',
  base: 'w-10 ml-7 sm:ml-0',
  value: 'w-14',
  button: 'w-5 pointer-coarse:w-11 shrink-0',
} as const;

/** A skill row and the header over the rows. */
const ROW = 'flex flex-wrap items-center gap-x-2 gap-y-1 px-2 sm:flex-nowrap';

/**
 * SkillRow - one skill, with its experience check where it takes one
 */
const SkillRow: React.FC<{
  displayName: string;
  skill: HorrorD100SheetSkill;
  /** The skill's base chance, or null where it has none to show. */
  base: number | null;
  /** Whether the skill takes an experience check. */
  takesCheck: boolean;
  editable: boolean;
  tickColour?: string;
  onChange?: (patch: SkillPatch) => void;
  onRoll?: (expression: string, purpose: string) => void;
  /** Edit mode: the row's name is typed, after `prefix` ("Knowledge"). */
  nameBox?: RowTextBox & { prefix: string };
  /** Edit mode: a box beside the name, for the own language. */
  detailBox?: RowTextBox;
  /** Read-only: what follows the name, the own language. */
  detail?: string;
  /** Edit mode: the row can be removed. */
  onRemove?: () => void;
  /** What the row's controls are named after, where it differs from its name. */
  controlName?: string;
}> = ({ displayName, skill, base, takesCheck, editable, tickColour, onChange, onRoll, nameBox, detailBox, detail, onRemove, controlName = displayName }) => {
  const ticked = takesCheck && skill.experienceCheck === true;
  const hasNotes = typeof skill.notes === 'string' && skill.notes !== '';
  const [notesOpen, setNotesOpen] = React.useState(hasNotes);

  // Ticked in a header colour: the inline style below fills it.
  const boxClasses = ticked && tickColour
    ? 'shadow-xs'
    : ticked ? 'bg-accent border-accent shadow-xs' : 'border-ink/30 bg-paper shadow-inner';
  const boxStyle = ticked && tickColour ? { backgroundColor: tickColour, borderColor: tickColour } : undefined;
  // The tick reads on its fill: black on a pale header colour.
  const tickClass = tickColour && !shouldUseWhiteText(tickColour) ? 'text-black' : 'text-white';

  const isClickable = !!onRoll && !editable;
  const purpose = `${displayName} — target: ${skill.value}%`;

  return (
    <div className={`rounded-sm group ${isClickable ? 'cursor-pointer hover:bg-ink/5 select-none' : 'hover:bg-ink/5'}`}>
      <div
        className={`${ROW} py-1.5`}
        onClick={isClickable ? () => onRoll!('1d100', purpose) : undefined}
        title={isClickable ? `Click to roll ${displayName} (target: ${skill.value}%)` : undefined}
        {...(isClickable ? sheetRoll : undefined)}
      >
        {/* Experience check: a checkbox the keyboard reaches in the editor, a
            mark on the read-only sheet, and nothing for a skill that takes
            none. */}
        {!takesCheck ? (
          <span aria-hidden="true" className={COLUMN.tick} />
        ) : editable ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={ticked}
            aria-label={`Experience check for ${controlName}`}
            onClick={() => onChange?.({ experienceCheck: !ticked })}
            className={`${COLUMN.tick} h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer hover:scale-110 focus:outline-hidden focus:ring-2 focus:ring-brand ${boxClasses}`}
            style={boxStyle}
          >
            {ticked && <Check className={`w-3.5 h-3.5 font-bold stroke-3 ${tickClass}`} />}
          </button>
        ) : (
          <div
            className={`${COLUMN.tick} h-5 rounded border-2 flex items-center justify-center transition-all cursor-default ${boxClasses}`}
            style={boxStyle}
            role="img"
            aria-label={ticked ? 'Experience check ticked' : 'No experience check'}
          >
            {ticked && <Check className={`w-3.5 h-3.5 font-bold stroke-3 ${tickClass}`} />}
          </div>
        )}

        {/* Skill Name */}
        <div className={`${COLUMN.name} flex items-center gap-1`}>
          {editable && nameBox ? (
            <>
              {nameBox.prefix !== '' && <span className="text-sm text-ink shrink-0">{nameBox.prefix}</span>}
              <input
                type="text"
                value={nameBox.value}
                onChange={(e) => nameBox.onChange(e.target.value)}
                aria-label={nameBox.label}
                placeholder={nameBox.placeholder}
                maxLength={SHEET_SHORT_TEXT_MAX}
                className="min-w-0 flex-1 text-sm text-ink bg-paper border border-ink/20 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-brand"
              />
            </>
          ) : (
            <span className="text-sm text-ink truncate">{displayName}</span>
          )}
          {editable && detailBox && (
            <input
              type="text"
              value={detailBox.value}
              onChange={(e) => detailBox.onChange(e.target.value)}
              aria-label={detailBox.label}
              placeholder={detailBox.placeholder}
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="min-w-0 w-28 text-xs text-ink bg-paper border border-ink/20 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          )}
          {isClickable && <Dices className="w-3 h-3 text-ink-secondary opacity-0 group-hover:opacity-60 [@media(hover:none)]:opacity-60 transition-opacity shrink-0" />}
          {!editable && detail && <span className="text-xs text-ink-secondary ml-1">({detail})</span>}
        </div>

        {/* Base chance */}
        <div className={`${COLUMN.base} text-center text-xs text-ink-secondary`}>
          {base === null ? '—' : `${base}%`}
        </div>

        {/* Rating */}
        <div className={COLUMN.value}>
          {editable ? (
            <NumberField
              aria-label={`Value of ${controlName}`}
              value={skill.value}
              onChange={(v: number) => onChange?.({ value: v })}
              className="w-full text-center text-sm font-semibold text-ink bg-paper border border-ink/20 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-brand"
              min={0}
              max={HORROR_D100_VALUE_MAX}
              fallback={0}
            />
          ) : (
            <div className="text-center text-sm font-semibold text-ink">
              {skill.value}%
            </div>
          )}
        </div>

        {editable && (
          <button
            type="button"
            onClick={() => setNotesOpen((open) => !open)}
            aria-expanded={notesOpen}
            aria-label={`${notesOpen ? 'Hide' : 'Show'} notes on ${controlName}`}
            title="Notes"
            className={`${COLUMN.button} touch-target inline-flex items-center justify-center p-0.5 rounded-sm hover:bg-ink/10 ${hasNotes ? 'text-ink' : 'text-ink-muted'}`}
          >
            <NotebookPen className="w-4 h-4" />
          </button>
        )}

        {editable && (onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${controlName}`}
            title="Remove"
            className={`${COLUMN.button} touch-target inline-flex items-center justify-center p-0.5 rounded-sm text-danger-ink hover:bg-danger/10`}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          // The remove button's column, kept on a row that has none, so every
          // row's columns line up with the header.
          <span aria-hidden="true" className={COLUMN.button} />
        ))}
      </div>

      {/* Notes: under the row, typed in the editor once opened. */}
      {editable && notesOpen && (
        <div className="px-2 pb-1.5 pl-9">
          <textarea
            value={skill.notes ?? ''}
            onChange={(e) => onChange?.({ notes: e.target.value })}
            aria-label={`Notes on ${controlName}`}
            placeholder="Notes"
            rows={1}
            maxLength={SHEET_LONG_TEXT_MAX}
            className="w-full text-xs text-ink bg-paper border border-ink/20 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
      )}
      {!editable && hasNotes && (
        <p className="px-2 pb-1.5 pl-9 text-xs text-ink-secondary whitespace-pre-wrap">{skill.notes}</p>
      )}
    </div>
  );
};

/** An add control: a finger wide on a touch screen. */
const ADD_BUTTON = 'touch-target inline-flex items-center justify-center gap-1 px-3 py-1 text-xs font-medium text-ink bg-paper border border-ink/20 rounded-sm hover:bg-ink/5 focus:outline-hidden focus:ring-2 focus:ring-brand disabled:opacity-50 disabled:cursor-not-allowed';

/** One of a category's skills that come in specialties, as its add control offers it. */
interface AddableList {
  key: HorrorD100SpecialisedSkillKey;
  /** The skill's name as the control lists it: "Firearm", "Language". */
  label: string;
  /** The specialties the rules offer for it, if any. */
  options?: readonly HorrorD100Specialisation[];
  count: number;
  max: number;
}

/**
 * A category's one add control: a list of every skill in the category that
 * comes in specialties, and a button. A skill the rules offer specialties for
 * lists each at its base chance, then Other, which adds one to be named; any
 * other skill is listed once and adds a specialty to be named. A skill whose
 * list is full cannot be added to, and the note says so.
 */
const AddToCategory: React.FC<{
  category: string;
  lists: readonly AddableList[];
  /** Called with the skill and the specialty chosen, or null for one to be named. */
  onAdd: (key: HorrorD100SpecialisedSkillKey, choice: HorrorD100Specialisation | null) => void;
}> = ({ category, lists, onAdd }) => {
  const choices = lists.flatMap((list) => [
    ...(list.options ?? []).map((option) => ({ value: `${list.key}:${option.name}`, text: `${list.label} (${option.name}), ${option.base}%`, list, option })),
    { value: `${list.key}:`, text: list.options ? `${list.label} (${OTHER})` : list.label, list, option: null },
  ]);
  const [chosen, setChosen] = React.useState(choices[0]?.value ?? '');
  const choice = choices.find((found) => found.value === chosen) ?? choices[0];
  if (!choice) return null;
  const full = choice.list.count >= choice.list.max;
  return (
    <div className="px-2 pt-2">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
        <select
          value={choice.value}
          onChange={(e) => setChosen(e.target.value)}
          aria-label={`${category} skill to add`}
          className="min-w-0 max-w-full text-xs bg-paper border border-ink/20 rounded-sm px-1 py-1 pointer-coarse:min-h-11 focus:outline-hidden focus:ring-2 focus:ring-brand"
        >
          {lists.map((list) => {
            const mine = choices.filter((found) => found.list === list);
            const options = mine.map((found) => <option key={found.value} value={found.value}>{found.text}</option>);
            return list.options ? <optgroup key={list.key} label={list.label}>{options}</optgroup> : options;
          })}
        </select>
        <button
          type="button"
          disabled={full}
          onClick={() => onAdd(choice.list.key, choice.option)}
          aria-label={`Add ${category} skill`}
          className={ADD_BUTTON}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
      <ListLimitNote full={full} max={choice.list.max} className={LIMIT_NOTE_CLASS} />
    </div>
  );
};

/** Whether a stored entry is a skill row the list can draw. */
function isSkill(entry: unknown): entry is HorrorD100SheetSkill {
  return typeof entry === 'object' && entry !== null && typeof (entry as { value?: unknown }).value === 'number';
}

/** Names that repeat in a list are told apart by their place in it. */
function controlNames(names: string[]): string[] {
  return names.map((name, index) => (names.indexOf(name) === names.lastIndexOf(name) ? name : `${name}, row ${index + 1}`));
}

/**
 * SkillsList - every skill, by category
 */
export const SkillsList: React.FC<SkillsListProps> = ({ skills, characteristics = {}, tickColour, editable = false, onChange, onRoll }) => {
  const change = (part: Partial<HorrorD100SheetSkills>) => onChange?.(part);

  const specialties = (key: HorrorD100SpecialisedSkillKey): HorrorD100SheetSpecialty[] => {
    const held = skills[key];
    return Array.isArray(held) ? held : [];
  };
  const own: HorrorD100SheetOwnSkill[] = Array.isArray(skills.own) ? skills.own : [];

  const fixedRow = (key: HorrorD100FixedSkillKey) => {
    const skill = skills[key];
    if (!isSkill(skill)) return null;
    return (
      <SkillRow
        key={key}
        displayName={HORROR_D100_FIXED_SKILLS[key].name}
        skill={skill}
        base={horrorD100FixedSkillBase(key, characteristics)}
        takesCheck={horrorD100TakesExperienceCheck(key)}
        editable={editable}
        tickColour={tickColour}
        onRoll={onRoll}
        onChange={(patch) => change({ [key]: { ...skill, ...patch } })}
      />
    );
  };

  const languageOwnRow = () => {
    const skill = skills.languageOwn;
    if (!isSkill(skill)) return null;
    return (
      <SkillRow
        key="languageOwn"
        displayName={HORROR_D100_OWN_LANGUAGE_NAME}
        skill={skill}
        base={horrorD100LanguageOwnBase(characteristics.INT ?? 0, characteristics.EDU)}
        takesCheck
        editable={editable}
        tickColour={tickColour}
        onRoll={onRoll}
        onChange={(patch) => change({ languageOwn: { ...skill, ...patch } })}
        detail={skill.language}
        detailBox={{
          value: skill.language ?? '',
          label: 'Own language',
          placeholder: 'Language',
          onChange: (language) => change({ languageOwn: { ...skill, language } }),
        }}
      />
    );
  };

  const listRows = (key: HorrorD100SpecialisedSkillKey) => {
    const entries = specialties(key);
    const { name } = HORROR_D100_SPECIALISED_SKILLS[key];
    const language = key === 'languageOther';
    const names = entries.map((entry) => horrorD100SpecialtyName(key, typeof entry.specialty === 'string' ? entry.specialty : ''));
    const controls = controlNames(names);
    const set = (index: number, patch: Partial<HorrorD100SheetSpecialty>) =>
      change({ [key]: entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
    if (entries.length === 0) return null;
    return (
      <div key={key} className="space-y-0.5">
        {entries.map((entry, index) =>
          isSkill(entry) ? (
            <SkillRow
              key={`${key}-${index}`}
              displayName={names[index]}
              controlName={controls[index]}
              skill={entry}
              base={horrorD100SpecialtyBase(key, entry.specialty ?? '')}
              takesCheck={horrorD100TakesExperienceCheck(key, entry.specialty)}
              editable={editable}
              tickColour={tickColour}
              onRoll={onRoll}
              onChange={(patch) => set(index, patch)}
              nameBox={{
                prefix: language ? 'Language' : name,
                value: entry.specialty ?? '',
                label: language ? `Name of language ${index + 1}` : `Specialty of ${name} ${index + 1}`,
                placeholder: language ? 'Language' : 'Specialty',
                onChange: (specialty) => set(index, { specialty }),
              }}
              onRemove={() => change({ [key]: entries.filter((_, i) => i !== index) })}
            />
          ) : null
        )}
      </div>
    );
  };

  /** The skills of a category that come in specialties, as its add control offers them. */
  const addable = (entries: readonly HorrorD100SkillEntry[]): AddableList[] =>
    entries.flatMap((entry) =>
      entry.kind === 'list'
        ? [{
            key: entry.key,
            label: entry.key === 'languageOther' ? 'Language' : HORROR_D100_SPECIALISED_SKILLS[entry.key].name,
            options: HORROR_D100_SPECIALTIES_OFFERED[entry.key],
            count: specialties(entry.key).length,
            max: listMax(entry.key),
          }]
        : []
    );

  /** Adds a specialty to a skill's list: the one chosen at its base chance, or one to be named at the skill's. */
  const addSpecialty = (key: HorrorD100SpecialisedSkillKey, choice: HorrorD100Specialisation | null) =>
    change({
      [key]: [
        ...specialties(key),
        { specialty: choice?.name ?? '', value: choice?.base ?? HORROR_D100_SPECIALISED_SKILLS[key].base ?? 0, experienceCheck: false },
      ],
    });

  const ownNames = own.map((entry, index) => (typeof entry.name === 'string' && entry.name.trim() !== '' ? entry.name : `Own skill ${index + 1}`));
  const ownControls = controlNames(ownNames);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`${ROW} pb-2 border-b-2 border-ink/20 text-xs text-ink-secondary font-semibold uppercase`}>
        <span className={`${COLUMN.tick} text-center`}>✓</span>
        <span className={COLUMN.name}>Skill Name</span>
        <span className={`${COLUMN.base} text-center`}>Base</span>
        <span className={`${COLUMN.value} text-center`}>Value</span>
        {editable && <span aria-hidden="true" className={COLUMN.button} />}
        {editable && <span aria-hidden="true" className={COLUMN.button} />}
      </div>

      {/* Skills by category */}
      {HORROR_D100_SKILL_CATEGORIES.map((category) => (
        <div key={category.name}>
          <h4 className="text-sm font-bold text-ink uppercase tracking-wider mb-2 px-2">
            {category.name}
          </h4>
          <div className="space-y-0.5">
            {category.skills.map((entry) => {
              if (entry.kind === 'fixed') return fixedRow(entry.key);
              return entry.kind === 'languageOwn' ? languageOwnRow() : listRows(entry.key);
            })}
          </div>
          {/* One add control for the category's skills that come in specialties. */}
          {editable && addable(category.skills).length > 0 && (
            <AddToCategory category={category.name} lists={addable(category.skills)} onAdd={addSpecialty} />
          )}
        </div>
      ))}

      {/* Skills of the character's own */}
      {(editable || own.length > 0) && (
        <div>
          <h4 className="text-sm font-bold text-ink uppercase tracking-wider mb-2 px-2">
            Own Skills
          </h4>
          <div className="space-y-0.5">
            {own.map((entry, index) =>
              isSkill(entry) ? (
                <SkillRow
                  key={`own-${index}`}
                  displayName={ownNames[index]}
                  controlName={ownControls[index]}
                  skill={entry}
                  base={null}
                  takesCheck
                  editable={editable}
                  tickColour={tickColour}
                  onRoll={onRoll}
                  onChange={(patch) => change({ own: own.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)) })}
                  nameBox={{
                    prefix: '',
                    value: entry.name ?? '',
                    label: `Name of own skill ${index + 1}`,
                    placeholder: 'Skill',
                    onChange: (name) => change({ own: own.map((skill, i) => (i === index ? { ...skill, name } : skill)) }),
                  }}
                  onRemove={() => change({ own: own.filter((_, i) => i !== index) })}
                />
              ) : null
            )}
          </div>
          {editable && (
            <div className="px-2 pt-2">
              <button
                type="button"
                disabled={own.length >= listMax('own')}
                onClick={() => change({ own: [...own, { name: 'New skill', value: 0, experienceCheck: false }] })}
                aria-label="Add Skill"
                className={ADD_BUTTON}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Skill
              </button>
              <ListLimitNote full={own.length >= listMax('own')} max={listMax('own')} className={LIMIT_NOTE_CLASS} />
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="bg-ink/5 rounded-md p-3 mt-4">
        <div className="text-xs text-ink-secondary space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-sm border border-ink/20 bg-paper flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-ink-secondary" />
            </div>
            <span>Tick a skill&apos;s experience check when you use it successfully and something is at stake, to roll for improvement later.</span>
          </div>
          <div className="pl-6">
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Base:</strong> the chance a skill starts at. A value can be set anywhere from 0 up.</li>
              <li><strong>Status</strong> and <strong>Knowledge (Blasphemous Lore)</strong> take no experience check.</li>
              <li><strong>Knowledge (Blasphemous Lore)</strong> lowers maximum Sanity point for point.</li>
              <li><strong>Dodge</strong> starts at twice DEX, <strong>Gaming</strong> at INT plus POW, and <strong>Language (Own)</strong> at five times INT, or EDU if higher.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsList;
