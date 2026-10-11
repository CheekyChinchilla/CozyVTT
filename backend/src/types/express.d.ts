import { PlatformRole } from '@prisma/client';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    // The email and display name used to be copied here at sign-in. Nothing
    // read them, and the copies outlived a change of address for as long as
    // the session did; the routes read the account instead.
    platformRole?: PlatformRole;
    // True while the account must set a new password before doing anything else
    // (admin-created accounts, admin password resets). Undefined on sessions
    // created before this field existed — middleware/passwordChange.ts falls
    // back to a database read and caches the answer here.
    mustChangePassword?: boolean;
    // When this sign-in was made (ms since the epoch). A sign-in ends
    // REMEMBER_ME_MAX_AGE after it however active it has been; a session
    // from before this field existed is stamped when next seen.
    signedInAt?: number;
    // MFA flow state — set during login when user has MFA enabled
    mfaPending?: boolean;
    mfaPendingUserId?: string;
    mfaRememberMe?: boolean;
    // When the password step passed (ms since the epoch). The code step must
    // follow within MFA_PENDING_MAX_AGE_MS (routes/auth.ts); a pending session
    // from before this field existed counts as expired.
    mfaPendingAt?: number;
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
