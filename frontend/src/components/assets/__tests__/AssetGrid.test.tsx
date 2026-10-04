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

  it('builds thumbnail URLs from the type-specific serving route', async () => {
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} />);
    const img = await screen.findByAltText('Goblin');
    // Not /api/assets/a1/file — that route does not exist on the server.
    expect(img).toHaveAttribute('src', '/api/assets/tokens/a1');
  });

  it('uses the maps route for map assets', async () => {
    render(<AssetGrid type={AssetType.MAP} selectedId={null} onSelect={vi.fn()} />);
    const img = await screen.findByAltText('Goblin');
    expect(img).toHaveAttribute('src', '/api/assets/maps/a1');
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

  it('filters by search text', async () => {
    render(<AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} search="ogr" />);

    expect(await screen.findByAltText('Ogre')).toBeInTheDocument();
    expect(screen.queryByAltText('Goblin')).not.toBeInTheDocument();
  });

  it('shows the empty message when the library has nothing', async () => {
    mockListAssets.mockResolvedValue({ assets: [] });
    render(
      <AssetGrid type={AssetType.TOKEN} selectedId={null} onSelect={vi.fn()} emptyMessage="No tokens yet." />
    );
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
  });

  it('distinguishes an empty library from an empty search result', async () => {
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
});
