/**
 * The Horror d100 read-only sheet.
 *
 * Its palette button changed the header colour until the sheet was left and
 * saved nothing, unlike the other sheets, which have none; it sat over the
 * PLAYER line with the Edit button. With no spells the Story tab shows no
 * Spells box, and Knowledge (Blasphemous Lore) is read on the Skills tab and
 * in the Sanity box, where it lowers the maximum.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { blankSkills, horrorD100Character } from './sheetFixture';

describe('the read-only sheet', () => {
  it('has no palette button, and Edit in the corner as on the other sheets', () => {
    render(<HorrorD100CharacterView character={horrorD100Character()} onEdit={vi.fn()} />);
    expect(screen.queryByTitle('Change theme color')).toBeNull();
    expect(screen.getByRole('button', { name: /Edit/ }).className).toContain('right-4');
  });

  it('shows no Spells box and no stray 0 for a character with no spells', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ spells: [] })} />);
    fireEvent.click(screen.getByRole('tab', { name: /Story/ }));
    expect(screen.queryByRole('heading', { name: 'Spells' })).toBeNull();
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it('shows the spells a character knows', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ spells: ['Ward of Ash'] })} />);
    fireEvent.click(screen.getByRole('tab', { name: /Story/ }));
    expect(screen.getByRole('heading', { name: 'Spells' })).toBeInTheDocument();
    expect(screen.getByText('Ward of Ash')).toBeInTheDocument();
  });

  it('shows Knowledge (Blasphemous Lore) among the skills and under maximum Sanity', () => {
    const skills = blankSkills({ knowledge: [{ specialty: 'Blasphemous Lore', value: 6, experienceCheck: false }] });
    render(<HorrorD100CharacterView character={horrorD100Character({ skills, sanity: { starting: 50, maximum: 94, current: 40 } })} onRoll={vi.fn()} />);
    expect(screen.getByText('(100 − 6 Blasphemous Lore)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Skills/ }));
    expect(screen.getByTitle('Click to roll Knowledge (Blasphemous Lore) (target: 6%)')).toBeInTheDocument();
    expect(screen.getByText('6%')).toBeInTheDocument();
  });

  it('shows the header\'s fields, and stands in for a missing name and profession', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ characterName: 'Ines Okafor', profession: 'Sailor', era: '1920s', playerName: 'Robin Vale', age: '38', sex: 'Female', residence: 'Lisbon', birthplace: 'Porto' })} />);
    for (const text of ['Ines Okafor', 'Sailor', '• 1920s', 'Robin Vale', 'Age 38', '• Female', 'Lisbon', '• Born in Porto']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});
