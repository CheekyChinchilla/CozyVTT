/**
 * Personal notes autosave.
 *
 * These pin the one behaviour a notes editor cannot get wrong: text that has
 * been typed must reach the server. Autosave is debounced, so there is always a
 * window in which the newest keystrokes exist only in the component — and the
 * component can go away during that window, by switching notes or by closing
 * the panel.
 *
 * It did: the debounce cleanup cancelled the pending write and nothing replaced
 * it, so up to 1.2 seconds of writing was dropped while the panel displayed
 * "Saved automatically" throughout. That is the worst shape a data-loss bug can
 * take — silent, and actively reassuring.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PersonalNotes from '../PersonalNotes';
import type { PersonalNote, PersonalNoteSummary } from '@/types';

const campaign = { id: 'camp-1' };

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ campaign }),
}));

vi.mock('@/services/api', () => {
  const client = {
    listNotes: vi.fn(),
    getNote: vi.fn(),
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
  };
  return { api: client, default: client };
});

import api from '@/services/api';

const listNotes = api.listNotes as ReturnType<typeof vi.fn>;
const getNote = api.getNote as ReturnType<typeof vi.fn>;
const updateNote = api.updateNote as ReturnType<typeof vi.fn>;
const deleteNote = api.deleteNote as ReturnType<typeof vi.fn>;

const summary = (id: string, title: string): PersonalNoteSummary => ({
  id,
  title,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const full = (id: string, title: string, content: string): PersonalNote => ({
  ...summary(id, title),
  content,
});

/** Open the picker's first note and wait for its body to arrive. */
async function openNote(id: string) {
  fireEvent.change(screen.getByLabelText('Choose a note'), { target: { value: id } });
  await waitFor(() => expect(getNote).toHaveBeenCalledWith('camp-1', id));
  // openNote clears its loading flag on a zero-delay timer.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // `shouldAdvanceTime` lets testing-library's waitFor keep polling; without it
  // the fake clock never moves and every wait deadlocks.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  listNotes.mockResolvedValue({ notes: [summary('n1', 'First'), summary('n2', 'Second')] });
  getNote.mockImplementation((_c: string, id: string) =>
    Promise.resolve({ note: full(id, id === 'n1' ? 'First' : 'Second', `body of ${id}`) })
  );
  updateNote.mockResolvedValue({ note: full('n1', 'First', '') });
  deleteNote.mockResolvedValue({ message: 'ok' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PersonalNotes autosave', () => {
  it('saves after a pause in typing', async () => {
    render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'a thought' } });
    expect(updateNote).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', {
      content: 'a thought',
      title: 'First',
    });
  });

  it('does not save merely opening a note', async () => {
    render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(updateNote).not.toHaveBeenCalled();
  });

  it('keeps the text when the panel closes mid-debounce', async () => {
    const { unmount } = render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    fireEvent.change(screen.getByLabelText('Note content'), {
      target: { value: 'written but not yet saved' },
    });

    // Well inside the debounce — nothing has been sent.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(updateNote).not.toHaveBeenCalled();

    unmount();

    expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', {
      content: 'written but not yet saved',
      title: 'First',
    });
  });

  it('keeps the text when another note is opened mid-debounce', async () => {
    render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'about to switch' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await openNote('n2');

    // Saved against the note it was typed in, not the one now on screen.
    expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', {
      content: 'about to switch',
      title: 'First',
    });
  });

  it('does not resurrect a deleted note on the way out', async () => {
    const { unmount } = render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'doomed text' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    fireEvent.click(screen.getByLabelText('Delete note'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteNote).toHaveBeenCalledWith('camp-1', 'n1'));

    updateNote.mockClear();
    unmount();
    expect(updateNote).not.toHaveBeenCalled();
  });

  /**
   * Renaming used to PUT on every keystroke: typing a title sent one request per
   * character, with no ordering guarantee between the responses. It rides the
   * same debounce as the body now.
   */
  describe('renaming', () => {
    const rename = (to: string) =>
      fireEvent.change(screen.getByLabelText('Note title'), { target: { value: to } });

    it('does not send a request per keystroke', async () => {
      render(<PersonalNotes />);
      await waitFor(() => expect(listNotes).toHaveBeenCalled());
      await openNote('n1');

      for (const partial of ['A', 'An', 'An ', 'An i', 'An id', 'An ide', 'An idea']) {
        rename(partial);
      }
      expect(updateNote).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });

      expect(updateNote).toHaveBeenCalledTimes(1);
      expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', {
        content: 'body of n1',
        title: 'An idea',
      });
    });

    it('shows the new title in the picker as it is typed', async () => {
      render(<PersonalNotes />);
      await waitFor(() => expect(listNotes).toHaveBeenCalled());
      await openNote('n1');

      rename('Renamed');
      expect(screen.getByRole('option', { name: 'Renamed' })).toBeInTheDocument();
    });

    it('keeps a rename that has not been saved yet when the panel closes', async () => {
      const { unmount } = render(<PersonalNotes />);
      await waitFor(() => expect(listNotes).toHaveBeenCalled());
      await openNote('n1');

      rename('Nearly lost');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      unmount();

      expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', {
        content: 'body of n1',
        title: 'Nearly lost',
      });
    });

    it('does not send a blank title, which the server would refuse', async () => {
      render(<PersonalNotes />);
      await waitFor(() => expect(listNotes).toHaveBeenCalled());
      await openNote('n1');

      rename('   ');
      fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'still saves' } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200);
      });

      // The body still reaches the server; the title is simply left alone.
      expect(updateNote).toHaveBeenCalledWith('camp-1', 'n1', { content: 'still saves' });
    });
  });

  it('reports unsaved changes rather than claiming everything is saved', async () => {
    render(<PersonalNotes />);
    await waitFor(() => expect(listNotes).toHaveBeenCalled());
    await openNote('n1');

    expect(screen.getByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Note content'), { target: { value: 'typing' } });
    expect(screen.getByText('Unsaved changes…')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });
});
