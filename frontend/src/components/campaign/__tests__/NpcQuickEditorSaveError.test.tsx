/**
 * The quick editor says so when the server refuses a change.
 *
 * Every edit in it goes through one save helper, whose failure only reached
 * the console. Since token fields are checked before they are stored, a
 * token from an earlier release can hold notes longer than the server now
 * accepts; adding a line to them was refused, the text stayed in the box
 * as if saved, and it was gone the next time the editor opened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const showToast = vi.fn();
const updateToken = vi.fn();

// One stand-in per tag, kept: a new component on every access would remount
// the editor on each render and throw its local state away.
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
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: 'Guards the bridge', initiative: null, obscured: false,
};

beforeEach(() => {
  showToast.mockClear();
  updateToken.mockReset();
});

describe('a change the server refuses', () => {
  it('is reported with the server\'s reason', async () => {
    updateToken.mockRejectedValue({ response: { status: 400, data: { message: 'Invalid token notes: Too big: expected string to have <=5000 characters' } } });
    render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);

    const notes = screen.getByPlaceholderText(/Guard post/);
    fireEvent.change(notes, { target: { value: 'Guards the bridge. Owes the ferryman.' } });
    fireEvent.blur(notes);

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/Invalid token notes/), 'error'));
  });

  it('is not reported when the save succeeds', async () => {
    updateToken.mockResolvedValue({ token: { ...goblin, notes: 'Guards the bridge. Owes the ferryman.' } });
    render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={() => {}} />);

    const notes = screen.getByPlaceholderText(/Guard post/);
    fireEvent.change(notes, { target: { value: 'Guards the bridge. Owes the ferryman.' } });
    fireEvent.blur(notes);

    await waitFor(() => expect(updateToken).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalled();
  });
});
