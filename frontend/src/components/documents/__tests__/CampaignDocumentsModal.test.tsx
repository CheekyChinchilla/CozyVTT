/**
 * The documents shared with a campaign, seen from inside it.
 *
 * Two things pinned. A player sees the shared list and nothing that would let
 * them change it: no share picker, no unshare button. The server refuses those
 * anyway, but offering controls that will be refused is its own kind of wrong.
 *
 * And the DM's picker offers only what is not already shared, so sharing is
 * never a no-op and the list cannot show duplicates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampaignDocumentsModal from '../CampaignDocumentsModal';
import type { Asset, CampaignDocument } from '@/types';
import { AssetType, AssetScope } from '@/types';

// Not under test here, and it needs a QueryClient of its own.
vi.mock('@/components/assets/AssetUploadModal', () => ({ default: () => null }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'dm', platformRole: 'USER', globalAssetManager: false } }),
}));

vi.mock('@/services/api', () => {
  const client = {
    listCampaignDocuments: vi.fn(),
    listAssets: vi.fn(),
    linkCampaignDocument: vi.fn(),
    unlinkCampaignDocument: vi.fn(),
    deleteAsset: vi.fn(),
    getDocumentUrl: (id: string) => `/api/assets/documents/${id}`,
  };
  return { api: client, default: client };
});

import api from '@/services/api';

const listCampaignDocuments = api.listCampaignDocuments as ReturnType<typeof vi.fn>;
const listAssets = api.listAssets as ReturnType<typeof vi.fn>;
const linkCampaignDocument = api.linkCampaignDocument as ReturnType<typeof vi.fn>;
const unlinkCampaignDocument = api.unlinkCampaignDocument as ReturnType<typeof vi.fn>;
const deleteAsset = api.deleteAsset as ReturnType<typeof vi.fn>;

const shared = (id: string, name: string, originalName: string): CampaignDocument => ({
  id,
  name,
  description: null,
  originalName,
  mimeType: 'application/pdf',
  fileSize: 1024,
  createdAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: { id: 'dm', displayName: 'The DM' },
  linkedAt: '2026-01-02T00:00:00.000Z',
  linkedBy: { id: 'dm', displayName: 'The DM' },
  shared: true,
});

/** Uploaded into the campaign itself; "shared by" is its uploader. */
const own = (id: string, name: string, originalName: string): CampaignDocument => ({
  ...shared(id, name, originalName),
  shared: false,
});

const mine = (id: string, name: string, originalName: string): Asset =>
  ({
    id,
    name,
    originalName,
    type: AssetType.DOCUMENT,
    scope: AssetScope.USER,
    uploadedById: 'dm',
    mimeType: 'application/pdf',
    fileSize: 1024,
    filename: '',
    description: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }) as unknown as Asset;

beforeEach(() => {
  vi.clearAllMocks();
  deleteAsset.mockReset();
  listCampaignDocuments.mockResolvedValue({ documents: [shared('d1', 'Core Rules', 'rules.pdf')] });
  listAssets.mockResolvedValue({
    assets: [mine('d1', 'Core Rules', 'rules.pdf'), mine('d2', 'House Rules', 'house.md')],
    pagination: { page: 1, limit: 100, total: 2 },
  });
});

describe('CampaignDocumentsModal', () => {
  describe('as a player', () => {
    it('lists what is shared', async () => {
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      expect(await screen.findByText('Core Rules')).toBeInTheDocument();
      expect(screen.getByText(/shared by The DM/)).toBeInTheDocument();
    });

    it('offers no way to share or unshare', async () => {
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      await screen.findByText('Core Rules');
      expect(screen.queryByText(/share a document/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/stop sharing/i)).not.toBeInTheDocument();
      // And does not even ask for the DM's private list.
      expect(listAssets).not.toHaveBeenCalled();
    });

    // A deleted account's uploads stay, with no uploader.
    it('lists a document whose uploader has deleted their account', async () => {
      listCampaignDocuments.mockResolvedValue({ documents: [{ ...shared('d2', 'Old Handout', 'old.pdf'), uploadedBy: null }] });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      fireEvent.click(await screen.findByText('Old Handout'));
      expect(await screen.findAllByText('Old Handout')).not.toHaveLength(0);
    });

    // An uploaded document names its uploader as the one who shared it, and
    // a deleted account leaves none; the whole list used to fail on it.
    it('lists a campaign document whose uploader has deleted their account', async () => {
      listCampaignDocuments.mockResolvedValue({
        documents: [{ ...own('d5', 'Orphaned Notes', 'notes.md'), uploadedBy: null, linkedBy: null }],
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      expect(await screen.findByText('Orphaned Notes')).toBeInTheDocument();
      expect(screen.getByText(/shared by a deleted account/)).toBeInTheDocument();
    });

    it('offers no way to delete a document', async () => {
      listCampaignDocuments.mockResolvedValue({ documents: [own('d5', 'Campaign Notes', 'notes.md')] });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      await screen.findByText('Campaign Notes');
      expect(screen.queryByLabelText(/^delete /i)).not.toBeInTheDocument();
    });

    it('offers a way to open each document in a new tab', async () => {
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
      await screen.findByText('Core Rules');
      const link = screen.getByLabelText('Open Core Rules in a new tab');
      expect(link).toHaveAttribute('href', '/api/assets/documents/d1');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  describe('as the DM', () => {
    it('offers only documents not already shared', async () => {
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Core Rules');
      fireEvent.click(screen.getByRole('button', { name: /share existing/i }));

      // d1 is shared already; only d2 should be offered.
      expect(screen.getByText('House Rules')).toBeInTheDocument();
      const shareButtons = screen.getAllByRole('button', { name: /^share$/i });
      expect(shareButtons).toHaveLength(1);
    });

    it('offers only what the DM may share: their own documents and global ones', async () => {
      // The asset list also returns documents from other campaigns the DM is a
      // member of, and documents other people uploaded. The server refuses to
      // pass those on, so the picker must not offer them.
      const theirs = { ...mine('d3', 'Someone Else\'s Handout', 'handout.md'), uploadedById: 'other', scope: AssetScope.CAMPAIGN } as Asset;
      const global = { ...mine('d4', 'System Reference', 'srd.pdf'), uploadedById: 'admin', scope: AssetScope.GLOBAL } as Asset;
      listAssets.mockResolvedValue({
        assets: [mine('d2', 'House Rules', 'house.md'), theirs, global],
        pagination: { page: 1, limit: 100, total: 3 },
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Core Rules');
      fireEvent.click(screen.getByRole('button', { name: /share existing/i }));

      expect(screen.getByText('House Rules')).toBeInTheDocument();
      expect(screen.getByText('System Reference')).toBeInTheDocument();
      expect(screen.queryByText("Someone Else's Handout")).toBeNull();
    });

    it('shares and refreshes the list', async () => {
      linkCampaignDocument.mockResolvedValue({ link: { id: 'l1' } });
      listCampaignDocuments
        .mockResolvedValueOnce({ documents: [shared('d1', 'Core Rules', 'rules.pdf')] })
        .mockResolvedValueOnce({
          documents: [shared('d1', 'Core Rules', 'rules.pdf'), shared('d2', 'House Rules', 'house.md')],
        });

      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Core Rules');
      fireEvent.click(screen.getByRole('button', { name: /share existing/i }));
      fireEvent.click(screen.getByRole('button', { name: /^share$/i }));

      await waitFor(() => expect(linkCampaignDocument).toHaveBeenCalledWith('c1', 'd2'));
      await waitFor(() => expect(listCampaignDocuments).toHaveBeenCalledTimes(2));
    });

    it('asks before unsharing, then unshares', async () => {
      unlinkCampaignDocument.mockResolvedValue({ message: 'ok' });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Core Rules');

      fireEvent.click(screen.getByLabelText('Stop sharing Core Rules'));
      expect(unlinkCampaignDocument).not.toHaveBeenCalled();
      expect(await screen.findByText(/players will no longer be able to read it/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^stop sharing$/i }));
      await waitFor(() => expect(unlinkCampaignDocument).toHaveBeenCalledWith('c1', 'd1'));
      await waitFor(() => expect(screen.queryByText('Core Rules')).not.toBeInTheDocument());
    });

    // The server lets the DM delete the campaign's own assets; this is the one
    // place the app offers it, and the only way to remove a document whose
    // uploader has gone.
    it('asks before deleting one of the campaign\'s own documents, then deletes it', async () => {
      deleteAsset.mockResolvedValue({ message: 'ok' });
      listCampaignDocuments.mockResolvedValue({
        documents: [
          shared('d1', 'Core Rules', 'rules.pdf'),
          { ...own('d5', 'Orphaned Notes', 'notes.md'), uploadedBy: null, linkedBy: null },
        ],
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Orphaned Notes');
      // A shared document is someone's own file: it is unshared, never deleted here.
      expect(screen.queryByLabelText('Delete Core Rules')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Delete Orphaned Notes'));
      expect(deleteAsset).not.toHaveBeenCalled();
      expect(await screen.findByText(/deleted for everyone/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      await waitFor(() => expect(deleteAsset).toHaveBeenCalledWith('d5'));
      await waitFor(() => expect(screen.queryByText('Orphaned Notes')).not.toBeInTheDocument());
      expect(screen.getByText('Core Rules')).toBeInTheDocument();
    });

    it('shows where a document in use is used before deleting it anyway', async () => {
      // Refused until the request says to force it.
      deleteAsset.mockImplementation(async (_id: string, options?: { force?: boolean }) => {
        if (options?.force) return { message: 'ok' };
        throw {
          response: {
            status: 409,
            data: {
              code: 'ASSET_IN_USE',
              message: 'This asset is still in use.',
              usage: [{ kind: 'map', name: 'Library', campaignId: 'c1', campaignName: 'Lost Mine', count: 1 }],
              omitted: 0,
            },
          },
        };
      });
      listCampaignDocuments.mockResolvedValue({
        documents: [{ ...own('d5', 'Orphaned Notes', 'notes.md'), uploadedBy: null, linkedBy: null }],
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Orphaned Notes');

      fireEvent.click(screen.getByLabelText('Delete Orphaned Notes'));
      fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

      expect(await screen.findByText(/Map "Library" \(Lost Mine\)/)).toBeInTheDocument();
      expect(deleteAsset).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Orphaned Notes', { selector: 'button' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Delete anyway' }));
      await waitFor(() => expect(deleteAsset).toHaveBeenLastCalledWith('d5', { force: true }));
      await waitFor(() => expect(screen.queryByText('Orphaned Notes', { selector: 'button' })).not.toBeInTheDocument());
    });

    it('shows the reason when a document cannot be deleted', async () => {
      deleteAsset.mockRejectedValue({ response: { status: 403, data: { message: 'Not yours to delete' } } });
      listCampaignDocuments.mockResolvedValue({
        documents: [{ ...own('d5', 'Orphaned Notes', 'notes.md'), uploadedBy: null, linkedBy: null }],
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Orphaned Notes');

      fireEvent.click(screen.getByLabelText('Delete Orphaned Notes'));
      fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Not yours to delete');
    });

    it('says so when there is nothing left to share', async () => {
      listAssets.mockResolvedValue({
        assets: [mine('d1', 'Core Rules', 'rules.pdf')],
        pagination: { page: 1, limit: 100, total: 1 },
      });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText('Core Rules');
      fireEvent.click(screen.getByRole('button', { name: /share existing/i }));
      expect(screen.getByText(/everything you can share is already shared/i)).toBeInTheDocument();
    });

    it('points at the Documents page when the DM has nothing at all', async () => {
      listCampaignDocuments.mockResolvedValue({ documents: [] });
      listAssets.mockResolvedValue({ assets: [], pagination: { page: 1, limit: 100, total: 0 } });
      render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
      await screen.findByText(/nothing shared yet/i);
      fireEvent.click(screen.getByRole('button', { name: /share existing/i }));
      expect(screen.getByText(/upload one from documents on your dashboard/i)).toBeInTheDocument();
    });
  });

  it('offers Write and Upload to the DM and not to a player', async () => {
    const { unmount } = render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
    await screen.findByText('Core Rules');
    expect(screen.getByRole('button', { name: /^write$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument();
    unmount();

    render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM={false} />);
    await screen.findByText('Core Rules');
    expect(screen.queryByRole('button', { name: /^write$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument();
  });

  it('does not offer to unshare the campaign\'s own document, which has no link', async () => {
    listCampaignDocuments.mockResolvedValue({
      documents: [{ ...shared('own', 'Table Notes', 'notes.txt'), shared: false }],
    });
    render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
    await screen.findByText('Table Notes');
    expect(screen.queryByLabelText('Stop sharing Table Notes')).not.toBeInTheDocument();
  });

  it('surfaces the server\'s reason when sharing is refused', async () => {
    linkCampaignDocument.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: 'Not Found', message: 'Document not found' } },
    });
    render(<CampaignDocumentsModal isOpen onClose={vi.fn()} campaignId="c1" isDM />);
    await screen.findByText('Core Rules');
    fireEvent.click(screen.getByRole('button', { name: /share existing/i }));
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/document not found/i);
  });
});
