/**
 * A token's conditions are the campaign's game system's, and any the DM types.
 *
 * The token editor offered the fifteen D&D 5e conditions in every system, so a
 * Call of Cthulhu Keeper was offered Grappled and Exhausted and not Major
 * Wound, and nothing else could be added at all: not "Frightened 2" in
 * Pathfinder, nor "Blessed" anywhere. It now offers the D&D list in D&D 5e,
 * Call of Cthulhu's five in Call of Cthulhu, and in every system a box for a
 * condition of the DM's own, which stops where the server's limit is.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { waitForDialogFocus } from '@/test/dialogFocus';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';
import { TOKEN_LIMITS } from '@/constants/tokenLimits';

const updateToken = vi.fn();
const campaign = vi.hoisted(() => ({ gameSystem: 'DND_5E' as string | null }));

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
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [], gameSystem: campaign.gameSystem }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
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

function open(token: Token = cultist) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={(t) => useGameStore.getState().replaceToken(t)} />);
}

/** What the last save sent as the token's conditions. */
const sentConditions = () => updateToken.mock.calls[updateToken.mock.calls.length - 1]?.[3]?.conditions;

beforeEach(() => {
  updateToken.mockReset();
  updateToken.mockImplementation((_c: string, _m: string, _id: string, changes: Partial<Token>) => Promise.resolve({ token: { ...cultist, ...changes } }));
  useGameStore.getState().clearGameState();
});

it('offers the D&D 5e conditions in a D&D 5e campaign', () => {
  campaign.gameSystem = 'DND_5E';
  open();
  expect(screen.getByRole('button', { name: 'Grappled' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Major Wound' })).not.toBeInTheDocument();
});

it('offers Call of Cthulhu\'s five in a Call of Cthulhu campaign', () => {
  campaign.gameSystem = 'CALL_OF_CTHULHU_7E';
  open();
  for (const name of ['Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity', 'Indefinite Insanity']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.queryByRole('button', { name: 'Grappled' })).not.toBeInTheDocument();
});

it.each(['PATHFINDER_2E', null])('offers no list, and a box for any condition, in %s', async (system) => {
  campaign.gameSystem = system;
  open();
  await waitForDialogFocus();
  expect(screen.queryByRole('button', { name: 'Grappled' })).not.toBeInTheDocument();
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  expect((box as HTMLInputElement).maxLength).toBe(TOKEN_LIMITS.maxConditionLength);

  await userEvent.type(box, '  Frightened 2  {Enter}');
  await waitFor(() => expect(sentConditions()).toEqual(['Frightened 2']));
  expect(await screen.findByRole('button', { name: /Frightened 2/ })).toBeInTheDocument();
  expect((box as HTMLInputElement).value).toBe('');
});

it('adds a typed condition with the Add button too, in any system', async () => {
  campaign.gameSystem = 'DND_5E';
  open();
  await waitForDialogFocus();
  await userEvent.type(screen.getByRole('textbox', { name: 'Add a condition' }), 'Blessed');
  await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
  await waitFor(() => expect(sentConditions()).toEqual(['Blessed']));
});

it('takes the listed spelling of a listed condition, and adds nothing twice', async () => {
  campaign.gameSystem = 'DND_5E';
  open({ ...cultist, conditions: ['Prone'] });
  await waitForDialogFocus();
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  await userEvent.type(box, 'grappled{Enter}');
  await waitFor(() => expect(sentConditions()).toEqual(['Prone', 'Grappled']));

  updateToken.mockClear();
  await userEvent.type(box, 'PRONE{Enter}');
  expect(updateToken).not.toHaveBeenCalled();
});

it('stops adding at the most conditions a token may carry', () => {
  campaign.gameSystem = null;
  const full = Array.from({ length: TOKEN_LIMITS.maxConditions }, (_, i) => `Mark ${i}`);
  open({ ...cultist, conditions: full });
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  fireEvent.change(box, { target: { value: 'One more' } });
  expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
});
