/**
 * Saving what is painted: the picture made as a PNG, uploaded as a new
 * DRAWN_MAP_TAG picture, the map pointed at it, and then the picture it had
 * before deleted, without force, so one something else uses stays. Only a
 * picture Paint made (tagged DRAWN_MAP_TAG) is ever deleted this way; an
 * uploaded one never is. A map the server will not point at the new
 * picture leaves no picture behind.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { savePaint, PNG_NOT_MADE, type SavePaintSteps } from '../savePaint';
import type { Asset, CampaignMap } from '@/types';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';

const png = new Blob(['png'], { type: 'image/png' });
const asset = { id: 'new-picture', tags: [DRAWN_MAP_TAG] } as unknown as Asset;
const map = { id: 'map-a', imageUrl: '/api/assets/maps/new-picture' } as unknown as CampaignMap;

let order: string[];
let steps: SavePaintSteps;

beforeEach(() => {
  order = [];
  steps = {
    previous: '/api/assets/maps/old-picture',
    makePng: vi.fn(async () => { order.push('png'); return png; }),
    upload: vi.fn(async () => { order.push('upload'); return asset; }),
    pointMapAt: vi.fn(async (id: string) => { order.push(`point ${id}`); return map; }),
    previousIsDrawn: vi.fn(async () => true),
    remove: vi.fn(async (id: string) => { order.push(`delete ${id}`); }),
  };
});

describe('saving', () => {
  it('makes the PNG, uploads it, points the map at it, then deletes the picture it had', async () => {
    await expect(savePaint(steps)).resolves.toEqual({ map, asset });
    expect(order).toEqual(['png', 'upload', 'point new-picture', 'delete old-picture']);
    expect(steps.upload).toHaveBeenCalledWith(png);
  });

  it('never deletes a picture that was not drawn in CozyVTT', async () => {
    steps.previousIsDrawn = vi.fn(async () => false);
    await savePaint(steps);
    expect(steps.remove).not.toHaveBeenCalled();
  });

  it('deletes nothing for a map that had no picture, or whose picture is the one just saved', async () => {
    await savePaint({ ...steps, previous: '' });
    await savePaint({ ...steps, previous: '/api/assets/maps/new-picture' });
    expect(steps.remove).not.toHaveBeenCalled();
    expect(steps.previousIsDrawn).not.toHaveBeenCalled();
  });

  it('keeps the old picture, and still saves, when it is in use elsewhere or cannot be deleted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    steps.remove = vi.fn(async () => { throw { isAxiosError: true, response: { status: 409, data: { code: 'ASSET_IN_USE' } } }; });
    await expect(savePaint(steps)).resolves.toEqual({ map, asset });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('deletes the new upload again when the map will not take it, and says why', async () => {
    const refused = { isAxiosError: true, response: { status: 403, data: { message: 'Only the DM can do that' } } };
    steps.pointMapAt = vi.fn(async () => { throw refused; });
    await expect(savePaint(steps)).rejects.toBe(refused);
    expect(order).toEqual(['png', 'upload', 'delete new-picture']);
  });

  it('uploads nothing when the browser makes no PNG', async () => {
    steps.makePng = vi.fn(async () => null);
    await expect(savePaint(steps)).rejects.toThrow(PNG_NOT_MADE);
    expect(steps.upload).not.toHaveBeenCalled();
  });

  it('points nothing at a picture the upload refused', async () => {
    steps.upload = vi.fn(async () => { throw new Error('too large'); });
    await expect(savePaint(steps)).rejects.toThrow('too large');
    expect(steps.pointMapAt).not.toHaveBeenCalled();
    expect(steps.remove).not.toHaveBeenCalled();
  });
});
