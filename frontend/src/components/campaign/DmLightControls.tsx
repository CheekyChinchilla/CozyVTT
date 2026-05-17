/**
 * DmLightControls
 * DM-only light source placement and editing controls panel.
 * Supports placing lights with pre-configured defaults (including D&D presets),
 * selecting/editing/moving properties, toggling, and deleting.
 *
 * Light model: each source has a brightRadius (full visibility) and dimRadius
 * (lightly obscured / reduced glow). This matches D&D 5e, PF2e, and most
 * TTRPG light mechanics.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { LightSource } from '@/types/walls';

export type LightToolMode = 'light-place' | 'light-select' | null;

/** Defaults used when placing a new light — exposed to parent via onDefaultsChange. */
export interface LightPlacementDefaults {
  brightRadius: number;
  dimRadius: number;
  color: string;
}

const DEFAULT_PLACEMENT: LightPlacementDefaults = {
  brightRadius: 4,
  dimRadius: 8,
  color: '#ffcc66',
};

/** Named presets matching common TTRPG light sources (radii in grid squares). */
const LIGHT_PRESETS: Array<{ label: string; bright: number; dim: number }> = [
  { label: 'Candle',    bright: 1,  dim: 2 },
  { label: 'Torch',     bright: 4,  dim: 8 },
  { label: 'Lamp',      bright: 3,  dim: 6 },
  { label: 'Lantern',   bright: 6,  dim: 12 },
  { label: 'Campfire',  bright: 8,  dim: 16 },
];

/** Preset glow colors for the palette. */
const LIGHT_COLOR_PRESETS = [
  { label: 'Warm Amber', value: '#ffcc66' },
  { label: 'Candlelight', value: '#ff9933' },
  { label: 'Daylight', value: '#ffffee' },
  { label: 'Cool Blue', value: '#66aaff' },
  { label: 'Eerie Green', value: '#66ff99' },
  { label: 'Arcane Purple', value: '#cc66ff' },
  { label: 'Firelight', value: '#ff6633' },
  { label: 'Moonlight', value: '#aabbdd' },
];

interface DmLightControlsProps {
  lightMode: LightToolMode;
  onLightModeChange: (mode: LightToolMode) => void;
  onCollapse?: () => void;
  lightCount: number;
  onClearAll: () => void;
  selectedLight?: LightSource | null;
  onSelectedLightChange?: (light: LightSource) => void;
  onDeleteSelected?: () => void;
  lightingEnabled?: boolean;
  /** Called when placement defaults change so parent can use them for new lights. */
  onDefaultsChange?: (defaults: LightPlacementDefaults) => void;
  /** Current placement defaults (parent is source of truth). */
  placementDefaults?: LightPlacementDefaults;
}

/**
 * Debounce helper: returns a stable callback that only fires `fn` after
 * `delay` ms of inactivity. Used to throttle socket emissions during slider drags.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fnRef = useRef<any>(fn);
  fnRef.current = fn;

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useCallback((...args: any[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]) as T;
}

export default function DmLightControls({
  lightMode,
  onLightModeChange,
  lightCount,
  onClearAll,
  selectedLight = null,
  onSelectedLightChange,
  onDeleteSelected,
  onCollapse,
  lightingEnabled = false,
  onDefaultsChange,
  placementDefaults = DEFAULT_PLACEMENT,
}: DmLightControlsProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleClearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false);
    onClearAll();
  };

  const toggleMode = (mode: LightToolMode) => {
    onLightModeChange(lightMode === mode ? null : mode);
  };

  // Debounced version of onSelectedLightChange for slider drags — prevents
  // raycasting on every input tick (fixes the freezing issue).
  const debouncedSelectedChange = useDebouncedCallback(
    (light: LightSource) => onSelectedLightChange?.(light),
    80
  );

  // Local transient state for slider drags so the UI feels responsive
  // even though socket emission is debounced.
  const [localBright, setLocalBright] = useState<number | null>(null);
  const [localDim, setLocalDim] = useState<number | null>(null);

  // Sync local overrides when selected light changes externally
  useEffect(() => {
    setLocalBright(null);
    setLocalDim(null);
  }, [selectedLight?.id]);

  const updateSelected = (changes: Partial<LightSource>) => {
    if (!selectedLight || !onSelectedLightChange) return;
    onSelectedLightChange({ ...selectedLight, ...changes });
  };

  /** Slider-specific update: sets local state immediately, debounces socket emit. */
  const updateSelectedSlider = (changes: Partial<LightSource>) => {
    if (!selectedLight) return;
    if ('brightRadius' in changes) setLocalBright(changes.brightRadius!);
    if ('dimRadius' in changes) setLocalDim(changes.dimRadius!);
    debouncedSelectedChange({ ...selectedLight, ...changes } as LightSource);
  };

  const updateDefaults = (changes: Partial<LightPlacementDefaults>) => {
    onDefaultsChange?.({ ...placementDefaults, ...changes });
  };

  // Determine which values to show in the editor panel:
  // - If a light is selected in select mode, show that light's properties
  // - If in place mode (or select with no selection), show placement defaults
  const isEditing = selectedLight && lightMode === 'light-select';
  const displayBright = isEditing
    ? (localBright ?? selectedLight.brightRadius)
    : placementDefaults.brightRadius;
  const displayDim = isEditing
    ? (localDim ?? selectedLight.dimRadius)
    : placementDefaults.dimRadius;
  const displayColor = isEditing ? selectedLight.color : placementDefaults.color;

  return (
    <div className="flex flex-col gap-0 bg-stone-800/90 rounded-lg border border-amber-400/20 min-w-[200px] overflow-hidden">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-stone-700/50 select-none"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          if (next) onCollapse?.();
        }}
      >
        <span className="text-xs text-amber-400/70 font-medium uppercase tracking-wide">
          Lights
          {lightCount > 0 && (
            <span className="ml-1 text-stone-400 normal-case">({lightCount})</span>
          )}
        </span>
        <span className="text-stone-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-2 p-2 pt-1">
          {/* Warning when lighting is off */}
          {!lightingEnabled && (
            <div className="text-[10px] text-amber-400/60 bg-amber-400/5 rounded px-1.5 py-1 border border-amber-400/10">
              Dynamic lighting is off. Enable it in Map Settings for lights to affect player visibility.
            </div>
          )}

          {/* Mode buttons */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => toggleMode('light-place')}
              className={`flex-1 text-[11px] py-1.5 rounded transition-colors ${
                lightMode === 'light-place'
                  ? 'bg-amber-400/30 text-amber-300 border border-amber-400/50'
                  : 'bg-stone-700/60 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Click on map to place a light source"
            >
              Place
            </button>
            <button
              type="button"
              onClick={() => toggleMode('light-select')}
              className={`flex-1 text-[11px] py-1.5 rounded transition-colors ${
                lightMode === 'light-select'
                  ? 'bg-amber-400/30 text-amber-300 border border-amber-400/50'
                  : 'bg-stone-700/60 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Click a light source to select and edit it; drag to move"
            >
              Select
            </button>
          </div>

          {/* Light property editor — shows for BOTH place mode (defaults) and select mode (editing) */}
          {lightMode && (
            <div className="flex flex-col gap-2 bg-stone-700/40 rounded p-2 border border-stone-600/40">
              <div className="text-[10px] text-stone-400 uppercase tracking-wide">
                {isEditing ? 'Edit Light' : 'New Light Settings'}
              </div>

              {/* Enabled toggle — only for selected light */}
              {isEditing && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLight.enabled}
                    onChange={(e) => updateSelected({ enabled: e.target.checked })}
                    className="rounded accent-amber-400"
                  />
                  <span className="text-[11px] text-stone-300">
                    {selectedLight.enabled ? 'Enabled' : 'Disabled (extinguished)'}
                  </span>
                </label>
              )}

              {/* Preset buttons */}
              <div>
                <span className="text-[10px] text-stone-400 block mb-1">Presets</span>
                <div className="flex flex-wrap gap-1">
                  {LIGHT_PRESETS.map((p) => {
                    const isActive = displayBright === p.bright && displayDim === p.dim;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          if (isEditing) {
                            updateSelected({ brightRadius: p.bright, dimRadius: p.dim });
                          } else {
                            updateDefaults({ brightRadius: p.bright, dimRadius: p.dim });
                          }
                        }}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          isActive
                            ? 'bg-amber-400/25 text-amber-300 border border-amber-400/40'
                            : 'bg-stone-700/60 text-stone-400 border border-stone-600/40 hover:text-stone-300 hover:bg-stone-700'
                        }`}
                        title={`Bright: ${p.bright} sq, Dim: ${p.dim} sq`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bright radius slider */}
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px] text-stone-400">Bright</span>
                  <span className="text-[10px] text-stone-300">{displayBright.toFixed(1)} sq</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.5}
                  value={displayBright}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    // Clamp dim to stay >= bright
                    if (isEditing) {
                      const newDim = Math.max(v, localDim ?? selectedLight.dimRadius);
                      updateSelectedSlider({ brightRadius: v, dimRadius: newDim });
                    } else {
                      const newDim = Math.max(v, placementDefaults.dimRadius);
                      updateDefaults({ brightRadius: v, dimRadius: newDim });
                    }
                  }}
                  className="w-full h-1 accent-amber-400"
                />
              </div>

              {/* Dim radius slider */}
              <div>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px] text-stone-400">Dim</span>
                  <span className="text-[10px] text-stone-300">{displayDim.toFixed(1)} sq</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={50}
                  step={0.5}
                  value={displayDim}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    // Clamp bright to stay <= dim
                    if (isEditing) {
                      const newBright = Math.min(v, localBright ?? selectedLight.brightRadius);
                      updateSelectedSlider({ dimRadius: v, brightRadius: newBright });
                    } else {
                      const newBright = Math.min(v, placementDefaults.brightRadius);
                      updateDefaults({ dimRadius: v, brightRadius: newBright });
                    }
                  }}
                  className="w-full h-1 accent-amber-400"
                />
              </div>

              {/* Color presets */}
              <div>
                <span className="text-[10px] text-stone-400 block mb-1">Color</span>
                <div className="flex flex-wrap gap-1">
                  {LIGHT_COLOR_PRESETS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => {
                        if (isEditing) updateSelected({ color: c.value });
                        else updateDefaults({ color: c.value });
                      }}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${
                        displayColor === c.value
                          ? 'border-white scale-110'
                          : 'border-stone-600 hover:border-stone-400'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                {/* Custom hex input */}
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input
                    type="color"
                    value={displayColor}
                    onChange={(e) => {
                      if (isEditing) updateSelected({ color: e.target.value });
                      else updateDefaults({ color: e.target.value });
                    }}
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    title="Pick custom color"
                  />
                  <input
                    type="text"
                    value={displayColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                        const lower = v.toLowerCase();
                        if (isEditing) updateSelected({ color: lower });
                        else updateDefaults({ color: lower });
                      }
                    }}
                    className="flex-1 text-[10px] bg-stone-800 border border-stone-600 rounded px-1.5 py-0.5 text-stone-300 font-mono"
                    maxLength={7}
                    placeholder="#ffcc66"
                  />
                </div>
              </div>

              {/* Delete button — only for selected light */}
              {isEditing && (
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  className="text-[11px] py-1 rounded bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
                >
                  Delete Light
                </button>
              )}
            </div>
          )}

          {/* Clear all */}
          {lightCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              onBlur={() => setConfirmClear(false)}
              className={`text-[11px] py-1 rounded transition-colors ${
                confirmClear
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-stone-700/60 text-stone-400 border border-stone-600/40 hover:text-stone-300'
              }`}
            >
              {confirmClear ? 'Confirm Clear All' : `Clear All (${lightCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
