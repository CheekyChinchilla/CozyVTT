/**
 * SkillsList Component
 *
 * Displays Call of Cthulhu skills with base value, current value, and improvement checkbox.
 * Skills are organized by category for easy navigation.
 */

import React from 'react';
import { Check, Dices } from 'lucide-react';

interface Skill {
  baseValue: number;
  currentValue: number;
  improvementChecked: boolean;
  specialization?: string | null;
  language?: string;
  notes?: string;
}

interface ThemeColor {
  name: string;
  from: string;
  to: string;
  accent: string;
  border: string;
  hex: string;
}

interface SkillsListProps {
  /** Skills object from character data */
  skills: Record<string, any>;

  /** Theme color for styling checkboxes */
  themeColor?: ThemeColor;

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (skillName: string, field: keyof Skill, value: any) => void;

  /** Click to roll 1d100. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
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
  onChange?: (field: keyof Skill, value: any) => void;
  onRoll?: (expression: string, purpose: string) => void;
}> = ({ name, displayName, skill, editable, themeColor, onChange, onRoll }) => {
  if (!skill) return null;

  // Determine checkbox styling based on theme color
  const getCheckboxClasses = () => {
    if (skill.improvementChecked && themeColor) {
      // Use theme color for checked state
      return `bg-${themeColor.accent} border-${themeColor.accent}`;
    }
    return skill.improvementChecked
      ? 'bg-sepia-700 border-sepia-800 shadow-sm'
      : 'border-sepia-600 bg-white shadow-inner';
  };

  const isClickable = !!onRoll && !editable;
  const purpose = `${displayName} — target: ${skill.currentValue}%`;

  return (
    <div
      className={`flex items-center space-x-2 py-1.5 px-2 rounded group ${isClickable ? 'cursor-pointer hover:bg-sepia-100/50 select-none' : 'hover:bg-parchment-light/30'}`}
      onClick={isClickable ? () => onRoll!('1d100', purpose) : undefined}
      title={isClickable ? `Click to roll ${displayName} (target: ${skill.currentValue}%)` : undefined}
    >
      {/* Improvement Checkbox */}
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          editable ? 'cursor-pointer hover:scale-110' : 'cursor-default'
        } ${getCheckboxClasses()}`}
        style={
          skill.improvementChecked && themeColor
            ? { backgroundColor: themeColor.hex, borderColor: themeColor.hex }
            : undefined
        }
        onClick={() => editable && onChange?.('improvementChecked', !skill.improvementChecked)}
      >
        {skill.improvementChecked && <Check className="w-3.5 h-3.5 text-white font-bold stroke-[3]" />}
      </div>

      {/* Skill Name */}
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <span className="text-sm text-sepia-900 truncate">{displayName}</span>
        {isClickable && <Dices className="w-3 h-3 text-sepia-600 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />}
        {skill.specialization && (
          <span className="text-xs text-sepia-600 ml-1">({skill.specialization})</span>
        )}
        {skill.language && (
          <span className="text-xs text-sepia-600 ml-1">({skill.language})</span>
        )}
      </div>

      {/* Base Value */}
      <div className="w-10 text-center text-xs text-sepia-600">
        {skill.baseValue}%
      </div>

      {/* Current Value */}
      <div className="w-14">
        {editable && name !== 'cthulhuMythos' && name !== 'dodge' ? (
          <input
            type="number"
            value={skill.currentValue}
            onChange={(e) => onChange?.('currentValue', parseInt(e.target.value) || 0)}
            className="w-full text-center text-sm font-semibold text-sepia-900 bg-white/50 border border-sepia-400 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-sepia-500"
            min={skill.baseValue}
            max={99}
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
    </div>
  );
};

/**
 * SkillsList - Display all skills organized by category
 */
export const SkillsList: React.FC<SkillsListProps> = ({ skills, themeColor, editable = false, onChange, onRoll }) => {
  const handleSkillChange = (skillName: string, field: keyof Skill, value: any) => {
    onChange?.(skillName, field, value);
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
              const skill = skills[skillName];

              // Handle special cases
              if (skillName === 'fighting' && skill?.custom) {
                // Fighting specializations
                return (
                  <div key={skillName}>
                    <SkillRow
                      name="fighting.brawl"
                      displayName="Fighting (Brawl)"
                      skill={skill.brawl}
                      editable={editable}
                      themeColor={themeColor}
                      onRoll={onRoll}
                      onChange={(field, value) => handleSkillChange('fighting.brawl', field, value)}
                    />
                  </div>
                );
              }

              if (skillName === 'firearms' && skill) {
                // Firearms specializations
                return (
                  <div key={skillName} className="space-y-0.5">
                    {skill.handgun && (
                      <SkillRow
                        name="firearms.handgun"
                        displayName="Firearms (Handgun)"
                        skill={skill.handgun}
                        editable={editable}
                        themeColor={themeColor}
                        onChange={(field, value) => handleSkillChange('firearms.handgun', field, value)}
                      />
                    )}
                    {skill.rifle && (
                      <SkillRow
                        name="firearms.rifle"
                        displayName="Firearms (Rifle)"
                        skill={skill.rifle}
                        editable={editable}
                        themeColor={themeColor}
                        onChange={(field, value) => handleSkillChange('firearms.rifle', field, value)}
                      />
                    )}
                    {skill.shotgun && (
                      <SkillRow
                        name="firearms.shotgun"
                        displayName="Firearms (Shotgun)"
                        skill={skill.shotgun}
                        editable={editable}
                        themeColor={themeColor}
                        onChange={(field, value) => handleSkillChange('firearms.shotgun', field, value)}
                      />
                    )}
                  </div>
                );
              }

              if (skillName === 'languageOther' && Array.isArray(skill)) {
                // Other languages (array)
                return (
                  <div key={skillName}>
                    {skill.map((lang: any, idx: number) => (
                      <SkillRow
                        key={`language-${idx}`}
                        name={`languageOther.${idx}`}
                        displayName={`Language (${lang.language})`}
                        skill={lang}
                        editable={editable}
                        themeColor={themeColor}
                        onChange={(field, value) => handleSkillChange(`languageOther.${idx}`, field, value)}
                      />
                    ))}
                  </div>
                );
              }

              if (skillName === 'science' && Array.isArray(skill)) {
                // Science specializations (array)
                return (
                  <div key={skillName}>
                    {skill.map((sci: any, idx: number) => (
                      <SkillRow
                        key={`science-${idx}`}
                        name={`science.${idx}`}
                        displayName={`Science (${sci.specialization})`}
                        skill={sci}
                        editable={editable}
                        themeColor={themeColor}
                        onChange={(field, value) => handleSkillChange(`science.${idx}`, field, value)}
                      />
                    ))}
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
                  />
                );
              }

              return null;
            })}
          </div>
        </div>
      ))}

      {/* Custom Skills */}
      {skills.customSkills && Array.isArray(skills.customSkills) && skills.customSkills.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-sepia-800 uppercase tracking-wider mb-2 px-2">
            Custom Skills
          </h4>
          <div className="space-y-0.5">
            {skills.customSkills.map((skill: any, idx: number) => (
              <SkillRow
                key={`custom-${idx}`}
                name={`customSkills.${idx}`}
                displayName={skill.name || `Custom Skill ${idx + 1}`}
                skill={skill}
                editable={editable}
                themeColor={themeColor}
                onRoll={onRoll}
                onChange={(field, value) => handleSkillChange(`customSkills.${idx}`, field, value)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-sepia-100/50 rounded-md p-3 mt-4">
        <div className="text-xs text-sepia-700 space-y-1">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded border border-sepia-400 bg-parchment flex items-center justify-center flex-shrink-0">
              <Check className="w-3 h-3 text-sepia-600" />
            </div>
            <span>Check this box when you use a skill successfully to mark it for improvement between sessions.</span>
          </div>
          <div className="mt-2 pl-6">
            <span className="font-semibold">Special Skills:</span>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><strong>Credit Rating:</strong> Determines wealth tier and spending level.</li>
              <li><strong>Cthulhu Mythos:</strong> Cannot be improved normally; reduces maximum Sanity by equal amount.</li>
              <li><strong>Dodge:</strong> Derived from DEX/2; can be improved with successful use.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillsList;
