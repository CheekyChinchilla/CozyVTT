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
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignRole, type RosterMember } from '@/types';
import { useGameStore } from '@/stores/gameStore';

const getCampaignCharacters = vi.fn();
const socket = { on: vi.fn(), off: vi.fn() };

vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: () => undefined }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign: { id: 'c1', memberships: [] }, currentMap: null, userRole: 'DM' }),
}));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm' } }) }));
vi.mock('@/services/api', () => {
  const client = { getCampaignCharacters: (...a: unknown[]) => getCampaignCharacters(...a), getCharacter: vi.fn() };
  return { api: client, default: client };
});

import CampaignRoster from '../CampaignRoster';

const member = (userId: string, userName: string, hp: number | null = null): RosterMember => ({
  userId, userName, userAvatar: null, role: userId === 'dm' ? CampaignRole.DM : CampaignRole.PLAYER, joinedAt: '2026-10-01T00:00:00.000Z',
  characters: hp === null ? [] : [{ id: `${userId}-char`, name: `${userName}'s hero`, tokenImageUrl: null, gameSystem: null, userId, hp: { current: hp, max: 10, temp: 0 } }],
});

beforeEach(() => {
  getCampaignCharacters.mockReset().mockResolvedValue({ roster: [member('dm', 'Mara'), member('p1', 'Ash', 7)] });
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
