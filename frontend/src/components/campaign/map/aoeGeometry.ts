/**
 * aoeGeometry.ts
 * Grid snapping for area-of-effect templates.
 *
 * AoE shapes used to be anchored at the *centre of the hovered square*, so a
 * 10 ft cube on a 5 ft grid — exactly two squares across — straddled four
 * squares by half a square in each direction instead of covering two cleanly.
 * The same offset skewed lines and cones.
 *
 * The rule that fixes it is the parity rule familiar from grid play: a span an
 * **even** number of squares wide has its edges on grid lines when it is
 * centred on a grid *intersection*, and an **odd** span does when it is centred
 * on a square *centre*. Snapping each axis by the parity of the span across it
 * puts every edge on a grid line.
 *
 * Cones and lines need a second thing the parity rule cannot give them: they are
 * *aimed*, so they need a point to emerge from as well as a square to sit in.
 * That is `squareExitPoint`, and the rule there is that the origin must be a
 * **continuous** function of the anchor and the aim — see its comment for why
 * anything that classifies the angle into sectors is wrong.
 *
 * All coordinates here are **map pixels with a top-left origin**, matching
 * coords.ts — grid lines fall on exact multiples of `gridSize`, so no
 * bottom-left flip is involved.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Snap a coordinate to the nearest grid line. */
export function snapToGridLine(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

/** Snap a coordinate to the nearest square centre. */
export function snapToSquareCentre(value: number, gridSize: number): number {
  return (Math.floor(value / gridSize) + 0.5) * gridSize;
}

/**
 * Snap one axis so a span of `squares` squares centred on the result has both
 * its edges on grid lines.
 *
 * A fractional span (a 7.5 ft effect on a 5 ft grid) cannot align either way,
 * so it falls back to the square centre — a stable anchor that at least keeps
 * the shape under the cursor instead of drifting.
 */
export function snapSpanCentre(value: number, gridSize: number, squares: number): number {
  if (!Number.isInteger(squares)) return snapToSquareCentre(value, gridSize);
  return squares % 2 === 0
    ? snapToGridLine(value, gridSize)
    : snapToSquareCentre(value, gridSize);
}

/** How many grid squares a distance in feet covers. */
export function squaresFor(feet: number, feetPerSquare: number): number {
  if (!Number.isFinite(feetPerSquare) || feetPerSquare <= 0) return 0;
  return feet / feetPerSquare;
}

/**
 * The axis-aligned square a cube template covers.
 *
 * Cubes are deliberately **not** rotated. A rotated square cannot line up with
 * a square grid, and on a grid a cube occupies whole squares — so this snaps to
 * cover exactly `sideSquares × sideSquares` of them, centred near the cursor.
 *
 * Returns the top-left corner and side length in map pixels.
 */
export function cubeRect(
  cursor: Pt,
  gridSize: number,
  sideSquares: number
): { x: number; y: number; size: number } {
  const size = sideSquares * gridSize;
  const cx = snapSpanCentre(cursor.x, gridSize, sideSquares);
  const cy = snapSpanCentre(cursor.y, gridSize, sideSquares);
  return { x: cx - size / 2, y: cy - size / 2, size };
}

/**
 * Where a ray leaving the centre of a square crosses that square's edge.
 *
 * This is the point a cone or line aimed in `angleRad` actually emerges from.
 * It tracks the aim *continuously*, which is the whole point: the apex used to
 * be picked by classifying the angle into one of eight 45° sectors and snapping
 * each axis to a grid line or a square centre, so rotating a template made the
 * origin teleport between a handful of fixed spots instead of sweeping around
 * the square. Worse, the snap was direction-blind — aiming left and aiming
 * right produced the same point, so a leftward cone emerged from the right edge
 * and cut back through the caster.
 *
 * Aimed along an axis the ray lands on the midpoint of that edge; aimed exactly
 * diagonally it lands on the corner. Both fall out of the maths, so neither is
 * special-cased and there is no sector boundary to jump across.
 *
 * `centre` is expected to be a square centre, since that is what the anchor
 * snaps to; any point works, but the result is only "on the edge" for a centre.
 */
export function squareExitPoint(centre: Pt, gridSize: number, angleRad: number): Pt {
  const h = gridSize / 2;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Distance along the ray to each of the two candidate edges; the nearer one
  // is the crossing. A zero component divides to Infinity, so the other axis
  // wins — which is exactly right for an axis-aligned aim.
  const t = Math.min(h / Math.abs(cos), h / Math.abs(sin));

  // A non-finite angle (or a zero grid) leaves t unusable; fall back to the
  // centre rather than drawing the template off at NaN.
  if (!Number.isFinite(t)) return { x: centre.x, y: centre.y };

  return { x: centre.x + cos * t, y: centre.y + sin * t };
}

// Sphere and cylinder have no entry here on purpose. They sit on their anchor
// point: a circle does not tile squares whatever it is centred on, and that
// placement was not part of the reported misalignment.

/**
 * How a game system draws a cone. D&D 5e: a cone's width at any point along
 * its length equals that point's distance from where it starts, so it is a
 * triangle whose far edge, at its full length, is as wide as it is long.
 * Pathfinder 2e: a quarter circle, a 90 degree sector of its length.
 * Both checked against the systems' rulebooks.
 */
export type ConeRule = 'width-equals-distance' | 'quarter-circle';

export type ConeOutline =
  | { kind: 'triangle'; points: [Pt, Pt, Pt] }
  | { kind: 'sector'; centre: Pt; radius: number; from: number; to: number };

/** A cone from `origin`, aimed along `angleRad`, `length` map pixels long. */
export function coneOutline(origin: Pt, angleRad: number, length: number, rule: ConeRule): ConeOutline {
  if (rule === 'quarter-circle') {
    return { kind: 'sector', centre: origin, radius: length, from: angleRad - Math.PI / 4, to: angleRad + Math.PI / 4 };
  }
  // The far edge's middle, a cone's length out, and half its width either side.
  const fx = origin.x + Math.cos(angleRad) * length;
  const fy = origin.y + Math.sin(angleRad) * length;
  const px = -Math.sin(angleRad) * (length / 2);
  const py = Math.cos(angleRad) * (length / 2);
  return { kind: 'triangle', points: [origin, { x: fx - px, y: fy - py }, { x: fx + px, y: fy + py }] };
}
