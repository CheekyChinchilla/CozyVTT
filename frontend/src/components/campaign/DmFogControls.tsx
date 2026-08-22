/**
 * DmFogControls
 * DM-only fog of war controls panel.
 * The DM reveals or hides regions by dragging a box over the map — the
 * selection snaps to whole grid squares — plus bulk reveal/hide actions.
 */

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type FogToolMode = 'fog-reveal' | 'fog-hide' | null;

interface DmFogControlsProps {
  fogMode: FogToolMode;
  onFogModeChange: (mode: FogToolMode) => void;
  onRevealAll: () => void;
  onHideAll: () => void;
}

export default function DmFogControls({
  fogMode,
  onFogModeChange,
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
          title="Reveal — drag a box over the map to reveal it to players"
          aria-label="Fog reveal box"
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
          title="Hide — drag a box over the map to hide it from players"
          aria-label="Fog hide box"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Hide
        </button>
      </div>

      {/* How-to hint — only while a mode is armed */}
      {fogMode && (
        <p className="px-1 text-[11px] leading-snug text-stone-400">
          Drag a box over the map. The selection snaps to whole squares —
          click a single square to {fogMode === 'fog-reveal' ? 'reveal' : 'hide'} just that one.
          <span className="block mt-0.5 text-stone-500">Esc or right-drag cancels.</span>
        </p>
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
