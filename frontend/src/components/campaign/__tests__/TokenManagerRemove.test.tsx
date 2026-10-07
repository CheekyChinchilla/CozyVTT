/**
 * Removing a token from the Token Manager asks first.
 *
 * The trash button deleted the token on one click, with no undo, beside the
 * hide and move buttons. It now opens a confirmation naming the token.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenManager from '../TokenManager';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const emitMapChange = vi.fn();

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
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange } }) }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({
  deleteToken: vi.fn(),
  listAssets: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  api.deleteToken.mockResolvedValue({ message: 'ok' });
  useGameStore.getState().setTokens([goblin]);
});

describe('removing a token in the Token Manager', () => {
  it('asks first, naming the token, and Cancel keeps it', async () => {
    render(<TokenManager isOpen onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remove token' });
    expect(dialog).toHaveTextContent('Goblin Boss');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.deleteToken).not.toHaveBeenCalled();
    expect(useGameStore.getState().tokens['goblin']).toBeDefined();
  });

  it('removes it once confirmed', async () => {
    render(<TokenManager isOpen onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(api.deleteToken).toHaveBeenCalledWith('campaign-1', 'map-1', 'goblin'));
    await waitFor(() => expect(useGameStore.getState().tokens['goblin']).toBeUndefined());
    expect(emitMapChange).toHaveBeenCalledWith('map-1');
  });
});
