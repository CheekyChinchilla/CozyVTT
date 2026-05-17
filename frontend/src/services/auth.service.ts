// ============================================
// Authentication Service
// Clean wrapper around API client for auth operations
// Used by AuthContext and authentication components
// ============================================

import { api } from './api';
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  MFARequiredResponse,
  MFASetupResponse,
  MFAVerifyResponse,
  MFALoginResponse,
  MFALoginVerifyRequest,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
} from '@/types/user.types';

// ============================================
// Authentication Service Class
// ============================================

class AuthService {
  /**
   * Login with email and password
   * Returns user data or throws if MFA is required
   */
  async login(
    email: string,
    password: string,
    rememberMe: boolean = false
  ): Promise<AuthResponse | MFARequiredResponse> {
    const loginData: LoginRequest = { email, password, rememberMe };
    const response = await api.login(loginData);

    // Check if MFA is required
    if ('mfaRequired' in response && response.mfaRequired) {
      return response as MFARequiredResponse;
    }

    return response as AuthResponse;
  }

  /**
   * Register new user account
   */
  async register(
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthResponse> {
    const registerData: RegisterRequest = { email, password, displayName };
    return await api.register(registerData);
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    await api.logout();
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User> {
    const response = await api.getCurrentUser();
    return response.user;
  }

  /**
   * Verify MFA token during login
   */
  async verifyMFALogin(token: string): Promise<MFALoginResponse> {
    const verifyData: MFALoginVerifyRequest = { token };
    return await api.mfaVerifyLogin(verifyData);
  }

  /**
   * Verify MFA using backup code during login
   */
  async verifyMFALoginWithBackupCode(backupCode: string): Promise<MFALoginResponse> {
    const verifyData: MFALoginVerifyRequest = { backupCode };
    return await api.mfaVerifyLogin(verifyData);
  }

  /**
   * Setup MFA for current user
   * Returns QR code and secret for authenticator app
   */
  async setupMFA(): Promise<MFASetupResponse> {
    return await api.mfaSetup();
  }

  /**
   * Complete MFA setup by verifying TOTP token
   * Returns backup codes (shown only once)
   */
  async completeMFASetup(token: string): Promise<MFAVerifyResponse> {
    return await api.mfaVerifySetup({ token });
  }

  /**
   * Disable MFA for current user
   */
  async disableMFA(password: string, token: string): Promise<void> {
    await api.mfaDisable(password, token);
  }

  /**
   * Regenerate MFA backup codes
   */
  async regenerateBackupCodes(password: string): Promise<MFAVerifyResponse> {
    return await api.mfaRegenerateBackupCodes(password);
  }

  /**
   * Change user's password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const changeData: ChangePasswordRequest = { currentPassword, newPassword };
    await api.changePassword(changeData);
  }

  /**
   * Request password reset email
   */
  async forgotPassword(email: string): Promise<void> {
    const forgotData: ForgotPasswordRequest = { email };
    await api.forgotPassword(forgotData);
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetData: ResetPasswordRequest = { token, newPassword };
    await api.resetPassword(resetData);
  }

  /**
   * Check if user is authenticated
   * Attempts to fetch current user, returns true if successful
   */
  async checkAuth(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;
