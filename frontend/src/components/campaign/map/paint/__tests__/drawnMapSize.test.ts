/**
 * How large a drawn map's picture is: its squares times the pixels per
 * square it is drawn at, within the largest canvas Safari draws on an
 * iPhone or iPad (16,777,216 pixels) and the largest side the server keeps
 * (16,384 pixels). The pixels per square come down to fit, never below the
 * smallest grid size; a map that cannot fit even then is refused.
 */

import { describe, it, expect } from 'vitest';
import { drawnPictureSize, drawnSizeNote, MOST_DRAWN_SQUARES, TOO_MANY_SQUARES_TO_DRAW } from '../drawnMapSize';
import { MAP_LIMITS } from '@/constants/mapLimits';
import { PICTURE_SIZE_LIMITS } from '@/constants/pictureSizeLimits';
import { MAX_BACKING_PIXELS } from '../../layerCanvas';

describe('a drawn picture\'s size', () => {
  it.each([
    // squares wide, high, the grid size asked for, the pixels per square it is drawn at
    [100, 100, 70, 40],
    [59, 59, 70, 69],
    [1, 500, 70, 32],
    [409, 409, 70, 10],
    [500, 335, 70, 10],
    [20, 20, 70, 70],
    [20, 20, 500, 204],
    [32, 32, 500, 128],
    [33, 33, 500, 124],
    [1, 500, 500, 32],
    [1, 1, 500, 500],
  ])('%i by %i squares at %i px a square is drawn at %i', (w, h, grid, expected) => {
    const size = drawnPictureSize(w, h, grid);
    expect(size).toEqual({
      fits: true,
      pixelsPerSquare: expected,
      width: w * expected,
      height: h * expected,
      lowered: expected < grid,
    });
  });

  it.each([
    [410, 410],
    [500, 336],
    [500, 500],
  ])('refuses %i by %i squares, which do not fit even at the smallest grid size', (w, h) => {
    expect(drawnPictureSize(w, h, 70)).toEqual({ fits: false });
  });

  it('keeps every picture it allows within both limits, at the boundary as well', () => {
    for (const [w, h] of [[409, 409], [500, 335], [128, 128], [1, 1], [500, 1], [234, 500]]) {
      const size = drawnPictureSize(w, h, MAP_LIMITS.maxGridSize);
      if (!size.fits) throw new Error(`${w} by ${h} was refused`);
      expect(size.width * size.height).toBeLessThanOrEqual(MAX_BACKING_PIXELS);
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(PICTURE_SIZE_LIMITS.maxSide);
      // One pixel more a square would not fit.
      const more = size.pixelsPerSquare + 1;
      if (size.pixelsPerSquare < MAP_LIMITS.maxGridSize) {
        expect((w * more) * (h * more) > MAX_BACKING_PIXELS || Math.max(w, h) * more > PICTURE_SIZE_LIMITS.maxSide).toBe(true);
      }
    }
  });

  it('counts the most squares a drawn map may have from the canvas limit and the smallest grid size', () => {
    expect(MOST_DRAWN_SQUARES).toBe(167_772);
    expect(TOO_MANY_SQUARES_TO_DRAW).toBe('A drawn map can have at most 167,772 squares, such as 409 by 409. Choose fewer squares.');
  });

  it('says when the picture is drawn at fewer pixels a square than asked, and not otherwise', () => {
    expect(drawnSizeNote(drawnPictureSize(100, 100, 70))).toBe('Drawn at 40 px a square so it can be edited on any device.');
    expect(drawnSizeNote(drawnPictureSize(20, 20, 70))).toBeNull();
    expect(drawnSizeNote(drawnPictureSize(410, 410, 70))).toBe(TOO_MANY_SQUARES_TO_DRAW);
  });
});
