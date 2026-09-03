/**
 * Past sessions, and the DM's ability to edit them.
 *
 * The editing control is the remedy for a specific exposure: session notes were
 * saved for as long as the end-session box has existed, but nothing displayed
 * them, so switching the panel on publishes every recap ever written — including
 * any a DM wrote as a private reminder. The pencil has to be there for the DM
 * and absent for everyone else, which is what these pin.
 *
 * The server is the actual boundary; hiding the button is not a permission
 * check. That side is covered in sessionHistory.e2e.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SessionHistory from '../SessionHistory';
import type { SessionSummary } from '@/types';

const campaignState = {
  campaign: { id: 'camp-1' } as { id: string } | null,
  activeSession: null as { id: string } | null,
  userRole: 'DM' as string | null,
};

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => campaignState,
}));

vi.mock('@/services/api', () => {
  const client = { listSessions: vi.fn(), updateSessionNotes: vi.fn() };
  return { api: client, default: client };
});

import api from '@/services/api';

const listSessions = api.listSessions as ReturnType<typeof vi.fn>;
const updateSessionNotes = api.updateSessionNotes as ReturnType<typeof vi.fn>;

const session = (over: Partial<SessionSummary> = {}): SessionSummary => ({
  id: 's1',
  sessionNumber: 1,
  startedAt: '2026-01-01T18:00:00.000Z',
  endedAt: '2026-01-01T22:00:00.000Z',
  notes: 'The party met the twisted tree.',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  campaignState.userRole = 'DM';
  listSessions.mockResolvedValue({ sessions: [session()] });
  updateSessionNotes.mockImplementation((_c: string, _id: string, notes: string) =>
    Promise.resolve({ session: session({ notes: notes.trim() ? notes.trim() : null }) })
  );
});

const editButton = () => screen.queryByLabelText('Edit notes for session 1');

describe('SessionHistory', () => {
  it('shows a past session and its notes', async () => {
    render(<SessionHistory />);
    expect(await screen.findByText('The party met the twisted tree.')).toBeInTheDocument();
  });

  it('offers the DM an edit button', async () => {
    render(<SessionHistory />);
    await waitFor(() => expect(editButton()).toBeInTheDocument());
  });

  it.each(['PLAYER', 'SPECTATOR', null])('does not offer one to %s', async (role) => {
    campaignState.userRole = role;
    render(<SessionHistory />);
    await screen.findByText('The party met the twisted tree.');
    expect(editButton()).not.toBeInTheDocument();
  });

  it('saves a rewritten recap', async () => {
    render(<SessionHistory />);
    await waitFor(() => expect(editButton()).toBeInTheDocument());
    fireEvent.click(editButton()!);

    fireEvent.change(screen.getByLabelText('Notes for session 1'), {
      target: { value: 'A tidier account.' },
    });
    fireEvent.click(screen.getByLabelText('Save notes'));

    await waitFor(() =>
      expect(updateSessionNotes).toHaveBeenCalledWith('camp-1', 's1', 'A tidier account.')
    );
    expect(await screen.findByText('A tidier account.')).toBeInTheDocument();
  });

  it('clears the recap when saved empty', async () => {
    render(<SessionHistory />);
    await waitFor(() => expect(editButton()).toBeInTheDocument());
    fireEvent.click(editButton()!);

    fireEvent.change(screen.getByLabelText('Notes for session 1'), { target: { value: '' } });
    // The panel says what saving empty will do, rather than leaving it to be
    // discovered.
    expect(screen.getByText('Saving empty will clear these notes.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Save notes'));
    await waitFor(() => expect(updateSessionNotes).toHaveBeenCalledWith('camp-1', 's1', ''));
    expect(await screen.findByText('No notes were written.')).toBeInTheDocument();
  });

  it('cancels without sending anything', async () => {
    render(<SessionHistory />);
    await waitFor(() => expect(editButton()).toBeInTheDocument());
    fireEvent.click(editButton()!);

    fireEvent.change(screen.getByLabelText('Notes for session 1'), {
      target: { value: 'discard me' },
    });
    fireEvent.click(screen.getByLabelText('Cancel editing'));

    expect(updateSessionNotes).not.toHaveBeenCalled();
    expect(screen.getByText('The party met the twisted tree.')).toBeInTheDocument();
  });

  it('keeps the text on screen when the save fails', async () => {
    updateSessionNotes.mockRejectedValue(new Error('nope'));
    render(<SessionHistory />);
    await waitFor(() => expect(editButton()).toBeInTheDocument());
    fireEvent.click(editButton()!);

    fireEvent.change(screen.getByLabelText('Notes for session 1'), {
      target: { value: 'worth keeping' },
    });
    fireEvent.click(screen.getByLabelText('Save notes'));

    // Still in the editor, with what was typed, rather than silently reverted.
    await waitFor(() =>
      expect(screen.getByLabelText('Notes for session 1')).toHaveValue('worth keeping')
    );
  });
});
