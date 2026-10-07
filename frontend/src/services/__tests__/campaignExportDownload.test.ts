/**
 * A campaign export goes to a file without the page holding all of it.
 *
 * The export was fetched whole into memory as a Blob, under the 30-second
 * limit every request shares, so a large campaign failed with a timeout, or
 * held hundreds of megabytes in the tab. Where the browser lets a page
 * write to a file the user picks, the archive now streams there as it
 * arrives; elsewhere it is handed to the browser's download. A refusal is
 * read as the server wrote it, so its message reaches the DM.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '@/services/api';
import { apiErrorMessage, apiErrorStatus } from '@/utils/errors';

const ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);

/** A response whose body arrives in two pieces. */
function archiveResponse(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(ARCHIVE.subarray(0, 4));
      controller.enqueue(ARCHIVE.subarray(4));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/zip' } });
}

type PickerWindow = Window & { showSaveFilePicker?: unknown };

let fetchMock: ReturnType<typeof vi.fn>;
let createObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  createObjectURL = vi.fn(() => 'blob:export');
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as PickerWindow).showSaveFilePicker;
  vi.restoreAllMocks();
});

describe('downloadCampaignExport', () => {
  it('asks for the export with the session cookie and the audio choice', async () => {
    fetchMock.mockResolvedValue(archiveResponse());
    await api.downloadCampaignExport('c1', { includeAudio: true }, 'Keep-export.cozyvtt');
    expect(fetchMock).toHaveBeenCalledWith('/api/campaigns/c1/export?includeAudio=true', { credentials: 'include' });
  });

  it('streams the archive into the file the user picks, without building a Blob', async () => {
    fetchMock.mockResolvedValue(archiveResponse());
    const written: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({ write: (chunk) => void written.push(chunk) });
    const picker = vi.fn().mockResolvedValue({ createWritable: async () => writable });
    (window as PickerWindow).showSaveFilePicker = picker;

    expect(await api.downloadCampaignExport('c1', { includeAudio: false }, 'Keep-export.cozyvtt')).toBe('saved');

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Keep-export.cozyvtt' }));
    expect(written).toHaveLength(2);
    expect(new Uint8Array(written.flatMap((c) => [...c]))).toEqual(ARCHIVE);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('stops, saving nothing, when the user cancels the save dialog', async () => {
    fetchMock.mockResolvedValue(archiveResponse());
    (window as PickerWindow).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    expect(await api.downloadCampaignExport('c1', { includeAudio: false }, 'Keep-export.cozyvtt')).toBe('cancelled');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("hands the archive to the browser's download where there is no save dialog", async () => {
    fetchMock.mockResolvedValue(archiveResponse());
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(await api.downloadCampaignExport('c1', { includeAudio: false }, 'Keep-export.cozyvtt')).toBe('saved');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('falls back to the download when the browser will not open the save dialog now', async () => {
    fetchMock.mockResolvedValue(archiveResponse());
    (window as PickerWindow).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('Must be handling a user gesture.', 'SecurityError'));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    expect(await api.downloadCampaignExport('c1', { includeAudio: false }, 'Keep-export.cozyvtt')).toBe('saved');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("rejects with the server's own refusal, readable like any other request's", async () => {
    const refusal = { error: 'Export Too Large', message: "This campaign's files add up to 734 MB." };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(refusal), { status: 422, headers: { 'Content-Type': 'application/json' } }));
    const picker = vi.fn();
    (window as PickerWindow).showSaveFilePicker = picker;

    const err = await api.downloadCampaignExport('c1', { includeAudio: false }, 'x.cozyvtt').catch((e: unknown) => e);

    expect(apiErrorStatus(err)).toBe(422);
    expect(apiErrorMessage(err)).toBe("This campaign's files add up to 734 MB.");
    expect(picker).not.toHaveBeenCalled();
  });
});
