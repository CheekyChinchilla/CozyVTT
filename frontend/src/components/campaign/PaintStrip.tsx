/**
 * PaintStrip
 * Paint's tools on the compact layout, as a strip across the foot of the
 * map, above the bar, with the map live above it (compact/ToolStrip.tsx,
 * the Draw strip's shell): one finger paints there, so the strip is no
 * dialog and holds no focus. Every control of the desktop's panel
 * (PaintControls), laid out for a phone, each 44 pixels:
 *
 * - a header: Paint, Undo, Redo, Save and Done painting;
 * - the tool's hint;
 * - the thirteen tools in one row that scrolls sideways, with the shared scroll
 *   cue (on a short screen, a phone on its side, in the header's row);
 * - Colour and width, a button naming both, which opens a pop-over over the
 *   strip with the two colours, the palette, Another colour and the width,
 *   which takes the keyboard as it opens and closes on Esc or a press
 *   anywhere else;
 * - the tool's own settings: a shape outlined, filled or both, 15 degree
 *   steps, Snap to grid, the fill's tolerance;
 * - Download picture, the picture as it is now as a PNG;
 * - whether there is paint not saved, and a lost sign-in.
 *
 * It shares the panel's tools, hints and colours, so the two cannot drift.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Download, Loader2, Redo2, Undo2 } from 'lucide-react';
import ToolStrip, { CHIP, HEADER_BUTTON, squareButton } from '@/components/campaign/compact/ToolStrip';
import SignedOutNotice from '@/components/common/SignedOutNotice';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { cn } from '@/utils/cn';
import { PAINT_COLOURS, pickedColour } from './map/paint/paintColours';
import type { PaintTool } from './map/paint/usePaintSurface';
import { PAINT_STAMPS, STAMP_SIZE } from './map/paint/paintStamps';
import { PAINT_TEXTURES } from './map/paint/paintTextures';
import { labelFontSize } from './map/drawingGeometry';
import { HINTS, nameOf, nextTurn, SELECTION_BUTTONS, squaresLabel, TEXTURED_TOOLS, textureOf, turnLabel, WIDTHLESS_TOOLS, SLOTS, STYLES, TOOLS, type PaintControlsProps, type Slot } from './PaintControls';

/** A slider a finger can take. */
const SLIDER = 'h-11 w-full accent-brand';

/** What the pop-over's button says: the colour and the width, the eraser's width alone, a stamp's size, or the colour alone. */
function overLabel(tool: PaintTool, colour: string, width: number, stampSize: number): { aria: string; shown: string } {
  if (tool === 'eraser') return { aria: `Width: ${width} px`, shown: `${width} px` };
  if (tool === 'stamp') return { aria: `Colour and size: ${colour}, ${squaresLabel(stampSize)}`, shown: `${colour}, ${squaresLabel(stampSize)}` };
  if (WIDTHLESS_TOOLS.has(tool)) return { aria: `Colour: ${colour}`, shown: colour };
  return { aria: `Colour and width: ${colour}, ${width} px`, shown: `${colour}, ${width} px` };
}

export default function PaintStrip({ settings, onSettingsChange, canUndo, canRedo, onUndo, onRedo, unsaved, onSave, saving, onDownload, signedOut = false, onClose, selection }: PaintControlsProps) {
  const [overOpen, setOverOpen] = useState(false);
  const overRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  /** Close the pop-over, the keyboard back on its button. */
  const closeOver = () => {
    setOverOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };
  // Open, it has the keyboard, and a press anywhere else (the map, the
  // strip) closes it.
  useEffect(() => {
    if (!overOpen) return undefined;
    overRef.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
    const away = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Node && (overRef.current?.contains(target) || toggleRef.current?.contains(target))) return;
      setOverOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [overOpen]);
  const [slot, setSlot] = useState<Slot>('colour');
  const overId = useId();
  const chosen = settings[slot];
  const custom = !PAINT_COLOURS.some((c) => c.value === chosen);
  const { tool } = settings;

  const tools = (Object.keys(TOOLS) as PaintTool[]).map((each) => {
    const { label, icon: Icon } = TOOLS[each];
    return (
      <button
        key={each}
        type="button"
        aria-label={label}
        aria-pressed={tool === each}
        title={label}
        onClick={() => onSettingsChange({ tool: each })}
        className={squareButton(tool === each)}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  });

  const actions = (
    <>
      <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo" className={squareButton(false)}>
        <Undo2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo" className={squareButton(false)}>
        <Redo2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!unsaved || saving}
        className={cn(HEADER_BUTTON, 'gap-1.5 border border-brand bg-brand/15 text-brand-ink')}
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Done painting"
        title="Put Paint away; what is not saved stays on the map"
        className={cn(HEADER_BUTTON, 'border border-ink/15 bg-paper text-ink hover:bg-ink/5')}
      >
        Done
      </button>
    </>
  );

  // The colours and the width, opened over the strip, outside its
  // scrolling part, which would cut them off. It is never taller than the
  // room the strip leaves above it (the strip takes at most half the map),
  // scrolling within that; on a phone on its side, where that room is
  // short, the two colours and the width sit beside the palette.
  const popOver = overOpen && (
    <div
      ref={overRef}
      id={overId}
      role="group"
      aria-label="Colour and width"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        closeOver();
      }}
      className="absolute bottom-full left-[max(1rem,env(safe-area-inset-left))] z-10 mb-2 flex max-h-[calc(50cqh-1rem)] w-[min(22rem,calc(100cqw-2rem))] flex-col gap-2 overflow-y-auto overscroll-contain rounded-cozy border border-brand/20 bg-surface-light p-2 shadow-2xl short:w-[min(40rem,calc(100cqw-2rem))] short:flex-row short:items-start"
    >
      <div className="flex flex-col gap-2 short:w-60 short:shrink-0">
        {/* The two colours; the palette sets the one chosen here. The eraser has none: it paints the map's own colour. */}
        {tool !== 'eraser' && <div className="flex flex-wrap gap-1">
          {SLOTS.map(({ slot: which, label }) => (
            <button
              key={which}
              type="button"
              aria-label={`${label}: ${nameOf(settings[which])}`}
              aria-pressed={slot === which}
              onClick={() => setSlot(which)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-cozy border px-2 text-sm',
                slot === which ? 'border-brand bg-brand/15 text-brand-ink' : 'border-ink/15 bg-paper text-ink'
              )}
            >
              <span aria-hidden="true" className="block size-5 rounded-sm border border-ink/30" style={{ backgroundColor: settings[which] }} />
              {label}
            </button>
          ))}
        </div>}
        {tool === 'stamp' ? (
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-xs text-ink-muted">
              <span>Size</span>
              <span>{squaresLabel(settings.stampSize)}</span>
            </span>
            <input
              type="range"
              aria-label="Size"
              min={STAMP_SIZE.min}
              max={STAMP_SIZE.max}
              step={STAMP_SIZE.step}
              value={settings.stampSize}
              onChange={(e) => onSettingsChange({ stampSize: Number(e.target.value) })}
              className={SLIDER}
            />
          </label>
        ) : !WIDTHLESS_TOOLS.has(tool) && (
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-xs text-ink-muted">
              <span>Width</span>
              <span>{settings.width} px{tool === 'text' ? ` (letters ${labelFontSize(settings.width)} px tall)` : ''}</span>
            </span>
            <input
              type="range"
              aria-label="Width"
              min={DRAWING_LIMITS.minWidth}
              max={DRAWING_LIMITS.maxWidth}
              step={1}
              value={settings.width}
              onChange={(e) => onSettingsChange({ width: Number(e.target.value) })}
              className={SLIDER}
            />
          </label>
        )}
      </div>
      {tool !== 'eraser' && <div className="flex flex-wrap gap-1">
        {PAINT_COLOURS.map((colour) => (
          <button
            key={colour.value}
            type="button"
            aria-label={colour.name}
            aria-pressed={chosen === colour.value}
            title={colour.name}
            onClick={() => {
              onSettingsChange({ [slot]: colour.value });
              closeOver();
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span
              aria-hidden="true"
              className={cn('block size-7 rounded-full border-2', chosen === colour.value ? 'border-brand scale-110' : 'border-ink/30')}
              style={{ backgroundColor: colour.value }}
            />
          </button>
        ))}
        <label
          title="Another colour"
          className={cn(
            'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
            custom && 'ring-2 ring-brand'
          )}
        >
          <input
            type="color"
            aria-label="Another colour"
            value={chosen}
            onChange={(e) => {
              const colour = pickedColour(e.target.value);
              if (colour) onSettingsChange({ [slot]: colour });
            }}
            className="size-7 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
      </div>}
    </div>
  );

  return (
    <ToolStrip
      label="Paint"
      title="Paint"
      actions={actions}
      hint={HINTS[tool]}
      tools={tools}
      after={popOver}
    >
      <div className="flex items-center gap-3 pr-2">
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOverOpen((open) => !open)}
          aria-expanded={overOpen}
          aria-controls={overOpen ? overId : undefined}
          aria-label={overLabel(tool, nameOf(settings.colour), settings.width, settings.stampSize).aria}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-cozy border border-ink/15 bg-paper pr-3 pl-2 text-sm text-ink transition-colors hover:bg-ink/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span aria-hidden="true" className="relative block size-7">
            <span className="absolute right-0 bottom-0 block size-5 rounded-sm border border-ink/30" style={{ backgroundColor: settings.second }} />
            <span className="absolute top-0 left-0 block size-5 rounded-sm border border-ink/30" style={{ backgroundColor: settings.colour }} />
          </span>
          {overLabel(tool, nameOf(settings.colour), settings.width, settings.stampSize).shown}
        </button>
      </div>

      {TEXTURED_TOOLS.has(tool) && (
        <label className={CHIP}>
          Texture
          <select value={settings.texture ?? ''} onChange={(e) => onSettingsChange({ texture: textureOf(e.target.value) })} className="min-h-9 rounded-cozy border border-ink/15 bg-paper px-2 text-sm text-ink">
            <option value="">None</option>
            {PAINT_TEXTURES.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
          </select>
        </label>
      )}

      {tool === 'stamp' && (
        <div role="group" aria-label="Stamp" className="flex flex-wrap gap-2 pr-2">
          {PAINT_STAMPS.map(({ kind, label }) => (
            <button key={kind} type="button" aria-pressed={settings.stamp === kind} onClick={() => onSettingsChange({ stamp: kind })} className={cn(CHIP, 'aria-pressed:border-brand aria-pressed:bg-brand/15')}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => onSettingsChange({ turn: nextTurn(settings.turn) })} className={CHIP}>
            {turnLabel(settings.turn)}
          </button>
          <label className={CHIP}>
            <input type="checkbox" checked={settings.stampSnap} onChange={(e) => onSettingsChange({ stampSnap: e.target.checked })} className="accent-brand" />
            Snap to grid
          </label>
        </div>
      )}

      {tool === 'select' && selection && (
        <div role="group" aria-label="Selection" className="flex flex-wrap gap-2 pr-2">
          {SELECTION_BUTTONS.map(({ label, act, needs }) => (
            <button key={act} type="button" onClick={() => selection[act]()} disabled={needs !== null && !selection[needs]} className={cn(CHIP, 'disabled:opacity-40')}>
              {label}
            </button>
          ))}
        </div>
      )}

      {(tool === 'rect' || tool === 'ellipse' || tool === 'polygon') && (
        <div role="radiogroup" aria-label="Shape" className="flex flex-wrap gap-2 pr-2">
          {STYLES.map(({ style, label }) => (
            <label key={style} className={CHIP}>
              <input
                type="radio"
                name="paint-strip-shape-style"
                checked={settings.style === style}
                onChange={() => onSettingsChange({ style })}
                className="accent-brand"
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {(tool === 'line' || tool === 'rect' || tool === 'ellipse' || tool === 'polygon' || tool === 'curve') && (
        <div className="flex flex-wrap gap-2 pr-2">
          {tool === 'line' && (
            <label className={CHIP}>
              <input type="checkbox" checked={settings.straight} onChange={(e) => onSettingsChange({ straight: e.target.checked })} className="accent-brand" />
              15 degree steps
            </label>
          )}
          <label className={CHIP}>
            <input type="checkbox" checked={settings.snap} onChange={(e) => onSettingsChange({ snap: e.target.checked })} className="accent-brand" />
            Snap to grid
          </label>
        </div>
      )}

      {tool === 'fill' && (
        <label className="flex flex-col gap-0.5 pr-2">
          <span className="flex justify-between text-xs text-ink-muted">
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
            className={SLIDER}
          />
        </label>
      )}

      <div className="pr-2">
        <button
          type="button"
          onClick={onDownload}
          title="Save the picture as it is now on this device, as a PNG: a way to keep paint that cannot be saved to the map"
          className={cn(HEADER_BUTTON, 'gap-2 border border-ink/15 bg-paper text-ink hover:bg-ink/5')}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download picture
        </button>
      </div>

      {unsaved && !saving && (
        <p className="pr-2 text-sm leading-snug text-ink-muted">Not saved yet: on your screen only. Done keeps it on the map until you save.</p>
      )}
      {signedOut && unsaved && <SignedOutNotice />}
    </ToolStrip>
  );
}
