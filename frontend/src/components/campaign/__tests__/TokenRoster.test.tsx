/**
 * The Token Roster's row actions.
 *
 * Remove deleted the token on one click, with no undo. It now asks first,
 * naming the token, and Cancel keeps it. The action strip used to be invisible
 * until the pointer was over the row, so keyboard focus landed on buttons nobody
 * could see, and a failed hide, reveal or removal went only to the console. The
 * strip now shows while a button in it has focus, and every failure is reported.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TokenRoster from '../TokenRoster';
import { useGameStore } from '@/stores/gameStore';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const showToast = vi.fn();
const emitMapChange = vi.fn();

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'campaign-1', memberships: [] },
    currentMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emitMapChange } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));

const api = vi.hoisted(() => ({ deleteToken: vi.fn(), updateToken: vi.fn(), addToken: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

const goblin: Token = {
  id: 'goblin', name: 'Goblin Boss', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteToken.mockResolvedValue({ message: 'ok' });
  api.updateToken.mockResolvedValue({ token: goblin });
  useGameStore.getState().setTokens([goblin]);
});

describe('removing a token from the roster', () => {
  it('asks first, naming the token, and Cancel keeps it', async () => {
    render(<TokenRoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remove token' });
    expect(dialog).toHaveTextContent('Goblin Boss');
    expect(api.deleteToken).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.deleteToken).not.toHaveBeenCalled();
    expect(useGameStore.getState().tokens['goblin']).toBeDefined();
  });

  it('removes the token once confirmed', async () => {
    render(<TokenRoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(api.deleteToken).toHaveBeenCalledWith('campaign-1', 'map-1', 'goblin'));
    await waitFor(() => expect(useGameStore.getState().tokens['goblin']).toBeUndefined());
    expect(emitMapChange).toHaveBeenCalledWith('map-1');
  });

  it('says so when the server refuses, and keeps the token', async () => {
    api.deleteToken.mockRejectedValue({ response: { status: 403, data: { message: 'Only the DM can remove tokens' } } });
    render(<TokenRoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Goblin Boss from map' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove token' })).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Only the DM can remove tokens', 'error'));
    expect(useGameStore.getState().tokens['goblin']).toBeDefined();
  });
});

describe('the roster row actions', () => {
  it('are shown while a button in the strip has keyboard focus, and on a screen with no hover', () => {
    render(<TokenRoster />);
    const strip = screen.getByRole('button', { name: 'Remove Goblin Boss from map' }).parentElement;
    expect(strip).not.toBeNull();
    const classes = (strip as HTMLElement).className.split(/\s+/);
    expect(classes).toContain('group-hover:opacity-100');
    expect(classes).toContain('focus-within:opacity-100');
    expect(classes).toContain('[@media(hover:none)]:opacity-100');
  });

  it('report a failed hide', async () => {
    api.updateToken.mockRejectedValue({ response: { status: 400, data: { message: 'Token could not be changed' } } });
    render(<TokenRoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide Goblin Boss from players' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Token could not be changed', 'error'));
  });

  it('report a failed identity change', async () => {
    api.updateToken.mockRejectedValue(new Error('network'));
    render(<TokenRoster />);
    await userEvent.click(screen.getByRole('button', { name: 'Obscure identity of Goblin Boss' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/identity/i), 'error'));
  });
});
