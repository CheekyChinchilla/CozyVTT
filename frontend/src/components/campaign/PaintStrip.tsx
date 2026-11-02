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
 * - the eight tools in one row that scrolls sideways, with the shared scroll
 *   cue (on a short screen, a phone on its side, in the header's row);
 * - Colour and width, a button naming both, which opens a pop-over over the
 *   strip with the two colours, the palette, Another colour and the width;
 * - the tool's own settings: a shape outlined, filled or both, 15 degree
 *   steps, Snap to grid, the fill's tolerance;
 * - Download picture, the picture as it is now as a PNG;
 * - whether there is paint not saved, and a lost sign-in.
 *
 * It shares the panel's tools, hints and colours, so the two cannot drift.
 */

import { useId, useState } from 'react';
import { Download, Loader2, Redo2, Undo2 } from 'lucide-react';
import ToolStrip, { CHIP, HEADER_BUTTON, squareButton } from '@/components/campaign/compact/ToolStrip';
import SignedOutNotice from '@/components/common/SignedOutNotice';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { cn } from '@/utils/cn';
import { PAINT_COLOURS, pickedColour } from './map/paint/paintColours';
import type { PaintTool } from './map/paint/usePaintSurface';
import { labelFontSize } from './map/drawingGeometry';
import { HINTS, nameOf, SLOTS, STYLES, TOOLS, type PaintControlsProps, type Slot } from './PaintControls';

/** A slider a finger can take. */
const SLIDER = 'h-11 w-full accent-brand';

export default function PaintStrip({ settings, onSettingsChange, canUndo, canRedo, onUndo, onRedo, unsaved, onSave, saving, onDownload, signedOut = false, onClose }: PaintControlsProps) {
  const [overOpen, setOverOpen] = useState(false);
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
  // scrolling part, which would cut them off.
  const popOver = overOpen && (
    <div
      id={overId}
      role="group"
      aria-label="Colour and width"
      className="absolute bottom-full left-[max(1rem,env(safe-area-inset-left))] z-10 mb-2 flex w-[min(22rem,calc(100cqw-2rem))] flex-col gap-2 rounded-cozy border border-brand/20 bg-surface-light p-2 shadow-2xl"
    >
      {/* The two colours; the palette sets the one chosen here. */}
      <div className="flex flex-wrap gap-1">
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
      </div>
      <div className="flex flex-wrap gap-1">
        {PAINT_COLOURS.map((colour) => (
          <button
            key={colour.value}
            type="button"
            aria-label={colour.name}
            aria-pressed={chosen === colour.value}
            title={colour.name}
            onClick={() => {
              onSettingsChange({ [slot]: colour.value });
              setOverOpen(false);
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
      </div>
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
          type="button"
          onClick={() => setOverOpen((open) => !open)}
          aria-expanded={overOpen}
          aria-controls={overOpen ? overId : undefined}
          aria-label={`Colour and width: ${nameOf(settings.colour)}, ${settings.width} px`}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-cozy border border-ink/15 bg-paper pr-3 pl-2 text-sm text-ink transition-colors hover:bg-ink/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span aria-hidden="true" className="relative block size-7">
            <span className="absolute right-0 bottom-0 block size-5 rounded-sm border border-ink/30" style={{ backgroundColor: settings.second }} />
            <span className="absolute top-0 left-0 block size-5 rounded-sm border border-ink/30" style={{ backgroundColor: settings.colour }} />
          </span>
          {nameOf(settings.colour)}, {settings.width} px
        </button>
      </div>

      {(tool === 'rect' || tool === 'ellipse') && (
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

      {(tool === 'line' || tool === 'rect' || tool === 'ellipse') && (
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
