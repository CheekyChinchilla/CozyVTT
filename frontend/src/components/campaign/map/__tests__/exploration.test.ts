import { describe, it, expect } from 'vitest';
import { exploredCellsFromCoverage, diffNew, EXPLORED_ALPHA, type ScratchHolder } from '../exploration';

/** A scratch canvas whose 2D context hands back the alphas we choose. */
function fakeScratch(alphas: number[] | null) {
  const holder: ScratchHolder = { current: null };
  const calls: string[] = [];
  const createCanvas = () => ({
    width: 0,
    height: 0,
    getContext: () => (alphas === null ? null : {
      imageSmoothingEnabled: false,
      clearRect: () => { calls.push('clearRect'); },
      drawImage: () => { calls.push('drawImage'); },
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        const data = new Uint8ClampedArray(w * h * 4);
        alphas.forEach((a, i) => { data[i * 4 + 3] = a; });
        return { data };
      },
    }),
  }) as unknown as HTMLCanvasElement;
  return { holder, calls, createCanvas };
}
const coverage = {} as HTMLCanvasElement;

describe('exploredCellsFromCoverage', () => {
  it('counts a cell explored at a quarter dim coverage, and not below', () => {
    const { holder, createCanvas } = fakeScratch([255, EXPLORED_ALPHA, EXPLORED_ALPHA - 1, 0, 128, 0]);
    const cells = exploredCellsFromCoverage(coverage, 3, 2, holder, createCanvas);
    expect([...(cells ?? [])]).toEqual([0, 1, 4]);
  });

  it('returns nothing for an empty mask, and null with no 2D context', () => {
    const empty = fakeScratch([0, 0, 0, 0]);
    expect(exploredCellsFromCoverage(coverage, 2, 2, empty.holder, empty.createCanvas)?.size).toBe(0);
    const none = fakeScratch(null);
    expect(exploredCellsFromCoverage(coverage, 2, 2, none.holder, none.createCanvas)).toBeNull();
  });

  it('reuses the scratch canvas while the grid size holds, and draws the mask scaled to it', () => {
    const { holder, calls, createCanvas } = fakeScratch([0, 0, 0, 0]);
    exploredCellsFromCoverage(coverage, 2, 2, holder, createCanvas);
    const first = holder.current;
    exploredCellsFromCoverage(coverage, 2, 2, holder, createCanvas);
    expect(holder.current).toBe(first);
    expect(holder.current?.width).toBe(2);
    expect(calls.filter((c) => c === 'drawImage')).toHaveLength(2);
    exploredCellsFromCoverage(coverage, 3, 2, holder, createCanvas);
    expect(holder.current).not.toBe(first);
  });
});

describe('diffNew', () => {
  it('lists only the cells not already known, ascending', () => {
    expect(diffNew(new Set([1, 2]), new Set([3, 1, 0]))).toEqual([0, 3]);
    expect(diffNew(null, new Set([2, 1]))).toEqual([1, 2]);
    expect(diffNew(new Set([1]), new Set([1]))).toEqual([]);
  });
});
