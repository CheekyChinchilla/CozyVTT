// ============================================
// CompactHeader: the compact layout's header
//
// One row: a way back to the dashboard, the campaign's name as the page's
// heading, and the session's state (Live, Paused or Inactive). The
// connection's state shows only while it is not connected, when it matters.
// Everything else the desktop's header holds is under the bar's More.
//
// On a phone turned on its side the bar's buttons sit at the end of this
// row (`bar`), the name is held to 200 px and the session's state is a dot
// with its name for a screen reader.
// ============================================

import type { ReactNode, Ref } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, PauseCircle } from 'lucide-react';
import ConnectionStatus from '@/components/ConnectionStatus';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { SESSION_STATUS_LABELS } from '@/components/campaign/sessionStatus';
import { CampaignStatus } from '@/types';
import type { Campaign } from '@/types';
import { cn } from '@/utils/cn';
import { onSheetEntry } from './sheetHistory';

export interface CompactHeaderProps {
  campaign: Campaign;
  /** The bar's buttons, on a screen too short for a bar of their own. */
  bar?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/** The session's state, as a chip, or a dot beside the bar's buttons. */
function SessionState({ status, small }: { status: Campaign['status']; small: boolean }) {
  const label = SESSION_STATUS_LABELS[status];
  if (!label) return null;
  const looks =
    status === CampaignStatus.ACTIVE
      ? { chip: 'bg-success/10 text-success-ink', dot: 'bg-success' }
      : status === CampaignStatus.PAUSED
        ? { chip: 'bg-warm-amber/10 text-accent-ink', dot: 'bg-warm-amber' }
        : { chip: 'bg-stone-gray/10 text-stone-gray', dot: 'bg-stone-gray/50' };
  if (small) {
    return (
      <span role="img" aria-label={label} title={label} className={cn('mx-1 size-2 shrink-0 rounded-full', looks.dot)} />
    );
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', looks.chip)}>
      {status === CampaignStatus.PAUSED ? (
        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" className={cn('size-2 rounded-full', looks.dot)} />
      )}
      {label}
    </span>
  );
}

export default function CompactHeader({ campaign, bar, ref }: CompactHeaderProps) {
  const navigate = useNavigate();
  const { status } = useWebSocket();

  return (
    <header
      ref={ref}
      className={cn(
        'flex h-13 shrink-0 items-center gap-2 border-b border-moss-green/20 bg-moss-green/10 md:h-14',
        bar ? 'pr-3 pl-[max(0.5rem,env(safe-area-inset-left))]' : 'px-2 md:px-3'
      )}
    >
      <button
        type="button"
        // In place of an open sheet's history entry, so Back from the
        // dashboard comes straight back here (sheetHistory.ts).
        onClick={() => navigate('/dashboard', { replace: onSheetEntry() })}
        aria-label="Back to the dashboard"
        title="Dashboard"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-cozy text-ink transition-colors hover:bg-ink/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
      >
        <ChevronLeft className="h-5.5 w-5.5" aria-hidden="true" />
      </button>

      <h1
        className={cn(
          'min-w-0 truncate font-heading font-bold text-brand-ink',
          bar ? 'max-w-50 text-base' : 'flex-1 text-[17px] md:text-[19px]'
        )}
      >
        {campaign.name}
      </h1>

      {status !== 'connected' && <ConnectionStatus />}
      <SessionState status={campaign.status} small={bar !== undefined} />

      {bar && (
        <>
          <span className="flex-1" />
          {bar}
        </>
      )}
    </header>
  );
}
