/**
 * The picker names the chosen asset while its grid shows something else.
 *
 * The grid searches the server, so its results change as you type. The
 * picker took its list of known assets from the grid's latest results, so
 * choosing a picture and then searching for another made the row above say
 * "Selected" in place of the chosen picture's name. It keeps every asset it
 * has seen.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';

vi.mock('framer-motion', () => {
  // One component for every motion element, so nothing remounts on render.
  const MotionDiv = (props: { children?: unknown }) => <div>{props.children as never}</div>;
  return {
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));
const listAssets = vi.hoisted(() => vi.fn());
vi.mock('@/services/api', () => {
  const api = {
    listAssets,
    getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
    getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
  };
  return { api, default: api };
});

import AssetPicker from '../AssetPicker';

const picture = (id: string, name: string) => ({ id, name, type: AssetType.MAP, scope: AssetScope.USER, tags: [] }) as unknown as Asset;

it('keeps naming the chosen asset after a search that leaves it out', async () => {
  listAssets.mockImplementation(async (params: { search?: string }) => ({
    assets: params.search ? [picture('m2', 'Desert')] : [picture('m1', 'Cavern'), picture('m2', 'Desert')],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  }));
  let chosen: string | null = null;
  const { rerender } = render(<AssetPicker label="Map picture" type={AssetType.MAP} selectedAssetId={chosen} onSelect={(a) => { chosen = a?.id ?? null; }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Browse Assets' }));
  fireEvent.click(await screen.findByTitle('Cavern'));
  rerender(<AssetPicker label="Map picture" type={AssetType.MAP} selectedAssetId={chosen} onSelect={(a) => { chosen = a?.id ?? null; }} />);
  expect(screen.getByText('Cavern')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Browse Assets' }));
  await userEvent.type(screen.getByPlaceholderText('Search assets...'), 'des');
  // The grid now shows the search's results, which leave Cavern out.
  await waitFor(() => expect(screen.queryByTitle('Cavern')).not.toBeInTheDocument());
  expect(screen.getByTitle('Desert')).toBeInTheDocument();

  expect(screen.getByText('Cavern')).toBeInTheDocument();
});
