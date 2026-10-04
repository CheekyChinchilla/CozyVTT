// ============================================
// The visibility rule
//
// One place that decides how much of a point a viewer can make out. The
// server uses it to decide which tokens to send a player; the client uses it
// to decide what to draw and which doors to show. It is the same file, byte
// for byte, in backend/src/utils and frontend/src/utils; a backend test fails
// if the two copies drift. Pure: the point-in-polygon test is injected, so
// neither side depends on the other's raycaster.
//
// In order: walls first, always. Nothing outside a viewer's line of sight is
// seen, lit or not. Then Global Illumination: everything in sight is bright.
// Then darkvision and light, adding up the way the coverage mask draws them:
// dim + dim is bright, and darkvision in dim light is bright. A viewer's own
// square always counts as dim: you know where you stand.
// ============================================

/** Coverage-mask alpha for bright light. */
export const BRIGHT = 1.0;
/** Coverage-mask alpha for dim light, and for darkness within darkvision. */
export const DIM = 0.5;

export interface RulePoint {
  x: number;
  y: number;
}

export interface RulePolygon {
  points: RulePoint[];
}

/** Whether a point lies inside a polygon; supplied by the caller's raycaster. */
export type InsideFn = (p: RulePoint, poly: RulePolygon) => boolean;

export interface Viewer {
  cx: number;
  cy: number;
  /** Line of sight, bounded by walls only, never by the sight radius. */
  sight: RulePolygon;
  /** How far the viewer makes things out unlit, in px. 0 means none. */
  darkvisionPx: number;
  /** Half the viewer's own footprint, in px. */
  selfPx: number;
}

export interface Lit {
  cx: number;
  cy: number;
  /** What the light reaches: bounded by walls and by its dim radius. */
  reach: RulePolygon;
  brightPx: number;
  dimPx: number;
}

export type Tier = 'bright' | 'dim' | 'dark';

function distance(p: RulePoint, o: { cx: number; cy: number }): number {
  return Math.hypot(p.x - o.cx, p.y - o.cy);
}

/** How well a point is seen by any of the viewers, given the lights. */
export function tierAt(
  p: RulePoint,
  viewers: readonly Viewer[],
  lights: readonly Lit[],
  globalIllumination: boolean,
  inside: InsideFn
): Tier {
  const seeing = viewers.filter((v) => inside(p, v.sight));
  if (seeing.length === 0) return 'dark';
  if (globalIllumination) return 'bright';

  let alpha = 0;
  if (seeing.some((v) => distance(p, v) <= v.selfPx)) {
    alpha += DIM;
  } else if (seeing.some((v) => v.darkvisionPx > 0 && distance(p, v) <= v.darkvisionPx)) {
    alpha += DIM;
  }
  for (const light of lights) {
    if (!inside(p, light.reach)) continue;
    const d = distance(p, light);
    alpha += d <= light.brightPx ? BRIGHT : d <= light.dimPx ? DIM : 0;
  }
  return alpha >= BRIGHT ? 'bright' : alpha > 0 ? 'dim' : 'dark';
}

/** Whether a point is seen at all. This is what decides if a token is sent. */
export function isSeen(
  p: RulePoint,
  viewers: readonly Viewer[],
  lights: readonly Lit[],
  globalIllumination: boolean,
  inside: InsideFn
): boolean {
  return tierAt(p, viewers, lights, globalIllumination, inside) !== 'dark';
}
