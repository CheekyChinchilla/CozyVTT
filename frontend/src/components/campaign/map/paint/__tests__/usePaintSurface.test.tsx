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
import { usePaintSurface, roomWallsNotAdded, type PaintSurface } from '../usePaintSurface';
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

type Shown = { image: HTMLImageElement; url: string } | null;

function Harness({ onPaint, seen, on = map, picture = null }: { onPaint: (p: PaintSurface) => void; seen: Array<number | null>; on?: CampaignMap; picture?: Shown }) {
  const paint = usePaintSurface({
    map: on, campaignId: 'campaign-1', onSaved: () => undefined, onMapRead: () => undefined, picture,
    pictureKind: on.imageUrl ? 'drawn' : 'none', pictureFailed: false, isDM: true,
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

describe('the picture Paint opens on', () => {
  const drawn = { ...map, imageUrl: '/api/assets/maps/new' } as CampaignMap;
  const image = document.createElement('img');

  it('is only one at the map\'s own address: never the picture before it, drawn while the new one loads', () => {
    let paint: PaintSurface | null = null;
    render(<Harness onPaint={(p) => { paint = p; }} seen={[]} on={drawn} picture={{ image, url: '/api/assets/maps/old' }} />);
    let opened = true;
    act(() => { opened = paint!.open(); });
    expect(opened).toBe(false);
    expect(paint!.source).toBeNull();
    // And is not offered, where it would not open.
    expect(paint!.offered).toBe(false);
  });

  it('is held as the map\'s picture once it is the map\'s own', () => {
    let paint: PaintSurface | null = null;
    render(<Harness onPaint={(p) => { paint = p; }} seen={[]} on={drawn} picture={{ image, url: '/api/assets/maps/new' }} />);
    act(() => { paint!.open(); });
    expect(paint!.source?.width).toBe(1000);
    expect(paint!.stranded).toBe(false);
  });
});

vi.mock('@/services/map.service', () => ({ default: { updateMap: vi.fn(), getMap: vi.fn() } }));
vi.mock('@/services/api', () => ({ api: { deleteAsset: vi.fn(), getAsset: vi.fn(), getServerConfig: vi.fn(), uploadAsset: vi.fn() } }));

describe('what Save says of room walls not added', () => {
  it('names some of them by count', () => {
    expect(roomWallsNotAdded(3, 4, ['Maximum 5000 wall segments per map']))
      .toBe('The picture was saved, but 3 of the 4 walls of your rooms were not added to the map: Maximum 5000 wall segments per map. Draw them with the wall tool.');
  });

  it('names all of them in the middle of its sentence, without a capital', () => {
    expect(roomWallsNotAdded(4, 4, ['Map not found']))
      .toBe('The picture was saved, but the 4 walls of your rooms were not added to the map: Map not found. Draw them with the wall tool.');
    expect(roomWallsNotAdded(1, 1, ['']))
      .toBe('The picture was saved, but the wall of your rooms was not added to the map. Draw it with the wall tool.');
  });

  it('ends a reason that has its own full stop with one full stop', () => {
    expect(roomWallsNotAdded(2, 2, ['A wall reaches too far outside the map. Walls can extend up to 500 squares past its edges.']))
      .toBe('The picture was saved, but the 2 walls of your rooms were not added to the map: A wall reaches too far outside the map. Walls can extend up to 500 squares past its edges. Draw them with the wall tool.');
  });

  it('gives each different reason once, in the order they came', () => {
    expect(roomWallsNotAdded(4, 6, ['Map full', 'Too far out.', 'Map full', 'Too far out']))
      .toBe('The picture was saved, but 4 of the 6 walls of your rooms were not added to the map: Map full. Too far out. Draw them with the wall tool.');
  });
});
