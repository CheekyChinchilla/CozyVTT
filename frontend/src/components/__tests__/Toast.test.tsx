/**
 * Toast placement and legibility.
 *
 * Reported from a live game: the message shown when a move onto an occupied
 * square is refused appeared at the bottom of the screen, cut off and
 * unreadable.
 *
 * The component was fine. The map wrapped it in a positioning div carrying
 * `-translate-x-1/2`, and a transform makes that div the containing block for
 * `position: fixed` descendants — so the toast anchored to a zero-width element
 * at the bottom of the map rather than the viewport, and `max-w-md` measured
 * against the same sliver and wrapped the text into a column a few characters
 * wide. `pointer-events-none` on the wrapper disabled the close button too.
 *
 * jsdom does no layout, so none of that can be caught by measuring. What is
 * pinned here is the contract the wrapper broke: this component places itself
 * against the viewport, and callers must render it bare.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from '../Toast';

const noop = () => {};

describe('Toast', () => {
  it('shows the message it was given', () => {
    render(<Toast show message="Goblin Sniper is already standing there." onClose={noop} />);
    expect(screen.getByText('Goblin Sniper is already standing there.')).toBeInTheDocument();
  });

  it('renders nothing when not shown', () => {
    render(<Toast show={false} message="Hidden" onClose={noop} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The contract a wrapper must not interfere with. `fixed` only means "the
  // viewport" while no ancestor has a transform, filter or containment, so a
  // caller that wraps this in a positioned div silently moves it elsewhere.
  it('positions itself against the viewport, needing no wrapper', () => {
    render(<Toast show message="Placed" onClose={noop} />);
    const positioned = screen.getByRole('alert').parentElement!;
    expect(positioned.className).toContain('fixed');
    expect(positioned.className).toContain('top-4');
    expect(positioned.className).toContain('right-4');
  });

  it('wraps a long message instead of truncating it', () => {
    const long =
      'Dire Rat Swarm is already standing there, and so is everything else that ' +
      'happens to be crowded onto this particular square of the battlemap.';
    render(<Toast show message={long} onClose={noop} />);

    const text = screen.getByText(long);
    expect(text.className).toContain('break-words');
    expect(text.className).not.toContain('truncate');
    expect(text.className).not.toContain('whitespace-nowrap');
  });

  it('can be dismissed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Toast show message="Dismiss me" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Close notification' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('announces itself to a screen reader', () => {
    render(<Toast show message="Announced" onClose={noop} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });
});
