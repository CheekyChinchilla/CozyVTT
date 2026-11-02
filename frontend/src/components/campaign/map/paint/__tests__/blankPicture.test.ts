/**
 * The blank picture a drawn map starts from: a canvas of its size, filled
 * with its colour, and the PNG made of it. A browser that cannot hold a
 * canvas that large, or make a PNG of it, answers nothing, which is said.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { blankPicture, pictureToPng, releaseCanvas } from '../blankPicture';
import { recordingContext, type Call } from '@/test/recordingCanvas';

afterEach(() => {
  vi.restoreAllMocks();
});

/** A canvas whose context records what is drawn on it. */
function recordedCanvas(): { canvas: HTMLCanvasElement; calls: Call[]; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  const { ctx, calls } = recordingContext(canvas);
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx as never);
  return { canvas, calls, ctx };
}

describe('the blank picture', () => {
  it('is a canvas of the size asked for, filled with the colour', () => {
    const { canvas, calls, ctx } = recordedCanvas();
    const made = blankPicture(1400, 980, '#e8dcc4', () => canvas);
    expect(made).toBe(canvas);
    expect(canvas.width).toBe(1400);
    expect(canvas.height).toBe(980);
    expect(ctx.fillStyle).toBe('#e8dcc4');
    expect(calls).toEqual([{ method: 'fillRect', args: [0, 0, 1400, 980] }]);
  });

  it('is nothing where the browser gives no context for a canvas that size', () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(blankPicture(4096, 4096, '#e8dcc4', () => canvas)).toBeNull();
    // Its pixels are let go of at once.
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

describe('the PNG of a picture', () => {
  it('is what the browser makes of the canvas, as a PNG', async () => {
    const canvas = document.createElement('canvas');
    const png = new Blob(['png'], { type: 'image/png' });
    const toBlob = vi.fn((done: BlobCallback, type?: string) => { expect(type).toBe('image/png'); done(png); });
    Object.defineProperty(canvas, 'toBlob', { value: toBlob });
    await expect(pictureToPng(canvas)).resolves.toBe(png);
  });

  it('is nothing when the browser makes none, or refuses to', async () => {
    const none = document.createElement('canvas');
    Object.defineProperty(none, 'toBlob', { value: (done: BlobCallback) => done(null) });
    await expect(pictureToPng(none)).resolves.toBeNull();

    const refused = document.createElement('canvas');
    Object.defineProperty(refused, 'toBlob', { value: () => { throw new DOMException('too large', 'EncodingError'); } });
    await expect(pictureToPng(refused)).resolves.toBeNull();
  });
});

describe('letting go of a canvas', () => {
  it('leaves it no pixels', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    releaseCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
