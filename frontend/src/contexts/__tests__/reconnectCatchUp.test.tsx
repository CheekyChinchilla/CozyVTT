/**
 * What a page catches up on after its connection comes back.
 *
 * Pausing or ending the session, a member's role and a map switch arrive as
 * events, and events sent while a page was offline are not replayed. The
 * page refetched only the map it was on, so a player who missed a pause was
 * still offered drags the server refused, and one who missed a map switch
 * asked for a map they may no longer read.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const getCampaign = vi.fn();
const getMap = vi.fn();
vi.mock('@/services/campaign.service', () => ({ default: { getCampaign: (...a: unknown[]) => getCampaign(...a) } }));
vi.mock('@/services/api', () => ({
  default: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
  api: { getMap: (...a: unknown[]) => getMap(...a), pingSession: vi.fn() },
}));
const socketOn = vi.fn();
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(), onDmTransferred: vi.fn(), onMemberRoleChanged: vi.fn(),
    on: (...a: unknown[]) => socketOn(...a), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null), startHeartbeat: vi.fn(),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign } from '../CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';

const campaignAs = (status: string, currentMapId: string, role: string) => ({
  id: 'c1', name: 'Test', status, currentMapId, maps: [], memberships: [{ userId: 'me', role }],
});

let latest: ReturnType<typeof useCampaign> | null = null;
function Probe() {
  latest = useCampaign();
  return null;
}

beforeEach(() => {
  latest = null;
  getCampaign.mockReset();
  getMap.mockReset();
  socketOn.mockReset();
  getMap.mockImplementation((_c: string, mapId: string) => Promise.resolve({ map: { id: mapId, tokens: [] }, spiritVisible: false }));
});

it('picks up the session state, the role and the map the table is now on', async () => {
  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'PLAYER'));
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(latest?.currentMap?.id).toBe('m1'));

  // While the page was offline: the session was paused, the member made a
  // spectator, and the table moved to another map.
  getCampaign.mockResolvedValueOnce(campaignAs('PAUSED', 'm2', 'SPECTATOR'));
  await act(async () => { await latest!.catchUpAfterReconnect(); });

  expect(latest!.campaign?.status).toBe('PAUSED');
  expect(latest!.userRole).toBe('SPECTATOR');
  expect(latest!.currentMap?.id).toBe('m2');
  expect(getMap).toHaveBeenLastCalledWith('c1', 'm2');
});

// Someone joining the campaign is announced as roster.updated. The page's
// member list, which Duplicate and every role check read, followed only a
// full load, so a token duplicated after a player joined lost its controller.
it('refreshes the member list when the roster changes', async () => {
  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'DM'));
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(latest?.campaign?.id).toBe('c1'));
  const onRoster = socketOn.mock.calls.filter(([event]) => event === 'roster.updated').pop()?.[1] as ((d: unknown) => void) | undefined;
  expect(onRoster).toBeDefined();

  getCampaign.mockResolvedValueOnce({
    ...campaignAs('ACTIVE', 'm1', 'DM'),
    memberships: [{ userId: 'me', role: 'DM' }, { userId: 'newcomer', role: 'PLAYER' }],
  });
  await act(async () => { onRoster!({ action: 'member.joined', campaignId: 'c1', userId: 'newcomer' }); });
  await waitFor(() => expect(latest!.campaign?.memberships?.map((m) => m.userId)).toEqual(['me', 'newcomer']));
});


// A catch-up still waiting on the server when the page moves to another
// campaign wrote the first campaign's map, tokens and session over the new
// one's when its answers arrived.
it('writes nothing once the page has moved to another campaign', async () => {
  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'PLAYER'));
  render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(latest?.currentMap?.id).toBe('m1'));

  // The catch-up for c1: its campaign read answers, its map read is held.
  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'PLAYER'));
  let releaseMap: () => void = () => {};
  getMap.mockImplementationOnce((_c: string, mapId: string) => new Promise((resolve) => {
    releaseMap = () => resolve({ map: { id: mapId, tokens: [] }, spiritVisible: false });
  }));
  let catching: Promise<void> = Promise.resolve();
  act(() => { catching = latest!.catchUpAfterReconnect(); });
  await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'm1'));

  // The page moves to c2 meanwhile.
  getCampaign.mockResolvedValueOnce({ ...campaignAs('ACTIVE', 'mB', 'PLAYER'), id: 'c2' });
  await act(async () => { await latest!.loadCampaign('c2'); });
  await waitFor(() => expect(latest?.currentMap?.id).toBe('mB'));

  await act(async () => { releaseMap(); await catching; });
  expect(latest!.campaign?.id).toBe('c2');
  expect(latest!.currentMap?.id).toBe('mB');
});

// The app reaches another campaign through the dashboard, which unmounts this
// provider; the next campaign's page reads the same token store. A catch-up
// still waiting when the page closed wrote its campaign's tokens into it.
it('writes nothing once the page has closed', async () => {
  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'PLAYER'));
  const view = render(
    <MemoryRouter initialEntries={['/campaigns/c1']}>
      <Routes>
        <Route path="/campaigns/:id" element={<CampaignProvider><Probe /></CampaignProvider>} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(latest?.currentMap?.id).toBe('m1'));

  getCampaign.mockResolvedValueOnce(campaignAs('ACTIVE', 'm1', 'PLAYER'));
  let releaseMap: () => void = () => {};
  getMap.mockImplementationOnce((_c: string, mapId: string) => new Promise((resolve) => {
    releaseMap = () => resolve({ map: { id: mapId, tokens: [{ id: 'from-c1' }] }, spiritVisible: false });
  }));
  let catching: Promise<void> = Promise.resolve();
  act(() => { catching = latest!.catchUpAfterReconnect(); });
  await waitFor(() => expect(getMap).toHaveBeenLastCalledWith('c1', 'm1'));

  // Back to the dashboard, and into another campaign, whose page loads its own tokens.
  view.unmount();
  act(() => { useGameStore.getState().setTokens([{ id: 'from-c2' } as Token]); });

  await act(async () => { releaseMap(); await catching; });
  expect(Object.keys(useGameStore.getState().tokens)).toEqual(['from-c2']);
});
