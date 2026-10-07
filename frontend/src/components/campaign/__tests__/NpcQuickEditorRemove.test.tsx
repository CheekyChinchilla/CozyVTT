/**
 * Removing a token from the quick editor asks first.
 *
 * Remove sat beside "Hide from Players" and "Obscure Identity" and deleted the
 * token on one click, closing the editor with nothing to undo it. It now opens a
 * confirmation naming the token, and a refusal is reported rather than logged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const showToast = vi.fn();
const onClose = vi.fn();
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
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { emitMapChange } }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [] }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
}));
const api = vi.hoisted(() => ({
  deleteToken: vi.fn(),
  updateToken: vi.fn(),
  listAssets: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

import NpcQuickEditor from '../NpcQuickEditor';

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

function renderEditor() {
  return render(<NpcQuickEditor token={goblin} campaignId="campaign-1" mapId="map-1" onClose={onClose} onTokenUpdate={() => {}} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteToken.mockResolvedValue({ message: 'ok' });
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
});

describe('Remove in the quick editor', () => {
  it('asks first, naming the token, and Cancel keeps it and the editor open', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remove token' });
    expect(dialog).toHaveTextContent('Goblin Boss');
    expect(api.deleteToken).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.deleteToken).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('removes the token and closes the editor once confirmed', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(api.deleteToken).toHaveBeenCalledWith('campaign-1', 'map-1', 'goblin'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(emitMapChange).toHaveBeenCalledWith('map-1');
  });

  it('says so when the server refuses', async () => {
    api.deleteToken.mockRejectedValue({ response: { status: 403, data: { message: 'Only the DM can remove tokens' } } });
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Only the DM can remove tokens', 'error'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
