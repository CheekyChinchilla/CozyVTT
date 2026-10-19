/**
 * NumberField
 *
 * Pins the behaviour players asked for: a numeric box you can clear and retype.
 * The sheets previously wrote `parseInt(value) || <default>` straight into state,
 * so an empty box was unrepresentable — clearing it snapped to the default and
 * the next keystroke appended to that, making "select all, type 18" produce
 * something else entirely.
 */

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import NumberField from '../NumberField';

/** Renders a controlled field that actually holds the committed value. */
function Controlled(props: { initial: number; min?: number; max?: number; fallback?: number }) {
  const [v, setV] = useState(props.initial);
  return (
    <NumberField
      value={v}
      onChange={setV}
      min={props.min}
      max={props.max}
      fallback={props.fallback}
      aria-label="score"
    />
  );
}

const box = () => screen.getByLabelText('score') as HTMLInputElement;

describe('NumberField', () => {
  it('shows the current value', () => {
    render(<NumberField value={12} onChange={() => {}} aria-label="score" />);
    expect(box().value).toBe('12');
  });

  // The reported bug.
  it('lets the box be emptied instead of snapping to a default', () => {
    render(<Controlled initial={10} min={1} max={30} />);
    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe('');
  });

  it('accepts a multi-digit number typed after clearing', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={1} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.change(box(), { target: { value: '1' } });
    fireEvent.change(box(), { target: { value: '18' } });

    expect(box().value).toBe('18');
    expect(onChange).toHaveBeenLastCalledWith(18);
  });

  it('does not clamp while typing', () => {
    // "1" is below a min of 3 but is on the way to "18" — clamping here is
    // exactly what made these fields unusable.
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={3} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '1' } });
    expect(box().value).toBe('1');
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('clamps to max on blur', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={1} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '999' } });
    fireEvent.blur(box());

    expect(box().value).toBe('30');
    expect(onChange).toHaveBeenLastCalledWith(30);
  });

  it('clamps to min on blur', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={3} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '1' } });
    fireEvent.blur(box());

    expect(box().value).toBe('3');
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it('falls back when left empty', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={1} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());

    expect(box().value).toBe('1');
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('uses an explicit fallback ahead of min', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={1} max={30} fallback={10} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.blur(box());

    // The box shows the fallback; 10 is already the committed value, so there
    // is no change to report.
    expect(box().value).toBe('10');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('allows negatives where the range permits', () => {
    const onChange = vi.fn();
    render(<NumberField value={0} onChange={onChange} min={-5} max={5} aria-label="score" />);

    // A lone "-" never reaches the component: an <input type="number"> reports
    // an empty value for anything it cannot parse, so the half-typed minus is
    // swallowed by the browser. The component treats it as the empty case,
    // which is the same "leave it alone until it is a number" behaviour.
    fireEvent.change(box(), { target: { value: '' } });
    expect(box().value).toBe('');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(box(), { target: { value: '-3' } });
    expect(onChange).toHaveBeenLastCalledWith(-3);
  });

  // Sheet fields are declared `z.number().int()` on the server, so committing a
  // float fails validation and takes every other edit in that save with it.
  it('truncates to a whole number by default', () => {
    const onChange = vi.fn();
    render(<NumberField value={10} onChange={onChange} min={1} max={30} aria-label="score" />);

    fireEvent.change(box(), { target: { value: '18.7' } });
    expect(onChange).toHaveBeenLastCalledWith(18);

    fireEvent.blur(box());
    expect(box().value).toBe('18');
  });

  it('keeps decimals where they are meaningful', () => {
    const onChange = vi.fn();
    render(
      <NumberField value={0} onChange={onChange} min={0} integer={false} step="0.1" aria-label="score" />
    );

    fireEvent.change(box(), { target: { value: '2.5' } });
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  it('follows the value when it changes from outside', () => {
    const { rerender } = render(<NumberField value={10} onChange={() => {}} aria-label="score" />);
    rerender(<NumberField value={20} onChange={() => {}} aria-label="score" />);
    expect(box().value).toBe('20');
  });
});

// Leaving a box reported its value again even when nothing had changed, so a
// keyboard user tabbing through a row counted as editing it: a D&D 5e row
// added and never typed in was then kept and refused for having no name.
describe('NumberField left unchanged', () => {
  it('reports nothing when focus passes through', () => {
    const onChange = vi.fn();
    render(<NumberField value={5} onChange={onChange} min={0} aria-label="range" />);
    const box = screen.getByLabelText('range');
    fireEvent.focus(box);
    fireEvent.blur(box);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('still reports a value brought within range', () => {
    const onChange = vi.fn();
    render(<NumberField value={0} onChange={onChange} min={1} aria-label="maximum" />);
    fireEvent.blur(screen.getByLabelText('maximum'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('still reports the fallback for an emptied box', () => {
    const onChange = vi.fn();
    render(<NumberField value={5} onChange={onChange} fallback={0} aria-label="bonus" />);
    const box = screen.getByLabelText('bonus');
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
