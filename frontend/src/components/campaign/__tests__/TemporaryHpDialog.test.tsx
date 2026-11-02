/**
 * Temporary HP...: how many to grant, then the rule for a second grant.
 *
 * In D&D 5e and Pathfinder 2e temporary hit points never add together: a
 * creature that already has some keeps them or takes the new ones. So with
 * none the grant is taken at once, and with some the dialog offers Keep N
 * and Take M. Keeping changes nothing.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemporaryHpDialog from '../TemporaryHpDialog';

function open(current: number, system: string | null = 'DND_5E') {
  const onTake = vi.fn();
  const onClose = vi.fn();
  render(<TemporaryHpDialog name="Brann" current={current} system={system} onTake={onTake} onClose={onClose} />);
  return { onTake, onClose };
}

const box = () => screen.getByLabelText('Temporary hit points for Brann');
const grant = (value: string) => {
  fireEvent.change(box(), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
};

describe('Temporary HP...', () => {
  it('gives a creature with none the number granted', () => {
    const { onTake, onClose } = open(0);
    grant('12');
    expect(onTake).toHaveBeenCalledWith(12);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers a creature with some Keep N and Take M, never the two added', () => {
    const { onTake } = open(10);
    grant('12');
    expect(onTake).not.toHaveBeenCalled();
    expect(screen.getByText(/already has 10 temporary hit points/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep 10' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take 12' }));
    expect(onTake).toHaveBeenCalledWith(12);
  });

  it('changes nothing when the creature keeps what it has', () => {
    const { onTake, onClose } = open(10, 'PATHFINDER_2E');
    grant('4');
    fireEvent.click(screen.getByRole('button', { name: 'Keep 10' }));
    expect(onTake).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('takes a grant of as many as the creature has at once, with nothing to choose', () => {
    const { onTake } = open(8);
    grant('8');
    expect(onTake).toHaveBeenCalledWith(8);
  });

  it.each(['', '0', '-3', '2.5', '100000', 'ten'])('will not grant %j', (value) => {
    open(0);
    fireEvent.change(box(), { target: { value } });
    expect(screen.getByRole('button', { name: 'Grant' })).toBeDisabled();
  });

  it('says how many the creature has before asking', () => {
    open(6);
    expect(screen.getByText('They have 6 now.')).toBeInTheDocument();
  });
});

describe('on a touch screen and from the keyboard', () => {
  it('has controls a finger can hit, at every step', () => {
    open(10);
    expect(box().className.split(/\s+/)).toContain('pointer-coarse:min-h-11');
    for (const name of ['Cancel', 'Grant']) expect(screen.getByRole('button', { name }).className.split(/\s+/)).toContain('touch-target');
    grant('12');
    for (const name of ['Keep 10', 'Take 12']) expect(screen.getByRole('button', { name }).className.split(/\s+/)).toContain('touch-target');
  });

  it('puts the cursor on Take M, which says why it asks, and Enter takes it', async () => {
    const user = userEvent.setup();
    const { onTake } = open(10);
    await user.type(box(), '12{Enter}');

    const takeNew = screen.getByRole('button', { name: 'Take 12' });
    expect(document.activeElement).toBe(takeNew);
    expect(takeNew).toHaveAccessibleDescription(/Brann already has 10 temporary hit points/);
    expect(screen.getByRole('button', { name: 'Keep 10' })).toHaveAccessibleDescription(/Brann already has 10 temporary hit points/);
    await user.keyboard('{Enter}');
    expect(onTake).toHaveBeenCalledWith(12);
  });
});
