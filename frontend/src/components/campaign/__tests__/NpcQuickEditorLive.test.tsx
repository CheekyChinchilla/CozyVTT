/**
 * Edit Token shows the token as the table holds it.
 *
 * The editor copied the token when it opened and kept the copy, so a change
 * made while it was open (from another tab, a script, or a player on a token
 * they control) did not show, and the editor's next save put the copy's
 * values back over it: a condition the player added was lost when the DM
 * ticked another. The editor now reads the token from the table, and the
 * DM's own change is shown in its place only until it is saved. Typed text is
 * the exception: what the DM is typing stays in the box until it is saved.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { waitForDialogFocus } from '@/test/dialogFocus';
import userEvent from '@testing-library/user-event';
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
    useIsPresent: () => true,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'campaign-1', memberships: [], gameSystem: 'DND_5E' }, currentMap: { id: 'map-1', feetPerSquare: 5 } }),
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
  type: TokenType.NPC, disposition: null, hp: { current: 9, max: 9, temp: 0 }, showHpBar: false, notes: '', initiative: null, obscured: false,
};

function open(token: Token = cultist) {
  useGameStore.getState().setTokens([token]);
  render(<NpcQuickEditor token={token} campaignId="campaign-1" mapId="map-1" onClose={() => {}} onTokenUpdate={(t) => useGameStore.getState().replaceToken(t)} />);
}

/** A change to the token made somewhere else, reaching the table. */
const changedElsewhere = (changes: Partial<Token>) => act(() => { useGameStore.getState().patchToken('cultist', changes); });

const lastSent = () => updateToken.mock.calls[updateToken.mock.calls.length - 1]?.[3];

beforeEach(() => {
  updateToken.mockReset();
  updateToken.mockImplementation((_c: string, _m: string, _id: string, changes: Partial<Token>) =>
    Promise.resolve({ token: { ...useGameStore.getState().tokens['cultist'], ...changes } }));
  useGameStore.getState().clearGameState();
});

// The name box had no label; a screen reader read only its value.
it('labels the token name box', () => {
  open();
  expect(screen.getByRole('textbox', { name: 'Token name' })).toHaveValue('Cultist');
});

it('shows a condition added elsewhere, and keeps it when the DM adds another', async () => {
  open();
  changedElsewhere({ conditions: ['Prone'] });
  // Listed, and above the list as a condition the token has.
  expect(screen.getAllByRole('button', { name: /^Prone/ })).toHaveLength(2);

  fireEvent.click(screen.getByRole('button', { name: 'Grappled' }));
  await waitFor(() => expect(lastSent()).toEqual({ conditions: ['Prone', 'Grappled'] }));
});

it('takes damage from the hit points the table has', async () => {
  open();
  changedElsewhere({ hp: { current: 5, max: 9, temp: 0 } });
  expect(screen.getByText('5 / 9')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '-1' }));
  await waitFor(() => expect(lastSent()).toEqual({ hp: { current: 4, max: 9, temp: 0 } }));
  expect(await screen.findByText('4 / 9')).toBeInTheDocument();
});

it('shows a quick change at once, and the table\'s value again when it is refused', async () => {
  let refuse: (reason: unknown) => void = () => {};
  updateToken.mockReturnValue(new Promise((_resolve, reject) => { refuse = reject; }));
  open();
  fireEvent.click(screen.getByRole('button', { name: '-1' }));
  expect(screen.getByText('8 / 9')).toBeInTheDocument();

  await act(async () => { refuse({ response: { status: 429, data: { message: 'Too many requests, please slow down' } } }); });
  expect(screen.getByText('9 / 9')).toBeInTheDocument();
});

it('shows a rename made elsewhere', () => {
  open();
  changedElsewhere({ name: 'Cult Leader' });
  expect(screen.getByDisplayValue('Cult Leader')).toBeInTheDocument();
});

it('keeps what the DM is typing over a change made elsewhere, until it is saved', async () => {
  open();
  await waitForDialogFocus();
  const notes = screen.getByPlaceholderText('Guard post, special abilities, loot…');
  await userEvent.type(notes, 'Carries the key');
  changedElsewhere({ notes: 'Written in another tab' });
  expect(notes).toHaveValue('Carries the key');

  fireEvent.blur(notes);
  await waitFor(() => expect(lastSent()).toEqual({ notes: 'Carries the key' }));
  expect(notes).toHaveValue('Carries the key');
  changedElsewhere({ notes: 'Changed again' });
  expect(notes).toHaveValue('Changed again');
});

it('keeps showing the newest quick change while an older one is still answered', async () => {
  const answers: Array<() => void> = [];
  updateToken.mockImplementation((_c: string, _m: string, _id: string, changes: Partial<Token>) =>
    new Promise((resolve) => answers.push(() => resolve({ token: { ...useGameStore.getState().tokens['cultist'], ...changes } }))));
  open();
  fireEvent.click(screen.getByRole('button', { name: '-1' }));
  fireEvent.click(screen.getByRole('button', { name: '-1' }));
  expect(screen.getByText('7 / 9')).toBeInTheDocument();

  // The first save is answered while the second is still on its way.
  await act(async () => { answers[0](); });
  expect(screen.getByText('7 / 9')).toBeInTheDocument();
  await act(async () => { answers[1](); });
  expect(screen.getByText('7 / 9')).toBeInTheDocument();
});

// Create Blank showed the new stat block for editing at once, then put the
// table's copy back when the server answered, dropping anything typed into it
// meanwhile; the next key then started again from the blank block.
it('keeps what is typed into a new stat block while it is being created', async () => {
  let created: () => void = () => {};
  updateToken.mockImplementationOnce((_c: string, _m: string, _id: string, changes: Partial<Token>) =>
    new Promise((resolve) => { created = () => resolve({ token: { ...useGameStore.getState().tokens['cultist'], ...changes } }); }));
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Add Stat Block' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create Blank' }));
  const speed = await screen.findByPlaceholderText('30 ft., fly 60 ft.');
  fireEvent.change(speed, { target: { value: '40 ft.' } });

  await act(async () => { created(); });
  expect(screen.getByPlaceholderText('30 ft., fly 60 ft.')).toHaveValue('40 ft.');
});

// A field saves when it is left. Escape closes the editor straight from the
// field, and the page then removes the editor, which leaves no field behind
// to be left; so what was typed was lost.
it('saves what is typed in a field when Escape closes the editor', async () => {
  function Page() {
    const [shown, setShown] = useState(true);
    return shown ? (
      <NpcQuickEditor token={cultist} campaignId="campaign-1" mapId="map-1" onClose={() => setShown(false)} onTokenUpdate={() => {}} />
    ) : null;
  }
  useGameStore.getState().setTokens([cultist]);
  render(<Page />);
  await waitForDialogFocus();
  const notes = screen.getByPlaceholderText('Guard post, special abilities, loot…');
  await userEvent.type(notes, 'Carries the key');

  fireEvent.keyDown(notes, { key: 'Escape' });

  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(lastSent()).toEqual({ notes: 'Carries the key' }));
});

// Which way the token faces (#89): whole degrees, a full turn wraps, and a
// turn made on the map while the editor is open shows in the box.
it('sets the facing in whole degrees', async () => {
  open();
  const box = screen.getByRole('spinbutton', { name: 'Facing in degrees clockwise' });
  fireEvent.change(box, { target: { value: '90' } });
  fireEvent.blur(box);
  await waitFor(() => expect(lastSent()).toEqual({ rotation: 90 }));
});

it('wraps a facing of a full turn or more', async () => {
  open();
  const box = screen.getByRole('spinbutton', { name: 'Facing in degrees clockwise' });
  fireEvent.change(box, { target: { value: '405' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() => expect(lastSent()).toEqual({ rotation: 45 }));
  expect(box).toHaveValue(45);
});

it('shows a turn made on the map while it is open', () => {
  open();
  changedElsewhere({ rotation: 135 });
  expect(screen.getByRole('spinbutton', { name: 'Facing in degrees clockwise' })).toHaveValue(135);
});
