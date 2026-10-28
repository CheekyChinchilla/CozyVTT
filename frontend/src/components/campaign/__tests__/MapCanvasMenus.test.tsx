/**
 * The two menus a right-click (or a long-press) opens on the map, the token
 * menu and the door menu, as each viewer is shown them: their items in order,
 * how each looks (the exact classes, named below), the rules, headings,
 * tooltips and waits, the Move to Map… submenu, and what each item does.
 * These pin the menus as they are, for the DM, a player and a spectator, on
 * every kind of token and door and in Player Preview, so a change to how
 * they are built shows as a change here.
 *
 * The stand-ins are those of MapCanvasKeyboard.test.tsx: the role, the
 * session's status, the members, the characters and the maps live in a store
 * the test changes, and the socket records what the page sends. Canvas
 * drawing is switched off, so the view starts at 100% with no pan and a
 * square is 50 pixels.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CampaignRole, TokenLayer, TokenType, type CampaignMap, type RosterMember, type Token } from '@/types';
import type { WallSegment } from '@/types/walls';
import { contact, mouse } from '@/test/pointer';
import { openCharacterMenu } from '@/test/characterMenuRows';

const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let version = 0;
  const state = {
    userRole: 'DM' as string,
    currentMap: null as unknown,
    status: 'ACTIVE' as string,
    memberships: [] as Array<{ userId: string; role: string; user: { displayName: string } }>,
    characters: [] as Array<{ id: string; userId: string; name: string }>,
    maps: [] as Array<{ id: string; name: string }>,
  };
  const sent: Array<[string, unknown]> = [];
  const raw = {
    on() { return raw; },
    off() { return raw; },
    emit(event: string, payload: unknown) {
      sent.push([event, payload]);
      return raw;
    },
  };
  return {
    state,
    sent,
    raw,
    api: {
      getCharacter: vi.fn(),
      updateToken: vi.fn(),
      addToken: vi.fn(),
      saveTokenAsTemplate: vi.fn(),
      moveTokens: vi.fn(),
      deleteToken: vi.fn(),
      getCampaignCharacters: vi.fn(),
    } as Record<string, ReturnType<typeof vi.fn>>,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    snapshot: () => version,
    set(patch: Partial<typeof state>) {
      Object.assign(state, patch);
      version += 1;
      listeners.forEach((l) => l());
    },
  };
});

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const noop = () => undefined;
  const campaign = {
    id: 'campaign-1', name: 'Test', spiritLayerEnabled: false,
    get characters() { return h.state.characters; },
    get status() { return h.state.status; },
    get memberships() { return h.state.memberships; },
    get maps() { return h.state.maps; },
  };
  return {
    useCampaign: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return {
        currentMap: h.state.currentMap,
        setCurrentMap: noop,
        userRole: h.state.userRole,
        campaign,
        updateCampaignSpiritLayer: noop,
        dmViewBothPlanes: false,
        playerSpiritVisible: false,
        setPlayerSpiritVisible: noop,
        activeVibeEffect: null,
        updateVibe: noop,
        activeAtmosphereEffect: null,
        characterHpCache: {},
      };
    },
  };
});

vi.mock('@/contexts/WebSocketContext', async () => {
  const { useSyncExternalStore } = await import('react');
  const record = (event: string) => (payload: unknown) => { h.sent.push([event, payload]); };
  const client = new Proxy({
    getSocket: () => h.raw,
    emitTokenMoveStart: record('token.move.start'),
    emitTokenMove: record('token.move'),
    emitTokenMoveEnd: record('token.move.end'),
    emitInitiativeAdd: record('initiative.add'),
    emitMapPing: record('map.ping'),
  } as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return () => () => undefined;
    },
  });
  return {
    useWebSocket: () => {
      useSyncExternalStore(h.subscribe, h.snapshot);
      return { socket: client, joinedEpoch: 1, status: 'connected', reconnectCount: 0 };
    },
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }),
}));

vi.mock('@/services/map.service', () => ({
  default: { updateMap: vi.fn(), getMaps: vi.fn().mockResolvedValue([]), getMap: vi.fn() },
}));

vi.mock('@/services/api', () => {
  const client = new Proxy({}, {
    get: (_target, prop: string) => h.api[prop] ?? vi.fn().mockResolvedValue({}),
  });
  return { api: client, default: client };
});

import MapCanvas from '../MapCanvas';
import CampaignRoster from '../CampaignRoster';
import { useGameStore } from '@/stores/gameStore';

function mapNamed(id: string, extra: Partial<CampaignMap> = {}): CampaignMap {
  return {
    id,
    campaignId: 'campaign-1',
    name: `Map ${id}`,
    imageUrl: '/api/assets/maps/x',
    width: 20,
    height: 20,
    gridSize: 50,
    tokens: [],
    wallSegments: [],
    lights: [],
    fogEnabled: false,
    lightingEnabled: false,
    globalIllumination: true,
    explorationEnabled: false,
    ...extra,
  } as unknown as CampaignMap;
}

/** A one-square token; grid y counts up from the bottom row, 0, to the top, 19. */
function token(id: string, name: string, x: number, y: number, extra: Partial<Token> = {}): Token {
  return {
    id, name, imageUrl: '', characterId: null, position: { x, y }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    hp: null, showHpBar: false, ...extra,
  } as unknown as Token;
}

const MEMBERS = {
  me: (role: string) => ({ userId: 'me', role, user: { displayName: 'Me' } }),
  alice: { userId: 'alice', role: 'PLAYER', user: { displayName: 'Alice' } },
};
const CHARACTERS = {
  mine: { id: 'char-mine', userId: 'me', name: 'Aldra' },
  alices: { id: 'char-alice', userId: 'alice', name: 'Brannoc' },
};

const goblin = (extra: Partial<Token> = {}) => token('tok-goblin', 'Goblin Scout', 0, 19, extra);
/** A player's character on the map. */
const hero = (characterId: string, controlledBy: string, extra: Partial<Token> = {}) =>
  token('tok-hero', 'Hero', 2, 19, { type: TokenType.PLAYER, characterId, controlledBy, ...extra });

/** Square (x, y) on screen, at 100% and no pan. */
const at = (x: number, y: number) => ({ clientX: x * 50 + 10, clientY: (19 - y) * 50 + 10 });

function surface(): HTMLCanvasElement {
  const input = document.querySelector<HTMLCanvasElement>('canvas[class*="cursor-"]');
  if (!input) throw new Error('no input canvas');
  return input;
}

function show(...tokens: Token[]) {
  act(() => { useGameStore.getState().setTokens(tokens); });
}

function sentOf(event: string): unknown[] {
  return h.sent.filter(([e]) => e === event).map(([, p]) => p);
}

/** Right-click square (x, y). */
function rightClick(x: number, y: number) {
  fireEvent.contextMenu(surface(), at(x, y));
}

/** The menu open on the map, or null. */
function openMenu(): HTMLElement | null {
  const menus = document.querySelectorAll<HTMLElement>('div.fixed.z-50.glass-panel');
  if (menus.length > 1) throw new Error(`${menus.length} menus open`);
  return menus[0] ?? null;
}

function theMenu(): HTMLElement {
  const menu = openMenu();
  if (!menu) throw new Error('no menu open');
  return menu;
}

/** The click on a menu item, settled. */
async function choose(label: string | RegExp) {
  await act(async () => { fireEvent.click(screen.getByText(label)); });
}

/**
 * How each row looks, by its exact classes. A row with any other classes
 * fails the test: these are the menu's looks as they are.
 */
const ITEM = 'w-full px-4 py-2 pointer-coarse:min-h-11 text-left text-sm';
const LOOKS: Record<string, string> = {
  [`${ITEM} text-stone-gray hover:bg-moss-green/10 transition-colors`]: '',
  [`${ITEM} text-brand-ink hover:bg-moss-green/10 transition-colors`]: ' (brand)',
  [`${ITEM} text-brand-ink font-medium hover:bg-moss-green/10 transition-colors`]: ' (brand, bold)',
  [`${ITEM} text-accent-ink hover:bg-warm-amber/10 transition-colors`]: ' (accent)',
  [`${ITEM} text-accent-ink hover:bg-warm-amber/10 transition-colors flex items-center justify-between`]: ' (accent, opens a submenu)',
  [`${ITEM} text-spirit-ink hover:bg-spirit-purple/10 transition-colors disabled:opacity-50`]: ' (spirit, dims)',
  [`${ITEM} text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50`]: ' (brand, dims)',
  [`${ITEM} text-danger-ink hover:bg-danger/10 transition-colors`]: ' (danger)',
};
const SEPARATOR = 'h-px bg-moss-green/20 my-1';
const SUBMENU = 'bg-parchment/80 border-t border-moss-green/10 px-2 py-1 space-y-0.5';
const SUBMENU_ITEM = 'w-full px-2 py-1.5 pointer-coarse:min-h-11 text-left text-xs text-charcoal hover:bg-moss-green/10 rounded-sm transition-colors';
const SUBMENU_WAIT = 'text-xs text-stone-gray px-2 py-1';
const DOOR_HEADING = 'px-4 py-1.5 text-xs font-semibold text-stone-gray/70 border-b border-moss-green/10 select-none';
const DOOR_NOTE = 'px-4 py-2 text-sm text-stone-gray/70 italic select-none';
const MENU = 'fixed z-50 glass-panel bg-parchment/95 backdrop-blur-xs border border-moss-green/20 shadow-lg py-1 flex flex-col w-max min-w-[160px] max-w-[18rem] pointer-coarse:max-h-[calc(100dvh-1rem)] pointer-coarse:overflow-y-auto pointer-coarse:overscroll-contain';

function describeButton(button: HTMLButtonElement, looks: Record<string, string>): string {
  const extra = Array.from(button.attributes).map((a) => a.name).filter((n) => !['class', 'title', 'disabled'].includes(n));
  if (extra.length > 0) throw new Error(`"${button.textContent}" carries ${extra.join(', ')}`);
  const look = looks[button.className];
  if (look === undefined) throw new Error(`"${button.textContent}" looks unlike any item: ${button.className}`);
  return `${button.textContent}${look}${button.title ? ` [${button.title}]` : ''}${button.disabled ? ' [disabled]' : ''}`;
}

/**
 * The open menu, a row a line: an item's label, how it looks, its tooltip
 * in square brackets and [disabled] when it cannot be pressed; a rule as
 * ---; the Move to Map… submenu's rows after it, each starting "›"; the
 * door menu's heading after #, and its line of text in quotes.
 */
function rows(): string[] {
  const out: string[] = [];
  for (const row of Array.from(theMenu().children)) {
    if (row instanceof HTMLButtonElement) {
      out.push(describeButton(row, LOOKS));
    } else if (row instanceof HTMLDivElement && row.className === SEPARATOR) {
      out.push('---');
    } else if (row instanceof HTMLParagraphElement && row.className === DOOR_HEADING) {
      out.push(`# ${row.textContent}`);
    } else if (row instanceof HTMLParagraphElement && row.className === DOOR_NOTE) {
      out.push(`“${row.textContent}”`);
    } else if (row instanceof HTMLDivElement && row.className === '' && row.firstElementChild instanceof HTMLButtonElement) {
      const [opener, submenu, ...rest] = Array.from(row.children);
      if (rest.length > 0) throw new Error('more than a submenu under Move to Map…');
      out.push(describeButton(opener as HTMLButtonElement, LOOKS));
      if (!submenu) continue;
      if (submenu.className !== SUBMENU) throw new Error(`a submenu unlike today's: ${submenu.className}`);
      for (const choice of Array.from(submenu.children)) {
        if (choice instanceof HTMLButtonElement) out.push(`› ${describeButton(choice, { [SUBMENU_ITEM]: '' })}`);
        else if (choice instanceof HTMLParagraphElement && choice.className === SUBMENU_WAIT) out.push(`› (${choice.textContent})`);
        else throw new Error(`an unknown row in the submenu: ${choice.outerHTML}`);
      }
    } else {
      throw new Error(`an unknown row: ${row.outerHTML}`);
    }
  }
  return out;
}

const ROTATE = ['Rotate Left [Turn 45 degrees anticlockwise]', 'Rotate Right [Turn 45 degrees clockwise]'];
/** The DM's items after any Roll... of the creature's, for a creature on the material plane. */
const DM_ITEMS = [
  'Edit Token (brand, bold)',
  'Add to Initiative (accent)',
  'Duplicate Token',
  'Save as Template',
  'Hide from Players',
  'Obscure Identity',
  'Send to Spirit Realm (spirit, dims)',
  '---',
  'Move to Map…▶ (accent, opens a submenu)',
  '---',
  'Remove from Map (danger)',
];

/** A promise the test settles. */
function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: () => null, configurable: true });
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  h.sent.length = 0;
  // A sheet never arrives, so neither the viewer nor the roll picker gets past loading.
  h.api.getCharacter.mockReset().mockReturnValue(new Promise(() => undefined));
  for (const name of ['updateToken', 'saveTokenAsTemplate', 'moveTokens', 'deleteToken']) h.api[name].mockReset().mockResolvedValue({});
  h.api.addToken.mockReset().mockImplementation((_c: string, _m: string, body: Partial<Token>) =>
    Promise.resolve({ token: { ...goblin(), ...body, id: 'tok-copy' } }));
  act(() => { useGameStore.getState().clearGameState(); });
  h.set({
    userRole: 'DM',
    status: 'ACTIVE',
    memberships: [MEMBERS.me('DM'), MEMBERS.alice],
    characters: [CHARACTERS.mine, CHARACTERS.alices],
    maps: [{ id: 'map-a', name: 'Map A' }, { id: 'map-b', name: 'Map B' }, { id: 'map-c', name: 'Map C' }],
    currentMap: mapNamed('map-a'),
  });
});

describe("the DM's token menu", () => {
  it('on a creature: the turns, its Roll..., then every DM item', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(theMenu().className).toBe(MENU);
    expect(theMenu().getAttribute('style')).toBe('left: 10px; top: 10px; visibility: visible;');
    expect(rows()).toEqual([...ROTATE, 'Roll...', ...DM_ITEMS]);
  });

  it("on a player's character: the sheet and its Roll... first, and no creature's Roll...", () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice'));
    rightClick(2, 19);

    expect(rows()).toEqual(['View Character Sheet', 'Roll...', ...ROTATE, ...DM_ITEMS]);
  });

  it("on a creature with a character, a companion: the character's sheet and Roll... only", () => {
    render(<MapCanvas />);
    show(goblin({ characterId: 'char-alice' }));
    rightClick(0, 19);

    expect(rows()).toEqual(['View Character Sheet', 'Roll...', ...ROTATE, ...DM_ITEMS]);
  });

  it("on a character that has left the campaign: no sheet, and the DM's own Roll... only for a creature", () => {
    render(<MapCanvas />);
    show(hero('char-gone', 'alice'), goblin({ characterId: 'char-gone' }));

    rightClick(2, 19);
    expect(rows()).toEqual([...ROTATE, ...DM_ITEMS]);
    fireEvent.click(document.body);

    rightClick(0, 19);
    expect(rows()).toEqual([...ROTATE, ...DM_ITEMS]);
  });

  it('on an object: no Roll... and no crossing to the spirit realm', () => {
    render(<MapCanvas />);
    show(goblin({ type: TokenType.OBJECT }));
    rightClick(0, 19);

    expect(rows()).toEqual([...ROTATE, ...DM_ITEMS.filter((r) => !r.startsWith('Send to Spirit Realm'))]);
  });

  it('on a token with no type: a creature without a character, a player with one', () => {
    render(<MapCanvas />);
    show(goblin({ type: undefined }), hero('char-alice', 'alice', { type: undefined }));

    rightClick(0, 19);
    expect(rows()).toEqual([...ROTATE, 'Roll...', ...DM_ITEMS]);
    fireEvent.click(document.body);

    rightClick(2, 19);
    expect(rows()).toEqual(['View Character Sheet', 'Roll...', ...ROTATE, ...DM_ITEMS]);
  });

  it('on a hidden, obscured token in the spirit realm: each switch offers the way back', () => {
    render(<MapCanvas />);
    show(goblin({ visible: false, obscured: true, layer: TokenLayer.SPIRIT }));
    rightClick(0, 19);

    expect(rows()).toEqual([
      ...ROTATE,
      'Roll...',
      'Edit Token (brand, bold)',
      'Add to Initiative (accent)',
      'Duplicate Token',
      'Save as Template',
      'Reveal to Players',
      'Reveal Identity',
      'Return to Material Plane (brand, dims)',
      '---',
      'Move to Map…▶ (accent, opens a submenu)',
      '---',
      'Remove from Map (danger)',
    ]);
  });

  // The rule above Move to Map… stays when there is no other map to move to,
  // so two rules stand together above Remove from Map.
  it('with no other map: no Move to Map…, its rule still drawn', () => {
    h.set({ maps: [{ id: 'map-a', name: 'Map A' }] });
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(rows().slice(-4)).toEqual(['Send to Spirit Realm (spirit, dims)', '---', '---', 'Remove from Map (danger)']);
  });

  it('while the session is paused, the same, the turns included', () => {
    h.set({ status: 'PAUSED' });
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(rows()).toEqual([...ROTATE, 'Roll...', ...DM_ITEMS]);
  });
});

/**
 * In Player Preview the DM still opens the DM's menu, on a token the preview
 * draws and on one it does not (MapCanvas's openMenuAt has a TODO(play) for
 * the second).
 */
describe('the token menu in Player Preview', () => {
  beforeEach(() => {
    h.set({ currentMap: mapNamed('map-a', { lightingEnabled: true, globalIllumination: true }) });
  });

  it("is the DM's, on a token the preview draws and on a hidden one", () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice'), goblin({ visible: false, position: { x: 3, y: 10 } }));
    fireEvent.click(screen.getByLabelText('Toggle DM player view preview'));

    rightClick(2, 19);
    expect(rows()).toEqual(['View Character Sheet', 'Roll...', ...ROTATE, ...DM_ITEMS]);
    fireEvent.click(document.body);

    rightClick(3, 10);
    expect(rows()).toEqual([...ROTATE, 'Roll...', ...DM_ITEMS.map((r) => (r === 'Hide from Players' ? 'Reveal to Players' : r))]);
  });
});

describe("a player's token menu", () => {
  beforeEach(() => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER'), MEMBERS.alice] });
  });

  it('on their own character: the sheet, its Roll... and the turns', () => {
    render(<MapCanvas />);
    show(hero('char-mine', 'me'));
    rightClick(2, 19);

    expect(theMenu().className).toBe(MENU);
    expect(rows()).toEqual(['View Character Sheet', 'Roll...', ...ROTATE]);
  });

  it('on a token of their own with no character: the turns', () => {
    render(<MapCanvas />);
    show(goblin({ controlledBy: 'me' }));
    rightClick(0, 19);

    expect(rows()).toEqual(ROTATE);
  });

  it("on another player's character: the sheet only", () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice'));
    rightClick(2, 19);

    expect(rows()).toEqual(['View Character Sheet']);
  });

  it('on their own character on a token they do not control: the sheet and its Roll...', () => {
    render(<MapCanvas />);
    show(hero('char-mine', 'alice'));
    rightClick(2, 19);

    expect(rows()).toEqual(['View Character Sheet', 'Roll...']);
  });

  it('on a creature: no menu', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(openMenu()).toBeNull();
  });

  it.each(['PAUSED', 'INACTIVE'])('while %s: no turns, and no menu on their own token with no character', (status) => {
    h.set({ status });
    render(<MapCanvas />);
    show(hero('char-mine', 'me'), goblin({ controlledBy: 'me' }));

    rightClick(2, 19);
    expect(rows()).toEqual(['View Character Sheet', 'Roll...']);
    fireEvent.click(document.body);

    rightClick(0, 19);
    expect(openMenu()).toBeNull();
  });
});

describe("a spectator's token menu", () => {
  beforeEach(() => {
    h.set({ userRole: 'SPECTATOR', memberships: [MEMBERS.me('SPECTATOR'), MEMBERS.alice] });
  });

  it('on a character, their own included: the sheet only', () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice'), goblin({ type: TokenType.PLAYER, characterId: 'char-mine', controlledBy: 'me' }));

    rightClick(2, 19);
    expect(rows()).toEqual(['View Character Sheet']);
    fireEvent.click(document.body);

    rightClick(0, 19);
    expect(rows()).toEqual(['View Character Sheet']);
  });

  it('on a creature: no menu', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);

    expect(openMenu()).toBeNull();
  });
});

describe('Move to Map…', () => {
  it('opens the other maps under it in place, in the campaign’s order, and closes them again', () => {
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    const opener = screen.getByText('Move to Map…').parentElement!;
    expect(opener.innerHTML).toBe('<span>Move to Map…</span><span class="text-xs opacity-60">▶</span>');

    fireEvent.click(opener);
    expect(rows().slice(-6)).toEqual(['---', 'Move to Map…▶ (accent, opens a submenu)', '› Map B', '› Map C', '---', 'Remove from Map (danger)']);

    fireEvent.click(opener);
    expect(rows()).toEqual([...ROTATE, 'Roll...', ...DM_ITEMS]);
  });

  it('lists every map while the current one is not known to the campaign', () => {
    h.set({ currentMap: mapNamed('map-x') });
    render(<MapCanvas />);
    show(goblin());
    rightClick(0, 19);
    fireEvent.click(screen.getByText('Move to Map…'));

    expect(rows().filter((r) => r.startsWith('›'))).toEqual(['› Map A', '› Map B', '› Map C']);
  });

  it('moves the token, closing the menu, and says Moving… in the submenu while the move is on its way', async () => {
    const move = deferred();
    h.api.moveTokens.mockReturnValue(move.promise);
    render(<MapCanvas />);
    show(goblin(), token('tok-wolf', 'Wolf', 4, 19));
    rightClick(0, 19);
    fireEvent.click(screen.getByText('Move to Map…'));
    await choose('Map C');

    expect(h.api.moveTokens).toHaveBeenCalledWith('campaign-1', 'map-a', ['tok-goblin'], 'map-c');
    expect(openMenu()).toBeNull();

    // Any token's menu shows the wait, the moving token's and another's.
    for (const x of [0, 4]) {
      rightClick(x, 19);
      fireEvent.click(screen.getByText('Move to Map…'));
      expect(rows().slice(-5)).toEqual(['---', 'Move to Map…▶ (accent, opens a submenu)', '› (Moving…)', '---', 'Remove from Map (danger)']);
      fireEvent.click(document.body);
    }

    await act(async () => { move.resolve({}); });
    expect(useGameStore.getState().tokens['tok-goblin']).toBeUndefined();
    rightClick(4, 19);
    fireEvent.click(screen.getByText('Move to Map…'));
    expect(rows().filter((r) => r.startsWith('›'))).toEqual(['› Map B', '› Map C']);
  });
});

describe('crossing to the spirit realm', () => {
  it('shows Moving…, disabled, on any token’s menu while the crossing is on its way', async () => {
    const crossing = deferred();
    h.api.updateToken.mockReturnValue(crossing.promise);
    render(<MapCanvas />);
    show(goblin(), token('tok-wolf', 'Wolf', 4, 19, { layer: TokenLayer.SPIRIT }));
    rightClick(0, 19);
    await choose('Send to Spirit Realm');

    expect(h.api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', { layer: 'spirit' });
    expect(openMenu()).toBeNull();

    rightClick(0, 19);
    expect(rows()).toContain('Moving… (spirit, dims) [disabled]');
    fireEvent.click(document.body);
    rightClick(4, 19);
    expect(rows()).toContain('Moving… (brand, dims) [disabled]');
    fireEvent.click(document.body);

    await act(async () => { crossing.resolve({}); });
    rightClick(0, 19);
    expect(rows()).toContain('Return to Material Plane (brand, dims)');
  });
});

describe('what each item does', () => {
  /** Open the menu on `target`, choose `label`, and say whether the menu closed. */
  async function chooseOn(target: Token, label: string, onEditToken = vi.fn()) {
    render(<MapCanvas onEditToken={onEditToken} />);
    show(target);
    fireEvent.contextMenu(surface(), at(target.position.x, target.position.y));
    await choose(label);
    return { closed: openMenu() === null, onEditToken };
  }

  it('View Character Sheet asks for the sheet and closes the menu', async () => {
    const { closed } = await chooseOn(hero('char-alice', 'alice'), 'View Character Sheet');
    expect(h.api.getCharacter).toHaveBeenCalledWith('char-alice');
    expect(closed).toBe(true);
  });

  it("a character's Roll... opens the character's roll picker and closes the menu", async () => {
    const { closed } = await chooseOn(hero('char-alice', 'alice'), 'Roll...');
    expect(screen.getByText('Loading rolls…')).toBeInTheDocument();
    expect(h.api.getCharacter).toHaveBeenCalledWith('char-alice');
    expect(closed).toBe(true);
  });

  it("a creature's Roll... opens the creature's roll picker and closes the menu", async () => {
    const { closed } = await chooseOn(goblin(), 'Roll...');
    expect(screen.getByPlaceholderText('e.g. 2d6+3')).toBeInTheDocument();
    expect(closed).toBe(true);
  });

  it.each([
    ['Rotate Left', 315],
    ['Rotate Right', 45],
  ])('%s turns the token and keeps the menu open', async (label, rotation) => {
    const { closed } = await chooseOn(goblin(), label);
    expect(h.api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', { rotation });
    expect(closed).toBe(false);
  });

  it('Edit Token hands the token to the page and closes the menu', async () => {
    const { closed, onEditToken } = await chooseOn(goblin(), 'Edit Token');
    expect(onEditToken).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-goblin' }));
    expect(closed).toBe(true);
  });

  it('Add to Initiative sends the token and closes the menu', async () => {
    const { closed } = await chooseOn(goblin(), 'Add to Initiative');
    expect(sentOf('initiative.add')).toEqual([{ tokenId: 'tok-goblin', mapId: 'map-a' }]);
    expect(closed).toBe(true);
  });

  it('Duplicate Token places a copy a square along and closes the menu', async () => {
    const { closed } = await chooseOn(goblin({ position: { x: 2, y: 10 } }), 'Duplicate Token');
    expect(h.api.addToken).toHaveBeenCalledWith('campaign-1', 'map-a', expect.objectContaining({
      position: { x: 3, y: 11 }, characterId: null, conditions: [],
    }));
    expect(useGameStore.getState().tokens['tok-copy']).toBeDefined();
    expect(closed).toBe(true);
  });

  it('Save as Template saves the token and closes the menu', async () => {
    const { closed } = await chooseOn(goblin(), 'Save as Template');
    expect(h.api.saveTokenAsTemplate).toHaveBeenCalledWith('campaign-1', expect.objectContaining({ name: 'Goblin Scout', type: 'npc' }));
    expect(closed).toBe(true);
  });

  it.each([
    ['Hide from Players', {}, { visible: false }],
    ['Reveal to Players', { visible: false }, { visible: true }],
    ['Obscure Identity', {}, { obscured: true }],
    ['Reveal Identity', { obscured: true }, { obscured: false }],
    ['Send to Spirit Realm', {}, { layer: 'spirit' }],
    ['Return to Material Plane', { layer: TokenLayer.SPIRIT }, { layer: 'token' }],
  ])('%s changes the token and closes the menu', async (label, extra, patch) => {
    const { closed } = await chooseOn(goblin(extra), label);
    expect(h.api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-goblin', patch);
    expect(useGameStore.getState().tokens['tok-goblin']).toMatchObject(patch);
    expect(closed).toBe(true);
  });

  it('Move to Map… keeps the menu open, and a map closes it', async () => {
    const { closed } = await chooseOn(goblin(), 'Move to Map…');
    expect(closed).toBe(false);
    await choose('Map B');
    expect(h.api.moveTokens).toHaveBeenCalledWith('campaign-1', 'map-a', ['tok-goblin'], 'map-b');
    expect(openMenu()).toBeNull();
  });

  it('Remove from Map asks first and closes the menu', async () => {
    const { closed } = await chooseOn(goblin(), 'Remove from Map');
    expect(screen.getByText(/Remove "Goblin Scout" from this map\?/)).toBeInTheDocument();
    expect(h.api.deleteToken).not.toHaveBeenCalled();
    expect(closed).toBe(true);
  });

  it("a player's own turn keeps the menu open, and the sheet closes it", async () => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER')] });
    const { closed } = await chooseOn(hero('char-mine', 'me'), 'Rotate Right');
    expect(h.api.updateToken).toHaveBeenCalledWith('campaign-1', 'map-a', 'tok-hero', { rotation: 45 });
    expect(closed).toBe(false);

    await choose('View Character Sheet');
    expect(h.api.getCharacter).toHaveBeenCalledWith('char-mine');
    expect(openMenu()).toBeNull();
  });
});

// Each roll picker stands where the menu it came from was opened: at the
// pointer, or at the token for a menu Enter opened.
describe('where a roll picker from the token menu opens', () => {
  const pickerAround = (text: string) => screen.getByText(text).closest<HTMLElement>('div.fixed')!;
  const placeOf = (el: HTMLElement) => [el.style.left, el.style.top];

  it("opens a creature's picker at the pointer", async () => {
    render(<MapCanvas />);
    show(goblin({ position: { x: 3, y: 12 } }));
    rightClick(3, 12);
    await choose('Roll...');

    expect(placeOf(screen.getByPlaceholderText('e.g. 2d6+3').closest<HTMLElement>('div.fixed')!)).toEqual(['160px', '360px']);
  });

  it("opens a character's picker at the pointer", async () => {
    render(<MapCanvas />);
    show(hero('char-alice', 'alice', { position: { x: 5, y: 4 } }));
    rightClick(5, 4);
    await choose('Roll...');

    expect(placeOf(pickerAround('Loading rolls…'))).toEqual(['260px', '760px']);
  });

  it('opens a picker at the token for a menu Enter opened', async () => {
    render(<MapCanvas />);
    show(goblin({ position: { x: 2, y: 18 } }));
    act(() => { useGameStore.getState().selectToken('tok-goblin'); });
    const map = screen.getByRole('application', { name: 'Map' });
    map.focus();
    await act(async () => { fireEvent.keyDown(map, { key: 'Enter' }); });
    await choose('Roll...');

    // The token's centre: x 2.5 squares, and 1.5 squares down from the top.
    expect(placeOf(screen.getByPlaceholderText('e.g. 2d6+3').closest<HTMLElement>('div.fixed')!)).toEqual(['125px', '75px']);
  });

  // A picker is not modal, and a choice from a menu Enter opened gives the
  // keys back to the map, so another token's menu can be used beside it.
  /** Select `id`, open its menu with Enter, and choose `label`. */
  async function chooseByKeyboard(id: string, label: string) {
    act(() => { useGameStore.getState().selectToken(id); });
    const map = screen.getByRole('application', { name: 'Map' });
    map.focus();
    await act(async () => { fireEvent.keyDown(map, { key: 'Enter' }); });
    await choose(label);
  }

  it("keeps a creature's open picker where it opened while another token's menu is used", async () => {
    render(<MapCanvas onEditToken={vi.fn()} />);
    show(goblin({ position: { x: 2, y: 18 } }), token('tok-wolf', 'Wolf', 10, 5));
    await chooseByKeyboard('tok-goblin', 'Roll...');
    const picker = screen.getByPlaceholderText('e.g. 2d6+3').closest<HTMLElement>('div.fixed')!;
    expect(placeOf(picker)).toEqual(['125px', '75px']);

    await chooseByKeyboard('tok-wolf', 'Edit Token');

    expect(placeOf(picker)).toEqual(['125px', '75px']);
  });

  it("keeps a character's open picker where it opened while another token's menu is used", async () => {
    render(<MapCanvas onEditToken={vi.fn()} />);
    show(hero('char-alice', 'alice', { position: { x: 2, y: 18 } }), token('tok-wolf', 'Wolf', 10, 5));
    await chooseByKeyboard('tok-hero', 'Roll...');
    const picker = pickerAround('Loading rolls…');
    expect(placeOf(picker)).toEqual(['125px', '75px']);

    await chooseByKeyboard('tok-wolf', 'Hide from Players');

    expect(placeOf(picker)).toEqual(['125px', '75px']);
  });
});

describe('the door menu', () => {
  const door = (type: WallSegment['type']): WallSegment => ({ id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type });
  /** The map with the door on it, shown. */
  function renderWithDoor(type: WallSegment['type']) {
    h.set({ currentMap: mapNamed('map-a', { wallSegments: [door(type)] }) });
    render(<MapCanvas />);
  }
  /** Right-click just below the middle of the door, which no token stands on. */
  const rightClickDoor = () => fireEvent.contextMenu(surface(), { clientX: 150, clientY: 104 });
  const sentDoors = () => sentOf('wall:update').map((p) => (p as { segment: WallSegment }).segment.type);

  it("shows the DM a closed door's state, Open Door and Lock Door, at the point", () => {
    renderWithDoor('door-closed');
    rightClickDoor();

    expect(theMenu().className).toBe(MENU);
    expect(theMenu().getAttribute('style')).toBe('left: 150px; top: 104px;');
    expect(rows()).toEqual(['# 🚪 Closed Door', 'Open Door (brand)', 'Lock Door (danger)']);
  });

  it.each([
    ['door-open', ['# 🚪 Open Door', 'Close Door (brand)', 'Lock Door (danger)']],
    ['door-locked', ['# 🔒 Locked Door', 'Unlock Door (brand)']],
  ] as const)("shows the DM a door that is %s its state and what it may become", (type, expected) => {
    renderWithDoor(type);
    rightClickDoor();

    expect(rows()).toEqual(expected);
  });

  it.each([
    ['door-closed', ['# 🚪 Closed Door', 'Open Door (brand)']],
    ['door-open', ['# 🚪 Open Door', 'Close Door (brand)']],
    ['door-locked', ['# 🔒 Locked Door', '“This door is locked.”']],
  ] as const)('shows a player a door that is %s with nothing to lock or unlock', (type, expected) => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER')] });
    renderWithDoor(type);
    rightClickDoor();

    expect(rows()).toEqual(expected);
  });

  it('shows a spectator no door menu', () => {
    h.set({ userRole: 'SPECTATOR', memberships: [MEMBERS.me('SPECTATOR')] });
    renderWithDoor('door-closed');
    rightClickDoor();

    expect(openMenu()).toBeNull();
  });

  it.each([
    ['door-closed', 'Open Door', 'door-open'],
    ['door-open', 'Close Door', 'door-closed'],
    ['door-closed', 'Lock Door', 'door-locked'],
    ['door-open', 'Lock Door', 'door-locked'],
    ['door-locked', 'Unlock Door', 'door-closed'],
  ] as const)("on a door that is %s, the DM's %s sends the change and closes the menu", (type, label, sent) => {
    renderWithDoor(type);
    rightClickDoor();
    fireEvent.click(screen.getByText(label));

    expect(sentDoors()).toEqual([sent]);
    expect(openMenu()).toBeNull();
  });

  it("sends a player's Open Door and closes the menu", () => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER')] });
    renderWithDoor('door-closed');
    rightClickDoor();
    fireEvent.click(screen.getByText('Open Door'));

    expect(sentDoors()).toEqual(['door-open']);
    expect(openMenu()).toBeNull();
  });

  it("leaves a locked door's line of text inert, the menu open", () => {
    h.set({ userRole: 'PLAYER', memberships: [MEMBERS.me('PLAYER')] });
    renderWithDoor('door-locked');
    rightClickDoor();
    fireEvent.click(screen.getByText('This door is locked.'));

    expect(sentDoors()).toEqual([]);
    expect(openMenu()).not.toBeNull();
  });

  it('closes on a click elsewhere', () => {
    renderWithDoor('door-closed');
    rightClickDoor();
    fireEvent.click(document.body);

    expect(openMenu()).toBeNull();
  });
});

// The page draws the map in a column of its panel group, and the panel
// library takes a press in a divider's strip whenever the pressed element is
// inside the group ([data-group]), whatever is drawn over the divider. A menu
// that ran over the divider beside the map lost the presses on its items.
describe('where the menus are drawn', () => {
  it('draws the token menu on the body, outside the panel group', () => {
    render(<div data-group><MapCanvas /></div>);
    show(goblin());
    rightClick(0, 19);

    expect(theMenu().closest('[data-group]')).toBeNull();
    expect(theMenu().parentElement).toBe(document.body);
  });

  it('draws the door menu on the body, outside the panel group', () => {
    h.set({ currentMap: mapNamed('map-a', { wallSegments: [{ id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'door-closed' }] }) });
    render(<div data-group><MapCanvas /></div>);
    fireEvent.contextMenu(surface(), { clientX: 150, clientY: 104 });

    expect(rows()).toEqual(['# 🚪 Closed Door', 'Open Door (brand)', 'Lock Door (danger)']);
    expect(theMenu().closest('[data-group]')).toBeNull();
    expect(theMenu().parentElement).toBe(document.body);
  });
});

// A right-click or a long-press sends no click, so the click in the window
// that closes the map's menus never came when one opened a menu elsewhere.
describe('when a menu opens beside the map', () => {
  const alice: RosterMember = {
    userId: 'alice', userName: 'Alice', userAvatar: null, role: CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
    characters: [{ id: 'char-alice', name: 'Brannoc', tokenImageUrl: null, gameSystem: null, userId: 'alice', hp: { current: 7, max: 10, temp: 0 } }],
  };
  const point = { clientX: 40, clientY: 60 };

  beforeEach(() => {
    h.api.getCampaignCharacters.mockReset().mockResolvedValue({ roster: [alice] });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("closes the token menu as a right-click opens a roster character's menu", async () => {
    render(<><MapCanvas /><CampaignRoster /></>);
    show(goblin());
    const row = await screen.findByText('Brannoc');
    rightClick(0, 19);
    expect(openMenu()).not.toBeNull();

    // A right-click as a browser sends it: the press, its release and the context menu.
    mouse.down(row, point, 2);
    fireEvent.mouseDown(row, { ...point, button: 2 });
    mouse.up(row, point, 2);
    fireEvent.mouseUp(row, { ...point, button: 2 });
    fireEvent.contextMenu(row, point);

    expect(openCharacterMenu()).not.toBeNull();
    expect(openMenu()).toBeNull();
  });

  it("closes the door menu as a long-press opens a roster character's menu", async () => {
    h.set({ currentMap: mapNamed('map-a', { wallSegments: [{ id: 'd1', x1: 100, y1: 100, x2: 200, y2: 100, type: 'door-closed' }] }) });
    render(<><MapCanvas /><CampaignRoster /></>);
    const row = await screen.findByText('Brannoc');
    fireEvent.contextMenu(surface(), { clientX: 150, clientY: 104 });
    expect(rows()).toEqual(['# 🚪 Closed Door', 'Open Door (brand)', 'Lock Door (danger)']);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const finger = contact('touch', 1);
    finger.down(row, point);
    act(() => { vi.advanceTimersByTime(500); });
    finger.up(row, point);

    expect(openCharacterMenu()).not.toBeNull();
    expect(openMenu()).toBeNull();
  });
});
