/**
 * Refreshing the campaign leaves the table standing.
 *
 * Saving Campaign Settings, removing a member and handing over the DM seat
 * re-read the campaign through the first load, which shows the page's
 * loading screen: the whole table was taken down and built again, every
 * token picture fetched once more, the chat draft lost and the settings
 * reopened on their first tab. A refresh now replaces the campaign in
 * place, and leaves the map, which arrives over the socket, alone.
 *
 * Also here: a load or a member refresh that answers late cannot write over
 * a newer one, the redirect after a refused load is cancelled when the page
 * moves on, and a hit point change reaches the store without re-rendering
 * everything that reads the campaign.
 */

import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { useEffect } from 'react';

const getCampaign = vi.fn();
const getMap = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { getCampaign: (...a: unknown[]) => getCampaign(...a) } }));
vi.mock('@/services/api', () => ({
  default: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
  api: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
}));
const socketOn = vi.fn();
const onCharacterHpUpdated = vi.fn();
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: (...a: unknown[]) => onCharacterHpUpdated(...a), onDmTransferred: vi.fn(), onMemberRoleChanged: vi.fn(),
    on: (...a: unknown[]) => socketOn(...a), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null), startHeartbeat: vi.fn(),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign } from '../CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';

const campaign = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, status: 'ACTIVE', currentMapId: 'm1', maps: [], memberships: [{ userId: 'me', role: 'DM' }], ...extra,
});

/** A promise and the means to settle it, for answers that arrive out of order. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let latest: ReturnType<typeof useCampaign> | null = null;
let mounts = 0;
let renders = 0;
let goTo: ((path: string) => void) | null = null;

/** Stands in for the table: counts how often it is built, and each render. */
function Table() {
  latest = useCampaign();
  renders += 1;
  useEffect(() => { mounts += 1; }, []);
  return null;
}

/** What the campaign page does: the table only once the campaign has loaded. */
function Page() {
  const { loading } = useCampaign();
  goTo = useNavigate();
  return loading ? <p>Loading campaign...</p> : <Table />;
}

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/campaigns/:id" element={<CampaignProvider><Page /></CampaignProvider>} />
      <Route path="/dashboard" element={<p>Dashboard</p>} />
    </Routes>
  </MemoryRouter>,
);

const rosterHandler = () =>
  socketOn.mock.calls.filter(([event]) => event === 'roster.updated').pop()?.[1] as (d: unknown) => void;

beforeEach(() => {
  latest = null;
  mounts = 0;
  renders = 0;
  goTo = null;
  getCampaign.mockReset();
  getMap.mockReset();
  socketOn.mockReset();
  onCharacterHpUpdated.mockReset();
  getMap.mockImplementation((_c: string, mapId: string) =>
    Promise.resolve({ map: { id: mapId, tokens: [{ id: 'goblin' } as Token] }, spiritVisible: false }));
});

afterEach(() => {
  vi.useRealTimers();
});

it('refreshes the campaign without taking the table down or reloading the map', async () => {
  getCampaign.mockResolvedValueOnce(campaign('c1', 'Old name'));
  renderAt('/campaigns/c1');
  await waitFor(() => expect(latest?.currentMap?.id).toBe('m1'));
  expect(mounts).toBe(1);

  const fresh = deferred<ReturnType<typeof campaign>>();
  getCampaign.mockReturnValueOnce(fresh.promise);
  let refreshing!: Promise<void>;
  act(() => { refreshing = latest!.refreshCampaign(); });
  // While the answer is on its way the table is still there.
  expect(screen.queryByText('Loading campaign...')).toBeNull();
  await act(async () => {
    fresh.resolve(campaign('c1', 'New name', { chatCooldownSeconds: 30 }));
    await refreshing;
  });

  expect(latest!.campaign?.name).toBe('New name');
  expect(latest!.campaign?.chatCooldownSeconds).toBe(30);
  expect(mounts).toBe(1);
  expect(getMap).toHaveBeenCalledTimes(1);
  expect(Object.keys(useGameStore.getState().tokens)).toEqual(['goblin']);
});

it('keeps the table when a refresh fails', async () => {
  getCampaign.mockResolvedValueOnce(campaign('c1', 'Kept'));
  renderAt('/campaigns/c1');
  await waitFor(() => expect(latest?.campaign?.id).toBe('c1'));
  vi.spyOn(console, 'error').mockImplementation(() => {});

  getCampaign.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await latest!.refreshCampaign(); });

  expect(latest!.error).toBeNull();
  expect(latest!.campaign?.name).toBe('Kept');
  expect(mounts).toBe(1);
});

it('does not let a late answer for the last campaign write over the next one', async () => {
  const first = deferred<ReturnType<typeof campaign>>();
  getCampaign.mockReturnValueOnce(first.promise);
  renderAt('/campaigns/c1');
  await waitFor(() => expect(goTo).not.toBeNull());

  getCampaign.mockResolvedValueOnce(campaign('c2', 'Second'));
  act(() => goTo!('/campaigns/c2'));
  await waitFor(() => expect(latest?.campaign?.id).toBe('c2'));

  await act(async () => { first.resolve(campaign('c1', 'First')); await first.promise; });

  expect(latest!.campaign?.id).toBe('c2');
  expect(getMap).toHaveBeenCalledTimes(1);
});

it('cancels the redirect after a refused load when the page moves on', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getCampaign.mockRejectedValueOnce({ response: { status: 404, data: {} } });
  renderAt('/campaigns/gone');
  await waitFor(() => expect(goTo).not.toBeNull());
  await waitFor(() => expect(screen.queryByText('Loading campaign...')).toBeNull());

  getCampaign.mockResolvedValueOnce(campaign('c2', 'Second'));
  act(() => goTo!('/campaigns/c2'));
  await waitFor(() => expect(latest?.campaign?.id).toBe('c2'));
  await act(async () => { vi.advanceTimersByTime(2500); });

  expect(screen.queryByText('Dashboard')).toBeNull();
});

it('keeps the newest member list when roster answers arrive out of order', async () => {
  getCampaign.mockResolvedValueOnce(campaign('c1', 'Table'));
  renderAt('/campaigns/c1');
  await waitFor(() => expect(latest?.campaign?.id).toBe('c1'));

  const older = deferred<ReturnType<typeof campaign>>();
  getCampaign.mockReturnValueOnce(older.promise);
  getCampaign.mockResolvedValueOnce(campaign('c1', 'Table', {
    memberships: [{ userId: 'me', role: 'DM' }, { userId: 'newcomer', role: 'PLAYER' }],
  }));
  await act(async () => { rosterHandler()({ campaignId: 'c1' }); });
  await act(async () => { rosterHandler()({ campaignId: 'c1' }); });
  await waitFor(() => expect(latest!.campaign?.memberships).toHaveLength(2));

  await act(async () => { older.resolve(campaign('c1', 'Table')); await older.promise; });

  expect(latest!.campaign?.memberships?.map((m) => m.userId)).toEqual(['me', 'newcomer']);
});

it('puts a hit point change in the store without re-rendering what reads the campaign', async () => {
  getCampaign.mockResolvedValueOnce(campaign('c1', 'Table'));
  renderAt('/campaigns/c1');
  await waitFor(() => expect(latest?.currentMap?.id).toBe('m1'));
  const onHp = onCharacterHpUpdated.mock.calls.pop()?.[0] as (d: unknown) => void;
  const before = renders;

  act(() => onHp({ characterId: 'char-1', hp: { current: 4, max: 10, temp: 0 } }));

  expect(useGameStore.getState().characterHp['char-1']).toEqual({ current: 4, max: 10, temp: 0 });
  expect(renders).toBe(before);
});
