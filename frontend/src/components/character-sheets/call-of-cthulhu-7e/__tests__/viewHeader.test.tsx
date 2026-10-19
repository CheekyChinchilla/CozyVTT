/**
 * The Call of Cthulhu read-only sheet.
 *
 * Its palette button changed the header colour until the sheet was left and
 * saved nothing, unlike the other sheets, which have none; it sat over the
 * PLAYER line with the Edit button. With Cthulhu Mythos at 0 and no spells
 * the Backstory tab showed a stray "0", and it read the Mythos box that
 * nothing used where the skill counts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const skills = COC_BLANK_SHEET.skills as Record<string, unknown>;

describe('the read-only sheet', () => {
  it('has no palette button, and Edit in the corner as on the other sheets', () => {
    render(<CallOfCthulhu7eCharacterView character={cocCharacter()} onEdit={vi.fn()} />);
    expect(screen.queryByTitle('Change theme color')).toBeNull();
    expect(screen.getByRole('button', { name: /Edit/ }).className).toContain('right-4');
  });

  it('shows no stray 0 for no Mythos and no spells', () => {
    render(<CallOfCthulhu7eCharacterView character={cocCharacter({ spellsAndMythos: { cthulhuMythos: 0, spells: [] } })} />);
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    expect(screen.queryByText(/^0$/)).toBeNull();
  });

  it('shows the Cthulhu Mythos skill', () => {
    render(
      <CallOfCthulhu7eCharacterView
        character={cocCharacter({
          skills: { ...skills, cthulhuMythos: { baseValue: 0, currentValue: 6, improvementChecked: false } },
          spellsAndMythos: { cthulhuMythos: 0, spells: [] },
        })}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    expect(screen.getByText('6%')).toBeInTheDocument();
  });
});
