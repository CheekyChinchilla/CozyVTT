/**
 * The upload dialog offers Campaign scope only where the server accepts it.
 *
 * Token art may go into a campaign its uploader runs or plays in; a
 * spectator puts nothing in. The dialog offered token art into every
 * campaign the user belonged to, spectator memberships included, and the
 * upload was then refused.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssetUploadModal from '../AssetUploadModal';
import { AssetType } from '@/types';
import type { Campaign } from '@/types';

let campaigns: Campaign[] = [];
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', platformRole: 'USER' } }) }));
vi.mock('@/hooks/queries', () => ({ useServerConfigQuery: () => ({ data: undefined }) }));
vi.mock('@/services/campaign.service', () => ({ default: { getCampaigns: () => Promise.resolve(campaigns) } }));

const campaign = (id: string, userRole: 'DM' | 'PLAYER' | 'SPECTATOR') =>
  ({ id, name: `Campaign ${id}`, ownerId: 'someone-else', userRole, memberships: [] }) as unknown as Campaign;

function open() {
  render(<AssetUploadModal isOpen onClose={() => undefined} onSuccess={() => undefined} defaultType={AssetType.TOKEN} />);
}

describe('uploading token art', () => {
  beforeEach(() => { campaigns = []; });

  it('offers no Campaign scope to someone who only watches campaigns', async () => {
    campaigns = [campaign('watched', 'SPECTATOR')];
    open();
    expect(await screen.findByText('Personal')).toBeInTheDocument();
    // Let the campaign list arrive before deciding the button is absent.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Campaign')).not.toBeInTheDocument();
  });

  it('offers Campaign scope in a campaign the user plays in', async () => {
    campaigns = [campaign('played', 'PLAYER'), campaign('watched', 'SPECTATOR')];
    open();
    expect(await screen.findByText('Campaign')).toBeInTheDocument();
  });
});
