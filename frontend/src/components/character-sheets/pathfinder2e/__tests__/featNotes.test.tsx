/**
 * A Pathfinder 2e feat's text can be edited whichever field holds it.
 *
 * The built-in templates write a feat's text to `notes`; the editor edits
 * `description`. A Fighter's Power Attack opened with an empty box, and its
 * text could be neither changed nor removed. The editor now folds `notes` into
 * the description as it opens, so each feat has one text.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Pathfinder2eCharacterEditor } from '../Pathfinder2eCharacterEditor';
import type { CharacterData } from '../../../../types';
import { pf2eCharacter } from './pf2eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

const feats = (classFeats: Record<string, unknown>[]) => ({ ancestryAndHeritage: [], class: classFeats, skill: [], general: [], bonus: [] });

function open(classFeats: Record<string, unknown>[]) {
  const onSave = vi.fn<(data: CharacterData) => Promise<void>>().mockResolvedValue(undefined);
  render(<Pathfinder2eCharacterEditor character={pf2eCharacter({ feats: feats(classFeats) })} onSave={onSave} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Feats & Features/ }));
  return async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    return (onSave.mock.calls[0][0] as unknown as { feats: { class: Record<string, unknown>[] } }).feats.class;
  };
}

describe('a feat whose text is in its notes', () => {
  it('opens with that text in the box, saved as its description', async () => {
    const save = open([{ name: 'Power Attack', level: 1, notes: 'Two-action Strike, one extra die' }]);
    expect(screen.getByDisplayValue('Two-action Strike, one extra die')).toBeInTheDocument();

    const [feat] = await save();
    expect(feat.description).toBe('Two-action Strike, one extra die');
    expect(feat).not.toHaveProperty('notes');
  });

  it('keeps both texts when it has a description too', async () => {
    const save = open([{ name: 'Sudden Charge', level: 1, description: 'Stride twice, then Strike.', notes: 'Flourish' }]);

    const [feat] = await save();
    expect(feat.description).toBe('Stride twice, then Strike.\n\nFlourish');
    expect(feat).not.toHaveProperty('notes');
  });
});
