/**
 * The D&D 5e editor's Alignment and Background boxes are named by their
 * labels. The labels were not tied to the boxes, so a screen reader announced
 * each box by its placeholder alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DnD5eCharacterEditor } from '../DnD5eCharacterEditor';
import { dnd5eCharacter } from './dnd5eFixture';

vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));

describe('the character details', () => {
  it('names the Alignment and Background boxes by their labels', () => {
    render(<DnD5eCharacterEditor character={dnd5eCharacter()} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Alignment')).toHaveValue('Neutral');
    expect(screen.getByLabelText('Background')).toHaveValue('Soldier');
  });
});
