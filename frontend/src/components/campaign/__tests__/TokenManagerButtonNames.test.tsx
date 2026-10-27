/**
 * A Token Manager row's icon buttons are named as their tooltips are.
 *
 * Obscure, hide, the spirit realm and the move to another map showed only an
 * icon, with the name in a tooltip; Remove already had its own.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', memberships: [], maps: [{ id: 'map-1', name: 'Cave' }, { id: 'map-2', name: 'Keep' }] },
    currentMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({ updateToken: vi.fn(), listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) }));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

it("names a row's icon buttons as their tooltips do", () => {
  useGameStore.getState().setTokens([goblin]);
  render(<TokenManager isOpen onClose={() => {}} />);

  for (const title of ['Obscure identity', 'Hide from players', 'Send to Spirit Realm', 'Move to another map']) {
    expect(screen.getByTitle(title)).toHaveAttribute('aria-label', title);
  }
});

it('names them by what they would do now', () => {
  useGameStore.getState().setTokens([{ ...goblin, obscured: true, visible: false, layer: TokenLayer.SPIRIT }]);
  render(<TokenManager isOpen onClose={() => {}} />);

  for (const title of ['Reveal identity', 'Show to players', 'Return to Material Plane']) {
    expect(screen.getByTitle(title)).toHaveAttribute('aria-label', title);
  }
});
