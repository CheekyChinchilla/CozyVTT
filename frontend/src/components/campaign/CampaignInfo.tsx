// ============================================
// Campaign Info Component
// Displays campaign name, description, status
// ============================================

import { useState } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { Info, Users, Crown, Calendar, UserPlus } from 'lucide-react';
import type { CampaignStatus } from '@/types';
import GameSystemBadge from '../common/GameSystemBadge';
import InvitePlayerModal from './InvitePlayerModal';

export default function CampaignInfo() {
  const { campaign, userRole } = useCampaign();
  const [showInviteModal, setShowInviteModal] = useState(false);

  if (!campaign) {
    return (
      <div className="glass-panel p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-warm-gray/20 rounded w-3/4" />
          <div className="h-4 bg-warm-gray/20 rounded w-full" />
          <div className="h-4 bg-warm-gray/20 rounded w-5/6" />
        </div>
      </div>
    );
  }

  // Get status badge styling
  const getStatusBadge = (status: CampaignStatus) => {
    const badges = {
      PREPARATION: {
        label: 'Preparation',
        class: 'bg-warm-amber/20 text-warm-amber border-warm-amber/30',
      },
      ACTIVE: {
        label: 'Active',
        class: 'bg-moss-green/20 text-moss-green border-moss-green/30',
      },
      PAUSED: {
        label: 'Paused',
        class: 'bg-stone-gray/20 text-stone-gray border-stone-gray/30',
      },
      COMPLETED: {
        label: 'Completed',
        class: 'bg-spirit-purple/20 text-spirit-purple border-spirit-purple/30',
      },
      ARCHIVED: {
        label: 'Archived',
        class: 'bg-warm-gray/20 text-warm-gray border-warm-gray/30',
      },
      INACTIVE: {
        label: 'Inactive',
        class: 'bg-warm-gray/20 text-warm-gray border-warm-gray/30',
      },
    };

    return badges[status] || badges.PREPARATION;
  };

  const statusBadge = getStatusBadge(campaign.status);
  const memberCount = campaign.memberships?.length || 0;
  const ownerName =
    campaign.memberships?.find((m) => m.userId === campaign.ownerId)?.user
      ?.displayName || 'Unknown';

  return (
    <div className="glass-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-moss-green/20">
        <Info className="w-5 h-5 text-moss-green" />
        <h3 className="text-lg font-semibold text-moss-green">
          Campaign Info
        </h3>
      </div>

      {/* Campaign Name */}
      <div>
        <h2 className="text-xl font-bold text-moss-green mb-1">
          {campaign.name}
        </h2>
        {campaign.description && (
          <p className="text-sm text-warm-gray line-clamp-3">
            {campaign.description}
          </p>
        )}
      </div>

      {/* Status and Game System Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-block px-2.5 py-1 rounded-full border text-xs font-medium ${statusBadge.class}`}
        >
          {statusBadge.label}
        </span>
        <GameSystemBadge gameSystem={campaign.gameSystem} size="md" />
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-stone-gray">
          <Crown className="w-4 h-4 text-moss-green" />
          <span className="text-warm-gray">DM:</span>
          <span className="text-stone-gray font-medium">{ownerName}</span>
        </div>

        <div className="flex items-center gap-2 text-stone-gray">
          <Users className="w-4 h-4 text-spirit-purple" />
          <span className="text-warm-gray">Members:</span>
          <span className="text-stone-gray font-medium">{memberCount}</span>
        </div>

        {campaign.lastPlayedAt && (
          <div className="flex items-center gap-2 text-stone-gray">
            <Calendar className="w-4 h-4 text-warm-amber" />
            <span className="text-warm-gray">Last played:</span>
            <span className="text-stone-gray font-medium">
              {new Date(campaign.lastPlayedAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {/* DM Actions - Invite Player Button */}
      {userRole === 'DM' && (
        <div className="pt-2 border-t border-moss-green/20">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg bg-moss-green/10 text-moss-green hover:bg-moss-green/20 transition-colors text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Invite Player
          </button>
        </div>
      )}

      {/* User Role Badge */}
      {userRole && (
        <div className="pt-2 border-t border-moss-green/20">
          <span className="text-xs text-warm-gray">Your role:</span>
          <div
            className={`inline-block ml-2 px-2.5 py-1 rounded-full border text-xs font-medium ${
              userRole === 'DM'
                ? 'bg-moss-green/20 text-moss-green border-moss-green/40'
                : 'bg-spirit-purple/20 text-spirit-purple border-spirit-purple/40'
            }`}
          >
            {userRole}
          </div>
        </div>
      )}

      {/* Invite Player Modal */}
      {showInviteModal && campaign && (
        <InvitePlayerModal
          campaignId={campaign.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            // Refresh page to show updated member list
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
