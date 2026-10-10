/**
 * An admin can find the files in the uploads folder that no asset names, and
 * delete them after confirming.
 *
 * Checking only lists. Deleting asks first, sends exactly the files listed,
 * and says what happened, including files kept because an asset named them
 * by then.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OrphanedFilesPanel from '../OrphanedFilesPanel';
import type { OrphanedFilesReport } from '@/types';

const listOrphanedFiles = vi.fn();
const deleteOrphanedFiles = vi.fn();
vi.mock('@/services/api', () => {
  const client = {
    listOrphanedFiles: (...a: unknown[]) => listOrphanedFiles(...a),
    deleteOrphanedFiles: (...a: unknown[]) => deleteOrphanedFiles(...a),
  };
  return { api: client, default: client };
});

const report: OrphanedFilesReport = {
  files: [
    { path: 'documents/global/a.md', size: 2048, modifiedAt: '2026-09-01T10:00:00.000Z' },
    { path: 'maps/global/thumb_b.png', size: 512, modifiedAt: '2026-09-02T10:00:00.000Z' },
  ],
  total: 2,
  totalBytes: 2560,
  recent: 1,
  minimumAgeMinutes: 60,
};

beforeEach(() => {
  listOrphanedFiles.mockReset().mockResolvedValue(report);
  deleteOrphanedFiles.mockReset();
});

describe('OrphanedFilesPanel', () => {
  it('lists nothing and deletes nothing until asked to check', async () => {
    render(<OrphanedFilesPanel />);
    expect(listOrphanedFiles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check for Leftover Files' }));
    expect(await screen.findByText('documents/global/a.md')).toBeInTheDocument();
    expect(screen.getByText('maps/global/thumb_b.png')).toBeInTheDocument();
    expect(screen.getByText(/2 leftover files, 2\.5 KB in all/)).toBeInTheDocument();
    expect(screen.getByText(/1 more changed in the last 60 minutes/)).toBeInTheDocument();
    expect(deleteOrphanedFiles).not.toHaveBeenCalled();
  });

  it('says so when there are none', async () => {
    listOrphanedFiles.mockResolvedValue({ files: [], total: 0, totalBytes: 0, recent: 0, minimumAgeMinutes: 60 });
    render(<OrphanedFilesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Leftover Files' }));
    expect(await screen.findByText('No leftover files. Every file in the uploads folder belongs to an asset.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('asks before deleting, sends the listed files, and reports the result', async () => {
    deleteOrphanedFiles.mockResolvedValue({ deleted: ['documents/global/a.md'], skipped: ['maps/global/thumb_b.png'], failed: [] });
    render(<OrphanedFilesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Leftover Files' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 2 Files' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete Leftover Files' });
    expect(within(dialog).getByText(/cannot be brought back/)).toBeInTheDocument();
    expect(deleteOrphanedFiles).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete Files' }));

    await waitFor(() => expect(deleteOrphanedFiles).toHaveBeenCalledWith(['documents/global/a.md', 'maps/global/thumb_b.png']));
    expect(await screen.findByText(/Deleted 1 file\. 1 was kept because it is no longer a leftover file\./)).toBeInTheDocument();
    expect(screen.queryByText('documents/global/a.md')).not.toBeInTheDocument();
  });

  it('cancelling the question deletes nothing', async () => {
    render(<OrphanedFilesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Leftover Files' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 2 Files' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteOrphanedFiles).not.toHaveBeenCalled();
    expect(screen.getByText('documents/global/a.md')).toBeInTheDocument();
  });

  it('shows why a check failed', async () => {
    listOrphanedFiles.mockRejectedValue({ response: { status: 500, data: { message: 'Failed to check the uploads folder' } } });
    render(<OrphanedFilesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check for Leftover Files' }));
    expect(await screen.findByText('Failed to check the uploads folder')).toBeInTheDocument();
  });
});
