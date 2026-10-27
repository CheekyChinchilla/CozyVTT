/**
 * The initiative tracker on a touch screen.
 *
 * A combatant's die and bin were 22 pixels square, at the end of a row that
 * also holds the grip, the picture, the name, the disposition and the value.
 * At the 44 a finger needs they do not fit beside all that in a 300-pixel
 * rail, so on a touch screen the row lets them go to a line of their own,
 * on the right. jsdom evaluates no media query, so the classes are what is
 * checked.
 *
 * A combatant's menu opened by a right-click only, and the DM's drag to
 * reorder began anywhere on the row, which on an iPad starts the system's
 * own drag at about the time a long-press would open the menu. On a touch
 * screen a long-press on the row now opens the menu a right-click opens, and
 * the row drags by its grip only; with a mouse the whole row drags as
 * before. A touch screen is a stubbed `matchMedia` answering
 * `(pointer: coarse)`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { contact } from '@/test/pointer';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

const seat = vi.hoisted(() => ({ role: 'DM' }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: seat.role, currentMap: { id: 'map-a' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
const emitInitiativeReorder = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn(), emitInitiativeReorder }, isConnected: true }),
}));
vi.mock('@/components/campaign/NpcRollPicker', () => ({
  default: ({ token }: { token: { id: string } }) => <div data-testid="creature-rolls">{token.id}</div>,
}));

const goblinToken: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};
const goblin: CombatantEntry = {
  tokenId: 'goblin', mapId: 'map-a', name: 'Goblin', imageUrl: '', initiative: 7, hp: null, type: 'npc', disposition: null,
};

const ogreToken: Token = { ...goblinToken, id: 'ogre', name: 'Ogre' };
const ogre: CombatantEntry = { ...goblin, tokenId: 'ogre', name: 'Ogre', initiative: 3 };

beforeEach(() => {
  seat.role = 'DM';
  emitInitiativeReorder.mockReset();
  useGameStore.getState().setTokens([goblinToken, ogreToken]);
  useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [goblin] });
});

const classesOf = (el: Element | null) => (el as HTMLElement).className.split(/\s+/);

it("makes a combatant's die and bin big enough for a finger, with their icons in the middle", () => {
  render(<InitiativeTracker />);

  for (const title of ['Roll initiative for this token', 'Remove from initiative']) {
    expect(classesOf(screen.getByTitle(title)))
      .toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  }
});

it('lets the die and bin go to a line of their own, on the right, when the row is too narrow', () => {
  render(<InitiativeTracker />);

  const actions = screen.getByTitle('Remove from initiative').parentElement;
  expect(classesOf(actions)).toContain('pointer-coarse:ml-auto');
  expect(classesOf(actions?.parentElement ?? null)).toContain('pointer-coarse:flex-wrap');
});

// A player's row has a die and no bin. The name, which takes what is left,
// counted as nothing when the row decided whether to wrap, so the die stayed
// beside it and squeezed it to 30 pixels or so. On a touch screen the name
// asks for 80 before the die goes to a line of its own.
it('keeps room for the name before the die and bin wrap', () => {
  render(<InitiativeTracker />);

  const name = screen.getByText('Goblin').closest('.flex-1');
  expect((name as HTMLElement).className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'pointer-coarse:basis-20']));
});

/** A primary pointer that is a finger, as on a phone or a tablet. */
function onATouchScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)', media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
}

const menuLabels = () => [...document.querySelectorAll<HTMLElement>('div.fixed.z-50 button')].map((b) => b.textContent);
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const at = (clientX: number, clientY: number) => ({ clientX, clientY });
const rowOf = (name: string) => screen.getByText(name).closest('[draggable]') as HTMLElement;
const gripOf = (name: string) => screen.getByRole('button', { name: `Move ${name}` });

describe("a combatant's row, pressed and held by a finger", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the menu a right-click opens, item for item', () => {
    render(<InitiativeTracker />);
    fireEvent.contextMenu(rowOf('Goblin'), at(40, 40));
    const byRightClick = menuLabels();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuLabels()).toEqual([]);

    const finger = contact('touch', 1);
    finger.down(screen.getByText('Goblin'), at(40, 40));
    wait(500);
    finger.up(rowOf('Goblin'), at(40, 40));

    expect(byRightClick).toEqual(['Roll...']);
    expect(menuLabels()).toEqual(byRightClick);
  });

  it('keeps the menu open through the mousedown the lift may bring', () => {
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);

    finger.down(rowOf('Goblin'), at(40, 40));
    wait(500);
    finger.up(rowOf('Goblin'), at(40, 40));
    fireEvent.mouseDown(rowOf('Goblin'));
    fireEvent.click(rowOf('Goblin'), { detail: 1 });

    expect(menuLabels()).toEqual(['Roll...']);
  });

  // A finger's long-press brings no mousedown, which is what closed the
  // first menu before a right-click opened the second.
  it('opens a second long-press on another row as a menu of its own, at that row, rolling for it', () => {
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [goblin, ogre] });
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);
    finger.down(rowOf('Goblin'), at(40, 40));
    wait(500);
    finger.up(rowOf('Goblin'), at(40, 40));
    wait(1500);

    const second = contact('touch', 2);
    second.down(rowOf('Ogre'), at(120, 200));
    wait(500);
    second.up(rowOf('Ogre'), at(120, 200));

    const menus = document.querySelectorAll<HTMLElement>('div.fixed.z-50');
    expect(menus).toHaveLength(1);
    expect({ left: menus[0]!.style.left, top: menus[0]!.style.top }).toEqual({ left: '120px', top: '200px' });
    fireEvent.click(screen.getByText('Roll...'));
    expect(screen.getByTestId('creature-rolls')).toHaveTextContent('ogre');
  });

  it("opens one menu when Android's own long-press comes before the timer", () => {
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);

    finger.down(rowOf('Goblin'), at(40, 40));
    wait(400);
    fireEvent.contextMenu(rowOf('Goblin'), at(40, 40));
    wait(600);

    expect(document.querySelectorAll('div.fixed.z-50')).toHaveLength(1);
  });

  it('opens nothing from the grip, which drags the row', () => {
    onATouchScreen();
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);

    finger.down(gripOf('Goblin'), at(10, 40));
    wait(1000);

    expect(menuLabels()).toEqual([]);
  });

  it('leaves a value being edited to its input', () => {
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Initiative for Goblin: 7. Edit' }));
    const finger = contact('touch', 1);

    finger.down(screen.getByRole('spinbutton', { name: 'Initiative for Goblin' }), at(200, 40));
    wait(1000);

    expect(menuLabels()).toEqual([]);
  });

  it('opens the menu on a tap on the name, as a click does', () => {
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);
    const name = screen.getByRole('button', { name: 'Goblin' });

    finger.down(name, at(40, 40));
    finger.up(name, at(40, 40));
    fireEvent.click(name, { detail: 1 });

    expect(menuLabels()).toEqual(['Roll...']);
  });

  it('keeps the menu where a finger held the name, through the click the lift brings', () => {
    render(<InitiativeTracker />);
    const finger = contact('touch', 1);
    const name = screen.getByRole('button', { name: 'Goblin' });

    finger.down(name, at(40, 40));
    wait(500);
    finger.up(name, at(40, 40));
    fireEvent.mouseDown(name);
    fireEvent.click(name, { detail: 1 });

    const menu = document.querySelector<HTMLElement>('div.fixed.z-50');
    expect(menu?.style.left).toBe('40px');
  });

  it('selects no text and opens no callout on the row, but lets an input be typed in', () => {
    render(<InitiativeTracker />);

    expect(classesOf(rowOf('Goblin'))).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]', '[&_input]:select-text']));
  });
});

describe("the DM's drag to reorder", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('starts anywhere on the row with a mouse, as before', () => {
    render(<InitiativeTracker />);

    expect(rowOf('Goblin')).toHaveAttribute('draggable', 'true');
  });

  it('starts from the grip only on a touch screen, which is as big as a finger', () => {
    onATouchScreen();
    render(<InitiativeTracker />);

    expect(rowOf('Goblin')).toHaveAttribute('draggable', 'false');
    expect(gripOf('Goblin')).toHaveAttribute('draggable', 'true');
    expect(classesOf(gripOf('Goblin'))).toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });

  it('keeps the picture from starting a drag of its own on a touch screen only', () => {
    useGameStore.getState().setCombatState({
      active: false, round: 0, currentTokenId: null,
      combatants: [{ ...goblin, imageUrl: '/api/assets/tokens/goblin' }],
    });
    const { unmount } = render(<InitiativeTracker />);
    expect(screen.getByAltText('Goblin')).not.toHaveAttribute('draggable');
    unmount();

    onATouchScreen();
    render(<InitiativeTracker />);
    expect(screen.getByAltText('Goblin')).toHaveAttribute('draggable', 'false');
  });

  it('moves the row dropped from its grip, with the row as the picture under the finger', () => {
    onATouchScreen();
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [goblin, ogre] });
    render(<InitiativeTracker />);
    const setDragImage = vi.fn();

    fireEvent.dragStart(gripOf('Ogre'), { dataTransfer: { setData: vi.fn(), setDragImage, effectAllowed: 'none' } });
    fireEvent.dragOver(rowOf('Goblin'));
    fireEvent.drop(rowOf('Goblin'));

    expect(emitInitiativeReorder).toHaveBeenCalledWith({ orderedTokenIds: ['ogre', 'goblin'] });
    expect(setDragImage).toHaveBeenCalledWith(rowOf('Ogre'), expect.any(Number), expect.any(Number));
  });
});

// The order moved by a drag, which a touch screen may not do, or by the
// grip's arrow keys, which a tablet may have none of.
describe('Up and Down on a touch screen', () => {
  const trollToken: Token = { ...goblinToken, id: 'troll', name: 'Troll' };
  const troll: CombatantEntry = { ...goblin, tokenId: 'troll', name: 'Troll', initiative: 1 };
  beforeEach(() => {
    useGameStore.getState().setTokens([goblinToken, ogreToken, trollToken]);
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [goblin, ogre, troll] });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('move a combatant one place, as the grip\'s arrow keys do, and say where it went', () => {
    const { unmount } = render(<InitiativeTracker />);
    fireEvent.keyDown(gripOf('Goblin'), { key: 'ArrowDown' });
    const byKey = emitInitiativeReorder.mock.calls.slice();
    const saidByKey = screen.getByRole('status').textContent;
    unmount();
    emitInitiativeReorder.mockReset();
    useGameStore.getState().setCombatState({ active: false, round: 0, currentTokenId: null, combatants: [goblin, ogre, troll] });

    onATouchScreen();
    render(<InitiativeTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Goblin down' }));

    expect(byKey).toEqual([[{ orderedTokenIds: ['ogre', 'goblin', 'troll'] }]]);
    expect(emitInitiativeReorder.mock.calls).toEqual(byKey);
    expect(screen.getByRole('status')).toHaveTextContent(saidByKey ?? 'missing');
  });

  it('move one up, and keep the cursor on the button pressed, in the row where it went', () => {
    onATouchScreen();
    render(<InitiativeTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Troll up' }));

    expect(emitInitiativeReorder).toHaveBeenCalledWith({ orderedTokenIds: ['goblin', 'troll', 'ogre'] });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Troll up' }));
  });

  it('go no further than the ends: Up is off on the first row and Down on the last', () => {
    onATouchScreen();
    render(<InitiativeTracker />);

    expect(screen.getByRole('button', { name: 'Move Goblin up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Troll down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Ogre up' })).toBeEnabled();
  });

  it('are as big as a finger', () => {
    onATouchScreen();
    render(<InitiativeTracker />);

    expect(classesOf(screen.getByRole('button', { name: 'Move Ogre down' })))
      .toEqual(expect.arrayContaining(['touch-target', 'inline-flex', 'items-center', 'justify-center']));
  });

  it('are not there with a mouse, nor for a player', () => {
    const { unmount } = render(<InitiativeTracker />);
    expect(screen.queryByRole('button', { name: 'Move Ogre down' })).toBeNull();
    unmount();

    onATouchScreen();
    seat.role = 'PLAYER';
    render(<InitiativeTracker />);
    expect(screen.queryByRole('button', { name: 'Move Ogre down' })).toBeNull();
  });
});
