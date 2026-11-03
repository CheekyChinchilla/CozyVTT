// ============================================
// Paint's Select: the box chosen on the picture, in map pixels.
//
// A selection is marked by a drag, then moved by a drag inside it or
// resized by a drag on a corner; its pixels are lifted off the picture as
// it starts to move, and put down as one change when it is let go
// (usePaintSurface). These are the box's own rules.
// ============================================

import type { PaintPoint } from './paintStroke';

/** A box in map pixels from the top left: x0 and y0 its top-left corner, x1 and y1 past its bottom-right. */
export interface SelectBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A corner a selection is resized by. */
export type SelectHandle = 'nw' | 'ne' | 'se' | 'sw';

const clamp = (value: number, limit: number) => Math.min(Math.max(value, 0), limit);

/** The box dragged from `a` to `b`, on a map `mapWidth` by `mapHeight` map pixels; null under a pixel wide or tall. */
export function selectedBox(a: PaintPoint, b: PaintPoint, mapWidth: number, mapHeight: number): SelectBox | null {
  const xs = [clamp(a[0], mapWidth), clamp(b[0], mapWidth)];
  const ys = [clamp(a[1], mapHeight), clamp(b[1], mapHeight)];
  // Judged on the drag, before rounding: half a pixel is no box.
  if (Math.abs(xs[0] - xs[1]) < 1 || Math.abs(ys[0] - ys[1]) < 1) return null;
  return {
    x0: Math.round(Math.min(...xs)), y0: Math.round(Math.min(...ys)),
    x1: Math.round(Math.max(...xs)), y1: Math.round(Math.max(...ys)),
  };
}

const corners = (box: SelectBox): Record<SelectHandle, PaintPoint> => ({
  nw: [box.x0, box.y0],
  ne: [box.x1, box.y0],
  se: [box.x1, box.y1],
  sw: [box.x0, box.y1],
});

/** The corner within `reach` map pixels of `point`, the nearest first, or null. */
export function handleAt(box: SelectBox, point: PaintPoint, reach: number): SelectHandle | null {
  let found: SelectHandle | null = null;
  let nearest = reach;
  for (const [handle, [x, y]] of Object.entries(corners(box)) as Array<[SelectHandle, PaintPoint]>) {
    const distance = Math.hypot(point[0] - x, point[1] - y);
    if (distance <= nearest) {
      nearest = distance;
      found = handle;
    }
  }
  return found;
}

export function isInside(box: SelectBox, point: PaintPoint): boolean {
  return point[0] >= box.x0 && point[0] <= box.x1 && point[1] >= box.y0 && point[1] <= box.y1;
}

/** The box moved by `dx` and `dy` map pixels, its size kept. */
export function movedBox(box: SelectBox, dx: number, dy: number): SelectBox {
  const x = Math.round(dx);
  const y = Math.round(dy);
  return { x0: box.x0 + x, y0: box.y0 + y, x1: box.x1 + x, y1: box.y1 + y };
}

/** The box with the corner `handle` moved to `point`, the corner across from it staying; at least a pixel each way. */
export function resizedBox(box: SelectBox, handle: SelectHandle, point: PaintPoint): SelectBox {
  const across = corners(box)[({ nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const)[handle]];
  const x = Math.round(point[0]);
  const y = Math.round(point[1]);
  const x0 = Math.min(x, across[0]);
  const y0 = Math.min(y, across[1]);
  return { x0, y0, x1: Math.max(Math.max(x, across[0]), x0 + 1), y1: Math.max(Math.max(y, across[1]), y0 + 1) };
}

/**
 * Where a copy is pasted: the box copied, `step` map pixels (a square)
 * right and down so it shows as a copy, moved back onto the map where that
 * would take it off.
 */
export function pastedBox(box: SelectBox, step: number, mapWidth: number, mapHeight: number): SelectBox {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  const x0 = Math.max(0, Math.min(box.x0 + step, mapWidth - width));
  const y0 = Math.max(0, Math.min(box.y0 + step, mapHeight - height));
  return { x0, y0, x1: x0 + width, y1: y0 + height };
}
