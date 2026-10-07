/**
 * Export Campaign in the settings dialog.
 *
 * The export was fetched as a Blob, so a refusal arrived as a Blob too and
 * its message could not be read: the DM saw "Failed to export campaign"
 * whatever the server had said, including why a campaign was too large to
 * export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Campaign } from '@/types';

const { showToast, downloadCampaignExport } = vi.hoisted(() => ({ showToast: vi.fn(), downloadCampaignExport: vi.fn() }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', name: 'The Keep', description: '', memberships: [], userRole: 'DM', ownerId: 'dm' } as unknown as Campaign,
    refreshCampaign: vi.fn(),
    userRole: 'DM',
  }),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/services/api', () => ({ default: { downloadCampaignExport } }));

import CampaignSettingsModal from '../CampaignSettingsModal';

beforeEach(() => {
  showToast.mockReset();
  downloadCampaignExport.mockReset();
});

const exportButton = () => screen.getByRole('button', { name: /Export Campaign/ });

describe('Export Campaign', () => {
  it("shows the server's reason when it refuses the export", async () => {
    const reason = "This campaign's files add up to 734 MB, more than the 500 MB a campaign archive can hold on this server.";
    downloadCampaignExport.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 422'), { response: { status: 422, data: { message: reason } } })
    );
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);

    fireEvent.click(exportButton());

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(reason, 'error'));
  });

  it('asks for the archive under the campaign name, with the audio choice', async () => {
    downloadCampaignExport.mockResolvedValue('saved');
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);

    fireEvent.click(screen.getByRole('switch', { name: '' }));
    fireEvent.click(exportButton());

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Campaign exported successfully', 'success'));
    expect(downloadCampaignExport).toHaveBeenCalledWith('c1', { includeAudio: true }, 'The_Keep-export.cozyvtt');
  });

  it('says nothing when the DM cancels the save dialog', async () => {
    downloadCampaignExport.mockResolvedValue('cancelled');
    render(<CampaignSettingsModal isOpen onClose={() => undefined} />);

    fireEvent.click(exportButton());

    await waitFor(() => expect(downloadCampaignExport).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: /Export Campaign/ })).toBeTruthy());
    expect(showToast).not.toHaveBeenCalled();
  });
});
