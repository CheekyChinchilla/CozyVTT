// ============================================
// A map drawn in CozyVTT: the colour it starts as, and how large it is
// made. What its picture is tagged is DRAWN_MAP_TAG, in the asset limits
// the server shares (constants/assetLimits.ts).
//
// The picture is its squares times the pixels per square it is drawn at.
// Paint holds it in one canvas, which must stay within the largest canvas
// Safari draws on an iPhone or iPad (MAX_BACKING_PIXELS) so it can be
// edited on any device, and within the largest side the server keeps
// (PICTURE_SIZE_LIMITS.maxSide). The pixels per square come down until it
// fits, never below the smallest grid size; the map is then made with that
// grid size, so the picture's own size is the map's size in pixels.
// ============================================

import { MAP_LIMITS } from '@/constants/mapLimits';
import { PICTURE_SIZE_LIMITS } from '@/constants/pictureSizeLimits';
import { MAX_BACKING_PIXELS } from '../layerCanvas';

/** A new drawn map's colour, parchment. */
export const DRAWN_MAP_BACKGROUND = '#e8dcc4';

/** The pixels per square a new drawn map is offered at. */
export const DRAWN_MAP_GRID_SIZE = 70;

export type DrawnPictureSize =
  | {
    fits: true;
    /** The pixels per square the picture is drawn at, and the map's grid size. */
    pixelsPerSquare: number;
    width: number;
    height: number;
    /** Drawn at fewer pixels a square than asked, to fit. */
    lowered: boolean;
  }
  | { fits: false };

/** The most squares a drawn map may have: as many as fit in the canvas at the smallest grid size. */
export const MOST_DRAWN_SQUARES = Math.floor(MAX_BACKING_PIXELS / (MAP_LIMITS.minGridSize * MAP_LIMITS.minGridSize));

/** The widest square map of MOST_DRAWN_SQUARES, for the message. */
const MOST_SQUARE_SIDE = Math.floor(Math.sqrt(MOST_DRAWN_SQUARES));

const count = (n: number) => n.toLocaleString('en-US');

export const TOO_MANY_SQUARES_TO_DRAW =
  `A drawn map can have at most ${count(MOST_DRAWN_SQUARES)} squares, such as ${MOST_SQUARE_SIDE} by ${MOST_SQUARE_SIDE}. Choose fewer squares.`;

/** Whether a picture of `side` pixels a square fits both limits, in whole numbers. */
function fits(squaresWide: number, squaresHigh: number, side: number): boolean {
  return Math.max(squaresWide, squaresHigh) * side <= PICTURE_SIZE_LIMITS.maxSide
    && squaresWide * side * squaresHigh * side <= MAX_BACKING_PIXELS;
}

/**
 * The picture for a map of `squaresWide` by `squaresHigh` squares asked for
 * at `gridSize` pixels a square: drawn at the grid size, or at the most
 * pixels a square below it that fit. Refused when it does not fit even at
 * MAP_LIMITS.minGridSize.
 */
export function drawnPictureSize(squaresWide: number, squaresHigh: number, gridSize: number): DrawnPictureSize {
  const w = Math.floor(squaresWide);
  const h = Math.floor(squaresHigh);
  const asked = Math.min(Math.floor(gridSize), MAP_LIMITS.maxGridSize);
  if (!(w >= 1 && h >= 1 && asked >= MAP_LIMITS.minGridSize)) return { fits: false };
  // A first guess from the limits, then one pixel either way: the square
  // root is a float, and the answer is checked in whole numbers.
  let side = Math.min(asked, Math.floor(PICTURE_SIZE_LIMITS.maxSide / Math.max(w, h)), Math.floor(Math.sqrt(MAX_BACKING_PIXELS / (w * h))));
  while (side < asked && fits(w, h, side + 1)) side += 1;
  while (side >= MAP_LIMITS.minGridSize && !fits(w, h, side)) side -= 1;
  if (side < MAP_LIMITS.minGridSize) return { fits: false };
  return { fits: true, pixelsPerSquare: side, width: w * side, height: h * side, lowered: side < asked };
}

/** What the dialog says of a size: why it is drawn at fewer pixels a square, why it cannot be drawn, or nothing. */
export function drawnSizeNote(size: DrawnPictureSize): string | null {
  if (!size.fits) return TOO_MANY_SQUARES_TO_DRAW;
  return size.lowered ? `Drawn at ${size.pixelsPerSquare} px a square so it can be edited on any device.` : null;
}
