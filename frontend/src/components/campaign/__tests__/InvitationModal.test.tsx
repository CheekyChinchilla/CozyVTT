/**
 * Which characters the invitation offers to bring along.
 *
 * The same rule the server applies when the invitation is accepted, and when
 * a character is assigned from the Characters page: a character joins only a
 * campaign of its own game system, and a Flexible character only a Flexible
 * campaign. The dialog offered Flexible characters to every campaign and
 * every character to a Flexible one, which the server now refuses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InvitationModal from '../InvitationModal';
import { CampaignStatus, GameSystem, InvitationStatus, type CampaignInvitation, type Character } from '@/types';

vi.mock('@/services/api', () => {
  const client = { listCharacters: vi.fn(), acceptInvitation: vi.fn(), declineInvitation: vi.fn() };
  return { api: client, default: client };
});
import { api } from '@/services/api';
const listCharacters = api.listCharacters as ReturnType<typeof vi.fn>;

const character = (name: string, gameSystem: GameSystem | null, campaignId: string | null = null) =>
  ({ id: `c-${name}`, name, gameSystem, campaignId, tokenImageUrl: null }) as unknown as Character;

const invitationTo = (gameSystem: GameSystem | null): CampaignInvitation => ({
  id: 'inv-1',
  campaignId: 'camp-1',
  userId: 'u1',
  status: InvitationStatus.PENDING,
  createdAt: '2026-09-28T00:00:00.000Z',
  expiresAt: null,
  campaign: { id: 'camp-1', name: 'The Table', description: null, gameSystem, status: CampaignStatus.ACTIVE },
});

const offered = async (gameSystem: GameSystem | null) => {
  render(<InvitationModal invitation={invitationTo(gameSystem)} onClose={vi.fn()} onAccept={vi.fn()} onDecline={vi.fn()} />);
  await screen.findByText('Select Characters (Optional)');
  await vi.waitFor(() => expect(screen.queryByText('Loading characters...')).toBeNull());
  return ['Dwarf', 'Wanderer', 'Oracle', 'Taken'].filter((name) => screen.queryByText(name) !== null);
};

beforeEach(() => {
  vi.clearAllMocks();
  listCharacters.mockResolvedValue({
    characters: [
      character('Dwarf', GameSystem.DND_5E),
      character('Wanderer', null),
      character('Oracle', GameSystem.PATHFINDER_2E),
      character('Taken', GameSystem.DND_5E, 'elsewhere'),
    ],
  });
});

describe('InvitationModal', () => {
  it('offers a D&D 5e campaign only unassigned D&D 5e characters', async () => {
    expect(await offered(GameSystem.DND_5E)).toEqual(['Dwarf']);
  });

  it('offers a Flexible campaign only unassigned Flexible characters', async () => {
    expect(await offered(null)).toEqual(['Wanderer']);
  });
});
