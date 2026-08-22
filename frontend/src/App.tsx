import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import ThemeSyncBridge from '@/contexts/ThemeSyncBridge';
import { PlatformRole } from '@/types/user.types';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import ToastContainer from '@/components/common/ToastContainer';
import Button from '@/components/ui/Button';

// Lazy-loaded pages — each becomes its own JS chunk so the browser only downloads
// code for the page the user actually visits.
const LoginPage           = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage        = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage  = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage   = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const ChangePasswordPage  = lazy(() => import('@/pages/auth/ChangePasswordPage'));
const MFAVerifyPage       = lazy(() => import('@/pages/auth/MFAVerifyPage'));
const MFASetupPage     = lazy(() => import('@/pages/MFASetupPage'));
const SetupWizardPage  = lazy(() => import('@/pages/SetupWizardPage'));
const DashboardPage    = lazy(() => import('@/pages/DashboardPage'));
const CampaignPage     = lazy(() => import('@/pages/CampaignPage'));
const CharactersPage   = lazy(() => import('@/pages/CharactersPage'));
const CharacterEditorPage = lazy(() => import('@/pages/CharacterEditorPage'));
const AssetLibraryPage = lazy(() => import('@/pages/AssetLibraryPage'));
const ProfilePage      = lazy(() => import('@/pages/ProfilePage'));
const AdminPage        = lazy(() => import('@/pages/AdminPage'));

function MascotImage({ className = '' }: { className?: string }) {
  const { mascotUrl } = useTheme();
  return <img src={mascotUrl} alt="CozyVTT" className={`object-contain ${className}`} />;
}

/** Minimal full-screen spinner shown while a lazy page chunk loads. */
function PageLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20"
      aria-live="polite"
      aria-label="Loading page"
    >
      <Loader2 className="w-8 h-8 text-moss-green animate-spin" aria-hidden="true" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      {/* reducedMotion="user" makes every framer-motion animation (toasts, dice
          pops, modals, error slides) respect the OS "reduce motion" setting —
          transform/layout animations are suppressed, opacity/color kept. */}
      <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          {/* Sync per-user theme prefs with auth state */}
          <ThemeSyncBridge />
          {/* Skip to main content — WCAG 2.4.1 Bypass Blocks */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999]
                       focus:px-4 focus:py-2 focus:bg-moss-green focus:text-white focus:rounded-lg
                       focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-warm-amber"
          >
            Skip to main content
          </a>
          {/* Global toast notifications */}
          <ToastContainer />
          <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<WelcomePage />} />
          <Route path="/setup" element={<SetupWizardPage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<RegisterPage />} />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<ResetPasswordPage invite />} />
          <Route path="/auth/mfa-verify" element={<MFAVerifyPage />} />
          <Route path="/auth/mfa-setup" element={<MFASetupPage />} />
          {/* Signed in, but the account still has to replace an admin-issued
              password — the server rejects everything else until it does */}
          <Route path="/auth/change-password" element={<ChangePasswordPage />} />

          {/* Protected Routes - Require Authentication */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/campaigns/:id"
            element={
              <ProtectedRoute>
                <CampaignPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/characters"
            element={
              <ProtectedRoute>
                <CharactersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/characters/:id/edit"
            element={
              <ProtectedRoute>
                <CharacterEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <AssetLibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Admin-Only Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireRole={PlatformRole.ADMIN}>
                <AdminPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </div>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
      </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

function WelcomePage() {
  const { authenticated } = useAuth();
  const navigate = useNavigate();
  const [registrationAllowed, setRegistrationAllowed] = useState(false);
  // null = still checking. On a brand-new install (no admin account yet) the
  // root URL must send the visitor straight to the setup wizard instead of a
  // login prompt they can't use.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.checkSetupStatus()
      .then((data) => { if (!cancelled) setNeedsSetup(data.needsSetup); })
      // If the status check fails (backend unreachable), don't trap the visitor
      // on a spinner — fall through to the normal welcome screen.
      .catch(() => { if (!cancelled) setNeedsSetup(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    api.getRegistrationStatus()
      .then((data) => setRegistrationAllowed(data.allowRegistration))
      .catch(() => setRegistrationAllowed(false));
  }, []);

  if (authenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Wait for the setup check before deciding welcome-vs-wizard, so a fresh
  // install never flashes the login screen first.
  if (needsSetup === null) {
    return <PageLoader />;
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-panel max-w-sm w-full p-8 text-center space-y-6">
        <div className="flex justify-center">
          <MascotImage className="w-16 h-16 animate-pulse-soft" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-moss-green font-heading text-shadow-soft">
            CozyVTT
          </h1>
          <p className="mt-2 text-warm-gray">
            A self-hosted Virtual Tabletop for cozy, narrative-driven campaigns
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => navigate('/auth/login')}>
            Sign In
          </Button>
          {registrationAllowed && (
            <Button variant="secondary" className="w-full" onClick={() => navigate('/auth/register')}>
              Create Account
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
