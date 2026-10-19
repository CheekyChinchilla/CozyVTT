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
} from 'lucide-react';
import { Character } from '../../../types';
import type {
  CoC7eCharacterData,
  CoC7eCharacteristics,
} from '../../../types/game-systems';
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { orderedCharacteristics } from './characteristics';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { cocDodgeBase, cocDerivedAttributes, cocHalfAndFifth } from '@/utils/rules/callOfCthulhu7e';
import { WeaponsList } from './components/WeaponsList';
import { BackstorySection } from './components/BackstorySection';
import { isHexColor } from '@/utils/styleAllowlists';
import { COLOR_PRESETS } from './colorPresets';

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

/**
 * CallOfCthulhu7eCharacterView - Read-only Call of Cthulhu 7e character sheet
 */
export const CallOfCthulhu7eCharacterView: React.FC<CallOfCthulhu7eCharacterViewProps> = ({
  character,
  onEdit,
  onRoll,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const data = character.data as CoC7eCharacterData;
  // Worked out from the characteristics, as the editor saves them.
  const derived = cocDerivedAttributes(data);
  const cthulhuMythos = Math.max(data.skills?.cthulhuMythos?.currentValue ?? 0, data.spellsAndMythos?.cthulhuMythos ?? 0);
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');

  // Load saved color preference from character metadata
  useEffect(() => {
    if (data.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === data.themeColor);
      if (savedColor) {
        setThemeColor(savedColor);
        setIsCustomColor(false);
      } else if (isHexColor(data.themeColor)) {
        // Custom hex color
        setCustomColorHex(data.themeColor);
        setIsCustomColor(true);
      }
    }
  }, [data.themeColor]);

  // Render character header with vintage styling
  const renderHeader = () => {
    // Determine the current background style
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    // TODO(ui): the header text is always parchment, so a pale custom colour
    // such as white makes the investigator's name unreadable. Choose the text
    // colour from the background, with readableTextOn in utils/color.ts.
    const headerClasses = isCustomColor
      ? 'text-parchment p-6 rounded-t-lg relative border-b-4 border-amber-600'
      : `bg-linear-to-r/srgb ${themeColor.from} via-${themeColor.accent} ${themeColor.to} text-parchment p-6 rounded-t-lg relative border-b-4 border-${themeColor.border}`;

    return (
      <div className={headerClasses} style={headerStyle}>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-4 right-4 px-4 py-2 bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg"
            title="Edit investigator"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
        )}

      <div className="flex items-start justify-between pr-24">
        <div className="flex items-start space-x-4">
          {/* Token Image */}
          <div className="shrink-0">
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
              {orderedCharacteristics(data.characteristics as unknown as Record<string, unknown>).map((key) => (
                <CharacteristicBlock
                  key={key}
                  label={key}
                  regular={data.characteristics[key as keyof CoC7eCharacteristics].regular}
                  half={cocHalfAndFifth(data.characteristics[key as keyof CoC7eCharacteristics].regular).half}
                  fifth={cocHalfAndFifth(data.characteristics[key as keyof CoC7eCharacteristics].regular).fifth}
                  onRoll={onRoll}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Sanity Tracker */}
      {data.derivedStats?.sanity && (
        <SanityTracker
          current={data.derivedStats.sanity.current}
          starting={data.derivedStats.sanity.starting}
          maximum={derived.maxSanity}
          cthulhuMythos={cthulhuMythos}
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
                <span className="text-lg text-red-500"> / {derived.hitPoints}</span>
              </div>
              <div className="text-xs text-red-600 text-center mt-1">
                Major Wound: {derived.majorWoundThreshold} HP
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
                <span className="text-lg text-purple-500"> / {derived.magicPoints}</span>
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
              {data.derivedStats.luck.notes && (
                <p className="text-xs text-yellow-800 mt-2 whitespace-pre-wrap">{data.derivedStats.luck.notes}</p>
              )}
            </div>
          )}

          {/* Dodge: the skill's value, which is what is rolled. Half DEX is
              only its base, and the derived copy can hold an older number. */}
          {(data.skills?.dodge || data.derivedStats?.dodge) && (
            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-900 uppercase">Dodge</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-blue-700">
                  {data.skills?.dodge?.currentValue ?? data.derivedStats?.dodge?.value}%
                </span>
              </div>
              <div className="text-xs text-blue-600 text-center mt-1">
                Base {cocDodgeBase(data.characteristics?.DEX?.regular || 0)} (half DEX)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Movement, Build, Damage Bonus */}
      <div className="grid grid-cols-3 gap-4">
        {data.derivedStats?.moveRate !== undefined && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Move Rate</div>
            <div className="text-2xl font-bold text-sepia-900">{derived.moveRate}</div>
          </div>
        )}
        {data.derivedStats?.build !== undefined && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Build</div>
            <div className="text-2xl font-bold text-sepia-900">{derived.build}</div>
          </div>
        )}
        {data.derivedStats?.damageBonus && (
          <div className="bg-parchment border border-sepia-400 rounded-md p-3 text-center">
            <div className="text-xs text-sepia-600 uppercase mb-1">Damage Bonus</div>
            <div className="text-2xl font-bold text-sepia-900">{derived.damageBonus}</div>
          </div>
        )}
      </div>

      {/* Conditions */}
      {data.conditions && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-900 mb-3 uppercase">Current Conditions</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.entries(data.conditions ?? {}) as [string, boolean][]).map(([key, value]) => (
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
      {data.combat?.weapons && (
        <WeaponsList
          weapons={data.combat.weapons}
          onRoll={onRoll}
          damageBonus={derived.damageBonus}
          skills={data.skills}
        />
      )}
    </div>
  );

  // Render Possessions tab
  const renderPossessionsTab = () => (
    <div className="space-y-6">
      {/* Wealth */}
      {data.wealth && (
        <div className="bg-linear-to-br/srgb from-amber-100 to-yellow-50 border-2 border-amber-400 rounded-lg p-5">
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
            <div className="bg-white/50 rounded-sm p-3 mt-3">
              <div className="text-xs text-amber-700 font-semibold mb-1">Assets</div>
              <p className="text-sm text-amber-900">{data.wealth.assets}</p>
            </div>
          )}
          {data.wealth.notes && (
            <div className="bg-white/50 rounded-sm p-3 mt-3">
              <div className="text-xs text-amber-700 font-semibold mb-1">Notes</div>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{data.wealth.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Possessions */}
      {data.possessions && data.possessions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-sepia-900 mb-4">Possessions</h3>
          <div className="space-y-2">
            {data.possessions!.map((item, index) => (
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
            {data.contacts!.map((contact, index) => (
              <div key={index} className="bg-blue-50 border border-blue-300 rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-blue-900">{contact.name || 'Unnamed contact'}</div>
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

      {/* Spells & Mythos.
          The Cthulhu Mythos rating and the spells an investigator knows are on
          the official sheet and are among the most consequential things it
          records — the rating caps maximum Sanity. Neither had anywhere to be
          shown or set in the app until now. */}
      {/* The skill is the Cthulhu Mythos that counts; the box copy is older. */}
      {(cthulhuMythos > 0 || (data.spellsAndMythos?.spells?.length ?? 0) > 0) && (
        <div className="mt-6 bg-purple-50 border-2 border-purple-300 rounded-lg p-4">
          <h3 className="text-lg font-bold text-purple-900 mb-3">Spells &amp; Mythos</h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xs text-purple-700 uppercase">Cthulhu Mythos</span>
            <span className="text-xl font-bold text-purple-900">
              {cthulhuMythos}%
            </span>
          </div>
          {data.spellsAndMythos?.spells && data.spellsAndMythos.spells.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.spellsAndMythos.spells.map((spell, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-purple-200 text-purple-900 rounded-full text-sm font-medium"
                >
                  {spell}
                </span>
              ))}
            </div>
          )}
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
