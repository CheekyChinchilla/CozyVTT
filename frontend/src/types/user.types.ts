// ============================================
// User & Authentication Types
// Extracted for AuthContext usage
// ============================================

import type { PlatformRole, UserPreferences } from './index';

// Re-export PlatformRole for convenience
export { PlatformRole } from './index';
export type { UserPreferences } from './index';

// ============================================
// User Model
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  globalAssetManager: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
  preferences?: UserPreferences | null;
}

// ============================================
// Authentication Request/Response Types
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  pendingApproval?: boolean;
}

export interface MFARequiredResponse {
  mfaRequired: true;
  message: string;
}

export interface MFASetupResponse {
  message: string;
  qrCodeUrl: string;
  secret: string;
}

export interface MFAVerifyResponse {
  message: string;
  backupCodes: string[];
}

export interface MFALoginVerifyRequest {
  token?: string;
  backupCode?: string;
}

export interface MFALoginResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  backupCodeUsed?: boolean;
  remainingBackupCodes?: number;
  warning?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

// ============================================
// Auth State (for AuthContext)
// ============================================

export interface AuthState {
  user: User | null;
  loading: boolean;
  authenticated: boolean;
  mfaPending: boolean;
  mustChangePassword: boolean;
}

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

  // Actions
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<{ pendingApproval?: boolean }>;
  verifyMFA: (token: string) => Promise<void>;
  verifyMFAWithBackupCode: (backupCode: string) => Promise<void>;
  setupMFA: () => Promise<MFASetupResponse>;
  completeMFASetup: (token: string) => Promise<MFAVerifyResponse>;
  disableMFA: (password: string, token: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}
