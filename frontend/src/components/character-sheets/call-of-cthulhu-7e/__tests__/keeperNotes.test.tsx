/**
 * Keeper's Notes are the Keeper's alone.
 *
 * The server sends the notes only to the DM of the character's campaign, and
 * always sends them to that DM, empty when nothing is written. So the editor
 * offers the box exactly when the sheet arrived with the field, and nobody
 * else is shown a box whose typing would never be saved. The read-only view
 * shows the notes only when there are some, which is the Keeper alone.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallOfCthulhu7eCharacterEditor } from '../CallOfCthulhu7eCharacterEditor';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import { cocCharacter } from './cocFixture';

function openBackstory(character: ReturnType<typeof cocCharacter>) {
  render(<CallOfCthulhu7eCharacterEditor character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Backstory' }));
}

describe("the editor's Keeper's Notes box", () => {
  it('is offered to the Keeper, whose sheet carries the field', () => {
    openBackstory(cocCharacter({ notes: '' }));
    expect(screen.getByRole('heading', { name: "Keeper's Notes" })).toBeInTheDocument();
    expect(screen.getByText('Only you, as the Keeper, can see or change these.')).toBeInTheDocument();
  });

  it('is not offered to anyone else, whose sheet arrives without it', () => {
    openBackstory(cocCharacter());
    expect(screen.queryByRole('heading', { name: "Keeper's Notes" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Notes kept by the Keeper about this investigator')).not.toBeInTheDocument();
  });
});

describe("the view's Keeper's Notes", () => {
  it('shows them when the sheet carries some', () => {
    render(<CallOfCthulhu7eCharacterView character={cocCharacter({ notes: 'A cultist' })} />);
    fireEvent.click(screen.getByRole('button', { name: /Backstory/ }));
    expect(screen.getByText('A cultist')).toBeInTheDocument();
  });
});
