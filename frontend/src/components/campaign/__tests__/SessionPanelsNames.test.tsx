/**
 * What each session panel is: on the desktop a tab panel named by its tab in
 * the rail; on the compact layout, where the bar's buttons are no tabs and
 * Notes and Session have none, a group with its own name.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const nothing = vi.hoisted(() => () => ({ default: () => null }));
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket: null }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('../ChatPanel', nothing);
vi.mock('../DiceRoller', nothing);
vi.mock('../VibeTracker', nothing);
vi.mock('../InitiativeTracker', nothing);
vi.mock('../SessionControls', nothing);
vi.mock('../SessionHistory', nothing);
vi.mock('../PersonalNotes', nothing);

import SessionPanels from '../SessionPanels';
import { LayoutProvider } from '@/contexts/LayoutContext';

const PANELS = ['chat', 'dice', 'initiative', 'notes', 'session'];

it('names each panel by its tab on the desktop', () => {
  const { container } = render(<SessionPanels />);
  const panels = Array.from(container.querySelectorAll('[role="tabpanel"]'));
  expect(panels.map((p) => p.getAttribute('aria-labelledby'))).toEqual(PANELS.map((tab) => `session-tab-${tab}`));
  expect(panels.every((p) => !p.hasAttribute('aria-label'))).toBe(true);
});

it('names each panel itself on the compact layout, as a group and no tab panel', () => {
  render(<LayoutProvider compact><SessionPanels /></LayoutProvider>);
  // The open one, Chat, is the one a screen reader finds; the others are hidden.
  expect(screen.getByRole('group', { name: 'Chat' })).toBeInTheDocument();
  expect(screen.queryByRole('tabpanel')).toBeNull();
  const panels = PANELS.map((tab) => document.getElementById(`session-tabpanel-${tab}`) as HTMLElement);
  expect(panels.map((p) => p.getAttribute('role'))).toEqual(['group', 'group', 'group', 'group', 'group']);
  expect(panels.map((p) => p.getAttribute('aria-label'))).toEqual(['Chat', 'Dice', 'Initiative', 'Notes', 'Session']);
  expect(panels.every((p) => !p.hasAttribute('aria-labelledby'))).toBe(true);
});
