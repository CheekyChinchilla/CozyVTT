/**
 * The initiative tracker on a touch screen.
 *
 * A combatant's die and bin were 22 pixels square, at the end of a row that
 * also holds the grip, the picture, the name, the disposition and the value.
 * At the 44 a finger needs they do not fit beside all that in a 300-pixel
 * rail, so on a touch screen the row lets them go to a line of their own,
 * on the right. jsdom evaluates no media query, so the classes are what is
 * checked.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InitiativeTracker from '../InitiativeTracker';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry, Token } from '@/types';
import { TokenLayer, TokenType } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'DM', currentMap: { id: 'map-a' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, isConnected: true }),
}));

const goblinToken: Token = {
  id: 'goblin', name: 'Goblin', characterId: null, imageUrl: '', position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
  layer: TokenLayer.TOKEN, visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  type: TokenType.NPC, disposition: null, hp: null, showHpBar: false, notes: '', initiative: null, obscured: false,
};
const goblin: CombatantEntry = {
  tokenId: 'goblin', mapId: 'map-a', name: 'Goblin', imageUrl: '', initiative: 7, hp: null, type: 'npc', disposition: null,
};

beforeEach(() => {
  useGameStore.getState().setTokens([goblinToken]);
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
