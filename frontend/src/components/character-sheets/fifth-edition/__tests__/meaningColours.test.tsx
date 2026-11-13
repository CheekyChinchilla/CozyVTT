/**
 * The 5E editor shows colour that means something as the sheet does.
 *
 * Exhaustion is shown in the danger colour on the sheet and was picked in the
 * theme's accent in the editor; the death save boxes were given text colours,
 * which a checkbox does not draw, so every tick took the same colour.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FifthEditionCharacterEditor } from '../FifthEditionCharacterEditor';
import { fifthEditionCharacter } from './fifthEditionFixture';

vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));

function open() {
  render(<FifthEditionCharacterEditor character={fifthEditionCharacter({ exhaustionLevel: 2 })} onSave={() => Promise.resolve()} onCancel={vi.fn()} />);
  for (const tab of ['Combat', 'Stats & Skills']) {
    if (screen.queryByRole('button', { name: 'Exhaustion level 2' })) break;
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${tab}$`) }));
  }
}

it('picks an exhaustion level in the danger colour', () => {
  open();
  expect(screen.getByRole('button', { name: 'Exhaustion level 2' })).toHaveClass('border-danger', 'text-danger-ink');
});

it('ticks death saves in their own colours', () => {
  open();
  const boxes = screen.getAllByRole('checkbox', { name: /death save/i });
  expect(boxes.some((box) => box.classList.contains('accent-success'))).toBe(true);
  expect(boxes.some((box) => box.classList.contains('accent-danger'))).toBe(true);
});
