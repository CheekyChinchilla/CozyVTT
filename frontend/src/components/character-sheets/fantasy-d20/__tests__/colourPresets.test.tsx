/**
 * The header colours a Fantasy d20 sheet offers, and the name a sheet stores.
 *
 * A sheet stores the chosen preset's name. The first preset is Royal Blue
 * since 1.7.0, the name the 5E sheet gives the same colour. A sheet that stored the old name keeps it: it is drawn in
 * the first preset's colour, as any name the list no longer has is, and the
 * editor saves it back as it was until another colour is picked.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { CharacterData } from '@/types';
import { FantasyD20CharacterEditor } from '../FantasyD20CharacterEditor';
import { FantasyD20CharacterView } from '../FantasyD20CharacterView';
import { COLOR_PRESETS } from '../colorPresets';
import { COLOR_PRESETS as FIVE_E_PRESETS } from '../../fifth-edition/colorPresets';
import { fantasyD20Character } from './fantasyD20Fixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

/** A preset name the list does not offer, as a sheet saved under an older list holds. */
const UNLISTED = 'Retired Preset';

function openEditor(themeColor: string) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<FantasyD20CharacterEditor character={fantasyD20Character({ themeColor })} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function savedTheme(onSave: ReturnType<typeof openEditor>) {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return (onSave.mock.calls[0][0] as unknown as { themeColor?: string }).themeColor;
}

describe('the Fantasy d20 header colours', () => {
  it('offers its blue as Royal Blue, as the 5E sheet names the same colour', () => {
    openEditor('');
    fireEvent.click(screen.getByTitle('Change theme color'));
    expect(screen.getByRole('button', { name: 'Royal Blue' })).toBeInTheDocument();
    expect(COLOR_PRESETS[0]).toEqual(FIVE_E_PRESETS.find((preset) => preset.name === 'Royal Blue'));
  });

  it('draws a preset name the list does not have in the first preset\'s colour, and never shows the name', () => {
    const { container } = render(<FantasyD20CharacterView character={fantasyD20Character({ themeColor: UNLISTED })} onEdit={vi.fn()} />);
    expect(container.querySelector(`.${COLOR_PRESETS[0].from}.${COLOR_PRESETS[0].to}`)).not.toBeNull();
    expect(container.textContent).not.toContain(UNLISTED);
  });

  it('saves a preset name the list does not have back as it was', async () => {
    const onSave = openEditor(UNLISTED);
    expect(await savedTheme(onSave)).toBe(UNLISTED);
  });

  it('saves the colour picked in place of a name the list does not have', async () => {
    const onSave = openEditor(UNLISTED);
    fireEvent.click(screen.getByTitle('Change theme color'));
    fireEvent.click(screen.getByRole('button', { name: 'Golden' }));
    expect(await savedTheme(onSave)).toBe('Golden');
  });

  it('saves the first preset by its name when it is picked over a name the list does not have', async () => {
    const onSave = openEditor(UNLISTED);
    fireEvent.click(screen.getByTitle('Change theme color'));
    fireEvent.click(screen.getByRole('button', { name: 'Royal Blue' }));
    expect(await savedTheme(onSave)).toBe('Royal Blue');
  });

  // The editor opens on the first preset's colour with the name kept aside,
  // so nothing on screen changes and nothing counts as a change.
  it('opens on the first preset\'s colour for a name the list does not have, never showing the name', () => {
    const onDirtyChange = vi.fn();
    const { container } = render(<FantasyD20CharacterEditor character={fantasyD20Character({ themeColor: UNLISTED })} onSave={vi.fn()} onCancel={vi.fn()} onDirtyChange={onDirtyChange} />);
    const header = container.querySelector('[data-sheet-header]');
    expect(header).toHaveClass(COLOR_PRESETS[0].from, COLOR_PRESETS[0].to);
    expect(header).not.toHaveAttribute('style');
    fireEvent.click(screen.getByTitle('Change theme color'));
    expect(screen.getByRole('button', { name: 'Royal Blue' })).toHaveClass('ring-2');
    expect(container.textContent).not.toContain(UNLISTED);
    expect(screen.queryByDisplayValue(UNLISTED)).toBeNull();
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });
});
