import { hitDieExpression, hitDiceMaximum } from '@/utils/hitDice';
/**
 * DnD5eCharacterEditor Component
 *
 * Editable D&D 5e character sheet with auto-calculation, validation,
 * color customization, and token upload functionality.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Swords,
  Package,
  Sparkles,
  User,
  BookOpen,
  Target,
  Save,
  X,
  Upload,
  Palette,
} from 'lucide-react';
import { Character, AssetType } from '../../../types';
import type { CharacterData } from '../../../types';
import type {
  DnD5eCharacterData,
  DnD5eStats,
  DnD5eSavingThrows,
  DnD5eSkills,
  DnD5eSpellcasting,
  DnD5eSpellSlots,
} from '../../../types/game-systems';
import { apiErrorMessage } from '@/utils/errors';
import { DND5E_CONDITIONS } from '@/utils/conditions';
import { collectSheetFeatures, readFeatureEntriesForEditing } from '@/utils/featureEntries';
import { api } from '../../../services/api';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';
import NumberField from '../../ui/NumberField';
import ListLimitNote, { ADD_BUTTON_OFF, listChangeAllowed, listIsFull } from '../ListLimitNote';
import {
  passiveScore,
  dnd5eSpellSaveDC,
  dnd5eSpellAttackBonus,
  dnd5eBackfilledSpellSaveDCBonus,
  dnd5eBackfilledSpellAttackBonus,
  spellcastingAbilityModifier,
  exhaustionLevel,
  exhaustionEffects,
  dnd5eCustomSkillBonus,
  dnd5eSkillBonus,
  dnd5eBackfilledSkillOtherBonus,
  dnd5eBackfilledSaveOtherBonus,
  proficiencyBonusForLevel,
  DND5E_ABILITY_NAMES,
  MIN_BONUS_OVERRIDE,
  MAX_BONUS_OVERRIDE,
} from '@/utils/rules/dnd5e';
import {
  dnd5eInitiativeModifier,
  dnd5eBackfilledInitiativeBonus,
} from '@/utils/rules/initiative';
import { readProficiencyGroups, flattenProficiencyGroups } from '@/utils/proficiencies';
import {
  DND5E_WEAPON_PROPERTIES,
  MAX_WEAPON_PROPERTY_LENGTH,
  hasWeaponProperty,
  toggleWeaponProperty,
  customWeaponProperties,
  addCustomWeaponProperty,
} from '@/utils/weaponProperties';
import { toStoredHexColor, HEX_COLOUR_HINT, shouldUseWhiteText } from '@/utils/themeColor';
import {
  DND5E_ATTACK_DAMAGE_ROLLS_MAX,
  DND5E_CUSTOM_SKILLS_MAX,
  DND5E_WEAPON_PROPERTIES_MAX,
  SHEET_LIST_MAX,
  SHEET_NAME_MAX,
  SHEET_SHORT_TEXT_MAX,
  SPELL_SLOTS_MAX,
} from '@/constants/sheetLimits';
import { assetNameFrom } from '@/utils/assetName';
import { COLOR_PRESETS } from './colorPresets';

/**
 * The sheet as this editor holds it.
 *
 * `proficiencies` used to be redeclared here, because the game system's own
 * type did not describe it; it was saved only because the route then stored
 * the body as sent. The route stores the schema's parsed sheet now, and the
 * field is declared on both sides, so this adds nothing but the editor's own
 * chrome.
 */
type DnD5eFormData = DnD5eCharacterData;

interface DnD5eCharacterEditorProps {
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Called once a save has gone through and nothing was typed while it was in
   * flight, so the editor holds nothing unsaved and its host can close it.
   * With something typed meanwhile, the editor stays open with it instead.
   */
  onDone?: () => void;
  character: Character;
  onSave: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
}

type TabId = 'stats' | 'combat' | 'spells' | 'inventory' | 'features' | 'bio';

/**
 * The tab a refused box is on, so Save can open it. The header's boxes are on
 * every tab.
 */
function tabOfError(key: string): TabId | null {
  if (key.startsWith('stats.')) return 'stats';
  if (key === 'armorClass' || /^(hp|attacks|hitDice)\./.test(key)) return 'combat';
  if (key.startsWith('spellcasting.')) return 'spells';
  if (key.startsWith('inventory.')) return 'inventory';
  return null;
}

/**
 * Errors the list above the sheet leaves out: a failed save and a refused
 * picture are not about a box, and the colour's is shown in the colour picker,
 * which Save opens.
 */
const NOT_IN_SUMMARY = new Set(['submit', 'tokenImage', 'themeColor']);

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

/**
 * Calculate ability modifier from ability score
 */
const calculateModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

/**
 * Format modifier for display (+3, -1, etc.)
 */
const formatModifier = (mod: number): string => {
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

/**
 * Settle a sheet's features into one editable list, once, on load.
 *
 * Two fields can hold them: `featuresAndTraits`, which the sheet has always
 * displayed, and `features`, which the built-in templates wrote and nothing
 * read. Both are folded in here and the orphan dropped, so that from this point
 * on the form has exactly one list.
 *
 * Doing it on load rather than on every render matters twice over. The reader
 * discards entries with no name — correct for storage, wrong for an editor,
 * where a row you have just added and not yet typed into is nameless, so a
 * derived list threw away every new row the moment it appeared. And re-reading
 * `features` each render would resurrect a template feature the second after it
 * was deleted.
 */
function withoutOrphanFeatures(sheet: DnD5eFormData): DnD5eFormData {
  const settled = { ...sheet, featuresAndTraits: collectSheetFeatures(sheet) };
  delete (settled as Record<string, unknown>).features;
  return settled;
}

/**
 * Skills or saving throws with the other bonus a sheet saved before it existed
 * implies, so their totals do not change when the editor works them out.
 *
 * Run once, on the sheet as it was stored. Doing it in an effect would read a
 * total the editor had just worked out from a changed score as one typed by
 * hand, and record the change as a bonus.
 */
function withRecordedOtherBonuses<T extends object>(entries: T, backfill: (key: string) => number | null): T {
  const next = { ...entries } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    const entry = next[key];
    const other = backfill(key);
    if (other !== null && entry && typeof entry === 'object') next[key] = { ...entry, otherBonus: other };
  }
  return next as T;
}

/**
 * All nine spell slot levels, from whatever the sheet stored, each within
 * what the server stores: a total of at most SPELL_SLOTS_MAX, and no more used
 * than the total.
 *
 * The schema requires every level once `slots` is present, so a sheet stored
 * with none, or a block the editor makes up for a sheet with no spellcasting,
 * would have its first slot edit, or its first save, refused. A sheet stored
 * before the limits would have every save refused.
 */
function withAllSlotLevels(stored: unknown): DnD5eSpellSlots {
  const source = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const count = (value: unknown, most: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(most, Math.max(0, Math.trunc(value))) : 0;
  const levels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((level) => {
    const slot = (typeof source[level] === 'object' && source[level] !== null ? source[level] : {}) as Record<string, unknown>;
    const total = count(slot.total, SPELL_SLOTS_MAX);
    return [level, { total, expended: count(slot.expended, total) }] as const;
  });
  return Object.fromEntries(levels) as unknown as DnD5eSpellSlots;
}

/**
 * A manual bonus within the range the server stores (initiative, passive
 * Perception, the spellcasting adjustments). An older sheet's stored total is
 * read back into these as a bonus, and could be any number.
 */
function withinBonusRange(value: number): number {
  return Math.min(MAX_BONUS_OVERRIDE, Math.max(MIN_BONUS_OVERRIDE, value));
}

/** The same, for a bonus that may be absent; absent stays absent. */
function bonusWithinRange<T>(value: T): T | number {
  return typeof value === 'number' && Number.isFinite(value) ? withinBonusRange(value) : value;
}

/**
 * The numbers a stored sheet holds outside what a sheet stores, each as
 * "what (stored to shown)": the form brings them within range so the sheet can
 * be saved, and the next save stores them so. Worked out once, from the sheet
 * as it was stored, including a bonus an older sheet's total implies.
 */
function numbersBroughtWithinRange(sheet: DnD5eFormData): string[] {
  const changes: string[] = [];
  const note = (what: string, stored: unknown, shown: number) => {
    if (typeof stored === 'number' && Number.isFinite(stored) && stored !== shown) {
      changes.push(`${what} (${stored} to ${shown})`);
    }
  };
  const noteBonus = (what: string, stored: number | null | undefined) => {
    if (stored != null) note(what, stored, withinBonusRange(stored));
  };

  const storedSlots = (sheet.spellcasting?.slots ?? {}) as Record<string, { total?: unknown; expended?: unknown } | undefined>;
  const shownSlots = withAllSlotLevels(sheet.spellcasting?.slots) as unknown as Record<string, { total: number; expended: number }>;
  for (const level of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    note(`level ${level} spell slots`, storedSlots[level]?.total, shownSlots[level].total);
    note(`level ${level} spell slots used`, storedSlots[level]?.expended, shownSlots[level].expended);
  }

  noteBonus('initiative other bonus', sheet.initiativeBonus ?? dnd5eBackfilledInitiativeBonus(sheet));
  noteBonus(
    'passive Perception other bonus',
    sheet.passivePerceptionBonus ??
      (typeof sheet.passivePerception === 'number'
        ? sheet.passivePerception - passiveScore(dnd5eSkillBonus(sheet, 'perception'))
        : null)
  );
  if (sheet.spellcasting) {
    noteBonus('spell save DC other bonus', sheet.spellcasting.spellSaveDCOtherBonus ?? dnd5eBackfilledSpellSaveDCBonus(sheet));
    noteBonus('spell attack other bonus', sheet.spellcasting.spellAttackOtherBonus ?? dnd5eBackfilledSpellAttackBonus(sheet));
  }
  return changes;
}

/**
 * Drop the separate `languages` list a sheet written before 1.3.0 carries.
 *
 * The form's proficiency boxes are read from the stored sheet, which puts
 * those languages in the Languages box, so from here on the box is the only
 * copy. Kept, it would put a language back on every save after the player
 * deleted it from the box.
 */
function withoutOrphanLanguages(sheet: DnD5eFormData): DnD5eFormData {
  const settled = { ...sheet };
  delete (settled as Record<string, unknown>).languages;
  return settled;
}

/** The ability each of the eighteen skills uses. */
const SKILL_ABILITIES: Record<keyof DnD5eSkills, keyof DnD5eStats> = {
  acrobatics: 'dexterity',
  animalHandling: 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  sleightOfHand: 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
};

/**
 * The proficiency bonus a character of `level` has (Basic Rules, Character
 * Advancement), held to level 20 while a larger level is being typed.
 */
function levelProficiencyBonus(level: number | undefined): number {
  return proficiencyBonusForLevel(Math.min(20, level ?? 1));
}

/**
 * One entry for each of `keys`: what the sheet stored, with a blank entry for
 * any it left out. The server takes the six saving throws and the eighteen
 * skills all together or not at all, so a sheet stored with some or none of
 * them would have its next save refused.
 */
function withEveryEntry<T>(stored: unknown, keys: readonly string[], blank: () => Record<string, unknown>): T {
  const source = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    keys.map((key) => {
      const entry = source[key];
      return [key, { ...blank(), ...(typeof entry === 'object' && entry !== null ? entry : {}) }];
    })
  ) as T;
}

/**
 * DnD5eCharacterEditor - Editable D&D 5e character sheet
 */
export const DnD5eCharacterEditor: React.FC<DnD5eCharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
  onDirtyChange,
  onDone,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const [isSaving, setIsSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Set when the last change to the cantrips box was turned away for adding one entry too many.
  const [cantripsTurnedAway, setCantripsTurnedAway] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Rows made by an add button and not edited since. Any edit replaces a row
  // with a copy, so a row still here has not been typed in, and one with no
  // name is left out of the save: the server refuses an attack, item or spell
  // with none, and pressing an add button by mistake made a sheet that could
  // not be saved.
  const untouchedRows = useRef(new WeakSet<object>());
  // A sheet stored without hit points gets a blank block in the form. Left at
  // nothing, it stays out of the save: its maximum of 0 is one the server
  // refuses, and the sheet was saveable without it.
  const storedWithoutHitPoints = character.data == null || (character.data as DnD5eFormData).hp == null;
  const hitPointsLeftOut = (hp: DnD5eFormData['hp']) =>
    storedWithoutHitPoints && !!hp && hp.maximum === 0 && hp.current === 0 && hp.temporary === 0;
  const newRow = <T extends object>(row: T): T => {
    untouchedRows.current.add(row);
    return row;
  };
  const { data: serverConfig } = useServerConfigQuery();

  // Type assertion for D&D 5e character data
  const data = character.data as DnD5eFormData;
  // Said once, above the sheet, for as long as it is open.
  const [broughtWithinRange] = useState(() => numbersBroughtWithinRange(data ?? ({} as DnD5eFormData)));


  // Form state, initialised from the editor's own copy of the sheet. The
  // effects below write derived numbers into the form, and with the stored
  // sheet's inner objects shared they wrote them into the character the host,
  // the sheet behind and the Characters page's list are holding, before
  // anything was saved.
  const [formData, setFormData] = useState<DnD5eFormData>(() => {
    const own = JSON.parse(JSON.stringify(data ?? {})) as DnD5eFormData;
    return {
      ...withoutOrphanLanguages(withoutOrphanFeatures(own)),
      // Held to the range the server stores, so a sheet stored with more can
      // still be saved. Left out when absent, which is what makes the effects
      // below read an older sheet's totals back into them.
      ...(own.initiativeBonus != null ? { initiativeBonus: bonusWithinRange(own.initiativeBonus) } : {}),
      ...(own.passivePerceptionBonus != null
        ? { passivePerceptionBonus: bonusWithinRange(own.passivePerceptionBonus) }
        : {}),
      // Ensure nested objects exist.
      stats: own.stats || {},
      // Every saving throw and skill, so the effects below and the next save
      // have all of them. A stored total that differs from what the scores
      // give keeps the difference as its other bonus, so the total survives
      // the effects below.
      savingThrows: withRecordedOtherBonuses(
        withEveryEntry<DnD5eSavingThrows>(own.savingThrows, DND5E_ABILITY_NAMES, () => ({ proficient: false, bonus: 0 })),
        (ability) => dnd5eBackfilledSaveOtherBonus(own, ability)
      ),
      skills: withRecordedOtherBonuses(
        withEveryEntry<DnD5eSkills>(own.skills, Object.keys(SKILL_ABILITIES), () => ({
          proficient: false,
          expertise: false,
          bonus: 0,
        })),
        (skill) => dnd5eBackfilledSkillOtherBonus(own, skill)
      ),
      hp: own.hp || { maximum: 0, current: 0, temporary: 0 },
      deathSaves: own.deathSaves || { successes: 0, failures: 0 },
      // The spell save DC and attack bonus are worked out from here on, each
      // with an other bonus. A sheet saved before that existed has its typed
      // totals read into one (see the effect below), here, once: read later, a
      // total this editor had worked out was taken as typed.
      spellcasting: own.spellcasting
        ? {
            ...own.spellcasting,
            slots: withAllSlotLevels(own.spellcasting.slots),
            spellSaveDCOtherBonus:
              own.spellcasting.spellSaveDCOtherBonus != null
                ? withinBonusRange(own.spellcasting.spellSaveDCOtherBonus)
                : withinBonusRange(dnd5eBackfilledSpellSaveDCBonus(own) ?? 0),
            spellAttackOtherBonus:
              own.spellcasting.spellAttackOtherBonus != null
                ? withinBonusRange(own.spellcasting.spellAttackOtherBonus)
                : withinBonusRange(dnd5eBackfilledSpellAttackBonus(own) ?? 0),
          }
        : {
            ability: '',
            spellSaveDC: 0,
            spellAttackBonus: 0,
            spellSaveDCOtherBonus: 0,
            spellAttackOtherBonus: 0,
            cantrips: [],
            slots: withAllSlotLevels(undefined),
            spells: [],
          },
      currency: own.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      inventory: own.inventory || [],
      attacks: own.attacks || [],
      hitDice: own.hitDice || [],
      conditions: own.conditions || [],
      proficienciesAndLanguages: own.proficienciesAndLanguages || [],
      // Always four strings, so the textareas are controlled from the first
      // render. The shared reader settles where they come from: the stored boxes
      // when the sheet has them, otherwise a one-time guess from the flat list a
      // sheet written before the boxes existed carries.
      proficiencies: readProficiencyGroups(own),
      // featuresAndTraits is not defaulted here: the spread above has already
      // settled it, folding in the template-era `features` field. Re-reading
      // `data` would throw that away.
      appearance: own.appearance || {},
      personality: own.personality || {},
      alliesAndOrganizations: own.alliesAndOrganizations || { name: '', description: '' },
    };
  });

  // Report unsaved work up to whoever is hosting this sheet, so leaving with
  // pending edits can be caught. One effect over the whole form rather than a
  // call in each of the ~40 field handlers: it cannot be forgotten when a field
  // is added, and it catches changes made any way at all.
  //
  // Two conditions, both required, because either alone gets it wrong.
  //
  // These editors recompute derived values from effects that run as the sheet
  // mounts, so `formData` changes identity — and often value — before anyone
  // has touched anything. Reporting on identity alone marked every sheet dirty
  // on open, and comparing values alone still did, because those effects
  // genuinely write different numbers to a sheet whose stored values had
  // drifted.
  //
  // So: until the first real interaction the baseline simply follows the form,
  // absorbing that settling. From the first interaction onwards the baseline is
  // frozen and edits are measured against it — which also means typing a value
  // and putting it back reads as clean, as it should.
  const dirtyRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const cleanSnapshotRef = useRef<string | null>(null);

  // Capture-phase, so it runs before the field's own handler updates state.
  // Pointer events are included because plenty of edits here are button
  // presses (add an item, adjust a track) rather than typing.
  const noteInteraction = () => { hasInteractedRef.current = true; };

  // Token image state (file will be uploaded on save)
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(
    character.tokenImageUrl
  );

  // Color customization state
  const [selectedColor, setSelectedColor] = useState(COLOR_PRESETS[0]); // Default to Classic Red
  const [customColorHex, setCustomColorHex] = useState('');
  const [isCustomColor, setIsCustomColor] = useState(false);

  // The header colour and a newly chosen token picture are kept outside the
  // form, and are unsaved changes too.
  const snapshotOf = (form: typeof formData, theme: string, picture: File | null) => JSON.stringify({
    formData: form,
    themeColor: theme,
    tokenImage: picture ? `${picture.name}:${picture.size}:${picture.lastModified}` : null,
  });
  const themeChoice = isCustomColor ? customColorHex : selectedColor.name;
  const sheetSnapshot = snapshotOf(formData, themeChoice, tokenImageFile);
  if (cleanSnapshotRef.current === null) {
    cleanSnapshotRef.current = sheetSnapshot;
  }
  // Always the current state, for reading inside async callbacks.
  const latestSnapshotRef = useRef(sheetSnapshot);
  latestSnapshotRef.current = sheetSnapshot;

  useEffect(() => {
    if (!hasInteractedRef.current) {
      cleanSnapshotRef.current = sheetSnapshot;
      return;
    }
    const dirty = sheetSnapshot !== cleanSnapshotRef.current;
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [sheetSnapshot, onDirtyChange]);

  // The sheet's saved colour, read once as the editor opens. The character
  // handed in is refreshed while the editor is open, and following it put a
  // colour saved elsewhere over the one the user had picked.
  useEffect(() => {
    if (data.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === data.themeColor);
      if (savedColor) {
        setSelectedColor(savedColor);
        setIsCustomColor(false);
      } else {
        // Custom hex colour, a three-digit one expanded, so it opens as itself
        // rather than as the default preset.
        const hex = toStoredHexColor(data.themeColor);
        if (hex) {
          setCustomColorHex(hex);
          setIsCustomColor(true);
        }
      }
    }
  }, []);

  // Handle custom color change
  const handleCustomColorChange = (hex: string) => {
    setCustomColorHex(hex);
    setIsCustomColor(true);
    setErrors((prev) => ({ ...prev, themeColor: '' }));
  };

  // Handle preset color selection
  const handlePresetColorSelect = (color: typeof COLOR_PRESETS[0]) => {
    setSelectedColor(color);
    setIsCustomColor(false);
    setShowColorPicker(false);
  };

  // The derived-number effects below each build their update from `prev`,
  // replacing every entry they change rather than writing into it. Running in
  // order within one commit, each sees what the one before it settled: the
  // saving throws are worked out from the modifiers just corrected.

  // Auto-calculate modifiers when ability scores change
  useEffect(() => {
    setFormData((prev) => {
      if (!prev.stats) return prev;
      const updatedStats = { ...prev.stats };
      let hasChanges = false;

      (Object.keys(updatedStats) as (keyof DnD5eStats)[]).forEach(ability => {
        const newModifier = calculateModifier(updatedStats[ability].score);
        if (updatedStats[ability].modifier !== newModifier) {
          updatedStats[ability] = { ...updatedStats[ability], modifier: newModifier };
          hasChanges = true;
        }
      });

      return hasChanges ? { ...prev, stats: updatedStats } : prev;
    });
  }, [
    formData.stats?.strength?.score,
    formData.stats?.dexterity?.score,
    formData.stats?.constitution?.score,
    formData.stats?.intelligence?.score,
    formData.stats?.wisdom?.score,
    formData.stats?.charisma?.score,
  ]);

  // Auto-calculate saving throws when proficiency or stats change
  useEffect(() => {
    setFormData((prev) => {
      if (!prev.stats || !prev.savingThrows || prev.proficiencyBonus === undefined) return prev;
      const updatedSavingThrows = { ...prev.savingThrows };
      let hasChanges = false;

      (Object.keys(updatedSavingThrows) as (keyof DnD5eSavingThrows)[]).forEach(ability => {
        const abilityMod = prev.stats[ability]?.modifier || 0;
        const proficient = updatedSavingThrows[ability].proficient;
        const other = updatedSavingThrows[ability].otherBonus ?? 0;
        const newBonus = abilityMod + (proficient ? prev.proficiencyBonus : 0) + other;

        if (updatedSavingThrows[ability].bonus !== newBonus) {
          updatedSavingThrows[ability] = { ...updatedSavingThrows[ability], bonus: newBonus };
          hasChanges = true;
        }
      });

      return hasChanges ? { ...prev, savingThrows: updatedSavingThrows } : prev;
    });
  }, [
    formData.proficiencyBonus,
    formData.stats?.strength?.modifier,
    formData.stats?.dexterity?.modifier,
    formData.stats?.constitution?.modifier,
    formData.stats?.intelligence?.modifier,
    formData.stats?.wisdom?.modifier,
    formData.stats?.charisma?.modifier,
    formData.savingThrows?.strength?.proficient,
    formData.savingThrows?.dexterity?.proficient,
    formData.savingThrows?.constitution?.proficient,
    formData.savingThrows?.intelligence?.proficient,
    formData.savingThrows?.wisdom?.proficient,
    formData.savingThrows?.charisma?.proficient,
    formData.savingThrows?.strength?.otherBonus,
    formData.savingThrows?.dexterity?.otherBonus,
    formData.savingThrows?.constitution?.otherBonus,
    formData.savingThrows?.intelligence?.otherBonus,
    formData.savingThrows?.wisdom?.otherBonus,
    formData.savingThrows?.charisma?.otherBonus,
  ]);

  // Auto-calculate skill bonuses when ability scores, proficiency, or expertise change
  useEffect(() => {
    setFormData((prev) => {
      if (!prev.stats || !prev.skills || prev.proficiencyBonus === undefined) return prev;
      const updatedSkills = { ...prev.skills };
      let hasChanges = false;

      (Object.keys(updatedSkills) as (keyof DnD5eSkills)[]).forEach(skill => {
        const ability = SKILL_ABILITIES[skill];
        const abilityMod = prev.stats[ability]?.modifier || 0;
        const proficient = updatedSkills[skill].proficient;
        const expertise = updatedSkills[skill].expertise;

        let newBonus = abilityMod + (updatedSkills[skill].otherBonus ?? 0);
        if (expertise) {
          newBonus += prev.proficiencyBonus * 2; // Expertise = double proficiency
        } else if (proficient) {
          newBonus += prev.proficiencyBonus;
        }

        if (updatedSkills[skill].bonus !== newBonus) {
          updatedSkills[skill] = { ...updatedSkills[skill], bonus: newBonus };
          hasChanges = true;
        }
      });

      // Keep the stored passive Perception in step with the Perception bonus.
      // Both sheets now *display* a derived value, so this is not what makes
      // them agree — but the field is part of the saved character and is read
      // by exports and by anything else consuming the blob, so leaving it at a
      // stale number would just move the same lie somewhere less visible.
      //
      // A sheet that carries a total but no `passivePerceptionBonus` predates
      // that field, so the difference is read back as the bonus. Without this a
      // character imported with the Observant feat would silently lose its +5
      // the first time the sheet was saved.
      const perceptionBonus = updatedSkills.perception?.bonus ?? 0;
      const storedTotal = prev.passivePerception;
      const backfilledPassiveBonus =
        prev.passivePerceptionBonus === undefined || prev.passivePerceptionBonus === null
          ? (typeof storedTotal === 'number' && Number.isFinite(storedTotal)
              ? withinBonusRange(storedTotal - passiveScore(perceptionBonus))
              : 0)
          : null;
      const passiveBonus = backfilledPassiveBonus ?? prev.passivePerceptionBonus ?? 0;
      const newPassivePerception = passiveScore(perceptionBonus + passiveBonus);

      const passiveChanged =
        prev.passivePerception !== newPassivePerception || backfilledPassiveBonus !== null;

      if (!hasChanges && !passiveChanged) return prev;
      return {
        ...prev,
        skills: updatedSkills,
        passivePerceptionBonus: passiveBonus,
        passivePerception: newPassivePerception,
      };
    });
  }, [
    formData.proficiencyBonus,
    formData.stats?.strength?.modifier,
    formData.stats?.dexterity?.modifier,
    formData.stats?.constitution?.modifier,
    formData.stats?.intelligence?.modifier,
    formData.stats?.wisdom?.modifier,
    formData.stats?.charisma?.modifier,
    // Explicitly depend on each skill's proficient and expertise flags, and
    // its other bonus
    ...(Object.keys(SKILL_ABILITIES) as (keyof DnD5eSkills)[]).flatMap(skill => [
      formData.skills?.[skill]?.proficient,
      formData.skills?.[skill]?.expertise,
      formData.skills?.[skill]?.otherBonus,
    ]),
  ]);

  /**
   * The initiative modifier shown on the sheet: Dexterity plus the manual bonus.
   * Derived on every render rather than read from storage, so what is displayed
   * is always what will be rolled.
   */
  const initiativeModifier = dnd5eInitiativeModifier(formData);

  /** What the character's level gives, offered beside a bonus set otherwise. */
  const levelBonus = levelProficiencyBonus(formData.level);

  // Spell save DC and attack bonus, derived the way the rules define them.
  // Both were hand-typed boxes, which is why the templates could ship DC 8 —
  // a number no character can legitimately have, since the lowest at level 1
  // is 10.
  const exhaustion = exhaustionLevel(formData.exhaustionLevel);
  const spellAbilityModifier = spellcastingAbilityModifier(formData);
  const spellSaveDC = dnd5eSpellSaveDC(formData);
  // The server stores a DC of at least 1, so the other bonus stops where the
  // rest of the DC would leave it at 1.
  const dcOtherBonusMin = Math.max(
    MIN_BONUS_OVERRIDE,
    1 - (spellSaveDC - (formData.spellcasting?.spellSaveDCOtherBonus ?? 0))
  );
  const spellAttackBonus = dnd5eSpellAttackBonus(formData);

  /**
   * The feature rows, straight from form state.
   *
   * Deliberately not derived: `withoutOrphanFeatures` has already settled both
   * stored shapes into this one list when the form was created, so what is here
   * is exactly what the user is editing — including rows they have added and
   * not yet named. Blank rows are dropped on save, not while typing.
   */
  const featureRows = useMemo(
    () => readFeatureEntriesForEditing(formData.featuresAndTraits),
    [formData.featuresAndTraits]
  );

  /**
   * Convert a character saved before `initiativeBonus` existed, and keep the
   * stored total in step afterwards.
   *
   * Initiative used to be one hand-typed number. Someone with the Alert feat and
   * Dexterity 14 typed `7`; now that the total is derived, that has to be read
   * back as "Dexterity +2, other +5" or their character would quietly lose five
   * points. The conversion runs once, only where the new field is absent.
   *
   * The stored `initiative` is then maintained as the derived total. Nothing
   * displays it any more, but it is part of the saved character and is read by
   * exports, so leaving it stale would just hide the same inconsistency
   * somewhere less visible.
   */
  useEffect(() => {
    const read = dnd5eBackfilledInitiativeBonus(formData);
    const backfilled = read === null ? null : withinBonusRange(read);
    const bonus = backfilled ?? formData.initiativeBonus ?? 0;
    const total = dnd5eInitiativeModifier({ ...formData, initiativeBonus: bonus });

    const needsBonus = backfilled !== null;
    const needsTotal = formData.initiative !== total;
    if (!needsBonus && !needsTotal) return;

    setFormData((prev) => ({
      ...prev,
      ...(needsBonus ? { initiativeBonus: bonus } : {}),
      initiative: total,
    }));
  }, [
    formData.stats?.dexterity?.score,
    formData.stats?.dexterity?.modifier,
    formData.initiativeBonus,
    formData.initiative,
  ]);

  /**
   * Keep the stored spell save DC and attack bonus in step with the formulas.
   *
   * Both used to be typed by hand, so a caster with a Rod of the Pact Keeper
   * had a DC one higher than the formula gives. The form's initial state read
   * that point into the other bonus, so deriving does not take it away.
   */
  useEffect(() => {
    if (!formData.spellcasting) return;

    const dcTotal = dnd5eSpellSaveDC(formData);
    const attackTotal = dnd5eSpellAttackBonus(formData);
    if (formData.spellcasting.spellSaveDC === dcTotal && formData.spellcasting.spellAttackBonus === attackTotal) return;

    setFormData((prev) => ({
      ...prev,
      spellcasting: {
        ...prev.spellcasting,
        spellSaveDC: dcTotal,
        spellAttackBonus: attackTotal,
      } as DnD5eSpellcasting,
    }));
  }, [
    formData.proficiencyBonus,
    formData.level,
    formData.stats,
    formData.spellcasting?.ability,
    formData.spellcasting?.spellSaveDCOtherBonus,
    formData.spellcasting?.spellAttackOtherBonus,
    formData.spellcasting?.spellSaveDC,
    formData.spellcasting?.spellAttackBonus,
  ]);

  // Handle token image upload
  const handleTokenImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors({ ...errors, tokenImage: 'Please select an image file' });
        return;
      }
      // Validate file size against the server's token limit
      const tokenLimit = getUploadLimit(serverConfig, AssetType.TOKEN);
      if (file.size > tokenLimit) {
        setErrors({ ...errors, tokenImage: `Image must be smaller than ${formatUploadLimit(tokenLimit)}` });
        return;
      }
      setTokenImageFile(file);
      setErrors({ ...errors, tokenImage: '' });
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setTokenImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Validate form data: what the server would refuse and typing cannot
  // prevent, keyed by the box it is about.
  const validateForm = (): Record<string, string> => {
    const newErrors: Record<string, string> = {};
    const blank = (value: string | undefined) => (value ?? '').trim() === '';

    // Validate level (1-20)
    if (!formData.level || formData.level < 1 || formData.level > 20) {
      newErrors.level = 'Level must be between 1 and 20';
    }

    // Validate ability scores (1-30)
    if (formData.stats) {
      Object.entries(formData.stats).forEach(([ability, data]) => {
        if (!data.score || data.score < 1 || data.score > 30) {
          newErrors[`stats.${ability}`] = 'Ability score must be between 1 and 30';
        }
      });
    }

    // Validate character name
    if (!formData.characterName || formData.characterName.trim() === '') {
      newErrors.characterName = 'Character name is required';
    }
    if (blank(formData.race)) newErrors.race = 'Race is required';
    if (blank(formData.class)) newErrors.class = 'Class is required';

    if (!hitPointsLeftOut(formData.hp) && (formData.hp?.maximum ?? 0) < 1) {
      newErrors['hp.maximum'] = 'Maximum hit points must be at least 1';
    }
    if (formData.armorClass != null && formData.armorClass < 1) {
      newErrors.armorClass = 'Armor Class must be at least 1';
    }

    // A row added and never typed in is left out of the save; one that was
    // typed in and has no name is the player's to finish or remove.
    const kept = (row: object) => !untouchedRows.current.has(row);
    (formData.attacks ?? []).forEach((row, i) => {
      if (kept(row) && blank(row.name)) newErrors[`attacks.${i}.name`] = 'Name this attack, or remove it';
    });
    (formData.hitDice ?? []).forEach((row, i) => {
      if (kept(row) && blank(row.class)) newErrors[`hitDice.${i}.class`] = 'Give this hit die a class, or remove it';
    });
    (formData.inventory ?? []).forEach((row, i) => {
      if (kept(row) && blank(row.name)) newErrors[`inventory.${i}.name`] = 'Name this item, or remove it';
    });
    (formData.spellcasting?.spells ?? []).forEach((row, i) => {
      if (kept(row) && blank(row.name)) newErrors[`spellcasting.spells.${i}.name`] = 'Name this spell, or remove it';
    });
    if (formData.spellcasting && spellSaveDC < 1) {
      newErrors['spellcasting.spellSaveDCOtherBonus'] = 'The spell save DC must be at least 1. Raise its Other bonus.';
    }

    // The server refuses a colour it cannot read, and the whole save with it.
    if (isCustomColor && customColorHex !== '' && !toStoredHexColor(customColorHex)) {
      newErrors.themeColor = HEX_COLOUR_HINT;
      setShowColorPicker(true);
    }

    setErrors(newErrors);
    return newErrors;
  };

  // Parse comma-separated string into array
  const parseCommaSeparated = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'string') return [];
    return value.split(',').map(i => i.trim()).filter(i => i);
  };

  // Handle form submission
  const handleSubmit = async () => {
    // A completed save means nothing is pending any more — unless the sheet was
    // edited again while the save was in flight, which the recheck preserves.
    const savedSnapshot = sheetSnapshot;
    const savedForm = formData;
    const savedTheme = themeChoice;
    const uploadedPicture = tokenImageFile;
    const markClean = () => {
      const stillDirty = latestSnapshotRef.current !== savedSnapshot;
      // A picture that went up with this save is on the character now, so the
      // next save must not upload it again. One chosen while saving stays.
      if (uploadedPicture) {
        setTokenImageFile((current) => (current === uploadedPicture ? null : current));
        cleanSnapshotRef.current = snapshotOf(savedForm, savedTheme, null);
      } else {
        cleanSnapshotRef.current = savedSnapshot;
      }
      dirtyRef.current = stillDirty;
      onDirtyChange?.(stillDirty);
      // Typed while the save was in flight: the editor keeps it, unsaved.
      if (!stillDirty) onDone?.();
    };
    const refused = Object.keys(validateForm());
    if (refused.length > 0) {
      // The first refused box that is on a tab, so the player sees it.
      const onTab = refused.map(tabOfError).find((tab): tab is TabId => tab !== null);
      if (onTab) setActiveTab(onTab);
      return;
    }

    setIsSaving(true);
    try {
      // Include color customization in saved data
      const updatedData = {
        ...formData,
        themeColor: isCustomColor ? (toStoredHexColor(customColorHex) ?? '') : selectedColor.name,
      };

      // Proficiencies.
      //
      // The four boxes are stored as typed, under `proficiencies`, and that is
      // what both this editor and the read-only view display. The flattened
      // array is written alongside purely for older readers — it loses which
      // box an entry came from, which is what used to leave a player's
      // Thieves' Cant filed under Weapons.
      const proficiencyGroups = readProficiencyGroups(updatedData);
      updatedData.proficiencies = proficiencyGroups;
      updatedData.proficienciesAndLanguages = flattenProficiencyGroups(proficiencyGroups);

      // Features & Traits.
      //
      // Normalised through the shared reader rather than split on commas, so a
      // sheet that arrives holding strings, or holding the separate field the
      // built-in templates used to write, is saved back as one list of named
      // entries. Rows left completely blank are dropped rather than saved as
      // nameless features.
      //
      // `features` goes with it: the templates' copy has been folded into the
      // list above, and leaving it behind would mean the same features were
      // recorded twice, in two shapes, drifting apart from here on.
      updatedData.featuresAndTraits = collectSheetFeatures(updatedData);
      delete (updatedData as Record<string, unknown>).features;

      if (hitPointsLeftOut(updatedData.hp)) delete updatedData.hp;

      // Rows added and never typed in, which the server would refuse.
      const filledIn = <T extends object>(rows: T[] | undefined, named: (row: T) => string | undefined) =>
        rows?.filter((row) => !untouchedRows.current.has(row) || (named(row) ?? '').trim() !== '');
      updatedData.attacks = filledIn(updatedData.attacks, (row) => row.name);
      updatedData.inventory = filledIn(updatedData.inventory, (row) => row.name);
      updatedData.hitDice = filledIn(updatedData.hitDice, (row) => row.class);

      // Cantrips, parsed into a new spellcasting block. Written into the one
      // the form holds, the array showed up in the form while the save was in
      // flight, so the sheet still counted as changed once it had gone through.
      // Slots too: a total lowered below the slots used leaves the used count
      // as it was while the player types, and it is brought down here.
      if (updatedData.spellcasting) {
        updatedData.spellcasting = {
          ...updatedData.spellcasting,
          spells: filledIn(updatedData.spellcasting.spells, (row) => row.name),
          cantrips: parseCommaSeparated(updatedData.spellcasting.cantrips),
          slots: withAllSlotLevels(updatedData.spellcasting.slots),
        };
      }

      // Upload token image if a new one was selected
      let newTokenImageUrl: string | undefined = undefined;
      if (tokenImageFile) {
        try {
          // File last: multer parses parts in order, so the server knows the
          // asset type even if it aborts an oversize file mid-stream.
          const assetFormData = new FormData();
          assetFormData.append('type', 'TOKEN');
          if (character.campaignId) {
            assetFormData.append('scope', 'CAMPAIGN');
            assetFormData.append('campaignId', character.campaignId);
          } else {
            assetFormData.append('scope', 'USER');
          }
          assetFormData.append('name', assetNameFrom(`${formData.characterName || 'Character'} Token`));
          assetFormData.append('file', tokenImageFile);

          const uploadResponse = await api.uploadAsset(assetFormData);
          const assetId = uploadResponse.asset.id;

          // Store the new token URL to pass separately to onSave
          newTokenImageUrl = `/api/assets/tokens/${assetId}`;
        } catch (uploadError: unknown) {
          console.error('Error uploading token image:', uploadError);
          setErrors({ ...errors, tokenImage: apiErrorMessage(uploadError) || 'Failed to upload token image' });
          setIsSaving(false);
          return;
        }
      }

      // Pass the tokenImageUrl as a separate parameter if it was uploaded
      await onSave(updatedData, true, newTokenImageUrl);
      markClean();
    } catch (error) {
      console.error('Error saving character:', error);
      setErrors({ ...errors, submit: 'Failed to save character. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Set a value at a dotted path, cloning each level on the way down.
   *
   * The walk is untyped on purpose: the path is a runtime string, so no type
   * can describe what it lands on. The `Record<string, unknown>` view says
   * exactly that — this is indexing an object by a name only known at runtime —
   * rather than `any`, which would also have silenced the *call sites*.
   */
  /**
   * What has been typed into each attack's "add your own property" box, keyed
   * by that attack's index. Draft text only — nothing reaches the sheet until
   * it is committed, so a half-typed word is never stored.
   */
  const [customPropertyDrafts, setCustomPropertyDrafts] = useState<Record<number, string>>({});

  /** Whether an attack carries as many properties as a sheet keeps. */
  const propertiesFull = (properties: readonly string[] | undefined) =>
    listIsFull(properties, DND5E_WEAPON_PROPERTIES_MAX);

  /** Move a typed property onto the attack and clear the box. */
  const commitCustomProperty = (index: number, properties: string[]) => {
    if (propertiesFull(properties)) return;
    const draft = customPropertyDrafts[index] ?? '';
    const next = addCustomWeaponProperty(properties, draft);
    // Refused (blank, too long, already there) — leave the text so it can be
    // corrected rather than silently discarding what was typed.
    if (next.length === properties.length) return;
    updateField(`attacks.${index}.properties`, next);
    setCustomPropertyDrafts((prev) => ({ ...prev, [index]: '' }));
  };

  /**
   * Drop one attack's draft and shift the rest down.
   *
   * The drafts are keyed by position in the attacks array, so deleting a weapon
   * renumbers every weapon after it. Without this, half-typed text moved to
   * whichever weapon inherited the deleted one's index.
   */
  const removeCustomPropertyDraft = (removed: number) => {
    setCustomPropertyDrafts((prev) => {
      const next: Record<number, string> = {};
      for (const [key, draft] of Object.entries(prev)) {
        const at = Number(key);
        if (at === removed) continue;
        next[at > removed ? at - 1 : at] = draft;
      }
      return next;
    });
  };

  /**
   * Set the level, moving the proficiency bonus with it when the bonus was the
   * old level's. A bonus set by hand to something else is the player's, and
   * the box offers the level's beside it.
   */
  const changeLevel = (level: number) => {
    clearErrorsAt('level');
    setFormData((prev) => ({
      ...prev,
      level,
      ...(prev.proficiencyBonus === levelProficiencyBonus(prev.level)
        ? { proficiencyBonus: levelProficiencyBonus(level) }
        : {}),
    }));
  };

  /** Drop what Save said about a box, and any box inside it, once it changes. */
  const clearErrorsAt = (path: string) => {
    setErrors((prev) => {
      const stale = Object.keys(prev).filter((key) => prev[key] && (path === key || path.startsWith(`${key}.`) || key.startsWith(`${path}.`)));
      if (stale.length === 0) return prev;
      const next = { ...prev };
      for (const key of stale) delete next[key];
      return next;
    });
  };

  /** What Save said about a box, under it. */
  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  const updateField = (path: string, value: unknown) => {
    clearErrorsAt(path);
    setFormData((prev) => {
      const newData = { ...prev } as unknown as Record<string, unknown>;
      const keys = path.split('.');
      let current = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        // CRITICAL: Preserve array types when cloning nested structures
        const branch = current[keys[i]];
        if (Array.isArray(branch)) {
          current[keys[i]] = [...branch];
        } else if (typeof branch === 'object' && branch !== null) {
          current[keys[i]] = { ...(branch as Record<string, unknown>) };
        } else {
          current[keys[i]] = {};
        }
        current = current[keys[i]] as Record<string, unknown>;
      }
      current[keys[keys.length - 1]] = value;
      return newData as unknown as DnD5eFormData;
    });
  };

  // Render character header with token upload and color picker
  const renderHeader = () => {
    // Determine the current background style
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    // Determine text color based on background luminance
    const headerTextColor = isCustomColor
      ? (shouldUseWhiteText(customColorHex) ? 'text-white' : 'text-stone-900')
      : (shouldUseWhiteText(selectedColor.hex) ? 'text-white' : 'text-stone-900');

    const headerClasses = isCustomColor
      ? `${headerTextColor} p-6 rounded-t-lg relative`
      : `bg-linear-to-r/srgb ${selectedColor.from} ${selectedColor.to} ${headerTextColor} p-6 rounded-t-lg relative`;

    return (
      <div className={headerClasses} style={headerStyle}>
        {/* Save and Cancel Buttons */}
        <div className="absolute top-4 right-16 flex items-center space-x-2">
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
        </div>

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
                    !isCustomColor && selectedColor.name === color.name
                      ? 'ring-2 ring-stone-400 bg-stone-100'
                      : 'hover:bg-stone-50'
                  }`}
                >
                  <div className={`w-full h-6 rounded-sm mb-1 bg-linear-to-r/srgb ${color.from} ${color.to}`} />
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
                  value={customColorHex || '#b91c1c'}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="w-12 h-12 rounded-sm cursor-pointer border-2 border-stone-300"
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
                    placeholder="#b91c1c"
                    aria-label="Custom colour hex code"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-stone-500 mt-1">Enter hex code (e.g., #b91c1c)</div>
                  {errors.themeColor && <div className="text-xs text-red-600 mt-1">{errors.themeColor}</div>}
                </div>
              </div>

              {/* Custom Color Preview */}
              {isCustomColor && customColorHex && /^#[0-9A-Fa-f]{6}$/.test(customColorHex) && (
                <div className="flex items-center space-x-2 p-2 bg-stone-50 rounded-sm">
                  <div
                    className="w-8 h-8 rounded-sm"
                    style={{ background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }}
                  />
                  <span className="text-sm font-medium">Custom: {customColorHex}</span>
                </div>
              )}
            </div>
          </div>
        )}

      {/* pr-64 reserves the strip the absolutely-positioned Save/Cancel cluster
          and palette button occupy above. Without it the Experience Points
          field sits underneath them. */}
      <div className="flex items-start justify-between pr-64">
        {/* min-w-0 so this column can shrink. Flex children default to
            min-width:auto, which lets the character-name input push out past
            the reserved padding on a narrow window and back under the
            buttons. */}
        <div className="flex items-start space-x-4 min-w-0">
          {/* Token Image Upload */}
          <div className="shrink-0 relative group">
            <input
              type="file"
              id="token-upload"
              accept="image/*"
              onChange={handleTokenImageChange}
              className="hidden"
            />
            <label
              htmlFor="token-upload"
              className="cursor-pointer block relative"
            >
              {tokenImagePreview ? (
                <img
                  src={tokenImagePreview}
                  alt={formData.characterName || 'Character'}
                  className="w-40 h-40 rounded-full border-4 border-white/20 object-cover"
                />
              ) : (
                <div className="w-40 h-40 rounded-full border-4 border-white/20 bg-stone-800 flex items-center justify-center">
                  <User className="w-20 h-20 text-white/40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Upload className="w-12 h-12 text-white" />
              </div>
            </label>
            {errors.tokenImage && (
              <div className="absolute top-full mt-1 text-xs text-red-200 whitespace-nowrap">
                {errors.tokenImage}
              </div>
            )}
            {!character.campaignId && (
              <div className="absolute top-full mt-1 text-xs text-amber-200 whitespace-nowrap">
                Saves as personal token
              </div>
            )}
          </div>

          {/* Character Info */}
          <div className="space-y-2 min-w-0">
            <input
              type="text"
              value={formData.characterName || ''}
              onChange={(e) => updateField('characterName', e.target.value)}
              maxLength={SHEET_NAME_MAX}
              placeholder="Character Name"
              aria-label="Character name"
              className={`w-full text-3xl font-bold bg-white/10 border-2 ${
                errors.characterName ? 'border-red-300' : 'border-white/20'
              } rounded px-3 py-1 ${headerTextColor} focus:outline-hidden focus:border-white/40`}
            />
            {/* Player name is who owns this character, not free text — it is
                filled from their display name when the character is created
                and is shown rather than edited. */}
            <div className={`flex items-center space-x-3 opacity-80`}>
              <span className={`text-sm ${headerTextColor}`}>
                {formData.playerName || '—'}
              </span>
            </div>
            <div className={`flex items-center flex-wrap gap-2 opacity-80`}>
              <div className="flex items-center space-x-2">
                <label htmlFor="dnd5e-level" className="text-xs">Level</label>
                <NumberField
                  id="dnd5e-level"
                  min={1}
                  max={20}
                  value={formData.level}
                  onChange={changeLevel}
                  className={`w-16 bg-white/10 border ${
                    errors.level ? 'border-red-300' : 'border-white/20'
                  } rounded px-2 py-0.5 text-sm ${headerTextColor} focus:outline-hidden focus:border-white/40`}
                fallback={1}
                />
              </div>
              <input
                type="text"
                value={formData.race || ''}
                onChange={(e) => updateField('race', e.target.value)}
                placeholder="Race"
                aria-label="Race"
                maxLength={SHEET_SHORT_TEXT_MAX}
                aria-invalid={!!errors.race}
                className={`bg-white/10 border ${errors.race ? 'border-red-300' : 'border-white/20'} rounded-sm px-2 py-0.5 text-sm ${headerTextColor} focus:outline-hidden focus:border-white/40`}
              />
              <input
                type="text"
                value={formData.class || ''}
                onChange={(e) => updateField('class', e.target.value)}
                placeholder="Class"
                aria-label="Class"
                maxLength={SHEET_SHORT_TEXT_MAX}
                aria-invalid={!!errors.class}
                className={`bg-white/10 border ${errors.class ? 'border-red-300' : 'border-white/20'} rounded-sm px-2 py-0.5 text-sm ${headerTextColor} focus:outline-hidden focus:border-white/40`}
              />
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <label htmlFor="dnd5e-experience" className="block text-xs opacity-70">Experience Points</label>
          <NumberField
            id="dnd5e-experience"
            min={0}
            value={formData.experiencePoints}
            onChange={(v: number) => updateField('experiencePoints', v)}
            className={`w-24 text-xl font-bold bg-white/10 border border-white/20 rounded-sm px-2 py-1 ${headerTextColor} text-right focus:outline-hidden focus:border-white/40`}
          fallback={0}
          />
        </div>
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
            aria-current={isActive ? 'page' : undefined}
            className={`
              flex items-center space-x-2 px-4 py-3 font-medium transition-colors
              ${isActive
                ? `text-${selectedColor.accent} border-b-2 border-${selectedColor.accent} -mb-0.5 bg-white`
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
      {/* Character Details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="dnd5e-alignment" className="block text-sm font-semibold text-stone-700 mb-1">Alignment</label>
          <input
            id="dnd5e-alignment"
            type="text"
            value={formData.alignment || ''}
            onChange={(e) => updateField('alignment', e.target.value)}
            placeholder="e.g., Lawful Good"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label htmlFor="dnd5e-background" className="block text-sm font-semibold text-stone-700 mb-1">Background</label>
          <input
            id="dnd5e-background"
            type="text"
            value={formData.background || ''}
            onChange={(e) => updateField('background', e.target.value)}
            placeholder="e.g., Sage"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Proficiency Bonus and Inspiration */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="dnd5e-proficiency-bonus" className="block text-sm font-semibold text-stone-700 mb-1">Proficiency Bonus</label>
          <NumberField
            id="dnd5e-proficiency-bonus"
            min={2}
            max={6}
            value={formData.proficiencyBonus}
            onChange={(v: number) => updateField('proficiencyBonus', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          fallback={2}
          />
          {formData.proficiencyBonus !== levelBonus && (
            <p className="mt-1 text-xs text-stone-600">
              Level {formData.level} gives {formatModifier(levelBonus)}.{' '}
              <button
                type="button"
                onClick={() => updateField('proficiencyBonus', levelBonus)}
                className="font-semibold text-red-700 hover:text-red-900 underline"
              >
                Use {formatModifier(levelBonus)}
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <input
            type="checkbox"
            id="inspiration"
            checked={formData.inspiration || false}
            onChange={(e) => updateField('inspiration', e.target.checked)}
            className="w-5 h-5 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
          />
          <label htmlFor="inspiration" className="text-sm font-semibold text-stone-700">
            Inspiration
          </label>
        </div>
      </div>

      {/* Ability Scores */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-4">Ability Scores</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ability) => {
            const abilityData = formData.stats?.[ability] || { score: 10, modifier: 0 };
            const error = errors[`stats.${ability}`];

            // Determine circle style and text color
            const circleStyle = isCustomColor
              ? { background: `linear-gradient(to bottom right, ${customColorHex}, ${customColorHex}dd)` }
              : {};
            const circleClasses = isCustomColor
              ? 'w-12 h-12 rounded-full flex items-center justify-center shadow-lg border-2'
              : `w-12 h-12 rounded-full bg-linear-to-br/srgb ${selectedColor.from} ${selectedColor.to} flex items-center justify-center shadow-lg border-2`;

            // Determine border color based on theme
            const borderColor = isCustomColor ? customColorHex : selectedColor.hex;
            const borderStyle = { borderColor: borderColor };

            // Determine text color based on background luminance
            const textColor = isCustomColor
              ? (shouldUseWhiteText(customColorHex) ? 'text-white' : 'text-stone-900')
              : 'text-white';

            return (
              <div key={ability} className="flex flex-col items-center space-y-1">
                <div className="text-xs font-semibold text-stone-600 uppercase tracking-wide">
                  {ability.slice(0, 3)}
                </div>
                <div className={circleClasses} style={{ ...circleStyle, ...borderStyle }}>
                  <span className={`text-xl font-bold ${textColor}`}>
                    {formatModifier(abilityData.modifier)}
                  </span>
                </div>
                <NumberField
min={1}
                  max={30}
                  value={abilityData.score}
                  onChange={(v: number) => updateField(`stats.${ability}.score`, v)
                  }
                  className={`w-16 px-2 py-1 text-center font-semibold border-2 ${
                    error ? 'border-red-500' : 'border-stone-300'
                  } rounded focus:outline-hidden focus:ring-2 focus:ring-red-500`}
                fallback={10}
                />
                {error && <div className="text-xs text-red-600">{error}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Saving Throws */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-1">Saving Throws</h3>
        <p className="text-xs text-stone-500 mb-3">
          Worked out from your ability scores and proficiency. Use the box beside each one for
          anything else that adds to it, such as Aura of Protection or a Ring of Protection.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ability) => {
            const saveData = formData.savingThrows?.[ability] || { proficient: false, bonus: 0 };
            return (
              <div key={ability} className="flex items-center justify-between p-2 hover:bg-stone-100 rounded-sm">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`save-${ability}`}
                    checked={saveData.proficient}
                    onChange={(e) =>
                      updateField(`savingThrows.${ability}.proficient`, e.target.checked)
                    }
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                  />
                  <label htmlFor={`save-${ability}`} className="text-sm font-medium text-stone-800 capitalize">
                    {ability}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <NumberField
                    value={saveData.otherBonus ?? 0}
                    onChange={(v: number) => updateField(`savingThrows.${ability}.otherBonus`, v)}
                    aria-label={`Other bonus to ${ability.charAt(0).toUpperCase() + ability.slice(1)} saves`}
                    title="Other bonus"
                    className="w-12 px-1 py-0.5 text-xs border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    fallback={0}
                  />
                  <span className={`w-8 text-right text-sm font-semibold ${saveData.proficient ? 'text-red-700' : 'text-stone-600'}`}>
                    {formatModifier(saveData.bonus)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-1">Skills</h3>
        <p className="text-xs text-stone-500 mb-3">
          Worked out from your ability scores, proficiency and expertise. Use the box beside each
          one for anything else that adds to it, such as Jack of All Trades or a magic item.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {(Object.keys(SKILL_ABILITIES) as (keyof DnD5eSkills)[]).map((skill) => {
            const skillData = formData.skills?.[skill] || { proficient: false, expertise: false, bonus: 0 };
            const skillLabel = skill
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (str) => str.toUpperCase())
              .trim();
            const ability = SKILL_ABILITIES[skill];
            const abilityAbbr = ability.slice(0, 3).toUpperCase();

            return (
              <div key={skill} className="flex items-center justify-between p-2 hover:bg-stone-100 rounded-sm">
                <div className="flex items-center space-x-2">
                  {/* Proficiency Checkbox */}
                  <input
                    type="checkbox"
                    id={`skill-prof-${skill}`}
                    checked={skillData.proficient}
                    onChange={(e) => {
                      updateField(`skills.${skill}.proficient`, e.target.checked);
                      // If unchecking proficiency, also uncheck expertise
                      if (!e.target.checked) {
                        updateField(`skills.${skill}.expertise`, false);
                      }
                    }}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                  />
                  {/* Expertise Checkbox (double circle) */}
                  <input
                    type="checkbox"
                    id={`skill-exp-${skill}`}
                    checked={skillData.expertise}
                    disabled={!skillData.proficient}
                    onChange={(e) => updateField(`skills.${skill}.expertise`, e.target.checked)}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-full focus:ring-2 focus:ring-red-500 disabled:opacity-30"
                    title="Expertise (double proficiency)"
                  />
                  <label
                    htmlFor={`skill-prof-${skill}`}
                    className="text-sm font-medium text-stone-800 cursor-pointer"
                  >
                    {skillLabel}
                    <span className="text-xs text-stone-500 ml-1">({abilityAbbr})</span>
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <NumberField
                    value={skillData.otherBonus ?? 0}
                    onChange={(v: number) => updateField(`skills.${skill}.otherBonus`, v)}
                    aria-label={`Other bonus to ${skillLabel}`}
                    title="Other bonus"
                    className="w-12 px-1 py-0.5 text-xs border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    fallback={0}
                  />
                  <span
                    className={`w-8 text-right text-sm font-semibold ${
                      skillData.expertise
                        ? 'text-purple-700'
                        : skillData.proficient
                        ? 'text-red-700'
                        : 'text-stone-600'
                    }`}
                  >
                    {formatModifier(skillData.bonus)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills of your own.
          Tool proficiencies mostly: "proficiency with a tool allows you to add
          your proficiency bonus to any ability check you make using that tool"
          (Basic Rules p. 51). Same arithmetic as a skill, so the bonus is
          derived here too rather than typed in. */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-semibold text-stone-800">Your Own Skills</h3>
          <button
            type="button"
            onClick={() =>
              updateField('customSkills', [
                ...(formData.customSkills || []),
                { name: '', ability: 'dexterity', proficient: true, expertise: false },
              ])
            }
            disabled={listIsFull(formData.customSkills, DND5E_CUSTOM_SKILLS_MAX)}
            className={`px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors ${ADD_BUTTON_OFF}`}
          >
            + Add Skill
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.customSkills, DND5E_CUSTOM_SKILLS_MAX)} max={DND5E_CUSTOM_SKILLS_MAX} />
        <p className="text-xs text-stone-500 mb-3">
          Tool proficiencies, or anything your table made up. Pick the ability it uses
          and the bonus is worked out for you.
        </p>

        <div className="space-y-2">
          {(formData.customSkills || []).map((custom, index) => {
            const bonus = dnd5eCustomSkillBonus(formData, {
              name: custom.name,
              ability: custom.ability,
              proficient: !!custom.proficient,
              expertise: !!custom.expertise,
              ...(custom.otherBonus !== undefined ? { otherBonus: custom.otherBonus } : {}),
            });

            return (
              <div key={index} className="flex flex-wrap items-center gap-2 bg-white border border-stone-300 rounded-lg p-2">
                <input
                  type="text"
                  value={custom.name || ''}
                  onChange={(e) => updateField(`customSkills.${index}.name`, e.target.value)}
                  placeholder="e.g. Thieves' Tools"
                  aria-label={`Name of skill ${index + 1}`}
                  maxLength={60}
                  className="flex-1 min-w-36 px-2 py-1 text-sm border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />

                <select
                  value={custom.ability}
                  onChange={(e) => updateField(`customSkills.${index}.ability`, e.target.value)}
                  aria-label={`Ability used by ${custom.name || 'this skill'}`}
                  className="px-2 py-1 text-sm border border-stone-300 rounded-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-red-500"
                >
                  {DND5E_ABILITY_NAMES.map((ability) => (
                    <option key={ability} value={ability}>
                      {ability.slice(0, 3).toUpperCase()}
                    </option>
                  ))}
                </select>

                <label className="flex items-center gap-1 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={!!custom.proficient}
                    onChange={(e) => {
                      updateField(`customSkills.${index}.proficient`, e.target.checked);
                      if (!e.target.checked) {
                        updateField(`customSkills.${index}.expertise`, false);
                      }
                    }}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                  />
                  Prof
                </label>

                <label className="flex items-center gap-1 text-xs text-stone-700">
                  <input
                    type="checkbox"
                    checked={!!custom.expertise}
                    disabled={!custom.proficient}
                    onChange={(e) => updateField(`customSkills.${index}.expertise`, e.target.checked)}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-full focus:ring-2 focus:ring-red-500 disabled:opacity-30"
                    title="Expertise (double proficiency)"
                  />
                  Exp
                </label>

                <div className="flex items-center gap-1">
                  <label htmlFor={`custom-skill-${index}-other`} className="text-xs text-stone-500">Other</label>
                  <NumberField
                    id={`custom-skill-${index}-other`}
                    aria-label={`Other bonus to ${custom.name || `skill ${index + 1}`}`}
                    min={MIN_BONUS_OVERRIDE}
                    max={MAX_BONUS_OVERRIDE}
                    value={custom.otherBonus ?? 0}
                    onChange={(v: number) => updateField(`customSkills.${index}.otherBonus`, v)}
                    className="w-14 px-1 py-1 text-sm border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    fallback={0}
                  />
                </div>

                <span
                  className={`text-sm font-semibold w-10 text-right ${
                    custom.expertise ? 'text-purple-700' : custom.proficient ? 'text-red-700' : 'text-stone-600'
                  }`}
                >
                  {formatModifier(bonus)}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    updateField(
                      'customSkills',
                      (formData.customSkills || []).filter((_, i) => i !== index)
                    )
                  }
                  aria-label={`Remove ${custom.name || 'skill'}`}
                  className="px-2 text-red-600 hover:text-red-800 font-bold"
                >
                  ×
                </button>
              </div>
            );
          })}

          {(formData.customSkills || []).length === 0 && (
            <p className="text-sm text-stone-500 italic">None yet</p>
          )}
        </div>
      </div>

      {/* Passive Perception — derived from the Perception bonus plus anything
          that is not the skill itself, never from the stored field, so this
          matches the view exactly. */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-2">Passive Perception</h3>
        <div className="flex items-end gap-4">
          <div className="text-2xl font-bold text-stone-800">
            {passiveScore(
              (formData.skills?.perception?.bonus ?? 0) + (formData.passivePerceptionBonus ?? 0)
            )}
          </div>
          <div>
            <label htmlFor="passive-perception-other-bonus" className="block text-xs font-semibold text-stone-600 mb-1">
              Other bonus
            </label>
            <NumberField
              id="passive-perception-other-bonus"
              aria-label="Other bonus to passive Perception"
              min={MIN_BONUS_OVERRIDE}
              max={MAX_BONUS_OVERRIDE}
              value={formData.passivePerceptionBonus ?? 0}
              onChange={(v: number) => updateField('passivePerceptionBonus', v)}
              className="w-20 px-2 py-1 border border-stone-300 rounded-sm text-center font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
              fallback={0}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          10 + your Perception bonus, plus anything that raises passive scores
          without changing the skill — the Observant feat (+5), for instance.
        </p>
      </div>
    </div>
  );

  // The 5e conditions, shared with the token editor so the two cannot drift.
  //
  // Exhaustion is left out of the checkboxes here because this sheet tracks it
  // properly, in its six levels, just below. A tick box beside the level picker
  // would be the same fact recorded twice and free to disagree with itself. The
  // token editor keeps it in its list, since a token has no level to track.
  const conditions = DND5E_CONDITIONS.filter((c) => c !== 'Exhausted');

  // Render Combat tab
  const renderCombatTab = () => (
    <div className="space-y-6">
      {/* Combat Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="dnd5e-armor-class" className="block text-sm font-semibold text-stone-700 mb-1">Armor Class</label>
          <NumberField
            id="dnd5e-armor-class"
            min={1}
            value={formData.armorClass}
            onChange={(v: number) => updateField('armorClass', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
          fallback={10}
          />
          {fieldError('armorClass')}
        </div>
        <div>
          {/* Derived, not typed. Initiative is the Dexterity modifier plus the
              "Other bonus" below — it used to be a single hand-typed number
              that nothing kept in step with Dexterity, and that the roll then
              ignored entirely. */}
          <div id="dnd5e-initiative-label" className="block text-sm font-semibold text-stone-700 mb-1">Initiative</div>
          <output
            aria-labelledby="dnd5e-initiative-label"
            className="block w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold bg-stone-100 text-stone-800"
            title={`Dexterity ${formatModifier(formData.stats?.dexterity?.modifier ?? 0)}${
              formData.initiativeBonus ? `, other ${formatModifier(formData.initiativeBonus)}` : ''
            }`}
          >
            {formatModifier(initiativeModifier)}
          </output>
        </div>
        <div>
          <label htmlFor="dnd5e-speed" className="block text-sm font-semibold text-stone-700 mb-1">Speed (ft)</label>
          <NumberField
            id="dnd5e-speed"
            min={0}
            value={formData.speed}
            onChange={(v: number) => updateField('speed', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
          fallback={30}
          />
        </div>
      </div>

      {/* Everything that is not Dexterity. Kept as one box rather than a list of
          toggles because the sources are open-ended — the Alert feat's +5, Jack
          of All Trades and Remarkable Athlete's share of the proficiency bonus,
          subclasses that swap in Wisdom or Intelligence. */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor="initiative-other-bonus" className="block text-sm font-semibold text-stone-700 mb-1">
            Initiative — other bonus
          </label>
          <NumberField
            id="initiative-other-bonus"
            min={MIN_BONUS_OVERRIDE}
            max={MAX_BONUS_OVERRIDE}
            value={formData.initiativeBonus ?? 0}
            onChange={(v: number) => updateField('initiativeBonus', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={0}
          />
          <p className="mt-1 text-xs text-stone-500">
            Alert (+5), Jack of All Trades, Remarkable Athlete, and anything else
            beyond your Dexterity modifier.
          </p>
        </div>
      </div>

      {/* Hit Points */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Hit Points</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="dnd5e-hp-maximum" className="block text-xs font-semibold text-stone-600 mb-1">Maximum</label>
            <NumberField
              id="dnd5e-hp-maximum"
              aria-label="Maximum hit points"
              min={1}
              value={formData.hp?.maximum}
              onChange={(v: number) => updateField('hp.maximum', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={1}
            />
            {fieldError('hp.maximum')}
          </div>
          <div>
            <label htmlFor="dnd5e-hp-current" className="block text-xs font-semibold text-stone-600 mb-1">Current</label>
            <NumberField
              id="dnd5e-hp-current"
              aria-label="Current hit points"
              min={0}
              value={formData.hp?.current}
              onChange={(v: number) => updateField('hp.current', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold text-red-700 focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={0}
            />
          </div>
          <div>
            <label htmlFor="dnd5e-hp-temporary" className="block text-xs font-semibold text-stone-600 mb-1">Temporary</label>
            <NumberField
              id="dnd5e-hp-temporary"
              aria-label="Temporary hit points"
              min={0}
              value={formData.hp?.temporary}
              onChange={(v: number) => updateField('hp.temporary', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold text-blue-700 focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={0}
            />
          </div>
        </div>
      </div>

      {/* Hit Dice */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-stone-800">Hit Dice</h3>
          <button
            onClick={() => {
              const newHitDice = [
                ...(formData.hitDice || []),
                newRow({ class: formData.class || '', die: 'd6', maximum: 1, remaining: 1 }),
              ];
              updateField('hitDice', newHitDice);
            }}
            disabled={listIsFull(formData.hitDice)}
            className={`px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors ${ADD_BUTTON_OFF}`}
          >
            + Add Hit Die
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.hitDice)} />
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_0.75rem_3.5rem_1.75rem] gap-2 items-center mb-1">
          <span aria-hidden="true" className="text-xs font-semibold text-stone-600">Class</span>
          <span aria-hidden="true" className="text-xs font-semibold text-stone-600 text-center">Die</span>
          <span aria-hidden="true" className="text-xs font-semibold text-stone-600 text-center">Left</span>
          <span aria-hidden="true" />
          <span aria-hidden="true" className="text-xs font-semibold text-stone-600 text-center">Max</span>
          <span aria-hidden="true" />
        </div>
        <div className="space-y-2">
          {(formData.hitDice || []).map((die, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_5.5rem_3.5rem_0.75rem_3.5rem_1.75rem] gap-2 items-center">
              <input
                type="text"
                value={die.class || ''}
                onChange={(e) => updateField(`hitDice.${index}.class`, e.target.value)}
                placeholder="Fighter"
                aria-label={`Class of hit dice ${index + 1}`}
                maxLength={SHEET_SHORT_TEXT_MAX}
                aria-invalid={!!errors[`hitDice.${index}.class`]}
                className="min-w-0 px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
              <input
                type="text"
                value={die.die ?? (die.total ? hitDieExpression(die) ?? '' : '')}
                onChange={(e) => updateField(`hitDice.${index}.die`, e.target.value)}
                placeholder="d10"
                aria-label="Hit die"
                maxLength={50}
                title="One hit die — d10 for a fighter. Something like 2d6 works too if your game uses it."
                className="min-w-0 px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
              <NumberField
                min={0}
                value={die.remaining}
                onChange={(v: number) => updateField(`hitDice.${index}.remaining`, v)}
                aria-label="Hit dice left"
                title="How many are unspent right now"
                className="min-w-0 px-1 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                fallback={0}
              />
              <span className="text-stone-400 select-none" aria-hidden="true">/</span>
              <NumberField
                min={0}
                value={die.maximum ?? hitDiceMaximum(die) ?? 0}
                onChange={(v: number) => updateField(`hitDice.${index}.maximum`, v)}
                aria-label="Hit dice at full"
                title="How many this pool holds when nothing is spent"
                className="min-w-0 px-1 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                fallback={0}
              />
              <button
                onClick={() => {
                  const newHitDice = formData.hitDice!.filter((_, i) => i !== index);
                  updateField('hitDice', newHitDice);
                }}
                aria-label={`Remove ${die.class || 'this'} hit dice`}
                title="Remove"
                className="text-red-600 hover:text-red-800 font-bold leading-none"
              >
                ×
              </button>
              {errors[`hitDice.${index}.class`] && (
                <p className="col-span-6 text-xs text-red-600">{errors[`hitDice.${index}.class`]}</p>
              )}
            </div>
          ))}
          {(!formData.hitDice || formData.hitDice.length === 0) && (
            <div className="text-sm text-stone-500 italic">
              No hit dice yet. Add one for each class you have levels in.
            </div>
          )}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          One row per class. <strong>Die</strong> is a single hit die — a fighter's is
          d10 — and <strong>Max</strong> is how many of them you have at your level.{' '}
          <strong>Left</strong> counts down as you spend them on a short rest.
        </p>
      </div>

      {/* Death Saves */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Death Saves</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-green-700 mb-2">Successes</label>
            <div className="flex space-x-2">
              {[1, 2, 3].map((i) => (
                <input
                  key={`success-${i}`}
                  type="checkbox"
                  aria-label={`Death save success ${i}`}
                  checked={(formData.deathSaves?.successes || 0) >= i}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField('deathSaves.successes', i);
                    } else {
                      updateField('deathSaves.successes', i - 1);
                    }
                  }}
                  className="w-6 h-6 text-green-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-green-500"
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-red-700 mb-2">Failures</label>
            <div className="flex space-x-2">
              {[1, 2, 3].map((i) => (
                <input
                  key={`failure-${i}`}
                  type="checkbox"
                  aria-label={`Death save failure ${i}`}
                  checked={(formData.deathSaves?.failures || 0) >= i}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField('deathSaves.failures', i);
                    } else {
                      updateField('deathSaves.failures', i - 1);
                    }
                  }}
                  className="w-6 h-6 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Conditions */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Conditions</h3>
        <div className="grid grid-cols-3 gap-2">
          {conditions.map((condition) => (
            <label key={condition} className="flex items-center space-x-2 cursor-pointer hover:bg-stone-100 p-1 rounded-sm">
              <input
                type="checkbox"
                checked={(formData.conditions || []).includes(condition.toLowerCase())}
                onChange={(e) => {
                  const currentConditions = formData.conditions || [];
                  if (e.target.checked) {
                    updateField('conditions', [...currentConditions, condition.toLowerCase()]);
                  } else {
                    updateField('conditions', currentConditions.filter((c: string) => c !== condition.toLowerCase()));
                  }
                }}
                className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
              />
              <span className="text-sm text-stone-700">{condition}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Exhaustion.
          Basic Rules, Appendix A: six cumulative levels, not something you
          either have or do not. It used to be one checkbox in the list above,
          which could not tell disadvantage on ability checks apart from death. */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-1">Exhaustion</h3>
        <p className="text-xs text-stone-600 mb-3">
          Six levels, and each one carries every level below it. A long rest with food
          and drink removes one.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {[0, 1, 2, 3, 4, 5, 6].map((level) => {
            const active = exhaustion === level;
            return (
              <button
                key={level}
                onClick={() => updateField('exhaustionLevel', level)}
                aria-label={level === 0 ? 'No exhaustion' : `Exhaustion level ${level}`}
                aria-pressed={active}
                className={`px-3 py-1 rounded-cozy border text-sm transition-all ${
                  active
                    ? 'bg-red-700 text-white border-red-800 font-semibold'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-100'
                }`}
              >
                {level === 0 ? 'None' : level}
              </button>
            );
          })}
        </div>
        {exhaustionEffects(exhaustion).length > 0 && (
          <ul className="text-sm text-stone-700 space-y-0.5">
            {exhaustionEffects(exhaustion).map((effect, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-red-600">•</span>
                <span>
                  <span className="text-stone-500 mr-1">{idx + 1}.</span>
                  {effect}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Attacks */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-stone-800">Attacks & Spellcasting</h3>
          <button
            onClick={() => {
              const newAttacks = [
                ...(formData.attacks || []),
                newRow({ name: '', attackBonus: 0, damageRoll: '', damageType: '', range: 0, properties: [], notes: '' }),
              ];
              updateField('attacks', newAttacks);
            }}
            disabled={listIsFull(formData.attacks)}
            className={`px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors ${ADD_BUTTON_OFF}`}
          >
            + Add Attack
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.attacks)} />
        <div className="space-y-4">
          {(formData.attacks || []).map((attack, index) => (
            <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <input
                  type="text"
                  value={attack.name || ''}
                  onChange={(e) => updateField(`attacks.${index}.name`, e.target.value)}
                  placeholder="Attack Name"
                  aria-label={`Name of attack ${index + 1}`}
                  maxLength={SHEET_SHORT_TEXT_MAX}
                  aria-invalid={!!errors[`attacks.${index}.name`]}
                  className="flex-1 px-2 py-1 border border-stone-300 rounded-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={() => {
                    const newAttacks = formData.attacks!.filter((_, i) => i !== index);
                    updateField('attacks', newAttacks);
                    removeCustomPropertyDraft(index);
                  }}
                  className="ml-2 px-2 py-1 text-red-600 hover:text-red-800 font-bold"
                >
                  ×
                </button>
              </div>
              {fieldError(`attacks.${index}.name`)}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`attack-${index}-bonus`} className="block text-xs font-semibold text-stone-600 mb-1">Attack Bonus</label>
                  <NumberField
                    id={`attack-${index}-bonus`}
                    value={attack.attackBonus}
                    onChange={(v: number) => updateField(`attacks.${index}.attackBonus`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
                <div>
                  <label htmlFor={`attack-${index}-damage`} className="block text-xs font-semibold text-stone-600 mb-1">Damage Roll</label>
                  <input
                    id={`attack-${index}-damage`}
                    type="text"
                    value={attack.damageRoll || ''}
                    onChange={(e) => updateField(`attacks.${index}.damageRoll`, e.target.value)}
                    placeholder="e.g., 1d8+3"
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label htmlFor={`attack-${index}-damage-type`} className="block text-xs font-semibold text-stone-600 mb-1">Damage Type</label>
                  <input
                    id={`attack-${index}-damage-type`}
                    type="text"
                    value={attack.damageType || ''}
                    onChange={(e) => updateField(`attacks.${index}.damageType`, e.target.value)}
                    placeholder="e.g., slashing"
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label htmlFor={`attack-${index}-range`} className="block text-xs font-semibold text-stone-600 mb-1">Range (ft)</label>
                  <NumberField
                    id={`attack-${index}-range`}
                    min={0}
                    value={attack.range}
                    onChange={(v: number) => updateField(`attacks.${index}.range`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
              </div>
              {/* Properties.
                  These draw as badges on the read-only sheet, but until now
                  only the built-in templates could set them — the editor's only
                  offer was a note reading "e.g., Versatile, Finesse", which
                  stored prose nothing could read. */}
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Properties</label>
                <div className="flex flex-wrap gap-1.5">
                  {DND5E_WEAPON_PROPERTIES.map((property) => {
                    const on = hasWeaponProperty(attack.properties || [], property);
                    return (
                      <button
                        key={property}
                        type="button"
                        aria-pressed={on}
                        disabled={!on && propertiesFull(attack.properties)}
                        onClick={() =>
                          updateField(
                            `attacks.${index}.properties`,
                            toggleWeaponProperty(attack.properties || [], property)
                          )
                        }
                        className={`px-2 py-0.5 text-xs rounded-full border capitalize transition-colors ${ADD_BUTTON_OFF} ${
                          on
                            ? 'bg-red-700 border-red-700 text-white'
                            : 'bg-white border-stone-300 text-stone-600 hover:border-red-400'
                        }`}
                      >
                        {property}
                      </button>
                    );
                  })}
                </div>
                {/* Anything the rules do not name — homebrew, or whatever an
                    import brought in. Shown so it is visible and removable
                    rather than silently kept. */}
                {customWeaponProperties(attack.properties || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {customWeaponProperties(attack.properties || []).map((property) => (
                      <button
                        key={property}
                        type="button"
                        onClick={() =>
                          updateField(
                            `attacks.${index}.properties`,
                            toggleWeaponProperty(attack.properties || [], property)
                          )
                        }
                        title={`Remove "${property}"`}
                        className="px-2 py-0.5 text-xs rounded-full border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      >
                        {property} ×
                      </button>
                    ))}
                  </div>
                )}
                {/* The eleven are the common case, not the limit. A homebrew
                    game may name any number more, and both storage and the
                    sheet's badges have always allowed them. */}
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={customPropertyDrafts[index] ?? ''}
                    onChange={(e) =>
                      setCustomPropertyDrafts((prev) => ({ ...prev, [index]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitCustomProperty(index, attack.properties || []);
                      }
                    }}
                    maxLength={MAX_WEAPON_PROPERTY_LENGTH}
                    placeholder="Add your own property"
                    aria-label="Add a custom weapon property"
                    className="flex-1 px-2 py-1 text-sm border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => commitCustomProperty(index, attack.properties || [])}
                    disabled={propertiesFull(attack.properties)}
                    className={`px-3 py-1 text-sm font-medium text-red-700 hover:text-red-900 ${ADD_BUTTON_OFF}`}
                  >
                    Add
                  </button>
                </div>
                <ListLimitNote full={propertiesFull(attack.properties)} max={DND5E_WEAPON_PROPERTIES_MAX} />
              </div>
              {/* Further damage lines.
                  A spear is 1d6 in one hand and 1d8 in two; one damage box
                  cannot say that, so the two-handed die used to be typed into
                  the note where nothing could roll it. */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-stone-600">
                    Other Damage Rolls
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField(`attacks.${index}.additionalDamage`, [
                        ...(attack.additionalDamage || []),
                        { label: '', damageRoll: '', damageType: '' },
                      ])
                    }
                    disabled={listIsFull(attack.additionalDamage, DND5E_ATTACK_DAMAGE_ROLLS_MAX)}
                    className={`px-2 py-0.5 text-xs font-medium text-red-700 hover:text-red-900 ${ADD_BUTTON_OFF}`}
                  >
                    + Add Damage Roll
                  </button>
                </div>
                <ListLimitNote
                  full={listIsFull(attack.additionalDamage, DND5E_ATTACK_DAMAGE_ROLLS_MAX)}
                  max={DND5E_ATTACK_DAMAGE_ROLLS_MAX}
                />
                {(attack.additionalDamage || []).map((entry, dmgIndex) => (
                  <div key={dmgIndex} className="flex gap-2 mb-1">
                    <input
                      type="text"
                      value={entry.label || ''}
                      onChange={(e) =>
                        updateField(
                          `attacks.${index}.additionalDamage.${dmgIndex}.label`,
                          e.target.value
                        )
                      }
                      placeholder="When (e.g. Two-handed)"
                      aria-label={`When damage roll ${dmgIndex + 1} applies`}
                      maxLength={60}
                      className="flex-1 px-2 py-1 text-sm border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="text"
                      value={entry.damageRoll || ''}
                      onChange={(e) =>
                        updateField(
                          `attacks.${index}.additionalDamage.${dmgIndex}.damageRoll`,
                          e.target.value
                        )
                      }
                      placeholder="1d10+3"
                      aria-label={`Damage roll ${dmgIndex + 1}`}
                      maxLength={60}
                      className="w-28 px-2 py-1 text-sm border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      type="text"
                      value={entry.damageType || ''}
                      onChange={(e) =>
                        updateField(
                          `attacks.${index}.additionalDamage.${dmgIndex}.damageType`,
                          e.target.value
                        )
                      }
                      placeholder="slashing"
                      aria-label={`Damage type of roll ${dmgIndex + 1}`}
                      maxLength={40}
                      className="w-28 px-2 py-1 text-sm border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateField(
                          `attacks.${index}.additionalDamage`,
                          (attack.additionalDamage || []).filter((_, i) => i !== dmgIndex)
                        )
                      }
                      aria-label={`Remove damage roll ${dmgIndex + 1}`}
                      className="px-2 text-red-600 hover:text-red-800 font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <label htmlFor={`attack-${index}-notes`} className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
                <input
                  id={`attack-${index}-notes`}
                  type="text"
                  value={attack.notes || ''}
                  onChange={(e) => updateField(`attacks.${index}.notes`, e.target.value)}
                  placeholder="e.g., silvered, returns when thrown"
                  className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          ))}
          {(!formData.attacks || formData.attacks.length === 0) && (
            <div className="text-sm text-stone-500 italic">No attacks added yet</div>
          )}
        </div>
      </div>
    </div>
  );

  // Render Spells tab
  // The cantrips box as typed. It holds a string while the sheet is open and
  // becomes a list when it is saved.
  const cantripsText =
    typeof formData.spellcasting?.cantrips === 'string'
      ? formData.spellcasting.cantrips
      : (formData.spellcasting?.cantrips || []).join(', ');

  const renderSpellsTab = () => (
    <div className="space-y-6">
      {/* Spellcasting class and ability */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-1">Spellcasting Class</label>
          <input
            type="text"
            value={formData.spellcasting?.class || ''}
            onChange={(e) => updateField('spellcasting.class', e.target.value)}
            placeholder="e.g., Wizard — leave blank if you don't cast"
            aria-label="Spellcasting Class"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          />
          <p className="mt-1 text-xs text-stone-600">
            Shown as the heading on your sheet. There was no field for this, so every
            character read &quot;Wizard Spellcasting&quot; whatever they were.
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-1">Spellcasting Ability</label>
          <input
            type="text"
            value={formData.spellcasting?.ability || ''}
            onChange={(e) => updateField('spellcasting.ability', e.target.value)}
            placeholder="e.g., Intelligence"
            aria-label="Spellcasting Ability"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Save DC and attack bonus, both derived. Basic Rules, "Spellcasting
          Ability": DC is 8 + proficiency + ability modifier, attack is the same
          without the 8. Each keeps a manual box for the things that change it
          without changing either input — and they are separate, because a Wand
          of the War Mage raises the attack roll and not the DC. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
          <div id="dnd5e-spell-dc-label" className="block text-sm font-semibold text-stone-700 mb-1">Spell Save DC</div>
          <output
            aria-labelledby="dnd5e-spell-dc-label"
            className="block w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-center text-xl font-bold text-stone-800"
            title={`8 + proficiency ${formatModifier(formData.proficiencyBonus ?? 0)} + ability ${formatModifier(spellAbilityModifier)}`}
          >
            {spellSaveDC}
          </output>
          <label className="block text-xs font-semibold text-stone-600 mt-2 mb-1">Other bonus</label>
          <NumberField
            min={dcOtherBonusMin}
            max={MAX_BONUS_OVERRIDE}
            value={formData.spellcasting?.spellSaveDCOtherBonus}
            onChange={(v: number) => updateField('spellcasting.spellSaveDCOtherBonus', v)}
            aria-label="Spell save DC other bonus"
            className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={0}
          />
          {fieldError('spellcasting.spellSaveDCOtherBonus')}
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
          <div id="dnd5e-spell-attack-label" className="block text-sm font-semibold text-stone-700 mb-1">Spell Attack Bonus</div>
          <output
            aria-labelledby="dnd5e-spell-attack-label"
            className="block w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-center text-xl font-bold text-stone-800"
            title={`proficiency ${formatModifier(formData.proficiencyBonus ?? 0)} + ability ${formatModifier(spellAbilityModifier)}`}
          >
            {formatModifier(spellAttackBonus)}
          </output>
          <label className="block text-xs font-semibold text-stone-600 mt-2 mb-1">Other bonus</label>
          <NumberField
            min={MIN_BONUS_OVERRIDE}
            max={MAX_BONUS_OVERRIDE}
            value={formData.spellcasting?.spellAttackOtherBonus}
            onChange={(v: number) => updateField('spellcasting.spellAttackOtherBonus', v)}
            aria-label="Spell attack other bonus"
            className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
            fallback={0}
          />
        </div>
      </div>
      <p className="text-xs text-stone-600">
        Both are worked out from your proficiency bonus and spellcasting ability. Use
        &quot;Other bonus&quot; for anything else that changes them — a Rod of the Pact
        Keeper, a Robe of the Archmagi. They are separate because some items raise only one.
      </p>

      {/* Cantrips */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Cantrips</h3>
        <textarea
          value={cantripsText}
          onChange={(e) => {
            // The box is turned into a list when the sheet is saved, so the
            // count is held to the limit here, as a list's add button is.
            if (!listChangeAllowed(parseCommaSeparated(e.target.value).length, parseCommaSeparated(cantripsText).length)) {
              setCantripsTurnedAway(true);
              return;
            }
            setCantripsTurnedAway(false);
            updateField('spellcasting.cantrips', e.target.value);
          }}
          placeholder="Enter cantrips separated by commas (e.g., Fire Bolt, Mage Hand, Prestidigitation)"
          aria-label="Cantrips"
          rows={2}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
        />
        <ListLimitNote full={cantripsTurnedAway || parseCommaSeparated(cantripsText).length >= SHEET_LIST_MAX} />
      </div>

      {/* Spell Slots */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Spell Slots</h3>
        <div className="grid grid-cols-3 gap-3">
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((level) => {
            const slotData = formData.spellcasting?.slots?.[level] || { total: 0, expended: 0 };
            return (
              <div key={level} className="bg-white border border-stone-300 rounded-lg p-3">
                <div className="text-sm font-semibold text-stone-700 mb-2 text-center">Level {level}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`spell-slots-${level}-total`} className="block text-xs text-stone-600 mb-1">Total</label>
                    <NumberField
                      id={`spell-slots-${level}-total`}
                      min={0}
                      max={SPELL_SLOTS_MAX}
                      value={slotData.total}
                      onChange={(v: number) => updateField(`spellcasting.slots.${level}.total`, v)}
                      className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                      fallback={0}
                    />
                  </div>
                  <div>
                    <label htmlFor={`spell-slots-${level}-used`} className="block text-xs text-stone-600 mb-1">Used</label>
                    {/* Shown no higher than the total. The stored count is
                        brought down on save, so typing a new total digit by
                        digit does not lose it. */}
                    <NumberField
                      id={`spell-slots-${level}-used`}
                      min={0}
                      max={slotData.total}
                      value={Math.min(slotData.expended, slotData.total)}
                      onChange={(v: number) => updateField(`spellcasting.slots.${level}.expended`, v)}
                      className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                      fallback={0}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spells List */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-stone-800">Spells</h3>
          <button
            onClick={() => {
              const newSpells = [
                ...(formData.spellcasting?.spells || []),
                newRow({ level: 1, name: '', prepared: false, ritual: false, concentration: false }),
              ];
              updateField('spellcasting.spells', newSpells);
            }}
            disabled={listIsFull(formData.spellcasting?.spells)}
            className={`px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors ${ADD_BUTTON_OFF}`}
          >
            + Add Spell
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.spellcasting?.spells)} />
        <div className="space-y-2">
          {(formData.spellcasting?.spells || []).map((spell, index) => (
            <React.Fragment key={index}>
            <div className="bg-white border border-stone-300 rounded-lg p-3 flex items-center space-x-3">
              <NumberField
min={1}
                max={9}
                value={spell.level}
                onChange={(v: number) => updateField(`spellcasting.spells.${index}.level`, v)}
                className="w-14 px-2 py-1 border border-stone-300 rounded-sm text-center font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-500"
                title="Spell Level"
                aria-label={`Level of spell ${index + 1}`}
              fallback={1}
              />
              <input
                type="text"
                value={spell.name || ''}
                onChange={(e) => updateField(`spellcasting.spells.${index}.name`, e.target.value)}
                placeholder="Spell Name"
                aria-label={`Name of spell ${index + 1}`}
                maxLength={SHEET_SHORT_TEXT_MAX}
                aria-invalid={!!errors[`spellcasting.spells.${index}.name`]}
                className="flex-1 px-2 py-1 border border-stone-300 rounded-sm font-medium focus:outline-hidden focus:ring-2 focus:ring-red-500"
              />
              <label className="flex items-center space-x-1 cursor-pointer" title="Prepared">
                <input
                  type="checkbox"
                  checked={spell.prepared || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.prepared`, e.target.checked)}
                  className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                />
                <span className="text-xs text-stone-600">Prep</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer" title="Ritual">
                <input
                  type="checkbox"
                  checked={spell.ritual || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.ritual`, e.target.checked)}
                  className="w-4 h-4 text-blue-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-stone-600">Rit</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer" title="Concentration">
                <input
                  type="checkbox"
                  checked={spell.concentration || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.concentration`, e.target.checked)}
                  className="w-4 h-4 text-purple-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-xs text-stone-600">Con</span>
              </label>
              <button
                onClick={() => {
                  const newSpells = (formData.spellcasting?.spells ?? []).filter((_, i) => i !== index);
                  updateField('spellcasting.spells', newSpells);
                }}
                className="px-2 py-1 text-red-600 hover:text-red-800 font-bold"
              >
                ×
              </button>
            </div>
            {fieldError(`spellcasting.spells.${index}.name`)}
            </React.Fragment>
          ))}
          {(!formData.spellcasting?.spells || formData.spellcasting.spells.length === 0) && (
            <div className="text-sm text-stone-500 italic">No spells added yet</div>
          )}
        </div>
      </div>
    </div>
  );

  // Render Inventory tab
  const renderInventoryTab = () => (
    <div className="space-y-6">
      {/* Currency */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Currency</h3>
        <div className="grid grid-cols-5 gap-3">
          {([
            { key: 'cp', label: 'Copper (CP)', color: 'text-amber-700' },
            { key: 'sp', label: 'Silver (SP)', color: 'text-stone-500' },
            { key: 'ep', label: 'Electrum (EP)', color: 'text-green-600' },
            { key: 'gp', label: 'Gold (GP)', color: 'text-yellow-600' },
            { key: 'pp', label: 'Platinum (PP)', color: 'text-slate-300' },
          ] as const).map((currency) => (
            <div key={currency.key}>
              <label htmlFor={`currency-${currency.key}`} className={`block text-xs font-semibold ${currency.color} mb-1`}>
                {currency.label}
              </label>
              <NumberField
                id={`currency-${currency.key}`}
                min={0}
                value={formData.currency?.[currency.key]}
                onChange={(v: number) => updateField(`currency.${currency.key}`, v)}
                className="w-full px-2 py-2 border border-stone-300 rounded-lg text-center font-bold focus:outline-hidden focus:ring-2 focus:ring-red-500"
              fallback={0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Inventory Items */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-stone-800">Inventory</h3>
          <button
            onClick={() => {
              const newInventory = [
                ...(formData.inventory || []),
                newRow({
                  name: '',
                  quantity: 1,
                  weight: 0,
                  notes: '',
                  equipped: false,
                  requiresAttunement: false,
                  attuned: false,
                  value: 0,
                }),
              ];
              updateField('inventory', newInventory);
            }}
            disabled={listIsFull(formData.inventory)}
            className={`px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors ${ADD_BUTTON_OFF}`}
          >
            + Add Item
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.inventory)} />
        <div className="space-y-3">
          {(formData.inventory || []).map((item, index) => (
            <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <input
                  type="text"
                  value={item.name || ''}
                  onChange={(e) => updateField(`inventory.${index}.name`, e.target.value)}
                  placeholder="Item Name"
                  aria-label={`Name of item ${index + 1}`}
                  maxLength={SHEET_SHORT_TEXT_MAX}
                  aria-invalid={!!errors[`inventory.${index}.name`]}
                  className="flex-1 px-2 py-1 border border-stone-300 rounded-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={() => {
                    const newInventory = formData.inventory!.filter((_, i) => i !== index);
                    updateField('inventory', newInventory);
                  }}
                  className="ml-2 px-2 py-1 text-red-600 hover:text-red-800 font-bold"
                >
                  ×
                </button>
              </div>
              {fieldError(`inventory.${index}.name`)}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor={`item-${index}-quantity`} className="block text-xs font-semibold text-stone-600 mb-1">Quantity</label>
                  <NumberField
                    id={`item-${index}-quantity`}
                    min={0}
                    value={item.quantity}
                    onChange={(v: number) => updateField(`inventory.${index}.quantity`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  fallback={1}
                  />
                </div>
                <div>
                  <label htmlFor={`item-${index}-weight`} className="block text-xs font-semibold text-stone-600 mb-1">Weight (lb)</label>
                  <NumberField
                    id={`item-${index}-weight`}
                    min={0}
                    step="0.1"
                    // The one genuinely fractional field on the sheet: half a
                    // pound of rations is a real weight.
                    integer={false}
                    value={item.weight}
                    onChange={(v: number) => updateField(`inventory.${index}.weight`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
                <div>
                  <label htmlFor={`item-${index}-value`} className="block text-xs font-semibold text-stone-600 mb-1">Value (gp)</label>
                  <NumberField
                    id={`item-${index}-value`}
                    min={0}
                    value={item.value}
                    onChange={(v: number) => updateField(`inventory.${index}.value`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded-sm text-center focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
              </div>
              <div>
                <label htmlFor={`item-${index}-notes`} className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
                <input
                  id={`item-${index}-notes`}
                  type="text"
                  value={item.notes || ''}
                  onChange={(e) => updateField(`inventory.${index}.notes`, e.target.value)}
                  placeholder="Item description or notes"
                  className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.equipped || false}
                    onChange={(e) => updateField(`inventory.${index}.equipped`, e.target.checked)}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-stone-700">Equipped</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.requiresAttunement || false}
                    onChange={(e) =>
                      // An item that needs no attunement is not attuned, and
                      // would otherwise go on taking one of the three slots.
                      updateField(`inventory.${index}`, {
                        ...item,
                        requiresAttunement: e.target.checked,
                        ...(e.target.checked ? {} : { attuned: false }),
                      })
                    }
                    className="w-4 h-4 text-purple-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-stone-700">Requires Attunement</span>
                </label>
                {/* Also on an item stored attuned without requiring it, so
                    that can be cleared. */}
                {(item.requiresAttunement || item.attuned) && (
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.attuned || false}
                      onChange={(e) => updateField(`inventory.${index}.attuned`, e.target.checked)}
                      className="w-4 h-4 text-purple-700 border-stone-300 rounded-sm focus:ring-2 focus:ring-purple-500"
                    />
                    <span className="text-stone-700">Attuned</span>
                  </label>
                )}
              </div>
            </div>
          ))}
          {(!formData.inventory || formData.inventory.length === 0) && (
            <div className="text-sm text-stone-500 italic">No items in inventory yet</div>
          )}
        </div>
      </div>
    </div>
  );

  /**
   * The four proficiency boxes, as the player typed them.
   *
   * This used to hold a second, separately-written copy of the read-only view's
   * guess-the-category heuristic — with a different list of language names, so
   * the two disagreed about where an entry belonged. Both now read the same
   * function, and neither guesses unless the sheet predates the boxes being
   * stored separately.
   */
  const getProficienciesByCategory = () => readProficiencyGroups(formData);

  // Render Features tab
  const renderFeaturesTab = () => {
    const profs = getProficienciesByCategory();

    return (
      <div className="space-y-6">
        {/* Proficiencies */}
        <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-4">Proficiencies & Training</h3>

          <div className="space-y-4">
            {/* Armor */}
            <div>
              <label htmlFor="dnd5e-proficiencies-armor" className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Armor</label>
              <textarea
                id="dnd5e-proficiencies-armor"
                value={profs.armor}
                onChange={(e) => updateField('proficiencies.armor', e.target.value)}
                placeholder="Light Armor, Medium Armor, Shields"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Weapons */}
            <div>
              <label htmlFor="dnd5e-proficiencies-weapons" className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Weapons</label>
              <textarea
                id="dnd5e-proficiencies-weapons"
                value={profs.weapons}
                onChange={(e) => updateField('proficiencies.weapons', e.target.value)}
                placeholder="Simple Weapons, Martial Weapons, or specific weapons (Daggers, Longswords, Shortbows)"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Tools */}
            <div>
              <label htmlFor="dnd5e-proficiencies-tools" className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Tools</label>
              <textarea
                id="dnd5e-proficiencies-tools"
                value={profs.tools}
                onChange={(e) => updateField('proficiencies.tools', e.target.value)}
                placeholder="Thieves' Tools, Smith's Tools, Calligrapher's Supplies, Musical Instruments, Vehicles (Land/Water)"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Languages */}
            <div>
              <label htmlFor="dnd5e-proficiencies-languages" className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Languages</label>
              <textarea
                id="dnd5e-proficiencies-languages"
                value={profs.languages}
                onChange={(e) => updateField('proficiencies.languages', e.target.value)}
                placeholder="Common, Elvish, Dwarvish, Draconic"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Features & Traits */}
        <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-stone-800">Features &amp; Traits</h3>
            <button
              onClick={() =>
                updateField('featuresAndTraits', [...featureRows, { name: '', description: '' }])
              }
              disabled={listIsFull(featureRows)}
              className={`px-3 py-1 bg-red-600 text-white rounded-sm hover:bg-red-700 text-sm ${ADD_BUTTON_OFF}`}
            >
              + Add Feature
            </button>
          </div>
          <ListLimitNote full={listIsFull(featureRows)} />
          <p className="text-xs text-stone-600 mb-3">
            Class features, racial traits and feats. A description is optional — leave it blank
            for anything that is just a name.
          </p>
          {featureRows.length === 0 ? (
            <p className="text-sm text-stone-500 italic">No features added yet</p>
          ) : (
            <div className="space-y-3">
              {featureRows.map((feature, index) => (
                <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <input
                      type="text"
                      value={feature.name}
                      onChange={(e) =>
                        updateField(
                          'featuresAndTraits',
                          featureRows.map((f, i) =>
                            i === index ? { ...f, name: e.target.value } : f
                          )
                        )
                      }
                      placeholder="Feature name, e.g. Darkvision"
                      aria-label={`Feature ${index + 1} name`}
                      className="flex-1 px-2 py-1 border border-stone-300 rounded-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      onClick={() =>
                        updateField(
                          'featuresAndTraits',
                          featureRows.filter((_, i) => i !== index)
                        )
                      }
                      aria-label={`Remove ${feature.name || 'feature'}`}
                      className="ml-2 px-2 py-1 text-red-600 hover:text-red-800 font-bold"
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    value={feature.description}
                    onChange={(e) =>
                      updateField(
                        'featuresAndTraits',
                        featureRows.map((f, i) =>
                          i === index ? { ...f, description: e.target.value } : f
                        )
                      )
                    }
                    placeholder="Description (optional)"
                    aria-label={`Feature ${index + 1} description`}
                    rows={2}
                    className="w-full px-2 py-1 text-sm border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Features & Traits */}
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">
            <label htmlFor="dnd5e-additional-features">Additional Features & Traits</label>
          </h3>
          <p className="text-xs text-stone-600 mb-3">Detailed descriptions of features, special abilities, or notes</p>
          <textarea
            id="dnd5e-additional-features"
            value={formData.additionalFeaturesAndTraits || ''}
            onChange={(e) => updateField('additionalFeaturesAndTraits', e.target.value)}
            placeholder="Describe any additional features, traits, or special abilities in detail..."
            rows={8}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>
    );
  };

  // Render Biography tab
  const renderBiographyTab = () => (
    <div className="space-y-6">
      {/* Appearance */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Appearance</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="dnd5e-appearance-age" className="block text-xs font-semibold text-stone-600 mb-1">Age</label>
            <input
              id="dnd5e-appearance-age"
              type="text"
              value={formData.appearance?.age || ''}
              onChange={(e) => updateField('appearance.age', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-appearance-height" className="block text-xs font-semibold text-stone-600 mb-1">Height</label>
            <input
              id="dnd5e-appearance-height"
              type="text"
              value={formData.appearance?.height || ''}
              onChange={(e) => updateField('appearance.height', e.target.value)}
              placeholder="e.g., 5'7&quot;"
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-appearance-weight" className="block text-xs font-semibold text-stone-600 mb-1">Weight</label>
            <input
              id="dnd5e-appearance-weight"
              type="text"
              value={formData.appearance?.weight || ''}
              onChange={(e) => updateField('appearance.weight', e.target.value)}
              placeholder="e.g., 130 lbs"
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-appearance-eyes" className="block text-xs font-semibold text-stone-600 mb-1">Eyes</label>
            <input
              id="dnd5e-appearance-eyes"
              type="text"
              value={formData.appearance?.eyes || ''}
              onChange={(e) => updateField('appearance.eyes', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-appearance-skin" className="block text-xs font-semibold text-stone-600 mb-1">Skin</label>
            <input
              id="dnd5e-appearance-skin"
              type="text"
              value={formData.appearance?.skin || ''}
              onChange={(e) => updateField('appearance.skin', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-appearance-hair" className="block text-xs font-semibold text-stone-600 mb-1">Hair</label>
            <input
              id="dnd5e-appearance-hair"
              type="text"
              value={formData.appearance?.hair || ''}
              onChange={(e) => updateField('appearance.hair', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Personality */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Personality</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="dnd5e-personality-traits" className="block text-sm font-semibold text-stone-700 mb-1">Personality Traits</label>
            <textarea
              id="dnd5e-personality-traits"
              value={formData.personality?.traits || ''}
              onChange={(e) => updateField('personality.traits', e.target.value)}
              placeholder="Describe your character's personality traits..."
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-personality-ideals" className="block text-sm font-semibold text-stone-700 mb-1">Ideals</label>
            <textarea
              id="dnd5e-personality-ideals"
              value={formData.personality?.ideals || ''}
              onChange={(e) => updateField('personality.ideals', e.target.value)}
              placeholder="What drives your character? What do they believe in?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-personality-bonds" className="block text-sm font-semibold text-stone-700 mb-1">Bonds</label>
            <textarea
              id="dnd5e-personality-bonds"
              value={formData.personality?.bonds || ''}
              onChange={(e) => updateField('personality.bonds', e.target.value)}
              placeholder="What connections does your character have?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-personality-flaws" className="block text-sm font-semibold text-stone-700 mb-1">Flaws</label>
            <textarea
              id="dnd5e-personality-flaws"
              value={formData.personality?.flaws || ''}
              onChange={(e) => updateField('personality.flaws', e.target.value)}
              placeholder="What are your character's weaknesses or flaws?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Backstory */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">
          <label htmlFor="dnd5e-backstory">Backstory</label>
        </h3>
        <textarea
          id="dnd5e-backstory"
          value={formData.backstory || ''}
          onChange={(e) => updateField('backstory', e.target.value)}
          placeholder="Tell your character's story..."
          rows={6}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Allies & Organizations */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Allies & Organizations</h3>
        <div className="space-y-2">
          <div>
            <label htmlFor="dnd5e-allies-name" className="block text-xs font-semibold text-stone-600 mb-1">Name</label>
            <input
              id="dnd5e-allies-name"
              type="text"
              value={formData.alliesAndOrganizations?.name || ''}
              onChange={(e) => updateField('alliesAndOrganizations.name', e.target.value)}
              placeholder="e.g., The Arcane Brotherhood"
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label htmlFor="dnd5e-allies-description" className="block text-xs font-semibold text-stone-600 mb-1">Description</label>
            <textarea
              id="dnd5e-allies-description"
              value={formData.alliesAndOrganizations?.description || ''}
              onChange={(e) => updateField('alliesAndOrganizations.description', e.target.value)}
              placeholder="Describe your allies and organizations..."
              rows={3}
              className="w-full px-2 py-1 border border-stone-300 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Treasure */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">
          <label htmlFor="dnd5e-treasure">Treasure & Other Notes</label>
        </h3>
        <textarea
          id="dnd5e-treasure"
          value={formData.treasure || ''}
          onChange={(e) => updateField('treasure', e.target.value)}
          placeholder="Special items, treasure, or other important notes..."
          rows={4}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-red-500"
        />
      </div>
    </div>
  );

  // Each message once: six ability scores out of range say the same thing.
  const refusals = [...new Set(Object.entries(errors).filter(([key, message]) => message && !NOT_IN_SUMMARY.has(key)).map(([, message]) => message))];

  return (
    <div
      className="bg-white border-2 border-stone-200 rounded-lg overflow-hidden shadow-lg"
      onInputCapture={noteInteraction}
      onChangeCapture={noteInteraction}
      onPointerDownCapture={noteInteraction}
    >
      {renderHeader()}
      {renderTabs()}
      {refusals.length > 0 && (
        <div role="alert" className="mx-6 mt-4 px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <p className="font-semibold">This sheet can&apos;t be saved yet:</p>
          <ul className="list-disc pl-5">
            {refusals.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {broughtWithinRange.length > 0 && (
        <p role="status" className="mx-6 mt-4 px-3 py-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg">
          Some numbers were outside what a sheet can store and now show within it:{' '}
          {broughtWithinRange.join(', ')}. Saving keeps the new values.
        </p>
      )}
      <div className="p-6">
        {activeTab === 'stats' && renderStatsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'spells' && renderSpellsTab()}
        {activeTab === 'inventory' && renderInventoryTab()}
        {activeTab === 'features' && renderFeaturesTab()}
        {activeTab === 'bio' && renderBiographyTab()}
      </div>
      {errors.submit && (
        <div className="px-6 pb-4 text-sm text-red-600">{errors.submit}</div>
      )}
    </div>
  );
};

export default DnD5eCharacterEditor;
