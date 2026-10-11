// ============================================
// Authentication Context
// Global authentication state management
// Provides user data and auth functions to entire app
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { authService } from '@/services/auth.service';
import { queryClient } from '@/lib/queryClient';
import { apiErrorStatus, errorMessage } from '@/utils/errors';
import type {
  User,
  AuthContextType,
  AuthResponse,
  MFASetupResponse,
  MFAVerifyResponse,
} from '@/types/user.types';

// ============================================
// Context Creation
// ============================================

/** The first wait before checking the sign-in again when the server could not answer. */
const AUTH_RETRY_FIRST_MS = 2000;
/** The longest wait between those checks. */
const AUTH_RETRY_MAX_MS = 30_000;

/**
 * Whether a failed GET /api/auth/me means nobody is signed in: the server
 * answered and refused (401, or 403 before setup has run). No answer, a
 * timeout (408), too many requests (429) or a server error says nothing
 * about the sign-in.
 */
function answersSignedOut(error: unknown): boolean {
  const status = apiErrorStatus(error);
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================
// Auth Provider Component
// ============================================

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  // State
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [mfaPending, setMfaPending] = useState<boolean>(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  /**
   * The account the cached lists were fetched for. The lists the pages cache
   * (campaigns, characters, invitations) are keyed without a user, so they
   * are dropped when that account signs out or another one signs in, or the
   * next person on the same tab would be shown the previous one's.
   */
  const cachedFor = useRef<string | null>(null);

  /** Take `next` as the signed-in user, first dropping another account's cached lists. */
  const takeUser = useCallback((next: User): void => {
    if (cachedFor.current !== null && cachedFor.current !== next.id) queryClient.clear();
    cachedFor.current = next.id;
    setUser(next);
  }, []);

  // ============================================
  // Initialize - Check if user is authenticated
  // ============================================

  /**
   * The sign-in check could not get an answer about the sign-in: the server
   * did not answer, answered with an error of its own, or refused for too
   * many requests. `loading` stays true, since nothing is known yet, and the
   * check is made again.
   */
  const [serverUnreachable, setServerUnreachable] = useState<boolean>(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedChecks = useRef(0);
  const mounted = useRef(true);

  const checkAuthentication = useCallback(async (): Promise<void> => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    try {
      const currentUser = await authService.getCurrentUser();
      if (!mounted.current) return;
      takeUser(currentUser);
      setAuthenticated(true);
      setMustChangePassword(currentUser.mustChangePassword || false);
      setServerUnreachable(false);
      failedChecks.current = 0;
      setLoading(false);
    } catch (error) {
      if (!mounted.current) return;
      if (answersSignedOut(error)) {
        setUser(null);
        setAuthenticated(false);
        setMustChangePassword(false);
        setServerUnreachable(false);
        failedChecks.current = 0;
        setLoading(false);
        return;
      }
      // A restart, the proxy's 502 while the backend comes up, a timeout:
      // none of them says the sign-in has ended, so ask again.
      setServerUnreachable(true);
      const delay = Math.min(AUTH_RETRY_FIRST_MS * 2 ** failedChecks.current, AUTH_RETRY_MAX_MS);
      failedChecks.current += 1;
      retryTimer.current = setTimeout(() => { void checkAuthentication(); }, delay);
    }
  }, [takeUser]);

  /** Ask the server again now, from the "can't reach the server" notice. */
  const retryAuthCheck = useCallback((): void => {
    void checkAuthentication();
  }, [checkAuthentication]);

  useEffect(() => {
    mounted.current = true;
    void checkAuthentication();
    return () => {
      mounted.current = false;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    };
  }, [checkAuthentication]);

  // ============================================
  // Login
  // ============================================

  const login = useCallback(async (
    email: string,
    password: string,
    rememberMe: boolean = false
  ): Promise<void> => {
    try {
      const response = await authService.login(email, password, rememberMe);

      // Check if MFA is required
      if ('mfaRequired' in response && response.mfaRequired) {
        setMfaPending(true);
        setUser(null);
        setAuthenticated(false);
        // Don't throw - MFA verification is next step
        return;
      }

      // Login successful — MFA branch returned early above, so response is AuthResponse
      const authResponse = response as AuthResponse;
      takeUser(authResponse.user);
      setAuthenticated(true);
      setMfaPending(false);
      setMustChangePassword(authResponse.mustChangePassword || false);
    } catch (error) {
      setUser(null);
      setAuthenticated(false);
      setMfaPending(false);
      throw error;
    }
  }, [takeUser]);

  // ============================================
  // Logout
  // ============================================

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
      // Continue with local logout even if API call fails
    } finally {
      queryClient.clear();
      cachedFor.current = null;
      setUser(null);
      setAuthenticated(false);
      setMfaPending(false);
      setMustChangePassword(false);
    }
  }, []);

  // ============================================
  // Register
  // ============================================

  const register = useCallback(async (
    email: string,
    password: string,
    displayName: string
  ): Promise<{ pendingApproval?: boolean }> => {
    try {
      const response = await authService.register(email, password, displayName);
      if (response.pendingApproval) {
        // Account created but pending admin approval — do not authenticate
        return { pendingApproval: true };
      }
      takeUser(response.user);
      setAuthenticated(true);
      setMfaPending(false);
      setMustChangePassword(response.mustChangePassword || false);
      return {};
    } catch (error) {
      setUser(null);
      setAuthenticated(false);
      throw error;
    }
  }, [takeUser]);

  // ============================================
  // MFA Verification (during login)
  // ============================================

  const verifyMFA = useCallback(async (token: string): Promise<void> => {
    if (!mfaPending) {
      throw new Error('No MFA verification pending');
    }

    const response = await authService.verifyMFALogin(token);
    takeUser(response.user);
    setAuthenticated(true);
    setMfaPending(false);
    setMustChangePassword(response.mustChangePassword || false);
  }, [mfaPending, takeUser]);

  const verifyMFAWithBackupCode = useCallback(async (backupCode: string): Promise<void> => {
    if (!mfaPending) {
      throw new Error('No MFA verification pending');
    }

    const response = await authService.verifyMFALoginWithBackupCode(backupCode);
    takeUser(response.user);
    setAuthenticated(true);
    setMfaPending(false);
    setMustChangePassword(response.mustChangePassword || false);

    // Show warning if backup codes are running low
    // TODO(accounts): after a backup-code sign-in the server sends how many
    // codes are left, with a warning at three or fewer, but the warning is only
    // logged here, so a user can spend the last code without knowing. Show it
    // to the user after sign-in; showing the count in the profile's two-factor
    // section would also need the server to report it there.
    if (response.warning) {
      console.warn('MFA Warning:', response.warning);
    }
  }, [mfaPending, takeUser]);

  /**
   * Give up on the sign-in waiting for its code. The server holds it in the
   * session, and the sign-in page sends anyone with one waiting on to the
   * code page, so it is ended there (signing out of a waiting sign-in ends
   * only that) before it is forgotten here.
   */
  const cancelMFA = useCallback(async (): Promise<void> => {
    try {
      await authService.logout();
    } catch (error) {
      // The waiting sign-in also ends by itself after five minutes.
      console.error('Failed to end the waiting sign-in:', apiErrorStatus(error) ?? errorMessage(error));
    }
    setMfaPending(false);
  }, []);

  // ============================================
  // MFA Setup (for current user)
  // ============================================

  const setupMFA = useCallback(async (password: string): Promise<MFASetupResponse> => {
    if (!authenticated) {
      throw new Error('Must be authenticated to setup MFA');
    }

    return await authService.setupMFA(password);
  }, [authenticated]);

  const completeMFASetup = useCallback(async (token: string): Promise<MFAVerifyResponse> => {
    if (!authenticated) {
      throw new Error('Must be authenticated to complete MFA setup');
    }

    const response = await authService.completeMFASetup(token);

    // Update user state to reflect MFA enabled
    if (user) {
      setUser({ ...user, mfaEnabled: true });
    }

    return response;
  }, [authenticated, user]);

  const disableMFA = useCallback(async (password: string, token: string): Promise<void> => {
    if (!authenticated) {
      throw new Error('Must be authenticated to disable MFA');
    }

    await authService.disableMFA(password, token);

    // Update user state to reflect MFA disabled
    if (user) {
      setUser({ ...user, mfaEnabled: false });
    }
  }, [authenticated, user]);

  // ============================================
  // Password Management
  // ============================================

  const changePassword = useCallback(async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (!authenticated) {
      throw new Error('Must be authenticated to change password');
    }

    await authService.changePassword(currentPassword, newPassword);

    // Clear mustChangePassword flag after successful change
    setMustChangePassword(false);
    if (user) {
      setUser({ ...user, mustChangePassword: false });
    }
  }, [authenticated, user]);

  // ============================================
  // Refresh User Data
  // ============================================

  /**
   * Adopt a session the server created without going through the login form.
   *
   * Setup is the only caller: it posts the admin's details, the server signs
   * them in and returns the user, and the browser is left holding a session
   * this context has never heard of. `refreshUser` is no help there — it bails
   * out unless `authenticated` is already true, so the wizard used to navigate
   * to the dashboard with the context still empty and the route guard sent the
   * brand-new admin to the login screen, contradicting the wizard's own closing
   * screen.
   */
  const adoptSession = useCallback((adopted: User): void => {
    takeUser(adopted);
    setAuthenticated(true);
    setMfaPending(false);
    setMustChangePassword(adopted.mustChangePassword || false);
  }, [takeUser]);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!authenticated) {
      return;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      takeUser(currentUser);
      setMustChangePassword(currentUser.mustChangePassword || false);
    } catch (error) {
      // Only the server saying the sign-in has gone ends it here, and then
      // there is no server session left to end. Any other failure leaves the
      // user as they were: the change that came before this read was saved.
      if (apiErrorStatus(error) === 401) {
        queryClient.clear();
        cachedFor.current = null;
        setUser(null);
        setAuthenticated(false);
        setMustChangePassword(false);
        return;
      }
      console.error('Failed to refresh user:', apiErrorStatus(error) ?? errorMessage(error));
    }
  }, [authenticated, takeUser]);

  // ============================================
  // Context Value
  // ============================================

  // Memoized so consumers only re-render on actual auth-state changes,
  // not on every provider render.
  const value: AuthContextType = useMemo(() => ({
    // State
    user,
    loading,
    authenticated,
    mfaPending,
    mustChangePassword,
    serverUnreachable,

    // Actions
    login,
    logout,
    register,
    verifyMFA,
    verifyMFAWithBackupCode,
    cancelMFA,
    setupMFA,
    completeMFASetup,
    disableMFA,
    changePassword,
    refreshUser,
    adoptSession,
    retryAuthCheck,
  }), [
    user,
    loading,
    authenticated,
    mfaPending,
    mustChangePassword,
    serverUnreachable,
    retryAuthCheck,
    adoptSession,
    login,
    logout,
    register,
    verifyMFA,
    verifyMFAWithBackupCode,
    cancelMFA,
    setupMFA,
    completeMFASetup,
    disableMFA,
    changePassword,
    refreshUser,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================
// useAuth Hook
// ============================================

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// Export context for testing purposes
export { AuthContext };
