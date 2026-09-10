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
  DnD5eAppearance,
  DnD5ePersonality,
  SheetChrome,
} from '../../../types/game-systems';
import { apiErrorMessage } from '@/utils/errors';
import { DND5E_CONDITIONS } from '@/utils/conditions';
import { collectSheetFeatures, readFeatureEntriesForEditing } from '@/utils/featureEntries';
import { api } from '../../../services/api';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';
import NumberField from '../../ui/NumberField';
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
  DND5E_ABILITY_NAMES,
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

/**
 * The sheet as this editor holds it.
 *
 * `proficiencies` used to be redeclared here, because the game system's own
 * type did not describe it and it survived a save only by accident — the route
 * stores the body as sent rather than Zod's parsed output. It is a declared
 * field on both sides now, so this adds nothing but the editor's own chrome.
 */
type DnD5eFormData = DnD5eCharacterData & SheetChrome;

interface DnD5eCharacterEditorProps {
  onDirtyChange?: (dirty: boolean) => void;
  character: Character;
  onSave: (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
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

// D&D 5e color presets for character sheets
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
 * Calculate luminance of a hex color to determine if text should be white or black
 * Returns true if text should be white (dark background), false if text should be black (light background)
 */
const shouldUseWhiteText = (hexColor: string): boolean => {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return true for white text if luminance is less than 0.5 (dark background)
  return luminance < 0.5;
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
 * DnD5eCharacterEditor - Editable D&D 5e character sheet
 */
export const DnD5eCharacterEditor: React.FC<DnD5eCharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
  onDirtyChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('stats');
  const [isSaving, setIsSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: serverConfig } = useServerConfigQuery();

  // Type assertion for D&D 5e character data
  const data = character.data as DnD5eFormData;


  // Form state - initialize with character data
  const [formData, setFormData] = useState<DnD5eFormData>(() => ({
    ...withoutOrphanFeatures(data),
    // Ensure nested objects exist.
    //
    // TODO(typing): `{}` is not a valid container — none of these has its keys,
    // and the effects below read `.score` / `.proficient` off each entry. A
    // sheet stored without one of these blocks therefore reads `undefined`
    // where a number is expected. Pre-existing; the casts keep the behaviour
    // exactly as it was rather than changing what a malformed sheet does.
    stats: (data.stats || {}) as DnD5eStats,
    savingThrows: (data.savingThrows || {}) as DnD5eSavingThrows,
    skills: (data.skills || {}) as DnD5eSkills,
    hp: data.hp || { maximum: 0, current: 0, temporary: 0 },
    deathSaves: data.deathSaves || { successes: 0, failures: 0 },
    // Same TODO(typing) as the containers above: this default omits `class`
    // and its `slots` has none of the nine levels, both of which the type
    // requires and the sheet below reads. Cast rather than corrected.
    spellcasting: (data.spellcasting || {
      ability: '',
      spellSaveDC: 0,
      spellAttackBonus: 0,
      cantrips: [],
      slots: {},
      spells: [],
    }) as DnD5eSpellcasting,
    currency: data.currency || { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    inventory: data.inventory || [],
    attacks: data.attacks || [],
    hitDice: data.hitDice || [],
    conditions: data.conditions || [],
    proficienciesAndLanguages: data.proficienciesAndLanguages || [],
    // Always four strings, so the textareas are controlled from the first
    // render. The shared reader settles where they come from: the stored boxes
    // when the sheet has them, otherwise a one-time guess from the flat list a
    // sheet written before the boxes existed carries.
    proficiencies: readProficiencyGroups(data),
    // featuresAndTraits is not defaulted here: the spread above has already
    // settled it, folding in the template-era `features` field. Re-reading
    // `data` would throw that away.
    // Same TODO(typing) as the containers above.
    appearance: (data.appearance || {}) as DnD5eAppearance,
    personality: (data.personality || {}) as DnD5ePersonality,
    alliesAndOrganizations: data.alliesAndOrganizations || { name: '', description: '' },
  }));

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
  if (cleanSnapshotRef.current === null) {
    cleanSnapshotRef.current = JSON.stringify(formData);
  }
  // Always the current form state, for reading inside async callbacks.
  const latestFormDataRef = useRef(formData);
  latestFormDataRef.current = formData;

  useEffect(() => {
    if (!hasInteractedRef.current) {
      cleanSnapshotRef.current = JSON.stringify(formData);
      return;
    }
    const dirty = JSON.stringify(formData) !== cleanSnapshotRef.current;
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    }
  }, [formData, onDirtyChange]);

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

  // Load saved color preference from character metadata
  useEffect(() => {
    if (data.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === data.themeColor);
      if (savedColor) {
        setSelectedColor(savedColor);
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
    setSelectedColor(color);
    setIsCustomColor(false);
    setShowColorPicker(false);
  };

  // Auto-calculate modifiers when ability scores change
  useEffect(() => {
    if (formData.stats) {
      const updatedStats = { ...formData.stats };
      let hasChanges = false;

      (Object.keys(updatedStats) as (keyof DnD5eStats)[]).forEach(ability => {
        const score = updatedStats[ability].score;
        const newModifier = calculateModifier(score);
        if (updatedStats[ability].modifier !== newModifier) {
          updatedStats[ability].modifier = newModifier;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setFormData((prev) => ({ ...prev, stats: updatedStats }));
      }
    }
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
    if (formData.stats && formData.savingThrows && formData.proficiencyBonus !== undefined) {
      const updatedSavingThrows = { ...formData.savingThrows };
      let hasChanges = false;

      (Object.keys(updatedSavingThrows) as (keyof DnD5eSavingThrows)[]).forEach(ability => {
        const abilityMod = formData.stats[ability]?.modifier || 0;
        const proficient = updatedSavingThrows[ability].proficient;
        const newBonus = abilityMod + (proficient ? formData.proficiencyBonus : 0);

        if (updatedSavingThrows[ability].bonus !== newBonus) {
          updatedSavingThrows[ability].bonus = newBonus;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        setFormData((prev) => ({ ...prev, savingThrows: updatedSavingThrows }));
      }
    }
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
  ]);

  // Skill-to-ability mapping
  const skillAbilities: Record<keyof DnD5eSkills, keyof DnD5eStats> = {
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

  // Initialize skills if they don't exist
  useEffect(() => {
    if (formData.skills) {
      const updatedSkills = { ...formData.skills };
      let needsUpdate = false;

      (Object.keys(skillAbilities) as (keyof DnD5eSkills)[]).forEach((skill) => {
        if (!updatedSkills[skill]) {
          updatedSkills[skill] = { proficient: false, expertise: false, bonus: 0 };
          needsUpdate = true;
        }
      });

      if (needsUpdate) {
        setFormData((prev) => ({ ...prev, skills: updatedSkills }));
      }
    }
  }, []); // Run once on mount

  // Auto-calculate skill bonuses when ability scores, proficiency, or expertise change
  useEffect(() => {
    if (formData.stats && formData.skills && formData.proficiencyBonus !== undefined) {
      const updatedSkills = { ...formData.skills };
      let hasChanges = false;

      (Object.keys(updatedSkills) as (keyof DnD5eSkills)[]).forEach(skill => {
        const ability = skillAbilities[skill];
        const abilityMod = formData.stats[ability]?.modifier || 0;
        const proficient = updatedSkills[skill].proficient;
        const expertise = updatedSkills[skill].expertise;

        let newBonus = abilityMod;
        if (expertise) {
          newBonus += formData.proficiencyBonus * 2; // Expertise = double proficiency
        } else if (proficient) {
          newBonus += formData.proficiencyBonus;
        }

        if (updatedSkills[skill].bonus !== newBonus) {
          updatedSkills[skill].bonus = newBonus;
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
      const storedTotal = formData.passivePerception;
      const backfilledPassiveBonus =
        formData.passivePerceptionBonus === undefined || formData.passivePerceptionBonus === null
          ? (typeof storedTotal === 'number' && Number.isFinite(storedTotal)
              ? storedTotal - passiveScore(perceptionBonus)
              : 0)
          : null;
      const passiveBonus = backfilledPassiveBonus ?? formData.passivePerceptionBonus ?? 0;
      const newPassivePerception = passiveScore(perceptionBonus + passiveBonus);

      const passiveChanged =
        formData.passivePerception !== newPassivePerception || backfilledPassiveBonus !== null;

      if (hasChanges || passiveChanged) {
        setFormData((prev) => ({
          ...prev,
          skills: updatedSkills,
          passivePerceptionBonus: passiveBonus,
          passivePerception: newPassivePerception,
        }));
      }
    }
  }, [
    formData.proficiencyBonus,
    formData.stats?.strength?.modifier,
    formData.stats?.dexterity?.modifier,
    formData.stats?.constitution?.modifier,
    formData.stats?.intelligence?.modifier,
    formData.stats?.wisdom?.modifier,
    formData.stats?.charisma?.modifier,
    // Explicitly depend on each skill's proficient and expertise flags
    ...(Object.keys(skillAbilities) as (keyof DnD5eSkills)[]).flatMap(skill => [
      formData.skills?.[skill]?.proficient,
      formData.skills?.[skill]?.expertise,
    ]),
  ]);

  /**
   * The initiative modifier shown on the sheet: Dexterity plus the manual bonus.
   * Derived on every render rather than read from storage, so what is displayed
   * is always what will be rolled.
   */
  const initiativeModifier = dnd5eInitiativeModifier(formData);

  // Spell save DC and attack bonus, derived the way the rules define them.
  // Both were hand-typed boxes, which is why the templates could ship DC 8 —
  // a number no character can legitimately have, since the lowest at level 1
  // is 10.
  const exhaustion = exhaustionLevel(formData.exhaustionLevel);
  const spellAbilityModifier = spellcastingAbilityModifier(formData);
  const spellSaveDC = dnd5eSpellSaveDC(formData);
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
    const backfilled = dnd5eBackfilledInitiativeBonus(formData);
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
   * Keep the stored spell save DC and attack bonus in step with the formulas,
   * and read an older hand-typed value back into its parts.
   *
   * The same arrangement as initiative above, for the same reason: both used to
   * be typed by hand, so a caster with a Rod of the Pact Keeper had a DC one
   * higher than the formula gives. Deriving without converting would take that
   * point away silently. The conversion runs once, only where the adjustment
   * field is absent.
   */
  useEffect(() => {
    if (!formData.spellcasting) return;

    const dcBackfill = dnd5eBackfilledSpellSaveDCBonus(formData);
    const attackBackfill = dnd5eBackfilledSpellAttackBonus(formData);

    const withBonuses = {
      ...formData,
      spellcasting: {
        ...formData.spellcasting,
        ...(dcBackfill !== null ? { spellSaveDCOtherBonus: dcBackfill } : {}),
        ...(attackBackfill !== null ? { spellAttackOtherBonus: attackBackfill } : {}),
      },
    };

    const dcTotal = dnd5eSpellSaveDC(withBonuses);
    const attackTotal = dnd5eSpellAttackBonus(withBonuses);

    const needsChange =
      dcBackfill !== null ||
      attackBackfill !== null ||
      formData.spellcasting.spellSaveDC !== dcTotal ||
      formData.spellcasting.spellAttackBonus !== attackTotal;
    if (!needsChange) return;

    setFormData((prev) => ({
      ...prev,
      spellcasting: {
        ...prev.spellcasting,
        ...(dcBackfill !== null ? { spellSaveDCOtherBonus: dcBackfill } : {}),
        ...(attackBackfill !== null ? { spellAttackOtherBonus: attackBackfill } : {}),
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

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
    const savedSnapshot = JSON.stringify(formData);
    const markClean = () => {
      cleanSnapshotRef.current = savedSnapshot;
      const stillDirty = JSON.stringify(latestFormDataRef.current) !== savedSnapshot;
      dirtyRef.current = stillDirty;
      onDirtyChange?.(stillDirty);
    };
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      // Include color customization in saved data
      const updatedData = {
        ...formData,
        themeColor: isCustomColor ? customColorHex : selectedColor.name,
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

      // Cantrips
      if (updatedData.spellcasting) {
        updatedData.spellcasting.cantrips = parseCommaSeparated(updatedData.spellcasting.cantrips);
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
          assetFormData.append('name', `${formData.characterName || 'Character'} Token`);
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

  /** Move a typed property onto the attack and clear the box. */
  const commitCustomProperty = (index: number, properties: string[]) => {
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

  const updateField = (path: string, value: unknown) => {
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
      : `bg-gradient-to-r ${selectedColor.from} ${selectedColor.to} ${headerTextColor} p-6 rounded-t-lg relative`;

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
                  value={customColorHex || '#b91c1c'}
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
                    placeholder="#b91c1c"
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="text-xs text-stone-500 mt-1">Enter hex code (e.g., #b91c1c)</div>
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
          <div className="flex-shrink-0 relative group">
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
              placeholder="Character Name"
              className={`w-full text-3xl font-bold bg-white/10 border-2 ${
                errors.characterName ? 'border-red-300' : 'border-white/20'
              } rounded px-3 py-1 ${headerTextColor} placeholder-current/50 focus:outline-none focus:border-white/40`}
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
                <span className="text-xs">Level</span>
                <NumberField
min={1}
                  max={20}
                  value={formData.level}
                  onChange={(v: number) => updateField('level', v)}
                  className={`w-16 bg-white/10 border ${
                    errors.level ? 'border-red-300' : 'border-white/20'
                  } rounded px-2 py-0.5 text-sm ${headerTextColor} focus:outline-none focus:border-white/40`}
                fallback={1}
                />
              </div>
              <input
                type="text"
                value={formData.race || ''}
                onChange={(e) => updateField('race', e.target.value)}
                placeholder="Race"
                className={`bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm ${headerTextColor} placeholder-current/50 focus:outline-none focus:border-white/40`}
              />
              <input
                type="text"
                value={formData.class || ''}
                onChange={(e) => updateField('class', e.target.value)}
                placeholder="Class"
                className={`bg-white/10 border border-white/20 rounded px-2 py-0.5 text-sm ${headerTextColor} placeholder-current/50 focus:outline-none focus:border-white/40`}
              />
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <div className={`text-xs opacity-70`}>Experience Points</div>
          <NumberField
min={0}
            value={formData.experiencePoints}
            onChange={(v: number) => updateField('experiencePoints', v)}
            className={`w-24 text-xl font-bold bg-white/10 border border-white/20 rounded px-2 py-1 ${headerTextColor} text-right focus:outline-none focus:border-white/40`}
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
          <label className="block text-sm font-semibold text-stone-700 mb-1">Alignment</label>
          <input
            type="text"
            value={formData.alignment || ''}
            onChange={(e) => updateField('alignment', e.target.value)}
            placeholder="e.g., Lawful Good"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-1">Background</label>
          <input
            type="text"
            value={formData.background || ''}
            onChange={(e) => updateField('background', e.target.value)}
            placeholder="e.g., Sage"
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      {/* Proficiency Bonus and Inspiration */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-1">Proficiency Bonus</label>
          <NumberField
min={2}
            max={6}
            value={formData.proficiencyBonus}
            onChange={(v: number) => updateField('proficiencyBonus', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          fallback={2}
          />
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <input
            type="checkbox"
            id="inspiration"
            checked={formData.inspiration || false}
            onChange={(e) => updateField('inspiration', e.target.checked)}
            className="w-5 h-5 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
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
              : `w-12 h-12 rounded-full bg-gradient-to-br ${selectedColor.from} ${selectedColor.to} flex items-center justify-center shadow-lg border-2`;

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
                  } rounded focus:outline-none focus:ring-2 focus:ring-red-500`}
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
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Saving Throws</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((ability) => {
            const saveData = formData.savingThrows?.[ability] || { proficient: false, bonus: 0 };
            return (
              <div key={ability} className="flex items-center justify-between p-2 hover:bg-stone-100 rounded">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`save-${ability}`}
                    checked={saveData.proficient}
                    onChange={(e) =>
                      updateField(`savingThrows.${ability}.proficient`, e.target.checked)
                    }
                    className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
                  />
                  <label htmlFor={`save-${ability}`} className="text-sm font-medium text-stone-800 capitalize">
                    {ability}
                  </label>
                </div>
                <span className={`text-sm font-semibold ${saveData.proficient ? 'text-red-700' : 'text-stone-600'}`}>
                  {formatModifier(saveData.bonus)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Skills</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          {(Object.keys(skillAbilities) as (keyof DnD5eSkills)[]).map((skill) => {
            const skillData = formData.skills?.[skill] || { proficient: false, expertise: false, bonus: 0 };
            const skillLabel = skill
              .replace(/([A-Z])/g, ' $1')
              .replace(/^./, (str) => str.toUpperCase())
              .trim();
            const ability = skillAbilities[skill];
            const abilityAbbr = ability.slice(0, 3).toUpperCase();

            return (
              <div key={skill} className="flex items-center justify-between p-2 hover:bg-stone-100 rounded">
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
                    className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
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
                <span
                  className={`text-sm font-semibold ${
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
            className="px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            + Add Skill
          </button>
        </div>
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
                  maxLength={60}
                  className="flex-1 min-w-[9rem] px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                />

                <select
                  value={custom.ability}
                  onChange={(e) => updateField(`customSkills.${index}.ability`, e.target.value)}
                  aria-label={`Ability used by ${custom.name || 'this skill'}`}
                  className="px-2 py-1 text-sm border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
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
                  <label className="text-xs text-stone-500">Other</label>
                  <NumberField
                    value={custom.otherBonus ?? 0}
                    onChange={(v: number) => updateField(`customSkills.${index}.otherBonus`, v)}
                    className="w-14 px-1 py-1 text-sm border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
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
            <label className="block text-xs font-semibold text-stone-600 mb-1">
              Other bonus
            </label>
            <NumberField
              value={formData.passivePerceptionBonus ?? 0}
              onChange={(v: number) => updateField('passivePerceptionBonus', v)}
              className="w-20 px-2 py-1 border border-stone-300 rounded text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
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
          <label className="block text-sm font-semibold text-stone-700 mb-1">Armor Class</label>
          <NumberField
min={0}
            value={formData.armorClass}
            onChange={(v: number) => updateField('armorClass', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
          fallback={10}
          />
        </div>
        <div>
          {/* Derived, not typed. Initiative is the Dexterity modifier plus the
              "Other bonus" below — it used to be a single hand-typed number
              that nothing kept in step with Dexterity, and that the roll then
              ignored entirely. */}
          <label className="block text-sm font-semibold text-stone-700 mb-1">Initiative</label>
          <div
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold bg-stone-100 text-stone-800"
            title={`Dexterity ${formatModifier(formData.stats?.dexterity?.modifier ?? 0)}${
              formData.initiativeBonus ? `, other ${formatModifier(formData.initiativeBonus)}` : ''
            }`}
          >
            {formatModifier(initiativeModifier)}
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-stone-700 mb-1">Speed (ft)</label>
          <NumberField
min={0}
            value={formData.speed}
            onChange={(v: number) => updateField('speed', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
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
          <label className="block text-sm font-semibold text-stone-700 mb-1">
            Initiative — other bonus
          </label>
          <NumberField
            value={formData.initiativeBonus ?? 0}
            onChange={(v: number) => updateField('initiativeBonus', v)}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
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
            <label className="block text-xs font-semibold text-stone-600 mb-1">Maximum</label>
            <NumberField
min={0}
              value={formData.hp?.maximum}
              onChange={(v: number) => updateField('hp.maximum', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
            fallback={0}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Current</label>
            <NumberField
min={0}
              value={formData.hp?.current}
              onChange={(v: number) => updateField('hp.current', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            fallback={0}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Temporary</label>
            <NumberField
min={0}
              value={formData.hp?.temporary}
              onChange={(v: number) => updateField('hp.temporary', v)}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center text-lg font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-red-500"
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
                { class: '', die: 'd6', maximum: 1, remaining: 1 },
              ];
              updateField('hitDice', newHitDice);
            }}
            className="px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            + Add Hit Die
          </button>
        </div>
        <div className="space-y-2">
          {(formData.hitDice || []).map((die, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                value={die.class || ''}
                onChange={(e) => updateField(`hitDice.${index}.class`, e.target.value)}
                placeholder="Class"
                className="flex-1 px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <input
                type="text"
                value={die.die ?? (die.total ? hitDieExpression(die) ?? '' : '')}
                onChange={(e) => updateField(`hitDice.${index}.die`, e.target.value)}
                placeholder="e.g., d10"
                title="One hit die. A plain die like d10, or something like 2d6 if your game uses it."
                className="w-24 px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <NumberField
min={0}
                value={die.maximum ?? hitDiceMaximum(die) ?? 0}
                onChange={(v: number) => updateField(`hitDice.${index}.maximum`, v)}
                placeholder="Max"
                className="w-20 px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
              fallback={0}
              />
              <NumberField
min={0}
                value={die.remaining}
                onChange={(v: number) => updateField(`hitDice.${index}.remaining`, v)}
                placeholder="Remaining"
                className="w-20 px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
              fallback={0}
              />
              <button
                onClick={() => {
                  const newHitDice = formData.hitDice!.filter((_, i) => i !== index);
                  updateField('hitDice', newHitDice);
                }}
                className="px-2 py-1 text-red-600 hover:text-red-800 font-bold"
              >
                ×
              </button>
            </div>
          ))}
          {(!formData.hitDice || formData.hitDice.length === 0) && (
            <div className="text-sm text-stone-500 italic">No hit dice added yet</div>
          )}
        </div>
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
                  checked={(formData.deathSaves?.successes || 0) >= i}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField('deathSaves.successes', i);
                    } else {
                      updateField('deathSaves.successes', i - 1);
                    }
                  }}
                  className="w-6 h-6 text-green-700 border-stone-300 rounded focus:ring-2 focus:ring-green-500"
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
                  checked={(formData.deathSaves?.failures || 0) >= i}
                  onChange={(e) => {
                    if (e.target.checked) {
                      updateField('deathSaves.failures', i);
                    } else {
                      updateField('deathSaves.failures', i - 1);
                    }
                  }}
                  className="w-6 h-6 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
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
            <label key={condition} className="flex items-center space-x-2 cursor-pointer hover:bg-stone-100 p-1 rounded">
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
                className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
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
                { name: '', attackBonus: 0, damageRoll: '', damageType: '', range: 0, properties: [], notes: '' },
              ];
              updateField('attacks', newAttacks);
            }}
            className="px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            + Add Attack
          </button>
        </div>
        <div className="space-y-4">
          {(formData.attacks || []).map((attack, index) => (
            <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <input
                  type="text"
                  value={attack.name || ''}
                  onChange={(e) => updateField(`attacks.${index}.name`, e.target.value)}
                  placeholder="Attack Name"
                  className="flex-1 px-2 py-1 border border-stone-300 rounded font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Attack Bonus</label>
                  <NumberField
value={attack.attackBonus}
                    onChange={(v: number) => updateField(`attacks.${index}.attackBonus`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Damage Roll</label>
                  <input
                    type="text"
                    value={attack.damageRoll || ''}
                    onChange={(e) => updateField(`attacks.${index}.damageRoll`, e.target.value)}
                    placeholder="e.g., 1d8+3"
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Damage Type</label>
                  <input
                    type="text"
                    value={attack.damageType || ''}
                    onChange={(e) => updateField(`attacks.${index}.damageType`, e.target.value)}
                    placeholder="e.g., slashing"
                    className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Range (ft)</label>
                  <NumberField
min={0}
                    value={attack.range}
                    onChange={(v: number) => updateField(`attacks.${index}.range`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
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
                        onClick={() =>
                          updateField(
                            `attacks.${index}.properties`,
                            toggleWeaponProperty(attack.properties || [], property)
                          )
                        }
                        className={`px-2 py-0.5 text-xs rounded-full border capitalize transition-colors ${
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
                    className="flex-1 px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => commitCustomProperty(index, attack.properties || [])}
                    className="px-3 py-1 text-sm font-medium text-red-700 hover:text-red-900"
                  >
                    Add
                  </button>
                </div>
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
                    className="px-2 py-0.5 text-xs font-medium text-red-700 hover:text-red-900"
                  >
                    + Add Damage Roll
                  </button>
                </div>
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
                      className="flex-1 px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
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
                      className="w-28 px-2 py-1 text-sm border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
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
                      className="w-28 px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
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
                <label className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={attack.notes || ''}
                  onChange={(e) => updateField(`attacks.${index}.notes`, e.target.value)}
                  placeholder="e.g., silvered, returns when thrown"
                  className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
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
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
          <label className="block text-sm font-semibold text-stone-700 mb-1">Spell Save DC</label>
          <div
            className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-center text-xl font-bold text-stone-800"
            title={`8 + proficiency ${formatModifier(formData.proficiencyBonus ?? 0)} + ability ${formatModifier(spellAbilityModifier)}`}
          >
            {spellSaveDC}
          </div>
          <label className="block text-xs font-semibold text-stone-600 mt-2 mb-1">Other bonus</label>
          <NumberField
            value={formData.spellcasting?.spellSaveDCOtherBonus}
            onChange={(v: number) => updateField('spellcasting.spellSaveDCOtherBonus', v)}
            aria-label="Spell save DC other bonus"
            className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
            fallback={0}
          />
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-3">
          <label className="block text-sm font-semibold text-stone-700 mb-1">Spell Attack Bonus</label>
          <div
            className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-center text-xl font-bold text-stone-800"
            title={`proficiency ${formatModifier(formData.proficiencyBonus ?? 0)} + ability ${formatModifier(spellAbilityModifier)}`}
          >
            {formatModifier(spellAttackBonus)}
          </div>
          <label className="block text-xs font-semibold text-stone-600 mt-2 mb-1">Other bonus</label>
          <NumberField
            value={formData.spellcasting?.spellAttackOtherBonus}
            onChange={(v: number) => updateField('spellcasting.spellAttackOtherBonus', v)}
            aria-label="Spell attack other bonus"
            className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
            fallback={0}
          />
        </div>
      </div>
      <p className="text-xs text-stone-600 -mt-3">
        Both are worked out from your proficiency bonus and spellcasting ability. Use
        &quot;Other bonus&quot; for anything else that changes them — a Rod of the Pact
        Keeper, a Robe of the Archmagi. They are separate because some items raise only one.
      </p>

      {/* Cantrips */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Cantrips</h3>
        <textarea
          value={typeof formData.spellcasting?.cantrips === 'string'
            ? formData.spellcasting.cantrips
            : (formData.spellcasting?.cantrips || []).join(', ')}
          onChange={(e) => updateField('spellcasting.cantrips', e.target.value)}
          placeholder="Enter cantrips separated by commas (e.g., Fire Bolt, Mage Hand, Prestidigitation)"
          rows={2}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        />
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
                    <label className="block text-xs text-stone-600 mb-1">Total</label>
                    <NumberField
min={0}
                      value={slotData.total}
                      onChange={(v: number) => updateField(`spellcasting.slots.${level}.total`, v)}
                      className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                    fallback={0}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-600 mb-1">Used</label>
                    <NumberField
min={0}
                      value={slotData.expended}
                      onChange={(v: number) => updateField(`spellcasting.slots.${level}.expended`, v)}
                      className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
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
                { level: 1, name: '', prepared: false, ritual: false, concentration: false },
              ];
              updateField('spellcasting.spells', newSpells);
            }}
            className="px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            + Add Spell
          </button>
        </div>
        <div className="space-y-2">
          {(formData.spellcasting?.spells || []).map((spell, index) => (
            <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 flex items-center space-x-3">
              <NumberField
min={1}
                max={9}
                value={spell.level}
                onChange={(v: number) => updateField(`spellcasting.spells.${index}.level`, v)}
                className="w-14 px-2 py-1 border border-stone-300 rounded text-center font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
                title="Spell Level"
              fallback={1}
              />
              <input
                type="text"
                value={spell.name || ''}
                onChange={(e) => updateField(`spellcasting.spells.${index}.name`, e.target.value)}
                placeholder="Spell Name"
                className="flex-1 px-2 py-1 border border-stone-300 rounded font-medium focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <label className="flex items-center space-x-1 cursor-pointer" title="Prepared">
                <input
                  type="checkbox"
                  checked={spell.prepared || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.prepared`, e.target.checked)}
                  className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
                />
                <span className="text-xs text-stone-600">Prep</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer" title="Ritual">
                <input
                  type="checkbox"
                  checked={spell.ritual || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.ritual`, e.target.checked)}
                  className="w-4 h-4 text-blue-700 border-stone-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-stone-600">Rit</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer" title="Concentration">
                <input
                  type="checkbox"
                  checked={spell.concentration || false}
                  onChange={(e) => updateField(`spellcasting.spells.${index}.concentration`, e.target.checked)}
                  className="w-4 h-4 text-purple-700 border-stone-300 rounded focus:ring-2 focus:ring-purple-500"
                />
                <span className="text-xs text-stone-600">Con</span>
              </label>
              <button
                onClick={() => {
                  const newSpells = formData.spellcasting!.spells.filter((_, i) => i !== index);
                  updateField('spellcasting.spells', newSpells);
                }}
                className="px-2 py-1 text-red-600 hover:text-red-800 font-bold"
              >
                ×
              </button>
            </div>
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
              <label className={`block text-xs font-semibold ${currency.color} mb-1`}>
                {currency.label}
              </label>
              <NumberField
min={0}
                value={formData.currency?.[currency.key]}
                onChange={(v: number) => updateField(`currency.${currency.key}`, v)}
                className="w-full px-2 py-2 border border-stone-300 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
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
                {
                  name: '',
                  quantity: 1,
                  weight: 0,
                  notes: '',
                  equippable: false,
                  equipped: false,
                  requiresAttunement: false,
                  attuned: false,
                  value: 0,
                },
              ];
              updateField('inventory', newInventory);
            }}
            className="px-3 py-1 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors"
          >
            + Add Item
          </button>
        </div>
        <div className="space-y-3">
          {(formData.inventory || []).map((item, index) => (
            <div key={index} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between">
                <input
                  type="text"
                  value={item.name || ''}
                  onChange={(e) => updateField(`inventory.${index}.name`, e.target.value)}
                  placeholder="Item Name"
                  className="flex-1 px-2 py-1 border border-stone-300 rounded font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
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
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Quantity</label>
                  <NumberField
min={0}
                    value={item.quantity}
                    onChange={(v: number) => updateField(`inventory.${index}.quantity`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                  fallback={1}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Weight (lb)</label>
                  <NumberField
min={0}
                    step="0.1"
                    // The one genuinely fractional field on the sheet: half a
                    // pound of rations is a real weight.
                    integer={false}
                    value={item.weight}
                    onChange={(v: number) => updateField(`inventory.${index}.weight`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-600 mb-1">Value (gp)</label>
                  <NumberField
min={0}
                    value={item.value}
                    onChange={(v: number) => updateField(`inventory.${index}.value`, v)}
                    className="w-full px-2 py-1 border border-stone-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-red-500"
                  fallback={0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-600 mb-1">Notes</label>
                <input
                  type="text"
                  value={item.notes || ''}
                  onChange={(e) => updateField(`inventory.${index}.notes`, e.target.value)}
                  placeholder="Item description or notes"
                  className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.equipped || false}
                    onChange={(e) => updateField(`inventory.${index}.equipped`, e.target.checked)}
                    className="w-4 h-4 text-red-700 border-stone-300 rounded focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-stone-700">Equipped</span>
                </label>
                <label className="flex items-center space-x-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.requiresAttunement || false}
                    onChange={(e) => updateField(`inventory.${index}.requiresAttunement`, e.target.checked)}
                    className="w-4 h-4 text-purple-700 border-stone-300 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-stone-700">Requires Attunement</span>
                </label>
                {item.requiresAttunement && (
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.attuned || false}
                      onChange={(e) => updateField(`inventory.${index}.attuned`, e.target.checked)}
                      className="w-4 h-4 text-purple-700 border-stone-300 rounded focus:ring-2 focus:ring-purple-500"
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
              <label className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Armor</label>
              <textarea
                value={profs.armor}
                onChange={(e) => updateField('proficiencies.armor', e.target.value)}
                placeholder="Light Armor, Medium Armor, Shields"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Weapons */}
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Weapons</label>
              <textarea
                value={profs.weapons}
                onChange={(e) => updateField('proficiencies.weapons', e.target.value)}
                placeholder="Simple Weapons, Martial Weapons, or specific weapons (Daggers, Longswords, Shortbows)"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Tools */}
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Tools</label>
              <textarea
                value={profs.tools}
                onChange={(e) => updateField('proficiencies.tools', e.target.value)}
                placeholder="Thieves' Tools, Smith's Tools, Calligrapher's Supplies, Musical Instruments, Vehicles (Land/Water)"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
              />
            </div>

            {/* Languages */}
            <div>
              <label className="block text-sm font-bold text-stone-700 mb-2 uppercase tracking-wide">Languages</label>
              <textarea
                value={profs.languages}
                onChange={(e) => updateField('proficiencies.languages', e.target.value)}
                placeholder="Common, Elvish, Dwarvish, Draconic"
                rows={2}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
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
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              + Add Feature
            </button>
          </div>
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
                      className="flex-1 px-2 py-1 border border-stone-300 rounded font-semibold focus:outline-none focus:ring-2 focus:ring-red-500"
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
                    className="w-full px-2 py-1 text-sm border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Additional Features & Traits */}
        <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-stone-800 mb-3">Additional Features & Traits</h3>
          <p className="text-xs text-stone-600 mb-3">Detailed descriptions of features, special abilities, or notes</p>
          <textarea
            value={formData.additionalFeaturesAndTraits || ''}
            onChange={(e) => updateField('additionalFeaturesAndTraits', e.target.value)}
            placeholder="Describe any additional features, traits, or special abilities in detail..."
            rows={8}
            className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
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
            <label className="block text-xs font-semibold text-stone-600 mb-1">Age</label>
            <input
              type="text"
              value={formData.appearance?.age || ''}
              onChange={(e) => updateField('appearance.age', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Height</label>
            <input
              type="text"
              value={formData.appearance?.height || ''}
              onChange={(e) => updateField('appearance.height', e.target.value)}
              placeholder="e.g., 5'7&quot;"
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Weight</label>
            <input
              type="text"
              value={formData.appearance?.weight || ''}
              onChange={(e) => updateField('appearance.weight', e.target.value)}
              placeholder="e.g., 130 lbs"
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Eyes</label>
            <input
              type="text"
              value={formData.appearance?.eyes || ''}
              onChange={(e) => updateField('appearance.eyes', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Skin</label>
            <input
              type="text"
              value={formData.appearance?.skin || ''}
              onChange={(e) => updateField('appearance.skin', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Hair</label>
            <input
              type="text"
              value={formData.appearance?.hair || ''}
              onChange={(e) => updateField('appearance.hair', e.target.value)}
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Personality */}
      <div className="bg-stone-50 border-2 border-stone-300 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Personality</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Personality Traits</label>
            <textarea
              value={formData.personality?.traits || ''}
              onChange={(e) => updateField('personality.traits', e.target.value)}
              placeholder="Describe your character's personality traits..."
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Ideals</label>
            <textarea
              value={formData.personality?.ideals || ''}
              onChange={(e) => updateField('personality.ideals', e.target.value)}
              placeholder="What drives your character? What do they believe in?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Bonds</label>
            <textarea
              value={formData.personality?.bonds || ''}
              onChange={(e) => updateField('personality.bonds', e.target.value)}
              placeholder="What connections does your character have?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-1">Flaws</label>
            <textarea
              value={formData.personality?.flaws || ''}
              onChange={(e) => updateField('personality.flaws', e.target.value)}
              placeholder="What are your character's weaknesses or flaws?"
              rows={2}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Backstory */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Backstory</h3>
        <textarea
          value={formData.backstory || ''}
          onChange={(e) => updateField('backstory', e.target.value)}
          placeholder="Tell your character's story..."
          rows={6}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Allies & Organizations */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Allies & Organizations</h3>
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Name</label>
            <input
              type="text"
              value={formData.alliesAndOrganizations?.name || ''}
              onChange={(e) => updateField('alliesAndOrganizations.name', e.target.value)}
              placeholder="e.g., The Arcane Brotherhood"
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">Description</label>
            <textarea
              value={formData.alliesAndOrganizations?.description || ''}
              onChange={(e) => updateField('alliesAndOrganizations.description', e.target.value)}
              placeholder="Describe your allies and organizations..."
              rows={3}
              className="w-full px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Treasure */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-stone-800 mb-3">Treasure & Other Notes</h3>
        <textarea
          value={formData.treasure || ''}
          onChange={(e) => updateField('treasure', e.target.value)}
          placeholder="Special items, treasure, or other important notes..."
          rows={4}
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
    </div>
  );

  return (
    <div
      className="bg-white border-2 border-stone-200 rounded-lg overflow-hidden shadow-lg"
      onInputCapture={noteInteraction}
      onChangeCapture={noteInteraction}
      onPointerDownCapture={noteInteraction}
    >
      {renderHeader()}
      {renderTabs()}
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
