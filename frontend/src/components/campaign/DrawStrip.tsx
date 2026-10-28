/**
 * DrawStrip
 * The drawing tools on the compact layout, as a strip across the foot of
 * the map, above the bar, with the map live above it: the finger draws
 * there, so the strip is no dialog and holds no focus. Every control of the
 * desktop's panel (DrawControls), laid out for a phone, each 44 pixels:
 *
 * - a header: Draw, then Clear… for the DM (every drawing, or one
 *   member's, each asked first) or Clear mine for a player, and Done, which
 *   puts the tools away; while a polygon is open its Cancel and Done stand
 *   there instead, so one Done shows at a time, the one the hint names;
 * - the tool's hint;
 * - the nine tools in one row that scrolls sideways (on a short screen, a
 *   phone on its side, in the header's row);
 * - the colour, a button opening the eight colours and Another colour, and
 *   the width;
 * - Fill shapes, Snap to grid and, for the DM, Only I can see this.
 *
 * It is at most half the map's height (45 percent on a short screen), its
 * header fixed and the rest scrolling under it, so the map keeps room to
 * draw on and the header's buttons stay in reach, the colours open or not.
 *
 * The map's dock places it, across the map's foot; on a tablet it is at
 * most the sheets' 672 pixels wide, centred, as they are. It shares the
 * panel's tools, colours, hints and questions, so the two cannot drift.
 */

import { useId, useState } from 'react';
import ActionSheet from '@/components/campaign/compact/ActionSheet';
import { SHEET_WIDTH } from '@/components/campaign/compact/BottomSheet';
import type { MenuItem } from '@/components/ui/menu';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import { cn } from '@/utils/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { DRAW_TOOL_KINDS } from './map/tools/useDrawTool';
import {
  ClearDrawingsDialogs, COLOUR_NAMES, drawingsOf, FILLABLE, HINTS, isNamedColour, SHAPES, TOOLS,
  type ClearAsking, type DrawControlsProps,
} from './DrawControls';

/** A 44-pixel square button, pressed or not. */
const squareButton = (on: boolean) => cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-cozy border transition-colors',
  'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
  on ? 'border-brand bg-brand/15 text-brand-ink' : 'border-ink/15 bg-paper text-ink hover:bg-ink/5',
);

/** A header's text button. */
const HEADER_BUTTON = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-cozy px-3 text-sm font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed';

/** A box that reads as a chip: the label 44 pixels tall, its box ticked inside it. */
const CHIP = 'inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border border-ink/15 bg-paper px-3.5 text-sm text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

export default function DrawStrip({
  kind, onKindChange, settings, onSettingsChange, isDM, onlyErase = false, polygonCorners, onPolygonDone, onPolygonCancel, clearable, onClear, members, onClearMember, onClose,
}: DrawControlsProps) {
  const [asking, setAsking] = useState<ClearAsking>(null);
  const [clearChoicesOpen, setClearChoicesOpen] = useState(false);
  const [coloursOpen, setColoursOpen] = useState(false);
  const coloursId = useId();
  const named = DRAWING_LIMITS.namedColors.indexOf(settings.color as (typeof DRAWING_LIMITS.namedColors)[number]);
  const colourName = isNamedColour(settings.color) ? COLOUR_NAMES[named] : 'Another colour';
  const polygonOpen = kind === 'polygon' && polygonCorners > 0;
  const short = useMediaQuery(SHORT_SCREEN_QUERY);

  /** The DM's Clear…: every drawing, or one member's, as a choice when any member has drawings. */
  const clearChoices: MenuItem[] = [
    { kind: 'command', id: 'all', label: 'Clear drawings', tone: 'danger', run: () => setAsking('all') },
    ...members.map((member): MenuItem => ({
      kind: 'command', id: member.authorId, label: `Clear ${drawingsOf(member)} (${member.count})`, tone: 'danger', run: () => setAsking(member),
    })),
  ];

  // The nine tools: under the hint, or on a short screen in the header's
  // row, which a phone on its side has the width for. A scroller may shrink
  // below its content in a column, so under the hint it does not shrink.
  const toolRow = (
    <div
      role="group"
      aria-label="Tools"
      className={cn('flex gap-1 overflow-x-auto overscroll-x-contain pr-2 [scrollbar-width:none]', short ? 'min-w-0 flex-1' : 'shrink-0')}
    >
      {DRAW_TOOL_KINDS.filter((tool) => !onlyErase || tool === 'eraser').map((tool) => {
        const { label, icon: Icon } = TOOLS[tool];
        return (
          <button
            key={tool}
            type="button"
            aria-label={label}
            aria-pressed={kind === tool}
            title={label}
            onClick={() => onKindChange(tool)}
            className={squareButton(kind === tool)}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );

  return (
    <section
      aria-label="Drawing tools"
      className={cn(
        SHEET_WIDTH,
        'pointer-events-auto flex flex-col gap-2 rounded-t-cozy-lg border border-b-0 border-brand/20 bg-surface-light pt-2 pb-3 text-ink shadow-2xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]',
        // At most half the map's height (the dock is its size), less on a
        // short screen, so the map keeps room to draw on.
        'min-h-0 max-h-[50cqh] short:max-h-[45cqh]'
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <h2 className={cn('truncate font-heading text-lg font-bold text-brand-ink', short ? 'shrink-0 pr-1' : 'min-w-0 flex-1')}>Draw</h2>
        {short && toolRow}
        {polygonOpen ? (
          <>
            <button type="button" onClick={onPolygonCancel} className={cn(HEADER_BUTTON, 'text-ink-muted hover:bg-ink/5')}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onPolygonDone}
              disabled={polygonCorners < 3}
              title="Close the polygon"
              className={cn(HEADER_BUTTON, 'border border-brand bg-brand/15 text-brand-ink')}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (!isDM) onClear();
                else if (members.length > 0) setClearChoicesOpen(true);
                else setAsking('all');
              }}
              disabled={clearable === 0}
              aria-haspopup={isDM ? 'dialog' : undefined}
              className={cn(HEADER_BUTTON, 'text-danger-ink hover:bg-danger/10')}
            >
              {isDM ? 'Clear…' : 'Clear mine'}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Put the drawing tools away"
              className={cn(HEADER_BUTTON, 'border border-ink/15 bg-paper text-ink hover:bg-ink/5')}
            >
              Done
            </button>
          </>
        )}
      </div>

      {/* Under the header, scrolling inside the strip's height. */}
      <div data-strip-body="" className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
        <p className="pr-2 text-sm leading-snug text-ink-muted">
          {onlyErase && 'Drawing is off for now. '}
          {HINTS[kind]}
          {kind === 'eraser' && !isDM && ' You can erase only your own.'}
        </p>

        {!short && toolRow}

        {kind !== 'eraser' && (
          <>
            <div className="flex items-center gap-3 pr-2">
              <button
                type="button"
                onClick={() => setColoursOpen((open) => !open)}
                aria-expanded={coloursOpen}
                aria-controls={coloursId}
                aria-label={`Colour: ${colourName}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-cozy border border-ink/15 bg-paper pr-3 pl-2 text-sm text-ink transition-colors hover:bg-ink/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span aria-hidden="true" className="block size-6 rounded-full border-2 border-ink/30" style={{ backgroundColor: settings.color }} />
                {colourName}
              </button>
              {kind !== 'laser' && (
                <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex justify-between text-xs text-ink-muted">
                    <span>Width</span>
                    <span>{settings.width}{kind === 'text' ? ` (letters ${settings.width * 4} px tall)` : ''}</span>
                  </span>
                  <input
                    type="range"
                    aria-label="Width"
                    min={DRAWING_LIMITS.minWidth}
                    max={DRAWING_LIMITS.maxWidth}
                    step={1}
                    value={settings.width}
                    onChange={(e) => onSettingsChange({ width: Number(e.target.value) })}
                    className="h-7 w-full accent-brand"
                  />
                </label>
              )}
            </div>

            {coloursOpen && (
              <div id={coloursId} role="group" aria-label="Colour" className="flex flex-wrap gap-1 pr-2">
                {DRAWING_LIMITS.namedColors.map((colour, i) => (
                  <button
                    key={colour}
                    type="button"
                    aria-label={COLOUR_NAMES[i]}
                    aria-pressed={settings.color === colour}
                    title={COLOUR_NAMES[i]}
                    onClick={() => {
                      onSettingsChange({ color: colour });
                      setColoursOpen(false);
                    }}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span
                      aria-hidden="true"
                      className={cn('block size-7 rounded-full border-2', settings.color === colour ? 'border-brand scale-110' : 'border-ink/30')}
                      style={{ backgroundColor: colour }}
                    />
                  </button>
                ))}
                <label
                  title="Another colour"
                  className={cn(
                    'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand',
                    !isNamedColour(settings.color) && 'ring-2 ring-brand'
                  )}
                >
                  <input
                    type="color"
                    aria-label="Another colour"
                    value={settings.color}
                    onChange={(e) => {
                      const colour = e.target.value.toLowerCase();
                      if (/^#[0-9a-f]{6}$/.test(colour)) onSettingsChange({ color: colour });
                    }}
                    className="size-7 cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              </div>
            )}
          </>
        )}

        {(SHAPES.has(kind) || (isDM && kind !== 'eraser')) && (
          <div className="flex flex-wrap items-center gap-2 pr-2">
            {FILLABLE.has(kind) && (
              <label className={CHIP}>
                <input type="checkbox" checked={settings.fill} onChange={(e) => onSettingsChange({ fill: e.target.checked })} className="accent-brand" />
                Fill shapes
              </label>
            )}
            {SHAPES.has(kind) && (
              <label className={CHIP}>
                <input type="checkbox" checked={settings.snap} onChange={(e) => onSettingsChange({ snap: e.target.checked })} className="accent-brand" />
                Snap to grid
              </label>
            )}
            {/* The laser pointer goes to everyone, so the box is not offered with it. */}
            {isDM && kind !== 'eraser' && kind !== 'laser' && (
              <label className={CHIP}>
                <input type="checkbox" checked={settings.dmOnly} onChange={(e) => onSettingsChange({ dmOnly: e.target.checked })} className="accent-brand" />
                Only I can see this
              </label>
            )}
            {isDM && kind === 'laser' && <p className="text-sm text-ink-muted">Everyone sees the laser pointer.</p>}
          </div>
        )}
      </div>

      {clearChoicesOpen && (
        <ActionSheet open title="Clear drawings on this map" items={clearChoices} onClose={() => setClearChoicesOpen(false)} />
      )}
      <ClearDrawingsDialogs asking={asking} onAnswered={() => setAsking(null)} clearable={clearable} onClear={onClear} onClearMember={onClearMember} />
    </section>
  );
}
