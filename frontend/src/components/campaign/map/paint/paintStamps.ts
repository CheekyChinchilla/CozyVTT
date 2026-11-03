// ============================================
// Paint's stamps: a map symbol painted into one square of the grid.
//
// Each is drawn by the code, outlined in the colour and filled with the
// second, so it follows the DM's colours and nothing needs a licence. A
// stamp is drawn about its middle and turned there, in 90 degree steps, as
// doors and stairs face different ways. On the grid, most sit in the middle
// of a square; a door sits on a grid line, as a door stands in a wall, and a
// double door spans two squares, centred on a corner of the grid. Off the
// grid, a stamp's middle is where it was clicked.
// ============================================

import type { PaintPoint } from './paintStroke';

export type StampKind =
  | 'door' | 'double-door' | 'stairs' | 'pillar' | 'table' | 'chair' | 'bed' | 'chest'
  | 'barrel' | 'tree' | 'bush' | 'rock' | 'pool' | 'torch' | 'trap' | 'altar';

/** The stamps Paint offers, in the order its picker shows them. */
export const PAINT_STAMPS: ReadonlyArray<{ kind: StampKind; label: string }> = [
  { kind: 'door', label: 'Door' },
  { kind: 'double-door', label: 'Double door' },
  { kind: 'stairs', label: 'Stairs' },
  { kind: 'pillar', label: 'Pillar' },
  { kind: 'table', label: 'Table' },
  { kind: 'chair', label: 'Chair' },
  { kind: 'bed', label: 'Bed' },
  { kind: 'chest', label: 'Chest' },
  { kind: 'barrel', label: 'Barrel' },
  { kind: 'tree', label: 'Tree' },
  { kind: 'bush', label: 'Bush' },
  { kind: 'rock', label: 'Rock' },
  { kind: 'pool', label: 'Pool' },
  { kind: 'torch', label: 'Torch' },
  { kind: 'trap', label: 'Trap' },
  { kind: 'altar', label: 'Altar' },
];

/** Quarter turns, clockwise. */
export type StampTurn = 0 | 1 | 2 | 3;

export interface StampPlace {
  kind: StampKind;
  /** The stamp's middle and a square's side, in the pixels of the canvas drawn on. */
  cx: number;
  cy: number;
  size: number;
  turn: StampTurn;
  colour: string;
  second: string;
}

/**
 * Where a stamp clicked at `point` (map pixels) goes, its middle in map
 * pixels, on a map `mapWidth` by `mapHeight` map pixels. Off the grid
 * (`snap` false), the point itself, kept on the map. On it: the middle of
 * the square clicked; for a door, the grid line nearest it along that
 * square's side, across the way the door runs; for a double door, the
 * nearest corner of the grid.
 */
export function stampCentre(kind: StampKind, turn: StampTurn, point: PaintPoint, gridSize: number, mapWidth: number, mapHeight: number, snap: boolean): [number, number] {
  const keep = (value: number, limit: number) => Math.min(Math.max(value, 0), limit);
  if (!snap) return [keep(point[0], mapWidth), keep(point[1], mapHeight)];
  const g = gridSize;
  const middle = (value: number, limit: number) => Math.min(Math.max(Math.floor(value / g), 0), Math.max(Math.ceil(limit / g) - 1, 0)) * g + g / 2;
  const line = (value: number, limit: number) => keep(Math.round(value / g) * g, limit);
  const along = turn % 2 === 0;
  if (kind === 'double-door') return [line(point[0], mapWidth), line(point[1], mapHeight)];
  if (kind === 'door') return along ? [middle(point[0], mapWidth), line(point[1], mapHeight)] : [line(point[0], mapWidth), middle(point[1], mapHeight)];
  return [middle(point[0], mapWidth), middle(point[1], mapHeight)];
}

/** How far a stamp reaches from its middle, in squares: a double door's two squares, the others' one with its outline. */
export const stampReach = (kind: StampKind) => (kind === 'double-door' ? 1 : 0.55);

/** Outline the path just made in the colour, filling it with the second first when `filled`. */
function finish(ctx: CanvasRenderingContext2D, filled: boolean): void {
  if (filled) ctx.fill();
  ctx.stroke();
}

/** Each stamp, drawn about (0, 0) in a square of side `s`. */
const SHAPES: Record<StampKind, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  // A door leaf across the middle of the square, as it stands in a wall.
  door(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.4 * s, -0.1 * s, 0.8 * s, 0.2 * s);
    finish(ctx, true);
  },
  // Two leaves across two squares, meeting at the middle.
  'double-door'(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.9 * s, -0.1 * s, 1.8 * s, 0.2 * s);
    finish(ctx, true);
    ctx.beginPath();
    ctx.moveTo(0, -0.1 * s);
    ctx.lineTo(0, 0.1 * s);
    ctx.stroke();
  },
  // Steps across the square, the top one widest.
  stairs(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.4 * s, -0.4 * s, 0.8 * s, 0.8 * s);
    finish(ctx, true);
    ctx.beginPath();
    for (let i = 1; i < 5; i += 1) {
      const y = -0.4 * s + (0.8 * s * i) / 5;
      const inset = 0.04 * s * i;
      ctx.moveTo(-0.4 * s + inset, y);
      ctx.lineTo(0.4 * s - inset, y);
    }
    ctx.stroke();
  },
  pillar(ctx, s) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.3 * s, 0, Math.PI * 2);
    finish(ctx, true);
  },
  chest(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.3 * s, -0.2 * s, 0.6 * s, 0.4 * s);
    finish(ctx, true);
    ctx.beginPath();
    ctx.moveTo(-0.3 * s, -0.05 * s);
    ctx.lineTo(0.3 * s, -0.05 * s);
    ctx.stroke();
  },
  table(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.35 * s, -0.25 * s, 0.7 * s, 0.5 * s);
    finish(ctx, true);
  },
  // A canopy of five lobes round a trunk. The lobes are outlined at twice
  // the width, then filled over, so only the canopy's outer edge shows.
  tree(ctx, s) {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const angle = (Math.PI * 2 * i) / 5;
      ctx.moveTo(Math.cos(angle) * 0.2 * s + 0.18 * s, Math.sin(angle) * 0.2 * s);
      ctx.arc(Math.cos(angle) * 0.2 * s, Math.sin(angle) * 0.2 * s, 0.18 * s, 0, Math.PI * 2);
    }
    const width = ctx.lineWidth;
    ctx.lineWidth = width * 2;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.06 * s, 0, Math.PI * 2);
    ctx.stroke();
  },
  // A seat with its back along the top.
  chair(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.2 * s, -0.12 * s, 0.4 * s, 0.34 * s);
    finish(ctx, true);
    ctx.beginPath();
    ctx.rect(-0.2 * s, -0.24 * s, 0.4 * s, 0.1 * s);
    finish(ctx, true);
  },
  // A bed with its pillow at the top and the turned-down blanket's edge.
  bed(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.25 * s, -0.4 * s, 0.5 * s, 0.8 * s);
    finish(ctx, true);
    ctx.beginPath();
    ctx.rect(-0.17 * s, -0.33 * s, 0.34 * s, 0.13 * s);
    ctx.moveTo(-0.25 * s, -0.08 * s);
    ctx.lineTo(0.25 * s, -0.08 * s);
    ctx.stroke();
  },
  // A barrel seen from above: its rim and its lid's hoop.
  barrel(ctx, s) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.3 * s, 0, Math.PI * 2);
    finish(ctx, true);
    ctx.beginPath();
    ctx.arc(0, 0, 0.17 * s, 0, Math.PI * 2);
    ctx.stroke();
  },
  // A smaller canopy of four lobes, no trunk; outlined as the tree's is.
  bush(ctx, s) {
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const angle = (Math.PI * 2 * i) / 4 + Math.PI / 4;
      ctx.moveTo(Math.cos(angle) * 0.13 * s + 0.15 * s, Math.sin(angle) * 0.13 * s);
      ctx.arc(Math.cos(angle) * 0.13 * s, Math.sin(angle) * 0.13 * s, 0.15 * s, 0, Math.PI * 2);
    }
    const width = ctx.lineWidth;
    ctx.lineWidth = width * 2;
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.fill();
  },
  // A pool of water: its edge and a ripple.
  pool(ctx, s) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.42 * s, 0.32 * s, 0, 0, Math.PI * 2);
    finish(ctx, true);
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.2 * s, 0.12 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  // A torch: its haft and, at the top, its flame in the colour.
  torch(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, 0.32 * s);
    ctx.lineTo(0, -0.05 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -0.17 * s, 0.12 * s, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  },
  // A trapdoor: a square marked across, not filled, so the floor shows.
  trap(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.35 * s, -0.35 * s, 0.7 * s, 0.7 * s);
    ctx.moveTo(-0.35 * s, -0.35 * s);
    ctx.lineTo(0.35 * s, 0.35 * s);
    ctx.moveTo(0.35 * s, -0.35 * s);
    ctx.lineTo(-0.35 * s, 0.35 * s);
    ctx.stroke();
  },
  // An altar with a candle at each end.
  altar(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.38 * s, -0.2 * s, 0.76 * s, 0.4 * s);
    finish(ctx, true);
    ctx.beginPath();
    ctx.arc(-0.24 * s, 0, 0.06 * s, 0, Math.PI * 2);
    ctx.moveTo(0.3 * s, 0);
    ctx.arc(0.24 * s, 0, 0.06 * s, 0, Math.PI * 2);
    ctx.stroke();
  },
  rock(ctx, s) {
    const corners: Array<[number, number]> = [[-0.35, 0.1], [-0.2, -0.3], [0.15, -0.35], [0.38, -0.05], [0.25, 0.3], [-0.15, 0.32]];
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * s, y * s) : ctx.lineTo(x * s, y * s)));
    ctx.closePath();
    finish(ctx, true);
  },
};

/** Paint a stamp into its square, turned about its middle. */
export function drawStamp(ctx: CanvasRenderingContext2D, place: StampPlace): void {
  const { kind, cx, cy, size, turn, colour, second } = place;
  ctx.save();
  try {
    ctx.translate(cx, cy);
    ctx.rotate((turn * Math.PI) / 2);
    ctx.strokeStyle = colour;
    ctx.fillStyle = second;
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    SHAPES[kind](ctx, size);
  } finally {
    ctx.restore();
  }
}
