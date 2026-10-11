/**
 * AssetDetailPanel: the Download button.
 *
 * It opened `/api/assets/<id>/download` written out by hand, apart from the
 * API client that builds every other address, and gave the new tab a way
 * back to this page.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
