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
} from 'lucide-react';
import { Character } from '../../../types';
import type { CharacterData } from '../../../types';
import type {
  CoC7eCharacterData,
  CoC7eCharacteristics,
  CoC7eDerivedStats,
  CoC7eSkills,
  CoC7eCombat,
  CoC7eWealth,
  CoC7eBackstory,
  CoC7eAppearance,
  CoC7eConditions,
  SheetChrome,
} from '../../../types/game-systems';
import { apiErrorMessage } from '@/utils/errors';

/**
 * The sheet as this editor holds it: `CoC7eCharacterData` plus `themeColor`,
 * the header colour chosen in the editor. It is not part of the game system but
 * it is saved with the sheet, because `PUT /characters/:id` validates the body
 * and stores it as sent rather than storing Zod's parsed output.
 */
interface CoC7eFormData extends CoC7eCharacterData, SheetChrome {
  /**
   * Not declared by `CoC7eCharacterData`, which keeps the investigator's name
   * at the top level as `investigatorName`. Only the token-upload filename
   * reads this, so a sheet without it simply falls back to "Investigator".
   */
  personalDetails?: { name?: string };
}
import { CharacteristicBlock } from './components/CharacteristicBlock';
import { orderedCharacteristics } from './characteristics';
import { SanityTracker } from './components/SanityTracker';
import { SkillsList } from './components/SkillsList';
import { WeaponsList } from './components/WeaponsList';
import { BackstorySection } from './components/BackstorySection';
import { api } from '../../../services/api';
import NumberField from '../../ui/NumberField';

interface CallOfCthulhu7eCharacterEditorProps {
  onDirtyChange?: (dirty: boolean) => void;
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

// Call of Cthulhu color presets - Vintage 1920s aesthetic (same as view)
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
 * Calculate damage bonus and build from STR + SIZ
 * Based on Call of Cthulhu 7e rules
 */
const calculateDamageBonusAndBuild = (str: number, siz: number): { damageBonus: string; build: number } => {
  const total = str + siz;
  if (total <= 64) return { damageBonus: '-2', build: -2 };
  if (total <= 84) return { damageBonus: '-1', build: -1 };
  if (total <= 124) return { damageBonus: '0', build: 0 };
  if (total <= 164) return { damageBonus: '+1d4', build: 1 };
  if (total <= 204) return { damageBonus: '+1d6', build: 2 };
  if (total <= 284) return { damageBonus: '+2d6', build: 3 };
  if (total <= 364) return { damageBonus: '+3d6', build: 4 };
  if (total <= 444) return { damageBonus: '+4d6', build: 5 };
  return { damageBonus: '+5d6', build: 6 };
};

/**
 * Calculate Move Rate from STR, DEX, SIZ
 */
const calculateMoveRate = (str: number, dex: number, siz: number, age: number): number => {
  // Standard Move Rate is 8 for most investigators
  // Reduced if both DEX and STR are less than SIZ
  // Further reduced for age
  let moveRate = 8;

  if (str < siz && dex < siz) {
    moveRate = 7;
  } else if (str > siz && dex > siz) {
    moveRate = 9;
  }

  // Age modifications
  if (age >= 40 && age <= 49) moveRate -= 1;
  if (age >= 50 && age <= 59) moveRate -= 2;
  if (age >= 60 && age <= 69) moveRate -= 3;
  if (age >= 70 && age <= 79) moveRate -= 4;
  if (age >= 80) moveRate -= 5;

  return Math.max(1, moveRate);
};

/**
 * CallOfCthulhu7eCharacterEditor - Editable CoC 7e character sheet
 */
export const CallOfCthulhu7eCharacterEditor: React.FC<CallOfCthulhu7eCharacterEditorProps> = ({
  character,
  onSave,
  onCancel,
  onDirtyChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isSaving, setIsSaving] = useState(false);
  const [themeColor, setThemeColor] = useState(COLOR_PRESETS[0]);
  const [isCustomColor, setIsCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const data = character.data as CoC7eFormData;

  // Form state
  const [formData, setFormData] = useState<CoC7eFormData>(() => ({
    ...data,
    // TODO(typing): `{}` has none of the keys these types require, and the
    // effects and inputs below read straight off them. Pre-existing; the casts
    // keep the behaviour for a sheet stored without one exactly as it was.
    characteristics: (data.characteristics || {}) as CoC7eCharacteristics,
    derivedStats: (data.derivedStats || {}) as CoC7eDerivedStats,
    skills: (data.skills || {}) as CoC7eSkills,
    combat: (data.combat || { weapons: [] }) as CoC7eCombat,
    possessions: data.possessions || [],
    wealth: (data.wealth || {}) as CoC7eWealth,
    backstory: (data.backstory || {}) as CoC7eBackstory,
    appearance: (data.appearance || {}) as CoC7eAppearance,
    contacts: data.contacts || [],
    conditions: (data.conditions || {}) as CoC7eConditions,
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
  // presses (add a skill, adjust a track) rather than typing.
  const noteInteraction = () => { hasInteractedRef.current = true; };

  // Token image state
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(
    character.tokenImageUrl
  );

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
      const half = Math.floor(regular / 2);
      const fifth = Math.floor(regular / 5);
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

  // Auto-calculate derived stats
  useEffect(() => {
    const char = formData.characteristics;
    const age = formData.age || 30;

    if (char) {
      const con = char.CON?.regular || 0;
      const siz = char.SIZ?.regular || 0;
      const str = char.STR?.regular || 0;
      const dex = char.DEX?.regular || 0;
      const pow = char.POW?.regular || 0;

      // HP
      const maxHP = Math.floor((con + siz) / 10);
      const majorWoundThreshold = Math.floor(maxHP / 2);

      // Magic Points
      const maxMP = Math.floor(pow / 5);

      // Damage Bonus and Build
      const { damageBonus, build } = calculateDamageBonusAndBuild(str, siz);

      // Move Rate
      const moveRate = calculateMoveRate(str, dex, siz, age);

      // Dodge
      const dodge = Math.floor(dex / 2);

      // Max Sanity (99 - Cthulhu Mythos)
      const cthulhuMythos = formData.skills?.cthulhuMythos?.currentValue || 0;
      const maxSanity = 99 - cthulhuMythos;

      setFormData((prev) => ({
        ...prev,
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
          dodge: {
            value: dodge,
            formula: 'DEX / 2',
            improvementChecked: prev.derivedStats?.dodge?.improvementChecked || false,
          },
          sanity: {
            starting: prev.derivedStats?.sanity?.starting ?? pow,
            maximum: maxSanity,
            current: prev.derivedStats?.sanity?.current ?? pow,
            formula: 'Starts equal to POW; max is 99 minus Cthulhu Mythos skill',
          },
          luck: prev.derivedStats?.luck || { score: 50, notes: '' },
        },
      }));

      // Update dodge skill to match derived dodge
      if (formData.skills?.dodge) {
        setFormData((prev) => ({
          ...prev,
          skills: {
            ...prev.skills,
            dodge: {
              ...prev.skills!.dodge,
              baseValue: dodge,
              currentValue: dodge,
            },
          } as CoC7eSkills,
        }));
      }
    }
  }, [
    formData.characteristics?.CON?.regular,
    formData.characteristics?.SIZ?.regular,
    formData.characteristics?.STR?.regular,
    formData.characteristics?.DEX?.regular,
    formData.characteristics?.POW?.regular,
    formData.age,
    formData.skills?.cthulhuMythos?.currentValue,
  ]);

  // Handle token image selection
  const handleTokenImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    const savedSnapshot = JSON.stringify(formData);
    const markClean = () => {
      cleanSnapshotRef.current = savedSnapshot;
      const stillDirty = JSON.stringify(latestFormDataRef.current) !== savedSnapshot;
      dirtyRef.current = stillDirty;
      onDirtyChange?.(stillDirty);
    };
    setIsSaving(true);
    try {
      // Include color customization in saved data
      const updatedData = {
        ...formData,
        themeColor: isCustomColor ? customColorHex : themeColor.name,
      };

      // Upload token image if a new one was selected
      let newTokenImageUrl: string | undefined = undefined;
      if (tokenImageFile) {
        try {
          const assetFormData = new FormData();
          assetFormData.append('file', tokenImageFile);
          assetFormData.append('type', 'TOKEN');
          if (character.campaignId) {
            assetFormData.append('scope', 'CAMPAIGN');
            assetFormData.append('campaignId', character.campaignId);
          } else {
            assetFormData.append('scope', 'USER');
          }
          assetFormData.append('name', `${formData.personalDetails?.name || 'Investigator'} Token`);

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
      console.error('Failed to save character:', error);
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
      } else if (formData.themeColor.startsWith('#')) {
        // Custom hex color
        setCustomColorHex(formData.themeColor);
        setIsCustomColor(true);
      }
    }
  }, [formData.themeColor]);

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

  // Render header with save/cancel buttons
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

        {/* Action Buttons */}
        <div className="absolute top-4 right-16 flex items-center space-x-2">
        <button
          onClick={handleSave}
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

      {/* pr-64, matching the other sheets: the absolute Save/Cancel cluster is
          203px wide and starts 64px in, so it needs more clearance than the
          pr-48 that was here. */}
      <div className="flex items-start space-x-4 pr-64">
        {/* Token Image */}
        <div className="flex-shrink-0 relative">
          <label htmlFor="token-upload" className="cursor-pointer group">
            {tokenImagePreview ? (
              <img
                src={tokenImagePreview}
                alt={formData.investigatorName || 'Investigator'}
                className="w-24 h-24 rounded-full border-4 border-amber-600/50 object-cover shadow-xl group-hover:opacity-75 transition-opacity"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-amber-600/50 bg-sepia-900 flex items-center justify-center shadow-xl group-hover:bg-sepia-800 transition-colors">
                <Upload className="w-8 h-8 text-amber-400/60" />
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

        {/* Character Info — min-w-0 alongside flex-1 so the column can shrink
            below its content width and stay inside the reserved padding. */}
        <div className="flex-1 min-w-0 space-y-3">
          <input
            type="text"
            value={formData.investigatorName || ''}
            onChange={(e) => setFormData({ ...formData, investigatorName: e.target.value })}
            placeholder="Investigator Name"
            className="text-3xl font-bold bg-white/10 border-2 border-white/30 rounded px-3 py-1 w-full text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />

          <div className="grid grid-cols-3 gap-3">
            {/* Read-only: the player name is whoever owns this investigator,
                filled from their display name at creation. */}
            <span className="text-sm px-2 py-1 text-parchment self-center">
              {formData.playerName || '—'}
            </span>
            <input
              type="text"
              value={formData.occupation || ''}
              onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
              placeholder="Occupation"
              className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              value={formData.era || ''}
              onChange={(e) => setFormData({ ...formData, era: e.target.value })}
              placeholder="Era (e.g., 1920s)"
              className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <NumberField
              value={formData.age ?? 0}
              onChange={(v: number) => setFormData({ ...formData, age: v })}
              placeholder="Age"
              className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
              fallback={0}
            />
            <input
              type="text"
              value={formData.sex || ''}
              onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
              placeholder="Sex"
              className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              value={formData.residence || ''}
              onChange={(e) => setFormData({ ...formData, residence: e.target.value })}
              placeholder="Residence"
              className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 col-span-2 text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <input
            type="text"
            value={formData.birthplace || ''}
            onChange={(e) => setFormData({ ...formData, birthplace: e.target.value })}
            placeholder="Birthplace"
            className="text-sm bg-white/10 border border-white/30 rounded px-2 py-1 w-full text-parchment placeholder:text-parchment-light/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
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
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Characteristics</h3>
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
        maximum={formData.derivedStats?.sanity?.maximum || 99}
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
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Derived Attributes (Auto-Calculated)</h3>
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 space-y-2 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-blue-700 font-semibold">HP Max:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.hp?.maximum || 0}</span>
              <div className="text-xs text-blue-600">(CON + SIZ) / 10</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">MP Max:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.magicPoints?.maximum || 0}</span>
              <div className="text-xs text-blue-600">POW / 5</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">Dodge:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.dodge?.value || 0}%</span>
              <div className="text-xs text-blue-600">DEX / 2</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">Move:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.moveRate || 8}</span>
              <div className="text-xs text-blue-600">Based on STR/DEX/SIZ/Age</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">DB:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.damageBonus || '0'}</span>
              <div className="text-xs text-blue-600">From STR + SIZ</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">Build:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.build || 0}</span>
              <div className="text-xs text-blue-600">From STR + SIZ</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">Max SAN:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.sanity?.maximum || 99}</span>
              <div className="text-xs text-blue-600">99 - Cthulhu Mythos</div>
            </div>
            <div>
              <span className="text-blue-700 font-semibold">Major Wound:</span>{' '}
              <span className="text-blue-900">{formData.derivedStats?.hp?.majorWoundThreshold || 0} HP</span>
              <div className="text-xs text-blue-600">HP Max / 2</div>
            </div>
          </div>
        </div>
      </div>

      {/* Current HP, MP, Luck (editable) */}
      <div>
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Current Status</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-sepia-400 rounded-md p-3">
            <label className="text-xs text-sepia-600 uppercase block mb-1">Current HP</label>
            <NumberField
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
              className="w-full text-center text-2xl font-bold text-red-700 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
            fallback={0}
            />
          </div>
          <div className="bg-white border border-sepia-400 rounded-md p-3">
            <label className="text-xs text-sepia-600 uppercase block mb-1">Current MP</label>
            <NumberField
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
              className="w-full text-center text-2xl font-bold text-purple-700 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-500 rounded"
            fallback={0}
            />
          </div>
          <div className="bg-white border border-sepia-400 rounded-md p-3">
            <label className="text-xs text-sepia-600 uppercase block mb-1">Luck Score</label>
            <NumberField
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
              className="w-full text-center text-2xl font-bold text-yellow-700 border-none bg-transparent focus:outline-none focus:ring-2 focus:ring-yellow-500 rounded"
            fallback={0}
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Render Skills tab
  const renderSkillsTab = () => (
    <div>
      <SkillsList
        skills={formData.skills || {}}
        themeColor={themeColor}
        editable
        onChange={(skillName, field, value) => {
          setFormData({
            ...formData,
            skills: {
              ...formData.skills,
              [skillName]: {
                ...formData.skills![skillName as keyof CoC7eSkills],
                [field]: value,
              },
            } as CoC7eSkills,
          });
        }}
      />
    </div>
  );

  // Render Combat tab
  const renderCombatTab = () => (
    <div>
      <WeaponsList
        weapons={formData.combat?.weapons || []}
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
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Wealth</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-sepia-700 font-semibold block mb-1">Spending Level</label>
            <input
              type="text"
              value={formData.wealth?.spendingLevel || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  wealth: { ...formData.wealth, spendingLevel: e.target.value } as CoC7eWealth,
                })
              }
              placeholder="e.g., Average, Wealthy"
              className="w-full bg-white border border-sepia-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sepia-500"
            />
          </div>
          <div>
            <label className="text-sm text-sepia-700 font-semibold block mb-1">Cash on Hand</label>
            <NumberField
value={formData.wealth?.cash}
              onChange={(v: number) => setFormData({
                  ...formData,
                  wealth: { ...formData.wealth, cash: v } as CoC7eWealth,
                })
              }
              className="w-full bg-white border border-sepia-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sepia-500"
            fallback={0}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-sm text-sepia-700 font-semibold block mb-1">Assets</label>
          <textarea
            value={formData.wealth?.assets || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                wealth: { ...formData.wealth, assets: e.target.value } as CoC7eWealth,
              })
            }
            placeholder="Describe assets, property, investments..."
            rows={2}
            className="w-full bg-white border border-sepia-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sepia-500"
          />
        </div>
      </div>

      {/* Possessions — free-text field */}
      <div>
        <h3 className="text-lg font-bold text-sepia-900 mb-4">Possessions & Equipment</h3>
        <textarea
          value={
            Array.isArray(formData.possessions)
              ? formData.possessions.map((p) => `${p.name}${p.notes ? ` - ${p.notes}` : ''}`).join('\n')
              : ''
          }
          onChange={(e) => {
            const lines = e.target.value.split('\n').filter(line => line.trim());
            const possessions = lines.map(line => {
              const parts = line.split(' - ');
              return { name: parts[0], notes: parts[1] || '' };
            });
            setFormData({ ...formData, possessions });
          }}
          placeholder="List possessions, one per line. Format: Item Name - Notes"
          rows={8}
          className="w-full bg-white border border-sepia-400 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sepia-500"
        />
      </div>
    </div>
  );

  // Render Backstory tab
  const renderBackstoryTab = () => (
    <div>
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
    </div>
  );

  // Main render
  return (
    <div
      className="glass-panel overflow-hidden"
      onInputCapture={noteInteraction}
      onChangeCapture={noteInteraction}
      onPointerDownCapture={noteInteraction}
    >
      {renderHeader()}
      {renderTabs()}
      <div className="p-6 bg-parchment max-h-[calc(100vh-200px)] overflow-y-auto">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'combat' && renderCombatTab()}
        {activeTab === 'possessions' && renderPossessionsTab()}
        {activeTab === 'backstory' && renderBackstoryTab()}
      </div>
    </div>
  );
};

export default CallOfCthulhu7eCharacterEditor;
