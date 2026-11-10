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
import { drawPaintPreview } from '../paintShapes';
import { recordingContext, recordPaint } from '@/test/recordingCanvas';
import type { MapControls, PointerAt } from '../../tools/types';
import type { MapPointer } from '../../mapPointer';
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

function Harness({ onPaint, seen, on = map, picture = null, make = makeCanvas }: { onPaint: (p: PaintSurface) => void; seen: Array<number | null>; on?: CampaignMap; picture?: Shown; make?: () => HTMLCanvasElement }) {
  const paint = usePaintSurface({
    map: on, campaignId: 'campaign-1', onSaved: () => undefined, onMapRead: () => undefined, picture,
    pictureKind: on.imageUrl ? 'drawn' : 'none', pictureFailed: false, isDM: true,
    mapControls: controls, markDirty: () => undefined, refuse: () => undefined, make,
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

describe('a stroke, a shape or a room while it is dragged', () => {
  const pointer: MapPointer = {
    pointerId: 1, kind: 'mouse', isPrimary: true, button: 0, buttons: 1, detail: 1, clientX: 0, clientY: 0,
    shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, preventDefault: () => undefined,
  };
  const at = (x: number, y: number): PointerAt => ({
    e: pointer, via: 'mouse', screenX: x, screenY: y, mapPx: { x, y }, gridCoords: { x: Math.floor(x / 50), y: 19 - Math.floor(y / 50) },
  });

  /** Drag `tool` across the map in `texture`, and draw what is under way as the overlay does. */
  async function drag(tool: 'brush' | 'rect' | 'room', texture: 'stone' | null) {
    const painted = new Map<HTMLCanvasElement, ReturnType<typeof recordPaint>>();
    const make = () => {
      const canvas = makeCanvas();
      const ctx = canvas.getContext('2d');
      if (ctx) painted.set(canvas, recordPaint(ctx));
      return canvas;
    };
    let paint: PaintSurface | null = null;
    render(<Harness onPaint={(p) => { paint = p; }} seen={[]} make={make} />);
    act(() => { paint!.open(); });
    act(() => { paint!.setSettings((prev) => ({ ...prev, tool, texture, colour: '#777777', second: '#c0a080', style: 'both' })); });
    act(() => {
      paint!.tool.down?.(at(110, 120));
      paint!.tool.move?.(at(260, 230));
    });
    const { ctx } = recordingContext(document.createElement('canvas'));
    const shown = recordPaint(ctx);
    for (const preview of paint!.inProgress()) {
      if (preview.kind === 'stroke' || preview.kind === 'shape') drawPaintPreview(ctx, preview);
    }
    // A stroke lands at once with no undo under way, and says so after.
    await act(async () => { paint!.tool.up?.(); });
    const landed = painted.get(paint!.source!);
    if (!landed) throw new Error('The picture was not made by the test\'s canvases');
    return { shown, landed, style: (drawn: ReturnType<typeof recordPaint>) => (tool === 'brush' ? drawn.strokes[0] : drawn.fills[0]) };
  }

  it.each([['a brush stroke', 'brush'], ['a filled rectangle', 'rect'], ['a room\'s floor', 'room']] as const)(
    'shows %s in its texture, in the pattern of the tile it lands in',
    async (_name, tool) => {
      const { shown, landed, style } = await drag(tool, 'stone');
      expect(shown.patterns).toContain(style(shown));
      expect(shown.patterns).toHaveLength(1);
      // What lands is painted from the same tile.
      expect(landed.patterns).toHaveLength(1);
      expect(landed.patterns[0].image).toBe(shown.patterns[0].image);
      expect(style(landed)).toBe(landed.patterns[0]);
    },
  );

  it.each([['a brush stroke', 'brush', '#777777'], ['a filled rectangle', 'rect', '#c0a080'], ['a room\'s floor', 'room', '#c0a080']] as const)(
    'shows %s with no texture in its plain colour, as it lands',
    async (_name, tool, colour) => {
      const { shown, landed, style } = await drag(tool, null);
      expect(shown.patterns).toEqual([]);
      expect(style(shown)).toBe(colour);
      expect(style(landed)).toBe(colour);
    },
  );
});
