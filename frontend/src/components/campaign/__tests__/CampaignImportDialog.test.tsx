/**
 * What the import dialog says when an archive is refused.
 *
 * A web proxy in front of CozyVTT refuses a body over its size limit with 413
 * and a page of HTML, before the server sees it. The dialog found no message
 * in that and showed "Request failed with status code 413", which tells
 * nobody what to do.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { previewCampaignImport, importCampaign } = vi.hoisted(() => ({ previewCampaignImport: vi.fn(), importCampaign: vi.fn() }));
vi.mock('@/services/api', () => ({ default: { previewCampaignImport, importCampaign } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import CampaignImportDialog from '../CampaignImportDialog';

/** An error shaped as axios rejects with it. */
function httpError(status: number, data: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } });
}

function chooseArchive() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['PK'], 'campaign.cozyvtt', { type: 'application/zip' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  previewCampaignImport.mockReset();
  importCampaign.mockReset();
});

describe('CampaignImportDialog', () => {
  it('says the archive is too large for the server when a proxy refuses it with 413', async () => {
    previewCampaignImport.mockRejectedValue(httpError(413, '<html><body><h1>413 Request Entity Too Large</h1></body></html>'));
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);

    chooseArchive();

    expect(await screen.findByText('Import Failed')).toBeTruthy();
    expect(
      screen.getByText(
        'This archive is larger than the server accepts. Whoever runs the server can raise the size limit for campaign imports on the web proxy in front of CozyVTT; the deployment guide explains how.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/status code 413/)).toBeNull();
  });

  it("shows the server's own words when it refuses an archive as too large", async () => {
    previewCampaignImport.mockRejectedValue(
      httpError(413, { error: 'File Too Large', message: 'The archive is larger than 500 MB, the most a campaign archive may be.' })
    );
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);

    chooseArchive();

    expect(await screen.findByText('The archive is larger than 500 MB, the most a campaign archive may be.')).toBeTruthy();
  });

  it('says the same when the import itself is refused with 413', async () => {
    previewCampaignImport.mockResolvedValue({
      formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT v1.5.0', campaignName: 'Keep',
      gameSystem: 'DND_5E', mapCount: 1, tokenCount: 0, creatureCount: 0, tokenTemplateCount: 0, assetCount: 1,
      includesAudio: false, totalSizeBytes: 100,
    });
    importCampaign.mockRejectedValue(httpError(413, ''));
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);

    chooseArchive();
    fireEvent.click(await screen.findByRole('button', { name: /Import Campaign/ }));

    await waitFor(() => expect(screen.getByText(/This archive is larger than the server accepts\./)).toBeTruthy());
  });
});

describe('CampaignImportDialog done screen', () => {
  const preview = {
    formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT v1.4.0', campaignName: 'Keep',
    gameSystem: 'DND_5E', mapCount: 3, tokenCount: 12, creatureCount: 0, tokenTemplateCount: 0, assetCount: 1,
    includesAudio: false, totalSizeBytes: 100,
  };

  async function importArchive(result: Record<string, unknown>) {
    previewCampaignImport.mockResolvedValue(preview);
    importCampaign.mockResolvedValue({
      campaignId: 'c1', campaignName: 'Keep', mapCount: 2, tokenCount: 11, creatureCount: 0, tokenTemplateCount: 0, ...result,
    });
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);
    chooseArchive();
    fireEvent.click(await screen.findByRole('button', { name: /Import Campaign/ }));
    await screen.findByText('Import Complete!');
  }

  it('lists what the import left out, with the reason, and what it changed', async () => {
    await importArchive({
      warnings: ['Map "Cellar": shortened the notes of 1 token to 5,000 characters.'],
      skipped: [{ kind: 'map', name: 'Vast', reason: 'Map width must be a whole number from 1 to 500 squares' }],
    });

    expect(screen.getByText('Left out')).toBeTruthy();
    const leftOut = screen.getByRole('list', { name: 'Left out' });
    expect(leftOut.textContent).toBe('Vast (map): Map width must be a whole number from 1 to 500 squares');
    expect(screen.getByRole('list', { name: 'Changed to fit' }).textContent).toBe(
      'Map "Cellar": shortened the notes of 1 token to 5,000 characters.'
    );
  });

  it('counts the maps that were made, not the ones the archive held', async () => {
    await importArchive({ warnings: [], skipped: [] });

    expect(screen.getByText('Maps:').nextElementSibling?.textContent).toBe('2');
    expect(screen.queryByText('Left out')).toBeNull();
    expect(screen.queryByText('Changed to fit')).toBeNull();
  });
});
