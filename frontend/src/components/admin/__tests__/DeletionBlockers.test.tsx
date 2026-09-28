/**
 * An admin can clear the campaigns that stop a user's deletion.
 *
 * A user who runs campaigns of their own cannot be deleted until each has
 * another DM or is gone. Only the DM, the owner or an admin may hand the seat
 * over, so without this an admin had no way from the panel to remove someone
 * who would not step down.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeletionBlockers from '../DeletionBlockers';
import { apiDeletionBlockers } from '@/utils/errors';
import type { DeletionBlocker } from '@/types';

const transferDM = vi.fn();
const deleteCampaign = vi.fn();
vi.mock('@/services/api', () => {
  const client = { transferDM: (...a: unknown[]) => transferDM(...a), deleteCampaign: (...a: unknown[]) => deleteCampaign(...a) };
  return { api: client, default: client };
});

const blockers: DeletionBlocker[] = [
  { id: 'shared', name: 'Friday Game', members: [{ userId: 'bob', displayName: 'Bob', role: 'PLAYER' }, { userId: 'cy', displayName: 'Cy', role: 'SPECTATOR' }] },
  { id: 'solo', name: 'Solo Prep', members: [] },
];

beforeEach(() => {
  transferDM.mockReset().mockResolvedValue({ message: 'ok', memberships: [] });
  deleteCampaign.mockReset().mockResolvedValue({ message: 'ok' });
});

describe('DeletionBlockers', () => {
  it('hands a campaign to the member the admin picks', async () => {
    const onCleared = vi.fn();
    render(<DeletionBlockers campaigns={blockers} onCleared={onCleared} onError={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('New DM for Friday Game'), { target: { value: 'cy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make DM' }));
    await waitFor(() => expect(transferDM).toHaveBeenCalledWith('shared', 'cy'));
    expect(onCleared).toHaveBeenCalledWith('shared');
  });

  it('offers only deletion for a campaign with no one else in it, and asks first', async () => {
    const onCleared = vi.fn();
    render(<DeletionBlockers campaigns={blockers} onCleared={onCleared} onError={vi.fn()} />);
    expect(screen.getByText(/no other members/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete campaign' })[1]);
    expect(deleteCampaign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Solo Prep for good' }));
    await waitFor(() => expect(deleteCampaign).toHaveBeenCalledWith('solo'));
    expect(onCleared).toHaveBeenCalledWith('solo');
  });

  it('reports a refusal and leaves the campaign listed', async () => {
    transferDM.mockRejectedValue({ response: { status: 400, data: { message: 'Not a member' } } });
    const onCleared = vi.fn();
    const onError = vi.fn();
    render(<DeletionBlockers campaigns={blockers} onCleared={onCleared} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make DM' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Not a member'));
    expect(onCleared).not.toHaveBeenCalled();
  });
});

describe('apiDeletionBlockers', () => {
  it('reads the campaigns from a refused deletion, and nothing from anything else', () => {
    const err = { response: { status: 409, data: { message: 'x', campaigns: blockers } } };
    expect(apiDeletionBlockers(err)).toEqual(blockers);
    expect(apiDeletionBlockers({ response: { status: 409, data: { message: 'x' } } })).toBeUndefined();
    expect(apiDeletionBlockers({ response: { status: 409, data: { campaigns: [{ id: 1 }] } } })).toEqual([]);
    expect(apiDeletionBlockers(new Error('network'))).toBeUndefined();
  });
});
