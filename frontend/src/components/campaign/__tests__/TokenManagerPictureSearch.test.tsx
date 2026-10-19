/**
 * The Token Manager's picture picker searches and pages the whole library.
 *
 * It fetched the newest 100 token pictures when it opened and offered no
 * search, so an older picture could not be chosen. It now uses the picker
 * grid's own fetch: a search box the server answers, and Load more.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', memberships: [], maps: [{ id: 'map-1', name: 'Cave' }] },
    currentMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));

const api = vi.hoisted(() => ({
  addToken: vi.fn(), updateToken: vi.fn(), deleteToken: vi.fn(), uploadAsset: vi.fn(), listAssets: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
  getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const picture = (id: string, name: string) => ({ id, name, type: 'TOKEN', scope: 'USER', tags: [] });

beforeEach(() => {
  vi.clearAllMocks();
});

it('asks the server for what is typed in the search box', async () => {
  api.listAssets.mockImplementation(async (params: { search?: string }) => ({
    assets: params.search === 'ogre' ? [picture('o1', 'Ogre')] : [picture('g1', 'Goblin')],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  }));
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(await screen.findByAltText('Goblin')).toBeInTheDocument();

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search token pictures' }), 'ogre');

  expect(await screen.findByAltText('Ogre')).toBeInTheDocument();
  expect(api.listAssets).toHaveBeenCalledWith(expect.objectContaining({ type: 'TOKEN', search: 'ogre', usable: true }));
});

it('offers Load more for pictures past the first lot', async () => {
  api.listAssets.mockImplementation(async (params: { page?: number }) => (params.page === 2
    ? { assets: [picture('o1', 'Old ogre')], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } }
    : { assets: [picture('g1', 'Goblin')], pagination: { page: 1, limit: 50, total: 51, totalPages: 2 } }));
  render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByAltText('Old ogre')).toBeInTheDocument();
});

it('says when the pictures could not be loaded', async () => {
  api.listAssets.mockRejectedValue(new Error('network'));
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(await screen.findByText('Failed to load token assets')).toBeInTheDocument();
});
