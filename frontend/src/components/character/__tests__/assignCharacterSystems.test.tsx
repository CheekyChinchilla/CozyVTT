/**
 * Which campaigns Assign to Campaign offers a character: those the server
 * lets it join, a character with a system only a campaign with the same one,
 * a Flexible character only a campaign with none. A campaign stored with a
 * system this build does not have, such as the value of one CozyVTT no
 * longer supports, takes characters as one with none.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssignCharacterModal from '../AssignCharacterModal';
import type { CharacterSummary, GameSystem } from '@/types';

const listCampaigns = vi.fn();
vi.mock('@/services/api', () => {
  const api = { listCampaigns: () => listCampaigns() };
  return { default: api, api };
});

const flexible: CharacterSummary = {
  id: 'char-1', userId: 'user-1', campaignId: null, gameSystem: null, name: 'Wanderer', tokenImageUrl: null,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

beforeEach(() => {
  listCampaigns.mockReset().mockResolvedValue({
    campaigns: [
      { id: 'camp-typed', name: 'Typed Table', gameSystem: 'FIFTH_EDITION' },
      { id: 'camp-none', name: 'Open Table', gameSystem: null },
      { id: 'camp-old', name: 'Old Table', gameSystem: 'SOMETHING_ELSE' as GameSystem },
    ],
  });
});

it('offers a Flexible character a campaign of a system this build does not have, as one with none', async () => {
  render(<AssignCharacterModal isOpen character={flexible} onClose={vi.fn()} onConfirm={vi.fn()} />);

  expect(await screen.findByText('Open Table')).toBeTruthy();
  expect(screen.getByText('Old Table')).toBeTruthy();
  expect(screen.queryByText('Typed Table')).toBeNull();
});
