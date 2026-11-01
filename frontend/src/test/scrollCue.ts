import { expect } from 'vitest';
import { fireEvent } from '@testing-library/react';

/**
 * A sideways row's sign that it scrolls (components/ui/ScrollCue.tsx), as a
 * test reads it: the row's fade classes, and the chevrons drawn beside it in
 * its parent, each checked to be for the eye only.
 */
export function readScrollCue(row: HTMLElement): { fade: string[]; marks: Array<'left' | 'right'> } {
  const fade = (row.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.includes('mask-image'));
  const parent = row.parentElement;
  const marks = parent
    ? [...parent.querySelectorAll(':scope > svg')].map((svg) => {
        const svgClasses = (svg.getAttribute('class') ?? '').split(/\s+/);
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svgClasses).toContain('pointer-events-none');
        return svgClasses.includes('lucide-chevron-left') ? ('left' as const) : ('right' as const);
      })
    : [];
  return { fade, marks };
}

/**
 * Lays `row` out as jsdom cannot: `width` px of items, `shown` px of them in
 * view, scrolled `left` px in; then tells it it has scrolled.
 */
export function layScrollRow(row: HTMLElement, { width, shown, left = 0 }: { width: number; shown: number; left?: number }): void {
  Object.defineProperty(row, 'scrollWidth', { get: () => width, configurable: true });
  Object.defineProperty(row, 'clientWidth', { get: () => shown, configurable: true });
  Object.defineProperty(row, 'scrollLeft', { get: () => left, configurable: true });
  fireEvent.scroll(row);
}
