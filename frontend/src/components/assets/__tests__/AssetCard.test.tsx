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

vi.mock('../../../services/api', () => ({
  api: {
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
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
  ])('shows a %s as its thumbnail, not the full picture', (type, dir) => {
    const { container } = renderCard(asset(type, 'thing.png'));
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`/api/assets/${dir}/a1/thumbnail`);
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

// The card offered Delete to the uploader or an admin by a rule of its own,
// though the server also lets a campaign's DM delete its assets and refuses
// an uploader who has left the campaign. It now goes by what the asset list
// says the server will allow (canChange).
describe('AssetCard Delete', () => {
  it('is offered where the server will allow it, whoever uploaded the asset', () => {
    renderCard({ ...asset(AssetType.MAP, 'm.png'), uploadedById: 'someone-else', scope: AssetScope.CAMPAIGN, canChange: true }, 'list');
    expect(screen.getByRole('button', { name: 'Delete Thing' })).toBeInTheDocument();
  });

  it('is not offered where the server would refuse it, even to the uploader', () => {
    renderCard({ ...asset(AssetType.MAP, 'm.png'), scope: AssetScope.CAMPAIGN, canChange: false }, 'list');
    expect(screen.queryByRole('button', { name: 'Delete Thing' })).not.toBeInTheDocument();
  });
});

// With transition-all the card's CSS transition also covered its opacity, so
// in Firefox each card faded in twice: once by framer-motion, then again as
// the CSS transition replayed the final opacity it wrote. Hover changes only
// the shadow, so only the shadow is transitioned.
describe('AssetCard transitions', () => {
  it.each(['grid', 'list'] as const)('transitions only the shadow in %s view', (viewMode) => {
    const { container } = renderCard(asset(AssetType.MAP, 'm.png'), viewMode);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toMatch(/\btransition-shadow\b/);
    expect(card.className).not.toMatch(/\btransition-all\b/);
  });
});

// The fallback hid the picture and appended an empty element of its own to a
// node React owns, so the card showed nothing at all where the picture was.
describe('AssetCard picture that fails to load', () => {
  it.each(['grid', 'list'] as const)('is replaced by the asset type\'s icon in %s view', (viewMode) => {
    const { container } = renderCard(asset(AssetType.MAP, 'm.png'), viewMode);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.lucide-map-pin')).not.toBeNull();
  });
});

// The grid card drew View, Download and Delete only once the mouse entered
// it, so Tab could not reach them and a touch screen showed them only after a
// tap. They are always there now, shown on hover, while one has keyboard
// focus, and always on a screen with no hover.
describe('AssetCard grid actions', () => {
  it('are reachable by name without hovering the card', () => {
    renderCard({ ...asset(AssetType.MAP, 'm.png'), canChange: true });
    expect(screen.getByRole('button', { name: 'View Thing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Thing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Thing' })).toBeInTheDocument();
  });

  it('are shown on hover, while one has keyboard focus, and on a screen with no hover', () => {
    renderCard(asset(AssetType.MAP, 'm.png'));
    const overlay = screen.getByRole('button', { name: 'View Thing' }).parentElement as HTMLElement;
    const classes = overlay.className.split(/\s+/);
    expect(classes).toContain('opacity-0');
    expect(classes).toContain('group-hover:opacity-100');
    expect(classes).toContain('focus-within:opacity-100');
    expect(classes).toContain('[@media(hover:none)]:opacity-100');
    // Hidden, it does not catch a click meant for the card.
    expect(classes).toContain('pointer-events-none');
    expect(classes).toContain('group-hover:pointer-events-auto');
  });

  it('name View and Download in list view too', () => {
    renderCard(asset(AssetType.MAP, 'm.png'), 'list');
    expect(screen.getByRole('button', { name: 'View Thing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Thing' })).toBeInTheDocument();
  });
});
