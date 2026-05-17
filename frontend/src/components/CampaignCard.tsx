// ============================================
// Campaign Card Component
// Displays campaign info with glassmorphism style
// Bento-box aesthetic with hover effects
// ============================================

import { useNavigate } from 'react-router-dom';
import type { Campaign, CampaignRole, CampaignStatus } from '@/types';
import { Users, Calendar, Crown, Eye, Gamepad2 } from 'lucide-react';
import GameSystemBadge from './common/GameSystemBadge';

interface CampaignCardProps {
  campaign: Campaign;
  userRole: CampaignRole;
}

export default function CampaignCard({ campaign, userRole }: CampaignCardProps) {
  const navigate = useNavigate();

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
  }

  // Get role badge styling
  const getRoleBadge = (role: CampaignRole) => {
    const badges = {
      DM: {
        label: 'DM',
        icon: Crown,
        class: 'bg-moss-green/20 text-moss-green border-moss-green/40',
      },
      PLAYER: {
        label: 'Player',
        icon: Gamepad2,
        class: 'bg-spirit-purple/20 text-spirit-purple border-spirit-purple/40',
      },
      SPECTATOR: {
        label: 'Spectator',
        icon: Eye,
        class: 'bg-warm-amber/20 text-warm-amber border-warm-amber/40',
      },
    };

    return badges[role] || badges.PLAYER;
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const statusBadge = getStatusBadge(campaign.status);
  const roleBadge = getRoleBadge(userRole);
  const RoleIcon = roleBadge.icon;

  // Get member count
  const memberCount = campaign.memberships?.length || 0;

  // Get owner display name
  const ownerName = campaign.memberships?.find(m => m.userId === campaign.ownerId)?.user?.displayName || 'Unknown';

  return (
    <button
      onClick={() => navigate(`/campaigns/${campaign.id}`)}
      className="group relative glass-panel p-6 text-left transition-all duration-300
                 hover:scale-105 hover:shadow-xl hover:shadow-moss-green/20
                 focus:outline-none focus:ring-2 focus:ring-moss-green/50 focus:scale-105
                 active:scale-100"
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Role Badge (Top Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1
                      rounded-full border text-xs font-medium"
           style={{ transform: 'translateZ(10px)' }}>
        <RoleIcon className="w-3.5 h-3.5" />
        <span className={roleBadge.class}>{roleBadge.label}</span>
      </div>

      {/* Campaign Name */}
      <h3 className="text-xl font-semibold text-moss-green mb-2 pr-20
                     group-hover:text-spirit-purple transition-colors">
        {campaign.name}
      </h3>

      {/* Description */}
      {campaign.description && (
        <p className="text-sm text-warm-gray mb-4 line-clamp-2">
          {campaign.description}
        </p>
      )}

      {/* Status and Game System Badges */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className={`inline-block px-2.5 py-1 rounded-full border text-xs font-medium ${statusBadge.class}`}>
          {statusBadge.label}
        </span>
        <GameSystemBadge gameSystem={campaign.gameSystem} size="md" />
      </div>

      {/* Info Grid */}
      <div className="space-y-2 text-sm">
        {/* DM Name */}
        <div className="flex items-center gap-2 text-stone-gray">
          <Crown className="w-4 h-4 text-moss-green" />
          <span className="text-warm-gray">DM:</span>
          <span className="text-stone-gray font-medium">{ownerName}</span>
        </div>

        {/* Member Count */}
        <div className="flex items-center gap-2 text-stone-gray">
          <Users className="w-4 h-4 text-spirit-purple" />
          <span className="text-warm-gray">Members:</span>
          <span className="text-stone-gray font-medium">{memberCount}</span>
        </div>

        {/* Last Played */}
        <div className="flex items-center gap-2 text-stone-gray">
          <Calendar className="w-4 h-4 text-warm-amber" />
          <span className="text-warm-gray">Last played:</span>
          <span className="text-stone-gray font-medium">{formatDate(campaign.lastPlayedAt)}</span>
        </div>
      </div>

      {/* Hover Overlay Effect */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-moss-green/5 to-spirit-purple/5
                      opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
           style={{ transform: 'translateZ(-1px)' }} />
    </button>
  );
}
