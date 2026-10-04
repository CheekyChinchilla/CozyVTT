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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
