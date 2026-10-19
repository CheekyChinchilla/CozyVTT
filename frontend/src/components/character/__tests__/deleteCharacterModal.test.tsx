/**
 * Delete Character on a character in a campaign being played.
 *
 * The server lets an owner delete a character in an active or paused
 * campaign, and the guides say so, but the dialog refused it. It now deletes
 * it, after a warning that names the campaign.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeleteCharacterModal from '../DeleteCharacterModal';
import type { Campaign, CharacterSummary } from '@/types';

const character = {
  id: 'char-1', userId: 'user-1', name: 'Aldra', gameSystem: 'DND_5E', campaignId: 'camp-1',
  tokenImageUrl: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as CharacterSummary;
const campaign = (status: string) => ({ id: 'camp-1', name: 'Dragons of the North', status }) as unknown as Campaign;

describe.each(['ACTIVE', 'PAUSED'])('Delete Character in a campaign that is %s', (status) => {
  it('warns, naming the campaign, and deletes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<DeleteCharacterModal isOpen character={character} campaign={campaign(status)} onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByText(/is in a campaign being played/)).toBeInTheDocument();
    expect(screen.getByText(/Deleting it takes it off/)).toHaveTextContent('Dragons of the North');
    expect(screen.queryByText(/Cannot Delete/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Delete Character/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('char-1'));
    expect(onClose).toHaveBeenCalled();
  });
});
