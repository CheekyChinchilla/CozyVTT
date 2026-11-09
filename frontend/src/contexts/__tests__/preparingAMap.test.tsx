/**
 * The DM prepares a map on their own page while the table stays where it is.
 *
 * The page shows the viewed map: the one opened to prepare while there is
 * one, otherwise the table's. The table's map still follows every move of
 * the table, for the banner and the Map Library's Active badge, and the
 * tokens on screen are always the viewed map's. Preparing is kept for the
 * tab across a reload, ends when the table comes to that map, when the map
 * goes, or when the user is no longer the DM, and asks the guards something
 * on the page registers before the map on screen changes.
 */

import { it, expect, vi, beforeEach, describe } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const getCampaign = vi.fn();
const getMap = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { getCampaign: (...a: unknown[]) => getCampaign(...a) } }));
vi.mock('@/services/api', () => ({
  default: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
  api: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
}));
const roleChanged = vi.fn();
const socketOn = vi.fn();
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(), onDmTransferred: vi.fn(),
    onMemberRoleChanged: (cb: (d: unknown) => void) => roleChanged(cb),
    on: (...a: unknown[]) => socketOn(...a), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign, preparingMapKey, TableKeptMovingError } from '../CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import type { CampaignMap, Token } from '@/types';

const MAPS = [{ id: 'village', name: 'Village' }, { id: 'crypt', name: 'Crypt' }, { id: 'tower', name: 'Tower' }];
const campaignAs = (role: string, currentMapId = 'village') => ({
  id: 'c1', name: 'Test', status: 'ACTIVE', currentMapId, maps: MAPS, memberships: [{ userId: 'me', role }],
});
const token = (id: string) => ({ id, name: id, position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }) as unknown as Token;
/** Each map as the server holds it: its tokens are named for it. */
const served = (mapId: string, extra: Partial<CampaignMap> = {}) =>
  ({ id: mapId, name: MAPS.find((m) => m.id === mapId)?.name ?? mapId, tokens: [token(`${mapId}-token`)], ...extra }) as unknown as CampaignMap;

let latest: ReturnType<typeof useCampaign> | null = null;
function Probe() {
  latest = useCampaign();
  return null;
}

const shown = () => useGameStore.getState().tokenOrder;

async function openPage(role = 'DM', currentMapId = 'village') {
  getCampaign.mockResolvedValueOnce(campaignAs(role, currentMapId));
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(latest?.currentMap?.id).toBe(currentMapId));
}

async function prepare(mapId: string) {
  let opened = false;
  await act(async () => { opened = await latest!.openToPrepare(mapId); });
  return opened;
}

beforeEach(() => {
  latest = null;
  getCampaign.mockReset();
  getMap.mockReset();
  roleChanged.mockReset();
  socketOn.mockReset();
  window.sessionStorage.clear();
  getMap.mockImplementation((_c: string, mapId: string) => Promise.resolve({ map: served(mapId), spiritVisible: false }));
});

describe('opening a map to prepare', () => {
  it('shows that map and its tokens, and leaves the table where it is', async () => {
    await openPage();
    expect(await prepare('crypt')).toBe(true);
    expect(latest!.isPreparing).toBe(true);
    expect(latest!.viewedMap?.id).toBe('crypt');
    expect(latest!.currentMap?.id).toBe('village');
    expect(latest!.campaign?.currentMapId).toBe('village');
    expect(shown()).toEqual(['crypt-token']);
    expect(window.sessionStorage.getItem(preparingMapKey('c1'))).toBe('crypt');
  });

  it('is the DM\'s alone', async () => {
    await openPage('PLAYER');
    expect(await prepare('crypt')).toBe(false);
    expect(latest!.isPreparing).toBe(false);
    expect(getMap).not.toHaveBeenCalledWith('c1', 'crypt');
  });

  it('of the table\'s own map is the table\'s map', async () => {
    await openPage();
    expect(await prepare('village')).toBe(true);
    expect(latest!.isPreparing).toBe(false);
  });
});

describe('while preparing, the table moving', () => {
  it('changes the table\'s map and leaves the map on screen and its tokens', async () => {
    await openPage();
    await prepare('crypt');
    let followed = true;
    act(() => { followed = latest!.receiveTableMap(served('village', { name: 'Village at dusk' })); });
    expect(followed).toBe(false);
    expect(latest!.currentMap?.name).toBe('Village at dusk');
    act(() => { followed = latest!.receiveTableMap(served('tower')); });
    expect(followed).toBe(false);
    expect(latest!.currentMap?.id).toBe('tower');
    expect(latest!.campaign?.currentMapId).toBe('tower');
    expect(latest!.viewedMap?.id).toBe('crypt');
    expect(shown()).toEqual(['crypt-token']);
  });

  it('to the map being prepared ends preparing, with that map\'s tokens', async () => {
    await openPage();
    await prepare('crypt');
    let followed = false;
    act(() => { followed = latest!.receiveTableMap(served('crypt', { tokens: [token('the-party')] })); });
    expect(followed).toBe(true);
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.currentMap?.id).toBe('crypt');
    expect(shown()).toEqual(['the-party']);
    expect(window.sessionStorage.getItem(preparingMapKey('c1'))).toBeNull();
  });
});

describe('Back to the table', () => {
  it('fetches the table\'s map again, since its moves were not applied meanwhile', async () => {
    await openPage();
    await prepare('crypt');
    getMap.mockImplementationOnce((_c: string, mapId: string) =>
      Promise.resolve({ map: served(mapId, { tokens: [token('moved-meanwhile')] }), spiritVisible: false }));
    let back = false;
    await act(async () => { back = await latest!.backToTable(); });
    expect(back).toBe(true);
    expect(getMap).toHaveBeenLastCalledWith('c1', 'village');
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.viewedMap?.id).toBe('village');
    expect(shown()).toEqual(['moved-meanwhile']);
  });
});

describe('a map that cannot be loaded', () => {
  it('is refused with the reason, and the page stays where it is', async () => {
    await openPage();
    getMap.mockRejectedValueOnce(new Error('Network Error'));
    let refused: unknown = null;
    await act(async () => { await latest!.openToPrepare('crypt').catch((err: unknown) => { refused = err; }); });
    expect(refused).toBeInstanceOf(Error);
    expect(latest!.isPreparing).toBe(false);
    expect(shown()).toEqual(['village-token']);

    await prepare('crypt');
    getMap.mockRejectedValueOnce(new Error('Network Error'));
    refused = null;
    await act(async () => { await latest!.backToTable().catch((err: unknown) => { refused = err; }); });
    expect(refused).toBeInstanceOf(Error);
    expect(latest!.viewedMap?.id).toBe('crypt');
  });
});

describe('preparing ends', () => {
  it('when this user is no longer the DM', async () => {
    await openPage();
    await prepare('crypt');
    const onRole = roleChanged.mock.calls[roleChanged.mock.calls.length - 1]?.[0] as (d: unknown) => void;
    await act(async () => { onRole({ campaignId: 'c1', userId: 'me', role: 'PLAYER' }); });
    await waitFor(() => expect(shown()).toEqual(['village-token']));
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.viewedMap?.id).toBe('village');
  });

  it('when the map being prepared is deleted', async () => {
    await openPage();
    await prepare('crypt');
    act(() => { latest!.removeCampaignMap('crypt'); });
    expect(latest!.isPreparing).toBe(false);
    await waitFor(() => expect(shown()).toEqual(['village-token']));
  });
});

describe('an edit of the map being prepared', () => {
  it('replaces it and leaves the table\'s map and campaign.currentMapId alone', async () => {
    await openPage();
    await prepare('crypt');
    act(() => { latest!.updateMap('crypt', (map) => ({ ...map, fogEnabled: true })); });
    expect(latest!.viewedMap).toMatchObject({ id: 'crypt', fogEnabled: true });
    expect(latest!.currentMap?.id).toBe('village');
    expect(latest!.campaign?.currentMapId).toBe('village');
  });
});

describe('a reload of the tab', () => {
  it('comes back to the map being prepared', async () => {
    window.sessionStorage.setItem(preparingMapKey('c1'), 'crypt');
    await openPage();
    await waitFor(() => expect(latest!.viewedMap?.id).toBe('crypt'));
    expect(latest!.currentMap?.id).toBe('village');
    expect(shown()).toEqual(['crypt-token']);
  });

  it.each([
    ['the table\'s map now', 'DM', 'crypt', 'crypt'],
    ['a map since deleted', 'DM', 'village', 'gone'],
    ['kept by someone no longer the DM', 'PLAYER', 'village', 'crypt'],
  ])('forgets a kept map that is %s', async (_label, role, currentMapId, kept) => {
    window.sessionStorage.setItem(preparingMapKey('c1'), kept);
    await openPage(role, currentMapId);
    await waitFor(() => expect(window.sessionStorage.getItem(preparingMapKey('c1'))).toBeNull());
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.viewedMap?.id).toBe(currentMapId);
  });
});

describe('a reconnect while preparing', () => {
  it('fetches the table\'s map and the map being prepared, with its tokens', async () => {
    await openPage();
    await prepare('crypt');
    getCampaign.mockResolvedValueOnce(campaignAs('DM'));
    getMap.mockImplementation((_c: string, mapId: string) =>
      Promise.resolve({ map: served(mapId, { tokens: [token(`${mapId}-now`)] }), spiritVisible: false }));
    await act(async () => { await latest!.catchUpAfterReconnect(); });
    expect(getMap).toHaveBeenCalledWith('c1', 'village');
    expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt');
    expect(latest!.viewedMap?.id).toBe('crypt');
    expect(shown()).toEqual(['crypt-now']);
  });

  it('ends preparing when the map was deleted meanwhile', async () => {
    await openPage();
    await prepare('crypt');
    getCampaign.mockResolvedValueOnce(campaignAs('DM'));
    getMap.mockImplementation((_c: string, mapId: string) => (mapId === 'crypt'
      ? Promise.reject({ isAxiosError: true, response: { status: 404, data: { message: 'Map not found' } } })
      : Promise.resolve({ map: served(mapId), spiritVisible: false })));
    await act(async () => { await latest!.catchUpAfterReconnect(); });
    expect(latest!.isPreparing).toBe(false);
    expect(shown()).toEqual(['village-token']);
    expect(latest!.preparingEnded).toEqual({ mapName: 'Crypt', reason: 'deleted' });
  });

  it('never puts back what an edit of the map being prepared replaced while it was read: it reads it again', async () => {
    await openPage();
    await prepare('crypt');
    getCampaign.mockResolvedValueOnce(campaignAs('DM'));
    // The map being prepared is read slowly; Paint's Save lands meanwhile.
    let release: () => void = () => undefined;
    let saved = false;
    getMap.mockImplementation((_c: string, mapId: string) => {
      if (mapId !== 'crypt') return Promise.resolve({ map: served(mapId), spiritVisible: false });
      if (saved) return Promise.resolve({ map: served('crypt', { imageUrl: '/api/assets/maps/saved' }), spiritVisible: false });
      return new Promise((resolve) => {
        release = () => resolve({ map: served('crypt', { imageUrl: '/api/assets/maps/old' }), spiritVisible: false });
      });
    });
    let catching: Promise<void> = Promise.resolve();
    act(() => { catching = latest!.catchUpAfterReconnect(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt'));
    act(() => { latest!.updateMap('crypt', (map) => ({ ...map, imageUrl: '/api/assets/maps/saved' })); });
    saved = true;
    await act(async () => { release(); await catching; });
    expect(latest!.viewedMap?.imageUrl).toBe('/api/assets/maps/saved');
    expect(shown()).toEqual(['crypt-token']);
  });

  it('keeps a map held by a guard as a prepared map when the table moved while the page was away', async () => {
    await openPage();
    act(() => { latest!.registerViewedMapGuard({ mayLeave: () => false, holds: () => true }); });
    getCampaign.mockResolvedValueOnce(campaignAs('DM', 'tower'));
    await act(async () => { await latest!.catchUpAfterReconnect(); });
    expect(latest!.isPreparing).toBe(true);
    expect(latest!.viewedMap?.id).toBe('village');
    expect(latest!.currentMap?.id).toBe('tower');
    expect(shown()).toEqual(['village-token']);
  });
});

/** A map read whose answer the test hands over when it chooses. */
function heldRead(mapId: string, tokens: Token[] = [token(`${mapId}-token`)]) {
  let release: () => void = () => undefined;
  getMap.mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve({ map: served(mapId, { tokens }), spiritVisible: false });
  }));
  return () => release();
}

describe('the tokens on screen are always the map on screen\'s', () => {
  it('a move made on a map while it loads is applied once it is in', async () => {
    await openPage();
    const release = heldRead('crypt');
    let opening: Promise<boolean> = Promise.resolve(false);
    act(() => { opening = latest!.openToPrepare('crypt'); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt'));
    const store = useGameStore.getState();
    act(() => { store.onMapTokens('crypt', () => useGameStore.getState().receiveTokenMove('crypt-token', { x: 9, y: 9 }, false)); });
    // A move on the table's map is still applied while the crypt loads.
    act(() => { store.onMapTokens('village', () => useGameStore.getState().receiveTokenMove('village-token', { x: 4, y: 4 }, false)); });
    expect(useGameStore.getState().tokens['village-token'].position).toEqual({ x: 4, y: 4 });
    await act(async () => { release(); await opening; });
    expect(useGameStore.getState().tokensMapId).toBe('crypt');
    expect(useGameStore.getState().tokens['crypt-token'].position).toEqual({ x: 9, y: 9 });
  });

  it("a placement answered for another map is not drawn", async () => {
    await openPage();
    await prepare('crypt');
    act(() => { useGameStore.getState().addToken(token('late-goblin'), 'village'); });
    expect(shown()).toEqual(['crypt-token']);
    act(() => { useGameStore.getState().addToken(token('lich'), 'crypt'); });
    expect(shown()).toEqual(['crypt-token', 'lich']);
  });
});

describe('the table moving while the page reads a map', () => {
  it('Back to the table ends on the map the table is on now', async () => {
    await openPage();
    await prepare('crypt');
    const release = heldRead('village');
    let back: Promise<boolean> = Promise.resolve(false);
    act(() => { back = latest!.backToTable(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'village'));
    // Set Active on the tower, from the DM's phone.
    let followed = true;
    act(() => { followed = latest!.receiveTableMap(served('tower')); });
    expect(followed).toBe(false);
    await act(async () => { release(); expect(await back).toBe(true); });
    expect(getMap).toHaveBeenLastCalledWith('c1', 'tower');
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.currentMap?.id).toBe('tower');
    expect(latest!.viewedMap?.id).toBe('tower');
    expect(shown()).toEqual(['tower-token']);
  });

  it('a map.changed for the table\'s own map does not cancel Open to prepare', async () => {
    await openPage();
    const release = heldRead('crypt');
    let opening: Promise<boolean> = Promise.resolve(false);
    act(() => { opening = latest!.openToPrepare('crypt'); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt'));
    act(() => { latest!.receiveTableMap(served('village', { tokens: [token('moved-by-a-player')] })); });
    await act(async () => { release(); expect(await opening).toBe(true); });
    expect(latest!.viewedMap?.id).toBe('crypt');
    expect(shown()).toEqual(['crypt-token']);
  });

  it("nor a reload's return to the map being prepared", async () => {
    window.sessionStorage.setItem(preparingMapKey('c1'), 'crypt');
    getCampaign.mockResolvedValueOnce(campaignAs('DM'));
    const releaseTable = heldRead('village');
    const releaseCrypt = heldRead('crypt');
    render(
      <MemoryRouter initialEntries={['/campaigns/c1']}>
        <Routes>
          <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(getMap).toHaveBeenCalledWith('c1', 'village'));
    await act(async () => { releaseTable(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt'));
    act(() => { latest!.receiveTableMap(served('village')); });
    await act(async () => { releaseCrypt(); });
    await waitFor(() => expect(latest!.viewedMap?.id).toBe('crypt'));
    expect(window.sessionStorage.getItem(preparingMapKey('c1'))).toBe('crypt');
  });
});

describe('preparing ending from elsewhere', () => {
  it('says the map was deleted', async () => {
    await openPage();
    await prepare('crypt');
    act(() => { latest!.removeCampaignMap('crypt'); });
    expect(latest!.preparingEnded).toEqual({ mapName: 'Crypt', reason: 'deleted' });
    act(() => { latest!.clearPreparingEnded(); });
    expect(latest!.preparingEnded).toBeNull();
  });

  it('says this user is no longer the DM', async () => {
    await openPage();
    await prepare('crypt');
    const onRole = roleChanged.mock.calls[roleChanged.mock.calls.length - 1]?.[0] as (d: unknown) => void;
    await act(async () => { onRole({ campaignId: 'c1', userId: 'me', role: 'PLAYER' }); });
    expect(latest!.preparingEnded).toEqual({ mapName: 'Crypt', reason: 'not-dm' });
  });

  it('says nothing when the DM goes back themselves', async () => {
    await openPage();
    await prepare('crypt');
    await act(async () => { await latest!.backToTable(); });
    expect(latest!.preparingEnded).toBeNull();
  });
});

describe('what a guard is told', () => {
  it('names the change and the map shown next', async () => {
    await openPage();
    const asked = vi.fn(() => true);
    act(() => { latest!.registerViewedMapGuard({ mayLeave: asked }); });
    await prepare('crypt');
    await act(async () => { await latest!.backToTable(); });
    expect(asked.mock.calls).toEqual([[{ kind: 'open-other', toMapId: 'crypt' }], [{ kind: 'back-to-table', toMapId: 'village' }]]);
  });
});

describe('a guard on the map on screen', () => {
  it('that says no stops Open to prepare and Back to the table', async () => {
    await openPage();
    let allow = false;
    const guard = { mayLeave: () => Promise.resolve(allow) };
    act(() => { latest!.registerViewedMapGuard(guard); });
    expect(await prepare('crypt')).toBe(false);
    expect(latest!.isPreparing).toBe(false);
    expect(getMap).not.toHaveBeenCalledWith('c1', 'crypt');

    allow = true;
    expect(await prepare('crypt')).toBe(true);
    allow = false;
    let back = true;
    await act(async () => { back = await latest!.backToTable(); });
    expect(back).toBe(false);
    expect(latest!.viewedMap?.id).toBe('crypt');
    expect(await latest!.mayChangeViewedMap({ kind: 'back-to-table', toMapId: 'village' })).toBe(false);
  });

  it('that fails to answer keeps the map on screen, as a no does', async () => {
    await openPage();
    act(() => { latest!.registerViewedMapGuard({ mayLeave: () => Promise.reject(new Error('broken')) }); });
    expect(await prepare('crypt')).toBe(false);
    expect(latest!.isPreparing).toBe(false);
    expect(await latest!.mayChangeViewedMap({ kind: 'set-active', toMapId: 'crypt' })).toBe(false);
  });

  it('is asked no more once it is removed', async () => {
    await openPage();
    let remove: () => void = () => undefined;
    act(() => { remove = latest!.registerViewedMapGuard({ mayLeave: () => false }); });
    remove();
    expect(await prepare('crypt')).toBe(true);
  });

  it('that holds the map keeps it on screen, as a prepared map, when the table moves on', async () => {
    await openPage();
    act(() => { latest!.registerViewedMapGuard({ mayLeave: () => false, holds: () => true }); });
    let followed = true;
    act(() => { followed = latest!.receiveTableMap(served('tower')); });
    expect(followed).toBe(false);
    expect(latest!.isPreparing).toBe(true);
    expect(latest!.viewedMap?.id).toBe('village');
    expect(latest!.currentMap?.id).toBe('tower');
    expect(shown()).toEqual(['village-token']);
  });
});

describe('a map deleted from elsewhere', () => {
  it("ends preparing when the DM's sockets are told the map being prepared went", async () => {
    await openPage();
    await prepare('crypt');
    const onDeleted = socketOn.mock.calls.filter(([event]) => event === 'map.deleted').pop()?.[1] as ((d: unknown) => void) | undefined;
    expect(onDeleted).toBeDefined();
    act(() => { onDeleted!({ mapId: 'tower' }); });
    expect(latest!.isPreparing).toBe(true);
    act(() => { onDeleted!({ mapId: 'crypt' }); });
    expect(latest!.isPreparing).toBe(false);
    expect(latest!.preparingEnded).toEqual({ mapName: 'Crypt', reason: 'deleted' });
    expect(latest!.campaign?.maps?.map((m) => m.id)).toEqual(['village']);
  });
});

describe('a read of the map on screen while the table plays on', () => {
  const moveMara = () => useGameStore.getState().onMapTokens('village', () =>
    useGameStore.getState().receiveTokenMove('village-token', { x: 7, y: 7 }, false));

  it('keeps a move made while the table\'s map is read again after preparing ends', async () => {
    await openPage();
    await prepare('crypt');
    const release = heldRead('village');
    act(() => { latest!.removeCampaignMap('crypt'); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'village'));
    act(() => { moveMara(); });
    await act(async () => { release(); });
    await waitFor(() => expect(useGameStore.getState().loadingTokensOf).toBeNull());
    expect(useGameStore.getState().tokens['village-token'].position).toEqual({ x: 7, y: 7 });
  });

  it('takes a map.changed that comes meanwhile over the moves kept and the older read', async () => {
    await openPage();
    const release = heldRead('village');
    let refreshing: Promise<void> = Promise.resolve();
    act(() => { refreshing = latest!.refreshCurrentMap(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'village'));
    act(() => { moveMara(); });
    // Edit Token from another tab: the token is put somewhere else, and the
    // table is sent the map again.
    act(() => { latest!.receiveTableMap(served('village', { tokens: [token('village-token')].map((t) => ({ ...t, position: { x: 2, y: 2 } })) })); });
    await act(async () => { release(); await refreshing; });
    expect(useGameStore.getState().tokens['village-token'].position).toEqual({ x: 2, y: 2 });
  });

  it('never puts back what an edit of the map being prepared replaced while it was read: it reads it again', async () => {
    await openPage();
    await prepare('crypt');
    // A character's token picture changed: the map is read again, slowly.
    const release = heldRead('crypt');
    let refreshing: Promise<void> = Promise.resolve();
    act(() => { refreshing = latest!.refreshCurrentMap(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'crypt'));
    // Paint's Save lands meanwhile: the map points at its new picture, and the old one is deleted.
    act(() => { latest!.updateMap('crypt', (map) => ({ ...map, imageUrl: '/api/assets/maps/saved' })); });
    getMap.mockImplementation((_c: string, mapId: string) => Promise.resolve({ map: served(mapId, { imageUrl: '/api/assets/maps/saved' }), spiritVisible: false }));
    await act(async () => { release(); await refreshing; });
    expect(latest!.viewedMap?.imageUrl).toBe('/api/assets/maps/saved');
    // Read again, so what the read was for is still caught up.
    expect(getMap.mock.calls.filter(([, mapId]) => mapId === 'crypt')).toHaveLength(3);
  });

  it('counts an edit of the table\'s map as no move of the table', async () => {
    await openPage();
    await prepare('crypt');
    const release = heldRead('village');
    let back: Promise<boolean> = Promise.resolve(false);
    act(() => { back = latest!.backToTable(); });
    await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'village'));
    act(() => { latest!.updateMap('village', (map) => ({ ...map, fogEnabled: true })); });
    await act(async () => { release(); expect(await back).toBe(true); });
    expect(getMap.mock.calls.filter(([, mapId]) => mapId === 'village')).toHaveLength(2);
  });

  it('says so when the table keeps moving while Back to the table reads it', async () => {
    await openPage();
    await prepare('crypt');
    const others = ['tower', 'village', 'tower'];
    getMap.mockImplementation((_c: string, mapId: string) => {
      // Each read is answered after the table has moved again.
      const next = others.shift();
      if (next) act(() => { latest!.receiveTableMap(served(next)); });
      return Promise.resolve({ map: served(mapId), spiritVisible: false });
    });
    let failure: unknown = null;
    await act(async () => { await latest!.backToTable().catch((err: unknown) => { failure = err; }); });
    expect(failure).toBeInstanceOf(TableKeptMovingError);
    expect(latest!.viewedMap?.id).toBe('crypt');
  });
});
