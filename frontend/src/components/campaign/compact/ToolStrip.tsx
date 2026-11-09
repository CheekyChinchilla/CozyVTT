/**
 * ToolStrip
 * The shell of a tool's strip on the compact layout, which the Draw strip
 * (DrawStrip) and Paint's (PaintStrip) share, so the two cannot drift: a
 * region across the foot of the map, above the bar, with the map live above
 * it. The finger works on the map there, so the strip is no dialog and holds
 * no focus.
 *
 * - A header: the tool's name, then its actions, each 44 pixels.
 * - The tool's hint.
 * - Its tools in one row that scrolls sideways, an end with more past it
 *   faded under a chevron (ScrollCue.tsx); on a short screen, a phone on its
 *   side, the row sits in the header's row, which has the width for it.
 * - The rest, scrolling under the header.
 *
 * It is at most half the map's height (45 percent on a short screen), its
 * header fixed and the rest scrolling under it, so the map keeps room to
 * work on and the header's buttons stay in reach. The map's dock places it,
 * across the map's foot; on a tablet it is at most the sheets' 672 pixels
 * wide, centred, as they are.
 */

import type { ReactNode } from 'react';
import { SHEET_WIDTH } from '@/components/campaign/compact/BottomSheet';
import { cn } from '@/utils/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SHORT_SCREEN_QUERY } from '@/constants/layout';
import { ScrollChevrons, scrollFade, useScrollMore } from '@/components/ui/ScrollCue';

/** A 44-pixel square button, pressed or not. */
export const squareButton = (on: boolean) => cn(
  'inline-flex size-11 shrink-0 items-center justify-center rounded-cozy border transition-colors',
  'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
  on ? 'border-brand bg-brand/15 text-brand-ink' : 'border-ink/15 bg-paper text-ink hover:bg-ink/5',
);

/** A header's text button. */
export const HEADER_BUTTON = 'inline-flex min-h-11 shrink-0 items-center justify-center rounded-cozy px-3 text-sm font-semibold transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed';

/** A box that reads as a chip: the label 44 pixels tall, its box ticked inside it. */
export const CHIP = 'inline-flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-full border border-ink/15 bg-paper px-3.5 text-sm text-ink has-[:checked]:border-brand has-[:checked]:bg-brand/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand';

export interface ToolStripProps {
  /** The region's name. */
  label: string;
  /** The header's title. */
  title: string;
  /** The header's buttons, after the title (and the tools, on a short screen). */
  actions: ReactNode;
  /** What the tool in use does. */
  hint: ReactNode;
  /** The tools' buttons, for the row that scrolls sideways. */
  tools: ReactNode;
  /** Under the hint and the tools, scrolling with them. */
  children?: ReactNode;
  /** After the strip's parts, such as its questions, or a pop-over placed over the strip (the strip is its positioned parent). */
  after?: ReactNode;
}

export default function ToolStrip({ label, title, actions, hint, tools, children, after }: ToolStripProps) {
  const short = useMediaQuery(SHORT_SCREEN_QUERY);
  const { ref: toolRowCue, more: toolRowMore } = useScrollMore<HTMLDivElement>();

  // Under the hint, or on a short screen in the header's row. A scroller may
  // shrink below its content in a column, so under the hint it does not.
  const toolRow = (
    <div className={cn('relative', short ? 'min-w-0 flex-1' : 'shrink-0')}>
      <div
        ref={toolRowCue}
        role="group"
        aria-label="Tools"
        className={cn('flex gap-1 overflow-x-auto overscroll-x-contain pr-2 [scrollbar-width:none]', scrollFade(toolRowMore))}
      >
        {tools}
      </div>
      <ScrollChevrons more={toolRowMore} start="left-0" end="right-0" className="text-ink-muted" />
    </div>
  );

  return (
    <section
      aria-label={label}
      className={cn(
        SHEET_WIDTH,
        'pointer-events-auto relative flex flex-col gap-2 rounded-t-cozy-lg border border-b-0 border-brand/20 bg-surface-light pt-2 pb-3 text-ink shadow-2xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]',
        // At most half the map's height (the dock is its size), less on a
        // short screen, so the map keeps room to work on.
        'min-h-0 max-h-[50cqh] short:max-h-[45cqh]'
      )}
    >
      <div className="flex shrink-0 items-center gap-1">
        <h2 className={cn('truncate font-heading text-lg font-bold text-brand-ink', short ? 'shrink-0 pr-1' : 'min-w-0 flex-1')}>{title}</h2>
        {short && toolRow}
        {actions}
      </div>

      {/* Under the header, scrolling inside the strip's height. */}
      <div data-strip-body="" className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
        <p className="pr-2 text-sm leading-snug text-ink-muted">{hint}</p>
        {!short && toolRow}
        {children}
      </div>

      {after}
    </section>
  );
}
