/**
 * DmWallControls
 * DM-only wall segment drawing tool controls panel.
 * Supports wall type selection, snap-to-grid, delete mode,
 * custom wall color, split mode, erase brush, brush paint tool,
 * and inline type picker for selected segments.
 */

import { useState } from 'react';
import type { WallType } from '@/types/walls';

export type WallToolMode = 'wall-draw' | 'wall-select' | 'wall-split' | 'wall-erase' | 'wall-polygon' | 'wall-brush' | null;

export const WALL_PRESET_COLORS = [
  { label: 'Orange (default)', value: '#f97316' },
  { label: 'White', value: '#ffffff' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Cyan', value: '#22d3ee' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Green', value: '#4ade80' },
];

interface DmWallControlsProps {
  wallMode: WallToolMode;
  onWallModeChange: (mode: WallToolMode) => void;
  onCollapse?: () => void;
  wallType: WallType;
  onWallTypeChange: (type: WallType) => void;
  snapToGrid: boolean;
  onSnapToGridChange: (snap: boolean) => void;
  snapToEndpoint: boolean;
  onSnapToEndpointChange: (snap: boolean) => void;
  wallCount: number;
  onClearAll: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  wallColor: string;
  onWallColorChange: (color: string) => void;
  selectedSegmentType?: WallType | null;
  onSelectedTypeChange?: (type: WallType) => void;
  onDeleteSelected?: () => void;
  selectedEndpoint?: { x: number; y: number } | null;
  onMergeEndpoint?: () => void;
  brushSize?: number;
  onBrushSizeChange?: (v: number) => void;
}

const WALL_TYPE_COLORS: Record<WallType, string> = {
  'wall':        'bg-orange-500/20 text-orange-400 border-orange-500/50',
  'door-closed': 'bg-violet-500/20 text-violet-400 border-violet-500/50',
  'door-open':   'bg-green-500/20 text-green-400 border-green-500/50',
  'door-locked': 'bg-red-500/20 text-red-400 border-red-500/50',
  'window':      'bg-blue-400/20 text-blue-300 border-blue-400/50',
};

const WALL_TYPE_LABELS: Record<WallType, string> = {
  'wall':        'Wall',
  'door-closed': 'Door',
  'door-open':   'Open Door',
  'door-locked': 'Locked',
  'window':      'Window',
};

const ALL_WALL_TYPES: WallType[] = ['wall', 'door-closed', 'door-open', 'door-locked', 'window'];

export default function DmWallControls({
  wallMode,
  onWallModeChange,
  wallType,
  onWallTypeChange,
  snapToGrid,
  onSnapToGridChange,
  snapToEndpoint,
  onSnapToEndpointChange,
  wallCount,
  onClearAll,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  wallColor,
  onWallColorChange,
  selectedSegmentType,
  onSelectedTypeChange,
  onDeleteSelected,
  selectedEndpoint,
  onMergeEndpoint,
  brushSize = 20,
  onBrushSizeChange,
  onCollapse,
}: DmWallControlsProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleClearAll = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    setConfirmClear(false);
    onClearAll();
  };

  const toggleMode = (mode: WallToolMode) => {
    onWallModeChange(wallMode === mode ? null : mode);
  };

  return (
    <div className="flex flex-col gap-0 bg-stone-800/90 rounded-lg border border-warm-amber/20 min-w-[200px] overflow-hidden">
      {/* Header with collapse toggle */}
      <div
        className="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-stone-700/50 select-none"
        onClick={() => {
          const next = !collapsed;
          setCollapsed(next);
          if (next) onCollapse?.();
        }}
      >
        <span className="text-xs text-warm-amber/70 font-medium uppercase tracking-wide">
          Walls
          {wallCount > 0 && (
            <span className="ml-1 text-stone-400 normal-case">({wallCount})</span>
          )}
        </span>
        <span className="text-stone-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-2 p-2 pt-1">
          {/* Mode buttons: Draw / Select / Split / Erase */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => toggleMode('wall-draw')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-draw'
                  ? 'bg-orange-600/30 text-orange-400 border-orange-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Draw walls — click to place points, double-click to finish"
              aria-label="Wall draw mode"
            >
              ✏️ Draw
            </button>
            <button
              onClick={() => toggleMode('wall-select')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-select'
                  ? 'bg-sky-600/30 text-sky-400 border-sky-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Select a wall segment to change its type or delete it"
              aria-label="Wall select mode"
            >
              ↗ Select
            </button>
            <button
              onClick={() => toggleMode('wall-split')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-split'
                  ? 'bg-yellow-600/30 text-yellow-400 border-yellow-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Split a wall segment — hover over a wall to preview the split point, click to split"
              aria-label="Wall split mode"
            >
              ✂ Split
            </button>
            <button
              onClick={() => toggleMode('wall-erase')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-erase'
                  ? 'bg-red-600/30 text-red-400 border-red-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Erase walls — drag to brush-erase multiple segments"
              aria-label="Wall erase mode"
            >
              🗑 Erase
            </button>
          </div>
          {/* Polygon + Brush mode */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => toggleMode('wall-polygon')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-polygon'
                  ? 'bg-emerald-600/30 text-emerald-400 border-emerald-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Polygon mode — click corners to draw a closed room perimeter"
              aria-label="Polygon wall mode"
            >
              ⬡ Polygon
            </button>
            <button
              onClick={() => toggleMode('wall-brush')}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors border ${
                wallMode === 'wall-brush'
                  ? 'bg-teal-600/30 text-teal-400 border-teal-500/50'
                  : 'bg-stone-700/50 text-stone-300 border-stone-600/50 hover:bg-stone-700'
              }`}
              title="Brush mode — paint over walls to trace them. Use snap-to-grid for straight walls."
              aria-label="Brush wall mode"
            >
              🖌 Brush
            </button>
          </div>

          {/* Brush size slider (brush mode) */}
          {wallMode === 'wall-brush' && onBrushSizeChange && (
            <div className="flex flex-col gap-0.5">
              <div className="flex justify-between text-xs text-stone-400 px-1">
                <span>Brush size</span>
                <span>{brushSize}px</span>
              </div>
              <input
                type="range"
                min={8}
                max={60}
                step={2}
                value={brushSize}
                onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                className="w-full accent-teal-500"
                aria-label="Brush size for wall painting"
              />
            </div>
          )}

          {/* Selected segment type picker (wall-select mode with a segment chosen) */}
          {wallMode === 'wall-select' && selectedSegmentType != null && (
            <div className="flex flex-col gap-1 pt-1 border-t border-sky-500/30">
              <span className="text-xs text-sky-300 px-1">Change type</span>
              <div className="grid grid-cols-2 gap-1">
                {ALL_WALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => onSelectedTypeChange?.(t)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      selectedSegmentType === t
                        ? WALL_TYPE_COLORS[t]
                        : 'bg-stone-700/50 text-stone-400 border-stone-600/50 hover:bg-stone-700'
                    }`}
                    aria-label={`Set type: ${WALL_TYPE_LABELS[t]}`}
                  >
                    {WALL_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <button
                onClick={onDeleteSelected}
                className="w-full px-2 py-1 mt-0.5 rounded text-xs font-medium bg-red-700/30 text-red-400 border border-red-500/40 hover:bg-red-700/50 transition-colors"
                aria-label="Delete selected wall segment"
              >
                Delete segment
              </button>
            </div>
          )}

          {/* Selected endpoint — merge option (wall-select mode, endpoint clicked) */}
          {wallMode === 'wall-select' && selectedEndpoint != null && selectedSegmentType == null && (
            <div className="flex flex-col gap-1 pt-1 border-t border-sky-500/30">
              <span className="text-xs text-sky-300 px-1">Selected point</span>
              <button
                onClick={onMergeEndpoint}
                className="w-full px-2 py-1 rounded text-xs font-medium bg-sky-700/30 text-sky-300 border border-sky-500/40 hover:bg-sky-700/50 transition-colors"
                aria-label="Merge wall segments at this point"
              >
                Merge point
              </button>
              <span className="text-[10px] text-stone-500 px-1">Remove this point and join the two segments into one straight wall</span>
            </div>
          )}

          {/* Wall type selector (draw, polygon, brush modes) */}
          {(wallMode === 'wall-draw' || wallMode === 'wall-polygon' || wallMode === 'wall-brush') && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-stone-400 px-1">Draw type</span>
              <div className="grid grid-cols-2 gap-1">
                {ALL_WALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => onWallTypeChange(t)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors border ${
                      wallType === t
                        ? WALL_TYPE_COLORS[t]
                        : 'bg-stone-700/50 text-stone-400 border-stone-600/50 hover:bg-stone-700'
                    }`}
                    aria-label={`Wall type: ${WALL_TYPE_LABELS[t]}`}
                  >
                    {WALL_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Undo / Redo buttons */}
          {(onUndo || onRedo) && (
            <div className="flex gap-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="flex-1 px-2 py-1 rounded text-xs font-medium bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Undo last wall change (Ctrl+Z)"
                aria-label="Undo wall edit"
              >
                ↩ Undo
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="flex-1 px-2 py-1 rounded text-xs font-medium bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-stone-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Redo wall change (Ctrl+Y)"
                aria-label="Redo wall edit"
              >
                ↪ Redo
              </button>
            </div>
          )}

          {/* Wall color picker */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-400 px-1">Wall color</span>
            <div className="flex gap-1 flex-wrap px-1">
              {WALL_PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onWallColorChange(c.value)}
                  title={c.label}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c.value,
                    borderColor: wallColor === c.value ? '#fff' : 'transparent',
                  }}
                  aria-label={`Wall color: ${c.label}`}
                />
              ))}
              <input
                type="color"
                value={wallColor}
                onChange={(e) => onWallColorChange(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Custom wall color"
                aria-label="Custom wall color picker"
              />
            </div>
          </div>

          {/* Snap to grid */}
          <label className="flex items-center gap-2 px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => {
                onSnapToGridChange(e.target.checked);
                if (e.target.checked) onSnapToEndpointChange(false);
              }}
              className="accent-warm-amber"
              aria-label="Snap wall points to grid"
            />
            <span className="text-xs text-stone-300">Snap to grid</span>
          </label>

          {/* Snap to nearest endpoint — only available when grid snap is off */}
          <label className={`flex items-center gap-2 px-1 ${snapToGrid ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={snapToEndpoint}
              disabled={snapToGrid}
              onChange={(e) => onSnapToEndpointChange(e.target.checked)}
              className="accent-warm-amber"
              aria-label="Snap wall points to nearest existing endpoint"
            />
            <span className="text-xs text-stone-300">Snap to endpoint</span>
          </label>

          {/* Clear all */}
          {wallCount > 0 && (
            <div className="pt-1 border-t border-stone-700/50">
              <button
                onClick={handleClearAll}
                className={`w-full px-2 py-1 rounded text-xs font-medium transition-colors ${
                  confirmClear
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-stone-700/50 text-stone-300 border border-stone-600/50 hover:bg-red-700/30 hover:text-red-400'
                }`}
                title={confirmClear ? 'Click again to confirm: delete all walls' : 'Delete all wall segments'}
                aria-label="Clear all wall segments"
                onBlur={() => setConfirmClear(false)}
              >
                {confirmClear ? 'Confirm clear all?' : `Clear all (${wallCount})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
