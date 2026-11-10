// ============================================
// Paint's textures: stone, wood, grass, water, sand, bricks, cobbles and
// tiles, drawn by the code into one square of the grid in shades of the
// colour being painted, and repeated from the picture's top-left corner so
// they line up with the grid. Nothing needs a licence. Each tile is drawn
// from a fixed seed, so the same texture of the same colour is the same
// every time, and its marks keep clear of its edges or cross them where the
// opposite edge takes them up, so the tiles join without seams.
// ============================================

import { hexToRgba, type Rgba } from './pixelColour';

export type TextureKind = 'stone' | 'wood' | 'grass' | 'water' | 'sand' | 'bricks' | 'cobbles' | 'tiles';

/** A texture, and the colour whose shades it is drawn in. */
export interface ShadedTexture {
  kind: TextureKind;
  colour: string;
}

/** The textures Paint offers, in the order its picker shows them. */
export const PAINT_TEXTURES: ReadonlyArray<{ kind: TextureKind; label: string }> = [
  { kind: 'stone', label: 'Stone' },
  { kind: 'bricks', label: 'Bricks' },
  { kind: 'cobbles', label: 'Cobbles' },
  { kind: 'tiles', label: 'Tiles' },
  { kind: 'wood', label: 'Wood' },
  { kind: 'grass', label: 'Grass' },
  { kind: 'sand', label: 'Sand' },
  { kind: 'water', label: 'Water' },
];

/** A texture tile's side, in picture pixels: a square of the grid, kept within reason. */
export function textureSize(squarePixels: number): number {
  return Math.min(512, Math.max(8, Math.round(squarePixels)));
}

/** `colour` mixed `amount` (0 to 1) of the way to black (negative) or white (positive), as #rrggbb. */
export function shade(colour: string, amount: number): string {
  const [r, g, b] = hexToRgba(colour) as Rgba;
  const towards = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (towards - c) * t).toString(16).padStart(2, '0');
  return `#${mix(r)}${mix(g)}${mix(b)}`;
}

/** A small seeded random number generator (mulberry32): the same seed, the same numbers. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS: Record<TextureKind, number> = { stone: 11, wood: 23, grass: 37, water: 41, sand: 53, bricks: 67, cobbles: 71, tiles: 83 };

/** Each texture's marks, drawn over its base colour on a tile `n` pixels across. */
const MARKS: Record<TextureKind, (ctx: CanvasRenderingContext2D, n: number, base: string, random: () => number) => void> = {
  // Flagstones: two cracks meeting near the middle, each reaching the same
  // place on opposite edges.
  stone(ctx, n, base, random) {
    const a = n * (0.35 + random() * 0.3);
    const b = n * (0.35 + random() * 0.3);
    const mid: [number, number] = [n * (0.4 + random() * 0.2), n * (0.4 + random() * 0.2)];
    ctx.strokeStyle = shade(base, -0.35);
    ctx.lineWidth = Math.max(1, n * 0.035);
    ctx.beginPath();
    ctx.moveTo(a, 0);
    ctx.lineTo(mid[0], mid[1]);
    ctx.lineTo(a, n);
    ctx.moveTo(0, b);
    ctx.lineTo(mid[0], mid[1]);
    ctx.lineTo(n, b);
    ctx.stroke();
    speckle(ctx, n, shade(base, 0.12), random, 10, 0.03);
  },
  // Planks across, three to a square, their ends in different places, with grain.
  wood(ctx, n, base, random) {
    const plank = n / 3;
    ctx.strokeStyle = shade(base, -0.4);
    ctx.lineWidth = Math.max(1, n * 0.03);
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      ctx.moveTo(0, i * plank);
      ctx.lineTo(n, i * plank);
      const end = n * (0.15 + random() * 0.7);
      ctx.moveTo(end, i * plank);
      ctx.lineTo(end, (i + 1) * plank);
    }
    ctx.stroke();
    ctx.strokeStyle = shade(base, -0.15);
    ctx.lineWidth = Math.max(1, n * 0.012);
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const y = i * plank + plank * (0.35 + random() * 0.3);
      ctx.moveTo(n * 0.05, y);
      ctx.lineTo(n * 0.95, y + (random() - 0.5) * plank * 0.2);
    }
    ctx.stroke();
  },
  // Short blades, lighter and darker, kept off the edges.
  grass(ctx, n, base, random) {
    ctx.lineWidth = Math.max(1, n * 0.02);
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i += 1) {
      ctx.strokeStyle = shade(base, i % 2 === 0 ? -0.3 : 0.2);
      const x = n * (0.08 + random() * 0.84);
      const y = n * (0.12 + random() * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * n * 0.08, y - n * (0.06 + random() * 0.06));
      ctx.stroke();
    }
  },
  // Waves across, their length the square's, so each joins the next.
  water(ctx, n, base) {
    ctx.strokeStyle = shade(base, 0.3);
    ctx.lineWidth = Math.max(1, n * 0.025);
    for (const row of [0.25, 0.6, 0.9]) {
      ctx.beginPath();
      for (let x = 0; x <= n; x += Math.max(1, n / 32)) {
        const y = n * row + Math.sin((x / n) * Math.PI * 2 + row * 5) * n * 0.04;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
  sand(ctx, n, base, random) {
    speckle(ctx, n, shade(base, -0.25), random, 30, 0.015);
    speckle(ctx, n, shade(base, 0.25), random, 20, 0.015);
  },
  // Bricks in two courses, the second set half a brick along, in mortar.
  bricks(ctx, n, base) {
    ctx.strokeStyle = shade(base, 0.45);
    ctx.lineWidth = Math.max(1, n * 0.05);
    ctx.beginPath();
    for (const y of [0, n / 2, n]) {
      ctx.moveTo(0, y);
      ctx.lineTo(n, y);
    }
    ctx.moveTo(0, 0);
    ctx.lineTo(0, n / 2);
    ctx.moveTo(n, 0);
    ctx.lineTo(n, n / 2);
    ctx.moveTo(n / 2, n / 2);
    ctx.lineTo(n / 2, n);
    ctx.stroke();
  },
  // Rounded stones, three by three, each a shade apart, kept within the tile.
  cobbles(ctx, n, base, random) {
    const cell = n / 3;
    ctx.lineWidth = Math.max(1, n * 0.025);
    ctx.strokeStyle = shade(base, -0.4);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        ctx.fillStyle = shade(base, (random() - 0.5) * 0.25);
        ctx.beginPath();
        ctx.ellipse((col + 0.5) * cell, (row + 0.5) * cell, cell * (0.38 + random() * 0.08), cell * (0.36 + random() * 0.08), random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  },
  // Four square tiles to a square of the grid, in grout.
  tiles(ctx, n, base) {
    ctx.strokeStyle = shade(base, -0.3);
    ctx.lineWidth = Math.max(1, n * 0.04);
    ctx.beginPath();
    for (const at of [0, n / 2, n]) {
      ctx.moveTo(at, 0);
      ctx.lineTo(at, n);
      ctx.moveTo(0, at);
      ctx.lineTo(n, at);
    }
    ctx.stroke();
  },
};

/** `count` dots of `colour`, `size` of the tile across, kept off the edges. */
function speckle(ctx: CanvasRenderingContext2D, n: number, colour: string, random: () => number, count: number, size: number): void {
  ctx.fillStyle = colour;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    ctx.arc(n * (0.05 + random() * 0.9), n * (0.05 + random() * 0.9), Math.max(0.5, n * size), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw `kind` in shades of `base` into a canvas `n` pixels square that `make` gives; null when it cannot be drawn. */
export function drawTextureTile(kind: TextureKind, base: string, n: number, make: () => HTMLCanvasElement): HTMLCanvasElement | null {
  const canvas = make();
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, n, n);
  MARKS[kind](ctx, n, base, seeded(SEEDS[kind]));
  return canvas;
}

/** Each context's pattern of each tile, at the scale it was made for: a preview is drawn again at every move of the pointer. */
const patterns = new WeakMap<CanvasRenderingContext2D, WeakMap<CanvasImageSource, { scale: number; pattern: CanvasPattern }>>();

/**
 * `tile` as a pattern for `ctx`, repeating from the top-left corner of the
 * space it draws in, each tile pixel `scale` of that space's pixels: 1 on the
 * picture, and a picture pixel's width in map pixels on the overlay, so what
 * is on its way lines up with where it lands. Made once for each context,
 * tile and scale; null when the tile cannot be repeated.
 */
export function tilePattern(ctx: CanvasRenderingContext2D, tile: CanvasImageSource, scale: number): CanvasPattern | null {
  let kept = patterns.get(ctx);
  if (!kept) {
    kept = new WeakMap();
    patterns.set(ctx, kept);
  }
  const made = kept.get(tile);
  if (made && made.scale === scale) return made.pattern;
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return null;
  if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
  }
  kept.set(tile, { scale, pattern });
  return pattern;
}
