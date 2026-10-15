import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import socketClient from '@/services/socket';
import { useToast } from '@/contexts/ToastContext';
import { handleUnauthorized, hasUnsavedWork } from '@/services/unsavedWork';
import { rememberSignInNotice } from '@/services/signInNotice';
import { loadPage } from '@/services/pageLoad';
import { signInPath } from '@/utils/returnTo';
import type { AccessRevoked } from '@/types';

/** How long the notice of a removal or a deletion stays up. */
const NOTICE_MS = 10_000;

/**
 * What the campaign page does when the server says its connection may no
 * longer use the campaign (`campaign.access.revoked`).
 *
 * Removed from the campaign, or the campaign deleted: say so and go to the
 * dashboard. An ended sign-in: go to the sign-in page, which shows the
 * reason, and back to this page after. Either way an editor holding unsaved
 * changes keeps the page where it is (services/unsavedWork): the removal is
 * said and the changes can still be saved, and a lost sign-in is shown in
 * the editor, as any other lost sign-in is.
 */
export function useAccessRevoked(): void {
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    const onRevoked = (revoked: AccessRevoked) => {
      if (revoked.reason === 'signed-out') {
        handleUnauthorized(window.location.pathname, () => {
          rememberSignInNotice(revoked.message);
          loadPage(signInPath(`${window.location.pathname}${window.location.search}`));
        });
        return;
      }
      if (hasUnsavedWork()) {
        showToast(`${revoked.message} Your unsaved changes are still open: save them before you leave this page.`, 'warning', NOTICE_MS);
        return;
      }
      showToast(revoked.message, 'warning', NOTICE_MS);
      navigate('/dashboard', { replace: true });
    };
    socketClient.on('campaign.access.revoked', onRevoked);
    return () => socketClient.off('campaign.access.revoked', onRevoked);
  }, [navigate, showToast]);
}
