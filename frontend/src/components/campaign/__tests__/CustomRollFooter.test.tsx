/**
 * The free-form roll offered at the foot of both roll pickers.
 *
 * It lived only in the creature picker, so a player right-clicking their own
 * token got whatever their sheet could express and nothing else — a DM asking
 * for "2d6 for the falling rock" sent them to the dice panel, where the roll
 * would be filed under their own name rather than their character's.
 *
 * One component, so the two pickers cannot drift apart again.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomRollFooter from '../CustomRollFooter';

const expressionBox = () => screen.getByPlaceholderText('e.g. 2d6+3');
const labelBox = () => screen.getByPlaceholderText(/^Label \(optional/);

describe('CustomRollFooter', () => {
  it('rolls the expression, filed under the label given', () => {
    const onRoll = vi.fn();
    render(<CustomRollFooter onRoll={onRoll} />);
    fireEvent.change(expressionBox(), { target: { value: '2d6+3' } });
    fireEvent.change(labelBox(), { target: { value: 'Falling rock' } });
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onRoll).toHaveBeenCalledWith('2d6+3', 'Falling rock');
  });

  it('falls back to a generic label when none is given', () => {
    const onRoll = vi.fn();
    render(<CustomRollFooter onRoll={onRoll} />);
    fireEvent.change(expressionBox(), { target: { value: '1d20' } });
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onRoll).toHaveBeenCalledWith('1d20', 'Custom Roll');
  });

  it('refuses an expression the dice parser would reject', () => {
    const onRoll = vi.fn();
    render(<CustomRollFooter onRoll={onRoll} />);
    fireEvent.change(expressionBox(), { target: { value: 'not dice' } });
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByText(/invalid dice expression/i)).toBeInTheDocument();
  });

  it('asks for an expression rather than rolling nothing', () => {
    const onRoll = vi.fn();
    render(<CustomRollFooter onRoll={onRoll} />);
    fireEvent.click(screen.getByRole('button', { name: /roll/i }));
    expect(onRoll).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a dice expression/i)).toBeInTheDocument();
  });

  it('rolls on Enter, so it can be used without reaching for the button', () => {
    const onRoll = vi.fn();
    render(<CustomRollFooter onRoll={onRoll} />);
    fireEvent.change(expressionBox(), { target: { value: '1d20+5' } });
    fireEvent.keyDown(expressionBox(), { key: 'Enter' });
    expect(onRoll).toHaveBeenCalledWith('1d20+5', 'Custom Roll');
  });
});
