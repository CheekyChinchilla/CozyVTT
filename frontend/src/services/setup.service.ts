// ============================================
// Setup Service
// Handles first-time system setup
// ============================================

import { api } from './api';

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
}

export interface InitializeSetupResponse {
  message: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    platformRole: string;
  };
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
