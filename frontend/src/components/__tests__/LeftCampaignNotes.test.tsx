/**
 * A player removed from a campaign can still read and download their own
 * notes and saved rolls from it, from the dashboard.
 *
 * The campaign page is closed to someone no longer in the campaign, and the
 * notes panel lives there, so before this they could not reach what they
 * had written at all.
 *
 * The server sends a note's text one note at a time, so the dialog fetches
 * the note being read, and Download fetches the rest in turn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LeftCampaignDetail, LeftCampaignSummary, PersonalNote } from '@/types';
import LeftCampaignNotes from '../LeftCampaignNotes';
import { leftCampaignMarkdown } from '@/utils/leftCampaignNotes';

const api = vi.hoisted(() => ({
  listLeftCampaigns: vi.fn(),
  getLeftCampaign: vi.fn(),
  getLeftCampaignNote: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));

const download = vi.hoisted(() => vi.fn());
vi.mock('@/utils/download', () => ({ downloadTextFile: download }));

const macro = {
  id: 'm-1', userId: 'u-1', campaignId: 'c-1', name: 'Sneak attack', expression: '3d6',
  createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
};

const summary: LeftCampaignSummary = {
  id: 'c-1',
  name: 'Curse of the Left',
  notes: [
    { id: 'n-1', title: 'Suspects', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z' },
    { id: 'n-2', title: 'Loot', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
  ],
  macros: [macro],
};

const detail: LeftCampaignDetail = {
  campaign: { id: 'c-1', name: 'Curse of the Left' },
  notes: summary.notes,
  macros: [macro],
};

const fullNotes: PersonalNote[] = [
  { ...summary.notes[0], content: 'The baron **lied** about the mill.' },
  { ...summary.notes[1], content: 'Forty gold, one cursed ring.' },
];

const answerNote = (_campaignId: string, noteId: string) => {
  const note = fullNotes.find((n) => n.id === noteId);
  return note ? Promise.resolve({ note }) : Promise.reject({ response: { status: 404, data: { message: 'Note not found' } } });
};

const rateLimited = { response: { status: 429, data: { message: 'Rate limit exceeded. Please slow down.' } } };

const noteCalls = (noteId: string) => api.getLeftCampaignNote.mock.calls.filter(([, id]) => id === noteId).length;

function renderIt() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LeftCampaignNotes />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listLeftCampaigns.mockResolvedValue({ campaigns: [summary] });
  api.getLeftCampaign.mockResolvedValue(detail);
  api.getLeftCampaignNote.mockImplementation(answerNote);
});

async function openDialog() {
  renderIt();
  await userEvent.click(await screen.findByRole('button', { name: 'Open your notes from Curse of the Left' }));
  return screen.findByRole('dialog', { name: 'Your Notes From Curse of the Left' });
}

describe('notes from campaigns you have left', () => {
  it('shows nothing when there are none', async () => {
    api.listLeftCampaigns.mockResolvedValue({ campaigns: [] });
    const { container } = renderIt();
    await waitFor(() => expect(api.listLeftCampaigns).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each campaign with what is kept there', async () => {
    renderIt();
    const section = await screen.findByRole('region', { name: 'Notes From Campaigns You Have Left' });
    expect(within(section).getByText('Curse of the Left')).toBeInTheDocument();
    expect(within(section).getByText('2 notes, 1 saved roll')).toBeInTheDocument();
    expect(within(section).getByText(/deleted with it/)).toBeInTheDocument();
  });

  it('opens a campaign to read each note and the saved rolls, fetching a note when it is read', async () => {
    const dialog = await openDialog();
    expect(api.getLeftCampaign).toHaveBeenCalledWith('c-1');

    // The most recently edited note is open first, and only its text is fetched.
    expect(await within(dialog).findByText('lied')).toBeInTheDocument();
    expect(api.getLeftCampaignNote).toHaveBeenCalledWith('c-1', 'n-1');
    expect(noteCalls('n-2')).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Loot' }));
    expect(await within(dialog).findByText('Forty gold, one cursed ring.')).toBeInTheDocument();
    expect(api.getLeftCampaignNote).toHaveBeenCalledWith('c-1', 'n-2');
    expect(within(dialog).getByText('Sneak attack')).toBeInTheDocument();
    expect(within(dialog).getByText('3d6')).toBeInTheDocument();
  });

  it('says why a note could not be read', async () => {
    api.getLeftCampaignNote.mockRejectedValue({ response: { status: 404, data: { message: 'Note not found' } } });
    const dialog = await openDialog();
    expect(await within(dialog).findByText('Note not found')).toBeInTheDocument();
  });

  it('downloads everything kept in a campaign as one file, fetching each note once', async () => {
    const dialog = await openDialog();
    await within(dialog).findByText('lied');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(download).toHaveBeenCalledWith(
      'Curse of the Left notes.md',
      leftCampaignMarkdown({ campaign: detail.campaign, notes: fullNotes, macros: detail.macros }),
      'text/markdown'
    );
    // The note already open is not fetched again.
    expect(noteCalls('n-1')).toBe(1);
    expect(noteCalls('n-2')).toBe(1);
  });

  it('fetches the notes for a download one at a time', async () => {
    let inFlight = 0;
    let most = 0;
    api.getLeftCampaignNote.mockImplementation(async (campaignId: string, noteId: string) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return answerNote(campaignId, noteId);
    });
    const dialog = await openDialog();
    await within(dialog).findByText('lied');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(most).toBe(1);
  });

  it('says to wait and try again when the server asks it to slow down, keeping what it fetched', async () => {
    api.getLeftCampaignNote.mockImplementation((campaignId: string, noteId: string) =>
      noteId === 'n-2' && noteCalls('n-2') === 1 ? Promise.reject(rateLimited) : answerNote(campaignId, noteId)
    );
    const dialog = await openDialog();
    await within(dialog).findByText('lied');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    expect(
      await within(dialog).findByText(
        'Too many requests at once. Wait a minute, then press Download again. The notes fetched so far are kept.'
      )
    ).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(noteCalls('n-1')).toBe(1);
    expect(noteCalls('n-2')).toBe(2);
  });

  it('says why a campaign could not be opened', async () => {
    api.getLeftCampaign.mockRejectedValue({
      response: { status: 404, data: { message: 'You have not left that campaign, or have no notes or dice macros in it' } },
    });
    const dialog = await openDialog();
    expect(
      await within(dialog).findByText('You have not left that campaign, or have no notes or dice macros in it')
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeDisabled();
  });
});

describe('the downloaded file', () => {
  it('holds every note, title and text, and every saved roll', () => {
    expect(leftCampaignMarkdown({ campaign: detail.campaign, notes: fullNotes, macros: detail.macros })).toBe(
      [
        '# Curse of the Left',
        '',
        '## Suspects',
        '',
        'The baron **lied** about the mill.',
        '',
        '## Loot',
        '',
        'Forty gold, one cursed ring.',
        '',
        '## Saved rolls',
        '',
        '- Sneak attack: `3d6`',
        '',
      ].join('\n')
    );
  });
});
