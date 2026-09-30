/**
 * The period editor's Restore Defaults, Cancel and Save Periods buttons must
 * stay on screen while the period list scrolls. They used to sit below the
 * list inside one scrolling body, so on an ordinary window they were off the
 * bottom with nothing saying the dialog scrolls, and a DM reported the editor
 * had no save button at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Campaign } from '@/types';

const mockState: { campaign: Partial<Campaign> } = { campaign: {} };
const updateVibeSettings = vi.fn();

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: mockState.campaign,
    updateVibeSettings,
  }),
}));

vi.mock('@/services/api', () => ({
  default: { updateVibeSettings: vi.fn() },
  api: { updateVibeSettings: vi.fn() },
}));

import ConfigureVibeModal from '../ConfigureVibeModal';

const day = { name: 'Day', hue: '#FF9966', filter: 'none', audio: null };

describe('ConfigureVibeModal layout', () => {
  beforeEach(() => {
    mockState.campaign = { id: 'c1', vibeSettings: { enabled: false, periods: [day] } };
    vi.clearAllMocks();
  });

  it('keeps the footer buttons outside the scrolling period list', () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const scrollRegions = ['Save Periods', 'Cancel', 'Restore Defaults'].map(
      (label) => screen.getByRole('button', { name: label }).closest('.overflow-y-auto'),
    );
    expect(scrollRegions).toEqual([null, null, null]);
  });

  it('puts the period cards inside a scrollable region', () => {
    render(<ConfigureVibeModal onClose={vi.fn()} />);
    const nameInput = screen.getByDisplayValue('Day');
    expect(nameInput.closest('.overflow-y-auto')).not.toBeNull();
  });
});
