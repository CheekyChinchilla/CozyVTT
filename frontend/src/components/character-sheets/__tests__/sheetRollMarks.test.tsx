/**
 * Every element of a sheet that rolls when pressed carries a mark the roll's
 * feedback finds (hooks/useRollFeedback.ts): a d20 test its `data-roll`, any
 * other roll `data-sheet-roll`. A sheet that cannot roll marks nothing.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CharacteristicBlock from '../call-of-cthulhu-7e/components/CharacteristicBlock';

describe('the roll marks', () => {
  it('mark a Call of Cthulhu characteristic that rolls, and not one that does not', () => {
    const { unmount } = render(<CharacteristicBlock label="STR" regular={50} half={25} fifth={10} onRoll={() => undefined} />);
    expect(screen.getByTitle(/Click to roll STR/).hasAttribute('data-sheet-roll')).toBe(true);
    unmount();

    const { container } = render(<CharacteristicBlock label="STR" regular={50} half={25} fifth={10} />);
    expect(container.querySelector('[data-sheet-roll]')).toBeNull();
  });
});
