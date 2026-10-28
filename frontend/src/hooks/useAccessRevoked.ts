import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import socketClient from '@/services/socket';
import { useToast } from '@/contexts/ToastContext';
import { handleUnauthorized, hasUnsavedWork } from '@/services/unsavedWork';
import { rememberSignInNotice } from '@/services/signInNotice';
import { loadPage } from '@/services/pageLoad';
import { signInPath } from '@/utils/returnTo';
import { refreshAfterLeavingCampaign } from '@/hooks/queries';
import type { AccessRevoked } from '@/types';

/** How long the notice of a removal, a leave or a deletion stays up. */
const NOTICE_MS = 10_000;

/**
 * What the campaign page does when the server says its connection may no
 * longer use the campaign (`campaign.access.revoked`).
 *
 * Removed from the campaign, left it, or the campaign deleted: say so and go
 * to the dashboard. An ended sign-in: go to the sign-in page, which shows the
 * reason, and back to this page after. Either way an editor holding unsaved
 * changes keeps the page where it is (services/unsavedWork): the removal is
 * said and the changes can still be saved, and a lost sign-in is shown in
 * the editor, as any other lost sign-in is.
 *
 * Returns the same handler, for the page's own Leave Campaign: the tab that
 * leaves is told by the server's answer and by its socket, in either order,
 * and a notice the page has acted on is not acted on again, so it is said
 * once.
 */
export function useAccessRevoked(): (revoked: AccessRevoked) => void {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const actedOn = useRef<string | null>(null);

  const onRevoked = useCallback((revoked: AccessRevoked) => {
    if (revoked.reason === 'signed-out') {
      handleUnauthorized(window.location.pathname, () => {
        rememberSignInNotice(revoked.message);
        loadPage(signInPath(`${window.location.pathname}${window.location.search}`));
      });
      return;
    }
    const notice = `${revoked.campaignId ?? ''}|${revoked.reason}`;
    if (actedOn.current === notice) return;
    actedOn.current = notice;
    if (revoked.reason === 'left') refreshAfterLeavingCampaign(queryClient);
    if (hasUnsavedWork()) {
      showToast(`${revoked.message} Your unsaved changes are still open: save them before you leave this page.`, 'warning', NOTICE_MS);
      return;
    }
    showToast(revoked.message, revoked.reason === 'left' ? 'success' : 'warning', NOTICE_MS);
    navigate('/dashboard', { replace: true });
  }, [navigate, showToast, queryClient]);

  useEffect(() => {
    socketClient.on('campaign.access.revoked', onRevoked);
    return () => socketClient.off('campaign.access.revoked', onRevoked);
  }, [onRevoked]);

  return onRevoked;
}
