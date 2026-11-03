import { describe, it, expect } from 'vitest';
import { drawStamp, PAINT_STAMPS, stampSquare } from '../paintStamps';
import { recordingContext } from '@/test/recordingCanvas';

const canvas = () => document.createElement('canvas');

describe('the stamps', () => {
  it('are the eight, each named', () => {
    expect(PAINT_STAMPS.map((s) => s.kind)).toEqual(['door', 'double-door', 'stairs', 'pillar', 'chest', 'table', 'tree', 'rock']);
    expect(PAINT_STAMPS.every((s) => s.label.length > 0)).toBe(true);
  });

  it.each(PAINT_STAMPS.map((s) => s.kind))('draw %s inside its square, about its middle, in the colour and the second', (kind) => {
    const { ctx, calls } = recordingContext(canvas());
    drawStamp(ctx, { kind, x: 100, y: 200, size: 50, turn: 1, colour: '#111111', second: '#eeeeee' });
    expect(calls.find((c) => c.method === 'translate')?.args).toEqual([125, 225]);
    expect(calls.find((c) => c.method === 'rotate')?.args).toEqual([Math.PI / 2]);
    expect(calls.some((c) => c.method === 'stroke' || c.method === 'fill' || c.method === 'fillRect' || c.method === 'strokeRect')).toBe(true);
    // Every point drawn lies within the square, about its middle.
    const points = calls
      .filter((c) => ['moveTo', 'lineTo', 'rect', 'fillRect', 'strokeRect', 'arc', 'ellipse'].includes(c.method))
      .flatMap((c) => (c.method === 'arc' || c.method === 'ellipse' ? [c.args[0], c.args[1]] : c.args.slice(0, 2)))
      .map(Number);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((v) => Math.abs(v) <= 25)).toBe(true);
    expect(calls[0]?.method).toBe('save');
    expect(calls[calls.length - 1]?.method).toBe('restore');
  });
});

describe('stampSquare', () => {
  it('is the square of the grid a point is in, kept on the map', () => {
    expect(stampSquare([130, 260], 50, 1000, 800)).toEqual({ x: 100, y: 250 });
    expect(stampSquare([1010, 790], 50, 1000, 800)).toEqual({ x: 950, y: 750 });
  });
});
