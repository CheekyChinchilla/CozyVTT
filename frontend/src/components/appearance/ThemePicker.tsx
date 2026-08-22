/**
 * ThemePicker
 *
 * Presentational theme + font picker shared between AdminPage (Appearance tab)
 * and ProfilePage (Preferences). Live-previews theme/font on click via the
 * existing applyThemeColors / applyFont helpers — the parent decides when to
 * persist the choice (admin saves to SystemSettings, profile saves to
 * User.preferences).
 */

import { Palette, Settings, AlertTriangle, Check } from 'lucide-react';
import {
  PRESET_THEMES,
  FONT_OPTIONS,
  applyThemeColors,
  applyFont,
  buildCustomThemeColors,
  hexToRgbChannels,
  type FontOption,
} from '../../themes';
import { contrastRatioChannels, AA_TEXT } from '../../utils/color';

export interface ThemePickerColors {
  primary: string;
  accent: string;
  background: string;
  text: string;
}

export interface ThemePickerValue {
  themeId: string;
  fontId: string;
  customColors: ThemePickerColors;
}

interface ThemePickerProps {
  themeId: string;
  fontId: string;
  customColors: ThemePickerColors;
  onChange: (next: ThemePickerValue) => void;
  /** When true (default), clicking a swatch immediately re-paints the page. */
  livePreview?: boolean;
}

export const DEFAULT_CUSTOM_COLORS: ThemePickerColors = {
  primary: '#7C9A6E',
  accent: '#D4A55A',
  background: '#FAF6EC',
  text: '#3A2E26',
};

export default function ThemePicker({
  themeId,
  fontId,
  customColors,
  onChange,
  livePreview = true,
}: ThemePickerProps) {
  const previewCustom = (next: ThemePickerColors) => {
    if (!livePreview) return;
    applyThemeColors(
      buildCustomThemeColors({
        primary: hexToRgbChannels(next.primary),
        accent: hexToRgbChannels(next.accent),
        background: hexToRgbChannels(next.background),
        text: hexToRgbChannels(next.text),
      })
    );
  };

  const handlePreset = (id: string) => {
    const theme = PRESET_THEMES.find(t => t.id === id);
    if (theme && livePreview) applyThemeColors(theme.colors);
    onChange({ themeId: id, fontId, customColors });
  };

  const handleCustom = () => {
    previewCustom(customColors);
    onChange({ themeId: 'custom', fontId, customColors });
  };

  const handleCustomColor = (key: keyof ThemePickerColors, value: string) => {
    const updated = { ...customColors, [key]: value };
    previewCustom(updated);
    onChange({ themeId: 'custom', fontId, customColors: updated });
  };

  const handleFont = (font: FontOption) => {
    if (livePreview) applyFont(font);
    onChange({ themeId, fontId: font.id, customColors });
  };

  return (
    <>
      {/* Theme Picker */}
      <section className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-warm-gray/20">
          <Palette className="w-4 h-4 text-warm-amber" />
          <h3 className="font-semibold text-brand-ink text-sm">Color Theme</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {PRESET_THEMES.map(theme => {
            const isSelected = themeId === theme.id;
            const [brandR, brandG, brandB] = theme.colors.brand.split(' ');
            const [accentR, accentG, accentB] = theme.colors.accent.split(' ');
            const [bgR, bgG, bgB] = theme.colors.bgBase.split(' ');
            const [inkR, inkG, inkB] = theme.colors.ink.split(' ');
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handlePreset(theme.id)}
                className={`relative p-3 rounded-cozy border-2 text-left transition-all ${
                  isSelected
                    ? 'border-moss-green shadow-md ring-2 ring-moss-green/30'
                    : 'border-warm-gray/20 hover:border-warm-gray/40'
                }`}
                style={{ backgroundColor: `rgb(${bgR},${bgG},${bgB})` }}
                aria-pressed={isSelected}
              >
                <div className="flex gap-1.5 mb-2">
                  <span
                    className="w-5 h-5 rounded-full border border-black/10"
                    style={{ backgroundColor: `rgb(${brandR},${brandG},${brandB})` }}
                  />
                  <span
                    className="w-5 h-5 rounded-full border border-black/10"
                    style={{ backgroundColor: `rgb(${accentR},${accentG},${accentB})` }}
                  />
                  <span
                    className="w-5 h-5 rounded-full border border-black/10"
                    style={{ backgroundColor: `rgb(${inkR},${inkG},${inkB})` }}
                  />
                </div>
                <p
                  className="text-xs font-medium"
                  style={{ color: `rgb(${inkR},${inkG},${inkB})` }}
                >
                  {theme.name}
                </p>
                <p
                  className="text-[10px] mt-0.5 leading-tight"
                  style={{ color: `rgb(${inkR},${inkG},${inkB}, 0.6)` }}
                >
                  {theme.description}
                </p>
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-moss-green text-white flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                )}
              </button>
            );
          })}

          {/* Custom theme option */}
          <button
            type="button"
            onClick={handleCustom}
            className={`relative p-3 rounded-cozy border-2 border-dashed text-left transition-all ${
              themeId === 'custom'
                ? 'border-moss-green shadow-md ring-2 ring-moss-green/30'
                : 'border-warm-gray/30 hover:border-warm-gray/50'
            }`}
            aria-pressed={themeId === 'custom'}
          >
            <div className="flex gap-1.5 mb-2">
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: customColors.primary }}
              />
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: customColors.accent }}
              />
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: customColors.text }}
              />
            </div>
            <p className="text-xs font-medium text-charcoal">Custom</p>
            <p className="text-[10px] mt-0.5 text-warm-gray leading-tight">
              Pick your own colors
            </p>
            {themeId === 'custom' && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-moss-green text-white flex items-center justify-center text-[10px]">
                ✓
              </span>
            )}
          </button>
        </div>

        {/* Custom color pickers */}
        {themeId === 'custom' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-warm-gray/20">
            {([
              ['primary', 'Primary'],
              ['accent', 'Accent'],
              ['background', 'Background'],
              ['text', 'Text'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-warm-gray mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customColors[key]}
                    onChange={e => handleCustomColor(key, e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-warm-gray/30"
                    aria-label={`${label} color`}
                  />
                  <span className="text-xs text-warm-gray font-mono">
                    {customColors[key]}
                  </span>
                </div>
              </div>
            ))}
            <ContrastReport colors={customColors} />
          </div>
        )}
      </section>

      {/* Font Picker */}
      <section className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-warm-gray/20">
          <Settings className="w-4 h-4 text-warm-amber" />
          <h3 className="font-semibold text-brand-ink text-sm">Font Family</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FONT_OPTIONS.map(font => {
            const isSelected = fontId === font.id;
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => handleFont(font)}
                className={`p-3 rounded-cozy border-2 text-left transition-all ${
                  isSelected
                    ? 'border-moss-green shadow-md ring-2 ring-moss-green/30'
                    : 'border-warm-gray/20 hover:border-warm-gray/40'
                }`}
                aria-pressed={isSelected}
              >
                <p className="text-sm font-medium text-charcoal">{font.name}</p>
                <p
                  className="text-xs text-warm-gray mt-1"
                  style={{ fontFamily: font.heading }}
                >
                  The quick brown fox — Heading
                </p>
                <p
                  className="text-xs text-warm-gray"
                  style={{ fontFamily: font.body }}
                >
                  The quick brown fox — Body
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

/**
 * Live readability check for custom colors.
 *
 * Preset themes are verified by themes.contrast.test.ts, but custom colors are
 * whatever the user picks — this gives them the same feedback before they save
 * a combination nobody can read. Uses the same contrast helper as the test, so
 * the two can never disagree.
 */
function ContrastReport({ colors }: { colors: ThemePickerColors }) {
  const derived = buildCustomThemeColors({
    primary: hexToRgbChannels(colors.primary),
    accent: hexToRgbChannels(colors.accent),
    background: hexToRgbChannels(colors.background),
    text: hexToRgbChannels(colors.text),
  });

  const checks = [
    { label: 'Body text on background', fg: derived.ink, bg: derived.bgBase },
    { label: 'Muted text on background', fg: derived.inkMuted, bg: derived.bgBase },
    { label: 'Primary text on background', fg: derived.brand, bg: derived.bgBase },
    { label: 'Button label on accent', fg: derived.accentText, bg: derived.accent },
  ].map((check) => ({ ...check, ratio: contrastRatioChannels(check.fg, check.bg) }));

  const failing = checks.filter((c) => c.ratio < AA_TEXT);

  return (
    <div className="col-span-2 sm:col-span-4 pt-3 border-t border-warm-gray/20">
      <p className="text-xs font-medium text-charcoal mb-2">Readability</p>
      <ul className="space-y-1">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-[11px]">
            {check.ratio >= AA_TEXT ? (
              <Check className="w-3 h-3 text-success-ink flex-shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-warning-ink flex-shrink-0" aria-hidden="true" />
            )}
            <span className="text-warm-gray">{check.label}</span>
            <span className={`font-mono ml-auto ${check.ratio >= AA_TEXT ? 'text-warm-gray' : 'text-warning-ink'}`}>
              {check.ratio.toFixed(1)}:1
            </span>
          </li>
        ))}
      </ul>
      {failing.length > 0 && (
        <p className="text-[11px] text-warning-ink mt-2">
          {failing.length === 1 ? 'One combination falls' : `${failing.length} combinations fall`} below the
          4.5:1 minimum for readable text. CozyVTT adjusts these automatically where it can, but picking a
          darker text color or a lighter background gives a better result.
        </p>
      )}
    </div>
  );
}
