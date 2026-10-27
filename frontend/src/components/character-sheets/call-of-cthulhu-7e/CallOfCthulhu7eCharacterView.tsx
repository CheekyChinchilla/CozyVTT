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
import { headerInk } from '@/utils/themeColor';
import { SheetTabs, type SheetTab } from '../SheetTabs';

interface CallOfCthulhu7eCharacterViewProps {
  character: Character;
  onEdit?: () => void;
  /** Called when the user clicks a rollable stat. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
}

type TabId = 'overview' | 'skills' | 'combat' | 'possessions' | 'backstory';

const TABS: SheetTab<TabId>[] = [
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

    // Light text on a dark header and dark on a light one, as the D&D 5e and
    // Pathfinder 2e sheets choose it.
    const ink = headerInk(isCustomColor ? customColorHex : themeColor.hex);
    const headerClasses = isCustomColor
      ? `${ink.text} p-6 rounded-t-lg relative border-b-4 ${ink.border}`
      : `bg-linear-to-r/srgb ${themeColor.from} ${themeColor.via} ${themeColor.to} ${ink.text} p-6 rounded-t-lg relative border-b-4 ${themeColor.border}`;

    return (
      <div className={headerClasses} style={headerStyle}>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className={`absolute top-4 right-4 px-4 py-2 ${ink.button} rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg`}
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
                className={`w-24 h-24 rounded-full border-4 ${ink.border} object-cover shadow-xl`}
              />
            ) : (
              <div className={`w-24 h-24 rounded-full border-4 ${ink.border} bg-black/70 flex items-center justify-center shadow-xl`}>
                <User className="w-12 h-12 text-white/40" />
              </div>
            )}
          </div>

          {/* Character Info */}
          <div>
            <h2 className="text-3xl font-bold mb-2 drop-shadow-lg">
              {data.investigatorName || 'Unnamed Investigator'}
            </h2>
            <div className={`space-y-1 ${ink.softer}`}>
              <div className="flex items-center space-x-4">
                <span className="font-medium">{data.occupation || 'No Occupation'}</span>
                {data.era && <span>• {data.era}</span>}
              </div>
              {data.residence && (
                <div className="text-sm">
                  <span className={ink.soft}>Residence:</span> {data.residence}
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
            <div className={`text-xs ${ink.soft} uppercase tracking-wide`}>Player</div>
            <div className="text-lg font-semibold">{data.playerName}</div>
          </div>
        )}
      </div>
    </div>
    );
  };

  // Render Overview tab
  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Characteristics */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4 flex items-center space-x-2">
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
        <h3 className="text-lg font-bold text-ink mb-4">Derived Attributes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Hit Points */}
          {data.derivedStats?.hp && (
            <div className="bg-danger/10 border-2 border-danger/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Heart className="w-4 h-4 text-danger-ink" />
                  <span className="text-xs font-semibold text-danger-ink uppercase">Hit Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-danger-ink">
                  {data.derivedStats.hp.current}
                </span>
                <span className="text-lg text-ink-muted"> / {derived.hitPoints}</span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">
                Major Wound: {derived.majorWoundThreshold} HP
              </div>
            </div>
          )}

          {/* Magic Points */}
          {data.derivedStats?.magicPoints && (
            <div className="bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Skull className="w-4 h-4 text-spirit-ink" />
                  <span className="text-xs font-semibold text-spirit-ink uppercase">Magic Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-spirit-ink">
                  {data.derivedStats.magicPoints.current}
                </span>
                <span className="text-lg text-ink-muted"> / {derived.magicPoints}</span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">POW / 5</div>
            </div>
          )}

          {/* Luck */}
          {data.derivedStats?.luck && (
            <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-warning-ink" />
                  <span className="text-xs font-semibold text-warning-ink uppercase">Luck</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-warning-ink">
                  {data.derivedStats.luck.score}
                </span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">
                Spend to adjust rolls (1:1)
              </div>
              {data.derivedStats.luck.notes && (
                <p className="text-xs text-ink-secondary mt-2 whitespace-pre-wrap">{data.derivedStats.luck.notes}</p>
              )}
            </div>
          )}

          {/* Dodge: the skill's value, which is what is rolled. Half DEX is
              only its base, and the derived copy can hold an older number. */}
          {(data.skills?.dodge || data.derivedStats?.dodge) && (
            <div className="bg-info/10 border-2 border-info/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-info-ink" />
                  <span className="text-xs font-semibold text-info-ink uppercase">Dodge</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-info-ink">
                  {data.skills?.dodge?.currentValue ?? data.derivedStats?.dodge?.value}%
                </span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">
                Base {cocDodgeBase(data.characteristics?.DEX?.regular || 0)} (half DEX)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Movement, Build, Damage Bonus */}
      <div className="grid grid-cols-3 gap-4">
        {data.derivedStats?.moveRate !== undefined && (
          <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
            <div className="text-xs text-ink-secondary uppercase mb-1">Move Rate</div>
            <div className="text-2xl font-bold text-ink">{derived.moveRate}</div>
          </div>
        )}
        {data.derivedStats?.build !== undefined && (
          <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
            <div className="text-xs text-ink-secondary uppercase mb-1">Build</div>
            <div className="text-2xl font-bold text-ink">{derived.build}</div>
          </div>
        )}
        {data.derivedStats?.damageBonus && (
          <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
            <div className="text-xs text-ink-secondary uppercase mb-1">Damage Bonus</div>
            <div className="text-2xl font-bold text-ink">{derived.damageBonus}</div>
          </div>
        )}
      </div>

      {/* Conditions */}
      {data.conditions && (
        <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-warning-ink mb-3 uppercase">Current Conditions</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.entries(data.conditions ?? {}) as [string, boolean][]).map(([key, value]) => (
              <div
                key={key}
                className={`flex items-center space-x-2 px-3 py-2 rounded ${
                  value ? 'bg-danger/15 text-danger-ink font-semibold' : 'bg-paper text-warning-ink'
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
      {data.skills && <SkillsList skills={data.skills} tickColour={isCustomColor ? customColorHex : themeColor.hex} onRoll={onRoll} />}
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
        <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-5">
          <h3 className="text-lg font-bold text-warning-ink mb-4 flex items-center space-x-2">
            <Package className="w-5 h-5" />
            <span>Wealth & Assets</span>
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Spending Level</div>
              <div className="text-xl font-bold text-warning-ink">{data.wealth.spendingLevel}</div>
            </div>
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Cash on Hand</div>
              <div className="text-xl font-bold text-warning-ink">${data.wealth.cash}</div>
            </div>
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Credit Rating</div>
              <div className="text-xl font-bold text-warning-ink">
                {data.skills?.creditRating?.currentValue || 0}%
              </div>
            </div>
          </div>
          {data.wealth.assets && (
            <div className="bg-paper rounded-sm p-3 mt-3">
              <div className="text-xs text-ink-secondary font-semibold mb-1">Assets</div>
              <p className="text-sm text-ink">{data.wealth.assets}</p>
            </div>
          )}
          {data.wealth.notes && (
            <div className="bg-paper rounded-sm p-3 mt-3">
              <div className="text-xs text-ink-secondary font-semibold mb-1">Notes</div>
              <p className="text-sm text-ink whitespace-pre-wrap">{data.wealth.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Possessions */}
      {data.possessions && data.possessions.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-ink mb-4">Possessions</h3>
          <div className="space-y-2">
            {data.possessions!.map((item, index) => (
              <div key={index} className="bg-paper border border-ink/20 rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-ink">{item.name}</div>
                </div>
                {item.notes && <p className="text-sm text-ink-secondary mt-1">{item.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contacts */}
      {data.contacts && data.contacts.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-ink mb-4">Contacts</h3>
          <div className="space-y-2">
            {data.contacts!.map((contact, index) => (
              <div key={index} className="bg-info/10 border border-info/30 rounded-md p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-info-ink">{contact.name || 'Unnamed contact'}</div>
                    <div className="text-sm text-ink-secondary">{contact.role}</div>
                  </div>
                </div>
                {contact.notes && <p className="text-sm text-ink-secondary mt-2">{contact.notes}</p>}
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
        <div className="mt-6 bg-ink/5 border border-ink/20 rounded-lg p-4">
          <h3 className="text-lg font-bold text-ink mb-3">Appearance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {data.appearance.age && (
              <div>
                <span className="text-ink-secondary">Age:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.age}</span>
              </div>
            )}
            {data.appearance.height && (
              <div>
                <span className="text-ink-secondary">Height:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.height}</span>
              </div>
            )}
            {data.appearance.weight && (
              <div>
                <span className="text-ink-secondary">Weight:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.weight}</span>
              </div>
            )}
            {data.appearance.eyes && (
              <div>
                <span className="text-ink-secondary">Eyes:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.eyes}</span>
              </div>
            )}
            {data.appearance.hair && (
              <div>
                <span className="text-ink-secondary">Hair:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.hair}</span>
              </div>
            )}
            {data.appearance.skin && (
              <div>
                <span className="text-ink-secondary">Skin:</span>{' '}
                <span className="text-ink font-medium">{data.appearance.skin}</span>
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
        <div className="mt-6 bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4">
          <h3 className="text-lg font-bold text-spirit-ink mb-3">Spells &amp; Mythos</h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xs text-ink-secondary uppercase">Cthulhu Mythos</span>
            <span className="text-xl font-bold text-spirit-ink">
              {cthulhuMythos}%
            </span>
          </div>
          {data.spellsAndMythos?.spells && data.spellsAndMythos.spells.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.spellsAndMythos.spells.map((spell, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-spirit/15 text-spirit-ink border border-spirit/30 rounded-full text-sm font-medium"
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
        <div className="mt-6 bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
          <h3 className="text-lg font-bold text-warning-ink mb-2">Keeper's Notes</h3>
          <p className="text-sm text-ink whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}
    </div>
  );

  // Main render
  return (
    <div className="bg-paper rounded-lg shadow-lg overflow-hidden">
      {renderHeader()}
      <SheetTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} underline={isCustomColor ? customColorHex : themeColor.hex} />
      <div className="p-6 bg-paper">
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
