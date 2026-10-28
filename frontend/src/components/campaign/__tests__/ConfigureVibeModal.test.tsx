/**
 * The vibe period editor: pinned layout and the audio track picker.
 *
 * Layout: the Restore Defaults, Cancel and Save Periods buttons must stay on
 * screen while the period list scrolls. They used to sit below the list
 * inside one scrolling body, so on an ordinary window they were off the
 * bottom with nothing saying the dialog scrolls, and a DM reported the
 * editor had no save button at all.
 *
 * Audio: each period offers the tracks this DM may open to the table and
 * nothing else, an old free-text note shows and saves as no audio, and a
 * chosen track's id is what the save sends.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Asset, Campaign } from '@/types';
import { AssetScope, AssetType } from '@/types';

const mockState: { campaign: Partial<Campaign> } = { campaign: {} };
const updateVibeSettings = vi.fn();

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: mockState.campaign,
    updateVibeSettings,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm-user' } }),
}));

vi.mock('@/services/api', () => ({
  default: { updateVibeSettings: vi.fn(), listAssets: vi.fn() },
  api: { updateVibeSettings: vi.fn(), listAssets: vi.fn() },
}));

import api from '@/services/api';
import ConfigureVibeModal from '../ConfigureVibeModal';

const listAssets = api.listAssets as ReturnType<typeof vi.fn>;
const putVibe = api.updateVibeSettings as ReturnType<typeof vi.fn>;

function track(id: string, name: string, scope: AssetScope, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    name,
    type: AssetType.AUDIO,
    scope,
    uploadedById: 'dm-user',
    campaignId: null,
    ...extra,
  } as Asset;
}

const OWN = track('11111111-1111-4111-8111-111111111111', 'Battle Drums', AssetScope.USER);
const TABLE = track('22222222-2222-4222-8222-222222222222', 'Tavern Noise', AssetScope.CAMPAIGN, { campaignId: 'c1' });
const STRANGERS = track('33333333-3333-4333-8333-333333333333', 'Private Recording', AssetScope.USER, { uploadedById: 'someone-else' });
const ELSEWHERE = track('44444444-4444-4444-8444-444444444444', 'Their Theme', AssetScope.CAMPAIGN, { campaignId: 'other-campaign' });

const day = { name: 'Day', hue: '#FF9966', filter: 'none', audio: null };

describe('ConfigureVibeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAssets.mockResolvedValue({ assets: [OWN, TABLE, STRANGERS, ELSEWHERE] });
    putVibe.mockResolvedValue({ vibeSettings: { enabled: true, periods: [day] } });
    mockState.campaign = { id: 'c1', vibeSettings: { enabled: false, periods: [day] } };
  });

  it('keeps the footer buttons outside the scrolling period list', async () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    await waitFor(() => expect(listAssets).toHaveBeenCalled());
    const scrollRegions = ['Save Periods', 'Cancel', 'Restore Defaults'].map(
      (label) => screen.getByRole('button', { name: label }).closest('.overflow-y-auto'),
    );
    expect(scrollRegions).toEqual([null, null, null]);
  });

  // On a phone the three buttons need about 400 px and the window has about
  // 310 for them: Cancel and Save Periods go onto a line of their own, at the
  // right, below Restore Defaults. From sm up the row stays on one line.
  it('puts Cancel and Save Periods on a line of their own where the row does not fit', async () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    await waitFor(() => expect(listAssets).toHaveBeenCalled());
    const classes = (element: Element | null) => (element?.getAttribute('class') ?? '').split(/\s+/);
    const group = screen.getByRole('button', { name: 'Save Periods' }).parentElement;
    const row = screen.getByRole('button', { name: 'Restore Defaults' }).parentElement;

    expect(group?.parentElement).toBe(row);
    expect(classes(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'sm:flex-nowrap', 'justify-between']));
    expect(classes(group)).toContain('ml-auto');
  });

  it('puts the period cards inside a scrollable region', async () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const nameInput = screen.getByDisplayValue('Day');
    expect(nameInput.closest('.overflow-y-auto')).not.toBeNull();
  });

  it('offers No audio plus only the tracks this DM may set', async () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const picker = await screen.findByLabelText('Audio track for Day');
    await waitFor(() => expect(picker).not.toBeDisabled());
    const labels = Array.from((picker as HTMLSelectElement).options).map((o) => o.text);
    expect(labels[0]).toBe('No audio');
    expect(labels.join(' ')).toContain('Battle Drums');
    expect(labels.join(' ')).toContain('Tavern Noise');
    expect(labels.join(' ')).not.toContain('Private Recording');
    expect(labels.join(' ')).not.toContain('Their Theme');
  });

  // As the Atmosphere panel: one page of the newest tracks, then filtered.
  it('offers a track from a later page of the library', async () => {
    listAssets.mockImplementation(async (params: { page?: number }) => (params.page === 2
      ? { assets: [TABLE], pagination: { page: 2, limit: 100, total: 2, totalPages: 2 } }
      : { assets: [ELSEWHERE], pagination: { page: 1, limit: 100, total: 2, totalPages: 2 } }));
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const picker = await screen.findByLabelText('Audio track for Day');
    await waitFor(() => expect(Array.from((picker as HTMLSelectElement).options).map((o) => o.text).join(' ')).toContain('Tavern Noise'));
  });

  it('shows an old free-text note as No audio and saves it as none', async () => {
    mockState.campaign = {
      id: 'c1',
      vibeSettings: { enabled: true, periods: [{ ...day, audio: 'birds_chirping.mp3' }] },
    };
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const picker = await screen.findByLabelText('Audio track for Day');
    await waitFor(() => expect(picker).not.toBeDisabled());
    expect((picker as HTMLSelectElement).value).toBe('');

    await userEvent.click(screen.getByRole('button', { name: 'Save Periods' }));
    await waitFor(() => expect(putVibe).toHaveBeenCalled());
    expect(putVibe.mock.calls[0][1].periods[0].audio).toBeNull();
  });

  it('saves the chosen track by its asset id', async () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const picker = await screen.findByLabelText('Audio track for Day');
    await waitFor(() => expect(picker).not.toBeDisabled());
    await userEvent.selectOptions(picker, OWN.id);

    await userEvent.click(screen.getByRole('button', { name: 'Save Periods' }));
    await waitFor(() => expect(putVibe).toHaveBeenCalled());
    expect(putVibe.mock.calls[0][1].periods[0].audio).toBe(OWN.id);
  });

  // A rename or delete of the period in force ends the vibe; the DM's page
  // takes that from the answer, as everyone else's does from the broadcast.
  it('takes the vibe the save leaves in force', async () => {
    putVibe.mockResolvedValue({ vibeSettings: { enabled: true, periods: [{ ...day, name: 'Noon' }] }, currentVibe: null });
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save Periods' }));
    await waitFor(() => expect(updateVibeSettings).toHaveBeenCalledWith({ enabled: true, periods: [{ ...day, name: 'Noon' }] }, null));
  });
});
