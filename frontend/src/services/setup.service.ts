// ============================================
// Setup Service
// Handles first-time system setup
// ============================================

import { api } from './api';
import type { User } from '@/types/user.types';

// ============================================
// Setup Status Response
// ============================================

export interface SetupStatusResponse {
  setupCompleted: boolean;
  hasUsers: boolean;
  needsSetup: boolean;
}

// ============================================
// Setup Initialization Request/Response
// ============================================

export interface InitializeSetupRequest {
  email: string;
  password: string;
  displayName: string;
  /**
   * The wizard's system configuration step. Optional because the endpoint
   * treats each as "leave at its default" when absent — a malformed one must
   * not cost an admin their single opportunity to run setup.
   */
  instanceName?: string;
  timezone?: string;
  allowRegistration?: boolean;
}

export interface InitializeSetupResponse {
  message: string;
  /**
   * The new admin, as `sanitizeUser` returns them — the same shape login gives
   * back. Declared as the full `User` rather than the four fields the wizard
   * happened to need, because the caller signs in with it and a narrower type
   * here would just be a second, quietly wrong description of the same payload.
   */
  user: User;
}

// ============================================
// Setup Service Class
// ============================================

class SetupService {
  /**
   * Check if system setup is needed
   * Public endpoint - no authentication required
   */
  async checkSetupStatus(): Promise<SetupStatusResponse> {
    return await api.checkSetupStatus();
  }

  /**
   * Initialize system with first admin account
   * Public endpoint - no authentication required
   * Creates admin user, marks setup complete, and establishes session
   */
  async initializeSetup(data: InitializeSetupRequest): Promise<InitializeSetupResponse> {
    return await api.initializeSetup(data);
  }
}

// Export singleton instance
export const setupService = new SetupService();
export default setupService;
