/**
 * A press on the roster's menu where it lies over the divider beside the
 * party column, with the real panel library. The library takes a press in a
 * divider's strip (44 pixels on a touch screen, 10 with a mouse) whenever
 * the pressed element is inside its group, and looks at what is drawn on top
 * only for an element outside the group. It cancels a press it takes, and
 * WebKit then sends no click, so a tap on the item did nothing. The menu is
 * drawn on the body, so a press on its item stays the item's.
 *
 * jsdom lays every box out at 0 by 0 at the origin, so the divider's strip
 * covers the origin: a press there is in it, and one at (500, 500) is not.
 * This rests on jsdom's empty layout and on how this release of the library
 * reads it; the first test shows the strip still takes a press on the
 * column's own content, so a library that stops seeing the strip here fails
 * it.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const h = vi.hoisted(() => ({
  api: { getCampaignCharacters: vi.fn() },
}));

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', memberships: [{ userId: 'dm', role: 'DM' }] },
    currentMap: { id: 'map-1', width: 20, height: 20 },
    userRole: 'DM',
  }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: { on: vi.fn(), off: vi.fn() } }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => ({ api: h.api, default: h.api }));

import CampaignRoster from '../CampaignRoster';

beforeAll(() => {
  // jsdom has none; the library builds one for each group.
  class RO { observe() {} unobserve() {} disconnect() {} }
  Object.defineProperty(window, 'ResizeObserver', { value: RO, configurable: true });
});

beforeEach(() => {
  const ash: RosterMember = {
    userId: 'p1', userName: 'Ash', userAvatar: null, role: CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
    characters: [{ id: 'p1-char', name: "Ash's hero", tokenImageUrl: null, gameSystem: null, userId: 'p1', hp: { current: 7, max: 10, temp: 0 } }],
  };
  h.api.getCampaignCharacters.mockReset().mockResolvedValue({ roster: [ash] });
  useGameStore.getState().clearGameState();
});

/** The party column and the map, as the page builds them, with the page's strip. */
async function openRosterMenu() {
  render(
    <Group orientation="horizontal" resizeTargetMinimumSize={{ coarse: 44, fine: 10 }}>
      <Panel id="party" defaultSize={50}>
        <aside><CampaignRoster /></aside>
      </Panel>
      <Separator />
      <Panel id="map" defaultSize={50}>
        <section />
      </Panel>
    </Group>,
  );
  fireEvent.contextMenu(await screen.findByText("Ash's hero"), { clientX: 40, clientY: 60 });
  return screen.getByRole('button', { name: 'View Character Sheet' });
}

/** A primary press on an element at (at, at) and its release: whether the library took the press. */
function press(element: Element, pointerType: 'touch' | 'mouse', at = 0): boolean {
  const point = { pointerType, pointerId: 7, isPrimary: true, button: 0, clientX: at, clientY: at };
  const down = createEvent.pointerDown(element, { ...point, buttons: 1 });
  fireEvent(element, down);
  fireEvent.pointerUp(element, { ...point, buttons: 0 });
  return down.defaultPrevented;
}

it("takes a press in the strip on the column's own content for the divider", async () => {
  await openRosterMenu();
  expect(press(screen.getByText('Campaign Roster'), 'touch')).toBe(true);
});

it("leaves a finger's press on the menu's item over the divider to the item", async () => {
  expect(press(await openRosterMenu(), 'touch')).toBe(false);
});

it("leaves a mouse's press on the menu's item over the divider to the item", async () => {
  expect(press(await openRosterMenu(), 'mouse')).toBe(false);
});

it('never takes a press away from the divider', async () => {
  expect(press(await openRosterMenu(), 'touch', 500)).toBe(false);
});
