/**
 * `campaign.currentMapId` must follow a map switch. Only a full campaign
 * reload used to write it, so the Map Library, which re-reads it every time
 * it opens, put its Active badge back on the map the page loaded with and
 * offered Set Active on the map the table was already showing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Map } from '@/types';

// ── Service mocks (the provider pulls these in transitively) ─────────────────

vi.mock('@/services/campaign.service', () => ({
  default: {
    getCampaign: vi.fn().mockResolvedValue({
      id: 'c1',
      name: 'Test',
      memberships: [],
      currentMapId: null,
    }),
  },
}));

vi.mock('@/services/api', () => ({
  default: { getMap: vi.fn(), pingSession: vi.fn() },
  api: { getMap: vi.fn(), pingSession: vi.fn() },
}));

vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(),
    onDmTransferred: vi.fn(),
    onMemberRoleChanged: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onRebuilt: vi.fn().mockReturnValue(() => {}),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getSocket: vi.fn().mockReturnValue(null),
    startHeartbeat: vi.fn(),
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: vi.fn().mockRejectedValue(new Error('not authenticated')),
  },
}));

import { AuthProvider } from '../AuthContext';
import { CampaignProvider, useCampaign } from '../CampaignContext';

const mapMeta = (id: string, name: string): Map => ({ id, name }) as unknown as Map;

describe('campaign.currentMapId follows setCurrentMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function mount() {
    let ctx: ReturnType<typeof useCampaign> | null = null;
    function Probe() {
      ctx = useCampaign();
      return null;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <CampaignProvider>
            <Probe />
          </CampaignProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    await act(async () => {
      await ctx!.loadCampaign('c1');
    });
    await waitFor(() => expect(ctx!.campaign?.id).toBe('c1'));
    return () => ctx!;
  }

  it('a switch writes the new id into campaign.currentMapId', async () => {
    const get = await mount();
    act(() => {
      get().setCurrentMap(mapMeta('m2', 'Second Map'));
    });
    await waitFor(() => {
      expect(get().currentMap?.id).toBe('m2');
      expect(get().campaign?.currentMapId).toBe('m2');
    });
  });

  it('clearing the map leaves campaign.currentMapId alone', async () => {
    const get = await mount();
    act(() => {
      get().setCurrentMap(mapMeta('m2', 'Second Map'));
    });
    act(() => {
      get().setCurrentMap(null);
    });
    await waitFor(() => {
      expect(get().currentMap).toBeNull();
      expect(get().campaign?.currentMapId).toBe('m2');
    });
  });

  it('an update of the map showing applies to its latest value and keeps currentMapId', async () => {
    const get = await mount();
    act(() => {
      get().setCurrentMap(mapMeta('m2', 'Second Map'));
    });
    act(() => {
      get().setCurrentMap({ ...mapMeta('m2', 'Renamed'), imageUrl: '/api/assets/maps/new' } as Map);
    });
    act(() => {
      get().setCurrentMap((prev) => (prev?.id === 'm2' ? { ...prev, fogEnabled: true } : prev));
    });
    await waitFor(() => {
      expect(get().currentMap).toMatchObject({ id: 'm2', name: 'Renamed', imageUrl: '/api/assets/maps/new', fogEnabled: true });
      expect(get().campaign?.currentMapId).toBe('m2');
    });
  });
});
