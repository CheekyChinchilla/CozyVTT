import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TokenVisionField from '../TokenVisionField';

describe('TokenVisionField', () => {
  it('shows the value and the units', () => {
    render(<TokenVisionField value={12} onChange={() => {}} />);
    expect((screen.getByLabelText('Darkvision in grid squares') as HTMLInputElement).value).toBe('12');
    expect(screen.getByText(/0 = none, 12 = 60 ft/)).toBeTruthy();
  });

  it('reports a whole number of squares, clamped to the token bounds', () => {
    const onChange = vi.fn();
    render(<TokenVisionField value={0} onChange={onChange} />);
    const input = screen.getByLabelText('Darkvision in grid squares');
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.change(input, { target: { value: '7.6' } });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([6, 0, 200, 8]);
  });

  it('commits once, on blur or Enter, with the final value', () => {
    const onCommit = vi.fn();
    render(<TokenVisionField value={0} onCommit={onCommit} />);
    const input = screen.getByLabelText('Darkvision in grid squares');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([12]);
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([12, 200]);
  });

  it('does not commit a value that did not change, and reads a cleared field as none', () => {
    const onCommit = vi.fn();
    render(<TokenVisionField value={5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Darkvision in grid squares') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit.mock.calls.map((c) => c[0])).toEqual([0]);
    expect(input.value).toBe('0');
  });
});
