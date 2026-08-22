// ============================================
// Protected Route Component
// Wrapper for routes that require authentication
// Supports role-based access control (RBAC)
// ============================================

import { Navigate } from 'react-router-dom';
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
  const { user, loading, authenticated, mustChangePassword } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="glass-panel p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-moss-green mx-auto mb-4"></div>
          <p className="text-moss-green">Loading...</p>
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
          <h1 className="text-2xl font-bold text-moss-green font-heading">
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
  return <>{children}</>;
}
