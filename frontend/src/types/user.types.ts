// ============================================
// User & Authentication Types
// The user and the auth request and response shapes are declared once, in
// ./index; this file re-exports them beside the AuthContext type.
// ============================================

import type { MFASetupResponse, MFAVerifyResponse, User } from './index';

export { PlatformRole } from './index';
export type {
  AuthResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  MFALoginResponse,
  MFALoginVerifyRequest,
  MFARequiredResponse,
  MFASetupResponse,
  MFAVerifyResponse,
  RegisterRequest,
  ResetPasswordRequest,
  User,
  UserPreferences,
} from './index';

// ============================================
// Auth Context Type
// ============================================

export interface AuthContextType {
  // State
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  mfaPending: boolean;
  mustChangePassword: boolean;
  /**
   * The sign-in check got no answer about the sign-in (the server did not
   * answer, or failed). `loading` stays true and the check is retried.
   */
  serverUnreachable: boolean;
  /** After a sign-in with a backup code, how many are left; null otherwise or once dismissed. */
  backupCodesLeft: number | null;

  // Actions
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<{ pendingApproval?: boolean }>;
  verifyMFA: (token: string) => Promise<void>;
  verifyMFAWithBackupCode: (backupCode: string) => Promise<void>;
  /** End the sign-in waiting for its two-factor code, on the server and here. */
  cancelMFA: () => Promise<void>;
  /** Starts enrolment; the server asks for the current password first. */
  setupMFA: (password: string) => Promise<MFASetupResponse>;
  completeMFASetup: (token: string) => Promise<MFAVerifyResponse>;
  disableMFA: (password: string, token: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  /**
   * Take up a session the server established outside the login form.
   *
   * `refreshUser` cannot do this: it returns early unless the context already
   * believes it is authenticated, which is the whole point — an anonymous
   * visitor should not poll `/api/auth/me` on every render. The setup wizard is
   * the case that breaks: `POST /api/setup/init` creates the admin, signs them
   * in server-side and hands the user back, at which point the browser holds a
   * valid session the context knows nothing about.
   */
  adoptSession: (user: User) => void;
  /** Check the sign-in again now, after the server could not be reached. */
  retryAuthCheck: () => void;
  /** Hide the notice of how many backup codes are left. */
  dismissBackupCodesLeft: () => void;
}
