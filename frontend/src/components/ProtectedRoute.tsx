// ============================================
// Protected Route Component
// Wrapper for routes that require authentication
// Supports role-based access control (RBAC)
// ============================================

import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PlatformRole } from '@/types/user.types';
import Button from '@/components/ui/Button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireRole?: PlatformRole;
}

export default function ProtectedRoute({
  children,
  requireRole,
}: ProtectedRouteProps) {
  const {
    user,
    loading,
    authenticated,
    mustChangePassword,
    serverUnreachable,
    retryAuthCheck,
    backupCodesLeft,
    dismissBackupCodesLeft,
  } = useAuth();

  // The sign-in check got no answer: a restart or an upgrade under way. The
  // sign-in may well be fine, so wait for the server instead of sending the
  // user to sign in again.
  if (loading && serverUnreachable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
        <div role="alert" className="glass-panel max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-brand-ink font-heading">Can't reach the server</h1>
          <p className="text-stone-gray">
            CozyVTT is not answering at the moment, perhaps because it is restarting. This page tries again by
            itself, or you can try now.
          </p>
          <Button onClick={retryAuthCheck} className="w-full">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="glass-panel p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-moss-green mx-auto mb-4"></div>
          <p className="text-brand-ink">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!authenticated || !user) {
    return <Navigate to="/auth/login" replace />;
  }

  // Account still has to replace an admin-issued password. The server rejects
  // every other API call until it does, so send them somewhere that works.
  if (mustChangePassword) {
    return <Navigate to="/auth/change-password" replace />;
  }

  // Check role-based access if required
  if (requireRole && user.platformRole !== requireRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 px-4">
        <div className="glass-panel max-w-md w-full p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-spirit-red/10 rounded-full p-4">
              <svg
                className="w-12 h-12 text-spirit-red"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-brand-ink font-heading">
            Access Denied
          </h1>
          <p className="text-stone-gray">
            You don't have permission to access this page.
          </p>
          <p className="text-sm text-warm-gray">
            Required role: <span className="font-medium">{requireRole}</span>
            <br />
            Your role: <span className="font-medium">{user.platformRole}</span>
          </p>
          <Button
            onClick={() => window.history.back()}
            variant="secondary" className="w-full"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // User is authenticated and has required role
  return (
    <>
      {user.adminMfaDeadline && <AdminMfaBanner deadline={user.adminMfaDeadline} />}
      {typeof backupCodesLeft === 'number' && <BackupCodesLeftBanner left={backupCodesLeft} onDismiss={dismissBackupCodesLeft} />}
      {children}
    </>
  );
}

/**
 * Administrator accounts must use two-factor authentication. Until the
 * deadline the server gives, every signed-in page carries this; after it the
 * server refuses everything but enrolment and the API client sends the
 * administrator to the setup page.
 */
function AdminMfaBanner({ deadline }: { deadline: string }) {
  const when = new Date(deadline);
  const date = Number.isNaN(when.getTime()) ? deadline : when.toLocaleDateString();
  return (
    <div role="status" className="bg-warning/15 border-b border-warning/40 text-warning-ink text-sm px-4 py-2 text-center">
      Administrator accounts must use two-factor authentication. Yours has none; set it up by {date} or you will be asked to before you can continue.{' '}
      <Link to="/auth/mfa-setup" className="font-semibold underline">Set it up now</Link>
    </div>
  );
}

/**
 * After a sign-in with a backup code: how many are left, and where new ones
 * are made once they run low. A spent code cannot be used again, and the
 * last one gone leaves only the authenticator app.
 */
function BackupCodesLeftBanner({ left, onDismiss }: { left: number; onDismiss: () => void }) {
  const profileLink = <Link to="/profile" className="font-semibold underline">Profile page</Link>;
  const low = left <= 3;
  let text: React.ReactNode;
  if (left === 0) {
    text = <>You signed in with your last backup code: make new ones from Backup Codes on your {profileLink}.</>;
  } else if (low) {
    const codes = left === 1 ? '1 backup code is' : `${left} backup codes are`;
    text = <>You signed in with a backup code. Only {codes} left: make new ones from Backup Codes on your {profileLink}.</>;
  } else {
    text = <>You signed in with a backup code. {left} backup codes are left.</>;
  }
  return (
    <div
      role="status"
      className={`${low ? 'bg-warning/15 border-warning/40 text-warning-ink' : 'bg-moss-green/10 border-moss-green/30 text-brand-ink'} border-b text-sm px-4 py-2 flex items-center justify-center gap-3`}
    >
      <span>{text}</span>
      <button type="button" onClick={onDismiss} className="underline text-xs">
        Dismiss
      </button>
    </div>
  );
}
