/**
 * Damage in Edit Token takes a creature's temporary hit points first.
 *
 * A character's damage from the roster comes off temporary hit points first
 * and only the rest off current hit points, as D&D 5e and Pathfinder 2e say.
 * A creature's damage in Edit Token came straight off current hit points and
 * left the temporary ones where they were. It now follows the same rule, and
 * healing restores current hit points only.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const showToast = vi.fn();
const updateToken = vi.fn();

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
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange: vi.fn() } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [] }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
}));
vi.mock('@/services/api', () => {
  const client = { updateToken: (...args: unknown[]) => updateToken(...args), listAssets: vi.fn().mockResolvedValue({ assets: [], pagination: {} }) };
  return { api: client, default: client };
});
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const goblin: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: { current: 20, max: 30, temp: 8 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

function open(token: Token = goblin) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={(t) => useGameStore.getState().replaceToken(t)} />);
}

const sent = () => updateToken.mock.calls.map((call) => (call[3] as { hp?: unknown }).hp);

beforeEach(() => {
  showToast.mockClear();
  // The server answers with the token as changed, which the editor takes.
  let stored: Token = goblin;
  updateToken.mockReset().mockImplementation((_c: string, _m: string, _id: string, changes: Partial<Token>) => {
    stored = { ...stored, ...changes };
    return Promise.resolve({ token: stored });
  });
  useGameStore.getState().clearGameState();
});

it('takes damage off temporary hit points first, and drops them once spent', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: '-5' }));
  await waitFor(() => expect(sent()).toHaveLength(1));
  expect(sent()[0]).toEqual({ current: 20, max: 30, temp: 3 });

  fireEvent.click(screen.getByRole('button', { name: '-5' }));
  await waitFor(() => expect(sent()).toHaveLength(2));
  expect(sent()[1]).toEqual({ current: 18, max: 30, temp: 0 });
});

it('heals current hit points only', async () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: '+5' }));
  await waitFor(() => expect(sent()).toHaveLength(1));
  expect(sent()[0]).toEqual({ current: 25, max: 30, temp: 8 });
});
