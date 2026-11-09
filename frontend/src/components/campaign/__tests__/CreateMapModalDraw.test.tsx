/**
 * Draw a map, in the Create Map window: a blank map of the size and colour
 * the DM chooses, which the browser makes as a picture, uploads into the
 * campaign's library tagged DRAWN_MAP_TAG, and then creates the map with.
 *
 * The map is painted at the grid size asked for, or at fewer pixels a
 * square where that would make it larger than a phone or a tablet can
 * edit, which the window says; a map too large even at the smallest grid
 * size cannot be drawn. The map's grid size is the pixels per square it is
 * painted at. The picture uploaded at first is one pixel a square of its
 * colour, which the map stretches over its grid: a picture the painted
 * size would hold that many megabytes for nothing until painted. A map
 * that the server refuses leaves no picture behind: the upload is deleted
 * again.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Asset, CampaignMap } from '@/types';
import { recordingContext, type Call } from '@/test/recordingCanvas';

const h = vi.hoisted(() => ({
  uploadAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getServerConfig: vi.fn(),
  createMap: vi.fn(),
}));

vi.mock('@/services/api', () => {
  const client = {
    getAssetUrl: (id: string) => `/api/assets/maps/${id}`,
    getAssetThumbnailUrl: (id: string) => `/api/assets/maps/${id}/thumbnail`,
    listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }),
    uploadAsset: h.uploadAsset,
    deleteAsset: h.deleteAsset,
    getServerConfig: h.getServerConfig,
  };
  return { api: client, default: client };
});
vi.mock('@/services/map.service', () => ({ default: { createMap: h.createMap } }));
vi.mock('@/utils/detectMapGrid', () => ({ detectMapGrid: vi.fn().mockResolvedValue(null) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));

import CreateMapModal from '../CreateMapModal';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';

const picture: Asset = {
  id: 'drawn-1', type: 'MAP', scope: 'CAMPAIGN', uploadedById: 'me', campaignId: 'campaign-1', filename: 'f.png',
  originalName: 'drawn-map.png', mimeType: 'image/png', fileSize: 1200, name: 'Drawn map', description: null,
  tags: [DRAWN_MAP_TAG], createdAt: '2026-11-01T00:00:00.000Z',
} as Asset;

/** What each canvas made in a test drew, by canvas. */
const canvases = new Map<HTMLCanvasElement, Call[]>();
const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
let pngMade: Blob | null;

beforeEach(() => {
  canvases.clear();
  contexts.clear();
  pngMade = new Blob(['png'], { type: 'image/png' });
  h.uploadAsset.mockReset().mockResolvedValue({ message: 'ok', asset: picture });
  h.deleteAsset.mockReset().mockResolvedValue({ message: 'deleted' });
  h.getServerConfig.mockReset().mockResolvedValue({ uploadLimits: { MAP: 50 * 1024 * 1024 } });
  h.createMap.mockReset().mockImplementation((_campaignId: string, data: Record<string, unknown>) =>
    Promise.resolve({ id: 'map-new', campaignId: 'campaign-1', tokens: [], ...data } as unknown as CampaignMap));
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement) {
      const made = recordingContext(this);
      canvases.set(this, made.calls);
      contexts.set(this, made.ctx);
      return made.ctx;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value(this: HTMLCanvasElement, done: BlobCallback) { done(pngMade); },
  });
});
afterEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value: () => null });
});

function open(onCreated = vi.fn(), onClose = vi.fn()) {
  render(<CreateMapModal isOpen campaignId="campaign-1" onClose={onClose} onCreated={onCreated} />);
  fireEvent.click(screen.getByRole('button', { name: 'Draw a map' }));
  return { onCreated, onClose };
}

const setSlider = (name: string, value: number) => {
  fireEvent.change(screen.getByRole('slider', { name }), { target: { value: String(value) } });
};
const name = (text: string) => fireEvent.change(screen.getByPlaceholderText(/Tavern Interior/), { target: { value: text } });
const create = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Map' })); });
};

describe('Draw a map', () => {
  it('starts at 70 px a square on parchment, with no picture to choose', () => {
    open();
    expect(screen.getByRole('slider', { name: 'Detail (pixels per square) slider' })).toHaveValue('70');
    expect(screen.getByRole('button', { name: 'Parchment' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('It is painted at 1,400 × 1,400 px.')).toBeInTheDocument();
    expect(screen.queryByText(/Drawn at/)).toBeNull();
  });

  it('says when it draws the picture at fewer pixels a square, so it can be edited on any device', () => {
    open();
    setSlider('Width (grid squares) slider', 100);
    setSlider('Height (grid squares) slider', 100);
    expect(screen.getByText('Drawn at 40 px a square so it can be edited on any device.')).toBeInTheDocument();
    expect(screen.getByText('It is painted at 4,000 × 4,000 px.')).toBeInTheDocument();
  });

  it('refuses a map too large to draw even at the smallest grid size', () => {
    open();
    name('Sprawl');
    setSlider('Width (grid squares) slider', 410);
    setSlider('Height (grid squares) slider', 410);
    expect(screen.getByText('A drawn map can have at most 167,772 squares, such as 409 by 409. Choose fewer squares.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Map' })).toBeDisabled();
  });

  it('makes the blank picture one pixel a square, uploads it to the campaign tagged with DRAWN_MAP_TAG, then creates the map at the pixels per square it is painted at', async () => {
    const { onCreated, onClose } = open();
    name('  The Crypt ');
    setSlider('Width (grid squares) slider', 100);
    setSlider('Height (grid squares) slider', 50);
    fireEvent.click(screen.getByRole('button', { name: 'Stone' }));
    await create();

    // One canvas a pixel a square, filled with the colour chosen, and let go of after;
    // none the painted size.
    expect([...canvases.values()].some((calls) => calls.some((c) => c.method === 'fillRect' && c.args[2] === 5700))).toBe(false);
    const drawn = [...canvases].find(([, calls]) => calls.some((c) => c.method === 'fillRect' && c.args[2] === 100));
    if (!drawn) throw new Error('no picture was drawn at 100 by 50');
    expect(drawn[1]).toContainEqual({ method: 'fillRect', args: [0, 0, 100, 50] });
    expect(contexts.get(drawn[0])?.fillStyle).toBe('#9b958a');
    expect([drawn[0].width, drawn[0].height]).toEqual([0, 0]);

    expect(h.uploadAsset).toHaveBeenCalledTimes(1);
    const form = h.uploadAsset.mock.calls[0][0] as FormData;
    // The type before the file, so a refusal can name the type's limit;
    // a neutral name, never the map's.
    expect([...form.keys()]).toEqual(['type', 'scope', 'name', 'tags', 'campaignId', 'file']);
    expect(form.get('type')).toBe('MAP');
    expect(form.get('scope')).toBe('CAMPAIGN');
    expect(form.get('campaignId')).toBe('campaign-1');
    expect(form.get('tags')).toBe(DRAWN_MAP_TAG);
    expect(form.get('name')).toBe('Drawn map');
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('drawn-map.png');
    expect((file as File).type).toBe('image/png');

    expect(h.createMap).toHaveBeenCalledWith('campaign-1', expect.objectContaining({
      name: 'The Crypt', imageUrl: 'drawn-1', width: 100, height: 50, gridSize: 57, feetPerSquare: 5, diagonalRule: 'flat', drawnBackground: '#9b958a',
    }));
    expect(h.createMap.mock.calls[0][1]).not.toHaveProperty('spiritLayerUrl');
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'map-new' }), picture);
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes the uploaded picture again when the map is refused, and says why', async () => {
    h.createMap.mockRejectedValue({ isAxiosError: true, response: { status: 400, data: { message: 'Map name is required' } } });
    const { onCreated } = open();
    name('Crypt');
    await create();
    expect(await screen.findByText('Map name is required')).toBeInTheDocument();
    expect(h.deleteAsset).toHaveBeenCalledWith('drawn-1');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('uploads nothing when the browser makes no picture', async () => {
    pngMade = null;
    const { onCreated } = open();
    name('Crypt');
    await create();
    expect(await screen.findByText("This browser could not make the map's picture. Choose fewer squares and try again.")).toBeInTheDocument();
    expect(h.uploadAsset).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('uploads nothing over the server\'s limit for a map picture, and names it', async () => {
    h.getServerConfig.mockResolvedValue({ uploadLimits: { MAP: 2 } });
    open();
    name('Crypt');
    await create();
    expect(await screen.findByText(/over this server's limit of .* for a map picture/)).toBeInTheDocument();
    expect(h.uploadAsset).not.toHaveBeenCalled();
  });

  it('keeps the picture choice as it was for an uploaded map', () => {
    render(<CreateMapModal isOpen campaignId="campaign-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Use a picture' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'Grid Size (px/square) slider' })).toHaveValue('50');
  });
});

describe('Create Map\'s buttons', () => {
  // They stood in a see-through bar inside the scrolling form, inset from its
  // sides, so on a phone the Grid Size box showed through and around them.
  it('stand under the scrolling form, in the dialog\'s own footer', () => {
    open();
    const form = screen.getByText('Map Dimensions').closest('.overflow-y-auto');
    expect(form).not.toBeNull();
    const dialog = screen.getByRole('dialog', { name: 'Create Map' });
    for (const button of ['Cancel', 'Create Map']) {
      expect(dialog).toContainElement(screen.getByRole('button', { name: button }));
      expect(form).not.toContainElement(screen.getByRole('button', { name: button }));
    }
  });
});

describe('Create Map\'s size boxes', () => {
  // Their labels were tied to nothing, so a screen reader named the boxes nothing.
  it('are named by their labels', () => {
    open();
    for (const name of ['Width (grid squares)', 'Height (grid squares)', 'Detail (pixels per square)']) {
      expect(screen.getByRole('spinbutton', { name })).toBeInTheDocument();
    }
  });

  it('come from the one field both map dialogs draw', async () => {
    const create = (await import('../CreateMapModal.tsx?raw')).default;
    const edit = (await import('../EditMapModal.tsx?raw')).default;
    for (const source of [create, edit]) {
      expect(source).toContain("import MapDimensionField from './MapDimensionField';");
      expect(source).not.toContain('function DimensionField');
    }
  });
});
