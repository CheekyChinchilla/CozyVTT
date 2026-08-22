// ============================================
// Party Roster Component
// Displays campaign members and their characters
// ============================================

import { useCampaign } from '@/contexts/CampaignContext';
import { Users, Crown, Gamepad2, Eye } from 'lucide-react';
import type { CampaignRole } from '@/types';

export default function PartyRoster() {
  const { campaign } = useCampaign();

  // Get role icon
  const getRoleIcon = (role: CampaignRole) => {
    switch (role) {
      case 'DM':
        return Crown;
      case 'PLAYER':
        return Gamepad2;
      case 'SPECTATOR':
        return Eye;
      default:
        return Users;
    }
  };

  return (
    <div className="glass-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-moss-green/20">
        <Users className="w-5 h-5 text-brand-ink" />
        <h3 className="text-lg font-semibold text-brand-ink">Party Roster</h3>
      </div>

      {/* Members List */}
      {campaign?.memberships && campaign.memberships.length > 0 ? (
        <div className="space-y-2">
          {campaign.memberships.map((membership) => {
            const RoleIcon = getRoleIcon(membership.role);
            return (
              <div
                key={membership.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-parchment/50 hover:bg-parchment transition-colors"
              >
                <div
                  className={`p-1.5 rounded-full ${
                    membership.role === 'DM'
                      ? 'bg-moss-green/20'
                      : 'bg-spirit-purple/20'
                  }`}
                >
                  <RoleIcon
                    className={`w-4 h-4 ${
                      membership.role === 'DM'
                        ? 'text-brand-ink'
                        : 'text-spirit-purple'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-gray truncate">
                    {membership.user?.displayName || 'Unknown'}
                  </p>
                  <p className="text-xs text-warm-gray">{membership.role}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-warm-gray">No members yet</p>
        </div>
      )}
    </div>
  );
}
