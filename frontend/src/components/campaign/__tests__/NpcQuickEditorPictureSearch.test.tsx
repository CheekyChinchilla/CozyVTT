/**
 * Edit Token's picture picker searches and pages the whole library.
 *
 * It fetched the newest 100 token pictures once and offered no search, so an
 * older picture could not be chosen. It now uses the picker grid's own fetch:
 * a search box the server answers, and Load more. A failure to load still
 * says so, with the server's reason.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const showToast = vi.fn();

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange: vi.fn() } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [] }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
}));
const api = vi.hoisted(() => ({
  updateToken: vi.fn(), listAssets: vi.fn(), uploadAsset: vi.fn(), updateCreature: vi.fn(),
  getCreature: vi.fn(), listCreatures: vi.fn(), duplicateCreature: vi.fn(),
  getAssetUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}`,
  getAssetThumbnailUrl: (id: string, dir: string) => `/api/assets/${dir}/${id}/thumbnail`,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

import NpcQuickEditor from '../NpcQuickEditor';

const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: { current: 7, max: 7, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

const refusal = (status: number, message: string) => ({ response: { status, data: { message } } });

function open(token: Token = goblin) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
}

beforeEach(() => {
  showToast.mockClear();
  Object.values(api).forEach((fn) => (typeof fn === 'function' && 'mockReset' in fn ? (fn as ReturnType<typeof vi.fn>).mockReset() : undefined));
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  useGameStore.getState().clearGameState();
});

const picture = (id: string, name: string) => ({ id, name, type: 'TOKEN', scope: 'USER', tags: [] });

it('says when the token pictures could not be loaded', async () => {
  api.listAssets.mockRejectedValue(refusal(429, 'Too many requests, please slow down'));
  open();
  fireEvent.click(screen.getByTitle('Add a token image'));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('Too many requests, please slow down', 'error'));
});

it('asks the server for what is typed in the search box', async () => {
  api.listAssets.mockImplementation(async (params: { search?: string }) => ({
    assets: params.search === 'ogre' ? [picture('o1', 'Ogre')] : [picture('g1', 'Goblin')],
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  }));
  open();
  fireEvent.click(screen.getByTitle('Add a token image'));
  expect(await screen.findByAltText('Goblin')).toBeInTheDocument();

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search token pictures' }), 'ogre');

  expect(await screen.findByAltText('Ogre')).toBeInTheDocument();
  expect(api.listAssets).toHaveBeenCalledWith(expect.objectContaining({ type: 'TOKEN', search: 'ogre', usable: true }));
});

it('offers Load more for pictures past the first lot', async () => {
  api.listAssets.mockImplementation(async (params: { page?: number }) => (params.page === 2
    ? { assets: [picture('o1', 'Old ogre')], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } }
    : { assets: [picture('g1', 'Goblin')], pagination: { page: 1, limit: 50, total: 51, totalPages: 2 } }));
  open();
  fireEvent.click(screen.getByTitle('Add a token image'));
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(await screen.findByAltText('Old ogre')).toBeInTheDocument();
});
