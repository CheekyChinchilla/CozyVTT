// ============================================
// Authentication Context
// Global authentication state management
// Provides user data and auth functions to entire app
// ============================================

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authService } from '@/services/auth.service';
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

  // ============================================
  // Initialize - Check if user is authenticated
  // ============================================

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      setLoading(true);
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setAuthenticated(true);
      setMustChangePassword(currentUser.mustChangePassword || false);
    } catch (error) {
      // Not authenticated or session expired
      setUser(null);
      setAuthenticated(false);
      setMustChangePassword(false);
    } finally {
      setLoading(false);
    }
  };

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
      setUser(authResponse.user);
      setAuthenticated(true);
      setMfaPending(false);
      setMustChangePassword(authResponse.mustChangePassword || false);
    } catch (error) {
      setUser(null);
      setAuthenticated(false);
      setMfaPending(false);
      throw error;
    }
  }, []);

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
      setUser(response.user);
      setAuthenticated(true);
      setMfaPending(false);
      setMustChangePassword(response.mustChangePassword || false);
      return {};
    } catch (error) {
      setUser(null);
      setAuthenticated(false);
      throw error;
    }
  }, []);

  // ============================================
  // MFA Verification (during login)
  // ============================================

  const verifyMFA = useCallback(async (token: string): Promise<void> => {
    if (!mfaPending) {
      throw new Error('No MFA verification pending');
    }

    const response = await authService.verifyMFALogin(token);
    setUser(response.user);
    setAuthenticated(true);
    setMfaPending(false);
    setMustChangePassword(response.mustChangePassword || false);
  }, [mfaPending]);

  const verifyMFAWithBackupCode = useCallback(async (backupCode: string): Promise<void> => {
    if (!mfaPending) {
      throw new Error('No MFA verification pending');
    }

    const response = await authService.verifyMFALoginWithBackupCode(backupCode);
    setUser(response.user);
    setAuthenticated(true);
    setMfaPending(false);
    setMustChangePassword(response.mustChangePassword || false);

    // Show warning if backup codes are running low
    if (response.warning) {
      console.warn('MFA Warning:', response.warning);
    }
  }, [mfaPending]);

  // ============================================
  // MFA Setup (for current user)
  // ============================================

  const setupMFA = useCallback(async (): Promise<MFASetupResponse> => {
    if (!authenticated) {
      throw new Error('Must be authenticated to setup MFA');
    }

    return await authService.setupMFA();
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

  const refreshUser = useCallback(async (): Promise<void> => {
    if (!authenticated) {
      return;
    }

    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      setMustChangePassword(currentUser.mustChangePassword || false);
    } catch (error) {
      console.error('Failed to refresh user:', error);
      // If refresh fails, user might be logged out
      await logout();
    }
  }, [authenticated, logout]);

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

    // Actions
    login,
    logout,
    register,
    verifyMFA,
    verifyMFAWithBackupCode,
    setupMFA,
    completeMFASetup,
    disableMFA,
    changePassword,
    refreshUser,
  }), [
    user,
    loading,
    authenticated,
    mfaPending,
    mustChangePassword,
    login,
    logout,
    register,
    verifyMFA,
    verifyMFAWithBackupCode,
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
