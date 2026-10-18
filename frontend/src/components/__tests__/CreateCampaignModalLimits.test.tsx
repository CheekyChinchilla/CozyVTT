/**
 * New Campaign takes the names and descriptions the server takes.
 *
 * It refused a name of more than 100 characters, or of one letter, and its
 * description box had no limit, while the server takes a name of 1 to 200
 * characters and a description of up to 5,000. Both dialogs now stop each
 * box at the server's limits, from one file both sides share.
 */

import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CAMPAIGN_LIMITS } from '@/constants/campaignLimits';

const createCampaign = vi.hoisted(() => vi.fn());
vi.mock('@/services/campaign.service', () => ({ default: { createCampaign } }));

import CreateCampaignModal from '../CreateCampaignModal';

beforeEach(() => {
  createCampaign.mockReset().mockResolvedValue({ id: 'c1', name: 'x' });
});

const open = () => render(<CreateCampaignModal isOpen onClose={() => {}} onSuccess={() => {}} />);

it('stops the name and description at the server\'s limits', () => {
  open();
  expect((screen.getByPlaceholderText('The Lost Mines of Phandelver') as HTMLInputElement).maxLength).toBe(CAMPAIGN_LIMITS.maxNameLength);
  expect((screen.getByPlaceholderText(/A classic D&D adventure/) as HTMLTextAreaElement).maxLength).toBe(CAMPAIGN_LIMITS.maxDescriptionLength);
});

it.each([
  ['a name of 150 characters', 'N'.repeat(150)],
  ['a one-letter name', 'Q'],
])('creates a campaign with %s', async (_label, name) => {
  open();
  fireEvent.change(screen.getByPlaceholderText('The Lost Mines of Phandelver'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /Create Campaign/ }));
  await waitFor(() => expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ name })));
});
