/**
 * A player removed from a campaign can still read and download their own
 * notes and saved rolls from it, from the dashboard.
 *
 * The campaign page is closed to someone no longer in the campaign, and the
 * notes panel lives there, so before this they could not reach what they
 * had written at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LeftCampaignDetail, LeftCampaignSummary } from '@/types';
import LeftCampaignNotes from '../LeftCampaignNotes';
import { leftCampaignMarkdown } from '@/utils/leftCampaignNotes';

const api = vi.hoisted(() => ({
  listLeftCampaigns: vi.fn(),
  getLeftCampaign: vi.fn(),
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
  notes: [
    { ...summary.notes[0], content: 'The baron **lied** about the mill.' },
    { ...summary.notes[1], content: 'Forty gold, one cursed ring.' },
  ],
  macros: [macro],
};

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
});

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

  it('opens a campaign to read each note and the saved rolls', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Open your notes from Curse of the Left' }));
    const dialog = await screen.findByRole('dialog', { name: 'Your Notes From Curse of the Left' });
    expect(api.getLeftCampaign).toHaveBeenCalledWith('c-1');

    // The most recently edited note is open first.
    expect(await within(dialog).findByText('lied')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Loot' }));
    expect(within(dialog).getByText('Forty gold, one cursed ring.')).toBeInTheDocument();
    expect(within(dialog).getByText('Sneak attack')).toBeInTheDocument();
    expect(within(dialog).getByText('3d6')).toBeInTheDocument();
  });

  it('downloads everything kept in a campaign as one file', async () => {
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Open your notes from Curse of the Left' }));
    const dialog = await screen.findByRole('dialog', { name: 'Your Notes From Curse of the Left' });
    await within(dialog).findByText('lied');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
    expect(download).toHaveBeenCalledWith('Curse of the Left notes.md', leftCampaignMarkdown(detail), 'text/markdown');
  });

  it('says why a campaign could not be opened', async () => {
    api.getLeftCampaign.mockRejectedValue({ response: { status: 404, data: { message: 'You have no notes or dice macros in that campaign' } } });
    renderIt();
    await userEvent.click(await screen.findByRole('button', { name: 'Open your notes from Curse of the Left' }));
    const dialog = await screen.findByRole('dialog', { name: 'Your Notes From Curse of the Left' });
    expect(await within(dialog).findByText('You have no notes or dice macros in that campaign')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeDisabled();
  });
});

describe('the downloaded file', () => {
  it('holds every note, title and text, and every saved roll', () => {
    expect(leftCampaignMarkdown(detail)).toBe(
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
