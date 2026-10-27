// ============================================
// The strokes on their way that a page shows, and the laser pointers, from
// the frames their senders send (`drawing:previewed`), with no DOM.
//
// A pen stroke's or a polygon's frame, and the laser's, carries the points
// added since the one before, which are appended; a line's, an arrow's, a
// rectangle's or an ellipse's carries its two points whole, which replace
// the last. A frame with `end` drops the stroke at once, kept or cancelled;
// a stored drawing's `drawing:added` drops the preview it ends. One whose
// sender goes quiet is dropped DRAWING_LIMITS.previewTtlMs after its last
// frame, and a laser's points that long after each arrived.
//
// The server bounds frames a second, not strokes, so what a page keeps is
// bounded here: PREVIEWS_KEPT_PER_SENDER strokes from each sender and
// PREVIEW_POINTS_KEPT points in all, the stalest going first. A peer's
// script cycling previewIds at the server's most cannot make every other
// page stroke more than that.
// ============================================

import type { DrawingPreview, DrawingsClearedBroadcast, Drawing } from '@/types/drawings';
import { DRAWING_LIMITS } from '@/constants/drawingLimits';
import type { ActivePreview } from './layers/drawDrawings';

/** The kinds whose every frame carries the whole of their points. */
const WHOLE_KINDS = new Set(['line', 'arrow', 'rect', 'ellipse', 'text']);

/** A preview's key: whose it is and which of their strokes. */
export function previewKey(userId: string, previewId: string): string {
  return `${userId}:${previewId}`;
}

/** How many strokes on their way a page keeps from one sender: a stroke and a laser from each of two tabs. */
export const PREVIEWS_KEPT_PER_SENDER = 4;
/** How many points a page keeps of everyone's strokes on their way together. */
export const PREVIEW_POINTS_KEPT = 20000;

/** Take one frame from `sender`, arrived at `now`, into the previews shown. */
export function applyPreviewFrame(
  previews: Map<string, ActivePreview>,
  sender: string,
  frame: Required<DrawingPreview>,
  now: number,
): void {
  const key = previewKey(sender, frame.previewId);
  if (frame.end) {
    previews.delete(key);
    return;
  }
  if (!previews.has(key)) {
    // A sender's stalest stroke goes for a new one past the few they may keep.
    const theirs = [...previews.values()].filter((p) => p.key.startsWith(`${sender}:`));
    while (theirs.length >= PREVIEWS_KEPT_PER_SENDER) {
      const stalest = theirs.reduce((a, b) => (b.lastAt < a.lastAt ? b : a));
      previews.delete(stalest.key);
      theirs.splice(theirs.indexOf(stalest), 1);
    }
  }
  const shown: ActivePreview = previews.get(key) ?? {
    key, kind: frame.kind, color: frame.color, width: frame.width, audience: frame.audience, laser: frame.laser,
    points: [], times: [], lastAt: now,
  };
  const points = frame.points.map(([x, y]): [number, number] => [x, y]);
  if (!frame.laser && WHOLE_KINDS.has(frame.kind)) {
    shown.points = points;
    shown.times = points.map(() => now);
  } else {
    shown.points.push(...points);
    shown.times.push(...points.map(() => now));
    // A stroke no drawing may hold more of: the oldest go first.
    const over = shown.points.length - DRAWING_LIMITS.maxPoints;
    if (over > 0) {
      shown.points.splice(0, over);
      shown.times.splice(0, over);
    }
  }
  shown.lastAt = now;
  previews.set(key, shown);
  keepWithinPoints(previews, key);
}

/** Let the stalest strokes go until all of them hold PREVIEW_POINTS_KEPT points at most, never `keep`. */
function keepWithinPoints(previews: Map<string, ActivePreview>, keep: string): void {
  let total = 0;
  for (const p of previews.values()) total += p.points.length;
  while (total > PREVIEW_POINTS_KEPT) {
    let stalest: ActivePreview | null = null;
    for (const p of previews.values()) {
      if (p.key !== keep && (!stalest || p.lastAt < stalest.lastAt)) stalest = p;
    }
    if (!stalest) return;
    previews.delete(stalest.key);
    total -= stalest.points.length;
  }
}

/**
 * Drop what has had its time at `now`: a stroke whose last frame is
 * previewTtlMs old, and a laser's points as old as that. True while any is
 * left to show.
 */
export function prunePreviews(previews: Map<string, ActivePreview>, now: number): boolean {
  const ttl = DRAWING_LIMITS.previewTtlMs;
  for (const [key, p] of previews) {
    if (now - p.lastAt >= ttl) {
      previews.delete(key);
      continue;
    }
    if (p.laser) {
      let gone = 0;
      while (gone < p.times.length && now - p.times[gone] >= ttl) gone += 1;
      if (gone > 0) {
        p.points.splice(0, gone);
        p.times.splice(0, gone);
      }
      if (p.points.length === 0) previews.delete(key);
    }
  }
  return previews.size > 0;
}

/**
 * Which drawings a `drawings:cleared` took from this page. Without an
 * `authorId` it is every drawing on the layer (the DM's Clear drawings).
 * With one it is that member's Clear mine, which takes a player's drawings
 * for everyone and every drawing of the DM's: the one DM seat is this
 * page's when the author is this page's member and its role is the DM's,
 * and a player's otherwise.
 */
export function clearedBy(
  event: DrawingsClearedBroadcast,
  viewer: { role: string | null | undefined; userId: string | undefined },
): (d: Drawing) => boolean {
  return (d) => {
    if (d.layer !== event.layer) return false;
    if (event.authorId === undefined) return true;
    if (d.authorId !== event.authorId) return false;
    return d.audience === 'ALL' || (viewer.role === 'DM' && event.authorId === viewer.userId);
  };
}
