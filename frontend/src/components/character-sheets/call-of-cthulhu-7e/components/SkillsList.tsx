/**
 * SkillsList Component
 *
 * Displays Call of Cthulhu skills with base value, current value, and improvement checkbox.
 * Skills are organized by category for easy navigation.
 */

import React from 'react';
import { Check, Dices, Plus, X } from 'lucide-react';
import NumberField from '../../../ui/NumberField';
import ListLimitNote, { listIsFull } from '../../ListLimitNote';
import { LIMIT_NOTE_CLASS } from '../limitNoteClass';
import { SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import {
  COC_FIGHTING_SPECIALISATIONS,
  COC_FIREARMS_SPECIALISATIONS,
  COC_SCIENCE_SPECIALISATIONS,
  COC_OTHER_SPECIALISATION,
  type CoCSpecialisation,
} from '../specialisations';
import { readCoC7eSkillList, type CoC7eSkillList } from '../skillEdits';
import type { COLOR_PRESETS } from '../colorPresets';
import type {
  CoC7eSkill,
  CoC7eSkills,
  CoC7eFirearmsSkills,
  CoC7eFightingSkills,
} from '@/types/game-systems';

/**
 * What a skill row can render.
 *
 * `CoC7eSkill` plus `language`, because the same row renders the entries of
 * `languageOther`, which carry one, and `name`, which a custom skill carries. A
 * science specialisation fits too: its `specialization` is required there and
 * optional here.
 */
interface Skill extends CoC7eSkill {
  language?: string;
  /** A custom skill's own label; see `CoC7eCustomSkill`. */
  name?: string;
}

type ThemeColor = (typeof COLOR_PRESETS)[number];

interface SkillsListProps {
  /** Skills object from character data */
  skills: Partial<CoC7eSkills>;

  /** Theme color for styling checkboxes */
  themeColor?: ThemeColor;

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (skillName: string, field: keyof Skill, value: unknown) => void;

  /** Click to roll 1d100. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;

  /** Edit mode: replace a list of skills the player adds to and removes from. */
  onListChange?: (list: CoC7eSkillList, entries: Record<string, unknown>[]) => void;
}

/** A text box on a skill row, for its name or its specialisation. */
interface RowTextBox {
  value: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}

// Skill categories for organization
const SKILL_CATEGORIES = {
  'Investigation': [
    'accounting', 'anthropology', 'appraise', 'archaeology', 'libraryUse',
    'occult', 'spotHidden', 'listen', 'naturalWorld'
  ],
  'Social': [
    'charm', 'fastTalk', 'intimidate', 'persuade', 'psychology'
  ],
  'Physical': [
    'climb', 'dodge', 'jump', 'ride', 'stealth', 'swim', 'throw'
  ],
  'Combat': [
    'fighting', 'firearms', 'firstAid'
  ],
  'Technical': [
    'artCraft', 'disguise', 'driveAuto', 'electricalRepair', 'locksmith',
    'mechanicalRepair', 'operateHeavyMachinery', 'pilot'
  ],
  'Academic': [
    'history', 'law', 'languageOwn', 'languageOther', 'medicine',
    'navigate', 'science', 'survival'
  ],
  'Unusual': [
    'creditRating', 'cthulhuMythos', 'psychoanalysis', 'sleightOfHand', 'track'
  ]
};

// Skill display names (formatted)
const SKILL_NAMES: Record<string, string> = {
  accounting: 'Accounting',
  anthropology: 'Anthropology',
  appraise: 'Appraise',
  archaeology: 'Archaeology',
  artCraft: 'Art/Craft',
  charm: 'Charm',
  climb: 'Climb',
  creditRating: 'Credit Rating',
  cthulhuMythos: 'Cthulhu Mythos',
  disguise: 'Disguise',
  dodge: 'Dodge',
  driveAuto: 'Drive Auto',
  electricalRepair: 'Electrical Repair',
  fastTalk: 'Fast Talk',
  fighting: 'Fighting',
  firearms: 'Firearms',
  firstAid: 'First Aid',
  history: 'History',
  intimidate: 'Intimidate',
  jump: 'Jump',
  languageOwn: 'Language (Own)',
  languageOther: 'Language (Other)',
  law: 'Law',
  libraryUse: 'Library Use',
  listen: 'Listen',
  locksmith: 'Locksmith',
  mechanicalRepair: 'Mechanical Repair',
  medicine: 'Medicine',
  naturalWorld: 'Natural World',
  navigate: 'Navigate',
  occult: 'Occult',
  operateHeavyMachinery: 'Operate Heavy Machinery',
  persuade: 'Persuade',
  pilot: 'Pilot',
  psychoanalysis: 'Psychoanalysis',
  psychology: 'Psychology',
  ride: 'Ride',
  science: 'Science',
  sleightOfHand: 'Sleight of Hand',
  spotHidden: 'Spot Hidden',
  stealth: 'Stealth',
  survival: 'Survival',
  swim: 'Swim',
  throw: 'Throw',
  track: 'Track'
};

/**
 * SkillRow - Single skill display with improvement checkbox
 */
const SkillRow: React.FC<{
  name: string;
  displayName: string;
  skill: Skill;
  editable: boolean;
  themeColor?: ThemeColor;
  onChange?: (field: keyof Skill, value: unknown) => void;
  onRoll?: (expression: string, purpose: string) => void;
  /** Edit mode: the row's name is typed, after `prefix` ("Fighting"). */
  nameBox?: RowTextBox & { prefix: string };
  /** Edit mode: a box for the skill's specialisation or language. */
  detailBox?: RowTextBox;
  /** Edit mode: the row can be removed. */
  onRemove?: () => void;
  /** What the row's controls are named after, where it differs from its name. */
  controlName?: string;
}> = ({ name, displayName, skill, editable, themeColor, onChange, onRoll, nameBox, detailBox, onRemove, controlName = displayName }) => {
  if (!skill) return null;

  // Determine checkbox styling based on theme color
  const getCheckboxClasses = () => {
    // Ticked in a header colour: the inline style below fills it.
    if (skill.improvementChecked && themeColor) return 'shadow-xs';
    return skill.improvementChecked
      ? 'bg-sepia-700 border-sepia-800 shadow-xs'
      : 'border-sepia-600 bg-white shadow-inner';
  };

  const isClickable = !!onRoll && !editable;
  const purpose = `${displayName} — target: ${skill.currentValue}%`;

  return (
    <div
      className={`flex items-center space-x-2 py-1.5 px-2 rounded-sm group ${isClickable ? 'cursor-pointer hover:bg-sepia-100/50 select-none' : 'hover:bg-parchment-light/30'}`}
      onClick={isClickable ? () => onRoll!('1d100', purpose) : undefined}
      title={isClickable ? `Click to roll ${displayName} (target: ${skill.currentValue}%)` : undefined}
    >
      {/* Improvement Checkbox: a checkbox the keyboard reaches in the editor,
          a mark on the read-only sheet. */}
      {editable ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={skill.improvementChecked}
          aria-label={`Improvement check for ${controlName}`}
          onClick={() => onChange?.('improvementChecked', !skill.improvementChecked)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer hover:scale-110 focus:outline-hidden focus:ring-2 focus:ring-sepia-500 ${getCheckboxClasses()}`}
          style={
            skill.improvementChecked && themeColor
              ? { backgroundColor: themeColor.hex, borderColor: themeColor.hex }
              : undefined
          }
        >
          {skill.improvementChecked && <Check className="w-3.5 h-3.5 text-white font-bold stroke-3" />}
        </button>
      ) : (
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all cursor-default ${getCheckboxClasses()}`}
          style={
            skill.improvementChecked && themeColor
              ? { backgroundColor: themeColor.hex, borderColor: themeColor.hex }
              : undefined
          }
          role="img"
          aria-label={skill.improvementChecked ? 'Marked for improvement' : 'Not marked for improvement'}
        >
          {skill.improvementChecked && <Check className="w-3.5 h-3.5 text-white font-bold stroke-3" />}
        </div>
      )}

      {/* Skill Name */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        {editable && nameBox ? (
          <>
            <span className="text-sm text-sepia-900 shrink-0">{nameBox.prefix}</span>
            <input
              type="text"
              value={nameBox.value}
              onChange={(e) => nameBox.onChange(e.target.value)}
              aria-label={nameBox.label}
              placeholder={nameBox.placeholder}
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="min-w-0 flex-1 text-sm text-sepia-900 bg-white/50 border border-sepia-400 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
            />
          </>
        ) : (
          <span className="text-sm text-sepia-900 truncate">{displayName}</span>
        )}
        {editable && detailBox && (
          <input
            type="text"
            value={detailBox.value}
            onChange={(e) => detailBox.onChange(e.target.value)}
            aria-label={detailBox.label}
            placeholder={detailBox.placeholder}
            maxLength={SHEET_SHORT_TEXT_MAX}
            className="min-w-0 w-28 text-xs text-sepia-900 bg-white/50 border border-sepia-400 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
          />
        )}
        {isClickable && <Dices className="w-3 h-3 text-sepia-600 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />}
        {/* Beside the name only where the name does not already carry it,
            as "Science (Physics)" and "Language (Latin)" do. */}
        {!(editable && detailBox) && skill.specialization && !displayName.includes(`(${skill.specialization})`) && (
          <span className="text-xs text-sepia-600 ml-1">({skill.specialization})</span>
        )}
        {!(editable && detailBox) && skill.language && !displayName.includes(`(${skill.language})`) && (
          <span className="text-xs text-sepia-600 ml-1">({skill.language})</span>
        )}
      </div>

      {/* Base Value */}
      <div className="w-10 text-center text-xs text-sepia-600">
        {skill.baseValue}%
      </div>

      {/* Current Value */}
      <div className="w-14">
        {editable && name !== 'cthulhuMythos' ? (
          <NumberField
            aria-label={`Value of ${controlName}`}
            value={skill.currentValue}
            onChange={(v: number) => onChange?.('currentValue', v)}
            className="w-full text-center text-sm font-semibold text-sepia-900 bg-white/50 border border-sepia-400 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
            min={0}
            max={100}
            fallback={skill.baseValue ?? 0}
          />
        ) : (
          <div className="text-center text-sm font-semibold text-sepia-900">
            {skill.currentValue}%
          </div>
        )}
      </div>

      {/* Half & Fifth (for reference) */}
      <div className="flex items-center space-x-1 text-xs text-sepia-600">
        <span>{Math.floor(skill.currentValue / 2)}</span>
        <span className="text-sepia-400">/</span>
        <span>{Math.floor(skill.currentValue / 5)}</span>
      </div>

      {editable && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${controlName}`}
          title="Remove"
          className="p-0.5 text-red-700 hover:text-red-900 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/**
 * Adds an entry to a list of skills: a choice of the rulebook's
 * specialisations and Other, or just a button where there is nothing to
 * choose from. Stops at the list limit.
 */
const AddSkillControl: React.FC<{
  label: string;
  options?: readonly CoCSpecialisation[];
  count: number;
  onAdd: (choice: CoCSpecialisation) => void;
}> = ({ label, options, count, onAdd }) => {
  const choices = options ? [...options, COC_OTHER_SPECIALISATION] : [];
  const [choice, setChoice] = React.useState(choices[0]?.name ?? '');
  const full = listIsFull({ length: count } as unknown[]);
  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-2">
        {options && (
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label={`${label} to add`}
            className="text-xs bg-white/50 border border-sepia-400 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-2 focus:ring-sepia-500"
          >
            {choices.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name === COC_OTHER_SPECIALISATION.name ? 'Other' : `${option.name} (${option.base}%)`}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={full}
          onClick={() => onAdd(choices.find((option) => option.name === choice) ?? COC_OTHER_SPECIALISATION)}
          aria-label={`Add ${label}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-sepia-800 hover:text-sepia-950 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Add {label}
        </button>
      </div>
      <ListLimitNote full={full} className={LIMIT_NOTE_CLASS} />
    </div>
  );
};

/** A fresh entry for a list, at `base`. */
const freshEntry = (base: number) => ({ baseValue: base, currentValue: base, improvementChecked: false });

/**
 * SkillsList - Display all skills organized by category
 */
export const SkillsList: React.FC<SkillsListProps> = ({ skills, themeColor, editable = false, onChange, onRoll, onListChange }) => {
  const handleSkillChange = (skillName: string, field: keyof Skill, value: unknown) => {
    onChange?.(skillName, field, value);
  };

  /** One list's rows, each with its name box and remove button in edit mode. */
  const listRows = (
    list: CoC7eSkillList,
    nameField: 'specialization' | 'language' | 'name',
    rowName: (entry: Record<string, unknown>, index: number) => string,
    prefix: string,
    boxLabel: (index: number) => string
  ) => {
    const entries = readCoC7eSkillList(skills, list);
    const names = entries.map(rowName);
    return entries.map((entry, index) => (
      <SkillRow
        key={`${list}-${index}`}
        name={`${list}.${index}`}
        displayName={names[index]}
        // Rows of the same name, two languages not yet named, are told apart
        // by their place in the list.
        controlName={names.indexOf(names[index]) === names.lastIndexOf(names[index]) ? names[index] : `${names[index]}, row ${index + 1}`}
        skill={entry as unknown as Skill}
        editable={editable}
        themeColor={themeColor}
        onRoll={onRoll}
        onChange={(field, value) => handleSkillChange(`${list}.${index}`, field, value)}
        nameBox={{
          prefix,
          value: String(entry[nameField] ?? ''),
          label: boxLabel(index),
          onChange: (value) => handleSkillChange(`${list}.${index}`, nameField as keyof Skill, value),
        }}
        onRemove={onListChange ? () => onListChange(list, entries.filter((_, i) => i !== index)) : undefined}
      />
    ));
  };

  /** The add control under a list, in edit mode. */
  const addControl = (
    list: CoC7eSkillList,
    label: string,
    options: readonly CoCSpecialisation[] | undefined,
    entry: (choice: CoCSpecialisation) => Record<string, unknown>
  ) => {
    if (!editable || !onListChange) return null;
    const entries = readCoC7eSkillList(skills, list);
    return (
      <AddSkillControl
        label={label}
        options={options}
        count={entries.length}
        onAdd={(choice) => onListChange(list, [...entries, entry(choice)])}
      />
    );
  };

  /** A specialisation box on a skill that has one, in edit mode. */
  const detailBoxFor = (skillName: string, skill: Skill): RowTextBox | undefined => {
    if (skillName === 'languageOwn') {
      return {
        value: skill.language ?? '',
        label: 'Own language',
        placeholder: 'Language',
        onChange: (value) => handleSkillChange(skillName, 'language', value),
      };
    }
    if (['artCraft', 'pilot', 'survival'].includes(skillName)) {
      return {
        value: skill.specialization ?? '',
        label: `${SKILL_NAMES[skillName]} specialisation`,
        placeholder: 'Specialisation',
        // An empty box stores no specialisation, as the sheet starts.
        onChange: (value) => handleSkillChange(skillName, 'specialization', value === '' ? null : value),
      };
    }
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-2 border-b-2 border-sepia-400">
        <div className="flex items-center space-x-4 text-xs text-sepia-700 font-semibold uppercase">
          <span className="w-4">✓</span>
          <span className="flex-1">Skill Name</span>
          <span className="w-10">Base</span>
          <span className="w-14">Value</span>
          <span>½ / ⅕</span>
        </div>
      </div>

      {/* Skills by Category */}
      {Object.entries(SKILL_CATEGORIES).map(([category, skillNames]) => (
        <div key={category}>
          <h4 className="text-sm font-bold text-sepia-800 uppercase tracking-wider mb-2 px-2">
            {category}
          </h4>
          <div className="space-y-0.5">
            {skillNames.map((skillName) => {
              const skill = skills[skillName as keyof CoC7eSkills];

              if (skillName === 'fighting' && skill) {
                // Brawl, printed on the sheet, and the specialisations added.
                const fighting = skill as CoC7eFightingSkills;
                return (
                  <div key={skillName} className="space-y-0.5">
                    {fighting.brawl && (
                      <SkillRow
                        name="fighting.brawl"
                        displayName="Fighting (Brawl)"
                        skill={fighting.brawl}
                        editable={editable}
                        themeColor={themeColor}
                        onRoll={onRoll}
                        onChange={(field, value) => handleSkillChange('fighting.brawl', field, value)}
                      />
                    )}
                    {listRows(
                      'fighting.custom',
                      'specialization',
                      (entry) => `Fighting (${String(entry.specialization || 'Other')})`,
                      'Fighting',
                      (index) => `Name of Fighting specialisation ${index + 1}`
                    )}
                    {addControl('fighting.custom', 'Fighting specialisation', COC_FIGHTING_SPECIALISATIONS, (choice) => ({
                      specialization: choice.name,
                      ...freshEntry(choice.base),
                    }))}
                  </div>
                );
              }

              if (skillName === 'firearms' && skill) {
                // The three printed on the sheet, and the specialisations added.
                const firearms = skill as CoC7eFirearmsSkills;
                return (
                  <div key={skillName} className="space-y-0.5">
                    {(['handgun', 'rifle', 'shotgun'] as const).map((gun) =>
                      firearms[gun] ? (
                        <SkillRow
                          key={gun}
                          name={`firearms.${gun}`}
                          displayName={`Firearms (${gun.charAt(0).toUpperCase()}${gun.slice(1)})`}
                          skill={firearms[gun]}
                          editable={editable}
                          themeColor={themeColor}
                          onRoll={onRoll}
                          onChange={(field, value) => handleSkillChange(`firearms.${gun}`, field, value)}
                        />
                      ) : null
                    )}
                    {listRows(
                      'firearms.custom',
                      'specialization',
                      (entry) => `Firearms (${String(entry.specialization || 'Other')})`,
                      'Firearms',
                      (index) => `Name of Firearms specialisation ${index + 1}`
                    )}
                    {addControl('firearms.custom', 'Firearms specialisation', COC_FIREARMS_SPECIALISATIONS, (choice) => ({
                      specialization: choice.name,
                      ...freshEntry(choice.base),
                    }))}
                  </div>
                );
              }

              if (skillName === 'languageOther') {
                return (
                  <div key={skillName} className="space-y-0.5">
                    {listRows(
                      'languageOther',
                      'language',
                      (entry) => `Language (${String(entry.language || 'Other')})`,
                      'Language',
                      (index) => `Name of language ${index + 1}`
                    )}
                    {addControl('languageOther', 'Language', undefined, () => ({ language: 'Other language', ...freshEntry(1) }))}
                  </div>
                );
              }

              if (skillName === 'science') {
                return (
                  <div key={skillName} className="space-y-0.5">
                    {listRows(
                      'science',
                      'specialization',
                      (entry) => `Science (${String(entry.specialization || 'Other')})`,
                      'Science',
                      (index) => `Name of science ${index + 1}`
                    )}
                    {addControl('science', 'Science', COC_SCIENCE_SPECIALISATIONS, (choice) => ({
                      specialization: choice.name,
                      ...freshEntry(choice.base),
                    }))}
                  </div>
                );
              }

              // Standard skill
              if (skill && typeof skill === 'object' && 'currentValue' in skill) {
                return (
                  <SkillRow
                    key={skillName}
                    name={skillName}
                    displayName={SKILL_NAMES[skillName] || skillName}
                    skill={skill}
                    editable={editable}
                    themeColor={themeColor}
                    onRoll={onRoll}
                    onChange={(field, value) => handleSkillChange(skillName, field, value)}
                    detailBox={detailBoxFor(skillName, skill as Skill)}
                  />
                );
              }

              return null;
            })}
          </div>
        </div>
      ))}

      {/* Skills of the player's own */}
      {(editable || readCoC7eSkillList(skills, 'customSkills').length > 0) && (
        <div>
          <h4 className="text-sm font-bold text-sepia-800 uppercase tracking-wider mb-2 px-2">
            Custom Skills
          </h4>
          <div className="space-y-0.5">
            {listRows(
              'customSkills',
              'name',
              (entry, index) => String(entry.name || `Custom Skill ${index + 1}`),
              '',
              (index) => `Name of skill ${index + 1}`
            )}
            {addControl('customSkills', 'Skill', undefined, () => ({ name: 'New skill', ...freshEntry(1) }))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-sepia-100/50 rounded-md p-3 mt-4">
        <div className="text-xs text-sepia-700 space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-sm border border-sepia-400 bg-parchment flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-sepia-600" />
            </div>
            <span>Check this box when you use a skill successfully to mark it for improvement between sessions.</span>
          </div>
          <div className="pl-6">
            <span className="font-semibold">Special Skills:</span>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Credit Rating:</strong> Determines wealth tier and spending level.</li>
              <li><strong>Cthulhu Mythos:</strong> Cannot be improved normally; reduces maximum Sanity by equal amount.</li>
              <li><strong>Dodge:</strong> Starts at half DEX. Add skill points and improvements to it like any other skill.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsList;
