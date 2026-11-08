/**
 * A text box that grows with what is typed, up to a number of lines, then
 * scrolls inside itself, and shrinks back when emptied.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useGrowingTextarea, GROW_FALLBACK_LINE_PX } from '../useGrowingTextarea';

/** A box whose content is as tall as its lines, 20 px each, with 4 px of padding top and bottom. */
beforeAll(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return Math.max(1, this.value.split('\n').length) * 20 + 8;
    },
  });
});

function Box({ maxLines }: { maxLines: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  useGrowingTextarea(ref, value, maxLines);
  return (
    <textarea
      ref={ref}
      aria-label="box"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      style={{ lineHeight: '20px', paddingTop: '4px', paddingBottom: '4px', borderStyle: 'solid', borderTopWidth: '1px', borderBottomWidth: '1px' }}
    />
  );
}

const box = () => screen.getByRole('textbox', { name: 'box' });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

describe('useGrowingTextarea', () => {
  it('is one line tall while empty', () => {
    render(<Box maxLines={4} />);
    expect(box().style.height).toBe('30px');
    expect(box().style.overflowY).toBe('hidden');
  });

  it('grows a line for each line typed', () => {
    render(<Box maxLines={4} />);
    type('one\ntwo\nthree');
    expect(box().style.height).toBe('70px');
    expect(box().style.overflowY).toBe('hidden');
  });

  it('stops at its most lines and scrolls inside itself past them', () => {
    render(<Box maxLines={4} />);
    type('1\n2\n3\n4\n5\n6');
    expect(box().style.height).toBe('90px');
    expect(box().style.overflowY).toBe('auto');
  });

  it('shrinks back when emptied, as after sending', () => {
    render(<Box maxLines={6} />);
    type('1\n2\n3');
    type('');
    expect(box().style.height).toBe('30px');
  });

  it('takes a text-sm line when the browser gives no line height', () => {
    expect(GROW_FALLBACK_LINE_PX).toBe(20);
  });
});
