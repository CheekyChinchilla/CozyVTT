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
vi.mock('@/services/api', () => ({ api: { uploadAsset: (form: FormData, onProgress?: (percent: number) => void) => uploadAsset(form, onProgress) } }));

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

// The server refuses a name over 200 characters, a description over 1,000,
// and more than 50 tags of up to 50 characters each. The dialog stops at
// them, so nothing typed into it is refused after the file has been sent.
describe('the name, description and tags', () => {
  beforeEach(() => { campaigns = []; manager = false; });

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

// The dialog kept a list of its own of the types browsers report, which had
// drifted from what the server takes: Firefox reports an Ogg file as
// application/ogg and a WAV as audio/x-wav, a browser often reports Markdown
// with no type at all, and M4A passed here to be refused by the server. The
// dialog now checks the file's extension against the server's own list.
describe('the files the dialog takes', () => {
  beforeEach(() => { campaigns = []; });

  function choose(type: AssetType, name: string, browserType: string) {
    render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={type} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], name, { type: browserType })] } });
  }

  it.each([
    [AssetType.AUDIO, 'rain.ogg', 'application/ogg'],
    [AssetType.AUDIO, 'thunder.wav', 'audio/x-wav'],
    [AssetType.AUDIO, 'Tavern.MP3', 'audio/mpeg'],
    [AssetType.DOCUMENT, 'notes.md', ''],
    [AssetType.MAP, 'cave.jpeg', 'image/jpeg'],
  ])('takes %s file %s, reported as "%s"', async (type, name, browserType) => {
    choose(type, name, browserType);
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid file type/)).not.toBeInTheDocument();
  });

  it.each([
    [AssetType.AUDIO, 'song.m4a', 'audio/mp4', '.mp3, .ogg, .wav'],
    [AssetType.MAP, 'animation.gif', 'image/gif', '.png, .jpg, .jpeg, .webp'],
    [AssetType.DOCUMENT, 'page.html', 'text/html', '.pdf, .txt, .md'],
  ])('refuses %s file %s, which the server would refuse', async (type, name, browserType, listed) => {
    choose(type, name, browserType);
    expect(await screen.findByText(`Invalid file type. Allowed types: ${listed}`)).toBeInTheDocument();
  });

  it('offers only those files in the file picker', () => {
    render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={AssetType.AUDIO} />);
    expect(document.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('.mp3,.ogg,.wav');
  });
});

// The bar was a 200 ms timer counting to 90%, started on every upload and
// stopped only when one succeeded, so each refused upload left one running
// for the life of the page. It now shows how much of the file has been sent.
describe('upload progress', () => {
  beforeEach(() => { campaigns = []; uploadAsset.mockReset(); });

  async function startUpload() {
    render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={AssetType.MAP} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'cave.png', { type: 'image/png' })] } });
    fireEvent.click(await screen.findByRole('button', { name: /^Upload$/ }));
  }

  it('leaves no timer running after a refused upload', async () => {
    uploadAsset.mockRejectedValue({ response: { status: 413, data: { message: 'The file is larger than 25 MB.' } } });
    // The test library polls with intervals of its own, and clears them. jsdom
    // runs animation frames on an interval of 1000 / 60 ms while any frame is
    // asked for, which the dialog's opening animation does; on a slow machine it
    // is still running when the message appears. That one is left out, and a
    // frame is asked for here so the test meets it on every machine.
    const frameTimer = 1000 / 60;
    const started = vi.spyOn(window, 'setInterval');
    const cleared = vi.spyOn(window, 'clearInterval');
    try {
      await startUpload();
      expect(await screen.findByText('The file is larger than 25 MB.')).toBeInTheDocument();
      requestAnimationFrame(() => undefined);
      const clearedIds = new Set(cleared.mock.calls.map(([id]) => id));
      const running = started.mock.calls.flatMap(([, delay], i) => {
        const id = started.mock.results[i].value;
        return delay === frameTimer || clearedIds.has(id) ? [] : [delay];
      });
      expect(running).toEqual([]);
    } finally {
      started.mockRestore();
      cleared.mockRestore();
    }
  });

  it('shows how much of the file has been sent', async () => {
    uploadAsset.mockImplementation((_form: FormData, onProgress?: (percent: number) => void) => {
      onProgress?.(40);
      return new Promise(() => undefined);
    });
    await startUpload();
    expect(await screen.findByText('40%')).toBeInTheDocument();
    // And stays there while nothing more is sent, where the timer counted on.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});

