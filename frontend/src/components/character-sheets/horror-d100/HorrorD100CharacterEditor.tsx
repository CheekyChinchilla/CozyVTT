// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.
// See GAME_CONTENT_NOTICES.md for the notice and credits.

/**
 * HorrorD100CharacterEditor Component
 *
 * Editable Horror d100 character sheet, rebuilt on the open d100 rules. What
 * the rules work out from the characteristics follows them as they are
 * typed (sheetForm.ts); every other value is the player's, and is saved as
 * it was stored until they change it.
 */

import React, { useState, useEffect, useRef, useId } from 'react';
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
import type { HorrorD100Sheet, HorrorD100SheetAppearance, HorrorD100SheetWealth } from '@/types/game-systems/horrorD100Sheet';
import { apiErrorMessage, errorSummary } from '@/utils/errors';
import { HORROR_D100_CONDITIONS } from '@/utils/conditions';

/**
 * The sheet as this editor holds it: `HorrorD100Sheet`, which carries
 * `themeColor`, the header colour chosen in the editor. It is not part of
 * the game system, but every system's schema declares it, so it is saved
 * with the sheet. The server stores the schema's parsed sheet, so anything
 * this editor writes has to be declared there too.
 */
type HorrorD100FormData = HorrorD100FormSheet;
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { WeaponsList } from './components/WeaponsList';
import { ArmorList } from './components/ArmorList';
import { StoryNotes } from './components/StoryNotes';
import { OriginalValues } from './components/OriginalValues';
import NumberField from '../../ui/NumberField';
import ListField, { parseLineList, formatLineList } from '../../ui/ListField';
import { LIMIT_NOTE_CLASS } from './limitNoteClass';
import { toStoredHexColor, HEX_COLOUR_HINT, headerInk } from '@/utils/themeColor';
import {
  HORROR_D100_CHARACTERISTIC_ROLLS,
  horrorD100DamageModifier,
  horrorD100ExperienceBonus,
  horrorD100MajorWoundLevel,
} from '@/utils/rules/horrorD100';
import {
  HORROR_D100_CHARACTERISTIC_ORDER,
  horrorD100BlasphemousLore,
  horrorD100SheetToSave,
  horrorD100StartingSanity,
  horrorD100FormSheet,
  horrorD100MissingCharacteristics,
  withHorrorD100MissingBlocks,
  type HorrorD100FormSheet,
  withHorrorD100Characteristic,
  withHorrorD100Edu,
  withHorrorD100Skills,
} from './sheetForm';
import { parsePossessions, formatPossessions } from './possessions';
import { HORROR_D100_VALUE_MAX, SHEET_LIST_MAX, SHEET_LONG_TEXT_MAX, SHEET_NAME_MAX, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import ListLimitNote, { ADD_BUTTON_OFF, listIsFull } from '../ListLimitNote';
import PortraitNotes from '../PortraitNotes';
import { tokenPictureProblem, uploadTokenPicture } from '@/utils/tokenPicture';
import { useServerConfigQuery } from '@/hooks/queries';
import { COLOR_PRESETS } from './colorPresets';
import { SheetTabs, sheetTabPanel, type SheetTab } from '../SheetTabs';

interface HorrorD100CharacterEditorProps {
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
  /** Whether to offer a token picture to upload; see CharacterSheetProps. */
  allowTokenPicture?: boolean;
}

type TabId = 'overview' | 'skills' | 'combat' | 'possessions' | 'story';

/** The required names Save checks, whose old messages a new check replaces. */
const REQUIRED_NAMES_CHECKED = { profession: true, era: true, characteristics: true };

/** "STR, CON and POW". */
const listed = (names: readonly string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** Where Save keeps what is wrong with a list's names: "weapons.2.name". */
const LIST_NAME_ERROR = /^(weapons|armor)\.(\d+)\.name$/;

const TABS: SheetTab<TabId>[] = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'skills', label: 'Skills', icon: Target },
  { id: 'combat', label: 'Combat', icon: Swords },
  { id: 'possessions', label: 'Possessions', icon: Package },
  { id: 'story', label: 'Story', icon: BookText },
];

/** The appearance fields, in the order the sheet shows them. */
const HORROR_D100_APPEARANCE_FIELDS: { key: keyof HorrorD100SheetAppearance; label: string }[] = [
  { key: 'age', label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes', label: 'Eyes' },
  { key: 'hair', label: 'Hair' },
  { key: 'skin', label: 'Skin' },
];

/**
 * The stored age as the Age box takes it. The schema stores every age as
 * text, and a template or the API may have stored text that is not a whole
 * number, which a number box cannot show: that is returned as `text`, for the
 * header to show and keep until a number is typed. A sheet with no age shows
 * 0, and an empty age an empty box, as they always have; an empty age is kept
 * empty until a number is typed.
 */
function splitStoredAge(age: string | number | undefined): { number: number | null; text: string | null } {
  if (age === undefined) return { number: 0, text: null };
  if (typeof age === 'number') return { number: age, text: null };
  const trimmed = age.trim();
  if (trimmed === '') return { number: null, text: null };
  if (/^\d+$/.test(trimmed)) return { number: Number(trimmed), text: null };
  return { number: null, text: age };
}

/**
 * HorrorD100CharacterEditor - Editable Horror d100 character sheet
 */
export const HorrorD100CharacterEditor: React.FC<HorrorD100CharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
  onDirtyChange,
  onDone,
  allowTokenPicture = true,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const sheetTabsId = useId();
  const [isSaving, setIsSaving] = useState(false);
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: serverConfig } = useServerConfigQuery();

  const data = character.data as HorrorD100Sheet;
  // The GM is sent the notes field always, and nobody else ever is.
  const gmNotesShown = typeof data.notes === 'string';

  // Form state: the sheet as stored (sheetForm.ts). Nothing is recalculated
  // as it opens, so opening and saving a sheet stores what was stored. A
  // block the sheet lacks is not put here: `shown`, below, works it out from
  // the characteristics for the screen and for Save, so it follows them
  // until the player types in it.
  const [formData, setFormData] = useState<HorrorD100FormData>(() => horrorD100FormSheet(data));

  // Age is asked in the header. A sheet can also store one under Appearance,
  // which is shown there as it was typed; the box for it is offered only on a
  // sheet that opened with one, so no new sheet is asked its age twice.
  const [hasAppearanceAge] = useState(() => {
    const stored = horrorD100FormSheet(data).appearance?.age;
    return stored !== undefined && stored !== null && String(stored) !== '';
  });

  // Report the first edit up to whoever is hosting this sheet, so leaving with
  // unsaved work can be caught. One effect on the whole form rather than a call
  // in each of the ~40 field handlers: it cannot be forgotten when a field is
  // added, and it catches changes made any way at all. The initial render is
  // skipped, and the flag is reset after a successful save.
  //
  // Until the first real interaction the baseline simply follows the form, so
  // anything that settles as the editor mounts (the header colour read from
  // the sheet) is not taken for an edit. From the first interaction onwards
  // the baseline is frozen and edits are measured against it, which also means
  // typing a value and putting it back reads as clean, as it should.
  const dirtyRef = useRef(false);
  // The EDU the sheet held when Use EDU was last unticked in this edit, so
  // ticking it again puts it back. Undefined until then: a sheet with no EDU
  // takes it up at 10.
  const droppedEduRef = useRef<number | undefined>(undefined);
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
    // Names the server requires: say which are missing, and open the tab of the first.
    const blank = (value: string | undefined) => (value ?? '').trim() === '';
    const missing: Record<string, string> = {};
    if (blank(formData.profession)) missing.profession = 'Profession is required';
    if (blank(formData.era)) missing.era = 'Era is required';
    // A characteristic the sheet lacks is typed, never taken for 0.
    const absent = horrorD100MissingCharacteristics(formData);
    if (absent.length > 0) missing.characteristics = `Type a value for each characteristic: ${listed(absent)} ${absent.length === 1 ? 'is' : 'are'} missing`;
    (formData.weapons ?? []).forEach((weapon, i) => {
      if (blank(weapon.name)) missing[`weapons.${i}.name`] = 'Name this weapon, or remove it';
    });
    (formData.armor ?? []).forEach((piece, i) => {
      if (blank(piece.name)) missing[`armor.${i}.name`] = 'Name this armor, or remove it';
    });
    setErrors((prev) => {
      const kept = Object.fromEntries(Object.entries(prev).filter(([key]) => !(key in REQUIRED_NAMES_CHECKED) && !LIST_NAME_ERROR.test(key)));
      return { ...kept, ...missing };
    });
    if (Object.keys(missing).length > 0) {
      if (missing.characteristics) setActiveTab('overview');
      else if (Object.keys(missing).some((key) => LIST_NAME_ERROR.test(key))) setActiveTab('combat');
      return;
    }
    const sheetToSave = horrorD100SheetToSave(formData);
    if (!sheetToSave) return;
    setIsSaving(true);
    try {
      // Include color customization in saved data. The numbers that followed
      // a characteristic are held within what a sheet stores here, once.
      const updatedData = {
        ...sheetToSave,
        // TODO(sheets): a stored preset name the list does not have is saved as
        // the first preset's name, so opening and saving the sheet changes it.
        // Save it back as it was until another colour is picked, as the
        // Fantasy d20 editor does.
        themeColor: isCustomColor ? (toStoredHexColor(customColorHex) ?? '') : themeColor.name,
      };

      // Upload token image if a new one was selected
      let newTokenImageUrl: string | undefined = undefined;
      if (tokenImageFile) {
        try {
          newTokenImageUrl = await uploadTokenPicture(tokenImageFile, formData.characterName || 'Character', character.campaignId);
        } catch (uploadError: unknown) {
          console.error('Error uploading token image:', errorSummary(uploadError));
          setErrors((prev) => ({ ...prev, tokenImage: apiErrorMessage(uploadError) || 'Failed to upload token image' }));
          setIsSaving(false);
          return;
        }
      }

      // Pass the tokenImageUrl as a separate parameter if it was uploaded
      await onSave(updatedData, true, newTokenImageUrl);
      markClean();
    } catch (error) {
      console.error('Failed to save character:', errorSummary(error));
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

    // Text and boxes light on a dark header and dark on a pale one, as the
    // read-only sheet's.
    const ink = headerInk(isCustomColor ? customColorHex : themeColor.hex);
    const dark = ink.text === 'text-black';
    const box = dark
      ? 'bg-black/5 border-black/30 placeholder:text-black/50 focus:ring-black/40'
      : 'bg-white/10 border-white/30 placeholder:text-white/50 focus:ring-white/60';
    const refusedBox = dark ? 'border-2 border-black' : 'border-2 border-white';
    const age = splitStoredAge(formData.age);
    const headerClasses = isCustomColor
      ? `${ink.text} p-3 sm:p-6 rounded-t-lg relative border-b-4 ${ink.border}`
      : `bg-linear-to-r/srgb ${themeColor.from} ${themeColor.via} ${themeColor.to} ${ink.text} p-3 sm:p-6 rounded-t-lg relative border-b-4 ${themeColor.border}`;

    return (
      <div data-sheet-header className={headerClasses} style={headerStyle}>
        {/* Color Picker Button */}
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className={`absolute top-4 right-4 p-2 ${ink.button} rounded-lg transition-colors`}
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
        <div className="flex justify-end items-center space-x-2 mb-4 mr-12 sm:absolute sm:top-4 sm:right-16 sm:mb-0 sm:mr-0">
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
          className={`px-4 py-2 ${ink.button} ${ink.text} rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-lg`}
        >
          <X className="w-4 h-4" />
          <span>Cancel</span>
        </button>
      </div>

      {/* sm:pr-64, matching the other sheets: from sm up the absolute
          Save/Cancel cluster is 203px wide and starts 64px in, so it needs
          more clearance than the pr-48 that was here. On a phone the cluster
          is in the flow above this row instead, and the portrait is above the
          name. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:pr-64">
        {/* Token Image, as wide as the portrait so its caption wraps under
            it. */}
        {allowTokenPicture && (
        <div className="shrink-0 relative w-24">
          <label htmlFor="token-upload" className="cursor-pointer group">
            {tokenImagePreview ? (
              <img
                src={tokenImagePreview}
                alt={formData.characterName || 'Character'}
                className={`w-24 h-24 rounded-full border-4 ${ink.border} object-cover shadow-xl group-hover:opacity-75 transition-opacity`}
              />
            ) : (
              <div className={`w-24 h-24 rounded-full border-4 ${ink.border} bg-black/70 flex items-center justify-center shadow-xl group-hover:bg-black/60 transition-colors`}>
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
          <PortraitNotes error={errors.tokenImage} personal={!character.campaignId} errorClassName={ink.soft} noteClassName={ink.soft} />
        </div>
        )}

        {/* Character Info — min-w-0 alongside flex-1 so the column can shrink
            below its content width and stay inside the reserved padding. In
            the phone's column it simply takes the full width. */}
        <div className="sm:flex-1 min-w-0 space-y-3">
          <input
            type="text"
            value={formData.characterName || ''}
            onChange={(e) => setFormData({ ...formData, characterName: e.target.value })}
            maxLength={SHEET_NAME_MAX}
            placeholder="Character Name"
            aria-label="Character name"
            className={`text-3xl font-bold border-2 ${box} rounded-sm px-3 py-1 w-full ${ink.text} focus:outline-hidden focus:ring-2`}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Read-only: the player name is whoever owns this character,
                filled from their display name at creation. */}
            <span className={`text-sm px-2 py-1 ${ink.text} self-center`}>
              <span className={ink.soft}>Player:</span> {formData.playerName || '—'}
            </span>
            <input
              type="text"
              value={formData.profession || ''}
              onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
              placeholder="Profession"
              aria-label="Profession"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className={`text-sm ${box} ${errors.profession ? refusedBox : 'border'} rounded-sm px-2 py-1 ${ink.text} focus:outline-hidden focus:ring-2`}
            />
            <input
              type="text"
              value={formData.era || ''}
              onChange={(e) => setFormData({ ...formData, era: e.target.value })}
              placeholder="Era (e.g., 1920s)"
              aria-label="Era"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className={`text-sm ${box} ${errors.era ? refusedBox : 'border'} rounded-sm px-2 py-1 ${ink.text} focus:outline-hidden focus:ring-2`}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* While the age is text or empty, leaving the box empty keeps it. */}
            <NumberField
              value={age.number}
              onChange={(v: number) => setFormData({ ...formData, age: v })}
              placeholder="Age"
              aria-label="Age"
              className={`text-sm border ${box} rounded-sm px-2 py-1 ${ink.text} focus:outline-hidden focus:ring-2`}
              fallback={age.number === null ? null : 0}
            />
            <input
              type="text"
              value={formData.sex || ''}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
              placeholder="Sex"
              aria-label="Sex"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className={`text-sm border ${box} rounded-sm px-2 py-1 ${ink.text} focus:outline-hidden focus:ring-2`}
            />
            <input
              type="text"
              value={formData.residence || ''}
              onChange={(e) => setFormData({ ...formData, residence: e.target.value })}
              placeholder="Residence"
              aria-label="Residence"
              maxLength={SHEET_SHORT_TEXT_MAX}
              className={`text-sm border ${box} rounded-sm px-2 py-1 col-span-2 ${ink.text} focus:outline-hidden focus:ring-2`}
            />
          </div>
          {age.text !== null && (
            <p className={`text-xs ${ink.soft}`}>
              Age saved as text: <span className="font-medium">{age.text}</span>. Type a number to replace it.
            </p>
          )}

          <input
            type="text"
            value={formData.birthplace || ''}
            onChange={(e) => setFormData({ ...formData, birthplace: e.target.value })}
            placeholder="Birthplace"
            aria-label="Birthplace"
            maxLength={SHEET_SHORT_TEXT_MAX}
            className={`text-sm border ${box} rounded-sm px-2 py-1 w-full ${ink.text} focus:outline-hidden focus:ring-2`}
          />
        </div>
      </div>
    </div>
    );
  };

  /** What Save found wrong with the names in one list, by each entry's place in it. */
  const nameErrorsOf = (list: 'weapons' | 'armor'): Record<number, string> =>
    Object.fromEntries(
      Object.entries(errors).flatMap(([key, message]) => {
        const at = LIST_NAME_ERROR.exec(key);
        return at && at[1] === list && message ? [[Number(at[2]), message]] : [];
      })
    );

  // The sheet as it is shown: the form, with each block it lacks worked out
  // from its characteristics where they are there to work it out from.
  const shown = withHorrorD100MissingBlocks(formData);
  const characteristics = formData.characteristics;
  const missingCharacteristics = errors.characteristics ? horrorD100MissingCharacteristics(formData) : [];
  const has = (...keys: (keyof typeof characteristics)[]) => keys.every((key) => typeof characteristics[key] === 'number');
  const usesEdu = characteristics.EDU !== undefined;
  const blasphemousLore = horrorD100BlasphemousLore(shown.skills);

  // Render Overview tab
  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Characteristics */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Characteristics</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-4">
          {HORROR_D100_CHARACTERISTIC_ORDER.filter((key) => key !== 'EDU' || usesEdu).map((key) => (
            <CharacteristicBlock
              key={key}
              label={key}
              value={characteristics[key]}
              invalid={missingCharacteristics.includes(key)}
              roll={key === 'SIZ' ? undefined : HORROR_D100_CHARACTERISTIC_ROLLS[key]}
              editable
              onChange={(value) => setFormData((prev) => withHorrorD100Characteristic(prev, key, value))}
            />
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={usesEdu}
            onChange={(e) => {
              // Unticked by mistake and ticked again, EDU comes back as it was.
              if (!e.target.checked && characteristics.EDU !== undefined) droppedEduRef.current = characteristics.EDU;
              const edu = droppedEduRef.current;
              setFormData((prev) => withHorrorD100Edu(prev, e.target.checked, edu));
            }}
            className="rounded-sm border-ink/20 accent-brand focus:ring-brand"
          />
          Use EDU, the optional characteristic for education
        </label>
        <p className="mt-1 text-xs text-ink-secondary">
          Under each characteristic is the roll it gives, at five times its value. Luck is the POW roll.
        </p>
      </div>

      {/* Sanity Tracker */}
      {shown.sanity ? (
        <div>
          <SanityTracker
            current={shown.sanity.current}
            starting={shown.sanity.starting}
            maximum={shown.sanity.maximum}
            blasphemousLore={blasphemousLore}
            editable
            onChange={{
              current: (value) => setFormData((prev) => {
                const sanity = withHorrorD100MissingBlocks(prev).sanity;
                return sanity ? { ...prev, sanity: { ...sanity, current: value } } : prev;
              }),
              starting: (value) => setFormData((prev) => {
                const sanity = withHorrorD100MissingBlocks(prev).sanity;
                return sanity ? { ...prev, sanity: { ...sanity, starting: value } } : prev;
              }),
            }}
          />
          <p className="mt-1 text-xs text-ink-secondary">
            A new character&apos;s Sanity starts at five times POW ({horrorD100StartingSanity(characteristics.POW)}).
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-secondary italic">Sanity is worked out once POW is typed: it starts at five times POW.</p>
      )}

      {/* Derived Stats (showing auto-calculated values) */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Derived Attributes (Auto-Calculated)</h3>
        <div className="bg-info/10 border border-info/30 rounded-lg p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <span className="text-info-ink font-semibold">HP Max:</span>{' '}
              <span className="text-ink">{shown.hitPoints?.maximum ?? '—'}</span>
              <div className="text-xs text-ink-secondary">(CON + SIZ) / 2, rounded up</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Major Wound:</span>{' '}
              <span className="text-ink">{shown.hitPoints ? `${horrorD100MajorWoundLevel(shown.hitPoints.maximum)} HP` : '—'}</span>
              <div className="text-xs text-ink-secondary">Half HP Max, rounded up</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">PP Max:</span>{' '}
              <span className="text-ink">{shown.powerPoints?.maximum ?? '—'}</span>
              <div className="text-xs text-ink-secondary">Equal to POW</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Damage Modifier:</span>{' '}
              <span className="text-ink">{has('STR', 'SIZ') ? horrorD100DamageModifier(characteristics.STR ?? 0, characteristics.SIZ ?? 0) : '—'}</span>
              <div className="text-xs text-ink-secondary">From STR + SIZ</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Experience Bonus:</span>{' '}
              <span className="text-ink">{has('INT') ? `+${horrorD100ExperienceBonus(characteristics.INT ?? 0)}%` : '—'}</span>
              <div className="text-xs text-ink-secondary">Half INT, rounded up</div>
            </div>
            <div>
              <span className="text-info-ink font-semibold">Max SAN:</span>{' '}
              <span className="text-ink">{shown.sanity?.maximum ?? '—'}</span>
              <div className="text-xs text-ink-secondary">100 − Blasphemous Lore, at most 99</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current hit points and power points, and MOV (editable) */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Current Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="horror-d100-current-hp" className="text-xs text-ink-secondary uppercase block mb-1">Current HP</label>
            {/* No lowest: hit points lost past 0 are kept track of. */}
            <NumberField
              id="horror-d100-current-hp"
              value={shown.hitPoints?.current}
              onChange={(v: number) => setFormData((prev) => {
                const hitPoints = withHorrorD100MissingBlocks(prev).hitPoints;
                return hitPoints ? { ...prev, hitPoints: { ...hitPoints, current: v } } : prev;
              })}
              className="w-full text-center text-2xl font-bold text-danger-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
              fallback={shown.hitPoints ? 0 : null}
            />
          </div>
          <div className="bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="horror-d100-current-pp" className="text-xs text-ink-secondary uppercase block mb-1">Current PP</label>
            <NumberField
              id="horror-d100-current-pp"
              value={shown.powerPoints?.current}
              onChange={(v: number) => setFormData((prev) => {
                const powerPoints = withHorrorD100MissingBlocks(prev).powerPoints;
                return powerPoints ? { ...prev, powerPoints: { ...powerPoints, current: v } } : prev;
              })}
              className="w-full text-center text-2xl font-bold text-spirit-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
              min={0}
              fallback={shown.powerPoints ? 0 : null}
            />
          </div>
          {/* Under hit points and power points on a phone, across both. */}
          <div className="col-span-2 sm:col-span-1 bg-paper border border-ink/20 rounded-md p-3">
            <label htmlFor="horror-d100-move" className="text-xs text-ink-secondary uppercase block mb-1">MOV</label>
            <NumberField
              id="horror-d100-move"
              value={shown.move}
              onChange={(v: number) => setFormData((prev) => ({ ...prev, move: v }))}
              className="w-full text-center text-2xl font-bold text-ink border-none bg-transparent focus:outline-hidden focus:ring-2 focus:ring-brand rounded-sm"
              min={0}
              max={HORROR_D100_VALUE_MAX}
              fallback={0}
            />
            <div className="text-xs text-ink-secondary text-center">10 for a human</div>
          </div>
        </div>
      </div>

      {/* Current Conditions.
          Major Wound, Dying and Unconscious follow from hit points; Temporary
          Insanity from Sanity. */}
      <div className="mt-6">
        <h3 className="text-lg font-bold text-ink mb-3">Current Conditions</h3>
        <div className="bg-paper border border-ink/20 rounded-md p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          {HORROR_D100_CONDITIONS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={formData.conditions?.[key] ?? false}
                onChange={(e) => setFormData((prev) => ({ ...prev, conditions: { ...prev.conditions, [key]: e.target.checked } }))}
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
        skills={shown.skills ?? {}}
        characteristics={characteristics}
        tickColour={isCustomColor ? customColorHex : themeColor.hex}
        editable
        onChange={(changed) => setFormData((prev) => {
          const skills = withHorrorD100MissingBlocks(prev).skills;
          return skills ? withHorrorD100Skills(prev, { ...skills, ...changed }) : prev;
        })}
      />
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div className="space-y-6">
      <WeaponsList
        weapons={formData.weapons ?? []}
        skills={shown.skills}
        editable
        nameErrors={nameErrorsOf('weapons')}
        onChange={(weapons) => setFormData((prev) => ({ ...prev, weapons }))}
      />
      <ArmorList
        armor={formData.armor ?? []}
        editable
        nameErrors={nameErrorsOf('armor')}
        onChange={(armor) => setFormData((prev) => ({ ...prev, armor }))}
      />
    </div>
  );

  /** One field of the wealth block set. */
  const setWealth = <K extends keyof HorrorD100SheetWealth>(field: K, value: HorrorD100SheetWealth[K]) =>
    setFormData((prev) => ({ ...prev, wealth: { ...prev.wealth, [field]: value } }));

  // Render Possessions tab
  const renderPossessionsTab = () => (
    <div className="space-y-6">
      {/* Wealth */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-4">Wealth</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="horror-d100-wealth-level" className="text-sm text-ink-secondary font-semibold block mb-1">Wealth Level</label>
            <input
              id="horror-d100-wealth-level"
              maxLength={SHEET_SHORT_TEXT_MAX}
              type="text"
              value={formData.wealth?.level || ''}
              onChange={(e) => setWealth('level', e.target.value)}
              placeholder="e.g., Average, Affluent"
              className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="horror-d100-cash" className="text-sm text-ink-secondary font-semibold block mb-1">Cash on Hand</label>
            <NumberField
              id="horror-d100-cash"
              value={formData.wealth?.cash}
              onChange={(v: number) => setWealth('cash', v)}
              className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
              min={0}
              // Cash can hold a part of a coin, which the sheet stores as it is.
              integer={false}
              step="any"
              fallback={formData.wealth?.cash === undefined ? null : 0}
            />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="horror-d100-assets" className="text-sm text-ink-secondary font-semibold block mb-1">Assets</label>
          <textarea
            id="horror-d100-assets"
            maxLength={SHEET_LONG_TEXT_MAX}
            value={formData.wealth?.assets || ''}
            onChange={(e) => setWealth('assets', e.target.value)}
            placeholder="Describe assets, property, investments..."
            rows={2}
            className="w-full bg-paper border border-ink/20 rounded-sm px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="mt-3">
          <label htmlFor="horror-d100-wealth-notes" className="text-sm text-ink-secondary font-semibold block mb-1">Wealth notes</label>
          <textarea
            id="horror-d100-wealth-notes"
            value={formData.wealth?.notes || ''}
            onChange={(e) => setWealth('notes', e.target.value)}
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
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 mb-4">
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
                {/* Below sm the role takes a line of its own under the name
                    and the remove button. */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <input
                    type="text"
                    value={contact.name}
                    onChange={(e) => setContact('name', e.target.value)}
                    aria-label={`Name of contact ${index + 1}`}
                    placeholder="Name"
                    maxLength={SHEET_SHORT_TEXT_MAX}
                    className="min-w-0 flex-1 px-2 py-1 border border-ink/20 rounded-sm text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <input
                    type="text"
                    value={contact.role ?? ''}
                    onChange={(e) => setContact('role', e.target.value)}
                    aria-label={`Role of contact ${index + 1}`}
                    placeholder="Role"
                    maxLength={SHEET_SHORT_TEXT_MAX}
                    className="order-last w-full sm:order-none sm:w-40 px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, contacts: (prev.contacts ?? []).filter((_, i) => i !== index) }))}
                    aria-label={`Remove ${contact.name || `contact ${index + 1}`}`}
                    className="touch-target inline-flex items-center justify-center p-1 rounded-sm text-danger-ink hover:bg-danger/10"
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

  // Render Story tab
  const renderStoryTab = () => (
    <div className="space-y-6">
      <StoryNotes
        notes={formData.story ?? []}
        editable
        onChange={(story) => setFormData((prev) => ({ ...prev, story }))}
      />

      {/* Distinctive features: what sets the character apart at a glance. */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-3">Distinctive Features</h3>
        <p className="text-xs text-ink-secondary uppercase mb-1">One per line</p>
        <ListField
          aria-label="Distinctive features"
          multiline
          rows={3}
          value={formData.distinctiveFeatures ?? []}
          onChange={(distinctiveFeatures) => setFormData((prev) => ({ ...prev, distinctiveFeatures }))}
          parse={parseLineList}
          format={formatLineList}
          max={SHEET_LIST_MAX}
          noteClassName={LIMIT_NOTE_CLASS}
          placeholder={'A scar above the left eyebrow\nAlways wears a grey scarf'}
          className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Appearance */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-3">Appearance</h3>
        <div className="bg-paper border border-ink/20 rounded-md p-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {HORROR_D100_APPEARANCE_FIELDS.filter(({ key }) => key !== 'age' || hasAppearanceAge).map(({ key, label }) => (
            <div key={key}>
              <label htmlFor={`horror-d100-appearance-${key}`} className="text-xs text-ink-secondary uppercase block mb-1">{label}</label>
              <input
                id={`horror-d100-appearance-${key}`}
                maxLength={SHEET_SHORT_TEXT_MAX}
                type="text"
                value={formData.appearance?.[key] ?? ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, appearance: { ...prev.appearance, [key]: e.target.value } }))}
                className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
              />
            </div>
          ))}
        </div>
      </div>

      {/* The spells the character knows. */}
      <div>
        <h3 className="text-lg font-bold text-ink mb-3">Spells</h3>
        <p className="text-xs text-ink-secondary uppercase mb-1">One per line</p>
        <ListField
          aria-label="Spells"
          multiline
          rows={4}
          value={formData.spells ?? []}
          onChange={(spells) => setFormData((prev) => ({ ...prev, spells }))}
          parse={parseLineList}
          format={formatLineList}
          max={SHEET_LIST_MAX}
          noteClassName={LIMIT_NOTE_CLASS}
          placeholder={'Call the Grey Lantern\nWard of Ash'}
          className="w-full px-2 py-1 border border-ink/20 rounded-sm text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* GM's Notes. The server sends them to the GM of the character's
          campaign alone, always (empty when nothing is written), and keeps
          them as stored when anyone else saves, so the box is offered only
          when the sheet arrived with the field. */}
      {gmNotesShown && (
        <div>
          <h3 className="text-lg font-bold text-ink mb-1">GM&apos;s Notes</h3>
          <p className="text-sm text-ink-secondary mb-3">Only you, as the GM, can see or change these.</p>
          <textarea
            rows={4}
            value={formData.notes ?? ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notes kept by the GM about this character"
            aria-label="GM's Notes"
            maxLength={SHEET_LONG_TEXT_MAX}
            className="w-full bg-paper border border-ink/20 rounded-md p-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand"
          />
        </div>
      )}

      {/* The values the sheet held before it was rebuilt. Only the
          character's owner and the GM can open this editor, and they are the
          ones shown them. The record is saved back as it was sent. */}
      {formData.converted && <OriginalValues record={formData.converted} />}
    </div>
  );

  // Main render
  const refusals = [
    ...new Set(
      Object.entries(errors)
        .filter(([key, message]) => message && (key in REQUIRED_NAMES_CHECKED || LIST_NAME_ERROR.test(key)))
        .map(([, message]) => message)
    ),
  ];

  return (
    <div
      className="bg-paper border-2 border-ink/10 rounded-lg overflow-hidden shadow-lg"
      onInputCapture={noteInteraction}
      onChangeCapture={noteInteraction}
      onPointerDownCapture={noteInteraction}
    >
      {renderHeader()}
      <SheetTabs id={sheetTabsId} tabs={TABS} active={activeTab} onSelect={setActiveTab} underline={isCustomColor ? customColorHex : themeColor.hex} />
      {refusals.length > 0 && (
        <div role="alert" className="mx-3 sm:mx-6 mt-4 px-3 py-2 text-sm text-danger-ink bg-danger/10 border border-danger/30 rounded-lg">
          <p className="font-semibold">This sheet can&apos;t be saved yet:</p>
          <ul className="list-disc pl-5">
            {refusals.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {/* From sm up a tab scrolls in a box of its own, under the header and
          the tabs. On a phone the sheet scrolls as one, in the shell's own
          scroller, with no second scroller inside it sized from a 100vh that
          is taller than the part of the screen the browser shows. */}
      <div data-sheet-body {...sheetTabPanel(sheetTabsId, activeTab)} className="p-3 sm:p-6 bg-paper sm:max-h-[calc(100vh-200px)] sm:overflow-y-auto">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'possessions' && renderPossessionsTab()}
        {activeTab === 'story' && renderStoryTab()}
      </div>
      {errors.submit && (
        <div className="px-3 sm:px-6 py-3 text-sm text-danger-ink bg-paper">{errors.submit}</div>
      )}
    </div>
  );
};

export default HorrorD100CharacterEditor;
