/**
 * Saving what is painted: the picture made as a PNG and written over the
 * map's drawn picture, the same asset under the same id, so every link to it
 * shows the new painting; the map, and every other map of the campaign using
 * that picture, then given its address with the new version, so each open
 * table loads it. Nothing is deleted. A map with no drawn picture (none, or
 * one changed elsewhere to an uploaded picture) gets a new drawn picture
 * uploaded instead, and an uploaded picture is never written over.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { savePaint, PNG_NOT_MADE, type SavePaintSteps } from '../savePaint';
import type { Asset, CampaignMap } from '@/types';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';

const png = new Blob(['png'], { type: 'image/png' });
const drawn = { id: 'drawn-picture', tags: [DRAWN_MAP_TAG] } as unknown as Asset;
const uploaded = { id: 'new-picture', tags: [DRAWN_MAP_TAG] } as unknown as Asset;
const VERSIONED = '/api/assets/maps/drawn-picture?v=1730000000000';
const mapOf = (imageUrl: string) => ({ id: 'map-a', imageUrl }) as unknown as CampaignMap;

let order: string[];
let steps: SavePaintSteps;

beforeEach(() => {
  order = [];
  steps = {
    previous: '/api/assets/maps/drawn-picture',
    makePng: vi.fn(async () => { order.push('png'); return png; }),
    previousIsDrawn: vi.fn(async () => true),
    writeOver: vi.fn(async (id: string) => { order.push(`write over ${id}`); return { asset: drawn, imageUrl: VERSIONED }; }),
    upload: vi.fn(async () => { order.push('upload'); return uploaded; }),
    pointMapAt: vi.fn(async (picture: string) => { order.push(`point ${picture}`); return mapOf(picture); }),
    sharing: [],
    pointOtherMapAt: vi.fn(async (mapId: string, address: string) => { order.push(`point ${mapId} ${address}`); }),
    remove: vi.fn(async (id: string) => { order.push(`delete ${id}`); }),
  };
});

describe('saving over a drawn picture', () => {
  it('writes the PNG over the picture under its id, then points the map at its new address; nothing is deleted', async () => {
    await expect(savePaint(steps)).resolves.toEqual({ map: mapOf(VERSIONED), asset: drawn });
    expect(order).toEqual(['png', 'write over drawn-picture', `point ${VERSIONED}`]);
    expect(steps.writeOver).toHaveBeenCalledWith('drawn-picture', png);
    expect(steps.upload).not.toHaveBeenCalled();
    expect(steps.remove).not.toHaveBeenCalled();
  });

  it('writes over a picture whose address already has a version', async () => {
    await savePaint({ ...steps, previous: '/api/assets/maps/drawn-picture?v=1' });
    expect(steps.writeOver).toHaveBeenCalledWith('drawn-picture', png);
  });

  it('points every other map using the picture at the new address too', async () => {
    await savePaint({ ...steps, sharing: ['map-b', 'map-c'] });
    expect(order).toEqual(['png', 'write over drawn-picture', `point ${VERSIONED}`, `point map-b ${VERSIONED}`, `point map-c ${VERSIONED}`]);
  });

  it('still saves when another map using the picture cannot be pointed at it, which then shows it once reloaded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    steps.pointOtherMapAt = vi.fn(async () => { throw new Error('gone'); });
    await expect(savePaint({ ...steps, sharing: ['map-b'] })).resolves.toEqual({ map: mapOf(VERSIONED), asset: drawn });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('says why when the server will not take the painting, and points no map anywhere', async () => {
    const refused = { isAxiosError: true, response: { status: 400, data: { message: 'MAP files must be smaller than 50MB' } } };
    steps.writeOver = vi.fn(async () => { throw refused; });
    await expect(savePaint({ ...steps, sharing: ['map-b'] })).rejects.toBe(refused);
    expect(steps.pointMapAt).not.toHaveBeenCalled();
    expect(steps.pointOtherMapAt).not.toHaveBeenCalled();
    expect(steps.upload).not.toHaveBeenCalled();
  });
});

describe('saving a map with no drawn picture', () => {
  it('uploads a new drawn picture for a map with none, and points the map at it', async () => {
    await expect(savePaint({ ...steps, previous: '' })).resolves.toEqual({ map: mapOf('new-picture'), asset: uploaded });
    expect(order).toEqual(['png', 'upload', 'point new-picture']);
    expect(steps.previousIsDrawn).not.toHaveBeenCalled();
    expect(steps.writeOver).not.toHaveBeenCalled();
  });

  it('never writes over a picture that was not drawn in CozyVTT, and deletes nothing', async () => {
    steps.previousIsDrawn = vi.fn(async () => false);
    await savePaint({ ...steps, sharing: ['map-b'] });
    expect(order).toEqual(['png', 'upload', 'point new-picture']);
    expect(steps.writeOver).not.toHaveBeenCalled();
    expect(steps.remove).not.toHaveBeenCalled();
  });

  it('deletes the new upload again when the map will not take it, and says why', async () => {
    const refused = { isAxiosError: true, response: { status: 403, data: { message: 'Only the DM can do that' } } };
    steps.pointMapAt = vi.fn(async () => { throw refused; });
    await expect(savePaint({ ...steps, previous: '' })).rejects.toBe(refused);
    expect(order).toEqual(['png', 'upload', 'delete new-picture']);
  });
});

describe('a browser that makes no PNG', () => {
  it('sends nothing', async () => {
    steps.makePng = vi.fn(async () => null);
    await expect(savePaint(steps)).rejects.toThrow(PNG_NOT_MADE);
    expect(steps.writeOver).not.toHaveBeenCalled();
    expect(steps.upload).not.toHaveBeenCalled();
  });
});
