/**
 * CallOfCthulhu7eCharacterEditor Component
 *
 * Editable Call of Cthulhu 7e character sheet with auto-calculation of
 * derived stats, half/fifth values, and validation.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Target,
  Swords,
  Package,
  BookText,
  Save,
  X,
  Upload,
  Palette,
  Plus,
} from 'lucide-react';
import { Character } from '../../../types';
import type { CharacterData } from '../../../types';
import type {
  CoC7eCharacterData,
  CoC7eCharacteristics,
  CoC7eDerivedStats,
  CoC7eSkills,
  CoC7eWealth,
  CoC7eBackstory,
  CoC7eAppearance,
  CoC7eConditions,
} from '../../../types/game-systems';
import { apiErrorMessage } from '@/utils/errors';
import { COC7E_CONDITIONS } from '@/utils/conditions';

/**
 * The sheet as this editor holds it: `CoC7eCharacterData` plus `themeColor`,
 * the header colour chosen in the editor. It is not part of the game system,
 * but every system's schema declares it, so it is saved with the sheet. The
 * server stores the schema's parsed sheet, so anything this editor writes has
 * to be declared there too.
 */
type CoC7eFormData = CoC7eCharacterData;
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { orderedCharacteristics } from './characteristics';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { WeaponsList } from './components/WeaponsList';
import { BackstorySection } from './components/BackstorySection';
import NumberField from '../../ui/NumberField';
import ListField, { parseLineList, formatLineList } from '../../ui/ListField';
import { LIMIT_NOTE_CLASS } from './limitNoteClass';
import { toStoredHexColor, HEX_COLOUR_HINT } from '@/utils/themeColor';
import { setCoC7eSkillField, withCoC7eSkillList } from './skillEdits';
import { settleSkillBase } from './dodge';
import {
  cocHitPoints,
  cocMagicPoints,
  cocDamageBonusAndBuild,
  cocMoveRate,
  cocMaxSanity,
  cocHalfAndFifth,
  cocDodgeBase,
  cocMajorWoundThreshold,
  cocBlankSkills,
} from '@/utils/rules/callOfCthulhu7e';
import { parsePossessions, formatPossessions } from './possessions';
import { SHEET_LIST_MAX, SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import ListLimitNote, { ADD_BUTTON_OFF, listIsFull } from '../ListLimitNote';
import { tokenPictureProblem, uploadTokenPicture } from '@/utils/tokenPicture';
import { useServerConfigQuery } from '@/hooks/queries';
import { COLOR_PRESETS } from './colorPresets';

interface CallOfCthulhu7eCharacterEditorProps {
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
 * Calculate damage bonus and build from STR + SIZ
 * Based on Call of Cthulhu 7e rules
 */
/** The appearance fields the official sheet records, in its own order. */
const COC_APPEARANCE_FIELDS: { key: keyof CoC7eAppearance; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'hair', label: 'Hair' },
  { key: 'skin', label: 'Skin' },
];

/**
 * The sheet with one Cthulhu Mythos. It is stored twice: the skill, which sets
 * maximum Sanity and is rolled, and the Spells & Mythos box, which was the
 * only one the editor let a player change. Both take the larger, which is
 * whichever the player last raised, and the box edits the skill from here on.
 * It stops at 99, where maximum Sanity reaches 0: a stored 100 would make it
 * -1, which the sheet cannot save.
 */
function withOneCthulhuMythos(sheet: CoC7eFormData): CoC7eFormData {
  const skill = sheet.skills?.cthulhuMythos;
  const mythos = Math.min(Math.max(skill?.currentValue ?? 0, sheet.spellsAndMythos?.cthulhuMythos ?? 0), 99);
  return {
    ...sheet,
    skills: {
      ...sheet.skills,
      cthulhuMythos: { baseValue: 0, improvementChecked: false, ...skill, currentValue: mythos },
    } as CoC7eSkills,
    spellsAndMythos: { spells: [], ...sheet.spellsAndMythos, cthulhuMythos: mythos },
  };
}

/**
 * CallOfCthulhu7eCharacterEditor - Editable CoC 7e character sheet
 */
export const CallOfCthulhu7eCharacterEditor: React.FC<CallOfCthulhu7eCharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
  onDirtyChange,
  onDone,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isSaving, setIsSaving] = useState(false);
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: serverConfig } = useServerConfigQuery();

  const data = character.data as CoC7eFormData;
  // The Keeper is sent the notes field always, and nobody else ever is.
  const keeperNotesShown = typeof data.notes === 'string';

  // Form state
  const [formData, setFormData] = useState<CoC7eFormData>(() => withOneCthulhuMythos({
    ...data,
    characteristics: data.characteristics || {},
    // A sheet stored without derived attributes has them all worked out by
    // the effect below as it opens; until then the inputs read them as absent.
    derivedStats: (data.derivedStats || {}) as CoC7eDerivedStats,
    // Every skill, at its base where the sheet has none: the server takes the
    // whole block or nothing, so a sheet stored without one could not be saved.
    skills: {
      ...cocBlankSkills(data.characteristics?.DEX?.regular ?? 0, data.characteristics?.EDU?.regular ?? 0),
      ...data.skills,
    } as CoC7eSkills,
    combat: data.combat || { weapons: [] },
    possessions: data.possessions || [],
    wealth: data.wealth || {},
    backstory: data.backstory || {},
    appearance: data.appearance || {},
    contacts: data.contacts || [],
    conditions: data.conditions || {},
  }));

  // Report the first edit up to whoever is hosting this sheet, so leaving with
  // unsaved work can be caught. One effect on the whole form rather than a call
  // in each of the ~40 field handlers: it cannot be forgotten when a field is
  // added, and it catches changes made any way at all. The initial render is
  // skipped, and the flag is reset after a successful save.
  // Two conditions, both required, because either alone gets it wrong.
  //
  // The sheet recalculates derived values (the half/fifth columns, hit points,
  // magic points, sanity) from effects that run as it mounts, so `formData`
  // changes identity — and often value — before anyone has touched anything.
  // Reporting on identity alone marked every investigator dirty on open, and
  // comparing values alone still did, because those effects genuinely write
  // different numbers to a sheet whose stored values had drifted.
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
  // presses (add a skill, adjust a track) rather than typing.
  const noteInteraction = () => { hasInteractedRef.current = true; };

  // Token image state
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(
    character.tokenImageUrl
  );

  // The header colour and a newly chosen token picture are kept outside the
  // form, and are unsaved changes too.
  const snapshotOf = (form: typeof formData, theme: string, picture: File | null) => JSON.stringify({
    formData: form,
    themeColor: theme,
    tokenImage: picture ? `${picture.name}:${picture.size}:${picture.lastModified}` : null,
  });
  const themeChoice = isCustomColor ? customColorHex : themeColor.name;
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

  // Auto-calculate half and fifth values for characteristics
  useEffect(() => {
    if (!formData.characteristics) return;

    // Rebuild each entry rather than spreading one level and assigning into it:
    // a shallow copy shares the nested characteristic objects with state, so the
    // old version mutated `formData` in place.
    const updated: Partial<CoC7eCharacteristics> = {};
    let changed = false;
    (Object.keys(formData.characteristics) as (keyof CoC7eCharacteristics)[]).forEach((char) => {
      const entry = formData.characteristics[char];
      const regular = entry.regular || 0;
      const { half, fifth } = cocHalfAndFifth(regular);
      if (entry.half !== half || entry.fifth !== fifth) changed = true;
      updated[char] = { ...entry, half, fifth };
    });

    // Skip the update when the derived columns already agree, so simply opening
    // a sheet does not queue a state change.
    if (changed) {
      setFormData((prev) => ({ ...prev, characteristics: updated as CoC7eCharacteristics }));
    }
  }, [
    formData.characteristics?.STR?.regular,
    formData.characteristics?.CON?.regular,
    formData.characteristics?.SIZ?.regular,
    formData.characteristics?.DEX?.regular,
    formData.characteristics?.APP?.regular,
    formData.characteristics?.INT?.regular,
    formData.characteristics?.POW?.regular,
    formData.characteristics?.EDU?.regular,
  ]);

  // The DEX the derived stats were last worked out from, so a DEX change made
  // here can move Dodge's base without taking away the points spent on it.
  // Null until the sheet has been read once.
  const dodgeDexRef = useRef<number | null>(null);
  // The same for EDU, which is Language (Own)'s base.
  const languageEduRef = useRef<number | null>(null);

  // Auto-calculate derived stats
  useEffect(() => {
    const char = formData.characteristics;
    // Stored as text since ages were allowed to be typed; the maths needs the number.
    const age = Number(formData.age) || 30;

    if (char) {
      const con = char.CON?.regular || 0;
      const siz = char.SIZ?.regular || 0;
      const str = char.STR?.regular || 0;
      const dex = char.DEX?.regular || 0;
      const pow = char.POW?.regular || 0;

      // HP
      const maxHP = cocHitPoints(con, siz);
      const majorWoundThreshold = cocMajorWoundThreshold(maxHP);

      // Magic Points
      const maxMP = cocMagicPoints(pow);

      // Damage Bonus and Build
      const { damageBonus, build } = cocDamageBonusAndBuild(str, siz);

      // Move Rate
      const moveRate = cocMoveRate(str, dex, siz, age);

      // Dodge's base is half DEX. Its value is the base plus the skill points
      // and improvements the investigator has put into it, so it is kept.
      const dodgeBase = cocDodgeBase(dex);
      const previousDex = dodgeDexRef.current;
      dodgeDexRef.current = dex;
      const previousDodgeBase = previousDex === null ? null : cocDodgeBase(previousDex);
      // Language (Own) "automatically starts as equal to the investigator's
      // EDU": EDU is its base, as half DEX is Dodge's.
      const edu = char.EDU?.regular || 0;
      const previousEdu = languageEduRef.current;
      languageEduRef.current = edu;

      // Max Sanity (99 - Cthulhu Mythos)
      const cthulhuMythos = formData.skills?.cthulhuMythos?.currentValue || 0;
      const maxSanity = cocMaxSanity(cthulhuMythos);

      setFormData((prev) => {
        const storedDodge = prev.skills?.dodge;
        const dodge = storedDodge ? settleSkillBase(storedDodge, dodgeBase, previousDodgeBase) : undefined;
        const storedLanguage = prev.skills?.languageOwn;
        const languageOwn = storedLanguage ? settleSkillBase(storedLanguage, edu, previousEdu) : undefined;
        const skillsChanged = (dodge && dodge !== storedDodge) || (languageOwn && languageOwn !== storedLanguage);
        return {
          ...prev,
          ...(skillsChanged
            ? { skills: { ...prev.skills, ...(dodge ? { dodge } : {}), ...(languageOwn ? { languageOwn } : {}) } as CoC7eSkills }
            : {}),
          derivedStats: {
            ...prev.derivedStats,
            hp: {
              maximum: maxHP,
              current: prev.derivedStats?.hp?.current ?? maxHP,
              majorWoundThreshold,
              formula: '(CON + SIZ) / 10, rounded down',
            },
            magicPoints: {
              maximum: maxMP,
              current: prev.derivedStats?.magicPoints?.current ?? maxMP,
              formula: 'POW / 5',
            },
            damageBonus,
            build,
            moveRate,
            // The same number as the Dodge skill, which is what is rolled.
            dodge: {
              value: dodge?.currentValue ?? dodgeBase,
              formula: 'DEX / 2',
              improvementChecked: prev.derivedStats?.dodge?.improvementChecked || false,
            },
            sanity: {
              // Sanity begins at POW, and a sheet holds at most 99; current
              // Sanity "can never increase above" the maximum, 99 less
              // Cthulhu Mythos, so it comes down with it.
              starting: prev.derivedStats?.sanity?.starting ?? Math.min(pow, 99),
              maximum: maxSanity,
              current: Math.min(prev.derivedStats?.sanity?.current ?? Math.min(pow, 99), maxSanity),
              formula: 'Starts equal to POW; max is 99 minus Cthulhu Mythos skill',
            },
            luck: prev.derivedStats?.luck || { score: 50, notes: '' },
          },
        };
      });
    }
  }, [
    formData.characteristics?.CON?.regular,
    formData.characteristics?.SIZ?.regular,
    formData.characteristics?.STR?.regular,
    formData.characteristics?.DEX?.regular,
    formData.characteristics?.POW?.regular,
    formData.characteristics?.EDU?.regular,
    formData.age,
    formData.skills?.cthulhuMythos?.currentValue,
  ]);

  // Handle token image selection
  const handleTokenImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const problem = tokenPictureProblem(file, serverConfig);
      if (problem) {
        setErrors((prev) => ({ ...prev, tokenImage: problem }));
        return;
      }
      setErrors((prev) => ({ ...prev, tokenImage: '' }));
      setTokenImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setTokenImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle save
  const handleSave = async () => {
    // A completed save means nothing is pending any more.
    // Unless the sheet was edited again while the save was in flight, which the
    // recheck preserves.
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
    // The server refuses a colour it cannot read, and the whole save with it.
    if (isCustomColor && customColorHex !== '' && !toStoredHexColor(customColorHex)) {
      setErrors((prev) => ({ ...prev, themeColor: HEX_COLOUR_HINT }));
      setShowColorPicker(true);
      return;
    }
    setIsSaving(true);
    try {
      // Include color customization in saved data
      const updatedData = {
        ...formData,
        themeColor: isCustomColor ? (toStoredHexColor(customColorHex) ?? '') : themeColor.name,
      };

      // The derived copy of Dodge follows the skill, which is the one edited
      // and rolled. It is not kept in step while typing, where holding the
      // value at its base would turn a "5" on the way to "55" into 25.
      if (updatedData.skills?.dodge && updatedData.derivedStats?.dodge) {
        updatedData.derivedStats = {
          ...updatedData.derivedStats,
          dodge: { ...updatedData.derivedStats.dodge, value: updatedData.skills.dodge.currentValue },
        };
      }

      // Upload token image if a new one was selected
      let newTokenImageUrl: string | undefined = undefined;
      if (tokenImageFile) {
        try {
          newTokenImageUrl = await uploadTokenPicture(tokenImageFile, formData.investigatorName || 'Investigator', character.campaignId);
        } catch (uploadError: unknown) {
          console.error('Error uploading token image:', uploadError);
          setErrors((prev) => ({ ...prev, tokenImage: apiErrorMessage(uploadError) || 'Failed to upload token image' }));
          setIsSaving(false);
          return;
        }
      }

      // Pass the tokenImageUrl as a separate parameter if it was uploaded
      await onSave(updatedData, true, newTokenImageUrl);
      markClean();
    } catch (error) {
      console.error('Failed to save character:', error);
      setErrors((prev) => ({ ...prev, submit: 'Failed to save character. Please try again.' }));
    } finally {
      setIsSaving(false);
    }
  };

  // Load saved color preference from character metadata
  useEffect(() => {
    if (formData.themeColor) {
      const savedColor = COLOR_PRESETS.find(c => c.name === formData.themeColor);
      if (savedColor) {
        setThemeColor(savedColor);
        setIsCustomColor(false);
      } else {
        // Custom hex colour, a three-digit one expanded, so it opens as itself
        // rather than as the default preset.
        const hex = toStoredHexColor(formData.themeColor);
        if (hex) {
          setCustomColorHex(hex);
          setIsCustomColor(true);
        }
      }
    }
  }, [formData.themeColor]);

  // Handle custom color change
  const handleCustomColorChange = (hex: string) => {
    setCustomColorHex(hex);
    setIsCustomColor(true);
    setErrors((prev) => ({ ...prev, themeColor: '' }));
  };

  // Handle preset color selection
  const handlePresetColorSelect = (color: typeof COLOR_PRESETS[0]) => {
    setThemeColor(color);
    setIsCustomColor(false);
    setShowColorPicker(false);
  };

  // Render header with save/cancel buttons
  const renderHeader = () => {
    // Determine the current background style
    const headerStyle = isCustomColor
      ? { background: `linear-gradient(to right, ${customColorHex}, ${customColorHex}dd)` }
      : {};

    const headerClasses = isCustomColor
      ? 'text-white p-6 rounded-t-lg relative border-b-4 border-white/20'
      : `bg-linear-to-r/srgb ${themeColor.from} ${themeColor.via} ${themeColor.to} text-white p-6 rounded-t-lg relative border-b-4 ${themeColor.border}`;

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
          <div className="absolute top-16 right-4 bg-paper text-ink rounded-lg shadow-xl p-4 z-10 border-2 border-ink/10 max-w-md">
            <h4 className="font-semibold mb-3">Theme Color</h4>

            {/* Preset Colors */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => handlePresetColorSelect(color)}
                  className={`px-2 py-2 rounded-lg text-sm font-medium transition-all ${
                    !isCustomColor && themeColor.name === color.name
                      ? 'ring-2 ring-brand bg-ink/10'
                      : 'hover:bg-ink/5'
                  }`}
                >
                  <div className={`w-full h-6 rounded-sm mb-1 bg-linear-to-r/srgb ${color.from} ${color.to}`} />
                  <div className="text-xs">{color.name}</div>
                </button>
              ))}
            </div>

            {/* Custom Color Section */}
            <div className="border-t border-ink/10 pt-4 space-y-3">
              <h5 className="text-sm font-semibold text-ink-secondary">Custom Color</h5>

              <div className="flex items-center space-x-2">
                {/* Native Color Picker */}
                <input
                  type="color"
                  value={customColorHex || '#14532d'}
                  onChange={(e) => handleCustomColorChange(e.target.value)}
                  className="w-12 h-12 rounded-sm cursor-pointer border-2 border-ink/20"
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
                    aria-label="Custom colour hex code"
                    className="w-full px-3 py-2 border border-ink/20 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <div className="text-xs text-ink-muted mt-1">Enter hex code (e.g., #14532d)</div>
                  {errors.themeColor && <div className="text-xs text-danger-ink mt-1">{errors.themeColor}</div>}
                </div>
              </div>

              {/* Custom Color Preview */}
              {isCustomColor && customColorHex && /^#[0-9A-Fa-f]{6}$/.test(customColorHex) && (
                <div className="flex items-center space-x-2 p-2 bg-ink/5 rounded-sm">
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

        {/* Action Buttons */}
        <div className="absolute top-4 right-16 flex items-center space-x-2">
        {/* Fixed colours: the header is the player's colour, not the theme's. */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg"
        >
          <X className="w-4 h-4" />
          <span>Cancel</span>
        </button>
      </div>

      {/* pr-64, matching the other sheets: the absolute Save/Cancel cluster is
          203px wide and starts 64px in, so it needs more clearance than the
          pr-48 that was here. */}
      <div className="flex items-start space-x-4 pr-64">
        {/* Token Image */}
        <div className="shrink-0 relative">
          <label htmlFor="token-upload" className="cursor-pointer group">
            {tokenImagePreview ? (
              <img
                src={tokenImagePreview}
                alt={formData.investigatorName || 'Investigator'}
                className="w-24 h-24 rounded-full border-4 border-white/20 object-cover shadow-xl group-hover:opacity-75 transition-opacity"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white/20 bg-black/70 flex items-center justify-center shadow-xl group-hover:bg-black/60 transition-colors">
                <Upload className="w-8 h-8 text-white/60" />
              </div>
            )}
          </label>
          <input
            id="token-upload"
            type="file"
            accept="image/*"
            onChange={handleTokenImageChange}
            className="hidden"
          />
          {errors.tokenImage && (
            <div className="absolute top-full mt-1 text-xs text-white/90 whitespace-nowrap">
              {errors.tokenImage}
            </div>
          )}
          {!character.campaignId && (
            <div className="absolute top-full mt-1 text-xs text-white/90 whitespace-nowrap">
              Saves as personal token
            </div>
          )}
        </div>

        {/* Character Info — min-w-0 alongside flex-1 so the column can shrink
            below its content width and stay inside the reserved padding. */}
        <div className="flex-1 min-w-0 space-y-3">
          <input
            type="text"
            value={formData.investigatorName || ''}
            onChange={(e) => setFormData({ ...formData, investigatorName: e.target.value })}
            maxLength={SHEET_NAME_MAX}
            placeholder="Investigator Name"
            aria-label="Investigator name"
            className="text-3xl font-bold bg-white/10 border-2 border-white/30 rounded-sm px-3 py-1 w-full text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
          />

          <div className="grid grid-cols-3 gap-3">
            {/* Read-only: the player name is whoever owns this investigator,
                filled from their display name at creation. */}
            <span className="text-sm px-2 py-1 text-white self-center">
              {formData.playerName || '—'}
            </span>
            <input
              type="text"
              value={formData.occupation || ''}
              onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
              placeholder="Occupation"
              aria-label="Occupation"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
            />
            <input
              type="text"
              value={formData.era || ''}
              onChange={(e) => setFormData({ ...formData, era: e.target.value })}
              placeholder="Era (e.g., 1920s)"
              aria-label="Era"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            {/* TODO(typing): the age is stored as text and handed to this number box
                as it is, which shows text that is not a number as blank. Right:
                decide what such text should show, then pass the box a number. */}
            <NumberField
              value={(formData.age ?? 0) as number}
              onChange={(v: number) => setFormData({ ...formData, age: v })}
              placeholder="Age"
              aria-label="Age"
              className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
              fallback={0}
            />
            <input
              type="text"
              value={formData.sex || ''}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
              placeholder="Sex"
              aria-label="Sex"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
            />
            <input
              type="text"
              value={formData.residence || ''}
              onChange={(e) => setFormData({ ...formData, residence: e.target.value })}
              placeholder="Residence"
              aria-label="Residence"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 col-span-2 text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
            />
          </div>

          <input
            type="text"
            value={formData.birthplace || ''}
            onChange={(e) => setFormData({ ...formData, birthplace: e.target.value })}
            placeholder="Birthplace"
            aria-label="Birthplace"
            maxLength={SHEET_SHORT_TEXT_MAX}
            className="text-sm bg-white/10 border border-white/30 rounded-sm px-2 py-1 w-full text-white placeholder:text-white/50 focus:outline-hidden focus:ring-2 focus:ring-white/60"
          />
        </div>
      </div>
    </div>
    );
  };

  // Render tabs
  const renderTabs = () => (
    <div className="flex space-x-1 border-b-2 border-ink/10 bg-ink/5 px-4">
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
                  ? 'text-ink border-b-2 -mb-0.5 bg-paper'
                  : 'text-ink-secondary hover:text-ink hover:bg-ink/10'
              }
            `}
            // The underline in the header colour; the label in the theme's text.
            style={isActive ? { borderBottomColor: isCustomColor ? customColorHex : themeColor.hex } : undefined}
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
        <h3 className="text-lg font-bold text-ink mb-4">Characteristics</h3>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
          {orderedCharacteristics(formData.characteristics as unknown as Record<string, unknown>).map((charKey) => (
            <CharacteristicBlock
              key={charKey}
              label={charKey}
              regular={formData.characteristics[charKey as keyof CoC7eCharacteristics].regular}
              half={formData.characteristics[charKey as keyof CoC7eCharacteristics].half}
              fifth={formData.characteristics[charKey as keyof CoC7eCharacteristics].fifth}
              editable
              onChange={(value) => {
                setFormData({
                  ...formData,
                  characteristics: {
                    ...formData.characteristics,
                    [charKey]: {
                      ...formData.characteristics[charKey as keyof CoC7eCharacteristics],
                      regular: value,
                    },
                  },
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* Sanity Tracker */}
      <SanityTracker
        current={formData.derivedStats?.sanity?.current || 0}
        starting={formData.derivedStats?.sanity?.starting || 0}
        maximum={formData.derivedStats?.sanity?.maximum ?? 99}
        cthulhuMythos={formData.skills?.cthulhuMythos?.currentValue || 0}
        editable
        onChange={{
          current: (value) => {
            setFormData({
              ...formData,
              derivedStats: {
                ...formData.derivedStats,
                sanity: { ...formData.derivedStats!.sanity, current: value },
              } as CoC7eDerivedStats,
            });
          },
          starting: (value) => {
            setFormData({
              ...formData,
              derivedStats: {
                ...formData.derivedStats,
                sanity: { ...formData.derivedStats!.sanity, starting: value },
              } as CoC7eDerivedStats,
            });
          },
        }}
      />

      {/* Derived Stats (showing auto-calculated values) */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Derived Attributes (Auto-Calculated)</h3>
        <div className="bg-info/10 border border-info/30 rounded-lg p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-info-ink font-semibold">HP Max:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.hp?.maximum || 0}</span>
              <div className="text-xs text-ink-secondary">(CON + SIZ) / 10</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">MP Max:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.magicPoints?.maximum || 0}</span>
              <div className="text-xs text-ink-secondary">POW / 5</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Dodge:</span>{' '}
              <span className="text-ink">
                {formData.skills?.dodge?.currentValue ?? formData.derivedStats?.dodge?.value ?? 0}%
              </span>
              <div className="text-xs text-ink-secondary">
                Starts at half DEX ({cocDodgeBase(formData.characteristics?.DEX?.regular || 0)}); raise it on the Skills tab
              </div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Move:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.moveRate || 8}</span>
              <div className="text-xs text-ink-secondary">Based on STR/DEX/SIZ/Age</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">DB:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.damageBonus || '0'}</span>
              <div className="text-xs text-ink-secondary">From STR + SIZ</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Build:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.build || 0}</span>
              <div className="text-xs text-ink-secondary">From STR + SIZ</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Max SAN:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.sanity?.maximum ?? 99}</span>
              <div className="text-xs text-ink-secondary">99 - Cthulhu Mythos</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Major Wound:</span>{' '}
              <span className="text-ink">{formData.derivedStats?.hp?.majorWoundThreshold || 0} HP</span>
              <div className="text-xs text-ink-secondary">Half HP Max, rounded up</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current HP, MP, Luck (editable) */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Current Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="coc-current-hp" className="text-xs text-ink-secondary uppercase block mb-1">Current HP</label>
            <NumberField
id="coc-current-hp"
value={formData.derivedStats?.hp?.current}
              onChange={(v: number) => {
                setFormData({
                  ...formData,
                  derivedStats: {
                    ...formData.derivedStats,
                    hp: { ...formData.derivedStats!.hp, current: v },
                  } as CoC7eDerivedStats,
                });
              }}
              className="w-full text-center text-2xl font-bold text-danger-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
            fallback={0}
            />
          </div>
          <div className="bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="coc-current-mp" className="text-xs text-ink-secondary uppercase block mb-1">Current MP</label>
            <NumberField
id="coc-current-mp"
value={formData.derivedStats?.magicPoints?.current}
              onChange={(v: number) => {
                setFormData({
                  ...formData,
                  derivedStats: {
                    ...formData.derivedStats,
                    magicPoints: {
                      ...formData.derivedStats!.magicPoints,
                      current: v,
                    },
                  } as CoC7eDerivedStats,
                });
              }}
              className="w-full text-center text-2xl font-bold text-spirit-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
            fallback={0}
            />
          </div>
          <div className="bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="coc-luck" className="text-xs text-ink-secondary uppercase block mb-1">Luck Score</label>
            <NumberField
id="coc-luck"
value={formData.derivedStats?.luck?.score}
              onChange={(v: number) => {
                setFormData({
                  ...formData,
                  derivedStats: {
                    ...formData.derivedStats,
                    luck: { ...formData.derivedStats!.luck, score: v },
                  } as CoC7eDerivedStats,
                });
              }}
              className="w-full text-center text-2xl font-bold text-warning-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
            fallback={0}
            />
            <textarea
              value={formData.derivedStats?.luck?.notes ?? ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  derivedStats: {
                    ...prev.derivedStats,
                    luck: { score: prev.derivedStats?.luck?.score ?? 50, ...prev.derivedStats?.luck, notes: e.target.value },
                  } as CoC7eDerivedStats,
                }))
              }
              aria-label="Luck notes"
              placeholder="Notes (e.g. Luck spent)"
              rows={2}
              maxLength={SHEET_LONG_TEXT_MAX}
              className="mt-2 w-full px-2 py-1 text-xs border border-ink/20 rounded-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Current Conditions.
          Major Wound, Dying and Unconscious follow from hit points; Temporary
          and Indefinite Insanity from Sanity. All five are core 7th-edition
          mechanics and all five were readable on the sheet but had nowhere to
          be set, so an investigator could never actually be marked as hurt or
          mad through the app. */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-ink mb-3">Current Conditions</h3>
        <div className="bg-paper border border-ink/20 rounded-md p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {COC7E_CONDITIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={formData.conditions?.[key] ?? false}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    conditions: { ...formData.conditions, [key]: e.target.checked } as CoC7eConditions,
                  });
                }}
                className="rounded-sm border-ink/20 accent-danger focus:ring-brand"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  // Render Skills tab
  const renderSkillsTab = () => (
    <div>
      <SkillsList
        skills={formData.skills || {}}
        tickColour={isCustomColor ? customColorHex : themeColor.hex}
        editable
        onChange={(skillName, field, value) => {
          setFormData({
            ...formData,
            // `skillName` may name a skill inside a group, such as
            // `fighting.brawl`; this writes it there.
            skills: setCoC7eSkillField(formData.skills ?? {}, skillName, field, value) as CoC7eSkills,
          });
        }}
        onListChange={(list, entries) => {
          setFormData((prev) => ({
            ...prev,
            skills: withCoC7eSkillList(prev.skills ?? {}, list, entries) as CoC7eSkills,
          }));
        }}
      />
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div>
      <WeaponsList
        weapons={formData.combat?.weapons || []}
        skills={formData.skills}
        editable
        onChange={(weapons) => {
          setFormData({
            ...formData,
            combat: { ...formData.combat, weapons },
          });
        }}
      />
    </div>
  );

  // Render Possessions tab
  const renderPossessionsTab = () => (
    <div className="space-y-6">
      {/* Wealth */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Wealth</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="coc-spending-level" className="text-sm text-ink-secondary font-semibold block mb-1">Spending Level</label>
            <input
              id="coc-spending-level"
              maxLength={SHEET_SHORT_TEXT_MAX}
              type="text"
              value={formData.wealth?.spendingLevel || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  wealth: { ...formData.wealth, spendingLevel: e.target.value } as CoC7eWealth,
                })
              }
              placeholder="e.g., Average, Wealthy"
              className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="coc-cash" className="text-sm text-ink-secondary font-semibold block mb-1">Cash on Hand</label>
            <NumberField
id="coc-cash"
value={formData.wealth?.cash}
              onChange={(v: number) => setFormData({
                  ...formData,
                  wealth: { ...formData.wealth, cash: v } as CoC7eWealth,
                })
              }
              className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            fallback={0}
            />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="coc-assets" className="text-sm text-ink-secondary font-semibold block mb-1">Assets</label>
          <textarea
            id="coc-assets"
            maxLength={SHEET_LONG_TEXT_MAX}
            value={formData.wealth?.assets || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                wealth: { ...formData.wealth, assets: e.target.value } as CoC7eWealth,
              })
            }
            placeholder="Describe assets, property, investments..."
            rows={2}
            className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="mt-3">
          <label htmlFor="coc-wealth-notes" className="text-sm text-ink-secondary font-semibold block mb-1">Wealth notes</label>
          <textarea
            id="coc-wealth-notes"
            value={formData.wealth?.notes || ''}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, wealth: { ...prev.wealth, notes: e.target.value } as CoC7eWealth }))
            }
            rows={2}
            maxLength={SHEET_LONG_TEXT_MAX}
            className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      {/* Possessions — free-text field */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Possessions & Equipment</h3>
        <ListField
          multiline
          aria-label="Possessions"
          value={Array.isArray(formData.possessions) ? formData.possessions : []}
          onChange={(possessions) => setFormData((prev) => ({ ...prev, possessions }))}
          parse={parsePossessions}
          format={formatPossessions}
          max={SHEET_LIST_MAX}
          noteClassName={LIMIT_NOTE_CLASS}
          placeholder="List possessions, one per line. Format: Item Name - Notes"
          rows={8}
          className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Contacts, which the read-only sheet lists on this tab. */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-ink">Contacts</h3>
          <button
            type="button"
            onClick={() => setFormData((prev) => ({ ...prev, contacts: [...(prev.contacts ?? []), { name: 'New contact', role: '', notes: '' }] }))}
            disabled={listIsFull(formData.contacts)}
            className={`inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-ink ${ADD_BUTTON_OFF}`}
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
        <ListLimitNote full={listIsFull(formData.contacts)} className={LIMIT_NOTE_CLASS} />
        <div className="space-y-2">
          {(formData.contacts ?? []).map((contact, index) => {
            const setContact = (field: 'name' | 'role' | 'notes', value: string) =>
              setFormData((prev) => ({
                ...prev,
                contacts: (prev.contacts ?? []).map((c, i) => (i === index ? { ...c, [field]: value } : c)),
              }));
            return (
              <div key={index} className="bg-paper border border-ink/20 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={contact.name}
                    onChange={(e) => setContact('name', e.target.value)}
                    aria-label={`Name of contact ${index + 1}`}
                    placeholder="Name"
                    maxLength={SHEET_SHORT_TEXT_MAX}
                    className="flex-1 px-2 py-1 border border-ink/20 rounded-sm text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <input
                    type="text"
                    value={contact.role ?? ''}
                    onChange={(e) => setContact('role', e.target.value)}
                    aria-label={`Role of contact ${index + 1}`}
                    placeholder="Role"
                    maxLength={SHEET_SHORT_TEXT_MAX}
                    className="w-40 px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, contacts: (prev.contacts ?? []).filter((_, i) => i !== index) }))}
                    aria-label={`Remove ${contact.name || `contact ${index + 1}`}`}
                    className="p-1 rounded-sm text-danger-ink hover:bg-danger/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={contact.notes ?? ''}
                  onChange={(e) => setContact('notes', e.target.value)}
                  aria-label={`Notes on contact ${index + 1}`}
                  placeholder="Notes"
                  rows={2}
                  maxLength={SHEET_LONG_TEXT_MAX}
                  className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                />
              </div>
            );
          })}
          {(formData.contacts ?? []).length === 0 && <p className="text-sm text-ink-secondary italic">No contacts yet</p>}
        </div>
      </div>
    </div>
  );

  // Render Backstory tab
  const renderBackstoryTab = () => (
    <div className="space-y-6">
      <BackstorySection
        backstory={formData.backstory || {}}
        editable
        onChange={(field, value) => {
          setFormData({
            ...formData,
            backstory: { ...formData.backstory, [field]: value } as CoC7eBackstory,
          });
        }}
      />

      {/* Appearance. Shown on the sheet when reading it, but with no field to
          type into — so these could only ever be empty. */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-3">Appearance</h3>
        <div className="bg-paper border border-ink/20 rounded-md p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {COC_APPEARANCE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`coc-appearance-${key}`} className="text-xs text-ink-secondary uppercase block mb-1">{label}</label>
              <input
                id={`coc-appearance-${key}`}
                maxLength={SHEET_SHORT_TEXT_MAX}
                type="text"
                value={formData.appearance?.[key] ?? ''}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    appearance: { ...formData.appearance, [key]: e.target.value } as CoC7eAppearance,
                  });
                }}
                className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Cthulhu Mythos rating and the spells the investigator knows. Both are
          on the official sheet and neither had anywhere to live in the app. */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-3">Spells &amp; Mythos</h3>
        <div className="bg-paper border border-ink/20 rounded-md p-3 space-y-3">
          <div>
            <label htmlFor="coc-cthulhu-mythos" className="text-xs text-ink-secondary uppercase block mb-1">Cthulhu Mythos</label>
            {/* The skill itself: maximum Sanity is 99 less it, so it stops at 99. */}
            <NumberField
              id="coc-cthulhu-mythos"
              value={formData.skills?.cthulhuMythos?.currentValue}
              min={0}
              max={99}
              fallback={0}
              onChange={(v: number) => {
                setFormData((prev) => ({
                  ...prev,
                  skills: { ...prev.skills, cthulhuMythos: { ...prev.skills?.cthulhuMythos, currentValue: v } } as CoC7eSkills,
                  spellsAndMythos: { spells: prev.spellsAndMythos?.spells ?? [], cthulhuMythos: v },
                }));
              }}
              className="w-24 px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-xs text-ink-secondary uppercase block mb-1">Spells (one per line)</label>
            <ListField
              aria-label="Spells"
              multiline
              rows={4}
              value={formData.spellsAndMythos?.spells ?? []}
              onChange={(spells) => {
                setFormData((prev) => ({
                  ...prev,
                  spellsAndMythos: {
                    cthulhuMythos: prev.spellsAndMythos?.cthulhuMythos ?? 0,
                    spells,
                  },
                }));
              }}
              parse={parseLineList}
              format={formatLineList}
              max={SHEET_LIST_MAX}
              noteClassName={LIMIT_NOTE_CLASS}
              placeholder={'Contact Nyarlathotep\nElder Sign'}
              className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Keeper's Notes. The server sends them to the DM of the character's
          campaign alone, always (empty when nothing is written), and keeps
          them as stored when anyone else saves, so the box is offered only
          when the sheet arrived with the field. */}
      {keeperNotesShown && (
        <div>
          <h3 className="text-lg font-bold text-ink mb-1">Keeper&apos;s Notes</h3>
          <p className="text-sm text-ink-secondary mb-3">Only you, as the Keeper, can see or change these.</p>
          <textarea
            rows={4}
            value={formData.notes ?? ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notes kept by the Keeper about this investigator"
            aria-label="Keeper's Notes"
            maxLength={SHEET_LONG_TEXT_MAX}
            className="w-full bg-paper border border-ink/20 rounded-md p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
      )}
    </div>
  );

  // Main render
  return (
    <div
      className="bg-paper border-2 border-ink/10 rounded-lg overflow-hidden shadow-lg"
      onInputCapture={noteInteraction}
      onChangeCapture={noteInteraction}
      onPointerDownCapture={noteInteraction}
    >
      {renderHeader()}
      {renderTabs()}
      <div className="p-6 bg-paper max-h-[calc(100vh-200px)] overflow-y-auto">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'possessions' && renderPossessionsTab()}
        {activeTab === 'backstory' && renderBackstoryTab()}
      </div>
      {errors.submit && (
        <div className="px-6 py-3 text-sm text-danger-ink bg-paper">{errors.submit}</div>
      )}
    </div>
  );
};

export default CallOfCthulhu7eCharacterEditor;
