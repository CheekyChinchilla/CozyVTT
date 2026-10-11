/**
 * The upload dialog offers Campaign scope only where the server accepts it.
 *
 * Token art may go into a campaign its uploader runs or plays in; a
 * spectator puts nothing in. The dialog offered token art into every
 * campaign the user belonged to, spectator memberships included, and the
 * upload was then refused.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssetUploadModal from '../AssetUploadModal';
import { AssetType } from '@/types';
import type { Campaign } from '@/types';

let campaigns: Campaign[] = [];
let manager = false;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', platformRole: 'USER', globalAssetManager: manager } }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/services/campaign.service', () => ({ default: { getCampaigns: () => Promise.resolve(campaigns) } }));
const uploadAsset = vi.fn();
vi.mock('@/services/api', () => ({ api: { uploadAsset: (form: FormData) => uploadAsset(form) } }));

const campaign = (id: string, userRole: 'DM' | 'PLAYER' | 'SPECTATOR') =>
  ({ id, name: `Campaign ${id}`, ownerId: 'someone-else', userRole, memberships: [] }) as unknown as Campaign;

function open() {
  render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={AssetType.TOKEN} />);
}

describe('uploading token art', () => {
  beforeEach(() => { campaigns = []; });

  it('offers no Campaign scope to someone who only watches campaigns', async () => {
    campaigns = [campaign('watched', 'SPECTATOR')];
    open();
    expect(await screen.findByText('Personal')).toBeInTheDocument();
    // Let the campaign list arrive before deciding the button is absent.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Campaign')).not.toBeInTheDocument();
  });

  it('offers Campaign scope in a campaign the user plays in', async () => {
    campaigns = [campaign('played', 'PLAYER'), campaign('watched', 'SPECTATOR')];
    open();
    expect(await screen.findByText('Campaign')).toBeInTheDocument();
  });
});

// The campaigns on offer depend on the kind of asset. A player who chose
// Campaign for token art and then switched to a map kept that choice with the
// button gone, and the upload was refused after the file had been sent.
describe('switching to a kind of asset the chosen campaign does not take', () => {
  beforeEach(() => { campaigns = []; });

  it('goes back to Personal', async () => {
    campaigns = [campaign('played', 'PLAYER')];
    render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} />);
    fireEvent.click(await screen.findByText('Token'));
    fireEvent.click(await screen.findByText('Campaign'));
    expect(screen.getByText('Shared with all members of the selected campaign.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Map'));

    expect(screen.queryByText('Campaign')).not.toBeInTheDocument();
    expect(screen.queryByText('Shared with all members of the selected campaign.')).not.toBeInTheDocument();
    expect(screen.getByText(/Yours, and usable in all your campaigns/)).toBeInTheDocument();
  });

  // A campaign the user picked, and the new kind of asset cannot go into,
  // is taken back and nothing put in its place: the one campaign left may
  // be one they never meant to share the file with.
  it('asks for a campaign again, and does not pick the other one', async () => {
    campaigns = [campaign('home', 'DM'), campaign('friday', 'PLAYER')];
    render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} />);
    fireEvent.click(await screen.findByText('Token'));
    fireEvent.click(await screen.findByText('Campaign'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'friday' } });
    expect((select as HTMLSelectElement).value).toBe('friday');

    fireEvent.click(screen.getByText('Map'));

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
  });
});

// Create Map's Upload New: a picture for a map the DM may be preparing in
// secret. Personal is chosen at first; the campaign's library is a click
// away. Nothing else is offered, not even Global to a global asset manager,
// and the campaign is the one the map is for.
describe('choosing Personal or the campaign, as Create Map offers', () => {
  const PERSONAL_HINT = 'Players see it once its map is on screen, while you are in the campaign.';
  const CAMPAIGN_HINT = 'Everyone in the campaign can browse it now, and it stays if you leave.';

  beforeEach(() => {
    campaigns = [campaign('home', 'DM'), campaign('friday', 'DM')];
    manager = true;
    uploadAsset.mockReset();
    uploadAsset.mockResolvedValue({ asset: { id: 'new' } });
  });

  function openForCampaign() {
    render(
      <AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={AssetType.MAP} campaignOption="home" />
    );
  }

  async function uploadAPicture() {
    // The dialog is drawn outside the test's container, on the page itself.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['png'], 'Old Mill.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /^upload$/i }));
    await waitFor(() => expect(uploadAsset).toHaveBeenCalledTimes(1));
    const form = uploadAsset.mock.calls[0][0] as FormData;
    return { scope: form.get('scope'), campaignId: form.get('campaignId') };
  }

  it('offers Personal, selected, and Campaign, each with its hint, and nothing else', async () => {
    openForCampaign();
    expect(screen.getByRole('button', { name: /^personal/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^campaign/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(PERSONAL_HINT)).toBeInTheDocument();
    expect(screen.getByText(CAMPAIGN_HINT)).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Global')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('uploads to the personal library unless Campaign is chosen', async () => {
    openForCampaign();
    expect(await uploadAPicture()).toEqual({ scope: 'USER', campaignId: null });
  });

  it('uploads to the campaign it was opened for when Campaign is chosen', async () => {
    openForCampaign();
    fireEvent.click(screen.getByRole('button', { name: /^campaign/i }));
    expect(screen.getByRole('button', { name: /^campaign/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(await uploadAPicture()).toEqual({ scope: 'CAMPAIGN', campaignId: 'home' });
  });
});
