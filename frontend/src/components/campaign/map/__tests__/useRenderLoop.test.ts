/**
 * One layer of the map failing to draw leaves the others drawn.
 *
 * The loop drew terrain, tokens and overlay in turn, so an error in one
 * stopped the frame there: a token the token layer could not draw took the
 * overlay with it (a player's fog, walls, pings and ruler). Each layer now
 * fails alone, and its error is logged once, not on every frame it repeats.
 */
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRenderLoop, type MapLayer } from '../useRenderLoop';

let drawn: MapLayer[] = [];
let failing: MapLayer | null = null;
const drawLayerRef = {
  current: (layer: MapLayer) => {
    drawn.push(layer);
    if (layer === failing) throw new TypeError('label.startsWith is not a function');
  },
};

async function frame(markAll: () => void) {
  await act(async () => {
    markAll();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  drawn = [];
  failing = null;
  logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  logged.mockRestore();
});

it('draws the layers above and below one that throws', async () => {
  const { result } = renderHook(() => useRenderLoop(drawLayerRef));
  await frame(result.current.markAll);
  drawn = [];

  failing = 'tokens';
  await frame(result.current.markAll);
  expect(drawn).toEqual(['terrain', 'tokens', 'overlay']);
});

it('logs a layer\'s error once while it repeats, and again once the layer has drawn in between', async () => {
  const { result } = renderHook(() => useRenderLoop(drawLayerRef));
  failing = 'tokens';
  await frame(result.current.markAll);
  await frame(result.current.markAll);
  expect(logged).toHaveBeenCalledTimes(1);
  expect(String(logged.mock.calls[0][0])).toContain('tokens');
  expect(String(logged.mock.calls[0][1])).toContain('label.startsWith is not a function');

  failing = null;
  await frame(result.current.markAll);
  failing = 'tokens';
  await frame(result.current.markAll);
  expect(logged).toHaveBeenCalledTimes(2);
});
