/**
 * A token's conditions are the campaign's game system's, and any the GM types.
 *
 * The token editor offered the fifteen 5E conditions in every system, so a
 * Horror d100 GM was offered Grappled and Exhausted and not Major
 * Wound, and nothing else could be added at all: not "Frightened 2" in
 * Fantasy d20, nor "Blessed" anywhere. It now offers the 5E list in 5E,
 * Horror d100's four in Horror d100, and in every system a box for a
 * condition of the GM's own, which stops where the server's limit is.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { waitForDialogFocus } from '@/test/dialogFocus';
import userEvent from '@testing-library/user-event';
import type { Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';
import { useGameStore } from '@/stores/gameStore';
import { TOKEN_LIMITS } from '@/constants/tokenLimits';
import { FIFTH_EDITION_CONDITIONS, FIFTH_EDITION_EFFECTS } from '@/utils/conditions';

const updateToken = vi.fn();
const campaign = vi.hoisted(() => ({ gameSystem: 'FIFTH_EDITION' as string | null }));

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
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [], gameSystem: campaign.gameSystem }, currentMap: { id: 'map-1', feetPerSquare: 5 }, viewedMap: { id: 'map-1', feetPerSquare: 5 } }),
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

it('offers the 5E conditions in a 5E campaign', () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open();
  expect(screen.getByRole('button', { name: 'Grappled' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Major Wound' })).not.toBeInTheDocument();
});

it('offers Horror d100\'s four in a Horror d100 campaign', () => {
  campaign.gameSystem = 'HORROR_D100';
  open();
  for (const name of ['Major Wound', 'Dying', 'Unconscious', 'Temporary Insanity']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.queryByRole('button', { name: 'Grappled' })).not.toBeInTheDocument();
});

it.each(['FANTASY_D20', null])('offers no list, and a box for any condition, in %s', async (system) => {
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
  campaign.gameSystem = 'FIFTH_EDITION';
  open();
  await waitForDialogFocus();
  await userEvent.type(screen.getByRole('textbox', { name: 'Add a condition' }), 'Blessed');
  await userEvent.click(screen.getByRole('button', { name: 'Add condition' }));
  await waitFor(() => expect(sentConditions()).toEqual(['Blessed']));
});

it('takes the listed spelling of a listed condition, and adds nothing twice', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open({ ...cultist, conditions: ['Prone'] });
  await waitForDialogFocus();
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  await userEvent.type(box, 'grappled{Enter}');
  await waitFor(() => expect(sentConditions()).toEqual(['Prone', 'Grappled']));

  updateToken.mockClear();
  await userEvent.type(box, 'PRONE{Enter}');
  expect(updateToken).not.toHaveBeenCalled();
});

const fullNote = `A token carries at most ${TOKEN_LIMITS.maxConditions} conditions and effects. Take one off to add another.`;

it('stops adding at the most conditions a token may carry, and says why', () => {
  campaign.gameSystem = null;
  const full = Array.from({ length: TOKEN_LIMITS.maxConditions }, (_, i) => `Mark ${i}`);
  open({ ...cultist, conditions: full });
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  fireEvent.change(box, { target: { value: 'One more' } });
  const add = screen.getByRole('button', { name: 'Add condition' });
  expect(add).toBeDisabled();
  expect(add).toHaveAccessibleDescription(fullNote);
  expect(screen.getByText(fullNote)).toBeVisible();
});

it('says the token is full in a live region that is there before it fills', async () => {
  // A screen reader may not read out a live region that arrives with its
  // words already in it.
  campaign.gameSystem = 'FIFTH_EDITION';
  open({ ...cultist, conditions: Array.from({ length: TOKEN_LIMITS.maxConditions - 1 }, (_, i) => `Mark ${i}`) });
  const live = screen.getByRole('status');
  expect(live).toBeEmptyDOMElement();

  await userEvent.click(within(screen.getByRole('group', { name: 'Conditions' })).getByRole('button', { name: 'Grappled' }));
  await waitFor(() => expect(live).toHaveTextContent(fullNote));
  expect(screen.getByRole('status')).toBe(live);
});

it('turns off the listed conditions and effects a full token does not carry, and keeps the ones it does', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  const full = ['Prone', 'Hasted', ...Array.from({ length: TOKEN_LIMITS.maxConditions - 2 }, (_, i) => `Mark ${i}`)];
  open({ ...cultist, conditions: full });
  const conditions = screen.getByRole('group', { name: 'Conditions' });
  const effects = screen.getByRole('group', { name: 'Effects' });
  const grappled = within(conditions).getByRole('button', { name: 'Grappled' });
  const blessed = within(effects).getByRole('button', { name: 'Blessed' });
  for (const unlit of [grappled, blessed]) {
    expect(unlit).toBeDisabled();
    expect(unlit).toHaveAccessibleDescription(fullNote);
  }
  expect(screen.getByText(fullNote)).toBeVisible();
  fireEvent.click(grappled);
  expect(updateToken).not.toHaveBeenCalled();

  // One it carries still comes off, and then the rest come back.
  expect(within(effects).getByRole('button', { name: 'Hasted' })).toBeEnabled();
  await userEvent.click(within(conditions).getByRole('button', { name: 'Prone' }));
  await waitFor(() => expect(sentConditions()).toEqual(full.slice(1)));
  await waitFor(() => expect(grappled).toBeEnabled());
  expect(screen.queryByText(fullNote)).not.toBeInTheDocument();
});

it('offers the 5E effects in a group of their own under the conditions', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open();
  const conditions = screen.getByRole('group', { name: 'Conditions' });
  const effects = screen.getByRole('group', { name: 'Effects' });
  expect(within(conditions).getAllByRole('button').map((b) => b.textContent)).toEqual([...FIFTH_EDITION_CONDITIONS]);
  expect(within(effects).getAllByRole('button').map((b) => b.textContent)).toEqual([...FIFTH_EDITION_EFFECTS]);
  expect(conditions.compareDocumentPosition(effects) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  await userEvent.click(within(effects).getByRole('button', { name: 'Hasted' }));
  await waitFor(() => expect(sentConditions()).toEqual(['Hasted']));
});

it("takes an effect's listed spelling when it is typed, and a typed effect of the GM's own still works", async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open();
  await waitForDialogFocus();
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  await userEvent.type(box, "hunter's mark{Enter}");
  await waitFor(() => expect(sentConditions()).toEqual(["Hunter's Mark"]));
  await userEvent.type(box, 'Sanctuary{Enter}');
  await waitFor(() => expect(sentConditions()).toEqual(["Hunter's Mark", 'Sanctuary']));
});

it.each(['HORROR_D100', 'FANTASY_D20', null])('offers no effects in %s', (system) => {
  campaign.gameSystem = system;
  open();
  expect(screen.queryByRole('group', { name: 'Effects' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Hasted' })).not.toBeInTheDocument();
});

it('lights a listed effect the token carries in another spelling, and takes every spelling of it off', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open({ ...cultist, conditions: ['hunter\u2019s mark', 'Prone'] });
  const effects = screen.getByRole('group', { name: 'Effects' });
  const mark = within(effects).getByRole('button', { name: "Hunter's Mark" });
  expect(mark).toHaveAttribute('aria-pressed', 'true');
  expect(within(effects).getByRole('button', { name: 'Hasted' })).toHaveAttribute('aria-pressed', 'false');

  await userEvent.click(mark);
  await waitFor(() => expect(sentConditions()).toEqual(['Prone']));
});

// Hexed was offered until 1.7.0.
it('shows an effect the list no longer offers on a token that carries it, and takes it off', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open({ ...cultist, conditions: ['Hexed', 'Prone'] });
  expect(within(screen.getByRole('group', { name: 'Effects' })).queryByRole('button', { name: 'Hexed' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^Hexed/ }));
  await waitFor(() => expect(sentConditions()).toEqual(['Prone']));
});

it('adds nothing when the token carries a typed effect already, in other capitals or with a curly apostrophe', async () => {
  campaign.gameSystem = 'FIFTH_EDITION';
  open({ ...cultist, conditions: ['HASTED'] });
  await waitForDialogFocus();
  expect(within(screen.getByRole('group', { name: 'Effects' })).getByRole('button', { name: 'Hasted' })).toHaveAttribute('aria-pressed', 'true');
  const box = screen.getByRole('textbox', { name: 'Add a condition' });
  await userEvent.type(box, 'hasted{Enter}');
  expect(updateToken).not.toHaveBeenCalled();

  await userEvent.type(box, 'Hunter\u2019s Mark{Enter}');
  await waitFor(() => expect(sentConditions()).toEqual(['HASTED', "Hunter's Mark"]));
});
