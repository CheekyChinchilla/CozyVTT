/**
 * The vibe tracker's period buttons are only offered while the tracker is
 * on. With it off but periods configured, the DM used to see the buttons
 * anyway, and clicking one only produced a refused request; the panel now
 * says the tracker is off and how to turn it on. The server treats missing
 * `enabled` as on, so the buttons stay for settings saved before the flag
 * existed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Campaign, CampaignRole } from '@/types';

const mockState: {
  campaign: Partial<Campaign>;
  userRole: CampaignRole;
  currentVibe: string | null;
} = {
  campaign: {},
  userRole: 'DM' as CampaignRole,
  currentVibe: null,
};

vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({
    campaign: mockState.campaign,
    userRole: mockState.userRole,
    currentVibe: mockState.currentVibe,
  }),
}));

vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { emitVibeUpdate: vi.fn() } }),
}));

import VibeTracker from '../VibeTracker';

const day = { name: 'Day', hue: '#FF9966', filter: 'none' };

describe('VibeTracker while the tracker is off', () => {
  beforeEach(() => {
    mockState.campaign = { id: 'c1', vibeSettings: { enabled: false, periods: [day] } };
    mockState.userRole = 'DM' as CampaignRole;
    mockState.currentVibe = null;
  });

  it('offers no period buttons and tells the DM how to turn it on', () => {
    render(<VibeTracker />);
    expect(screen.queryByTitle('Set vibe to Day')).toBeNull();
    expect(screen.getByText(/vibe tracker is off/i)).toBeTruthy();
  });

  it('says nothing extra to a player', () => {
    mockState.userRole = 'PLAYER' as CampaignRole;
    render(<VibeTracker />);
    expect(screen.queryByTitle('Set vibe to Day')).toBeNull();
    expect(screen.queryByText(/vibe tracker is off/i)).toBeNull();
  });

  it('offers the buttons when the tracker is on', () => {
    mockState.campaign = { id: 'c1', vibeSettings: { enabled: true, periods: [day] } };
    render(<VibeTracker />);
    expect(screen.getByTitle('Set vibe to Day')).toBeTruthy();
  });

  it('treats settings without the flag as on, like the server', () => {
    mockState.campaign = { id: 'c1', vibeSettings: { periods: [day] } };
    render(<VibeTracker />);
    expect(screen.getByTitle('Set vibe to Day')).toBeTruthy();
  });
});
