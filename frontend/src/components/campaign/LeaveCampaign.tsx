// ============================================
// Leave Campaign
// A player's or a spectator's way out of the campaign, asked first, in the
// Campaign Info panel. The DM and the owner, whom the server refuses, are
// shown how to get out instead.
// ============================================

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { isCampaignOwner } from '@/utils/campaignRoles';
import ConfirmDialog from '../common/ConfirmDialog';
import { CampaignRole } from '@/types';
import type { AccessRevoked, Campaign } from '@/types';

interface LeaveCampaignProps {
  campaign: Pick<Campaign, 'id' | 'name' | 'ownerId'>;
  userRole: CampaignRole;
  /**
   * Told once the server has taken the member out, with the notice their
   * socket is sent too (useAccessRevoked says it once, whichever comes first).
   */
  onLeft: (revoked: AccessRevoked) => void;
}

const hint = 'text-xs text-warm-gray';

export default function LeaveCampaign({ campaign, userRole, onLeft }: LeaveCampaignProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [left, setLeft] = useState(false);

  // In the order the server refuses them: an owner in the DM seat is told
  // about owning it, since handing the seat over would not let them leave.
  if (isCampaignOwner(campaign, user?.id)) {
    return (
      <p className={hint}>
        You own this campaign, so you cannot leave it. If you no longer want it, delete it from{' '}
        <strong>{userRole === CampaignRole.DM ? 'Campaign Settings' : 'Owner Settings'}</strong>, on the{' '}
        <strong>Danger Zone</strong> tab.
      </p>
    );
  }
  if (userRole === CampaignRole.DM) {
    return (
      <p className={hint}>
        To leave, hand the DM seat to another member first: in <strong>Campaign Settings</strong>, on the{' '}
        <strong>Members</strong> tab, click the crown beside them.
      </p>
    );
  }
  if (left) return null;

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const { message } = await api.leaveCampaign(campaign.id);
      setLeft(true);
      setAsking(false);
      onLeft({ campaignId: campaign.id, reason: 'left', message });
    } catch (err) {
      setAsking(false);
      showToast(apiErrorMessage(err) ?? 'Failed to leave the campaign', 'error');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="touch-target flex items-center gap-2 px-3 py-2 w-full rounded-lg border border-danger/20 text-danger-ink hover:bg-danger/10 transition-colors text-sm font-medium"
      >
        <LogOut className="w-4 h-4" aria-hidden="true" />
        Leave Campaign
      </button>
      <ConfirmDialog
        isOpen={asking}
        title={`Leave ${campaign.name}?`}
        message={
          'You stop seeing and playing in this campaign straight away. Your characters in it go back to My Characters, '
          + 'and your personal notes and saved rolls stay on your dashboard, under Notes From Campaigns You Have Left. '
          + 'Your tokens stay on the map for the DM. To come back, the DM has to invite you again.'
        }
        confirmLabel="Leave Campaign"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={leaving}
        onConfirm={() => void handleLeave()}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
