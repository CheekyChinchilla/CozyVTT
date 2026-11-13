// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * HorrorD100CharacterView Component
 *
 * Complete read-only view of a Horror d100 character, on the sheet rebuilt
 * on the open d100 rules: characteristics with their rolls, derived
 * attributes, Sanity, skills, weapons and armor, possessions and the
 * character's story. Organized in tabs for easy navigation.
 */

import React, { useState, useEffect, useId } from 'react';
import {
  User,
  Target,
  Swords,
  Package,
  BookText,
  Edit,
  Heart,
  Skull,
} from 'lucide-react';
import { Character } from '../../../types';
import type { HorrorD100Sheet, HorrorD100SheetCharacteristics } from '@/types/game-systems/horrorD100Sheet';
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { WeaponsList } from './components/WeaponsList';
import { ArmorList } from './components/ArmorList';
import { StoryNotes } from './components/StoryNotes';
import { OriginalValues } from './components/OriginalValues';
import {
  HORROR_D100_CHARACTERISTIC_ROLLS,
  horrorD100DamageModifier,
  horrorD100ExperienceBonus,
  horrorD100MajorWoundLevel,
} from '@/utils/rules/horrorD100';
import { HORROR_D100_CHARACTERISTIC_ORDER, horrorD100BlasphemousLore } from './sheetForm';
import { HORROR_D100_CONDITIONS } from '@/utils/conditions';
import { isHexColor } from '@/utils/styleAllowlists';
import { COLOR_PRESETS } from './colorPresets';
import { headerInk } from '@/utils/themeColor';
import { SheetTabs, sheetTabPanel, type SheetTab } from '../SheetTabs';

interface HorrorD100CharacterViewProps {
  character: Character;
  onEdit?: () => void;
  /** Called when the user clicks a rollable stat. Omit outside campaign context. */
  onRoll?: (expression: string, purpose: string) => void;
  /**
   * Whether to show the values the character held before its sheet was
   * rebuilt, where it carries them. The page passes true for the character's
   * owner and the campaign's GM, and nobody else is shown them.
   */
  showOriginalValues?: boolean;
}

type TabId = 'overview' | 'skills' | 'combat' | 'possessions' | 'story';

const TABS: SheetTab<TabId>[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'skills', label: 'Skills', icon: Target },
  { id: 'combat', label: 'Combat', icon: Swords },
  { id: 'possessions', label: 'Possessions', icon: Package },
  { id: 'story', label: 'Story', icon: BookText },
];

/** The appearance fields, in the order the sheet shows them. */
const APPEARANCE_FIELDS = [
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'hair', label: 'Hair' },
  { key: 'skin', label: 'Skin' },
] as const;

const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * HorrorD100CharacterView - Read-only Horror d100 character sheet
 */
export const HorrorD100CharacterView: React.FC<HorrorD100CharacterViewProps> = ({
  character,
  onEdit,
  onRoll,
  showOriginalValues = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const sheetTabsId = useId();
  // The sheet as it is stored, which is what the roster card, the token's
  // bar and the roll menu read too: a block the sheet lacks is not shown.
  // The editor adds the blocks a sheet lacks, and its save stores them.
  const data = character.data as HorrorD100Sheet;
  const characteristics: Partial<HorrorD100SheetCharacteristics> = data.characteristics ?? {};
  // Worked out from the characteristics wherever they are shown; the sheet
  // stores none of the three.
  const damageModifier = horrorD100DamageModifier(numberOr(characteristics.STR, 0), numberOr(characteristics.SIZ, 0));
  const experienceBonus = horrorD100ExperienceBonus(numberOr(characteristics.INT, 0));
  const blasphemousLore = horrorD100BlasphemousLore(data.skills);
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

    // Light text on a dark header and dark on a light one, as the 5E and
    // Fantasy d20 sheets choose it.
    const ink = headerInk(isCustomColor ? customColorHex : themeColor.hex);
    const headerClasses = isCustomColor
      ? `${ink.text} p-3 sm:p-6 rounded-t-lg relative border-b-4 ${ink.border}`
      : `bg-linear-to-r/srgb ${themeColor.from} ${themeColor.via} ${themeColor.to} ${ink.text} p-3 sm:p-6 rounded-t-lg relative border-b-4 ${themeColor.border}`;

    return (
      <div data-sheet-header className={headerClasses} style={headerStyle}>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className={`ml-auto mb-3 w-fit sm:absolute sm:top-4 sm:right-4 sm:mb-0 px-4 py-2 ${ink.button} rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg`}
            title="Edit character"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
        )}

      {/* Below sm, Edit is in the flow above this row and the player goes
          under the name; from sm up the row clears the corner Edit sits in. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0 sm:pr-24">
        <div className="flex items-start space-x-4 min-w-0">
          {/* Token Image */}
          <div className="shrink-0">
            {character.tokenImageUrl ? (
              <img
                src={character.tokenImageUrl}
                alt={data.characterName || 'Character'}
                className={`w-24 h-24 rounded-full border-4 ${ink.border} object-cover shadow-xl`}
              />
            ) : (
              <div className={`w-24 h-24 rounded-full border-4 ${ink.border} bg-black/70 flex items-center justify-center shadow-xl`}>
                <User className="w-12 h-12 text-white/40" />
              </div>
            )}
          </div>

          {/* Character Info */}
          <div className="min-w-0">
            <h2 className="text-3xl font-bold mb-2 drop-shadow-lg">
              {data.characterName || 'Unnamed Character'}
            </h2>
            <div className={`space-y-1 ${ink.softer}`}>
              <div className="flex flex-wrap items-center gap-x-4">
                <span className="font-medium">{data.profession || 'No Profession'}</span>
                {data.era && <span>• {data.era}</span>}
              </div>
              {data.residence && (
                <div className="text-sm">
                  <span className={ink.soft}>Residence:</span> {data.residence}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 text-sm">
                {data.age && <span>Age {data.age}</span>}
                {data.sex && <span>• {data.sex}</span>}
                {data.birthplace && <span>• Born in {data.birthplace}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Player Name */}
        {data.playerName && (
          <div className="sm:text-right">
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-4">
          {HORROR_D100_CHARACTERISTIC_ORDER.filter((key) => characteristics[key] !== undefined).map((key) => (
            <CharacteristicBlock
              key={key}
              label={key}
              value={characteristics[key]}
              roll={key === 'SIZ' ? undefined : HORROR_D100_CHARACTERISTIC_ROLLS[key]}
              onRoll={onRoll}
            />
          ))}
        </div>
      </div>

      {/* Sanity Tracker */}
      {data.sanity && (
        <SanityTracker
          current={data.sanity.current}
          starting={data.sanity.starting}
          maximum={data.sanity.maximum}
          blasphemousLore={blasphemousLore}
        />
      )}

      {/* Derived Stats Grid */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Derived Attributes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Hit Points */}
          {data.hitPoints && (
            <div className="bg-danger/10 border-2 border-danger/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Heart className="w-4 h-4 text-danger-ink" />
                  <span className="text-xs font-semibold text-danger-ink uppercase">Hit Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-danger-ink">
                  {data.hitPoints.current}
                </span>
                <span className="text-lg text-ink-muted"> / {data.hitPoints.maximum}</span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">
                Major Wound: {horrorD100MajorWoundLevel(numberOr(data.hitPoints.maximum, 0))} HP
              </div>
            </div>
          )}

          {/* Power Points */}
          {data.powerPoints && (
            <div className="bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Skull className="w-4 h-4 text-spirit-ink" />
                  <span className="text-xs font-semibold text-spirit-ink uppercase">Power Points</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-spirit-ink">
                  {data.powerPoints.current}
                </span>
                <span className="text-lg text-ink-muted"> / {data.powerPoints.maximum}</span>
              </div>
              <div className="text-xs text-ink-secondary text-center mt-1">Maximum equal to POW</div>
            </div>
          )}

          <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
            <div className="text-xs text-ink-secondary uppercase mb-1">Damage Modifier</div>
            <div className="text-2xl font-bold text-ink">{damageModifier}</div>
            <div className="text-xs text-ink-secondary mt-1">From STR + SIZ</div>
          </div>
          <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
            <div className="text-xs text-ink-secondary uppercase mb-1">Experience Bonus</div>
            <div className="text-2xl font-bold text-ink">+{experienceBonus}%</div>
            <div className="text-xs text-ink-secondary mt-1">Half INT, rounded up</div>
          </div>
          {data.move !== undefined && (
            <div className="bg-paper border border-ink/20 rounded-md p-3 text-center">
              <div className="text-xs text-ink-secondary uppercase mb-1">MOV</div>
              <div className="text-2xl font-bold text-ink">{data.move}</div>
            </div>
          )}
        </div>
      </div>

      {/* Conditions */}
      {data.conditions && (
        <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-warning-ink mb-3 uppercase">Current Conditions</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {HORROR_D100_CONDITIONS.map(({ key, label }) => {
              const value = data.conditions?.[key] === true;
              return (
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
                    aria-label={label}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // Render Skills tab
  const renderSkillsTab = () => (
    <div>
      {data.skills && (
        <SkillsList
          skills={data.skills}
          characteristics={characteristics}
          tickColour={isCustomColor ? customColorHex : themeColor.hex}
          onRoll={onRoll}
        />
      )}
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div className="space-y-6">
      <WeaponsList
        weapons={data.weapons ?? []}
        onRoll={onRoll}
        damageModifier={damageModifier}
        skills={data.skills}
      />
      <ArmorList armor={data.armor ?? []} />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Wealth Level</div>
              <div className="text-xl font-bold text-warning-ink">{data.wealth.level || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Cash on Hand</div>
              <div className="text-xl font-bold text-warning-ink">{data.wealth.cash === undefined ? '—' : `$${data.wealth.cash}`}</div>
            </div>
            <div>
              <div className="text-xs text-ink-secondary uppercase mb-1">Status</div>
              <div className="text-xl font-bold text-warning-ink">
                {data.skills?.status?.value ?? 0}%
              </div>
            </div>
          </div>
          {data.wealth.assets && (
            <div className="bg-paper rounded-sm p-3 mt-3">
              <div className="text-xs text-ink-secondary font-semibold mb-1">Assets</div>
              <p className="text-sm text-ink whitespace-pre-wrap">{data.wealth.assets}</p>
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
            {data.possessions.map((item, index) => (
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
            {data.contacts.map((contact, index) => (
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

  // Render Story tab
  const renderStoryTab = () => (
    <div className="space-y-6">
      <StoryNotes notes={data.story ?? []} />

      {/* Distinctive features */}
      {data.distinctiveFeatures && data.distinctiveFeatures.length > 0 && (
        <div className="bg-ink/5 border border-ink/20 rounded-lg p-4">
          <h3 className="text-lg font-bold text-ink mb-3">Distinctive Features</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-ink">
            {data.distinctiveFeatures.map((feature, index) => (
              <li key={index}>{feature}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Appearance */}
      {data.appearance && (
        <div className="bg-ink/5 border border-ink/20 rounded-lg p-4">
          <h3 className="text-lg font-bold text-ink mb-3">Appearance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {APPEARANCE_FIELDS.map(({ key, label }) =>
              data.appearance?.[key] ? (
                <div key={key}>
                  <span className="text-ink-secondary">{label}:</span>{' '}
                  <span className="text-ink font-medium">{data.appearance[key]}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Spells */}
      {data.spells && data.spells.length > 0 && (
        <div className="bg-spirit/10 border-2 border-spirit/30 rounded-lg p-4">
          <h3 className="text-lg font-bold text-spirit-ink mb-3">Spells</h3>
          <div className="flex flex-wrap gap-2">
            {data.spells.map((spell, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-spirit/15 text-spirit-ink border border-spirit/30 rounded-full text-sm font-medium"
              >
                {spell}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.notes && (
        <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4">
          <h3 className="text-lg font-bold text-warning-ink mb-2">GM's Notes</h3>
          <p className="text-sm text-ink whitespace-pre-wrap">{data.notes}</p>
        </div>
      )}

      {showOriginalValues && data.converted && <OriginalValues record={data.converted} />}
    </div>
  );

  // Main render
  return (
    <div className="bg-paper rounded-lg shadow-lg overflow-hidden">
      {renderHeader()}
      <SheetTabs id={sheetTabsId} tabs={TABS} active={activeTab} onSelect={setActiveTab} underline={isCustomColor ? customColorHex : themeColor.hex} />
      <div data-sheet-body {...sheetTabPanel(sheetTabsId, activeTab)} className="p-3 sm:p-6 bg-paper">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'possessions' && renderPossessionsTab()}
        {activeTab === 'story' && renderStoryTab()}
      </div>
    </div>
  );
};

export default HorrorD100CharacterView;
