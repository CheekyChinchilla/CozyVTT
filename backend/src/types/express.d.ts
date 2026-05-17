import { PlatformRole } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    email?: string;
    displayName?: string;
    platformRole?: PlatformRole;
    // MFA flow state — set during login when user has MFA enabled
    mfaPending?: boolean;
    mfaPendingUserId?: string;
    mfaRememberMe?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
