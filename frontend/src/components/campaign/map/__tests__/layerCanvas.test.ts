/**
 * The map's canvases at the screen's pixel ratio.
 *
 * A canvas holds as many pixels as its `width` and `height` say, and the page
 * stretches them over its CSS box. Sized in CSS pixels, a phone at ratio 3
 * showed each canvas pixel as nine and the map came out soft. Each canvas is
 * now `css * ratio` pixels across, its CSS box the size it always was, and
 * every layer draws through one transform that folds the ratio into the view.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_BACKING_PIXELS,
  applyViewport,
  clearLayer,
  effectiveDpr,
  sizeBackingStore,
} from '../layerCanvas';

describe('effectiveDpr', () => {
  it('draws at the device ratio on an ordinary screen', () => {
    expect(effectiveDpr(1, 1440, 900)).toBe(1);
    expect(effectiveDpr(2, 1024, 768)).toBe(2);
    expect(effectiveDpr(2.625, 412, 915)).toBe(2.625);
  });

  it('draws at no more than 3', () => {
    expect(effectiveDpr(4, 400, 800)).toBe(3);
  });

  // Safari on an iPhone or iPad holds no single canvas over 4,096 squared.
  it('lowers the ratio until the canvas fits within the backing limit', () => {
    expect(MAX_BACKING_PIXELS).toBe(16_777_216);
    const ratio = effectiveDpr(3, 4000, 2000);
    expect(ratio).toBeCloseTo(1.448, 3);
    expect(Math.floor(4000 * ratio) * Math.floor(2000 * ratio)).toBeLessThanOrEqual(MAX_BACKING_PIXELS);
  });

  it('never draws a huge screen coarser than one pixel per CSS pixel', () => {
    expect(effectiveDpr(2, 6000, 4000)).toBe(1);
    expect(effectiveDpr(1, 6000, 4000)).toBe(1);
  });

  // Zoomed out, the browser reports a ratio under 1; that is the screen's own.
  it('keeps a ratio under 1 as it is', () => {
    expect(effectiveDpr(0.5, 1440, 900)).toBe(0.5);
    expect(effectiveDpr(0.5, 9000, 9000)).toBe(0.5);
  });

  it('takes a missing or unusable ratio as 1', () => {
    expect(effectiveDpr(undefined, 800, 600)).toBe(1);
    expect(effectiveDpr(Number.NaN, 800, 600)).toBe(1);
    expect(effectiveDpr(Number.POSITIVE_INFINITY, 800, 600)).toBe(1);
    expect(effectiveDpr(0, 800, 600)).toBe(1);
  });

  it('takes a canvas not yet measured as no constraint', () => {
    expect(effectiveDpr(3, 0, 0)).toBe(3);
  });
});

describe('sizeBackingStore', () => {
  /** A canvas that counts what is assigned to its size, in pixels and in CSS. */
  function countingCanvas() {
    const canvas = document.createElement('canvas');
    const assigned: string[] = [];
    let width = canvas.width;
    let height = canvas.height;
    Object.defineProperty(canvas, 'width', {
      get: () => width,
      set: (v: number) => { assigned.push('width'); width = v; },
    });
    Object.defineProperty(canvas, 'height', {
      get: () => height,
      set: (v: number) => { assigned.push('height'); height = v; },
    });
    return { canvas, assigned };
  }

  it('gives the canvas css times ratio pixels and keeps its CSS size', () => {
    const canvas = document.createElement('canvas');
    expect(sizeBackingStore(canvas, 800, 600, 2)).toBe(true);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe('800px');
    expect(canvas.style.height).toBe('600px');
  });

  // Today's canvas took its width from an attribute, which drops the
  // fraction; the CSS box followed it. At ratio 1 that is kept exactly.
  it('floors the pixel size and sets the CSS size to the pixels over the ratio', () => {
    const canvas = document.createElement('canvas');
    sizeBackingStore(canvas, 812.5, 600.75, 1);
    expect(canvas.width).toBe(812);
    expect(canvas.height).toBe(600);
    expect(canvas.style.width).toBe('812px');
    expect(canvas.style.height).toBe('600px');

    sizeBackingStore(canvas, 812.75, 600.75, 2);
    expect(canvas.width).toBe(1625);
    expect(canvas.height).toBe(1201);
    expect(canvas.style.width).toBe('812.5px');
    expect(canvas.style.height).toBe('600.5px');
  });

  // Assigning a canvas's width, even the one it has, clears its picture.
  it('assigns nothing and answers false when nothing changed', () => {
    const { canvas, assigned } = countingCanvas();
    expect(sizeBackingStore(canvas, 800, 600, 2)).toBe(true);
    assigned.length = 0;
    const styleWidth = canvas.style.width;

    expect(sizeBackingStore(canvas, 800, 600, 2)).toBe(false);
    expect(assigned).toEqual([]);
    expect(canvas.style.width).toBe(styleWidth);
  });

  it('answers true when only the ratio changed', () => {
    const canvas = document.createElement('canvas');
    sizeBackingStore(canvas, 800, 600, 1);
    expect(sizeBackingStore(canvas, 800, 600, 2)).toBe(true);
    expect(canvas.width).toBe(1600);
    expect(canvas.style.width).toBe('800px');
  });

  it('assigns only the side that changed', () => {
    const { canvas, assigned } = countingCanvas();
    sizeBackingStore(canvas, 800, 600, 1);
    assigned.length = 0;
    expect(sizeBackingStore(canvas, 800, 500, 1)).toBe(true);
    expect(assigned).toEqual(['height']);
  });
});

describe('applyViewport', () => {
  function transformRecorder() {
    const calls: unknown[][] = [];
    const ctx = { setTransform: (...args: unknown[]) => { calls.push(args); } } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  }

  it('at ratio 1 sets the transform a translate by the pan and a scale by the zoom made', () => {
    const { ctx, calls } = transformRecorder();
    applyViewport(ctx, { zoom: 1.5, panOffset: { x: 30, y: -20 } }, 1);
    expect(calls).toEqual([[1.5, 0, 0, 1.5, 30, -20]]);
  });

  it('folds the ratio into the zoom and the pan', () => {
    const { ctx, calls } = transformRecorder();
    applyViewport(ctx, { zoom: 0.5, panOffset: { x: 10, y: 7 } }, 2);
    expect(calls).toEqual([[1, 0, 0, 1, 20, 14]]);
  });
});

describe('clearLayer', () => {
  it('resets the transform, then clears the whole canvas', () => {
    const calls: Array<[string, unknown[]]> = [];
    const ctx = {
      canvas: { width: 1625, height: 1201 },
      setTransform: (...args: unknown[]) => { calls.push(['setTransform', args]); },
      clearRect: (...args: unknown[]) => { calls.push(['clearRect', args]); },
    } as unknown as CanvasRenderingContext2D;

    clearLayer(ctx);

    expect(calls).toEqual([
      ['setTransform', [1, 0, 0, 1, 0, 0]],
      ['clearRect', [0, 0, 1625, 1201]],
    ]);
  });
});
