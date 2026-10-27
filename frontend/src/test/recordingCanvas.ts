/**
 * The map's layers drawn into recording contexts, for the tests that look at
 * what a layer draws through MapCanvas. jsdom has no canvas and loads no
 * picture: every canvas gets a context that records its calls, and every
 * picture the map asks for waits in `pictures` to be loaded by hand.
 */

import { act } from '@testing-library/react';
import { vi, beforeEach, afterEach } from 'vitest';

export interface Call { method: string; args: unknown[] }

/**
 * A 2D context that records every method called on it and keeps whatever is
 * assigned to it. A method's answer is a gradient-like object, or empty pixels
 * for the two that hand pixels back, enough for the layers' draws to run.
 */
export function recordingContext(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const answer = { addColorStop: () => undefined, width: 0 };
  const pixels = (w: unknown, h: unknown) => {
    const width = Number(w) || 0;
    const height = Number(h) || 0;
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  };
  const props: Record<string, unknown> = { canvas };
  const ctx = new Proxy(props, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        if (prop === 'createImageData') return pixels(args[0], args[1]);
        if (prop === 'getImageData') return pixels(args[2], args[3]);
        return answer;
      };
    },
    set(target, prop, value) {
      if (typeof prop === 'string') target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** Every picture the map asked for, to load by hand: jsdom loads none. */
export const pictures: FakeImage[] = [];
export class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  crossOrigin = '';
  width = 1000;
  height = 1000;
  private source = '';
  set src(value: string) { this.source = value; pictures.push(this); }
  get src() { return this.source; }
  load() { act(() => { this.onload?.(); }); }
}

/** Lets the map's render loop draw its next frame. */
export async function nextFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Gives every canvas in the tests of the calling group a recording context,
 * and stands in for the browser's pictures.
 */
export function recordDrawing() {
  const recorded = new Map<HTMLCanvasElement, Call[]>();

  beforeEach(() => {
    recorded.clear();
    pictures.length = 0;
    vi.stubGlobal('Image', FakeImage);
    const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value(this: HTMLCanvasElement) {
        let ctx = contexts.get(this);
        if (!ctx) {
          const made = recordingContext(this);
          ctx = made.ctx;
          contexts.set(this, ctx);
          recorded.set(this, made.calls);
        }
        return ctx;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true, writable: true });
  });

  return {
    recorded,
    /** The calls the canvas has had since the last look. */
    take(canvas: HTMLCanvasElement): Call[] {
      const calls = recorded.get(canvas) ?? [];
      const taken = calls.slice();
      calls.length = 0;
      return taken;
    },
  };
}
