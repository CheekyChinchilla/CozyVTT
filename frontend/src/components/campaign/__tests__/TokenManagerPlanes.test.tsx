/**
 * An object stays on the material plane, as the map's right-click menu keeps it.
 *
 * The Token Manager offered Send to Spirit Realm for every token, objects
 * included, though objects do not cross the planes anywhere else. An object
 * is now offered the switch only when it is already on the spirit layer (from
 * an older version or an import), and then only to bring it back.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const api = vi.hoisted(() => ({ updateToken: vi.fn(), listAssets: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

const chest: Token = { ...goblin, id: 'chest', name: 'Chest', type: TokenType.OBJECT };

beforeEach(() => {
  vi.clearAllMocks();
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  api.updateToken.mockResolvedValue({ token: {} });
});

it('offers an object no way into the spirit realm', () => {
  useGameStore.getState().setTokens([chest]);
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(screen.queryByTitle('Send to Spirit Realm')).not.toBeInTheDocument();
});

it('brings an object already on the spirit layer back', async () => {
  useGameStore.getState().setTokens([{ ...chest, layer: TokenLayer.SPIRIT }]);
  render(<TokenManager isOpen onClose={() => {}} />);
  await userEvent.click(screen.getByTitle('Return to Material Plane'));
  expect(api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-1', 'chest', { layer: TokenLayer.TOKEN });
});

it('still sends a creature to the spirit realm', () => {
  useGameStore.getState().setTokens([goblin]);
  render(<TokenManager isOpen onClose={() => {}} />);
  expect(screen.getByTitle('Send to Spirit Realm')).toBeInTheDocument();
});
