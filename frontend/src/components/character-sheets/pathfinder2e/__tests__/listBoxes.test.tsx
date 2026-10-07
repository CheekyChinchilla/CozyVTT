/**
 * Typing into the Pathfinder 2e comma-separated boxes.
 *
 * Senses, speeds, resistances, immunities, weaknesses, conditions, strike
 * traits and languages were split, trimmed and joined again on every
 * keystroke, so the comma or space typed after a word vanished before the next
 * one: "Common, Elven" came out as "CommonElven". Pasting a whole list worked.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

interface Saved {
  perception: { senses: string[] };
  languages: string[];
  hp: { resistances: string[] };
}

function renderEditor() {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ languages: [] })} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
}

async function save(onSave: ReturnType<typeof renderEditor>): Promise<Saved> {
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  return onSave.mock.calls[0][0] as unknown as Saved;
}

describe('comma-separated boxes', () => {
  it('keeps the comma and space typed between senses', async () => {
    const onSave = renderEditor();
    const box = screen.getByPlaceholderText('low-light vision, darkvision 60 ft.') as HTMLInputElement;

    await userEvent.type(box, 'low-light vision, darkvision 60 ft.');

    expect(box.value).toBe('low-light vision, darkvision 60 ft.');
    expect((await save(onSave)).perception.senses).toEqual(['low-light vision', 'darkvision 60 ft.']);
  });

  it('keeps what is typed into the languages box', async () => {
    const onSave = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Biography' }));
    const box = screen.getByPlaceholderText('Common, Elven, Draconic') as HTMLInputElement;

    await userEvent.type(box, 'Common, Elven');

    expect((await save(onSave)).languages).toEqual(['Common', 'Elven']);
  });

  it('tidies the list once the box is left', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Combat' }));
    const box = screen.getByPlaceholderText('fire 5') as HTMLInputElement;

    await userEvent.type(box, 'fire 5,  cold 5, ');
    expect(box.value).toBe('fire 5,  cold 5, ');

    fireEvent.blur(box);
    expect(box.value).toBe('fire 5, cold 5');
  });
});
