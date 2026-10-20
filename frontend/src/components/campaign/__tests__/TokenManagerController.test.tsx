/**
 * The Token Manager says when a token's controller is no longer a player.
 *
 * A token keeps naming whoever controlled it after they leave the campaign or
 * become a spectator, and they can no longer move it. The list showed such a
 * token with a "Player" chip, as if someone still moved it. It now names the
 * controller only while they are a player, and otherwise says they are not.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    useReducedMotionConfig: () => false,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'campaign-1',
      memberships: [
        { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
        { userId: 'wes', role: 'SPECTATOR', user: { displayName: 'Wes' } },
      ],
      maps: [{ id: 'map-1', name: 'Cave' }],
    },
    currentMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({ listAssets: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

/** The token's own row in the list, apart from the add form above it. */
const row = () => within(screen.getByText('Goblin Boss').closest('.glass-panel') as HTMLElement);

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
});

it('names a controller who is a player', () => {
  useGameStore.getState().setTokens([{ ...goblin, controlledBy: 'pia' }]);
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(row().getByText('Pia')).toBeInTheDocument();
});

it.each([
  ['a spectator', 'wes', 'Wes, not a player'],
  ['someone who left', 'gone', 'Former member, not a player'],
])('says the controller is no longer a player when they are %s', (_who, id, chip) => {
  useGameStore.getState().setTokens([{ ...goblin, controlledBy: id }]);
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(row().getByText(chip)).toBeInTheDocument();
  expect(row().queryByText('Player')).not.toBeInTheDocument();
});

it('is announced by name, and Escape and its Close button close it', async () => {
  const onClose = vi.fn();
  render(<TokenManager isOpen onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: 'Token Manager' });

  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(2);
});
