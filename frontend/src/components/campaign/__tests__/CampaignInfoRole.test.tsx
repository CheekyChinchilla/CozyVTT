/**
 * Campaign Info names your role as the Members tab does: Player and
 * Spectator. It printed the stored PLAYER and SPECTATOR.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampaignRole } from '@/types';

const context = vi.hoisted((): { userRole: CampaignRole | null } => ({ userRole: null }));

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', name: 'The Sunken Crown', status: 'ACTIVE', memberships: [], createdAt: '2026-10-01T00:00:00.000Z' },
    userRole: context.userRole,
  }),
}));
vi.mock('../LeaveCampaign', () => ({ default: () => null }));
vi.mock('../InvitePlayerModal', () => ({ default: () => null }));

import CampaignInfo from '../CampaignInfo';

it.each([
  [CampaignRole.DM, 'DM'],
  [CampaignRole.PLAYER, 'Player'],
  [CampaignRole.SPECTATOR, 'Spectator'],
])('names the role %s as %s', (role, label) => {
  context.userRole = role;
  render(<CampaignInfo onLeft={vi.fn()} />);
  const badge = screen.getByText('Your role:').nextElementSibling;
  expect(badge?.textContent).toBe(label);
});
