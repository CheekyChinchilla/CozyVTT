/**
 * PaintControls
 * Paint's panel, while the DM paints a drawn map: the tool, the colour and
 * the second colour, the width, Undo and Redo, Save,
 * Download picture, and Done.
 * It sets no place of its own: it heads the DM's tool stack while Paint is
 * on. On the compact layout PaintStrip offers the same, from the tools,
 * hints and colours written here.
 */

import { useState } from 'react';
import { BrickWall, Circle, SquareDashed, Stamp, Download, Eraser, Loader2, Minus, PaintBucket, Paintbrush, Pipette, Redo2, Square, Type, Undo2, X } from 'lucide-react';
import { PAINT_COLOURS, pickedColour } from './map/paint/paintColours';
import type { PaintSelectionActions, PaintSettings, PaintTool } from './map/paint/usePaintSurface';
import type { ShapeStyle } from './map/paint/paintShapes';
import { PAINT_STAMPS, type StampTurn } from './map/paint/paintStamps';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { labelFontSize } from './map/drawingGeometry';
import SignedOutNotice from '@/components/common/SignedOutNotice';

/** Each tool's name, as its button is called, its key and its icon. */
export const TOOLS: Record<PaintTool, { label: string; key: string; icon: typeof Paintbrush }> = {
  select: { label: 'Select', key: 'S', icon: SquareDashed },
  brush: { label: 'Brush', key: 'B', icon: Paintbrush },
  eraser: { label: 'Eraser', key: 'E', icon: Eraser },
  line: { label: 'Line', key: 'L', icon: Minus },
  rect: { label: 'Rectangle', key: 'R', icon: Square },
  ellipse: { label: 'Ellipse', key: 'O', icon: Circle },
  room: { label: 'Room', key: 'M', icon: BrickWall },
  stamp: { label: 'Stamp', key: 'P', icon: Stamp },
  fill: { label: 'Fill', key: 'F', icon: PaintBucket },
  text: { label: 'Text', key: 'T', icon: Type },
  eyedropper: { label: 'Eyedropper', key: 'I', icon: Pipette },
};

export const HINTS: Record<PaintTool, string> = {
  select: 'Drag a box around part of the picture. Drag inside it to move it, or a corner to resize it; where it was is left in the map\'s own colour. Click outside it, or press Enter, to put it down.',
  brush: 'Drag to paint, or tap for a dot. Two fingers, or the right mouse button, move the map.',
  eraser: 'Drag to erase back to the map\'s own colour, the one it was made in.',
  line: 'Drag from one end to the other. Shift, or 15 degree steps, keeps it to 15 degree steps.',
  rect: 'Drag from one corner to the other.',
  ellipse: 'Drag across the box it fills.',
  stamp: 'Click or tap a square to paint the stamp chosen into it, outlined in the colour and filled with the second. Turn turns the next one. A finger\'s drag moves the map.',
  room: 'Drag from one corner of the grid to another: a floor in the second colour, outlined in the colour, and its four walls, which are added to the map when you save.',
  fill: 'Click or tap an area to fill it with the colour. A finger\'s drag moves the map.',
  text: 'Click or tap where the line of text goes, type it, then press Enter. Its size follows the width.',
  eyedropper: 'Click or tap the picture to take its colour there; the tool before comes back.',
};

export const STYLES: ReadonlyArray<{ style: ShapeStyle; label: string }> = [
  { style: 'outline', label: 'Outline' },
  { style: 'fill', label: 'Filled' },
  { style: 'both', label: 'Outline and fill' },
];

/** A colour's name as the palette gives it, or its #rrggbb. */
export const nameOf = (value: string) => PAINT_COLOURS.find((c) => c.value === value)?.name ?? value;

/** Which of the two colours the palette sets. */
export type Slot = 'colour' | 'second';
export const SLOTS: ReadonlyArray<{ slot: Slot; label: string }> = [
  { slot: 'colour', label: 'Colour' },
  { slot: 'second', label: 'Second colour' },
];

export interface PaintControlsProps {
  settings: PaintSettings;
  onSettingsChange: (patch: Partial<PaintSettings>) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Paint not saved, which stays on the map after Done. */
  unsaved: boolean;
  /** Save the picture as the map's. */
  onSave: () => void;
  /** Download the picture as it is now, as a PNG, to keep paint that cannot be saved. */
  onDownload: () => void;
  saving: boolean;
  /** The browser was signed out while there was paint not saved. */
  signedOut?: boolean;
  onClose: () => void;
  /** Select's buttons, shown while Select is chosen: a phone has no Ctrl+C. */
  selection?: PaintSelectionActions;
}

/** The next quarter turn, and the angle it shows as. */
export const nextTurn = (turn: StampTurn): StampTurn => ((turn + 1) % 4) as StampTurn;
export const turnLabel = (turn: StampTurn) => `Turn: ${turn * 90}°`;

/** Select's buttons, each with what it needs: a selection, or something to paste. */
export const SELECTION_BUTTONS: ReadonlyArray<{ label: string; act: keyof Omit<PaintSelectionActions, 'has' | 'canPaste'>; needs: 'has' | 'canPaste' | null }> = [
  { label: 'Copy', act: 'copy', needs: 'has' },
  { label: 'Cut', act: 'cut', needs: 'has' },
  { label: 'Paste', act: 'paste', needs: 'canPaste' },
  { label: 'Delete', act: 'remove', needs: 'has' },
  { label: 'Select all', act: 'selectAll', needs: null },
];

/** A choice pressed: its own colours win over a button's plain ones (Tailwind's aria-pressed variant). */
const CHOSEN = 'aria-pressed:bg-amber-400/30 aria-pressed:text-amber-100 aria-pressed:border-amber-400/70';

const toolButton = (on: boolean) =>
  `touch-target inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${
    on ? 'bg-amber-400/30 text-amber-200 border-amber-400/60' : 'bg-stone-700/60 text-stone-300 border-stone-600/50 hover:bg-stone-700'
  }`;

const actionButton = 'touch-target inline-flex items-center justify-center gap-1 px-2 h-8 rounded border text-[11px] bg-stone-700/60 text-stone-300 border-stone-600/50 hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed';

export default function PaintControls({ settings, onSettingsChange, canUndo, canRedo, onUndo, onRedo, unsaved, onSave, saving, onDownload, signedOut = false, onClose, selection }: PaintControlsProps) {
  const [slot, setSlot] = useState<Slot>('colour');
  const chosen = settings[slot];
  const custom = !PAINT_COLOURS.some((c) => c.value === chosen);
  return (
    <section
      aria-label="Paint"
      className="flex flex-col gap-2 p-2 bg-stone-800/90 rounded-lg border border-amber-400/20 w-full text-stone-300"
    >
      {/* Save and Done head the panel, as the phone's strip has them: at the
          foot, under every tool's settings, Save scrolled out of sight. */}
      <div className="flex items-center gap-1.5">
        <h2 className="flex-1 text-xs text-amber-400/70 font-medium uppercase tracking-wide">Paint</h2>
        <button
          type="button"
          onClick={onSave}
          disabled={!unsaved || saving}
          className="touch-target inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded border text-[11px] font-semibold bg-amber-400 text-stone-900 border-amber-300 hover:bg-amber-300 disabled:bg-transparent disabled:text-stone-400 disabled:border-stone-600/60 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Done painting"
          title="Put Paint away; what is not saved stays on the map"
          className="touch-target inline-flex items-center justify-center gap-1 h-7 px-2 rounded border border-stone-600/60 text-[11px] text-stone-300 hover:text-white hover:bg-stone-700"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          Done
        </button>
      </div>
      {unsaved && !saving && (
        <p className="text-[11px] leading-snug text-amber-200/80">Not saved yet: on your screen only. Done keeps it on the map until you save.</p>
      )}
      {signedOut && unsaved && <SignedOutNotice />}

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
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className={actionButton}>
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)" className={actionButton}>
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] leading-snug text-stone-400">{HINTS[settings.tool]}</p>
      {settings.tool === 'stamp' && (
        <div role="group" aria-label="Stamp" className="flex flex-wrap gap-1">
          {PAINT_STAMPS.map(({ kind, label }) => (
            <button key={kind} type="button" aria-pressed={settings.stamp === kind} onClick={() => onSettingsChange({ stamp: kind })} className={`${actionButton} ${CHOSEN}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onSettingsChange({ turn: nextTurn(settings.turn) })} className={actionButton}>
            {turnLabel(settings.turn)}
          </button>
          <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
            <input type="checkbox" checked={settings.stampSnap} onChange={(e) => onSettingsChange({ stampSnap: e.target.checked })} className="accent-amber-400" />
            Snap to grid
          </label>
        </div>
      )}
      {settings.tool === 'select' && selection && (
        <div role="group" aria-label="Selection" className="flex flex-wrap gap-1">
          {SELECTION_BUTTONS.map(({ label, act, needs }) => (
            <button key={act} type="button" onClick={() => selection[act]()} disabled={needs !== null && !selection[needs]} className={actionButton}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* The two colours; the palette sets the one chosen here. The eraser has none: it paints the map's own colour. */}
      {settings.tool !== 'eraser' && <div>
        <div className="flex items-center gap-1 mb-1">
          {SLOTS.map(({ slot: which, label }) => (
            <button
              key={which}
              type="button"
              aria-label={`${label}: ${nameOf(settings[which])}`}
              aria-pressed={slot === which}
              title={`${label}: the palette sets it while it is chosen`}
              onClick={() => setSlot(which)}
              className={`touch-target inline-flex items-center gap-1.5 px-1.5 h-7 rounded border text-[10px] ${
                slot === which ? 'border-amber-400/60 bg-amber-400/15 text-amber-100' : 'border-stone-600/50 text-stone-400'
              }`}
            >
              <span className="block w-4 h-4 rounded-sm border border-stone-500" style={{ backgroundColor: settings[which] }} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {PAINT_COLOURS.map((colour) => (
            <button
              key={colour.value}
              type="button"
              aria-label={colour.name}
              aria-pressed={chosen === colour.value}
              title={colour.name}
              onClick={() => onSettingsChange({ [slot]: colour.value })}
              className="touch-target inline-flex items-center justify-center w-6 h-6"
            >
              <span
                className={`block w-5 h-5 rounded-full border-2 ${chosen === colour.value ? 'border-amber-300 scale-110' : 'border-stone-500'}`}
                style={{ backgroundColor: colour.value }}
              />
            </button>
          ))}
          <label className={`touch-target inline-flex items-center justify-center w-6 h-6 rounded-full ${custom ? 'ring-2 ring-amber-300' : ''}`} title="Another colour">
            <input
              type="color"
              aria-label="Another colour"
              value={chosen}
              onChange={(e) => {
                const colour = pickedColour(e.target.value);
                if (colour) onSettingsChange({ [slot]: colour });
              }}
              className="w-5 h-5 cursor-pointer border-0 bg-transparent p-0"
            />
          </label>
        </div>
      </div>}

      <label className="flex flex-col gap-0.5">
        <span className="flex justify-between text-[10px] text-stone-400">
          <span>Width</span>
          <span>{settings.width} px{settings.tool === 'text' ? ` (letters ${labelFontSize(settings.width)} px tall)` : ''}</span>
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

      {(settings.tool === 'rect' || settings.tool === 'ellipse') && (
        <fieldset className="flex flex-col gap-0.5">
          <legend className="text-[10px] text-stone-400 mb-0.5">Shape</legend>
          {STYLES.map(({ style, label }) => (
            <label key={style} className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
              <input
                type="radio"
                name="paint-shape-style"
                checked={settings.style === style}
                onChange={() => onSettingsChange({ style })}
                className="accent-amber-400"
              />
              {label}
            </label>
          ))}
          <p className="text-[10px] text-stone-400">An outline is in the colour; Outline and fill fills with the second colour.</p>
        </fieldset>
      )}

      {(settings.tool === 'line' || settings.tool === 'rect' || settings.tool === 'ellipse') && (
        <div className="flex flex-col gap-0.5">
          {settings.tool === 'line' && (
            <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
              <input type="checkbox" checked={settings.straight} onChange={(e) => onSettingsChange({ straight: e.target.checked })} className="accent-amber-400" />
              15 degree steps
            </label>
          )}
          <label className="touch-target flex items-center gap-2 text-[11px] cursor-pointer select-none">
            <input type="checkbox" checked={settings.snap} onChange={(e) => onSettingsChange({ snap: e.target.checked })} className="accent-amber-400" />
            Snap to grid
          </label>
        </div>
      )}

      {settings.tool === 'fill' && (
        <label className="flex flex-col gap-0.5">
          <span className="flex justify-between text-[10px] text-stone-400">
            <span>Tolerance</span>
            <span>{settings.tolerance}%</span>
          </span>
          <input
            type="range"
            aria-label="Tolerance"
            min={0}
            max={100}
            step={1}
            value={settings.tolerance}
            onChange={(e) => onSettingsChange({ tolerance: Number(e.target.value) })}
            className="w-full accent-amber-400 touch-target"
          />
          <span className="text-[10px] text-stone-400">Higher takes in colours further from the one clicked, such as a stroke's soft edge.</span>
        </label>
      )}

      <button
        type="button"
        onClick={onDownload}
        title="Save the picture as it is now on this device, as a PNG: a way to keep paint that cannot be saved to the map"
        className={`${actionButton} justify-center`}
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Download picture
      </button>
    </section>
  );
}
