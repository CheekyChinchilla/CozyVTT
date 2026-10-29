// ============================================
// Session status: what the campaign page's header says of the session
//
// Both arrangements' headers name the session's state the same way, and
// both show players the same banner while it is paused, so neither writes
// them out.
// ============================================

import { PauseCircle } from 'lucide-react';
import { CampaignStatus } from '@/types';

/** The header's word for each state of a session it shows one for. */
export const SESSION_STATUS_LABELS: Partial<Record<CampaignStatus, string>> = {
  [CampaignStatus.ACTIVE]: 'Live',
  [CampaignStatus.PAUSED]: 'Paused',
  [CampaignStatus.INACTIVE]: 'Inactive',
};

/** Under the header while the session is paused, for players: what a pause stops. */
export function SessionPausedBanner() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-2 bg-warm-amber/10 border-b border-warm-amber/20">
      <PauseCircle className="w-4 h-4 text-accent-ink shrink-0" />
      <p className="text-xs font-medium text-accent-ink">
        Session is paused. Token movement is disabled, and rolls from the Dice tab stay on your own screen.
      </p>
    </div>
  );
}
