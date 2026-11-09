/**
 * The compact layout's Initiative sheet names the panel once. The tracker
 * kept its own heading and fold inside the sheet, under the sheet's own
 * heading, and folding it there only hid the tracker. On the compact layout
 * the round, or the count of combatants ready, stands alone; the desktop's
 * tracker keeps its heading and fold.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import InitiativeTracker from '../InitiativeTracker';
import { LayoutProvider } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import type { CombatantEntry } from '@/types';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'DM', currentMap: { id: 'map-1' }, viewedMap: { id: 'map-1' } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, isConnected: true }),
}));

const entry = (tokenId: string, name: string, initiative: number): CombatantEntry => ({
  tokenId, mapId: 'map-1', name, imageUrl: '', initiative, hp: null, type: 'npc', disposition: null, characterId: null,
});

const Compact = ({ children }: { children: ReactNode }) => <LayoutProvider compact>{children}</LayoutProvider>;

beforeEach(() => {
  useGameStore.getState().setTokens([]);
  useGameStore.getState().setCombatState({ active: true, round: 3, currentTokenId: null, combatants: [entry('g', 'Goblin', 12)] });
});

it('has no heading or fold of its own on the compact layout, and shows the round', () => {
  render(<InitiativeTracker />, { wrapper: Compact });
  expect(screen.queryByText('Initiative Tracker')).toBeNull();
  expect(screen.queryByRole('button', { name: /Initiative Tracker/ })).toBeNull();
  expect(screen.getByText('Round 3')).toBeTruthy();
  expect(screen.getByText('Goblin')).toBeTruthy();
});

it('keeps its heading and fold on the desktop', () => {
  render(<InitiativeTracker />);
  expect(screen.getByRole('button', { name: /Initiative Tracker/ })).toBeTruthy();
});
