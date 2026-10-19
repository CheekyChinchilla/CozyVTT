/**
 * A Call of Cthulhu investigator's token picture is checked and named.
 *
 * The editor took any file as the token picture, which the server then
 * refused at save, and named every upload "Investigator Token" from a field
 * the sheet does not keep. It now checks the file as the other sheets do and
 * names the picture after the investigator.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { cocCharacter } from './cocFixture';

const uploadAsset = vi.fn();
vi.mock('@/services/api', () => ({ api: { uploadAsset: (form: FormData) => uploadAsset(form) } }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

beforeEach(() => {
  uploadAsset.mockReset().mockResolvedValue({ message: 'ok', asset: { id: 'asset-1' } });
});

const pick = (file: File) =>
  fireEvent.change(document.getElementById('token-upload') as HTMLInputElement, { target: { files: [file] } });

describe('the token picture', () => {
  it('refuses a file that is not a picture', async () => {
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter()} onSave={vi.fn().mockResolvedValue(undefined)} onCancel={vi.fn()} />);
    pick(new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByText('Please select an image file')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(uploadAsset).not.toHaveBeenCalled());
  });

  it('is named after the investigator and sent last', async () => {
    const onSave = vi.fn<(data: CharacterData, toast?: boolean, url?: string) => Promise<void>>().mockResolvedValue(undefined);
    render(<CallOfCthulhu7eCharacterEditor character={cocCharacter({ investigatorName: 'Harvey Walters' })} onSave={onSave} onCancel={vi.fn()} />);
    pick(new File([new Uint8Array(10)], 'harvey.png', { type: 'image/png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const form = uploadAsset.mock.calls[0][0] as FormData;
    expect(form.get('name')).toBe('Harvey Walters Token');
    expect([...form.keys()].pop()).toBe('file');
    expect(onSave.mock.calls[0][2]).toBe('/api/assets/tokens/asset-1');
  });
});
