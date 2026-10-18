/**
 * The Token Manager says why the server refused.
 *
 * Every action but Move to Map reported a refusal as a fixed sentence, such
 * as "Failed to add token to map", so a DM who hit the limit of 1,000 tokens
 * on a map, a rate limit or a picture the server would not take had nothing
 * to go on. Each now shows the server's reason, and the fixed sentence only
 * when there is none.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';

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
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({ addToken: vi.fn(), updateToken: vi.fn(), deleteToken: vi.fn(), uploadAsset: vi.fn(), listAssets: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

const refusal = (message: string) => Object.assign(new Error('Request failed'), { response: { status: 400, data: { error: 'Limit Exceeded', message } } });

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  useGameStore.getState().setTokens([goblin]);
});

it('says why Place on Map was refused', async () => {
  api.addToken.mockRejectedValue(refusal('A map can hold at most 1000 tokens'));
  render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.type(screen.getByPlaceholderText('e.g. Goblin Scout, Party Wizard…'), 'Goblin');
  await userEvent.click(screen.getByRole('button', { name: 'Place on Map' }));
  expect(await screen.findByText('A map can hold at most 1000 tokens')).toBeInTheDocument();
});

it.each([
  ['hiding a token', 'Hide from players'],
  ['obscuring a token', 'Obscure identity'],
  ['sending a token to the spirit realm', 'Send to Spirit Realm'],
])('says why %s was refused', async (_action, title) => {
  api.updateToken.mockRejectedValue(refusal('Too many requests, please slow down'));
  render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.click(screen.getByTitle(title));
  expect(await screen.findByText('Too many requests, please slow down')).toBeInTheDocument();
});

it('says why removing a token was refused', async () => {
  api.deleteToken.mockRejectedValue(refusal('Token not found'));
  render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));
  await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));
  expect(await screen.findByText('Token not found')).toBeInTheDocument();
});

it('says why a picture was refused', async () => {
  api.uploadAsset.mockRejectedValue(refusal('That file is not a PNG, JPEG, WebP or GIF picture'));
  const { container } = render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.upload(container.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'goblin.png', { type: 'image/png' }));
  expect(await screen.findByText('That file is not a PNG, JPEG, WebP or GIF picture')).toBeInTheDocument();
});
