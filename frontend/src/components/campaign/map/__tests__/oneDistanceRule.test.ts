/**
 * The ruler and a carried token's readout measure by one function,
 * gridMeasure in utils/geometry.ts, so the two never disagree about a
 * distance: the same squares, on the same map, come to the same words.
 */

import { it, expect, vi } from 'vitest';
import type { Viewport } from '../layers/types';

vi.mock('@/utils/geometry', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/utils/geometry')>();
  return { ...real, gridMeasure: vi.fn(real.gridMeasure) };
});

import { gridDistanceLabel, gridMeasure } from '@/utils/geometry';
import { drawRuler } from '../layers/drawOverlays';
import { carriedDistance } from '../tokenHold';
import { recordingContext } from '@/test/recordingCanvas';

const viewport: Viewport = { zoom: 1, panOffset: { x: 0, y: 0 }, gridSize: 50, mapWidth: 10, mapHeight: 8 };

it.each(['flat', 'alternating'] as const)('measures the ruler and a carried token by the same function, with %s diagonals', (diagonalRule) => {
  const from = { x: 3, y: 4 };
  const to = { x: 6, y: 1 };
  const { ctx, calls } = recordingContext(document.createElement('canvas'));
  vi.mocked(gridMeasure).mockClear();

  drawRuler(ctx, { origin: from, target: to, color: 'amber', feetPerSquare: 10, diagonalRule }, viewport);
  expect(gridMeasure).toHaveBeenCalledExactlyOnceWith(from, to, 10, diagonalRule);
  const rulerSays = calls.find((c) => c.method === 'fillText')?.args[0];

  vi.mocked(gridMeasure).mockClear();
  const carried = carriedDistance(
    { position: from, size: { width: 1, height: 1 } },
    { square: to, offset: { x: 0, y: 0 } },
    { width: 10, height: 8, feetPerSquare: 10, diagonalRule },
  );
  expect(gridMeasure).toHaveBeenCalledExactlyOnceWith(from, to, 10, diagonalRule);
  expect(gridDistanceLabel(carried)).toBe(rulerSays);
});
