/**
 * Which tracks the atmosphere panel offers.
 *
 * The asset list a DM can see is wider than the set they may actually play:
 * it also holds audio scoped to other campaigns they belong to, which the
 * server refuses because a track belongs to the table it was uploaded for.
 * Offering one of those produced a button that silently did nothing, since a
 * refused set only reaches the console.
 *
 * The scope line had the same shape of bug: a two-way label that called every
 * non-campaign track "Global", so a DM's own personal track was described as
 * something the whole instance could see.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AtmospherePanel from '../AtmospherePanel';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';

const campaign = { id: 'c1', name: 'The Table' };

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign,
    activeAtmosphereEffect: null,
    activeAtmosphereAudio: null,
  }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn() }, isConnected: true }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));

vi.mock('@/services/api', () => ({
  default: { listAssets: vi.fn() },
  api: { listAssets: vi.fn() },
}));

import api from '@/services/api';
const listAssets = api.listAssets as ReturnType<typeof vi.fn>;

function track(id: string, name: string, scope: AssetScope, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    name,
    type: AssetType.AUDIO,
    scope,
    uploadedById: 'dm',
    campaignId: null,
    originalName: `${name}.mp3`,
    mimeType: 'audio/mpeg',
    fileSize: 1024,
    filename: '',
    description: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as unknown as Asset;
}

beforeEach(() => {
  vi.clearAllMocks();
  listAssets.mockResolvedValue({ assets: [], pagination: { page: 1, limit: 25, total: 0 } });
});

describe('AtmospherePanel audio list', () => {
  it('offers the DM\'s own track, a global one, and this campaign\'s own', async () => {
    listAssets.mockResolvedValue({
      assets: [
        track('a1', 'My Rain', AssetScope.USER),
        track('a2', 'Shared Tavern', AssetScope.GLOBAL, { uploadedById: 'someone' }),
        track('a3', 'This Table', AssetScope.CAMPAIGN, { campaignId: 'c1' }),
      ],
      pagination: { page: 1, limit: 25, total: 3 },
    });
    render(<AtmospherePanel isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('My Rain')).toBeInTheDocument();
    expect(screen.getByText('Shared Tavern')).toBeInTheDocument();
    expect(screen.getByText('This Table')).toBeInTheDocument();
  });

  it('does not offer a track scoped to another campaign, which the server refuses', async () => {
    listAssets.mockResolvedValue({
      assets: [
        track('a1', 'My Rain', AssetScope.USER),
        track('a4', 'Another Table', AssetScope.CAMPAIGN, { campaignId: 'c2' }),
      ],
      pagination: { page: 1, limit: 25, total: 2 },
    });
    render(<AtmospherePanel isOpen onClose={vi.fn()} />);

    expect(await screen.findByText('My Rain')).toBeInTheDocument();
    expect(screen.queryByText('Another Table')).toBeNull();
  });

  it('does not offer somebody else\'s personal track', async () => {
    listAssets.mockResolvedValue({
      assets: [track('a5', 'Their Recording', AssetScope.USER, { uploadedById: 'someone-else' })],
      pagination: { page: 1, limit: 25, total: 1 },
    });
    render(<AtmospherePanel isOpen onClose={vi.fn()} />);

    await waitFor(() => expect(listAssets).toHaveBeenCalled());
    expect(screen.queryByText('Their Recording')).toBeNull();
  });

  it('names each scope as the rest of the app does', async () => {
    listAssets.mockResolvedValue({
      assets: [
        track('a1', 'My Rain', AssetScope.USER),
        track('a2', 'Shared Tavern', AssetScope.GLOBAL, { uploadedById: 'someone' }),
        track('a3', 'This Table', AssetScope.CAMPAIGN, { campaignId: 'c1' }),
      ],
      pagination: { page: 1, limit: 25, total: 3 },
    });
    render(<AtmospherePanel isOpen onClose={vi.fn()} />);

    await screen.findByText('My Rain');
    expect(screen.getByText(/Personal/)).toBeInTheDocument();
    expect(screen.getByText(/Global/)).toBeInTheDocument();
    expect(screen.getByText(/Campaign/)).toBeInTheDocument();
  });
});
