/**
 * Paint's lines, rectangles and ellipses: a line held to 15 degree steps,
 * the box a shape paints, a shape carried to the picture's pixels, and how
 * each is drawn, outlined in the colour, filled with it, or outlined in the
 * colour and filled with the second colour.
 */

import { describe, it, expect } from 'vitest';
import { stepAngle, shapeBox, scaleShape, drawShape, type PaintShape } from '../paintShapes';
import { recordingContext } from '@/test/recordingCanvas';

const shape = (extra: Partial<PaintShape> = {}): PaintShape => ({
  kind: 'rect', from: [10, 20], to: [110, 70], width: 4, colour: '#4a3423', second: '#e8dcc4', style: 'outline', ...extra,
});

describe('a line held to 15 degree steps', () => {
  it.each([
    [[0, 0], [100, 3], [100.045, 0]],
    [[0, 0], [100, 100], [100, 100]],
    [[0, 0], [100, 30], [100.846, 27.022]],
    [[0, 0], [-100, 60], [-100.995, 58.31]],
    [[50, 50], [50, -50], [50, -50]],
  ] as const)('from %j toward %j ends at %j, as long as the line asked for', (from, to, end) => {
    const [x, y] = stepAngle(from, to);
    expect(x).toBeCloseTo(end[0], 2);
    expect(y).toBeCloseTo(end[1], 2);
  });

  it('leaves a line of no length where it is', () => {
    expect(stepAngle([5, 5], [5, 5])).toEqual([5, 5]);
  });
});

describe('the box a shape paints', () => {
  it('is its two corners, whichever way it was dragged, widened by half its outline and a pixel', () => {
    expect(shapeBox(shape())).toEqual({ x0: 7, y0: 17, x1: 113, y1: 73 });
    expect(shapeBox(shape({ from: [110, 70], to: [10, 20] }))).toEqual({ x0: 7, y0: 17, x1: 113, y1: 73 });
  });

  it('is just its corners and a pixel for a filled shape, which has no outline', () => {
    expect(shapeBox(shape({ style: 'fill' }))).toEqual({ x0: 9, y0: 19, x1: 111, y1: 71 });
  });
});

describe('a shape in the picture\'s pixels', () => {
  it('has its corners and its outline scaled', () => {
    expect(scaleShape(shape(), 2, 0.5)).toMatchObject({ from: [20, 10], to: [220, 35], width: 8 });
  });
});

describe('drawing a shape', () => {
  it('outlines a rectangle in the colour', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    drawShape(ctx, shape());
    expect(calls.map((c) => c.method)).toEqual(['save', 'beginPath', 'rect', 'stroke', 'restore']);
    expect(calls[2].args).toEqual([10, 20, 100, 50]);
    expect(ctx.strokeStyle).toBe('#4a3423');
    expect(ctx.lineWidth).toBe(4);
  });

  it('fills a rectangle with the colour', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    drawShape(ctx, shape({ style: 'fill', from: [110, 70], to: [10, 20] }));
    expect(calls.map((c) => c.method)).toEqual(['save', 'beginPath', 'rect', 'fill', 'restore']);
    expect(calls[2].args).toEqual([10, 20, 100, 50]);
    expect(ctx.fillStyle).toBe('#4a3423');
  });

  it('fills an ellipse with the second colour, then outlines it in the colour', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    const fills: string[] = [];
    const strokes: string[] = [];
    const record = new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'fill') return () => { fills.push(String(target.fillStyle)); };
        if (prop === 'stroke') return () => { strokes.push(String(target.strokeStyle)); };
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, prop, value) { return Reflect.set(target, prop, value); },
    });
    drawShape(record, shape({ kind: 'ellipse', style: 'both' }));
    expect(calls.find((c) => c.method === 'ellipse')?.args).toEqual([60, 45, 50, 25, 0, 0, Math.PI * 2]);
    expect(fills).toEqual(['#e8dcc4']);
    expect(strokes).toEqual(['#4a3423']);
  });

  it('draws a line as a stroke from end to end', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    drawShape(ctx, shape({ kind: 'line', style: 'fill' }));
    expect(calls.map((c) => c.method)).toEqual(['save', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore']);
    expect(calls[2].args).toEqual([10, 20]);
    expect(calls[3].args).toEqual([110, 70]);
  });
});

describe('polygons and curves', () => {
  const base = { width: 4, colour: '#111111', second: '#eeeeee' };

  it('draw a polygon through its corners, closed, filled with the second colour inside an outline of the colour', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    const points: Array<[number, number]> = [[10, 10], [60, 10], [35, 50]];
    drawShape(ctx, { ...base, kind: 'polygon', from: points[0], to: points[2], points, style: 'both' });
    expect(calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo').map((c) => c.args)).toEqual([[10, 10], [60, 10], [35, 50]]);
    expect(calls.map((c) => c.method)).toEqual(expect.arrayContaining(['closePath', 'fill', 'stroke']));
    expect(shapeBox({ ...base, kind: 'polygon', from: points[0], to: points[2], points, style: 'both' })).toEqual({ x0: 7, y0: 7, x1: 63, y1: 53 });
  });

  it('draw a curve from end to end, bent towards its control point, as its outline', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    const curve = { ...base, kind: 'curve' as const, from: [10, 10] as [number, number], to: [90, 10] as [number, number], control: [50, 60] as [number, number], style: 'fill' as const };
    drawShape(ctx, curve);
    expect(calls.find((c) => c.method === 'quadraticCurveTo')?.args).toEqual([50, 60, 90, 10]);
    expect(calls.some((c) => c.method === 'fill')).toBe(false);
    expect(shapeBox(curve)).toEqual({ x0: 7, y0: 7, x1: 93, y1: 63 });
    expect(scaleShape(curve, 2, 3).control).toEqual([100, 180]);
  });
});
