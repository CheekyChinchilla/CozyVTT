import { describe, it, expect } from 'vitest';
import { drawTextureTile, PAINT_TEXTURES, shade, textureSize } from '../paintTextures';
import { recordingContext, type Call } from '@/test/recordingCanvas';

/** A canvas whose context records every call. */
function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const canvas = document.createElement('canvas');
  const { ctx, calls } = recordingContext(canvas);
  Object.defineProperty(canvas, 'getContext', { value: () => ctx });
  return { canvas, calls };
}

describe('the textures', () => {
  it('are the eight, each named', () => {
    expect(PAINT_TEXTURES.map((t) => t.kind)).toEqual(['stone', 'bricks', 'cobbles', 'tiles', 'wood', 'grass', 'sand', 'water']);
  });

  it.each(PAINT_TEXTURES.map((t) => t.kind))('draw %s on its base colour, the same every time', (kind) => {
    const first = recordingCanvas();
    expect(drawTextureTile(kind, '#806040', 70, () => first.canvas)).toBe(first.canvas);
    expect(first.canvas.width).toBe(70);
    expect(first.calls[0]).toEqual({ method: 'fillRect', args: [0, 0, 70, 70] });
    expect(first.calls.length).toBeGreaterThan(2);
    const second = recordingCanvas();
    drawTextureTile(kind, '#806040', 70, () => second.canvas);
    expect(second.calls).toEqual(first.calls);
  });
});

describe('shade and textureSize', () => {
  it('mix a colour towards black or white', () => {
    expect(shade('#806040', -0.5)).toBe('#403020');
    expect(shade('#806040', 0.5)).toBe('#c0b0a0');
  });

  it('keep a tile between 8 and 512 pixels', () => {
    expect(textureSize(70.4)).toBe(70);
    expect(textureSize(3)).toBe(8);
    expect(textureSize(2000)).toBe(512);
  });
});
