/**
 * The campaign's map list must follow the Map Library's create, rename,
 * import and delete, because the Move to Map… submenu reads
 * `campaign.maps`. It used to be written only at campaign load, so a map
 * made after the page loaded could not be a move target until a reload,
 * and a deleted one was still offered.
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
      maps: [{ id: 'm1', name: 'First Map' }],
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

describe('campaign.maps follows the Map Library', () => {
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
    const get = () => ctx!;
    return get;
  }

  it('upsertCampaignMap adds a new map to campaign.maps', async () => {
    const get = await mount();
    act(() => {
      get().upsertCampaignMap(mapMeta('m2', 'Second Map'));
    });
    await waitFor(() =>
      expect(get().campaign?.maps?.map((m) => m.id)).toEqual(['m2', 'm1']),
    );
  });

  it('upsertCampaignMap replaces an existing map in place', async () => {
    const get = await mount();
    act(() => {
      get().upsertCampaignMap(mapMeta('m1', 'Renamed'));
    });
    await waitFor(() => {
      const maps = get().campaign?.maps ?? [];
      expect(maps).toHaveLength(1);
      expect(maps[0]).toMatchObject({ id: 'm1', name: 'Renamed' });
    });
  });

  it('removeCampaignMap drops the map', async () => {
    const get = await mount();
    act(() => {
      get().upsertCampaignMap(mapMeta('m2', 'Second Map'));
    });
    act(() => {
      get().removeCampaignMap('m1');
    });
    await waitFor(() =>
      expect(get().campaign?.maps?.map((m) => m.id)).toEqual(['m2']),
    );
  });

  it('upsertCampaignMap starts a list when the campaign came without one', async () => {
    const get = await mount();
    act(() => {
      get().removeCampaignMap('m1');
    });
    act(() => {
      get().upsertCampaignMap(mapMeta('m3', 'Third Map'));
    });
    await waitFor(() =>
      expect(get().campaign?.maps?.map((m) => m.id)).toEqual(['m3']),
    );
  });
});
