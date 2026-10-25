/**
 * The session rail's tabs fit the rail.
 *
 * Five labelled tabs need about 400 pixels and the rail is often narrower,
 * so the last one, **Session**, was cut off at its edge. Below that width
 * only the open tab shows its label (a container query, which only a
 * browser can measure); the others keep their names for screen readers and
 * show them as a hover title.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

import SessionSidebar from '../SessionSidebar';

const label = (name: string) => screen.getByRole('tab', { name }).querySelector('span')!;

it('names every tab, and shows only the open tab\'s label in a narrow rail', () => {
  render(<SessionSidebar />);

  for (const name of ['Chat', 'Dice', 'Initiative', 'Notes', 'Session']) {
    expect(screen.getByRole('tab', { name }).getAttribute('title')).toBe(name);
  }
  expect(label('Chat').className).not.toMatch(/sr-only/);
  expect(label('Session').className).toMatch(/(^|\s)sr-only(\s|$)/);

  fireEvent.click(screen.getByRole('tab', { name: 'Session' }));

  expect(label('Session').className).not.toMatch(/sr-only/);
  expect(label('Chat').className).toMatch(/(^|\s)sr-only(\s|$)/);
});
