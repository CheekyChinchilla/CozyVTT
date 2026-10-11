/**
 * The upload dialog offers Campaign scope only where the server accepts it.
 *
 * Token art may go into a campaign its uploader runs or plays in; a
 * spectator puts nothing in. The dialog offered token art into every
 * campaign the user belonged to, spectator memberships included, and the
 * upload was then refused.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssetUploadModal from '../AssetUploadModal';
import { AssetType } from '@/types';
import type { Campaign } from '@/types';

let campaigns: Campaign[] = [];
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', platformRole: 'USER' } }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/services/campaign.service', () => ({ default: { getCampaigns: () => Promise.resolve(campaigns) } }));

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

// The server refuses a name over 200 characters, a description over 1,000,
// and more than 50 tags of up to 50 characters each. The dialog stops at
// them, so nothing typed into it is refused after the file has been sent.
describe('the name, description and tags', () => {
  beforeEach(() => { campaigns = []; });

  it('stop at the lengths the server keeps', async () => {
    open();
    expect((await screen.findByPlaceholderText('Enter asset name...')).getAttribute('maxlength')).toBe('200');
    expect(screen.getByPlaceholderText('Enter asset description...').getAttribute('maxlength')).toBe('1000');
    expect(screen.getByPlaceholderText('Type a tag and press Enter...').getAttribute('maxlength')).toBe('50');
  });

  it('takes no more than 50 tags', async () => {
    open();
    const tagBox = await screen.findByPlaceholderText('Type a tag and press Enter...');
    for (let i = 0; i < 51; i += 1) {
      fireEvent.change(tagBox, { target: { value: `tag${i}` } });
      fireEvent.keyDown(tagBox, { key: 'Enter' });
    }
    expect(screen.getByText('tag49')).toBeInTheDocument();
    expect(screen.queryByText('tag50')).not.toBeInTheDocument();
    expect(screen.getByText('An asset can have at most 50 tags.')).toBeInTheDocument();
  });

  it('names an upload after its file, cut to 200 characters', async () => {
    open();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], `${'f'.repeat(300)}.png`, { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(((await screen.findByPlaceholderText('Enter asset name...')) as HTMLInputElement).value).toHaveLength(200);
  });
});
