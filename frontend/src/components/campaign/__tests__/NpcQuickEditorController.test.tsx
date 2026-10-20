/**
 * Edit Token's Controlled By says when the controller is no longer a player.
 *
 * Only players were listed, so a token still naming a spectator or someone
 * who left had no entry: the box showed the first option, Nobody, and the
 * hint still said "This player can move the token on the map." The box now
 * shows that controller, marked as no longer a player and not to be chosen
 * again, and the hint says they cannot move the token.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const updateToken = vi.fn();

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
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'campaign-1', gameSystem: null,
      memberships: [
        { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
        { userId: 'wes', role: 'SPECTATOR', user: { displayName: 'Wes' } },
      ],
    },
    currentMap: { id: 'map-1', feetPerSquare: 5 },
  }),
}));
vi.mock('@/services/api', () => {
  const client = { updateToken: (...args: unknown[]) => updateToken(...args), listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const cultist: Token = {
  id: 'cultist', name: 'Cultist', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: { current: 7, max: 7, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

function open(controlledBy: string | null) {
  const token = { ...cultist, controlledBy };
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);
}

const controller = () => screen.getByRole('combobox', { name: 'Controlled By' }) as HTMLSelectElement;

beforeEach(() => {
  updateToken.mockReset();
  useGameStore.getState().clearGameState();
});

it('shows a player controller as able to move the token', () => {
  open('pia');
  expect(controller().value).toBe('pia');
  expect(screen.getByText('This player can move the token on the map.')).toBeInTheDocument();
});

it.each([
  ['a spectator', 'wes', 'Wes (no longer a player)'],
  ['someone who left', 'gone', 'A former member (no longer a player)'],
])('shows a controller who is %s, unable to move it', (_who, id, label) => {
  open(id);
  expect(controller().value).toBe(id);
  const option = Array.from(controller().options).find((o) => o.value === id)!;
  expect(option.text).toBe(label);
  expect(option.disabled).toBe(true);
  expect(screen.queryByText('This player can move the token on the map.')).not.toBeInTheDocument();
  expect(screen.getByText(/no longer a player here, so they cannot move the token/)).toBeInTheDocument();
});
