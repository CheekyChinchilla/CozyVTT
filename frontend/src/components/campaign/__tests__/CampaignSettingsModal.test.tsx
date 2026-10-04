/**
 * The settings form keeps what the DM is typing when the campaign is
 * refreshed in the background.
 *
 * The page now fetches the campaign again when someone joins or leaves and
 * after a reconnect, which hands the dialog a new campaign object. The form
 * re-seeded itself from the saved values on every such object, so a
 * description being typed went back to the saved one and the dialog jumped
 * to its first tab.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Campaign } from '@/types';

let current: Campaign;
vi.mock('@/contexts/CampaignContext', () => ({ useCampaign: () => ({ campaign: current, refreshCampaign: vi.fn(), userRole: 'DM' }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'dm', platformRole: 'USER' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import CampaignSettingsModal from '../CampaignSettingsModal';

const campaign = (): Campaign => ({
  id: 'c1', name: 'The Keep', description: 'Saved words', chatCooldownEnabled: false, chatCooldownSeconds: 0,
  memberships: [], userRole: 'DM', ownerId: 'dm',
}) as unknown as Campaign;

describe('CampaignSettingsModal', () => {
  it('keeps an unsaved description when the campaign is fetched again', () => {
    current = campaign();
    const { rerender } = render(<CampaignSettingsModal isOpen onClose={() => undefined} />);
    const field = screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Half-written notes' } });

    // A roster change elsewhere: the same campaign, fetched again.
    current = campaign();
    rerender(<CampaignSettingsModal isOpen onClose={() => undefined} />);

    expect((screen.getByPlaceholderText('Describe your campaign…') as HTMLTextAreaElement).value).toBe('Half-written notes');
  });
});
