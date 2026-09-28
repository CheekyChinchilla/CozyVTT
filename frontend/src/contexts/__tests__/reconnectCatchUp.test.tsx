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
vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(), onDmTransferred: vi.fn(), onMemberRoleChanged: vi.fn(),
    on: vi.fn(), off: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), getSocket: vi.fn().mockReturnValue(null), startHeartbeat: vi.fn(),
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

import { CampaignProvider, useCampaign } from '../CampaignContext';

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
