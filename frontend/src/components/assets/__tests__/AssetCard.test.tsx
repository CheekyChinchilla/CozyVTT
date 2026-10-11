/**
 * AssetCard: which types are shown as a picture.
 *
 * Maps, tokens and avatars have an image to show. Audio and documents do not,
 * and get an icon. The decision used to be an `=== AUDIO` check written twice,
 * so the first DOCUMENT asset fell through to an <img> with no source and
 * rendered as a broken picture. Pinned per type so the next type added cannot
 * repeat it.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssetCard from '../AssetCard';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', platformRole: 'USER' } }),
}));

vi.mock('../../../services/api', () => ({
  api: {
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetDownloadUrl: (id: string) => `https://api.example.com/api/assets/${id}/download`,
  },
}));

function asset(type: AssetType, originalName: string): Asset {
  return {
    id: 'a1',
    name: 'Thing',
    originalName,
    type,
    scope: AssetScope.USER,
    uploadedById: 'u1',
    fileSize: 1234,
    mimeType: 'application/octet-stream',
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Asset;
}

function renderCard(a: Asset, viewMode: 'grid' | 'list' = 'grid') {
  return render(<AssetCard asset={a} viewMode={viewMode} onView={vi.fn()} onDelete={vi.fn()} />);
}

describe('AssetCard', () => {
  it.each([
    [AssetType.MAP, 'maps'],
    [AssetType.TOKEN, 'tokens'],
  ])('shows a %s as a picture from its serving route', (type, dir) => {
    const { container } = renderCard(asset(type, 'thing.png'));
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`/api/assets/${dir}/a1`);
  });

  it('shows an avatar as a picture keyed by its owner', () => {
    const { container } = renderCard(asset(AssetType.AVATAR, 'me.png'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/assets/avatars/u1');
  });

  it.each(['grid', 'list'] as const)('shows a document as an icon, never an <img>, in %s view', (view) => {
    const { container } = renderCard(asset(AssetType.DOCUMENT, 'rules.pdf'), view);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows audio as an icon too', () => {
    const { container } = renderCard(asset(AssetType.AUDIO, 'rain.mp3'));
    expect(container.querySelector('img')).toBeNull();
  });

  it('downloads from the address the API client gives, in a new tab that cannot reach back to this page', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    try {
      renderCard(asset(AssetType.DOCUMENT, 'rules.pdf'), 'list');
      fireEvent.click(screen.getByTitle('Download'));
      expect(open).toHaveBeenCalledWith('https://api.example.com/api/assets/a1/download', '_blank', 'noopener,noreferrer');
    } finally {
      open.mockRestore();
    }
  });
});
