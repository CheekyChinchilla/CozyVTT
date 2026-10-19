/**
 * AssetGrid tests.
 *
 * AssetGrid is now the single implementation behind every asset picker in the
 * app — map create/edit, the token manager, the NPC quick editor and the
 * creature editor. A regression here breaks all five, so the selection
 * contract and the broken-image fallback are both pinned.
 *
 * The fallback case is a security test, not cosmetics: asset names are
 * user-supplied, and the fallback used to be the one place tempted to reach
 * for innerHTML.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssetGrid from '../AssetGrid';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';

vi.mock('@/services/api', () => ({
  api: {
    listAssets: vi.fn(),
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
  },
}));

import { api } from '@/services/api';

const mockListAssets = api.listAssets as ReturnType<typeof vi.fn>;

function makeAsset(id: string, name: string): Asset {
  return {
    id,
    name,
    originalName: `${name}.png`,
    type: AssetType.TOKEN,
    scope: AssetScope.CAMPAIGN,
  } as Asset;
}

const GOBLIN = makeAsset('a1', 'Goblin');
const OGRE = makeAsset('b2', 'Ogre');

beforeEach(() => {
  mockListAssets.mockReset();
  mockListAssets.mockResolvedValue({ assets: [GOBLIN, OGRE] });
});

describe('AssetGrid', () => {
  it('fetches assets for the given type and renders them', async () => {
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByAltText('Goblin')).toBeInTheDocument();
    expect(screen.getByAltText('Ogre')).toBeInTheDocument();
    expect(mockListAssets).toHaveBeenCalledWith(expect.objectContaining({ type: AssetType.TOKEN, usable: true }));
  });

  // The thumbnail made at upload, where the full picture was drawn into a
  // 100-pixel square.
  it('shows each thumbnail from the type-specific thumbnail route', async () => {
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} />);
    const img = await screen.findByAltText('Goblin');
    expect(img).toHaveAttribute('src', '/api/assets/tokens/a1/thumbnail');
  });

  it('uses the maps route for map assets', async () => {
    render(<AssetGrid type={AssetType.MAP} selectedId={null} onSelect={vi.fn()} />);
    const img = await screen.findByAltText('Goblin');
    expect(img).toHaveAttribute('src', '/api/assets/maps/a1/thumbnail');
  });

  it('reports the clicked asset', async () => {
    const onSelect = vi.fn();
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={onSelect} />);

    fireEvent.click((await screen.findByAltText('Ogre')).closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(OGRE);
  });

  it('deselects when the already-selected asset is clicked again', async () => {
    const onSelect = vi.fn();
    render(<AssetGrid type={AssetType.TOKEN} selectedId="a1" onSelect={onSelect} />);

    fireEvent.click((await screen.findByAltText('Goblin')).closest('button')!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  // The search ran in the browser over the one page fetched, so an asset
  // past it could not be found. The server searches the whole library.
  it('asks the server for the search', async () => {
    mockListAssets.mockImplementation(async (params: { search?: string }) => ({
      assets: params.search === 'ogr' ? [OGRE] : [GOBLIN, OGRE],
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    }));
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} search="ogr" />);

    expect(await screen.findByAltText('Ogre')).toBeInTheDocument();
    expect(screen.queryByAltText('Goblin')).not.toBeInTheDocument();
    expect(mockListAssets).toHaveBeenCalledWith(expect.objectContaining({ search: 'ogr', page: 1 }));
  });

  it('shows the empty message when the library has nothing', async () => {
    mockListAssets.mockResolvedValue({ assets: [] });
    render(
      <AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} emptyMessage="No tokens yet." />
    );
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
  });

  it('distinguishes an empty library from an empty search result', async () => {
    mockListAssets.mockResolvedValue({ assets: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } });
    render(
      <AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} search="zzz" emptyMessage="No tokens yet." />
    );
    expect(await screen.findByText('No results for your search.')).toBeInTheDocument();
  });

  it('skips its own fetch when the parent supplies assets', async () => {
    render(
      <AssetGrid type={AssetType.TOKEN} assets={[GOBLIN]} selectedId={null} onSelect={vi.fn()} />
    );
    expect(await screen.findByAltText('Goblin')).toBeInTheDocument();
    expect(mockListAssets).not.toHaveBeenCalled();
  });

  it('renders a leading item before the assets', async () => {
    render(
      <AssetGrid
        type={AssetType.TOKEN}
        selectedId={null}
        onSelect={vi.fn()}
        leadingItem={<button type="button">None</button>}
      />
    );
    expect(await screen.findByText('None')).toBeInTheDocument();
  });

  it('survives a listing failure without crashing', async () => {
    mockListAssets.mockRejectedValue(new Error('network'));
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} emptyMessage="Nothing here." />);
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });

  // ── Security ────────────────────────────────────────────────────────────

  it('renders a malicious asset name as TEXT when the image fails to load', async () => {
    const evil = makeAsset('x9', '<img src=x onerror="window.__pwned=1">');
    mockListAssets.mockResolvedValue({ assets: [evil] });

    const { container } = render(
      <AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} />
    );

    const img = await screen.findByAltText(evil.name);
    fireEvent.error(img);

    await waitFor(() => {
      // The name is present as literal text...
      expect(screen.getByText(evil.name)).toBeInTheDocument();
    });
    // ...and no element was injected from it. If the fallback ever switches to
    // innerHTML this finds the smuggled <img> and fails.
    expect(container.querySelectorAll('img[src="x"]')).toHaveLength(0);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  // The fallback used to replace the button's children itself, React's
  // selection overlay among them. When the selection then moved, React went to
  // remove an overlay that was no longer there and threw, blanking the picker.
  it('keeps working when a selected thumbnail fails and the selection then moves', async () => {
    const { rerender } = render(<AssetGrid type={AssetType.TOKEN} selectedId="a1" onSelect={vi.fn()} />);
    fireEvent.error(await screen.findByAltText('Goblin'));
    expect(await screen.findByText('Goblin')).toBeInTheDocument();

    expect(() => rerender(<AssetGrid type={AssetType.TOKEN} selectedId="b2" onSelect={vi.fn()} />)).not.toThrow();
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByAltText('Ogre')).toBeInTheDocument();
  });

  // It showed the newest 50 and no more, so an older asset could not be
  // picked at all.
  it('offers Load more while the server has more, and adds the next page', async () => {
    mockListAssets.mockImplementation(async (params: { page?: number }) =>
      params.page === 2
        ? { assets: [OGRE], pagination: { page: 2, limit: 1, total: 2, totalPages: 2 } }
        : { assets: [GOBLIN], pagination: { page: 1, limit: 1, total: 2, totalPages: 2 } }
    );
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} limit={1} />);
    expect(await screen.findByAltText('Goblin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByAltText('Ogre')).toBeInTheDocument();
    expect(screen.getByAltText('Goblin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows first the assets the parent adds, such as one just uploaded', async () => {
    const fresh = makeAsset('c3', 'Fresh upload');
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} prepend={[fresh]} />);
    await screen.findByAltText('Goblin');
    const shown = screen.getAllByRole('img').map((img) => img.getAttribute('alt'));
    expect(shown).toEqual(['Fresh upload', 'Goblin', 'Ogre']);
  });
});
