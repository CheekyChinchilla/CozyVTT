/**
 * Importing a character file an older version exported for the unreleased
 * system versions before 1.7.0 could hold: the window reads it as a
 * character with no system, says so before anything is imported, shows no
 * system code, and imports it with none.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImportCharacterModal from '../ImportCharacterModal';
import { RETIRED_GAME_SYSTEM } from '@/legacy/retiredGameSystem';
import { RETIRED_SYSTEM_FILE_NOTICE } from '@/utils/character-export';

function choose(gameSystem: unknown): void {
  const body = JSON.stringify({ cozyVttVersion: '1.0', character: { name: 'Aldra', gameSystem, data: { edge: 3 } } });
  const input = document.getElementById('character-file-input');
  if (!(input instanceof HTMLInputElement)) throw new Error('the window has no file box');
  fireEvent.change(input, { target: { files: [new File([body], 'aldra.json', { type: 'application/json' })] } });
}

describe('a character file naming the unreleased system', () => {
  it('is previewed with a line saying it is imported with no system, and imported so', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<ImportCharacterModal onClose={vi.fn()} onImport={onImport} existingCharacterNames={[]} />);
    choose(RETIRED_GAME_SYSTEM);

    expect(await screen.findByText(RETIRED_SYSTEM_FILE_NOTICE)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(RETIRED_GAME_SYSTEM);

    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ name: 'Aldra', gameSystem: null, data: { edge: 3 } }));
  });

  it('says nothing of the kind for a file of a system this instance has', async () => {
    render(<ImportCharacterModal onClose={vi.fn()} onImport={vi.fn()} existingCharacterNames={[]} />);
    choose('FIFTH_EDITION');
    expect(await screen.findByText('Character Loaded Successfully')).toBeInTheDocument();
    expect(screen.queryByText(RETIRED_SYSTEM_FILE_NOTICE)).toBeNull();
  });
});
