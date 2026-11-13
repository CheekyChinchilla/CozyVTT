/**
 * The Creature Library and Token Templates place on the map on screen.
 *
 * While the GM prepares a map, the map on screen is not the table's, and a
 * creature meant for it placed on the table's map would appear in front of
 * the players. Placing names the map on screen, and the token is drawn there
 * only while that map is still the one on screen when the answer comes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreatureTemplate, Token, TokenTemplate } from '@/types';
import { TokenType, TokenDisposition } from '@/types';
import CreatureLibrary from '../CreatureLibrary';
import TokenTemplateLibrary from '../TokenTemplateLibrary';
import { useGameStore } from '@/stores/gameStore';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', gameSystem: null },
    currentMap: { id: 'map-table', width: 20, height: 20 },
    viewedMap: { id: 'map-prepared', width: 20, height: 20 },
    isPreparing: true,
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/components/assets/AssetPicker', () => ({ default: () => null }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

const api = vi.hoisted(() => ({
  listCreatures: vi.fn(),
  getSeedStatus: vi.fn(),
  listCreatureFavorites: vi.fn(),
  listTokenTemplates: vi.fn(),
  listCampaigns: vi.fn(),
  addToken: vi.fn(),
  storedAssetSrc: (s: string) => s,
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const statBlock = { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } };
const bat = {
  id: 'c1', name: 'Boss Bat', source: 'custom', challengeRating: '1', imageUrl: null, statBlock,
  size: { width: 1, height: 1 }, disposition: 'hostile', displayMode: 'pog', campaignId: 'campaign-1',
} as unknown as CreatureTemplate;
const torch: TokenTemplate = {
  id: 'template-1', name: 'Torch Prop', imageUrl: null, type: TokenType.OBJECT, disposition: TokenDisposition.NEUTRAL,
  displayMode: 'pog', size: { width: 1, height: 1 }, notes: null, hp: null, showHpBar: false, statBlock: null,
  sightRadius: null, campaignId: 'campaign-1', createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};
const placed = (id: string) => ({ token: { id, name: id, position: { x: 10, y: 10 }, size: { width: 1, height: 1 } } as unknown as Token });

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatures.mockResolvedValue({ creatures: [bat], total: 1 });
  api.getSeedStatus.mockResolvedValue({ srdCount: 0 });
  api.listCreatureFavorites.mockResolvedValue({ favoriteIds: [], creatures: [] });
  api.listTokenTemplates.mockResolvedValue({ templates: [torch], total: 1, limit: 100, offset: 0 });
  api.listCampaigns.mockResolvedValue({ campaigns: [] });
  act(() => { useGameStore.getState().setTokens([], 'map-prepared'); });
});

describe('placing from a library while the GM prepares a map', () => {
  it('places a creature on the map on screen', async () => {
    api.addToken.mockResolvedValue(placed('bat-token'));
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Boss Bat'));
    await userEvent.click(screen.getByText('Place on Map'));
    await waitFor(() => expect(api.addToken).toHaveBeenCalled());
    expect(api.addToken.mock.calls[0][1]).toBe('map-prepared');
    await waitFor(() => expect(useGameStore.getState().tokenOrder).toEqual(['bat-token']));
  });

  it('places a token template on the map on screen', async () => {
    api.addToken.mockResolvedValue(placed('torch-token'));
    render(<TokenTemplateLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Torch Prop'));
    await userEvent.click(screen.getByText('Place on Map'));
    await waitFor(() => expect(api.addToken).toHaveBeenCalled());
    expect(api.addToken.mock.calls[0][1]).toBe('map-prepared');
  });

  it('draws nothing when another map is on screen by the time the answer comes', async () => {
    let answer: (value: ReturnType<typeof placed>) => void = () => undefined;
    api.addToken.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    render(<CreatureLibrary isOpen onClose={() => {}} />);
    await userEvent.click(await screen.findByText('Boss Bat'));
    await userEvent.click(screen.getByText('Place on Map'));
    await waitFor(() => expect(api.addToken).toHaveBeenCalled());
    // Back to the table before the placement is answered.
    act(() => { useGameStore.getState().setTokens([], 'map-table'); });
    await act(async () => { answer(placed('late-bat')); });
    expect(useGameStore.getState().tokenOrder).toEqual([]);
  });
});
