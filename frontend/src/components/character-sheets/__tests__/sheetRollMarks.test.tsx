/**
 * Every element of a sheet that rolls when pressed carries a mark the roll's
 * feedback finds (hooks/useRollFeedback.ts): a d20 test its `data-roll`, any
 * other roll `data-sheet-roll`. A sheet that cannot roll marks nothing.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CharacteristicBlock from '../horror-d100/components/CharacteristicBlock';

describe('the roll marks', () => {
  it('mark a Horror d100 characteristic that rolls, and not one that does not', () => {
    const { unmount } = render(<CharacteristicBlock label="STR" value={10} roll="Effort" onRoll={() => undefined} />);
    expect(screen.getByTitle(/Click to roll Effort/).hasAttribute('data-sheet-roll')).toBe(true);
    unmount();

    const { container, unmount: unmountPlain } = render(<CharacteristicBlock label="STR" value={10} roll="Effort" />);
    expect(container.querySelector('[data-sheet-roll]')).toBeNull();
    unmountPlain();

    // SIZ gives no roll, on a sheet that can roll too.
    const size = render(<CharacteristicBlock label="SIZ" value={10} onRoll={() => undefined} />);
    expect(size.container.querySelector('[data-sheet-roll]')).toBeNull();
    expect(size.container.querySelector('[title]')).toBeNull();
  });
});
