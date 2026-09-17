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
});
