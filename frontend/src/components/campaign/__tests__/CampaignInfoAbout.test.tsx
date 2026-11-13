/**
 * About CozyVTT opens from inside a campaign, where the sheets and creatures
 * whose credits it shows are used. It opened only from the dashboard, the
 * profile page and the sign-in page.
 */

import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignRole } from '@/types';
import { waitForDialogFocus } from '@/test/dialogFocus';

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: { id: 'c1', name: 'The Lantern Road', status: 'ACTIVE', memberships: [], createdAt: '2026-10-01T00:00:00.000Z' },
    userRole: CampaignRole.PLAYER,
  }),
}));
vi.mock('../LeaveCampaign', () => ({ default: () => null }));
vi.mock('../InvitePlayerModal', () => ({ default: () => null }));

import CampaignInfo from '../CampaignInfo';

it('opens About CozyVTT from Campaign Info, with the same quiet button as the other pages', async () => {
  render(<CampaignInfo onLeft={vi.fn()} />);
  const opener = screen.getByRole('button', { name: 'About CozyVTT' });
  expect(opener).toHaveClass('touch-target');

  await userEvent.click(opener);
  await waitForDialogFocus(screen.getByRole('dialog', { name: 'About CozyVTT' }));
});
