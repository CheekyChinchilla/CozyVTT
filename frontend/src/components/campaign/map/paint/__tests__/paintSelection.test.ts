import { describe, it, expect } from 'vitest';
import { handleAt, isInside, movedBox, pastedBox, resizedBox, selectedBox } from '../paintSelection';

const box = { x0: 100, y0: 100, x1: 300, y1: 200 };

describe('selectedBox', () => {
  it('is the box dragged, whichever way, kept on the map', () => {
    expect(selectedBox([300, 200], [100, 100], 1000, 800)).toEqual(box);
    expect(selectedBox([-50, 700], [120, 900], 1000, 800)).toEqual({ x0: 0, y0: 700, x1: 120, y1: 800 });
  });

  it('is no box under a pixel wide or tall', () => {
    expect(selectedBox([100, 100], [100.5, 300], 1000, 800)).toBeNull();
  });
});

describe('handleAt and isInside', () => {
  it('find the corner a press is within reach of, before the inside', () => {
    expect(handleAt(box, [104, 96], 8)).toBe('nw');
    expect(handleAt(box, [296, 205], 8)).toBe('se');
    expect(handleAt(box, [200, 150], 8)).toBeNull();
    expect(isInside(box, [200, 150])).toBe(true);
    expect(isInside(box, [301, 150])).toBe(false);
  });
});

describe('movedBox and resizedBox', () => {
  it('move the box by the drag, its size kept', () => {
    expect(movedBox(box, 25, -40)).toEqual({ x0: 125, y0: 60, x1: 325, y1: 160 });
  });

  it('move the corner held, the one across from it staying, turning over when dragged past it', () => {
    expect(resizedBox(box, 'se', [400, 260])).toEqual({ x0: 100, y0: 100, x1: 400, y1: 260 });
    expect(resizedBox(box, 'nw', [350, 250])).toEqual({ x0: 300, y0: 200, x1: 350, y1: 250 });
    expect(resizedBox(box, 'ne', [100, 150])).toEqual({ x0: 100, y0: 150, x1: 101, y1: 200 });
  });
});

describe('pastedBox', () => {
  it('is the box copied, one square right and down, kept on the map', () => {
    expect(pastedBox(box, 50, 1000, 800)).toEqual({ x0: 150, y0: 150, x1: 350, y1: 250 });
    expect(pastedBox({ x0: 900, y0: 700, x1: 1000, y1: 800 }, 50, 1000, 800)).toEqual({ x0: 900, y0: 700, x1: 1000, y1: 800 });
  });
});
