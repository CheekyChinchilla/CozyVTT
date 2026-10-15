/**
 * ListField keeps what is typed while the box is in use, and passes each
 * change up as a list straight away.
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListField, { parseCommaList, formatCommaList, parseLineList } from '../ListField';

function Harness({ initial, onList, max }: { initial: string[]; onList?: (items: string[]) => void; max?: number }) {
  const [items, setItems] = useState(initial);
  return (
    <>
      <ListField
        aria-label="Languages"
        value={items}
        onChange={(next) => { setItems(next); onList?.(next); }}
        parse={parseCommaList}
        format={formatCommaList}
        max={max}
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

describe('ListField with a limit', () => {
  const box = () => screen.getByLabelText('Languages') as HTMLInputElement;

  it('does not take an entry past the limit, and says why', () => {
    const onList = vi.fn();
    render(<Harness initial={['Common', 'Elven']} onList={onList} max={2} />);

    fireEvent.change(box(), { target: { value: 'Common, Elven, Dwarvish' } });

    expect(box().value).toBe('Common, Elven');
    expect(onList).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('a sheet holds at most 2 entries here');
  });

  it('takes the entries up to the limit, and the comma that follows the last', async () => {
    render(<Harness initial={[]} max={2} />);

    await userEvent.type(box(), 'Common, Elven, ');

    expect(box().value).toBe('Common, Elven, ');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('says nothing while there is room, and lifts the note once an entry is removed', () => {
    render(<Harness initial={['Common', 'Elven']} max={3} />);
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(box(), { target: { value: 'Common, Elven, Dwarvish' } });
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: 'Common, Elven' } });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('lets a list stored over the limit be shortened but not grown', () => {
    render(<Harness initial={['a', 'b', 'c', 'd']} max={2} />);

    fireEvent.change(box(), { target: { value: 'a, b, c, d, e' } });
    expect(box().value).toBe('a, b, c, d');
    fireEvent.change(box(), { target: { value: 'a, b, c' } });
    expect(box().value).toBe('a, b, c');
  });

  it('has no limit unless it is given one', () => {
    render(<Harness initial={[]} />);
    fireEvent.change(box(), { target: { value: Array.from({ length: 600 }, (_unused, i) => `n${i}`).join(', ') } });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
