// ============================================
// Paint's stamps: a map symbol painted into one square of the grid.
//
// Each is drawn by the code, outlined in the colour and filled with the
// second, so it follows the DM's colours and nothing needs a licence. A
// stamp is drawn about its square's middle and turned there, in 90 degree
// steps, as doors and stairs face different ways.
// ============================================

import type { PaintPoint } from './paintStroke';

export type StampKind = 'door' | 'double-door' | 'stairs' | 'pillar' | 'chest' | 'table' | 'tree' | 'rock';

/** The stamps Paint offers, in the order its picker shows them. */
export const PAINT_STAMPS: ReadonlyArray<{ kind: StampKind; label: string }> = [
  { kind: 'door', label: 'Door' },
  { kind: 'double-door', label: 'Double door' },
  { kind: 'stairs', label: 'Stairs' },
  { kind: 'pillar', label: 'Pillar' },
  { kind: 'chest', label: 'Chest' },
  { kind: 'table', label: 'Table' },
  { kind: 'tree', label: 'Tree' },
  { kind: 'rock', label: 'Rock' },
];

/** Quarter turns, clockwise. */
export type StampTurn = 0 | 1 | 2 | 3;

export interface StampPlace {
  kind: StampKind;
  /** The square's top-left corner and side, in the pixels of the canvas drawn on. */
  x: number;
  y: number;
  size: number;
  turn: StampTurn;
  colour: string;
  second: string;
}

/** The square of the grid `point` (map pixels) lies in, kept on a map `mapWidth` by `mapHeight` map pixels. */
export function stampSquare(point: PaintPoint, gridSize: number, mapWidth: number, mapHeight: number): { x: number; y: number } {
  const corner = (value: number, limit: number) => Math.min(Math.max(Math.floor(value / gridSize), 0), Math.max(Math.ceil(limit / gridSize) - 1, 0)) * gridSize;
  return { x: corner(point[0], mapWidth), y: corner(point[1], mapHeight) };
}

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
  'double-door'(ctx, s) {
    ctx.beginPath();
    ctx.rect(-0.45 * s, -0.1 * s, 0.9 * s, 0.2 * s);
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
  const { kind, x, y, size, turn, colour, second } = place;
  ctx.save();
  try {
    ctx.translate(x + size / 2, y + size / 2);
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
