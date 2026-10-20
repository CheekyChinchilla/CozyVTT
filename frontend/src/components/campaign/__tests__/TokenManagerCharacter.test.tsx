/**
 * A Player token from the Token Manager stands for a character.
 *
 * The Player type said "Player tokens link to a character sheet" and then
 * created a token linked to nothing: it opened no sheet and rolled no
 * character's numbers. The Player type now has a Character picker, listing
 * the campaign's characters by name and owner. Picking one names the token
 * after it when the name is empty, gives it to its owner when they are a
 * player, uses the character's token picture when no image is chosen, and
 * links the token to the character.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { waitForDialogFocus } from '@/test/dialogFocus';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenType } from '@/types';
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
const characters = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: {
      id: 'campaign-1',
      memberships: [
        { userId: 'dm', role: 'DM', user: { displayName: 'Dee' } },
        { userId: 'pia', role: 'PLAYER', user: { displayName: 'Pia' } },
      ],
      maps: [{ id: 'map-1', name: 'Cave' }],
      characters: characters.list,
    },
    currentMap: { id: 'map-1', width: 20, height: 20 },
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/components/assets/AssetGrid', () => ({ default: () => null }));

const api = vi.hoisted(() => ({ addToken: vi.fn(), listAssets: vi.fn() }));
vi.mock('@/services/api', () => ({ api, default: api }));

import TokenManager from '../TokenManager';

const aldra = { id: 'char-aldra', userId: 'pia', name: 'Aldra', tokenImageUrl: '/api/assets/tokens/aldra' };
const npcOfDms = { id: 'char-mayor', userId: 'dm', name: 'The Mayor', tokenImageUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  characters.list = [aldra, npcOfDms];
  api.listAssets.mockResolvedValue({ assets: [], pagination: {} });
  api.addToken.mockImplementation((_c: string, _m: string, payload: Partial<Token>) => Promise.resolve({ token: { id: 'new', ...payload } }));
  useGameStore.getState().setTokens([]);
});

async function choosePlayer() {
  render(<TokenManager isOpen onClose={() => {}} />);
  await waitForDialogFocus();
  await userEvent.click(screen.getByRole('button', { name: 'Player' }));
}

const sent = () => api.addToken.mock.calls[0][2];

it('links a Player token to the character picked, named after it and controlled by its owner', async () => {
  await choosePlayer();
  await userEvent.selectOptions(screen.getByLabelText('Character'), 'char-aldra');
  expect(screen.getByPlaceholderText('e.g. Goblin Scout, Party Wizard…')).toHaveValue('Aldra');
  expect(screen.getByLabelText('Controlled by')).toHaveValue('pia');

  await userEvent.click(screen.getByRole('button', { name: 'Place on Map' }));
  await waitFor(() => expect(api.addToken).toHaveBeenCalled());
  expect(sent()).toMatchObject({ type: TokenType.PLAYER, characterId: 'char-aldra', name: 'Aldra', controlledBy: 'pia', imageUrl: '/api/assets/tokens/aldra' });
});

it('names each character with its owner', async () => {
  await choosePlayer();
  const options = Array.from((screen.getByLabelText('Character') as HTMLSelectElement).options).map((o) => o.text);
  expect(options).toEqual(['No character', 'Aldra (Pia)', 'The Mayor (Dee)']);
});

it('keeps a name already typed, and leaves a DM\'s character with nobody controlling it', async () => {
  await choosePlayer();
  await userEvent.type(screen.getByPlaceholderText('e.g. Goblin Scout, Party Wizard…'), 'Mayor Hollis');
  await userEvent.selectOptions(screen.getByLabelText('Character'), 'char-mayor');
  await userEvent.click(screen.getByRole('button', { name: 'Place on Map' }));

  await waitFor(() => expect(api.addToken).toHaveBeenCalled());
  expect(sent()).toMatchObject({ characterId: 'char-mayor', name: 'Mayor Hollis', controlledBy: null, imageUrl: '' });
});

it('sends no character for an NPC token', async () => {
  await choosePlayer();
  await userEvent.selectOptions(screen.getByLabelText('Character'), 'char-aldra');
  await userEvent.click(screen.getByRole('button', { name: 'NPC / Creature' }));
  await userEvent.click(screen.getByRole('button', { name: 'Place on Map' }));

  await waitFor(() => expect(api.addToken).toHaveBeenCalled());
  expect(sent().characterId).toBeUndefined();
});

it('says so when the campaign has no characters', async () => {
  characters.list = [];
  await choosePlayer();
  expect(screen.queryByLabelText('Character')).not.toBeInTheDocument();
  expect(screen.getByText(/No characters are in this campaign yet/)).toBeInTheDocument();
});
