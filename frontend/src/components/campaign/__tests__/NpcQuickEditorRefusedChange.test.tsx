/**
 * A change the server refuses is not shown as made.
 *
 * Every control set its own state first and saved afterwards, and nothing put
 * it back when the save failed (a lost connection, a rate limit, an expired
 * sign-in). Hide from Players then read Show to Players while every player
 * could still see the token. Hide and Obscure now show the token as the
 * table holds it, and every other quick control goes back to what it was
 * when its save fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Token } from '@/types';
import { TokenLayer, TokenType, TokenDisposition } from '@/types';
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
  type: TokenType.NPC, disposition: null, hp: { current: 7, max: 7, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

const refused = { response: { status: 429, data: { message: 'Too many requests, please slow down' } } };

function open(token: Token = goblin) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={(t) => useGameStore.getState().replaceToken(t)} />);
}

beforeEach(() => {
  showToast.mockClear();
  updateToken.mockReset();
  useGameStore.getState().clearGameState();
});

describe('Hide from Players', () => {
  it('still offers to hide the token when hiding it was refused', async () => {
    updateToken.mockRejectedValue(refused);
    open();
    fireEvent.click(screen.getByRole('button', { name: /Hide from Players/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Too many requests, please slow down', 'error'));
    expect(screen.getByRole('button', { name: /Hide from Players/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show to Players/ })).not.toBeInTheDocument();
  });

  it('shows the token hidden once the save goes through', async () => {
    updateToken.mockResolvedValue({ token: { ...goblin, visible: false } });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Hide from Players/ }));
    expect(await screen.findByRole('button', { name: /Show to Players/ })).toBeInTheDocument();
  });

  it('follows the token when it is hidden from elsewhere, such as the token menu', async () => {
    open();
    act(() => useGameStore.getState().patchToken('goblin', { visible: false }));
    expect(await screen.findByRole('button', { name: /Show to Players/ })).toBeInTheDocument();
  });
});

describe('Obscure Identity', () => {
  it('still offers to obscure the token when obscuring it was refused', async () => {
    updateToken.mockRejectedValue(refused);
    open();
    fireEvent.click(screen.getByRole('button', { name: /Obscure Identity/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Obscure Identity/ })).toBeInTheDocument();
  });
});

describe('the other quick controls', () => {
  it('put hit points back when the change was refused', async () => {
    updateToken.mockRejectedValue(refused);
    open();
    expect(screen.getByText('7 / 7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '-5' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(screen.getByText('7 / 7')).toBeInTheDocument();
  });

  it('put the disposition back when the change was refused', async () => {
    updateToken.mockRejectedValue(refused);
    open({ ...goblin, disposition: TokenDisposition.NEUTRAL });
    fireEvent.click(screen.getByRole('button', { name: /Hostile/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(updateToken).toHaveBeenCalledWith('campaign-1', 'map-1', 'goblin', { disposition: TokenDisposition.HOSTILE });
    expect(screen.getByRole('button', { name: /Hostile/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Neutral/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
