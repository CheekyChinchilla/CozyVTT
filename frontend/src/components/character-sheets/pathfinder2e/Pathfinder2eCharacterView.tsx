/**
 * Pathfinder2eCharacterView Component
 *
 * Displays Pathfinder 2nd Edition character sheet in read-only mode.
 * Implements the 5-tier proficiency system, bulk inventory, and PF2e mechanics.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Shield,
  Eye,
  Sparkles,
  Package,
  BookOpen,
  User,
  Coins,
  Target,
  Zap,
  Skull,
  Edit,
  Dices,
} from 'lucide-react';
import ProficiencyIndicator, {
  ProficiencyRank,
} from './components/ProficiencyIndicator';
import FeatsList from './components/FeatsList';
import StrikesList from './components/StrikesList';
import BulkTracker from './components/BulkTracker';
import { withAdvantage, withDisadvantage } from '../../../utils/characterRolls';

interface Pathfinder2eCharacterViewProps {
  character: any; // Full character object with data field
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

/**
 * Format modifier with sign
 */
const formatModifier = (mod: number): string => {
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

/**
 * Format spell rank
 */
const formatSpellRank = (rank: number): string => {
  if (rank === 0) return 'Cantrip';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = rank % 100;
  return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
};

// Pathfinder 2e color presets (matching editor)
const COLOR_PRESETS = [
  { name: 'Pathfinder Blue', from: 'from-blue-700', to: 'to-blue-900', accent: 'blue-700', hex: '#1d4ed8' },
  { name: 'Golden', from: 'from-amber-600', to: 'to-amber-800', accent: 'amber-600', hex: '#d97706' },
  { name: 'Emerald', from: 'from-emerald-700', to: 'to-emerald-900', accent: 'emerald-700', hex: '#047857' },
  { name: 'Royal Purple', from: 'from-purple-700', to: 'to-purple-900', accent: 'purple-700', hex: '#7e22ce' },
  { name: 'Crimson', from: 'from-rose-700', to: 'to-rose-900', accent: 'rose-700', hex: '#be123c' },
  { name: 'Teal', from: 'from-teal-700', to: 'to-teal-900', accent: 'teal-700', hex: '#0f766e' },
  { name: 'Indigo', from: 'from-indigo-700', to: 'to-indigo-900', accent: 'indigo-700', hex: '#4338ca' },
  { name: 'Slate', from: 'from-slate-700', to: 'to-slate-900', accent: 'slate-700', hex: '#334155' },
];

const shouldUseWhiteText = (hexColor: string): boolean => {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
};

export const Pathfinder2eCharacterView: React.FC<Pathfinder2eCharacterViewProps> = ({
  character,
  onEdit,
  onRoll,
}) => {
  const data = character.data;
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0]);
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

  // Load saved color preference from character data
  useEffect(() => {
    if (data.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === data.themeColor);
      if (savedColor) {
        setSelectedColor(savedColor);
        setIsCustomColor(false);
      } else if (data.themeColor.startsWith('#')) {
        setCustomColorHex(data.themeColor);
        setIsCustomColor(true);
      }
    }
  }, [data.themeColor]);

  // Render character header with name, class, level, and basic info
  const renderHeader = () => {
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    const headerTextColor = isCustomColor
      ? (shouldUseWhiteText(customColorHex) ? 'text-white' : 'text-stone-900')
      : 'text-white';

    const headerClasses = isCustomColor
      ? `${headerTextColor} p-6 rounded-t-lg relative`
      : `bg-gradient-to-r ${selectedColor.from} ${selectedColor.to} ${headerTextColor} p-6 rounded-t-lg relative`;

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
          {character.tokenImageUrl && (
            <img
              src={character.tokenImageUrl}
              alt={data.characterName}
              className="w-24 h-24 rounded-full border-4 border-white/20 object-cover"
            />
          )}

          {/* Character Info */}
          <div>
            <h2 className="text-3xl font-bold mb-2">{data.characterName}</h2>
            <div className="flex items-center flex-wrap gap-2 opacity-90">
              <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                Level {data.level} {data.class}
              </span>
              <span className="px-3 py-1 bg-white/10 rounded-full text-sm">
                {data.ancestry} ({data.heritage})
              </span>
              <span className="px-3 py-1 bg-white/10 rounded-full text-sm">
                {data.background}
              </span>
            </div>
            {data.playerName && (
              <div className="mt-2 text-sm opacity-80">
                Player: {data.playerName}
              </div>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs opacity-70 mb-1">Experience Points</div>
          <div className="text-2xl font-bold">{data.experiencePoints || 0}</div>
          {data.heroPoints !== undefined && (
            <div className="mt-2">
              <div className="text-xs opacity-70 mb-1">Hero Points</div>
              <div className="text-xl font-bold">
                {data.heroPoints} / 3
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    );
  };

  // Render ability scores in a grid
  const renderAttributes = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center">
        <User className="w-5 h-5 mr-2" />
        Ability Scores
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
        {['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map((ability) => {
          const abilityData = data.attributes?.[ability] || { score: 10, modifier: 0 };
          const expr = abilityData.modifier >= 0 ? `1d20+${abilityData.modifier}` : `1d20${abilityData.modifier}`;
          const purpose = `${ability.charAt(0).toUpperCase() + ability.slice(1)} Check`;
          return (
            <div
              key={ability}
              className={`flex flex-col items-center rounded-lg p-1 transition-colors group ${onRoll ? 'cursor-pointer hover:bg-stone-100 select-none' : ''}`}
              onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
              onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
              title={onRoll ? `Left-click: roll ${ability} check  |  Right-click: Fortune / Misfortune` : undefined}
            >
              <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
                {ability.slice(0, 3)}
              </div>
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg border-2 border-blue-900">
                <span className="text-2xl font-bold text-white">
                  {formatModifier(abilityData.modifier)}
                </span>
                {onRoll && (
                  <div className="absolute -bottom-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-4 h-4 rounded-full bg-blue-700 flex items-center justify-center shadow">
                      <Dices className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold text-stone-700 mt-2">
                {abilityData.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render saving throws with proficiency ranks
  const renderSavingThrows = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center">
        <Shield className="w-5 h-5 mr-2" />
        Saving Throws
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['fortitude', 'reflex', 'will'].map((save) => {
          const saveData = data.savingThrows?.[save] || {
            proficiencyRank: 'untrained',
            bonus: 0,
            itemBonus: 0,
          };
          const expr = saveData.bonus >= 0 ? `1d20+${saveData.bonus}` : `1d20${saveData.bonus}`;
          const purpose = `${save.charAt(0).toUpperCase() + save.slice(1)} Save`;
          return (
            <div
              key={save}
              className={`bg-white border border-stone-200 rounded-lg p-3 flex items-center justify-between group ${onRoll ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 select-none' : ''}`}
              onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
              onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
              title={onRoll ? `Left-click: roll  |  Right-click: Fortune / Misfortune` : undefined}
            >
              <div className="flex items-center space-x-2">
                <ProficiencyIndicator rank={saveData.proficiencyRank as ProficiencyRank} />
                <span className="font-semibold text-stone-800 capitalize">{save}</span>
                {onRoll && <Dices className="w-3.5 h-3.5 text-blue-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
              </div>
              <span className="text-2xl font-bold text-blue-700">
                {formatModifier(saveData.bonus)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Render perception with proficiency
  const renderPerception = () => {
    const perception = data.perception || {
      proficiencyRank: 'untrained',
      bonus: 0,
      senses: [],
    };

    return (
      <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-bold text-stone-800 mb-3 flex items-center">
          <Eye className="w-5 h-5 mr-2" />
          Perception
        </h3>
        {(() => {
          const expr = perception.bonus >= 0 ? `1d20+${perception.bonus}` : `1d20${perception.bonus}`;
          return (
            <div
              className={`bg-white border border-stone-200 rounded-lg p-4 flex items-center justify-between group ${onRoll ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 select-none' : ''}`}
              onClick={onRoll ? () => handleRoll(expr, 'Perception') : undefined}
              onContextMenu={onRoll ? (e) => showRollPopup(e, expr, 'Perception') : undefined}
              title={onRoll ? `Left-click: roll Perception  |  Right-click: Fortune / Misfortune` : undefined}
            >
              <div className="flex items-center space-x-3">
                <ProficiencyIndicator rank={perception.proficiencyRank as ProficiencyRank} size="lg" />
                <div>
                  <div className="flex items-center gap-1 text-xs text-stone-600 uppercase tracking-wide">
                    Perception
                    {onRoll && <Dices className="w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
                  </div>
                  {perception.senses && perception.senses.length > 0 && (
                    <div className="text-xs text-stone-500 mt-1">
                      {perception.senses.join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <span className="text-3xl font-bold text-blue-700">
                {formatModifier(perception.bonus)}
              </span>
            </div>
          );
        })()}
      </div>
    );
  };

  // Render AC, Class DC, Initiative, Speed
  const renderCombatStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Armor Class */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-4">
        <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center">
          <Shield className="w-4 h-4 mr-2" />
          Armor Class
        </h3>
        <div className="flex items-center justify-between">
          <ProficiencyIndicator
            rank={data.armorClass?.proficiencyRank as ProficiencyRank || 'untrained'}
          />
          <span className="text-4xl font-bold text-blue-800">
            {data.armorClass?.total || 10}
          </span>
        </div>
        {data.armorClass?.capDex !== null && data.armorClass?.capDex !== undefined && (
          <div className="text-xs text-blue-700 mt-2">
            DEX Cap: +{data.armorClass.capDex}
          </div>
        )}
      </div>

      {/* Class DC */}
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-4">
        <h3 className="text-sm font-bold text-purple-800 mb-2 flex items-center">
          <Target className="w-4 h-4 mr-2" />
          Class DC
        </h3>
        <div className="flex items-center justify-between">
          <ProficiencyIndicator
            rank={data.classDC?.proficiencyRank as ProficiencyRank || 'untrained'}
          />
          <span className="text-4xl font-bold text-purple-800">
            {data.classDC?.total || 10}
          </span>
        </div>
        {data.classDC?.keyAttribute && (
          <div className="text-xs text-purple-700 mt-2 capitalize">
            Key: {data.classDC.keyAttribute}
          </div>
        )}
      </div>

      {/* Initiative */}
      <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 rounded-lg p-4">
        <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center">
          <Zap className="w-4 h-4 mr-2" />
          Initiative
        </h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-amber-700 capitalize">
            {data.initiative?.usedStat || 'perception'}
          </span>
          <span className="text-4xl font-bold text-amber-800">
            {formatModifier(data.initiative?.bonus || 0)}
          </span>
        </div>
      </div>

      {/* Speed */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-lg p-4">
        <h3 className="text-sm font-bold text-green-800 mb-2">Speed</h3>
        <div className="text-3xl font-bold text-green-800">
          {data.speed?.land || 30} ft.
        </div>
        {data.speed?.other && data.speed.other.length > 0 && (
          <div className="text-xs text-green-700 mt-2">
            {data.speed.other.join(', ')}
          </div>
        )}
      </div>
    </div>
  );

  // Render HP and conditions
  const renderHitPoints = () => (
    <div className="bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 rounded-lg p-4">
      <h3 className="text-lg font-bold text-red-800 mb-3 flex items-center">
        <Heart className="w-5 h-5 mr-2" />
        Hit Points
      </h3>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <div className="text-xs font-semibold text-red-700 mb-1">Maximum</div>
          <div className="text-3xl font-bold text-red-800">{data.hp?.maximum || 0}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-red-700 mb-1">Current</div>
          <div className="text-3xl font-bold text-red-700">{data.hp?.current || 0}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-red-700 mb-1">Temporary</div>
          <div className="text-3xl font-bold text-blue-700">{data.hp?.temporary || 0}</div>
        </div>
      </div>

      {/* Resistances, Immunities, Weaknesses */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        {data.hp?.resistances && data.hp.resistances.length > 0 && (
          <div>
            <span className="font-semibold text-green-700">Resistances:</span>{' '}
            {data.hp.resistances.join(', ')}
          </div>
        )}
        {data.hp?.immunities && data.hp.immunities.length > 0 && (
          <div>
            <span className="font-semibold text-blue-700">Immunities:</span>{' '}
            {data.hp.immunities.join(', ')}
          </div>
        )}
        {data.hp?.weaknesses && data.hp.weaknesses.length > 0 && (
          <div>
            <span className="font-semibold text-red-700">Weaknesses:</span>{' '}
            {data.hp.weaknesses.join(', ')}
          </div>
        )}
      </div>

      {/* Death and Dying */}
      {(data.deathAndDying?.dying > 0 ||
        data.deathAndDying?.wounded > 0 ||
        data.deathAndDying?.doomed > 0) && (
        <div className="mt-3 pt-3 border-t border-red-300">
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              <Skull className="w-4 h-4 text-red-700" />
              <span className="font-semibold text-red-700">Dying:</span>
              <span className="text-red-800">{data.deathAndDying?.dying || 0}</span>
            </div>
            <div>
              <span className="font-semibold text-amber-700">Wounded:</span>
              <span className="text-amber-800"> {data.deathAndDying?.wounded || 0}</span>
            </div>
            <div>
              <span className="font-semibold text-purple-700">Doomed:</span>
              <span className="text-purple-800"> {data.deathAndDying?.doomed || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render skills with proficiency ranks
  const renderSkills = () => {
    const skills = data.skills || {};
    const loreSkills = data.loreSkills || [];

    return (
      <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-bold text-stone-800 mb-3">Skills</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(skills).map(([skillName, skillData]: [string, any]) => {
            const displayName = skillName
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (str) => str.toUpperCase())
              .trim();
            const expr = skillData.bonus >= 0 ? `1d20+${skillData.bonus}` : `1d20${skillData.bonus}`;
            const purpose = `${displayName} Check`;

            return (
              <div
                key={skillName}
                className={`bg-white border border-stone-200 rounded p-2 flex items-center justify-between group ${onRoll ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 select-none' : ''}`}
                onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
                onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
                title={onRoll ? `Left-click: roll  |  Right-click: Fortune / Misfortune` : undefined}
              >
                <div className="flex items-center space-x-2">
                  <ProficiencyIndicator rank={skillData.proficiencyRank as ProficiencyRank} size="sm" />
                  <span className="text-sm font-medium text-stone-800">{displayName}</span>
                  <span className="text-xs text-stone-500">
                    ({skillData.attribute?.slice(0, 3).toUpperCase()})
                  </span>
                  {onRoll && <Dices className="w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
                </div>
                <span className="text-lg font-bold text-blue-700">
                  {formatModifier(skillData.bonus)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Lore Skills */}
        {loreSkills.length > 0 && (
          <div className="mt-4">
            <h4 className="text-md font-semibold text-stone-700 mb-2">Lore Skills</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {loreSkills.map((lore: any, index: number) => {
                const expr = lore.bonus >= 0 ? `1d20+${lore.bonus}` : `1d20${lore.bonus}`;
                const purpose = `${lore.name} Lore Check`;
                return (
                  <div
                    key={index}
                    className={`bg-amber-50 border border-amber-200 rounded p-2 flex items-center justify-between group ${onRoll ? 'cursor-pointer hover:bg-blue-50 hover:border-blue-300 select-none' : ''}`}
                    onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
                    onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
                    title={onRoll ? `Left-click: roll  |  Right-click: Fortune / Misfortune` : undefined}
                  >
                    <div className="flex items-center space-x-2">
                      <ProficiencyIndicator rank={lore.proficiencyRank as ProficiencyRank} size="sm" />
                      <span className="text-sm font-medium text-stone-800">{lore.name}</span>
                      {onRoll && <Dices className="w-3 h-3 text-blue-600 opacity-0 group-hover:opacity-60 transition-opacity" />}
                    </div>
                    <span className="text-lg font-bold text-blue-700">
                      {formatModifier(lore.bonus)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render strikes/attacks
  const renderStrikes = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-3">Strikes & Attacks</h3>
      <StrikesList
        strikes={data.strikes || []}
        onRoll={onRoll ? (expr, purpose) => handleRoll(expr, purpose) : undefined}
        onRollContext={onRoll ? (e, expr, purpose) => showRollPopup(e, expr, purpose) : undefined}
      />
    </div>
  );

  // Render inventory and bulk
  const renderInventory = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center">
        <Package className="w-5 h-5 mr-2" />
        Inventory & Equipment
      </h3>

      {/* Currency */}
      <div className="bg-white border border-stone-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Coins className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-stone-800">Currency</span>
          </div>
          <div className="flex items-center space-x-4 text-sm">
            <span><strong>{data.currency?.pp || 0}</strong> pp</span>
            <span><strong>{data.currency?.gp || 0}</strong> gp</span>
            <span><strong>{data.currency?.sp || 0}</strong> sp</span>
            <span><strong>{data.currency?.cp || 0}</strong> cp</span>
          </div>
        </div>
      </div>

      <BulkTracker
        inventory={data.inventory || []}
        bulk={data.bulk || { current: 0, encumbered: 5, maximum: 10 }}
      />
    </div>
  );

  // Render feats organized by category
  const renderFeats = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center">
        <BookOpen className="w-5 h-5 mr-2" />
        Feats
      </h3>
      <FeatsList feats={data.feats || {}} />
    </div>
  );

  // Render class features
  const renderClassFeatures = () => {
    if (!data.classFeatures || data.classFeatures.length === 0) return null;

    return (
      <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-bold text-stone-800 mb-3">Class Features</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {data.classFeatures.map((feature: string, index: number) => (
            <div
              key={index}
              className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-sm font-medium text-blue-800"
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render spellcasting (if present)
  const renderSpellcasting = () => {
    if (!data.spellcasting) return null;

    const spellcasting = data.spellcasting;

    return (
      <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-lg p-4">
        <h3 className="text-lg font-bold text-purple-800 mb-4 flex items-center">
          <Sparkles className="w-5 h-5 mr-2" />
          Spellcasting
        </h3>

        {/* Spellcasting Info */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-white border border-purple-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-purple-600 mb-1">Tradition</div>
            <div className="font-bold text-purple-800 capitalize">{spellcasting.tradition}</div>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-purple-600 mb-1">Type</div>
            <div className="font-bold text-purple-800 capitalize">{spellcasting.type}</div>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-3">
            <div className="text-xs font-semibold text-purple-600 mb-1">Key Attribute</div>
            <div className="font-bold text-purple-800 capitalize">{spellcasting.keyAttribute}</div>
          </div>
        </div>

        {/* Spell Attack & DC */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-purple-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ProficiencyIndicator
                rank={spellcasting.spellAttackBonus?.proficiencyRank as ProficiencyRank || 'untrained'}
                size="sm"
              />
              <span className="text-sm font-semibold text-purple-800">Spell Attack</span>
            </div>
            <span className="text-2xl font-bold text-purple-700">
              {formatModifier(spellcasting.spellAttackBonus?.bonus || 0)}
            </span>
          </div>
          <div className="bg-white border border-purple-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ProficiencyIndicator
                rank={spellcasting.spellDC?.proficiencyRank as ProficiencyRank || 'untrained'}
                size="sm"
              />
              <span className="text-sm font-semibold text-purple-800">Spell DC</span>
            </div>
            <span className="text-2xl font-bold text-purple-700">
              {spellcasting.spellDC?.dc || 10}
            </span>
          </div>
        </div>

        {/* Cantrips */}
        {spellcasting.cantrips && spellcasting.cantrips.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-purple-800 mb-2">
              Cantrips ({formatSpellRank(spellcasting.cantrips[0]?.rank || 0)})
            </h4>
            <div className="flex flex-wrap gap-2">
              {spellcasting.cantrips.map((cantrip: any, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm font-medium"
                >
                  {cantrip.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Spell Slots */}
        <div className="mb-4">
          <h4 className="font-semibold text-purple-800 mb-2">Spell Slots</h4>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => {
              const slot = spellcasting.slots?.[rank.toString()] || { total: 0, expended: 0 };
              if (slot.total === 0) return null;

              const remaining = slot.total - slot.expended;

              return (
                <div key={rank} className="bg-white border border-purple-200 rounded-lg p-2">
                  <div className="text-xs font-semibold text-purple-600 text-center mb-1">
                    {formatSpellRank(rank)}
                  </div>
                  <div className="text-center">
                    <span className={`text-lg font-bold ${remaining > 0 ? 'text-purple-700' : 'text-stone-400'}`}>
                      {remaining}
                    </span>
                    <span className="text-xs text-stone-500"> / {slot.total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spells by Rank */}
        {spellcasting.spells && spellcasting.spells.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-purple-800 mb-2">Spells</h4>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => {
              const rankSpells = spellcasting.spells.filter((s: any) => s.rank === rank);
              if (rankSpells.length === 0) return null;

              return (
                <div key={rank} className="mb-3">
                  <div className="text-sm font-semibold text-purple-700 mb-1">
                    {formatSpellRank(rank)}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {rankSpells.map((spell: any, index: number) => (
                      <div
                        key={index}
                        className={`px-2 py-1 rounded text-sm ${
                          spell.prepared
                            ? 'bg-purple-200 text-purple-800 font-medium'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {spell.name}
                        {spell.heightened && <span className="ml-1 text-xs">(H)</span>}
                        {spell.ritual && <span className="ml-1 text-xs">(R)</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Focus Spells */}
        {spellcasting.focusSpells &&
          spellcasting.focusSpells.spells &&
          spellcasting.focusSpells.spells.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-purple-800">Focus Spells</h4>
              <span className="text-sm font-medium text-purple-700">
                {spellcasting.focusSpells.focusPoints?.current || 0} /{' '}
                {spellcasting.focusSpells.focusPoints?.total || 0} Focus Points
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {spellcasting.focusSpells.spells.map((spell: any, index: number) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full text-sm font-medium"
                >
                  {spell.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Innate Spells */}
        {spellcasting.innateSpells && spellcasting.innateSpells.length > 0 && (
          <div>
            <h4 className="font-semibold text-purple-800 mb-2">Innate Spells</h4>
            <div className="space-y-2">
              {spellcasting.innateSpells.map((spell: any, index: number) => (
                <div key={index} className="bg-white border border-purple-200 rounded p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-purple-800">{spell.name}</span>
                    <span className="text-xs text-purple-600">{spell.frequency}</span>
                  </div>
                  {spell.notes && (
                    <div className="text-xs text-stone-600 mt-1">{spell.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render character background/bio
  const renderBio = () => (
    <div className="bg-stone-50 border-2 border-stone-200 rounded-lg p-4">
      <h3 className="text-lg font-bold text-stone-800 mb-4">Character Background</h3>

      {/* Personality */}
      {data.personality && (
        <div className="space-y-3 mb-4">
          {data.personality.traits && (
            <div>
              <h4 className="text-sm font-semibold text-stone-700 mb-1">Personality Traits</h4>
              <p className="text-sm text-stone-600">{data.personality.traits}</p>
            </div>
          )}
          {data.personality.ideals && (
            <div>
              <h4 className="text-sm font-semibold text-stone-700 mb-1">Ideals</h4>
              <p className="text-sm text-stone-600">{data.personality.ideals}</p>
            </div>
          )}
          {data.personality.bonds && (
            <div>
              <h4 className="text-sm font-semibold text-stone-700 mb-1">Bonds</h4>
              <p className="text-sm text-stone-600">{data.personality.bonds}</p>
            </div>
          )}
          {data.personality.flaws && (
            <div>
              <h4 className="text-sm font-semibold text-stone-700 mb-1">Flaws</h4>
              <p className="text-sm text-stone-600">{data.personality.flaws}</p>
            </div>
          )}
        </div>
      )}

      {/* Backstory */}
      {data.backstory && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-stone-700 mb-1">Backstory</h4>
          <p className="text-sm text-stone-600">{data.backstory}</p>
        </div>
      )}

      {/* Appearance */}
      {data.appearance && (
        <div className="bg-white border border-stone-200 rounded-lg p-3 mb-4">
          <h4 className="text-sm font-semibold text-stone-700 mb-2">Appearance</h4>
          <div className="grid grid-cols-3 gap-2 text-xs text-stone-600">
            {data.appearance.age && <div><strong>Age:</strong> {data.appearance.age}</div>}
            {data.appearance.height && <div><strong>Height:</strong> {data.appearance.height}</div>}
            {data.appearance.weight && <div><strong>Weight:</strong> {data.appearance.weight}</div>}
            {data.appearance.eyes && <div><strong>Eyes:</strong> {data.appearance.eyes}</div>}
            {data.appearance.skin && <div><strong>Skin:</strong> {data.appearance.skin}</div>}
            {data.appearance.hair && <div><strong>Hair:</strong> {data.appearance.hair}</div>}
          </div>
        </div>
      )}

      {/* Languages */}
      {data.languages && data.languages.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-stone-700 mb-1">Languages</h4>
          <div className="flex flex-wrap gap-1">
            {data.languages.map((lang: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Allies & Organizations */}
      {data.alliesAndOrganizations && data.alliesAndOrganizations.name && (
        <div className="bg-white border border-stone-200 rounded-lg p-3 mb-4">
          <h4 className="text-sm font-semibold text-stone-700 mb-1">
            {data.alliesAndOrganizations.name}
          </h4>
          <p className="text-sm text-stone-600">{data.alliesAndOrganizations.description}</p>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-amber-800 mb-1">Notes</h4>
          <p className="text-sm text-stone-700">{data.notes}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white border-2 border-stone-200 rounded-lg overflow-hidden shadow-lg">
      {renderHeader()}

      <div className="p-6 space-y-6">
        {renderAttributes()}
        {renderSavingThrows()}
        {renderPerception()}
        {renderCombatStats()}
        {renderHitPoints()}
        {renderSkills()}
        {renderStrikes()}
        {renderClassFeatures()}
        {renderFeats()}
        {renderSpellcasting()}
        {renderInventory()}
        {renderBio()}
      </div>

      {/* Fortune / Misfortune popup (shown on right-click of any rollable stat) */}
      {rollPopup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-white border border-stone-200 rounded-lg shadow-xl overflow-hidden"
          style={{ left: rollPopup.anchorX, top: rollPopup.anchorY, minWidth: 180 }}
        >
          <div className="px-3 py-2 bg-blue-700 text-white text-xs font-semibold truncate">
            {rollPopup.purpose}
          </div>
          {[
            { label: 'Normal', expr: rollPopup.expression, suffix: '' },
            { label: 'Fortune', expr: withAdvantage(rollPopup.expression), suffix: ' (Fortune)' },
            { label: 'Misfortune', expr: withDisadvantage(rollPopup.expression), suffix: ' (Misfortune)' },
          ].map(({ label, expr, suffix }) => (
            <button
              key={label}
              onClick={() => handleRoll(expr, rollPopup.purpose + suffix)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-blue-50 transition-colors text-left"
            >
              <Dices className="w-3.5 h-3.5 text-blue-700 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Pathfinder2eCharacterView;
