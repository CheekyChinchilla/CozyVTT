// ============================================
// ScrollCue: a sign that a sideways row has more past its ends
//
// A row that scrolls sideways and stops at an item's edge reads as all there
// is, all the more on a phone, which shows no scrollbar until the row moves.
// So an end with more past it fades out (scrollFade) under a chevron
// (ScrollChevrons), which is only for the eye: the row's items are reached by
// scrolling it, a swipe, or the keyboard as before. useScrollMore says which
// ends have more, following the row as it scrolls, as it or the window
// resizes, and as its items change.
//
// The Admin Panel's tabs below 1024 px, the compact Draw strip's tools and
// the compact Dice panel's quick rolls carry it.
// ============================================

import { useCallback, useEffect, useState, type RefCallback, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Which ends of a sideways row have more beyond them. */
export type ScrollMore = 'none' | 'start' | 'end' | 'both';

/** Which ends of `row` have more beyond them, as it is scrolled now. */
export function scrollMore(row: HTMLElement): ScrollMore {
  const start = row.scrollLeft > 1;
  const end = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
  return start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
}

/** The fade on each end with more past it, 4rem long. */
const FADE: Record<Exclude<ScrollMore, 'none'>, string> = {
  start: '[mask-image:linear-gradient(to_right,transparent,black_4rem)]',
  end: '[mask-image:linear-gradient(to_left,transparent,black_4rem)]',
  both: '[mask-image:linear-gradient(to_right,transparent,black_4rem,black_calc(100%_-_4rem),transparent)]',
};

/** The same, drawn below 1024 px only, for a row that scrolls only there. */
const FADE_BELOW_LG: Record<Exclude<ScrollMore, 'none'>, string> = {
  start: 'max-lg:[mask-image:linear-gradient(to_right,transparent,black_4rem)]',
  end: 'max-lg:[mask-image:linear-gradient(to_left,transparent,black_4rem)]',
  both: 'max-lg:[mask-image:linear-gradient(to_right,transparent,black_4rem,black_calc(100%_-_4rem),transparent)]',
};

/** The row's fade for `more`, if it has more past an end; `belowLg` draws it below 1024 px only. */
export function scrollFade(more: ScrollMore, { belowLg = false }: { belowLg?: boolean } = {}): string | undefined {
  if (more === 'none') return undefined;
  return (belowLg ? FADE_BELOW_LG : FADE)[more];
}

/**
 * Which ends of a sideways row have more past them, followed as it scrolls,
 * as it or the window resizes, and as its items change (one is added, or a
 * label changes). Put `ref` on the row; `rowRef`, given, is kept pointing at
 * it too.
 */
export function useScrollMore<T extends HTMLElement>(rowRef?: RefObject<T | null>): { ref: RefCallback<T>; more: ScrollMore } {
  const [row, setRow] = useState<T | null>(null);
  const [more, setMore] = useState<ScrollMore>('none');

  const ref = useCallback<RefCallback<T>>((element) => {
    if (rowRef) rowRef.current = element;
    setRow(element);
  }, [rowRef]);

  useEffect(() => {
    if (!row) {
      setMore('none');
      return undefined;
    }
    const measure = () => setMore(scrollMore(row));
    measure();
    row.addEventListener('scroll', measure, { passive: true });
    const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resized?.observe(row);
    const changed = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    changed?.observe(row, { childList: true, subtree: true, characterData: true });
    return () => {
      row.removeEventListener('scroll', measure);
      resized?.disconnect();
      changed?.disconnect();
    };
  }, [row]);

  return { ref, more };
}

export interface ScrollChevronsProps {
  more: ScrollMore;
  /** Where the start's chevron sits, in the row's positioned parent, such as `left-0`. */
  start: string;
  /** Where the end's chevron sits, such as `right-0`. */
  end: string;
  /** Each chevron's colour, and when it shows. */
  className?: string;
}

/**
 * A chevron on each end of the row with more past it, for the eye only:
 * hidden from a screen reader and taking no press. Drawn after the row in
 * its parent, which is positioned while either shows.
 */
export function ScrollChevrons({ more, start, end, className }: ScrollChevronsProps) {
  const mark = (side: string) => cn('pointer-events-none absolute', side, 'top-1/2 h-4 w-4 -translate-y-1/2', className);
  return (
    <>
      {(more === 'start' || more === 'both') && <ChevronLeft aria-hidden="true" className={mark(start)} />}
      {(more === 'end' || more === 'both') && <ChevronRight aria-hidden="true" className={mark(end)} />}
    </>
  );
}
