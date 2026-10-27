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
import { hitDieExpression, hitDiceMaximum, spendRoll, canSpendHitDie } from '@/utils/hitDice';
import { Character } from '../../../types';
import type {
  DnD5eCharacterData,
  DnD5eSavingThrow,
} from '../../../types/game-systems';
import { StatBlock } from './components/StatBlock';
import { SkillsList } from './components/SkillsList';
import { AttacksList } from './components/AttacksList';
import { InventoryList } from './components/InventoryList';
import { SpellcastingBlock } from './components/SpellcastingBlock';
import { withAdvantage, withDisadvantage } from '../../../utils/characterRolls';
import {
  passiveScore,
  hasSpellcasting,
  exhaustionLevel,
  exhaustionEffects,
  readCustomSkills,
  dnd5eCustomSkillBonus,
  dnd5eSkillBonus,
  dnd5eSaveBonus,
} from '../../../utils/rules/dnd5e';
import { dnd5eInitiativeModifier } from '../../../utils/rules/initiative';
import { collectSheetFeatures } from '../../../utils/featureEntries';
import { readProficiencyGroups } from '../../../utils/proficiencies';
import { isHexColor } from '@/utils/styleAllowlists';
import { COLOR_PRESETS } from './colorPresets';
import { headerInk } from '@/utils/themeColor';
import { SheetTabs, type SheetTab } from '../SheetTabs';

interface DnD5eCharacterViewProps {
  character: Character;
  onEdit?: () => void;
  /** Called when the user clicks a rollable stat. Omit outside campaign context. */
  /** Roll at the table; resolves whether the roll was made, when the host can tell. */
  onRoll?: (expression: string, purpose: string) => void | Promise<boolean>;
  /**
   * Called when a hit die is spent, with the position of the pool. Omit and
   * the dice still roll but nothing is decremented.
   */
  onSpendHitDie?: (index: number) => void;
}

interface RollPopupState {
  anchorX: number;
  anchorY: number;
  expression: string;
  purpose: string;
}

type TabId = 'stats' | 'combat' | 'spells' | 'inventory' | 'features' | 'bio';

const TABS: SheetTab<TabId>[] = [
  { id: 'stats', label: 'Stats & Skills', icon: Target },
  { id: 'combat', label: 'Combat', icon: Swords },
  { id: 'spells', label: 'Spells', icon: Sparkles },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'features', label: 'Features', icon: BookOpen },
  { id: 'bio', label: 'Biography', icon: User },
];

/**
 * DnD5eCharacterView - Read-only D&D 5e character sheet
 */
export const DnD5eCharacterView: React.FC<DnD5eCharacterViewProps> = ({ character, onEdit, onRoll, onSpendHitDie }) => {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const data = character.data as DnD5eCharacterData;
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
    const made = onRoll?.(expression, purpose);
    setRollPopup(null);
    return made;
  };

  // A hit die is spent once its roll is made: a roll refused (too many rolls,
  // no connection) used to take the die anyway.
  const spendHitDie = (expression: string, purpose: string, index: number) => {
    void Promise.resolve(handleRoll(expression, purpose)).then((made) => {
      if (made !== false) onSpendHitDie?.(index);
    });
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
      } else if (isHexColor(data.themeColor)) {
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

    // Light text on a dark header and dark on a light one, chosen as the
    // editor chooses it.
    const ink = headerInk(isCustomColor ? customColorHex : themeColor.hex);
    const headerClasses = isCustomColor
      ? `${ink.text} p-3 sm:p-6 rounded-t-lg relative`
      : `bg-linear-to-r/srgb ${themeColor.from} ${themeColor.to} ${ink.text} p-3 sm:p-6 rounded-t-lg relative`;

    return (
      <div data-sheet-header className={headerClasses} style={headerStyle}>
        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className={`ml-auto mb-3 w-fit sm:absolute sm:top-4 sm:right-4 sm:mb-0 px-4 py-2 ${ink.button} rounded-lg transition-colors flex items-center space-x-2 font-medium`}
            title="Edit character"
          >
            <Edit className="w-4 h-4" />
            <span>Edit</span>
          </button>
        )}

      {/* Below sm, Edit is in the flow above this row and the experience
          goes under the name; from sm up the row clears the corner Edit sits in. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-0 sm:pr-24">
        <div className="flex items-start space-x-4 min-w-0">
          {/* Token Image */}
          <div className="shrink-0">
            {character.tokenImageUrl ? (
              <img
                src={character.tokenImageUrl}
                alt={data.characterName || 'Character'}
                className={`w-20 h-20 rounded-full border-4 ${ink.border} object-cover`}
              />
            ) : (
              <div className={`w-20 h-20 rounded-full border-4 ${ink.border} bg-black/70 flex items-center justify-center`}>
                <User className="w-10 h-10 text-white/40" />
              </div>
            )}
          </div>

          {/* Character Info */}
          <div className="min-w-0">
            <h2 className="text-3xl font-bold mb-1">{data.characterName || 'Unnamed Character'}</h2>
            <div className={`flex flex-wrap items-center gap-x-4 ${ink.soft}`}>
              <span>
                Level {data.level} {data.race} {data.class}
              </span>
              {data.alignment && <span>• {data.alignment}</span>}
              {data.background && <span>• {data.background}</span>}
            </div>
            {data.playerName && <div className="mt-1 text-sm opacity-80">Player: {data.playerName}</div>}
          </div>
        </div>

        {data.experiencePoints !== undefined && (
          <div className="sm:text-right">
            <div className={`text-xs ${ink.soft}`}>Experience</div>
            <div className="text-xl font-bold">{data.experiencePoints.toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
    );
  };

  // Render Stats & Skills tab
  const renderStatsTab = () => (
    <div className="space-y-6">
      {/* Ability Scores */}
      <div>
        <h3 className="text-lg font-semibold text-ink mb-3">Ability Scores</h3>
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
          <h3 className="text-lg font-semibold text-ink mb-3">Saving Throws</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-ink/5 border border-ink/10 rounded-lg p-4">
            {(Object.entries(data.savingThrows ?? {}) as [string, DnD5eSavingThrow][]).map(([key, save]) => {
              // Worked out from the scores plus the other bonus, as the dice
              // roll it, so a stored total that has gone stale is not shown.
              const bonus = dnd5eSaveBonus(data, key);
              const expr = bonus >= 0 ? `1d20+${bonus}` : `1d20${bonus}`;
              const purpose = `${key.charAt(0).toUpperCase() + key.slice(1)} Save`;
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between py-1 px-2 rounded-sm group ${onRoll ? 'cursor-pointer hover:bg-accent/10 select-none' : ''}`}
                  onClick={onRoll ? () => handleRoll(expr, purpose) : undefined}
                  onContextMenu={onRoll ? (e) => showRollPopup(e, expr, purpose) : undefined}
                  title={onRoll ? `Left-click: roll  |  Right-click: Advantage / Disadvantage` : undefined}
                >
                  <div className="flex items-center gap-1">
                    {onRoll && <Dices className="w-3 h-3 text-accent-ink opacity-0 group-hover:opacity-60 transition-opacity" />}
                    <span className="text-sm capitalize">{key}</span>
                  </div>
                  <span className={`text-sm font-semibold ${save.proficient ? 'text-accent-ink' : 'text-ink-secondary'}`}>
                    {formatModifier(bonus)}
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
          <h3 className="text-lg font-semibold text-ink mb-3">Skills</h3>
          <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
            <SkillsList
              // Each total worked out as the dice roll it: from the scores,
              // plus the skill's other bonus.
              skills={Object.fromEntries(
                Object.entries(data.skills).map(([key, skill]) => [key, { ...skill, bonus: dnd5eSkillBonus(data, key) }])
              ) as typeof data.skills}
              // Derived from the Perception bonus shown right above it rather
              // than read from the stored `passivePerception` field. Nothing
              // ever recalculated that field, so it kept whatever it was first
              // given: a character with expertise in Perception showed +5 on
              // the skill and a passive score that had counted proficiency only
              // once. Deriving it here means the two cannot disagree, and
              // characters saved before this release read correctly without
              // needing to be re-saved.
              passivePerception={passiveScore(
                dnd5eSkillBonus(data, 'perception') + (data.passivePerceptionBonus ?? 0)
              )}
              // Derived here for the same reason: the bonus follows the
              // character's ability scores and level rather than being stored
              // and going stale.
              customSkills={readCustomSkills(data).map((custom) => ({
                name: custom.name,
                proficient: custom.proficient === true,
                expertise: custom.expertise === true,
                bonus: dnd5eCustomSkillBonus(data, custom),
              }))}
              onRoll={onRoll ? (expr, purpose) => handleRoll(expr, purpose) : undefined}
              onRollContext={onRoll ? (e, expr, purpose) => showRollPopup(e, expr, purpose) : undefined}
            />
          </div>
        </div>
      )}

      {/* Proficiency Bonus & Inspiration */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-accent/10 border-2 border-accent/30 rounded-lg p-4 text-center">
          <div className="text-sm text-ink-secondary mb-1">Proficiency Bonus</div>
          <div className="text-2xl font-bold text-accent-ink">
            {formatModifier(data.proficiencyBonus)}
          </div>
        </div>
        {data.inspiration !== undefined && (
          <div className="bg-warning/10 border-2 border-warning/30 rounded-lg p-4 text-center">
            <div className="text-sm text-ink-secondary mb-1">Inspiration</div>
            <div className="text-2xl font-bold text-warning-ink">
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
          <div className="bg-ink/5 border-2 border-ink/20 rounded-lg p-4 text-center">
            <Shield className="w-6 h-6 mx-auto mb-2 text-ink-secondary" />
            <div className="text-xs text-ink-muted mb-1">Armor Class</div>
            <div className="text-2xl font-bold text-ink">{data.armorClass}</div>
          </div>
        )}
        {data.stats?.dexterity !== undefined && (
          <div className="bg-ink/5 border-2 border-ink/20 rounded-lg p-4 text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-warning-ink" />
            <div className="text-xs text-ink-muted mb-1">Initiative</div>
            {/* Derived from Dexterity and the sheet's other-bonus field rather
                than read from the stored total, so this matches the editor and
                matches what is actually rolled. */}
            <div className="text-2xl font-bold text-ink">
              {formatModifier(dnd5eInitiativeModifier(data))}
            </div>
          </div>
        )}
        {data.speed !== undefined && (
          <div className="bg-ink/5 border-2 border-ink/20 rounded-lg p-4 text-center">
            <Footprints className="w-6 h-6 mx-auto mb-2 text-info-ink" />
            <div className="text-xs text-ink-muted mb-1">Speed</div>
            <div className="text-2xl font-bold text-ink">{data.speed} ft</div>
          </div>
        )}
        {data.hp && (
          <div className="bg-danger/10 border-2 border-danger/30 rounded-lg p-4 text-center">
            <Heart className="w-6 h-6 mx-auto mb-2 text-danger-ink" />
            <div className="text-xs text-ink-muted mb-1">Hit Points</div>
            <div className="text-2xl font-bold text-danger-ink">
              {data.hp.current}/{data.hp.maximum}
            </div>
            {data.hp.temporary > 0 && (
              <div className="text-xs text-info-ink mt-1">+{data.hp.temporary} temp</div>
            )}
          </div>
        )}
      </div>

      {/* Hit Dice */}
      {data.hitDice && data.hitDice.length > 0 && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Hit Dice</h3>
          <div className="flex flex-wrap gap-3">
            {data.hitDice!.map((hd, idx) => {
              // `total` is the pool ("5d10"), so spending rolls one die plus
              // Constitution — never the stored string, which would roll all
              // five. A pool with nothing left, or a total that is not a die,
              // stays as plain text rather than offering a roll it cannot make.
              const die = hitDieExpression(hd);
              const max = hitDiceMaximum(hd);
              const spendable = !!onRoll && canSpendHitDie(hd);
              const expr = die === null ? '' : spendRoll(die, data.stats?.constitution?.modifier ?? 0);
              const purpose = `Spend a Hit Die${hd.class ? ` (${hd.class})` : ''}`;
              return (
                <div
                  key={idx}
                  className={`px-4 py-2 bg-paper border border-ink/20 rounded-lg group ${
                    spendable ? 'cursor-pointer hover:bg-accent/10 select-none' : ''
                  }`}
                  onClick={spendable ? () => spendHitDie(expr, purpose, idx) : undefined}
                  title={spendable ? `Spend one hit die: roll ${expr}` : undefined}
                >
                  <div className="text-xs text-ink-muted capitalize">{hd.class}</div>
                  <div className="font-semibold text-ink flex items-center gap-1">
                    {hd.remaining}{max === null ? '' : `/${max}`}
                    {die && <span className="ml-1 font-normal text-ink-muted">{die}</span>}
                    {spendable && <Dices className="w-3 h-3 text-accent-ink opacity-0 group-hover:opacity-60 transition-opacity" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Death Saves */}
      {data.deathSaves && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Death Saves</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-success-ink font-medium mb-2">Successes</div>
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 ${
                      i <= data.deathSaves!.successes
                        ? 'bg-success border-success'
                        : 'bg-paper border-ink/20'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-danger-ink font-medium mb-2">Failures</div>
              <div className="flex space-x-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`w-8 h-8 rounded-full border-2 ${
                      i <= data.deathSaves!.failures
                        ? 'bg-danger border-danger'
                        : 'bg-paper border-ink/20'
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
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Conditions</h3>
          <div className="flex flex-wrap gap-2">
            {data.conditions.map((condition: string, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1 bg-warning/15 text-warning-ink border border-warning/30 rounded-full capitalize"
              >
                {condition}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exhaustion. Six cumulative levels (Basic Rules, Appendix A), so the
          effects of every level below the current one apply too. */}
      {exhaustionLevel(data.exhaustionLevel) > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-2">
            <h3 className="text-lg font-semibold text-ink">Exhaustion</h3>
            <span className="px-2 py-0.5 bg-danger/15 text-danger-ink border border-danger/30 text-sm font-bold rounded-full">
              Level {exhaustionLevel(data.exhaustionLevel)}
            </span>
          </div>
          <ul className="space-y-0.5">
            {exhaustionEffects(data.exhaustionLevel).map((effect, idx) => (
              <li key={idx} className="flex items-start space-x-2 text-ink-secondary">
                <span className="text-danger-ink">•</span>
                <span>
                  <span className="text-ink-muted mr-1">{idx + 1}.</span>
                  {effect}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Attacks */}
      {data.attacks && (
        <div>
          <h3 className="text-lg font-semibold text-ink mb-3">Attacks & Weapons</h3>
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
      {/* `data.spellcasting` is an object on every sheet, including a barbarian's,
          so testing it for truth showed a spellcasting panel to everybody — and
          because the templates seeded class "Wizard", a Fighter's sheet read
          "Wizard Spellcasting". What decides is whether the character actually
          casts: an ability named, or any cantrip, slot or spell recorded. */}
      {hasSpellcasting(data) ? (
        <SpellcastingBlock spellcasting={data.spellcasting!} character={data} />
      ) : (
        <div className="text-center py-12 text-ink-muted">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-ink-muted" />
          <p>This character is not a spellcaster</p>
        </div>
      )}
    </div>
  );

  // Render Inventory tab
  const renderInventoryTab = () => (
    <div>
      <InventoryList inventory={data.inventory} currency={data.currency} strengthScore={data.stats?.strength?.score} />
    </div>
  );

  // Render Features tab
  const renderFeaturesTab = () => {
    // Read through the shared reader, which returns each box as the player
    // typed it. The categories used to be re-derived here from a hardcoded list
    // of language names, so anything it did not recognise — Thieves' Cant,
    // Druidic, anything homebrew — was shown under Weapons.
    const proficiencies = readProficiencyGroups(data);
    const hasProficiencies = Object.values(proficiencies).some((group) => group.trim().length > 0);
    const features = collectSheetFeatures(data);

    return (
      <div className="space-y-6">
        {/* Proficiencies & Training - Organized like D&D character sheet */}
        {hasProficiencies && (
          <div className="bg-ink/5 border-2 border-ink/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-ink mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-accent-ink" />
              Proficiencies & Training
            </h3>

            <div className="space-y-4">
              {/* Armor */}
              {proficiencies.armor.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wide">
                    Armor
                  </div>
                  <div className="text-ink">
                    {proficiencies.armor}
                  </div>
                </div>
              )}

              {/* Weapons */}
              {proficiencies.weapons.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wide">
                    Weapons
                  </div>
                  <div className="text-ink">
                    {proficiencies.weapons}
                  </div>
                </div>
              )}

              {/* Tools */}
              {proficiencies.tools.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wide">
                    Tools
                  </div>
                  <div className="text-ink">
                    {proficiencies.tools}
                  </div>
                </div>
              )}

              {/* Languages */}
              {proficiencies.languages.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-ink-secondary mb-2 uppercase tracking-wide">
                    Languages
                  </div>
                  <div className="text-ink">
                    {proficiencies.languages}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Features & Traits.
          Read through the shared reader so a sheet still holding plain strings,
          or the separate field the built-in templates used to write, displays
          the same as a migrated one. Most entries are a bare name — a
          description only appears when there is one. */}
      {features.length > 0 && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Features &amp; Traits</h3>
          <ul className="space-y-2">
            {features.map((feature, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-accent-ink mt-1">•</span>
                <div className="text-ink-secondary">
                  <span className={feature.description ? 'font-semibold' : undefined}>
                    {feature.name}
                  </span>
                  {feature.description && (
                    <p className="text-sm text-ink-secondary whitespace-pre-wrap mt-0.5">
                      {feature.description}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional Features */}
      {data.additionalFeaturesAndTraits && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Additional Features</h3>
          <p className="text-ink-secondary whitespace-pre-wrap">{data.additionalFeaturesAndTraits}</p>
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
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Appearance</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-ink-muted">Age</div>
              <div className="text-ink">{data.appearance.age}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Height</div>
              <div className="text-ink">{data.appearance.height}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Weight</div>
              <div className="text-ink">{data.appearance.weight}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Eyes</div>
              <div className="text-ink">{data.appearance.eyes}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Skin</div>
              <div className="text-ink">{data.appearance.skin}</div>
            </div>
            <div>
              <div className="text-xs text-ink-muted">Hair</div>
              <div className="text-ink">{data.appearance.hair}</div>
            </div>
          </div>
        </div>
      )}

      {/* Personality */}
      {data.personality && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Personality</h3>
          <div className="space-y-3">
            {data.personality.traits && (
              <div>
                <div className="text-sm font-medium text-ink-secondary mb-1">Traits</div>
                <p className="text-ink-secondary">{data.personality.traits}</p>
              </div>
            )}
            {data.personality.ideals && (
              <div>
                <div className="text-sm font-medium text-ink-secondary mb-1">Ideals</div>
                <p className="text-ink-secondary">{data.personality.ideals}</p>
              </div>
            )}
            {data.personality.bonds && (
              <div>
                <div className="text-sm font-medium text-ink-secondary mb-1">Bonds</div>
                <p className="text-ink-secondary">{data.personality.bonds}</p>
              </div>
            )}
            {data.personality.flaws && (
              <div>
                <div className="text-sm font-medium text-ink-secondary mb-1">Flaws</div>
                <p className="text-ink-secondary">{data.personality.flaws}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backstory */}
      {data.backstory && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Backstory</h3>
          <p className="text-ink-secondary whitespace-pre-wrap">{data.backstory}</p>
        </div>
      )}

      {/* Allies & Organizations */}
      {data.alliesAndOrganizations && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Allies & Organizations</h3>
          <div className="space-y-2">
            <div className="font-medium text-ink">{data.alliesAndOrganizations.name}</div>
            <p className="text-ink-secondary">{data.alliesAndOrganizations.description}</p>
          </div>
        </div>
      )}

      {/* Treasure */}
      {data.treasure && (
        <div className="bg-ink/5 border border-ink/10 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-ink mb-3">Treasure</h3>
          <p className="text-ink-secondary whitespace-pre-wrap">{data.treasure}</p>
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
    <div className="bg-paper rounded-lg shadow-lg overflow-hidden">
      {renderHeader()}
      <SheetTabs tabs={TABS} active={activeTab} onSelect={setActiveTab} underline={isCustomColor ? customColorHex : themeColor.hex} />
      <div data-sheet-body className="p-3 sm:p-6">{renderTabContent()}</div>

      {/* Advantage / Disadvantage popup (shown on right-click of any rollable stat) */}
      {rollPopup && (
        <div
          ref={popupRef}
          className="fixed z-50 bg-paper border border-ink/10 rounded-lg shadow-xl overflow-hidden"
          style={{ left: rollPopup.anchorX, top: rollPopup.anchorY, minWidth: 180 }}
        >
          <div className="px-3 py-2 bg-accent text-accent-text text-xs font-semibold truncate">
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
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-secondary hover:bg-accent/10 transition-colors text-left"
            >
              <Dices className="w-3.5 h-3.5 text-accent-ink shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
