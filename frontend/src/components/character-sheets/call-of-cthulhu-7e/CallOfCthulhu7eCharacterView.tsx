/**
 * CallOfCthulhu7eCharacterView Component
 *
 * Complete read-only view of a CoC 7e investigator with characteristics, skills, sanity, and backstory.
 * Organized in tabs for easy navigation. Uses vintage 1920s aesthetic.
 */

import React, { useState, useEffect } from 'react';
import {
  User,
  Target,
  Swords,
  Package,
  BookText,
  Edit,
  Heart,
  Eye,
  Skull,
  Palette,
} from 'lucide-react';
import { Character } from '../../../types';
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { WeaponsList } from './components/WeaponsList';
import { BackstorySection } from './components/BackstorySection';

interface CallOfCthulhu7eCharacterViewProps {
  character: Character;
  onEdit?: () => void;
  /** Called when the user clicks a rollable stat. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

type TabId = 'overview' | 'skills' | 'combat' | 'possessions' | 'backstory';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const TABS: Tab[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'skills', label: 'Skills', icon: Target },
  { id: 'combat', label: 'Combat', icon: Swords },
  { id: 'possessions', label: 'Possessions', icon: Package },
  { id: 'backstory', label: 'Backstory', icon: BookText },
];

// Call of Cthulhu color presets - Vintage 1920s aesthetic
const COLOR_PRESETS = [
  { name: 'Dark Forest', from: 'from-green-900', to: 'to-green-800', accent: 'green-800', border: 'amber-600', hex: '#14532d' },
  { name: 'Noir Shadow', from: 'from-slate-900', to: 'to-slate-800', accent: 'slate-800', border: 'amber-500', hex: '#0f172a' },
  { name: 'Deep Sepia', from: 'from-sepia-900', to: 'to-sepia-800', accent: 'sepia-800', border: 'sepia-400', hex: '#2E2419' },
  { name: 'Midnight Blue', from: 'from-blue-950', to: 'to-blue-900', accent: 'blue-900', border: 'amber-600', hex: '#172554' },
  { name: 'Burgundy Wine', from: 'from-red-950', to: 'to-red-900', accent: 'red-900', border: 'amber-500', hex: '#450a0a' },
  { name: 'Victorian Purple', from: 'from-purple-950', to: 'to-purple-900', accent: 'purple-900', border: 'amber-600', hex: '#3b0764' },
  { name: 'Emerald Mist', from: 'from-emerald-900', to: 'to-emerald-800', accent: 'emerald-800', border: 'amber-600', hex: '#064e3b' },
  { name: 'Charcoal Gray', from: 'from-gray-900', to: 'to-gray-800', accent: 'gray-800', border: 'amber-500', hex: '#111827' },
  { name: 'Teal Shadow', from: 'from-teal-950', to: 'to-teal-900', accent: 'teal-900', border: 'amber-600', hex: '#042f2e' },
  { name: 'Amber Dusk', from: 'from-amber-900', to: 'to-amber-800', accent: 'amber-800', border: 'amber-400', hex: '#78350f' },
];

/**
 * CallOfCthulhu7eCharacterView - Read-only Call of Cthulhu 7e character sheet
 */
export const CallOfCthulhu7eCharacterView: React.FC<CallOfCthulhu7eCharacterViewProps> = ({
  character,
  onEdit,
  onRoll,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const data = character.data as any; // Type will be CallOfCthulhu7eCharacterData
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

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

  // Handle custom color change
  const handleCustomColorChange = (hex: string) => {
    setCustomColorHex(hex);
    setIsCustomColor(true);
  };

  // Handle preset color selection
  const handlePresetColorSelect = (color: typeof COLOR_PRESETS[0]) => {
    setThemeColor(color);
    setIsCustomColor(false);
    setShowColorPicker(false);
  };

  // Render character header with vintage styling
  const renderHeader = () => {
    // Determine the current background style
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    const headerClasses = isCustomColor
      ? 'text-parchment p-6 rounded-t-lg relative border-b-4 border-amber-600'
      : `bg-gradient-to-r ${themeColor.from} via-${themeColor.accent} ${themeColor.to} text-parchment p-6 rounded-t-lg relative border-b-4 border-${themeColor.border}`;

    return (
      <div className={headerClasses} style={headerStyle}>
        {/* Color Picker Button */}
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          title="Change theme color"
        >
          <Palette className="w-5 h-5" />
        </button>

        {/* Color Picker Dropdown */}
        {showColorPicker && (
          <div className="absolute top-16 right-4 bg-white text-stone-800 rounded-lg shadow-xl p-4 z-10 border-2 border-stone-200 max-w-md">
            <h4 className="font-semibold mb-3">Theme Color</h4>

            {/* Preset Colors */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handlePresetColorSelect(color)}
                  className={`px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                    !isCustomColor && themeColor.name === color.name
                      ? 'ring-2 ring-stone-400 bg-stone-100'
                      : 'hover:bg-stone-50'
                  }`}
                >
                  <div className={`w-full h-6 rounded mb-1 bg-gradient-to-r ${color.from} ${color.to}`} />
                  <div className="text-xs">{color.name}</div>
                </button>
              ))}
            </div>

            {/* Custom Color Section */}
            <div className="border-t pt-4 space-y-3">
              <h5 className="text-sm font-semibold text-stone-700">Custom Color</h5>

              <div className="flex items-center space-x-2">
                {/* Native Color Picker */}
                <input
                  type="color"
                  value={customColorHex || '#14532d'}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="w-12 h-12 rounded cursor-pointer border-2 border-stone-300"
                  title="Pick a custom color"
                />

                {/* Hex Code Input */}
                <div className="flex-1">
                  <input
                    type="text"
                    value={customColorHex}
                    onChange={(e) => {
                      const hex = e.target.value;
                      // Validate hex format
                      if (hex === '' || /^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
                        handleCustomColorChange(hex);
                      }
                    }}
                    placeholder="#14532d"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-stone-500 mt-1">Enter hex code (e.g., #14532d)</div>
                </div>
              </div>

              {/* Custom Color Preview */}
              {isCustomColor && customColorHex && /^#[0-9A-Fa-f]{6}$/.test(customColorHex) && (
                <div className="flex items-center space-x-2 p-2 bg-stone-50 rounded">
                  <div
                    className="w-8 h-8 rounded"
                    style={{ background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }}
                  />
                  <span className="text-sm font-medium">Custom: {customColorHex}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-4 right-16 px-4 py-2 bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg"
            title="Edit investigator"
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
                alt={data.investigatorName || 'Investigator'}
                className="w-24 h-24 rounded-full border-4 border-amber-600/50 object-cover shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-amber-600/50 bg-sepia-900 flex items-center justify-center shadow-xl">
                <User className="w-12 h-12 text-amber-400/40" />
              </div>
            )}
          </div>

          {/* Character Info */}
          <div>
            <h2 className="text-3xl font-bold mb-2 text-parchment drop-shadow-lg">
              {data.investigatorName || 'Unnamed Investigator'}
            </h2>
            <div className="space-y-1 text-parchment-light">
              <div className="flex items-center space-x-4">
                <span className="font-medium">{data.occupation || 'No Occupation'}</span>
                {data.era && <span>• {data.era}</span>}
              </div>
              {data.residence && (
                <div className="text-sm">
                  <span className="text-amber-300">Residence:</span> {data.residence}
                </div>
              )}
              <div className="flex items-center space-x-4 text-sm">
                {data.age && <span>Age {data.age}</span>}
                {data.sex && <span>• {data.sex}</span>}
                {data.birthplace && <span>• Born in {data.birthplace}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Player Name */}
        {data.playerName && (
          <div className="text-right">
            <div className="text-xs text-amber-300 uppercase tracking-wide">Player</div>
            <div className="text-lg font-semibold text-parchment">{data.playerName}</div>
          </div>
        )}
      </div>
    </div>
    );
  };

  // Render tabs
  const renderTabs = () => (
    <div className="flex space-x-1 border-b-2 border-sepia-400 bg-parchment-light/50 px-4">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center space-x-2 px-4 py-3 font-medium transition-colors
              ${
                isActive
                  ? 'text-green-800 border-b-2 border-green-800 -mb-0.5 bg-parchment'
                  : 'text-sepia-600 hover:text-sepia-900 hover:bg-parchment-light/70'
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

  // Render Overview tab
  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Characteristics */}
      <div>
        <h3 className="text-lg font-bold text-sepia-900 mb-4 flex items-center space-x-2">
          <Target className="w-5 h-5" />
          <span>Characteristics</span>
        </h3>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {data.characteristics && (
            <>
              <CharacteristicBlock
                label="STR"
                regular={data.characteristics.STR.regular}
                half={data.characteristics.STR.half}
                fifth={data.characteristics.STR.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="CON"
                regular={data.characteristics.CON.regular}
                half={data.characteristics.CON.half}
                fifth={data.characteristics.CON.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="SIZ"
                regular={data.characteristics.SIZ.regular}
                half={data.characteristics.SIZ.half}
                fifth={data.characteristics.SIZ.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="DEX"
                regular={data.characteristics.DEX.regular}
                half={data.characteristics.DEX.half}
                fifth={data.characteristics.DEX.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="APP"
                regular={data.characteristics.APP.regular}
                half={data.characteristics.APP.half}
                fifth={data.characteristics.APP.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="INT"
                regular={data.characteristics.INT.regular}
                half={data.characteristics.INT.half}
                fifth={data.characteristics.INT.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="POW"
                regular={data.characteristics.POW.regular}
                half={data.characteristics.POW.half}
                fifth={data.characteristics.POW.fifth}
                onRoll={onRoll}
              />
              <CharacteristicBlock
                label="EDU"
                regular={data.characteristics.EDU.regular}
                half={data.characteristics.EDU.half}
                fifth={data.characteristics.EDU.fifth}
                onRoll={onRoll}
              />
            </>
          )}
        </div>
      </div>

      {/* Sanity Tracker */}
      {data.derivedStats?.sanity && (
        <SanityTracker
          current={data.derivedStats.sanity.current}
          starting={data.derivedStats.sanity.starting}
          maximum={data.derivedStats.sanity.maximum}
          cthulhuMythos={data.skills?.cthulhuMythos?.currentValue || 0}
        />
      )}

      {/* Derived Stats Grid */}
      <div>
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Derived Attributes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Hit Points */}
          {data.derivedStats?.hp && (
            <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Heart className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-semibold text-red-900 uppercase">Hit Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-red-700">
                  {data.derivedStats.hp.current}
                </span>
                <span className="text-lg text-red-500"> / {data.derivedStats.hp.maximum}</span>
              </div>
              <div className="text-xs text-red-600 text-center mt-1">
                Major Wound: {data.derivedStats.hp.majorWoundThreshold} HP
              </div>
            </div>
          )}

          {/* Magic Points */}
          {data.derivedStats?.magicPoints && (
            <div className="bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Skull className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-900 uppercase">Magic Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-purple-700">
                  {data.derivedStats.magicPoints.current}
                </span>
                <span className="text-lg text-purple-500"> / {data.derivedStats.magicPoints.maximum}</span>
              </div>
              <div className="text-xs text-purple-600 text-center mt-1">POW / 5</div>
            </div>
          )}

          {/* Luck */}
          {data.derivedStats?.luck && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-semibold text-yellow-900 uppercase">Luck</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-yellow-700">
                  {data.derivedStats.luck.score}
                </span>
              </div>
              <div className="text-xs text-yellow-600 text-center mt-1">
                Spend to adjust rolls (1:1)
              </div>
            </div>
          )}

          {/* Dodge */}
          {data.derivedStats?.dodge && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-900 uppercase">Dodge</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-blue-700">
                  {data.derivedStats.dodge.value}%
                </span>
              </div>
              <div className="text-xs text-blue-600 text-center mt-1">DEX / 2</div>
            </div>
          )}
        </div>
      </div>

      {/* Movement, Build, Damage Bonus */}
      <div className="grid grid-cols-3 gap-4">
        {data.derivedStats?.moveRate !== undefined && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Move Rate</div>
            <div className="text-2xl font-bold text-sepia-900">{data.derivedStats.moveRate}</div>
          </div>
        )}
        {data.derivedStats?.build !== undefined && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Build</div>
            <div className="text-2xl font-bold text-sepia-900">{data.derivedStats.build}</div>
          </div>
        )}
        {data.derivedStats?.damageBonus && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Damage Bonus</div>
            <div className="text-2xl font-bold text-sepia-900">{data.derivedStats.damageBonus}</div>
          </div>
        )}
      </div>

      {/* Conditions */}
      {data.conditions && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-900 mb-3 uppercase">Current Conditions</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {Object.entries(data.conditions).map(([key, value]: [string, any]) => (
              <div
                key={key}
                className={`flex items-center space-x-2 px-3 py-2 rounded ${
                  value ? 'bg-red-100 text-red-700 font-semibold' : 'bg-white/50 text-amber-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={value}
                  readOnly
                  className="w-4 h-4"
                />
                <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render Skills tab
  const renderSkillsTab = () => (
    <div>
      {data.skills && <SkillsList skills={data.skills} themeColor={themeColor} onRoll={onRoll} />}
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div>
      {data.combat?.weapons && <WeaponsList weapons={data.combat.weapons} onRoll={onRoll} />}
    </div>
  );

  // Render Possessions tab
  const renderPossessionsTab = () => (
    <div className="space-y-6">
      {/* Wealth */}
      {data.wealth && (
        <div className="bg-gradient-to-br from-amber-100 to-yellow-50 border-2 border-amber-400 rounded-lg p-5">
          <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center space-x-2">
            <Package className="w-5 h-5" />
            <span>Wealth & Assets</span>
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-amber-700 uppercase mb-1">Spending Level</div>
              <div className="text-xl font-bold text-amber-900">{data.wealth.spendingLevel}</div>
            </div>
            <div>
              <div className="text-xs text-amber-700 uppercase mb-1">Cash on Hand</div>
              <div className="text-xl font-bold text-amber-900">${data.wealth.cash}</div>
            </div>
            <div>
              <div className="text-xs text-amber-700 uppercase mb-1">Credit Rating</div>
              <div className="text-xl font-bold text-amber-900">
                {data.skills?.creditRating?.currentValue || 0}%
              </div>
            </div>
          </div>
          {data.wealth.assets && (
            <div className="bg-white/50 rounded p-3 mt-3">
              <div className="text-xs text-amber-700 font-semibold mb-1">Assets</div>
              <p className="text-sm text-amber-900">{data.wealth.assets}</p>
            </div>
          )}
        </div>
      )}

      {/* Possessions */}
      {data.possessions && data.possessions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-sepia-900 mb-4">Possessions</h3>
          <div className="space-y-2">
            {data.possessions.map((item: any, index: number) => (
              <div key={index} className="bg-parchment border border-sepia-400 rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-sepia-900">{item.name}</div>
                </div>
                {item.notes && <p className="text-sm text-sepia-700 mt-1">{item.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts */}
      {data.contacts && data.contacts.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-sepia-900 mb-4">Contacts</h3>
          <div className="space-y-2">
            {data.contacts.map((contact: any, index: number) => (
              <div key={index} className="bg-blue-50 border border-blue-300 rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-blue-900">{contact.name}</div>
                    <div className="text-sm text-blue-700">{contact.role}</div>
                  </div>
                </div>
                {contact.notes && <p className="text-sm text-blue-800 mt-2">{contact.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render Backstory tab
  const renderBackstoryTab = () => (
    <div>
      {data.backstory && <BackstorySection backstory={data.backstory} />}

      {/* Appearance */}
      {data.appearance && (
        <div className="mt-6 bg-parchment-light/50 border border-sepia-400 rounded-lg p-4">
          <h3 className="text-lg font-bold text-sepia-900 mb-3">Appearance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {data.appearance.age && (
              <div>
                <span className="text-sepia-600">Age:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.age}</span>
              </div>
            )}
            {data.appearance.height && (
              <div>
                <span className="text-sepia-600">Height:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.height}</span>
              </div>
            )}
            {data.appearance.weight && (
              <div>
                <span className="text-sepia-600">Weight:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.weight}</span>
              </div>
            )}
            {data.appearance.eyes && (
              <div>
                <span className="text-sepia-600">Eyes:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.eyes}</span>
              </div>
            )}
            {data.appearance.hair && (
              <div>
                <span className="text-sepia-600">Hair:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.hair}</span>
              </div>
            )}
            {data.appearance.skin && (
              <div>
                <span className="text-sepia-600">Skin:</span>{' '}
                <span className="text-sepia-900 font-medium">{data.appearance.skin}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div className="mt-6 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <h3 className="text-lg font-bold text-yellow-900 mb-2">Keeper's Notes</h3>
          <p className="text-sm text-yellow-800 whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}
    </div>
  );

  // Main render
  return (
    <div className="glass-panel overflow-hidden">
      {renderHeader()}
      {renderTabs()}
      <div className="p-6 bg-parchment">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'possessions' && renderPossessionsTab()}
        {activeTab === 'backstory' && renderBackstoryTab()}
      </div>
    </div>
  );
};

export default CallOfCthulhu7eCharacterView;
