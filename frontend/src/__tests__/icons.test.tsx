/**
 * What screen readers are told about an icon.
 *
 * An icon with no label of its own is decoration: the button or text beside it
 * carries the meaning, so the icon is hidden from screen readers. An icon given
 * an aria-label, such as the spinners on the two-factor setup page and in
 * Invite Player, is the only thing saying what is happening, and stays exposed
 * under that label.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loader2, Trash2 } from 'lucide-react';

describe('lucide icons and screen readers', () => {
  it('hides an icon that has no label of its own', () => {
    const { container } = render(<button type="button"><Trash2 /> Delete</button>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button')).toHaveAccessibleName('Delete');
  });

  it('keeps an icon given an aria-label exposed under that label', () => {
    render(<Loader2 aria-label="Loading" />);
    const spinner = screen.getByLabelText('Loading');
    expect(spinner).not.toHaveAttribute('aria-hidden');
  });
});
