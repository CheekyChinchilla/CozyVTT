/**
 * Writing a document instead of uploading one.
 *
 * What is typed goes to the server exactly as typed. The dialog does not
 * strip or escape anything, because that is not where safety comes from and
 * it would corrupt a rules document that mentions <tags>. The server checks
 * it is text; the reader and the serving route make it harmless.
 */

import { AssetScope } from '@/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import NewDocumentDialog from '../NewDocumentDialog';

const authUser = { id: 'u1', platformRole: 'USER', globalAssetManager: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: authUser }) }));

vi.mock('@/services/api', () => {
  const client = { createDocument: vi.fn() };
  return { api: client, default: client };
});
import api from '@/services/api';
const createDocument = api.createDocument as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  authUser.platformRole = 'USER';
  authUser.globalAssetManager = false;
});

describe('NewDocumentDialog', () => {
  it('creates a personal Markdown document from what was typed, verbatim', async () => {
    createDocument.mockResolvedValue({ asset: { id: 'a1', name: 'Rules' } });
    const onCreated = vi.fn();
    render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Rules' } });
    fireEvent.change(screen.getByLabelText('Document content'), {
      target: { value: '# Rules\n\n<b>bold</b> and 1 < 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() =>
      expect(createDocument).toHaveBeenCalledWith({
        name: 'Rules',
        format: 'md',
        content: '# Rules\n\n<b>bold</b> and 1 < 2',
        scope: 'USER',
        campaignId: undefined,
      })
    );
    expect(onCreated).toHaveBeenCalledWith({ id: 'a1', name: 'Rules' });
  });

  it('will not create without a name', () => {
    render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });

  it('switches to plain text', async () => {
    createDocument.mockResolvedValue({ asset: { id: 'a2', name: 'Notes' } });
    render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Notes' } });
    fireEvent.click(screen.getByRole('radio', { name: /plain text/i }));
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ format: 'txt' })));
  });

  it('locks the scope and hides the picker when opened from a campaign', async () => {
    createDocument.mockResolvedValue({ asset: { id: 'a3', name: 'Table' } });
    render(
      <NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} lockedScope={AssetScope.CAMPAIGN} campaignId="c1" />
    );
    expect(screen.queryByRole('radiogroup', { name: /scope/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Table' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() =>
      expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ scope: 'CAMPAIGN', campaignId: 'c1' }))
    );
  });

  it('offers Global only to someone who may upload globally', () => {
    const { unmount } = render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByRole('radio', { name: /^global$/i })).not.toBeInTheDocument();
    unmount();

    authUser.globalAssetManager = true;
    render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /^global$/i })).toBeInTheDocument();
  });

  it('shows the server\'s reason when refused, and keeps the text', async () => {
    createDocument.mockRejectedValue({
      isAxiosError: true,
      response: { data: { error: 'Validation Error', message: 'That is too long to save as typed text. Upload it as a file instead.' } },
    });
    render(<NewDocumentDialog isOpen onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Big' } });
    fireEvent.change(screen.getByLabelText('Document content'), { target: { value: 'lots' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/upload it as a file/i);
    expect(screen.getByLabelText('Document content')).toHaveValue('lots');
  });
});

describe('closing a document with text in it', () => {
  const escape = () => fireEvent.keyDown(document, { key: 'Escape' });

  it('closes at once when nothing has been typed', () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog isOpen onClose={onClose} onCreated={vi.fn()} />);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Discard this document?' })).not.toBeInTheDocument();
  });

  it('asks on Escape once something is typed, and Keep writing leaves the text alone', async () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog isOpen onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document content'), { target: { value: 'Session 3: the bridge' } });

    escape();

    const ask = await screen.findByRole('dialog', { name: 'Discard this document?' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep writing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this document?' })).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Document content')).toHaveValue('Session 3: the bridge');
  });

  it('closes after Discard', async () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog isOpen onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Session 3' } });

    escape();
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Discard this document?' })).getByRole('button', { name: 'Discard' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks the same from the X and from Cancel', async () => {
    const onClose = vi.fn();
    render(<NewDocumentDialog isOpen onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document content'), { target: { value: 'notes' } });

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(await screen.findByRole('dialog', { name: 'Discard this document?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard this document?' })).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Discard this document?' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not ask after a successful Create', async () => {
    createDocument.mockResolvedValue({ asset: { id: 'a9', name: 'Saved' } });
    const onClose = vi.fn();
    render(<NewDocumentDialog isOpen onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Saved' } });
    fireEvent.change(screen.getByLabelText('Document content'), { target: { value: 'kept' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Discard this document?' })).not.toBeInTheDocument();
  });
});

