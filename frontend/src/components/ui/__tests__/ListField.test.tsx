/**
 * ListField keeps what is typed while the box is in use, and passes each
 * change up as a list straight away.
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListField, { parseCommaList, formatCommaList, parseLineList } from '../ListField';

function Harness({ initial, onList }: { initial: string[]; onList?: (items: string[]) => void }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <ListField
        aria-label="Languages"
        value={items}
        onChange={(next) => { setItems(next); onList?.(next); }}
        parse={parseCommaList}
        format={formatCommaList}
      />
      <button type="button" onClick={() => setItems(['Draconic'])}>Replace</button>
    </>
  );
}

describe('ListField', () => {
  it('passes each change up as a list while keeping the text as typed', async () => {
    const onList = vi.fn();
    render(<Harness initial={[]} onList={onList} />);
    const box = screen.getByLabelText('Languages') as HTMLInputElement;

    await userEvent.type(box, 'Common, ');

    expect(box.value).toBe('Common, ');
    expect(onList).toHaveBeenLastCalledWith(['Common']);
  });

  it('writes the list in its own spelling once the box is left', async () => {
    render(<Harness initial={[]} />);
    const box = screen.getByLabelText('Languages') as HTMLInputElement;

    await userEvent.type(box, ' Common ,Elven,');
    fireEvent.blur(box);

    expect(box.value).toBe('Common, Elven');
  });

  it('shows a list changed from outside while the box is in use', async () => {
    render(<Harness initial={['Common']} />);
    const box = screen.getByLabelText('Languages') as HTMLInputElement;

    await userEvent.type(box, ', ');
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

    expect(box.value).toBe('Draconic');
  });

  it('reads one item per line', () => {
    expect(parseLineList('Elder Sign\n\n  Contact Nyarlathotep \n')).toEqual(['Elder Sign', 'Contact Nyarlathotep']);
  });
});
