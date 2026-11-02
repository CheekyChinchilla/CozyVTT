/**
 * A brush stroke: its points carried from map pixels to the picture's,
 * the box it paints (what undo keeps), how it is drawn (a round line, or a
 * dot for a tap), and the widths [ and ] step through. Also which pictures
 * Paint may change: a map picture of this campaign tagged drawn-map, the
 * tag matched exactly.
 */

import { describe, it, expect } from 'vitest';
import { strokeBox, toPicture, strokePaint, nextWidth, PAINT_WIDTHS } from '../paintStroke';
import { isDrawnPicture } from '../mapPicture';
import { recordingContext } from '@/test/recordingCanvas';

describe('a stroke\'s points', () => {
  it('go from map pixels to picture pixels by the picture\'s scale across and down', () => {
    expect(toPicture([[10, 20], [100.5, 40]], 1, 1)).toEqual([[10, 20], [100.5, 40]]);
    expect(toPicture([[10, 20], [100, 40]], 0.5, 2)).toEqual([[5, 40], [50, 80]]);
  });
});

describe('the box a stroke paints', () => {
  it('is its points widened by half its width, and a pixel for the soft edge', () => {
    expect(strokeBox([[100, 100], [200, 150]], 10)).toEqual({ x0: 94, y0: 94, x1: 206, y1: 156 });
    expect(strokeBox([[50, 60]], 1)).toEqual({ x0: 48.5, y0: 58.5, x1: 51.5, y1: 61.5 });
  });
});

describe('drawing a stroke', () => {
  it('draws a round-ended line through its points, in its colour and width', () => {
    const { ctx, calls } = recordingContext(document.createElement('canvas'));
    strokePaint(ctx, [[1, 2], [30, 40], [50, 45]], 8, '#4a3423');
    expect(calls.map((c) => c.method)).toEqual(['save', 'beginPath', 'moveTo', 'lineTo', 'lineTo', 'stroke', 'restore']);
    expect(calls[2].args).toEqual([1, 2]);
    expect(ctx.lineWidth).toBe(8);
    expect(ctx.lineCap).toBe('round');
    expect(ctx.lineJoin).toBe('round');
    expect(ctx.strokeStyle).toBe('#4a3423');
    expect(ctx.globalCompositeOperation).toBe('source-over');
  });

  it('draws a dot its width across for a tap, or a stroke that never moved', () => {
    for (const points of [[[20, 30]], [[20, 30], [20, 30]]] as Array<Array<[number, number]>>) {
      const { ctx, calls } = recordingContext(document.createElement('canvas'));
      strokePaint(ctx, points, 12, '#79a050');
      expect(calls.map((c) => c.method)).toEqual(['save', 'beginPath', 'arc', 'fill', 'restore']);
      expect(calls[2].args).toEqual([20, 30, 6, 0, Math.PI * 2]);
      expect(ctx.fillStyle).toBe('#79a050');
    }
  });
});

describe('the brush widths', () => {
  it('run from 1 to 64', () => {
    expect(PAINT_WIDTHS[0]).toBe(1);
    expect(PAINT_WIDTHS[PAINT_WIDTHS.length - 1]).toBe(64);
  });

  it('step to the next width up or down, and stop at the ends', () => {
    expect(nextWidth(6, 1)).toBe(8);
    expect(nextWidth(6, -1)).toBe(4);
    expect(nextWidth(7, 1)).toBe(8);
    expect(nextWidth(7, -1)).toBe(6);
    expect(nextWidth(64, 1)).toBe(64);
    expect(nextWidth(1, -1)).toBe(1);
  });
});

describe('a picture Paint may change', () => {
  const asset = { type: 'MAP', campaignId: 'campaign-1', tags: ['dungeon', 'drawn-map'] };

  it('is a map picture of this campaign tagged drawn-map', () => {
    expect(isDrawnPicture(asset, 'campaign-1')).toBe(true);
  });

  it.each([
    ['without the tag', { ...asset, tags: ['dungeon'] }, 'campaign-1'],
    ['tagged in another case', { ...asset, tags: ['Drawn-Map'] }, 'campaign-1'],
    ['of another campaign', asset, 'campaign-2'],
    ['personal', { ...asset, campaignId: null }, 'campaign-1'],
    ['a token picture', { ...asset, type: 'TOKEN' }, 'campaign-1'],
  ])('is never one %s', (_what, picture, campaignId) => {
    expect(isDrawnPicture(picture, campaignId)).toBe(false);
  });

  it('is never one not known', () => {
    expect(isDrawnPicture(null, 'campaign-1')).toBe(false);
    expect(isDrawnPicture(asset, undefined)).toBe(false);
  });
});
