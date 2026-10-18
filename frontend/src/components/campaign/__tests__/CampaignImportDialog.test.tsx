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
import userEvent from '@testing-library/user-event';

const { previewCampaignImport, importCampaign } = vi.hoisted(() => ({ previewCampaignImport: vi.fn(), importCampaign: vi.fn() }));
vi.mock('@/services/api', () => ({ default: { previewCampaignImport, importCampaign } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

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
  navigate.mockReset();
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

  // It went to /campaign/<id>, which is no page, and the app sent that on to
  // the dashboard.
  it('opens the imported campaign at its page', async () => {
    await importArchive({ warnings: [], skipped: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Open Campaign' }));
    expect(navigate).toHaveBeenCalledWith('/campaigns/c1');
  });

  it('counts the maps that were made, not the ones the archive held', async () => {
    await importArchive({ warnings: [], skipped: [] });

    expect(screen.getByText('Maps:').nextElementSibling?.textContent).toBe('2');
    expect(screen.queryByText('Left out')).toBeNull();
    expect(screen.queryByText('Changed to fit')).toBeNull();
  });
});

/**
 * The import window is a dialog to assistive technology: announced with its
 * name when it opens, keeping keyboard focus inside it, and closed by Escape.
 * It was a plain overlay, so a screen reader was not told it had opened and
 * Tab walked out of it onto the dashboard behind.
 */
describe('CampaignImportDialog as a dialog', () => {
  it('is announced as a dialog named Import Campaign', () => {
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'Import Campaign' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('keeps keyboard focus inside it', async () => {
    render(
      <>
        <button type="button">Behind the dialog</button>
        <CampaignImportDialog isOpen onClose={() => undefined} />
      </>
    );
    const dialog = screen.getByRole('dialog', { name: 'Import Campaign' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    for (let i = 0; i < 4; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('lets the keyboard open the file picker', async () => {
    render(<CampaignImportDialog isOpen onClose={() => undefined} />);
    const picker = screen.getByRole('button', { name: 'Choose a campaign archive' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    // The dialog puts focus on its first control as it opens; wait for that.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));

    picker.focus();
    await userEvent.keyboard('{Enter}');
    expect(click).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CampaignImportDialog isOpen onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

/**
 * While an import runs the dialog cannot be closed. The request carries on
 * after the window is gone, so the person was left not knowing whether a
 * campaign had been made, and reopening the window showed the old result.
 */
describe('CampaignImportDialog while an import is running', () => {
  const preview = {
    formatVersion: 1, exportedAt: '2026-10-06T00:00:00.000Z', exportedFrom: 'CozyVTT v1.5.1', campaignName: 'Keep',
    gameSystem: 'DND_5E', mapCount: 3, tokenCount: 12, creatureCount: 0, tokenTemplateCount: 0, assetCount: 1,
    includesAudio: false, totalSizeBytes: 100,
  };

  async function startImport(onClose: () => void) {
    previewCampaignImport.mockResolvedValue(preview);
    let finish: (result: Record<string, unknown>) => void = () => undefined;
    importCampaign.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<CampaignImportDialog isOpen onClose={onClose} />);
    chooseArchive();
    fireEvent.click(await screen.findByRole('button', { name: /Import Campaign/ }));
    await screen.findByText('Importing campaign...');
    return finish;
  }

  it('ignores Escape, the backdrop and the X', async () => {
    const onClose = vi.fn();
    await startImport(onClose);

    await userEvent.keyboard('{Escape}');
    const backdrop = document.querySelector('[aria-hidden="true"].fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    expect(screen.getByText('Importing campaign...')).toBeTruthy();
  });

  it('can be closed again once the import has finished', async () => {
    const onClose = vi.fn();
    const finish = await startImport(onClose);

    finish({ campaignId: 'c1', campaignName: 'Keep', mapCount: 3, tokenCount: 12, creatureCount: 0, tokenTemplateCount: 0 });
    await screen.findByText('Import Complete!');
    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
