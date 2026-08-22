/**
 * DnD5eCharacterView Component
 *
 * Complete read-only view of a D&D 5e character with all stats, skills, spells, and equipment.
 * Organized in tabs for easy navigation.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Shield,
  Zap,
  Footprints,
  Swords,
  Package,
  Sparkles,
  User,
  BookOpen,
  Target,
  Edit,
  Dices,
} from 'lucide-react';
import { Character } from '../../../types';
import { StatBlock } from './components/StatBlock';
import { SkillsList } from './components/SkillsList';
import { AttacksList } from './components/AttacksList';
import { InventoryList } from './components/InventoryList';
import { SpellcastingBlock } from './components/SpellcastingBlock';
import { withAdvantage, withDisadvantage } from '../../../utils/characterRolls';

interface DnD5eCharacterViewProps {
  character: Character;
  onEdit?: () => void;
  /** Called when the user clicks a rollable stat. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

interface RollPopupState {
  anchorX: number;
  anchorY: number;
  expression: string;
  purpose: string;
}

type TabId = 'stats' | 'combat' | 'spells' | 'inventory' | 'features' | 'bio';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: 'stats', label: 'Stats & Skills', icon: Target },
  { id: 'combat', label: 'Combat', icon: Swords },
  { id: 'spells', label: 'Spells', icon: Sparkles },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'features', label: 'Features', icon: BookOpen },
  { id: 'bio', label: 'Biography', icon: User },
];

// D&D 5e color presets for character sheets (same as editor)
const COLOR_PRESETS = [
  { name: 'Classic Red', from: 'from-red-700', to: 'to-red-900', accent: 'red-700', hex: '#b91c1c' },
  { name: 'Royal Blue', from: 'from-blue-700', to: 'to-blue-900', accent: 'blue-700', hex: '#1d4ed8' },
  { name: 'Forest Green', from: 'from-green-700', to: 'to-green-900', accent: 'green-700', hex: '#15803d' },
  { name: 'Deep Purple', from: 'from-purple-700', to: 'to-purple-900', accent: 'purple-700', hex: '#7e22ce' },
  { name: 'Amber Gold', from: 'from-amber-600', to: 'to-amber-800', accent: 'amber-600', hex: '#d97706' },
  { name: 'Slate Gray', from: 'from-slate-700', to: 'to-slate-900', accent: 'slate-700', hex: '#334155' },
  { name: 'Crimson', from: 'from-rose-700', to: 'to-rose-900', accent: 'rose-700', hex: '#be123c' },
  { name: 'Teal', from: 'from-teal-700', to: 'to-teal-900', accent: 'teal-700', hex: '#0f766e' },
  { name: 'Indigo', from: 'from-indigo-700', to: 'to-indigo-900', accent: 'indigo-700', hex: '#4338ca' },
  { name: 'Emerald', from: 'from-emerald-700', to: 'to-emerald-900', accent: 'emerald-700', hex: '#047857' },
  { name: 'Orange', from: 'from-orange-700', to: 'to-orange-900', accent: 'orange-700', hex: '#c2410c' },
  { name: 'Pink', from: 'from-pink-700', to: 'to-pink-900', accent: 'pink-700', hex: '#be185d' },
];

/**
 * DnD5eCharacterView - Read-only D&D 5e character sheet
 */
export const DnD5eCharacterView: React.FC<DnD5eCharacterViewProps> = ({ character, onEdit, onRoll }) => {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const data = character.data as any; // Type will be DnD5eCharacterData
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');
  const [rollPopup, setRollPopup] = useState<RollPopupState | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup on outside click
  useEffect(() => {
    if (!rollPopup) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setRollPopup(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [rollPopup]);

  const handleRoll = (expression: string, purpose: string) => {
    if (onRoll) onRoll(expression, purpose);
    setRollPopup(null);
  };

  const showRollPopup = (e: React.MouseEvent, expression: string, purpose: string) => {
    e.preventDefault();
    setRollPopup({ anchorX: e.clientX, anchorY: e.clientY, expression, purpose });
  };

  // Load saved color preference from character metadata
  useEffect(() => {
    if (data.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === data.themeColor);
      if (savedColor) {
        setThemeColor(savedColor);
        setIsCustomColor(false);
      } else if (data.themeColor.startsWith('#')) {
        // Custom hex color
        setCustomColorHex(data.themeColor);
        setIsCustomColor(true);
      }
    }
  }, [data.themeColor]);

  // Format modifier for display
  const formatModifier = (mod: number): string => {
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  // Render character header
  const renderHeader = () => {
    // Determine the current background style
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    const headerClasses = isCustomColor
      ? 'text-white p-6 rounded-t-lg relative'
      : `bg-gradient-to-r ${themeColor.from} ${themeColor.to} text-white p-6 rounded-t-lg relative`;

    return (
      <div className={headerClasses} style={headerStyle}>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-4 right-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors flex items-center space-x-2 font-medium"
            title="Edit character"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
        )}

      <div className="flex items-start justify-between pr-24">
        <div className="flex items-start space-x-4">
          {/* Token Image */}
          <div className="flex-shrink-0">
            {character.tokenImageUrl ? (
              <img
                src={character.tokenImageUrl}
                alt={data.characterName || 'Character'}
                className="w-20 h-20 rounded-full border-4 border-white/20 object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-4 border-white/20 bg-stone-800 flex items-center justify-center">
                <User className="w-10 h-10 text-white/40" />
              </div>
            )}
          </div>

          {/* Character Info */}
          <div>
            <h2 className="text-3xl font-bold mb-1">{data.characterName || 'Unnamed Character'}</h2>
            <div className="flex items-center space-x-4 text-red-100">
              <span>
                Level {data.level} {data.race} {data.class}
              </span>
              {data.alignment && <span>• {data.alignment}</span>}
              {data.background && <span>• {data.background}</span>}
            </div>
          </div>
        </div>

        {data.experiencePoints !== undefined && (
          <div className="text-right">
            <div className="text-xs text-red-200">Experience</div>
            <div className="text-xl font-bold">{data.experiencePoints.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
    );
  };

  // Render tabs
  const renderTabs = () => (
    <div className="flex space-x-1 border-b-2 border-stone-200 bg-stone-50 px-4">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center space-x-2 px-4 py-3 font-medium transition-colors
              ${isActive
                ? `text-${themeColor.accent} border-b-2 border-${themeColor.accent} -mb-0.5 bg-white`
                : 'text-stone-600 hover:text-stone-800 hover:bg-stone-100'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  // Render Stats & Skills tab
  const renderStatsTab = () => (
    <div className="space-y-6">
      {/* Ability Scores */}
      <div>
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Ability Scores</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {data.stats && (() => {
            const statEntries: Array<[string, string, keyof typeof data.stats]> = [
              ['STR', 'Strength', 'strength'],
              ['DEX', 'Dexterity', 'dexterity'],
              ['CON', 'Constitution', 'constitution'],
              ['INT', 'Intelligence', 'intelligence'],
              ['WIS', 'Wisdom', 'wisdom'],
              ['CHA', 'Charisma', 'charisma'],
            ];
            return statEntries.map(([label, fullName, key]) => {
              const stat = data.stats[key];
              const expr = stat.modifier >= 0 ? `1d20+${stat.modifier}` : `1d20${stat.modifier}`;
              const purpose = `${fullName} Check`;
              return (
                <StatBlock
                  key={key as string}
                  label={label}
                  score={stat.score}
                  modifier={stat.modifier}
                  colorFrom={themeColor.from}
                  colorTo={themeColor.to}
                  colorHex={themeColor.hex}
                  customColor={isCustomColor ? customColorHex : undefined}
                  onRoll={onRoll ? () => handleRoll(expr, purpose) : undefined}
                  onRollContext={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
                />
              );
            });
          })()}
        </div>
      </div>

      {/* Saving Throws */}
      {data.savingThrows && (
        <div>
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Saving Throws</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-stone-50 border border-stone-200 rounded-lg p-4">
            {Object.entries(data.savingThrows).map(([key, save]: [string, any]) => {
              const expr = save.bonus >= 0 ? `1d20+${save.bonus}` : `1d20${save.bonus}`;
              const purpose = `${key.charAt(0).toUpperCase() + key.slice(1)} Save`;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between py-1 px-2 rounded group ${onRoll ? 'cursor-pointer hover:bg-red-50 select-none' : ''}`}
                  onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
                  onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
                  title={onRoll ? `Left-click: roll  |  Right-click: Advantage / Disadvantage` : undefined}
                >
                  <div className="flex items-center gap-1">
                    {onRoll && <Dices className="w-3 h-3 text-red-700 opacity-0 group-hover:opacity-60 transition-opacity" />}
                    <span className="text-sm capitalize">{key}</span>
                  </div>
                  <span className={`text-sm font-semibold ${save.proficient ? 'text-red-700' : 'text-stone-600'}`}>
                    {formatModifier(save.bonus)}
                    {save.proficient && ' •'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills */}
      {data.skills && (
        <div>
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Skills</h3>
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
            <SkillsList
              skills={data.skills}
              passivePerception={data.passivePerception}
              onRoll={onRoll ? (expr, purpose) => handleRoll(expr, purpose) : undefined}
              onRollContext={onRoll ? (e, expr, purpose) => showRollPopup(e, expr, purpose) : undefined}
            />
          </div>
        </div>
      )}

      {/* Proficiency Bonus & Inspiration */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-center">
          <div className="text-sm text-stone-600 mb-1">Proficiency Bonus</div>
          <div className="text-2xl font-bold text-red-700">
            {formatModifier(data.proficiencyBonus)}
          </div>
        </div>
        {data.inspiration !== undefined && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4 text-center">
            <div className="text-sm text-stone-600 mb-1">Inspiration</div>
            <div className="text-2xl font-bold text-yellow-700">
              {data.inspiration ? 'Yes' : 'No'}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div className="space-y-6">
      {/* Combat Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {data.armorClass !== undefined && (
          <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4 text-center">
            <Shield className="w-6 h-6 mx-auto mb-2 text-stone-600" />
            <div className="text-xs text-stone-500 mb-1">Armor Class</div>
            <div className="text-2xl font-bold text-stone-800">{data.armorClass}</div>
          </div>
        )}
        {data.initiative !== undefined && (
          <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4 text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
            <div className="text-xs text-stone-500 mb-1">Initiative</div>
            <div className="text-2xl font-bold text-stone-800">{formatModifier(data.initiative)}</div>
          </div>
        )}
        {data.speed !== undefined && (
          <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4 text-center">
            <Footprints className="w-6 h-6 mx-auto mb-2 text-blue-600" />
            <div className="text-xs text-stone-500 mb-1">Speed</div>
            <div className="text-2xl font-bold text-stone-800">{data.speed} ft</div>
          </div>
        )}
        {data.hp && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 text-center">
            <Heart className="w-6 h-6 mx-auto mb-2 text-red-600" />
            <div className="text-xs text-stone-500 mb-1">Hit Points</div>
            <div className="text-2xl font-bold text-red-700">
              {data.hp.current}/{data.hp.maximum}
            </div>
            {data.hp.temporary > 0 && (
              <div className="text-xs text-blue-600 mt-1">+{data.hp.temporary} temp</div>
            )}
          </div>
        )}
      </div>

      {/* Hit Dice */}
      {data.hitDice && data.hitDice.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Hit Dice</h3>
          <div className="flex flex-wrap gap-3">
            {data.hitDice.map((hd: any, idx: number) => (
              <div key={idx} className="px-4 py-2 bg-white border border-stone-300 rounded-lg">
                <div className="text-xs text-stone-500 capitalize">{hd.class}</div>
                <div className="font-semibold text-stone-800">
                  {hd.remaining}/{hd.total.replace(/\d+/, hd.total.match(/\d+/)[0])}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Death Saves */}
      {data.deathSaves && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Death Saves</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-green-700 font-medium mb-2">Successes</div>
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 ${
                      i <= data.deathSaves.successes
                        ? 'bg-green-500 border-green-600'
                        : 'bg-white border-stone-300'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-red-700 font-medium mb-2">Failures</div>
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 ${
                      i <= data.deathSaves.failures
                        ? 'bg-red-500 border-red-600'
                        : 'bg-white border-stone-300'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conditions */}
      {data.conditions && data.conditions.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Conditions</h3>
          <div className="flex flex-wrap gap-2">
            {data.conditions.map((condition: string, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded-full capitalize"
              >
                {condition}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attacks */}
      {data.attacks && (
        <div>
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Attacks & Weapons</h3>
          <AttacksList
            attacks={data.attacks}
            onRoll={onRoll ? (expr, purpose) => handleRoll(expr, purpose) : undefined}
            onRollContext={onRoll ? (e, expr, purpose) => showRollPopup(e, expr, purpose) : undefined}
          />
        </div>
      )}
    </div>
  );

  // Render Spells tab
  const renderSpellsTab = () => (
    <div>
      {data.spellcasting ? (
        <SpellcastingBlock spellcasting={data.spellcasting} />
      ) : (
        <div className="text-center py-12 text-stone-500">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-stone-500" />
          <p>This character is not a spellcaster</p>
        </div>
      )}
    </div>
  );

  // Render Inventory tab
  const renderInventoryTab = () => (
    <div>
      <InventoryList inventory={data.inventory} currency={data.currency} />
    </div>
  );

  // Helper function to categorize proficiencies
  const categorizeProficiencies = (items: string[]) => {
    const armor: string[] = [];
    const weapons: string[] = [];
    const tools: string[] = [];
    const languages: string[] = [];

    // Common D&D 5e languages
    const knownLanguages = [
      'Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc',
      'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial',
      'Sylvan', 'Undercommon', 'Aquan', 'Auran', 'Ignan', 'Terran'
    ];

    items.forEach(item => {
      const lower = item.toLowerCase();

      // Check if it's a language
      if (knownLanguages.some(lang => item.includes(lang))) {
        languages.push(item);
      }
      // Check if it's armor
      else if (lower.includes('armor') || lower.includes('shield')) {
        armor.push(item);
      }
      // Check if it's a tool
      else if (
        lower.includes('tools') || lower.includes('kit') ||
        lower.includes('instrument') || lower.includes('supplies') ||
        lower.includes('drum') || lower.includes('flute') ||
        lower.includes('lute') || lower.includes('viol') || lower.includes('horn')
      ) {
        tools.push(item);
      }
      // Otherwise, assume it's a weapon
      else {
        weapons.push(item);
      }
    });

    return { armor, weapons, tools, languages };
  };

  // Render Features tab
  const renderFeaturesTab = () => {
    const proficiencies = data.proficienciesAndLanguages
      ? categorizeProficiencies(data.proficienciesAndLanguages)
      : { armor: [], weapons: [], tools: [], languages: [] };

    return (
      <div className="space-y-6">
        {/* Proficiencies & Training - Organized like D&D character sheet */}
        {data.proficienciesAndLanguages && data.proficienciesAndLanguages.length > 0 && (
          <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-stone-800 mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-red-700" />
              Proficiencies & Training
            </h3>

            <div className="space-y-4">
              {/* Armor */}
              {proficiencies.armor.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2 uppercase tracking-wide">
                    Armor
                  </div>
                  <div className="text-stone-800">
                    {proficiencies.armor.join(', ')}
                  </div>
                </div>
              )}

              {/* Weapons */}
              {proficiencies.weapons.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2 uppercase tracking-wide">
                    Weapons
                  </div>
                  <div className="text-stone-800">
                    {proficiencies.weapons.join(', ')}
                  </div>
                </div>
              )}

              {/* Tools */}
              {proficiencies.tools.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2 uppercase tracking-wide">
                    Tools
                  </div>
                  <div className="text-stone-800">
                    {proficiencies.tools.join(', ')}
                  </div>
                </div>
              )}

              {/* Languages */}
              {proficiencies.languages.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-stone-700 mb-2 uppercase tracking-wide">
                    Languages
                  </div>
                  <div className="text-stone-800">
                    {proficiencies.languages.join(', ')}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Features & Traits */}
      {data.featuresAndTraits && data.featuresAndTraits.length > 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Features & Traits</h3>
          <ul className="space-y-2">
            {data.featuresAndTraits.map((feature: string, idx: number) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-red-600 mt-1">•</span>
                <span className="text-stone-700">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional Features */}
      {data.additionalFeaturesAndTraits && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Additional Features</h3>
          <p className="text-stone-700 whitespace-pre-wrap">{data.additionalFeaturesAndTraits}</p>
        </div>
      )}
    </div>
    );
  };

  // Render Biography tab
  const renderBioTab = () => (
    <div className="space-y-6">
      {/* Appearance */}
      {data.appearance && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Appearance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-stone-500">Age</div>
              <div className="text-stone-800">{data.appearance.age}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Height</div>
              <div className="text-stone-800">{data.appearance.height}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Weight</div>
              <div className="text-stone-800">{data.appearance.weight}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Eyes</div>
              <div className="text-stone-800">{data.appearance.eyes}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Skin</div>
              <div className="text-stone-800">{data.appearance.skin}</div>
            </div>
            <div>
              <div className="text-xs text-stone-500">Hair</div>
              <div className="text-stone-800">{data.appearance.hair}</div>
            </div>
          </div>
        </div>
      )}

      {/* Personality */}
      {data.personality && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Personality</h3>
          <div className="space-y-3">
            {data.personality.traits && (
              <div>
                <div className="text-sm font-medium text-stone-600 mb-1">Traits</div>
                <p className="text-stone-700">{data.personality.traits}</p>
              </div>
            )}
            {data.personality.ideals && (
              <div>
                <div className="text-sm font-medium text-stone-600 mb-1">Ideals</div>
                <p className="text-stone-700">{data.personality.ideals}</p>
              </div>
            )}
            {data.personality.bonds && (
              <div>
                <div className="text-sm font-medium text-stone-600 mb-1">Bonds</div>
                <p className="text-stone-700">{data.personality.bonds}</p>
              </div>
            )}
            {data.personality.flaws && (
              <div>
                <div className="text-sm font-medium text-stone-600 mb-1">Flaws</div>
                <p className="text-stone-700">{data.personality.flaws}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backstory */}
      {data.backstory && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Backstory</h3>
          <p className="text-stone-700 whitespace-pre-wrap">{data.backstory}</p>
        </div>
      )}

      {/* Allies & Organizations */}
      {data.alliesAndOrganizations && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Allies & Organizations</h3>
          <div className="space-y-2">
            <div className="font-medium text-stone-800">{data.alliesAndOrganizations.name}</div>
            <p className="text-stone-700">{data.alliesAndOrganizations.description}</p>
          </div>
        </div>
      )}

      {/* Treasure */}
      {data.treasure && (
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Treasure</h3>
          <p className="text-stone-700 whitespace-pre-wrap">{data.treasure}</p>
        </div>
      )}
    </div>
  );

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'stats':
        return renderStatsTab();
      case 'combat':
        return renderCombatTab();
      case 'spells':
        return renderSpellsTab();
      case 'inventory':
        return renderInventoryTab();
      case 'features':
        return renderFeaturesTab();
      case 'bio':
        return renderBioTab();
      default:
        return null;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {renderHeader()}
      {renderTabs()}
      <div className="p-6">{renderTabContent()}</div>

      {/* Advantage / Disadvantage popup (shown on right-click of any rollable stat) */}
      {rollPopup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden"
          style={{ left: rollPopup.anchorX, top: rollPopup.anchorY, minWidth: 180 }}
        >
          <div className="px-3 py-2 bg-red-700 text-white text-xs font-semibold truncate">
            {rollPopup.purpose}
          </div>
          {[
            { label: 'Normal', expr: rollPopup.expression, suffix: '' },
            { label: 'Advantage', expr: withAdvantage(rollPopup.expression), suffix: ' (Advantage)' },
            { label: 'Disadvantage', expr: withDisadvantage(rollPopup.expression), suffix: ' (Disadvantage)' },
          ].map(({ label, expr, suffix }) => (
            <button
              key={label}
              onClick={() => handleRoll(expr, rollPopup.purpose + suffix)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-red-50 transition-colors text-left"
            >
              <Dices className="w-3.5 h-3.5 text-red-700 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
