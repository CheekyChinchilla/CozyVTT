/**
 * A map made with Draw a map opens on the DM's screen at once, as Open to
 * prepare opens one, with Paint on, and the Map Library gets out of its
 * way: the players stay where they are. Its picture is known to be drawn
 * without asking. A map made from a picture stays in the library, as
 * before.
 */

import { it, expect, vi, beforeEach, describe } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Asset, CampaignMap } from '@/types';
import { usePaintStore } from '@/stores/paintStore';

const h = vi.hoisted(() => ({
  openToPrepare: vi.fn(),
  upsertCampaignMap: vi.fn(),
  created: null as null | { map: unknown; picture?: unknown },
}));

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', name: 'Lost Mine', currentMapId: 'village' },
    currentMap: { id: 'village', name: 'Village', tokens: [] },
    viewedMap: { id: 'village', name: 'Village', tokens: [] },
    isPreparing: false,
    setCurrentMap: () => {},
    updateMap: () => {},
    showTableMap: () => {},
    openToPrepare: h.openToPrepare,
    mayChangeViewedMap: () => Promise.resolve(true),
    upsertCampaignMap: h.upsertCampaignMap,
    removeCampaignMap: () => {},
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/services/map.service', () => ({ default: { getMaps: vi.fn().mockResolvedValue([]) } }));
// The window itself is CreateMapModalDraw.test.tsx's: here it answers at once.
vi.mock('../CreateMapModal', () => ({
  default: ({ isOpen, onCreated }: { isOpen: boolean; onCreated: (map: CampaignMap, picture?: Asset) => void }) => (isOpen
    ? <button type="button" onClick={() => onCreated(h.created!.map as CampaignMap, h.created!.picture as Asset | undefined)}>Made</button>
    : null),
}));

import MapManager from '../MapManager';
import { DRAWN_MAP_TAG } from '@/constants/assetLimits';

const crypt = { id: 'crypt', campaignId: 'campaign-1', name: 'Crypt', imageUrl: '/api/assets/maps/drawn-1', width: 20, height: 20, gridSize: 70, tokens: [] };
const drawnPicture = { id: 'drawn-1', type: 'MAP', scope: 'CAMPAIGN', campaignId: 'campaign-1', tags: [DRAWN_MAP_TAG] };

beforeEach(() => {
  h.openToPrepare.mockReset().mockResolvedValue(true);
  h.upsertCampaignMap.mockReset();
  usePaintStore.setState({ openOnMapId: null });
});

async function make(onClose = vi.fn()) {
  render(<MapManager isOpen onClose={onClose} />);
  fireEvent.click((await screen.findAllByRole('button', { name: /Create Map/ }))[0]);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Made' })); });
  return onClose;
}

describe('a map just made', () => {
  it('opens on this screen to prepare when it was drawn, and the library closes', async () => {
    h.created = { map: crypt, picture: drawnPicture };
    const onClose = await make();
    expect(h.upsertCampaignMap).toHaveBeenCalledWith(crypt);
    expect(h.openToPrepare).toHaveBeenCalledWith('crypt');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePaintStore.getState().openOnMapId).toBe('crypt');
  });

  it('does not open with Paint on later when it is not opened now: Not now kept the map on screen', async () => {
    h.created = { map: crypt, picture: drawnPicture };
    h.openToPrepare.mockResolvedValue(false);
    const onClose = await make();
    expect(h.openToPrepare).toHaveBeenCalledWith('crypt');
    expect(onClose).not.toHaveBeenCalled();
    expect(usePaintStore.getState().openOnMapId).toBeNull();
  });

  it('stays in the library when it was made from a picture', async () => {
    h.created = { map: { ...crypt, imageUrl: '/api/assets/maps/upload-1' } };
    const onClose = await make();
    expect(h.upsertCampaignMap).toHaveBeenCalled();
    expect(h.openToPrepare).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(usePaintStore.getState().openOnMapId).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Crypt' })).toBeInTheDocument();
  });
});
