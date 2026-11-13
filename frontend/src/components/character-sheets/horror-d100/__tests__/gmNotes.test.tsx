/**
 * GM's Notes are the GM's alone.
 *
 * The server sends the notes only to the GM of the character's campaign, and
 * always sends them to that GM, empty when nothing is written. So the editor
 * offers the box exactly when the sheet arrived with the field, and nobody
 * else is shown a box whose typing would never be saved. The read-only view
 * shows the notes only when there are some, which is the GM alone.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HorrorD100CharacterEditor } from '../HorrorD100CharacterEditor';
import { HorrorD100CharacterView } from '../HorrorD100CharacterView';
import { horrorD100Character } from './sheetFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function openStory(character: ReturnType<typeof horrorD100Character>) {
  render(<HorrorD100CharacterEditor character={character} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Story' }));
}

describe("the editor's GM's Notes box", () => {
  it('is offered to the GM, whose sheet carries the field', () => {
    openStory(horrorD100Character({ notes: '' }));
    expect(screen.getByRole('heading', { name: "GM's Notes" })).toBeInTheDocument();
    expect(screen.getByText('Only you, as the GM, can see or change these.')).toBeInTheDocument();
  });

  it('is not offered to anyone else, whose sheet arrives without it', () => {
    openStory(horrorD100Character());
    expect(screen.queryByRole('heading', { name: "GM's Notes" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Notes kept by the GM about this character')).not.toBeInTheDocument();
  });
});

describe("the view's GM's Notes", () => {
  it('shows them when the sheet carries some', () => {
    render(<HorrorD100CharacterView character={horrorD100Character({ notes: 'A cultist' })} />);
    fireEvent.click(screen.getByRole('tab', { name: /Story/ }));
    expect(screen.getByText('A cultist')).toBeInTheDocument();
  });
});
