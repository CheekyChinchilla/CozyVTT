import { describe, it, expect } from 'vitest';
import { drawStamp, PAINT_STAMPS, stampCentre } from '../paintStamps';
import { recordingContext } from '@/test/recordingCanvas';

const canvas = () => document.createElement('canvas');

describe('the stamps', () => {
  it('are the sixteen, each named', () => {
    expect(PAINT_STAMPS.map((s) => s.kind)).toEqual([
      'door', 'double-door', 'stairs', 'pillar', 'table', 'chair', 'bed', 'chest',
      'barrel', 'tree', 'bush', 'rock', 'pool', 'torch', 'trap', 'altar',
    ]);
    expect(PAINT_STAMPS.every((s) => s.label.length > 0)).toBe(true);
  });

  it.each(PAINT_STAMPS.map((s) => s.kind))('draw %s about its middle, within its square (two for a double door), in the colour and the second', (kind) => {
    const { ctx, calls } = recordingContext(canvas());
    drawStamp(ctx, { kind, cx: 125, cy: 225, size: 50, turn: 1, colour: '#111111', second: '#eeeeee' });
    expect(calls.find((c) => c.method === 'translate')?.args).toEqual([125, 225]);
    expect(calls.find((c) => c.method === 'rotate')?.args).toEqual([Math.PI / 2]);
    expect(calls.some((c) => c.method === 'stroke' || c.method === 'fill' || c.method === 'fillRect' || c.method === 'strokeRect')).toBe(true);
    // Every point drawn lies within the square, about its middle.
    const points = calls
      .filter((c) => ['moveTo', 'lineTo', 'rect', 'fillRect', 'strokeRect', 'arc', 'ellipse'].includes(c.method))
      .flatMap((c) => (c.method === 'arc' || c.method === 'ellipse' ? [c.args[0], c.args[1]] : c.args.slice(0, 2)))
      .map(Number);
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((v) => Math.abs(v) <= (kind === 'double-door' ? 50 : 25))).toBe(true);
    expect(calls[0]?.method).toBe('save');
    expect(calls[calls.length - 1]?.method).toBe('restore');
  });
});

describe('stampCentre', () => {
  it('is the middle of the square clicked, kept on the map', () => {
    expect(stampCentre('chest', 0, [130, 260], 50, 1000, 800, true)).toEqual([125, 275]);
    expect(stampCentre('tree', 0, [1010, 790], 50, 1000, 800, true)).toEqual([975, 775]);
  });

  it('puts a door on the grid line nearest the click, along the square, as a door stands in a wall', () => {
    expect(stampCentre('door', 0, [130, 260], 50, 1000, 800, true)).toEqual([125, 250]);
    expect(stampCentre('door', 2, [130, 290], 50, 1000, 800, true)).toEqual([125, 300]);
    expect(stampCentre('door', 1, [130, 260], 50, 1000, 800, true)).toEqual([150, 275]);
  });

  it('puts a double door, two squares long, on the nearest corner of the grid', () => {
    expect(stampCentre('double-door', 0, [130, 260], 50, 1000, 800, true)).toEqual([150, 250]);
    const { ctx, calls } = recordingContext(canvas());
    drawStamp(ctx, { kind: 'double-door', cx: 150, cy: 250, size: 50, turn: 0, colour: '#111111', second: '#eeeeee' });
    expect(calls.find((c) => c.method === 'rect')?.args).toEqual([-45, -5, 90, 10]);
  });

  it('is where it was clicked off the grid, kept on the map', () => {
    expect(stampCentre('door', 0, [130, 260], 50, 1000, 800, false)).toEqual([130, 260]);
    expect(stampCentre('tree', 0, [-5, 900], 50, 1000, 800, false)).toEqual([0, 800]);
  });
});
