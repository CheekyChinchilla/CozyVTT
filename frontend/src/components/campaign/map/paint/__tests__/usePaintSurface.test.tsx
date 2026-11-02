/**
 * Paint's surface on its own: what it hands the page to draw the map with.
 *
 * The page draws the map from `source` until a render without it, so a
 * canvas is never handed over, or left handed over, with its pixels let go
 * of: drawImage of a canvas 0 pixels wide throws, and the map shows nothing
 * for that frame. Each check runs in an effect after the hook's own, in
 * the same commit, which sees what the page last drew with.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { usePaintSurface, type PaintSurface } from '../usePaintSurface';
import { recordingContext } from '@/test/recordingCanvas';
import type { MapControls } from '../../tools/types';
import type { CampaignMap } from '@/types';

const makeCanvas = () => {
  const c = document.createElement('canvas');
  const { ctx } = recordingContext(c);
  Object.defineProperty(c, 'getContext', { value: () => ctx });
  Object.defineProperty(c, 'toBlob', { value: (done: BlobCallback) => done(new Blob(['png'], { type: 'image/png' })) });
  return c;
};

const controls = { handleDrag: () => undefined, startDrag: () => undefined, isDragging: false } as unknown as MapControls;
const map = { id: 'map-a', width: 20, height: 20, gridSize: 50, imageUrl: '' } as unknown as CampaignMap;

function Harness({ onPaint, seen }: { onPaint: (p: PaintSurface) => void; seen: Array<number | null> }) {
  const paint = usePaintSurface({
    map, campaignId: 'campaign-1', onSaved: () => undefined, onMapRead: () => undefined, picture: null, pictureSettled: true, isDM: true,
    mapControls: controls, markDirty: () => undefined, refuse: () => undefined, make: makeCanvas,
  });
  onPaint(paint);
  // After the hook's own effects, in the same commit: the canvas the page draws with now.
  const source = paint.source;
  useEffect(() => {
    seen.push(source ? source.width : null);
  });
  return null;
}

describe('the canvas Paint hands the page', () => {
  it('is never one whose pixels have been let go of', () => {
    const seen: Array<number | null> = [];
    let paint: PaintSurface | null = null;
    render(<Harness onPaint={(p) => { paint = p; }} seen={seen} />);
    act(() => { paint!.open(); });
    expect(paint!.source?.width).toBe(1000);
    // Nothing painted on a map with no picture: Done lets the canvas go.
    act(() => { paint!.close(); });
    expect(paint!.source).toBeNull();
    expect(seen.filter((w) => w === 0)).toEqual([]);
  });

  it('lets the canvas\'s pixels go once the page no longer draws with it', () => {
    const seen: Array<number | null> = [];
    let paint: PaintSurface | null = null;
    render(<Harness onPaint={(p) => { paint = p; }} seen={seen} />);
    act(() => { paint!.open(); });
    const canvas = paint!.source!;
    act(() => { paint!.close(); });
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});

vi.mock('@/services/map.service', () => ({ default: { updateMap: vi.fn(), getMap: vi.fn() } }));
vi.mock('@/services/api', () => ({ api: { deleteAsset: vi.fn(), getAsset: vi.fn(), getServerConfig: vi.fn(), uploadAsset: vi.fn() } }));
