/**
 * PaintControls
 * Paint's panel, while the DM paints a drawn map: the tool, its colour and
 * width, Undo and Redo, and Done. It sets no place of its own: it takes the
 * place of the DM's tool stack while Paint is on.
 */

import { Paintbrush, Redo2, Undo2, X } from 'lucide-react';
import { PAINT_COLOURS, pickedColour } from './map/paint/paintColours';
import type { PaintSettings, PaintTool } from './map/paint/usePaintSurface';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';

/** Each tool's name, as its button is called, its key and its icon. */
const TOOLS: Record<PaintTool, { label: string; key: string; icon: typeof Paintbrush }> = {
  brush: { label: 'Brush', key: 'B', icon: Paintbrush },
};

const HINTS: Record<PaintTool, string> = {
  brush: 'Drag to paint, or tap for a dot. Two fingers, or the right mouse button, move the map.',
};

export interface PaintControlsProps {
  settings: PaintSettings;
  onSettingsChange: (patch: Partial<PaintSettings>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Paint not saved, which stays on the map after Done. */
  unsaved: boolean;
  onClose: () => void;
}

const toolButton = (on: boolean) =>
  `touch-target inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${
    on ? 'bg-amber-400/30 text-amber-200 border-amber-400/60' : 'bg-stone-700/60 text-stone-300 border-stone-600/50 hover:bg-stone-700'
  }`;

const actionButton = 'touch-target inline-flex items-center justify-center gap-1 px-2 h-8 rounded border text-[11px] bg-stone-700/60 text-stone-300 border-stone-600/50 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed';

export default function PaintControls({ settings, onSettingsChange, canUndo, canRedo, onUndo, onRedo, unsaved, onClose }: PaintControlsProps) {
  const custom = !PAINT_COLOURS.some((c) => c.value === settings.colour);
  return (
    <section
      aria-label="Paint"
      className="flex flex-col gap-2 p-2 bg-stone-800/90 rounded-lg border border-amber-400/20 w-full text-stone-300"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs text-amber-400/70 font-medium uppercase tracking-wide">Paint</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Done painting"
          title="Done painting"
          className="touch-target inline-flex items-center justify-center w-6 h-6 rounded-sm text-stone-400 hover:text-white hover:bg-stone-700"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(TOOLS) as PaintTool[]).map((tool) => {
          const { label, key, icon: Icon } = TOOLS[tool];
          return (
            <button
              key={tool}
              type="button"
              aria-label={label}
              aria-pressed={settings.tool === tool}
              title={`${label} (${key})`}
              onClick={() => onSettingsChange({ tool })}
              className={toolButton(settings.tool === tool)}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        <span className="flex-1" />
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo stroke" title="Undo (Ctrl+Z)" className={actionButton}>
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo stroke" title="Redo (Ctrl+Y)" className={actionButton}>
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] leading-snug text-stone-400">{HINTS[settings.tool]}</p>

      <div>
        <span className="text-[10px] text-stone-400 block mb-1">Colour</span>
        <div className="flex flex-wrap gap-1">
          {PAINT_COLOURS.map((colour) => (
            <button
              key={colour.value}
              type="button"
              aria-label={colour.name}
              aria-pressed={settings.colour === colour.value}
              title={colour.name}
              onClick={() => onSettingsChange({ colour: colour.value })}
              className="touch-target inline-flex items-center justify-center w-6 h-6"
            >
              <span
                className={`block w-5 h-5 rounded-full border-2 ${settings.colour === colour.value ? 'border-amber-300 scale-110' : 'border-stone-500'}`}
                style={{ backgroundColor: colour.value }}
              />
            </button>
          ))}
          <label className={`touch-target inline-flex items-center justify-center w-6 h-6 rounded-full ${custom ? 'ring-2 ring-amber-300' : ''}`} title="Another colour">
            <input
              type="color"
              aria-label="Another colour"
              value={settings.colour}
              onChange={(e) => {
                const colour = pickedColour(e.target.value);
                if (colour) onSettingsChange({ colour });
              }}
              className="w-5 h-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      </div>

      <label className="flex flex-col gap-0.5">
        <span className="flex justify-between text-[10px] text-stone-400">
          <span>Width</span>
          <span>{settings.width} px</span>
        </span>
        <input
          type="range"
          aria-label="Width"
          min={DRAWING_LIMITS.minWidth}
          max={DRAWING_LIMITS.maxWidth}
          step={1}
          value={settings.width}
          onChange={(e) => onSettingsChange({ width: Number(e.target.value) })}
          className="w-full accent-amber-400 touch-target"
        />
      </label>

      {unsaved && (
        <p className="text-[11px] leading-snug text-amber-200/80">Not saved yet. Done keeps it on the map, on your screen only.</p>
      )}
    </section>
  );
}
