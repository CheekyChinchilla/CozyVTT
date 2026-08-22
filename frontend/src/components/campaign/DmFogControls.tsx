/**
 * DmFogControls
 * DM-only fog of war brush tool controls panel.
 * Allows the DM to reveal/hide regions of the map using a brush or bulk actions.
 */

import { useState } from 'react';
import { Eye, EyeOff, Brush } from 'lucide-react';

export type FogToolMode = 'fog-reveal' | 'fog-hide' | null;

interface DmFogControlsProps {
  fogMode: FogToolMode;
  onFogModeChange: (mode: FogToolMode) => void;
  brushRadius: number;
  onBrushRadiusChange: (radius: number) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
}

export default function DmFogControls({
  fogMode,
  onFogModeChange,
  brushRadius,
  onBrushRadiusChange,
  onRevealAll,
  onHideAll,
}: DmFogControlsProps) {
  const [confirmRevealAll, setConfirmRevealAll] = useState(false);
  const [confirmHideAll, setConfirmHideAll] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleRevealAll = () => {
    if (!confirmRevealAll) { setConfirmRevealAll(true); return; }
    setConfirmRevealAll(false);
    onRevealAll();
  };

  const handleHideAll = () => {
    if (!confirmHideAll) { setConfirmHideAll(true); return; }
    setConfirmHideAll(false);
    onHideAll();
  };

  return (
    <div className="flex flex-col gap-0 bg-stone-800/90 rounded-lg border border-warm-amber/20 min-w-[160px] overflow-hidden">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-stone-700/50 select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span className="text-xs text-warm-amber/70 font-medium uppercase tracking-wide">Fog of War</span>
        <span className="text-stone-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </div>
    {!collapsed && (
      <div className="flex flex-col gap-2 p-2 pt-1">

      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-reveal' ? null : 'fog-reveal')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-reveal'
              ? 'bg-lime-600/30 text-lime-400 border border-lime-500/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Reveal brush — paint to reveal areas to players"
          aria-label="Fog reveal brush"
        >
          <Eye className="w-3.5 h-3.5" />
          Reveal
        </button>
        <button
          onClick={() => onFogModeChange(fogMode === 'fog-hide' ? null : 'fog-hide')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
            fogMode === 'fog-hide'
              ? 'bg-warning/30 text-warning-ink border border-warning/50'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700'
          }`}
          title="Hide brush — paint to hide areas from players"
          aria-label="Fog hide brush"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide
        </button>
      </div>

      {/* Brush size */}
      {fogMode && (
        <div className="px-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-stone-400">
              <Brush className="w-3 h-3 inline mr-1" />
              Brush size
            </span>
            <span className="text-xs text-warm-amber/80">{Math.round(brushRadius)}px</span>
          </div>
          <input
            type="range"
            min={16}
            max={256}
            step={8}
            value={brushRadius}
            onChange={(e) => onBrushRadiusChange(Number(e.target.value))}
            className="w-full h-1.5 accent-warm-amber"
            aria-label="Fog brush radius"
          />
        </div>
      )}

      {/* Bulk actions */}
      <div className="flex gap-1 pt-1 border-t border-stone-700/50">
        <button
          onClick={handleRevealAll}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmRevealAll
              ? 'bg-lime-500 text-white animate-pulse'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-lime-700/30 hover:text-lime-400'
          }`}
          title={confirmRevealAll ? 'Click again to confirm: reveal entire map' : 'Reveal all — show entire map to players'}
          aria-label="Reveal entire map"
          onBlur={() => setConfirmRevealAll(false)}
        >
          {confirmRevealAll ? 'Confirm?' : 'Reveal all'}
        </button>
        <button
          onClick={handleHideAll}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            confirmHideAll
              ? 'bg-warning text-white animate-pulse'
              : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-warning/30 hover:text-warning-ink'
          }`}
          title={confirmHideAll ? 'Click again to confirm: hide entire map' : 'Hide all — cover entire map with fog'}
          aria-label="Hide entire map"
          onBlur={() => setConfirmHideAll(false)}
        >
          {confirmHideAll ? 'Confirm?' : 'Hide all'}
        </button>
      </div>
    </div>
    )}
    </div>
  );
}
