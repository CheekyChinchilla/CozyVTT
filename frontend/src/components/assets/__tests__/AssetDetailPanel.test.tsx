/**
 * AssetDetailPanel: the Download button.
 *
 * It opened `/api/assets/<id>/download` written out by hand, apart from the
 * API client that builds every other address, and gave the new tab a way
 * back to this page.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const patchAssetScope = vi.hoisted(() => vi.fn());
import AssetDetailPanel from '../AssetDetailPanel';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' } }),
}));

vi.mock('../../../services/campaign.service', () => ({
  default: { getCampaigns: () => Promise.resolve([]) },
}));

vi.mock('../../../services/api', () => ({
  api: {
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetDownloadUrl: (id: string) => `https://api.example.com/api/assets/${id}/download`,
    patchAssetScope: (...args: unknown[]) => patchAssetScope(...args),
  },
}));

const asset = {
  id: 'a1',
  name: 'Rules',
  originalName: 'rules.pdf',
  type: AssetType.DOCUMENT,
  scope: AssetScope.USER,
  uploadedById: 'u1',
  fileSize: 1234,
  mimeType: 'application/pdf',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Asset;

describe('AssetDetailPanel', () => {
  it('downloads from the address the API client gives, in a new tab that cannot reach back to this page', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      render(<AssetDetailPanel asset={asset} onClose={vi.fn()} onDelete={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /download/i }));
      expect(open).toHaveBeenCalledWith('https://api.example.com/api/assets/a1/download', '_blank', 'noopener,noreferrer');
    } finally {
      open.mockRestore();
    }
  });
});

// It showed the reply's short label, "Forbidden", which says nothing of why.
describe('a move the server refuses', () => {
  it('says why', async () => {
    patchAssetScope.mockRejectedValue(Object.assign(new Error('Request failed with status code 403'), {
      response: { status: 403, data: { error: 'Forbidden', message: 'Only the asset owner or campaign DM can move this asset' } },
    }));
    const art = { ...asset, type: AssetType.TOKEN, scope: AssetScope.CAMPAIGN, campaignId: 'c1', canChange: true } as unknown as Asset;
    render(<AssetDetailPanel asset={art} onClose={vi.fn()} onDelete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Personal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to Personal' }));

    expect(await screen.findByText('Only the asset owner or campaign DM can move this asset')).toBeInTheDocument();
    expect(screen.queryByText('Forbidden')).not.toBeInTheDocument();
  });
});

// Offered by a rule of its own (the uploader or an admin), as the card was.
describe('Delete and Move in the panel', () => {
  const campaignArt = (over: Partial<Asset>) =>
    ({ ...asset, type: AssetType.TOKEN, scope: AssetScope.CAMPAIGN, campaignId: 'c1', ...over }) as unknown as Asset;

  it('are offered where the server will allow them, to the campaign\'s DM say', () => {
    render(<AssetDetailPanel asset={campaignArt({ uploadedById: 'a-player', canChange: true })} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByText('Move to…')).toBeInTheDocument();
  });

  it('are not offered where the server would refuse them, even to the uploader', () => {
    render(<AssetDetailPanel asset={campaignArt({ uploadedById: 'u1', canChange: false })} onClose={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Move to…')).not.toBeInTheDocument();
  });
});
