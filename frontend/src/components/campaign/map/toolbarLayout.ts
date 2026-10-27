// ============================================
// The band across the top of the map, and what sits under it.
//
// The band holds the toolbar and, on the right, the spirit realm label. With
// a mouse the toolbar is one row of 34-pixel buttons, and the AoE panel, the
// Put back bar and the DM's tool stack keep the places the stylesheet gives
// them. On a touch screen the buttons are 44 pixels, and on a narrow map the
// toolbar wraps onto a second row, and the label under it: the panels then
// start under the band's bottom edge, so none lies over a button. While a
// token is held, the AoE panel starts under the Put back bar.
// ============================================

import { useLayoutEffect, useState, type RefObject } from 'react';

/** The band as the panels under it need it, in CSS pixels from the map container's top left corner. */
export interface TopBand {
  /** The band's bottom edge. */
  bottom: number;
  /** The right edge of the toolbar's buttons, the furthest right on any row. */
  buttonsRight: number;
  /** The map container's width. */
  width: number;
  /** The toolbar's buttons, or the label, run onto a second row. */
  wrapped: boolean;
}

/** The room left between the band and a panel placed under it. */
export const BAND_GAP = 8;

/**
 * Measure the band. `toolbar` is the band's first child, and its children
 * are the toolbar's groups of buttons; anything else in the band (the label)
 * follows it. Null while the band has no size: not laid out yet, or jsdom.
 */
export function measureTopBand(band: HTMLElement, toolbar: HTMLElement, container: HTMLElement): TopBand | null {
  const outer = band.getBoundingClientRect();
  const groups = Array.from(toolbar.children, (el) => el.getBoundingClientRect());
  if (outer.height === 0 || groups.length === 0) return null;
  const map = container.getBoundingClientRect();
  const firstRowBottom = groups[0].bottom;
  const rest = [
    ...groups.slice(1),
    ...Array.from(band.children).filter((el) => el !== toolbar).map((el) => el.getBoundingClientRect()),
  ];
  return {
    bottom: Math.round(outer.bottom - map.top),
    buttonsRight: Math.round(Math.max(...groups.map((r) => r.right)) - map.left),
    width: Math.round(map.width),
    wrapped: rest.some((r) => r.top >= firstRowBottom),
  };
}

/**
 * The top of a panel under the band, the AoE panel or the Put back bar: null
 * keeps its place in the stylesheet, which suits one row of a mouse's
 * buttons; on a touch screen (`coarse`), or with a second row, it starts
 * under the band's bottom edge.
 */
export function underBand(band: TopBand | null, coarse: boolean): number | null {
  return band && (coarse || band.wrapped) ? band.bottom + BAND_GAP : null;
}

/**
 * The top of the DM's tool stack in its corner, `stackWidth` wide and
 * `rightGap` in from the map's right edge: null keeps its place beside the
 * toolbar; it starts under the band when the band wraps, or when the
 * toolbar's buttons reach under its corner.
 */
export function stackCornerTop(band: TopBand | null, stackWidth: number, rightGap: number): number | null {
  if (!band) return null;
  const left = band.width - rightGap - stackWidth;
  return band.wrapped || band.buttonsRight > left ? band.bottom + BAND_GAP : null;
}

/**
 * The bottom edge of `el`, in CSS pixels from the map container's top: null
 * while it has no size (not laid out yet, or jsdom).
 */
export function measureBottom(el: HTMLElement, container: HTMLElement): number | null {
  const box = el.getBoundingClientRect();
  if (box.height === 0) return null;
  return Math.round(box.bottom - container.getBoundingClientRect().top);
}

/**
 * The bottom edge of a panel over the map while it shows, measured again
 * when it changes size or is given another `top`.
 */
export function useMeasuredBottom(
  ref: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  shown: boolean,
  top: number | null,
): number | null {
  const [bottom, setBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const container = containerRef.current;
    if (!shown || !el || !container) {
      setBottom(null);
      return undefined;
    }
    const measure = () => setBottom(measureBottom(el, container));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, containerRef, shown, top]);
  return bottom;
}

const sameBand = (a: TopBand | null, b: TopBand | null) =>
  a === b || (a !== null && b !== null
    && a.bottom === b.bottom && a.buttonsRight === b.buttonsRight && a.width === b.width && a.wrapped === b.wrapped);

/**
 * The band, measured again whenever it, the toolbar or the map container
 * changes size: a wrap, a button shown or hidden, a change of pointer, the
 * window or the side panels.
 */
export function useTopBand(
  bandRef: RefObject<HTMLElement | null>,
  toolbarRef: RefObject<HTMLElement | null>,
  containerRef: RefObject<HTMLElement | null>,
): TopBand | null {
  const [band, setBand] = useState<TopBand | null>(null);
  useLayoutEffect(() => {
    const bandEl = bandRef.current;
    const toolbar = toolbarRef.current;
    const container = containerRef.current;
    if (!bandEl || !toolbar || !container) return undefined;
    const measure = () => {
      const next = measureTopBand(bandEl, toolbar, container);
      setBand((prev) => (sameBand(prev, next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(bandEl);
    observer.observe(toolbar);
    observer.observe(container);
    return () => observer.disconnect();
  }, [bandRef, toolbarRef, containerRef]);
  return band;
}
