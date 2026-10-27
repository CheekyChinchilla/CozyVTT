/**
 * The campaign roster on a touch screen.
 *
 * A character's four hit point buttons were 20 pixels square, in a row under
 * the character, indented, in a panel that can be 260 pixels wide. At the 44
 * a finger needs they do not fit one line there, so on a touch screen the
 * row wraps, with −5 kept beside −1 and +1 beside +5, and the characters
 * lose their indent, which leaves room for the hit points beside a pair
 * however many digits they have. jsdom evaluates no media query, so the
 * classes and the grouping are what is checked.
 *
 * A character's menu opened by a right-click only, and the DM's drag of a
 * character onto the map began anywhere on its row, which on an iPad starts
 * the system's own drag at about the time a long-press would open the menu.
 * On a touch screen a long-press on the row now opens the menu a right-click
 * opens, a tap still opens the sheet, and the DM drags a character by a grip
 * at the row's start; with a mouse the row drags as before and has no grip.
 * A touch screen is a stubbed `matchMedia` answering `(pointer: coarse)`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';
import { contact } from '@/test/pointer';

const getCampaignCharacters = vi.fn();
const getCharacter = vi.fn();
const assignCharacterToCampaign = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };
const seat = vi.hoisted(() => ({ role: 'DM', userId: 'dm' }));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', memberships: [{ userId: seat.userId, role: seat.role }] },
    currentMap: { id: 'map-1', width: 20, height: 20 },
    userRole: seat.role,
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: seat.userId } }) }));
vi.mock('@/services/api', () => {
  const client = {
    getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a),
    getCharacter: (...a: unknown[]) => getCharacter(...a),
    assignCharacterToCampaign: (...a: unknown[]) => assignCharacterToCampaign(...a),
  };
  return { api: client, default: client };
});
vi.mock('../../character/CharacterSheetViewerModal', () => ({
  default: ({ character }: { character: { id: string } }) => <div role="dialog" aria-label={`Sheet of ${character.id}`} />,
}));

import CampaignRoster from '../CampaignRoster';

const member = (userId: string, userName: string, hp: number | null = null): RosterMember => ({
  userId, userName, userAvatar: null, role: userId === 'dm' ? CampaignRole.DM : CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
  characters: hp === null ? [] : [{ id: `${userId}-char`, name: `${userName}'s hero`, tokenImageUrl: null, gameSystem: null, userId, hp: { current: hp, max: 10, temp: 0 } }],
});

beforeEach(() => {
  seat.role = 'DM';
  seat.userId = 'dm';
  getCampaignCharacters.mockReset().mockResolvedValue({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7)] });
  getCharacter.mockReset().mockImplementation(async (id: string) => ({ character: { id } }));
  assignCharacterToCampaign.mockReset().mockResolvedValue({});
  useGameStore.getState().clearGameState();
});

const classesOf = (el: Element | null) => (el as HTMLElement).className.split(/\s+/);

it('makes the hit point buttons big enough for a finger', async () => {
  render(<CampaignRoster />);
  await screen.findByText("Ash's hero");

  for (const name of ['−5 HP', '−1 HP', '+1 HP', '+5 HP']) {
    expect(classesOf(screen.getByTitle(name))).toContain('touch-target');
  }
});

it('lets the hit point row wrap, keeping −5 with −1 and +1 with +5', async () => {
  render(<CampaignRoster />);
  await screen.findByText("Ash's hero");

  const minus = screen.getByTitle('−5 HP').parentElement;
  const plus = screen.getByTitle('+5 HP').parentElement;
  expect(screen.getByTitle('−1 HP').parentElement).toBe(minus);
  expect(screen.getByTitle('+1 HP').parentElement).toBe(plus);
  expect(minus).not.toBe(plus);
  expect(minus?.parentElement).toBe(plus?.parentElement);
  expect(classesOf(minus?.parentElement ?? null)).toContain('pointer-coarse:flex-wrap');
  // Alone on its line, the plus pair keeps to the right.
  expect(classesOf(plus)).toContain('pointer-coarse:ml-auto');
});

it("drops the characters' indent, so the hit points fit beside a pair", async () => {
  render(<CampaignRoster />);
  await screen.findByText("Ash's hero");

  const list = screen.getByText("Ash's hero").closest('.ml-9');
  expect(classesOf(list)).toContain('pointer-coarse:ml-0');
});

/** A primary pointer that is a finger, as on a phone or a tablet. */
function onATouchScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)', media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
}

/** The labels of the character menu that is open, in order. */
const menuLabels = () => [...document.querySelectorAll<HTMLElement>('div.fixed.z-50 button')].map((b) => b.textContent);
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const at = (clientX: number, clientY: number) => ({ clientX, clientY });

describe("a character's row, pressed and held by a finger", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The roster, loaded; then the clock is the test's. */
  async function shown(name: string) {
    render(<CampaignRoster />);
    const row = await screen.findByText(name);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    return row;
  }

  /** The menu a right-click opens at the point, closed again with Escape. */
  function rightClickMenu(row: Element) {
    fireEvent.contextMenu(row, at(40, 40));
    const labels = menuLabels();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menuLabels()).toEqual([]);
    return labels;
  }

  function longPress(row: Element) {
    const finger = contact('touch', 1);
    finger.down(row, at(40, 40));
    wait(500);
    finger.up(row, at(40, 40));
  }

  it.each([
    ['the DM, on a player\'s character', 'DM', 'dm', "Ash's hero", ['View Character Sheet', 'Roll...', 'Edit Character Sheet', 'Add to Map', 'Remove from Campaign']],
    ['a player, on their own character', 'PLAYER', 'p1', "Ash's hero", ['View Character Sheet', 'Roll...', 'Edit Character Sheet', 'Remove from Campaign']],
    ["a player, on another player's character", 'PLAYER', 'p1', "Bo's hero", ['View Character Sheet']],
  ])('opens the menu a right-click opens, item for item, for %s', async (_who, role, userId, name, items) => {
    seat.role = role;
    seat.userId = userId;
    // Bo's character keeps no hit points, so the roster shows one row of them.
    const bo = member('p2', 'Bo', 4);
    bo.characters[0]!.hp = { current: 0, max: 0, temp: 0 };
    getCampaignCharacters.mockResolvedValue({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7), bo] });
    const row = await shown(name);
    const byRightClick = rightClickMenu(row);

    longPress(row);

    expect(menuLabels()).toEqual(byRightClick);
    expect(menuLabels()).toEqual(items);
  });

  it('opens the sheet on a tap, as a click does', async () => {
    const row = await shown("Ash's hero");
    const finger = contact('touch', 1);

    finger.down(row, at(40, 40));
    finger.up(row, at(40, 40));
    fireEvent.click(row, { detail: 1 });

    expect(getCharacter).toHaveBeenCalledWith('p1-char');
  });

  it('does not also open the sheet, nor close the menu, when the lift brings a mousedown and a click', async () => {
    const row = await shown("Ash's hero");

    longPress(row);
    fireEvent.mouseDown(row);
    fireEvent.click(row, { detail: 1 });

    expect(getCharacter).not.toHaveBeenCalled();
    expect(menuLabels()).toContain('View Character Sheet');
  });

  it("opens one menu when Android's own long-press comes before the timer", async () => {
    const row = await shown("Ash's hero");
    const finger = contact('touch', 1);

    finger.down(row, at(40, 40));
    wait(400);
    fireEvent.contextMenu(row, at(40, 40));
    wait(600);
    finger.up(row, at(40, 40));

    expect(document.querySelectorAll('div.fixed.z-50')).toHaveLength(1);
    expect(getCharacter).not.toHaveBeenCalled();
  });

  it('opens nothing when the finger slides, as it does to scroll the roster', async () => {
    const row = await shown("Ash's hero");
    const finger = contact('touch', 1);

    finger.down(row, at(40, 40));
    finger.move(row, at(40, 60));
    wait(1000);

    expect(menuLabels()).toEqual([]);
  });

  // A finger's long-press brings no mousedown, which is what closed the
  // first menu before a right-click opened the second: the open menu took
  // the second row's items and kept the first row's place.
  it('opens a second long-press on another row as a menu of its own, at that row, acting on it', async () => {
    const bo = member('p2', 'Bo', 4);
    bo.characters[0]!.hp = { current: 0, max: 0, temp: 0 };
    getCampaignCharacters.mockResolvedValue({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7), bo] });
    const ash = await shown("Ash's hero");
    const finger = contact('touch', 1);
    finger.down(ash, at(40, 40));
    wait(500);
    finger.up(ash, at(40, 40));
    wait(1500);

    const second = contact('touch', 2);
    second.down(screen.getByText("Bo's hero"), at(120, 200));
    wait(500);
    second.up(screen.getByText("Bo's hero"), at(120, 200));

    const menus = document.querySelectorAll<HTMLElement>('div.fixed.z-50');
    expect(menus).toHaveLength(1);
    expect({ left: menus[0]!.style.left, top: menus[0]!.style.top }).toEqual({ left: '120px', top: '200px' });
    expect(menuLabels()).toEqual(['View Character Sheet', 'Roll...', 'Edit Character Sheet', 'Add to Map', 'Remove from Campaign']);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: /Remove from Campaign/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(assignCharacterToCampaign).toHaveBeenCalledWith('p2-char', null));
  });

  it('selects no text and opens no callout on the row', async () => {
    const row = await shown("Ash's hero");

    expect(classesOf(row.closest('[draggable]'))).toEqual(expect.arrayContaining(['select-none', '[-webkit-touch-callout:none]']));
  });
});

describe("the DM's drag of a character onto the map", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const grip = () => document.querySelector<HTMLElement>('[data-drag-grip]');

  it('starts anywhere on the row with a mouse, which has no grip', async () => {
    render(<CampaignRoster />);
    const row = (await screen.findByText("Ash's hero")).closest('[draggable]');

    expect(row).toHaveAttribute('draggable', 'true');
    expect(grip()).not.toBeInTheDocument();
  });

  it('starts from the grip only on a touch screen, and the grip opens no menu by holding', async () => {
    onATouchScreen();
    render(<CampaignRoster />);
    const row = (await screen.findByText("Ash's hero")).closest('[draggable]');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    expect(row).toHaveAttribute('draggable', 'false');
    expect(grip()).toHaveAttribute('draggable', 'true');
    expect(grip()).toHaveAttribute('title', "Drag Ash's hero onto the map");
    expect(classesOf(grip())).toContain('touch-target');

    const finger = contact('touch', 1);
    finger.down(grip()!, at(10, 40));
    wait(1000);
    expect(menuLabels()).toEqual([]);

    const setData = vi.fn();
    fireEvent.dragStart(grip()!, { dataTransfer: { setData, setDragImage: vi.fn(), effectAllowed: 'none' } });
    expect(setData).toHaveBeenCalledWith('text/plain', expect.stringContaining('p1-char'));
  });

  // At the panel's 260-pixel minimum the grip, the picture and the system
  // badge left the name about 24 pixels: "Ar…". On a touch screen the grip
  // takes 24 pixels of the row while its target stays 44 square, reaching
  // into the padding beside it, and the badge goes under the name.
  it('leaves the name room on a touch screen: a grip that takes little of the row, and the badge under the name', async () => {
    const badged = [{ ...member('p1', 'Ash', 7), characters: [{ ...member('p1', 'Ash', 7).characters[0]!, gameSystem: 'DND_5E' as const }] }];
    getCampaignCharacters.mockResolvedValue({ roster: badged });
    onATouchScreen();
    render(<CampaignRoster />);
    const name = await screen.findByText("Ash's hero");

    expect(classesOf(grip())).toEqual(expect.arrayContaining(['touch-target', '-mx-2.5']));
    const nameAndBadge = name.parentElement!;
    expect(nameAndBadge).toBe(screen.getByText('D&D 5e').parentElement);
    expect(classesOf(nameAndBadge)).toEqual(expect.arrayContaining(['flex-1', 'min-w-0', 'pointer-coarse:flex-col', 'pointer-coarse:items-start']));
    expect(classesOf(name)).toEqual(expect.arrayContaining(['truncate', 'max-w-full']));
  });

  // A picture is a drag of its own to a browser, which on an iPad lifts it
  // at about the time a long-press would open the menu.
  it("keeps the character's picture from starting a drag of its own on a touch screen only", async () => {
    const pictured = [{ ...member('p1', 'Ash', 7), characters: [{ ...member('p1', 'Ash', 7).characters[0]!, tokenImageUrl: '/api/assets/tokens/ash' }] }];
    getCampaignCharacters.mockResolvedValue({ roster: pictured });
    const { unmount } = render(<CampaignRoster />);
    expect(await screen.findByAltText("Ash's hero")).not.toHaveAttribute('draggable');
    unmount();

    onATouchScreen();
    render(<CampaignRoster />);
    expect(await screen.findByAltText("Ash's hero")).toHaveAttribute('draggable', 'false');
  });

  it("gives a player's row no grip and no drag on a touch screen", async () => {
    onATouchScreen();
    seat.role = 'PLAYER';
    seat.userId = 'p1';
    render(<CampaignRoster />);
    const row = (await screen.findByText("Ash's hero")).parentElement;

    expect(row).not.toHaveAttribute('draggable', 'true');
    expect(grip()).not.toBeInTheDocument();
  });
});
