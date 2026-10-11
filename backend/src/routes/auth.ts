/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import qrcode from 'qrcode';
import { registerUser, authenticateUser, sanitizeUser, hashPassword, verifyPassword, RegistrationError } from '../services/auth';
import { rememberMeMaxAge } from '../config/sessionDurations';
import { validatePasswordStrength } from '../utils/validation';
import { isSmtpConfigured, sendPasswordResetEmail } from '../services/email';
import { destroyUserLoginSessions, capLoginSessions } from '../services/sessionStore';
import { voidOutstandingResetLinks, issueResetToken, findResetTokenRow, RESET_LINK_TTL_MS } from '../services/passwordResetTokens';
import { endLiveSockets, announceRosterChange } from '../websocket/utils';
import { generateBackupCodes, hashBackupCodes, verifyBackupCode } from '../utils/backupCodes';
import { regenerateSession } from '../utils/session';
import { verifyTotpOnce, forgetTotpSteps, newTotpSecret, totpSetupUri } from '../utils/totp';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../config/database';
import { getSystemSettings, getAppearanceSettings } from '../services/systemSettings';
import rateLimit from 'express-rate-limit';
import { failureLimiter } from '../middleware/failureLimiter';
import { passwordCheckLimiter, accountLoginLimiter, accountLoginKey } from '../middleware/authLimiters';
import logger from '../utils/logger';
import { deleteAccount, removePersonalFilesAfterwards, runsCampaignsMessage } from '../services/accountDeletion';
import { adminMfaDeadline } from '../services/adminMfaPolicy';
import {
  parseBody,
  LoginBodySchema,
  RegisterBodySchema,
  ForgotPasswordBodySchema,
  ResetPasswordBodySchema,
  ChangePasswordBodySchema,
  PasswordBodySchema,
  MfaVerifyBodySchema,
  MfaDisableBodySchema,
  MfaVerifyLoginBodySchema,
} from '../validators/auth';

/** 400 for a body `parseBody` refused. */
const invalid = (res: Response, message: string) => res.status(400).json({ error: 'Validation Error', message });

/**
 * The bookkeeping every completed sign-in does, after the session has been
 * regenerated and the user set: stamp when it was made, so the guards can end
 * it after the remember-me window however active it stays, and remove the
 * account's oldest sessions beyond the cap. The cap is housekeeping and must
 * not stop a sign-in, so its failure is logged and the sign-in goes on.
 */
function recordSignIn(req: Request, userId: string): void {
  req.session.signedInAt = Date.now();
  capLoginSessions(userId, req.sessionID).catch((err: unknown) => {
    logger.error('Failed to cap login sessions', { err, userId });
  });
}

/**
 * The signed-in user as the client sees them: sanitised, plus the date by
 * which an administrator without MFA must set it up (services/adminMfaPolicy),
 * null for everyone else, which the pages show as a banner, and how many MFA
 * backup codes are left (null with MFA off), which the profile shows. Only
 * the count leaves the server, never the codes' hashes.
 */
export async function clientUser(user: Parameters<typeof sanitizeUser>[0]) {
  const deadline = await adminMfaDeadline(user);
  return {
    ...sanitizeUser(user),
    adminMfaDeadline: deadline ? deadline.toISOString() : null,
    mfaBackupCodesRemaining: user.mfaEnabled ? user.mfaBackupCodes.length : null,
  };
}

/**
 * How long the code step may follow the password step. A pending sign-in sat
 * on the ordinary rolling cookie, so any request carrying it kept it alive and
 * a password proved once could be turned into a sign-in whenever a code came
 * to hand. Five minutes is many times what typing a code takes; after it the
 * person starts again with their password.
 */
export const MFA_PENDING_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * How long after issuing a reset link forgot-password issues no other for the
 * same account. The route is limited per requesting address, so anyone with a
 * few addresses could ask for a reset for one victim every few seconds: each
 * request voided the link before it and sent another email. Within this time
 * the answer is the same, nothing is sent and the link already sent keeps
 * working. Five minutes is well past a slow mail server, and a person who
 * asks twice has a link that works in their inbox.
 */
export const RESET_LINK_COOLDOWN_MS = 5 * 60 * 1000;

// ============================================
// MFA Helpers
// ============================================

const router = Router();

/**
 * Rate limiting for endpoints that check a credential: 5 wrong answers per 15
 * minutes per address, shared by sign-in, password reset and the MFA changes.
 *
 * Only a wrong answer counts, recorded by the route where it finds one: a
 * wrong password, a wrong code, a reset link that is not valid. A correct
 * answer never moves you towards a lockout, and nor does a refusal. Correct
 * sign-ins arriving together from one address (a household, a club, every
 * visitor behind a proxy that hides their addresses) are all let through;
 * see middleware/failureLimiter for how wrong ones sent together are still
 * held to five.
 *
 * Exported for the tests, which mount it on a bare app.
 */
export const credentialLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 wrong answers per window
  message: 'Too many authentication attempts, please try again later',
});

/**
 * Rate limiting for endpoints whose *success* is the thing worth limiting.
 *
 * `/forgot-password` answers 200 whether or not the address exists — deliberately,
 * so it cannot be used to discover who has an account — and sends an email on the
 * way. Skipping successful requests there would leave the send path with no limit
 * at all, turning it into a way to mail somebody repeatedly. So every request
 * counts here, which is the behaviour every one of these endpoints had before.
 */
export const emailDispatchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window, successful or not
  message: { error: 'Rate Limited', message: 'Too many password reset requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for creating accounts.
 *
 * Registration is not a credential check: there is no wrong answer to repeat,
 * and the thing worth limiting is how many accounts one client can create. It
 * shared the credential limiter for a while, which skips successful requests —
 * so only *failed* registrations counted, and an instance with open
 * registration could be filled with accounts by anyone who could reach it.
 *
 * More generous than the credential limiter because a household behind one
 * address may legitimately sign several people up in a sitting, and nothing
 * here is a lockout: it delays a stranger rather than shutting anyone out of an
 * account they already have.
 */
export const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 accounts per hour per address, successful or not
  message: { error: 'Rate Limited', message: 'Too many accounts created from this address, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * MFA setup verification: 5 failed codes per 15 minutes. `skipSuccessfulRequests`
 * so entering the right code never counts against you. Its own window, separate
 * from login, so enrolling does not spend a login budget.
 */
export const mfaSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Rate Limited', message: 'Too many MFA verification attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

/**
 * The code step of a sign-in: 5 wrong codes per 15 minutes per address, on
 * its own window. Only a wrong code or backup code counts, recorded by the
 * route, as the password step does: counting on arrival refused the sixth of
 * six correct codes sent together from one address, and left it counted.
 */
export const mfaLoginLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many MFA login attempts, please try again later',
});

/**
 * The code step, per account: 5 wrong codes per 15 minutes for one account,
 * from wherever they come. The limiter above counts per address, so someone
 * who already has the password could otherwise spread their guesses at the
 * code across many addresses. Keyed on the account the pending sign-in
 * belongs to, which the password step put in the session; a request with no
 * sign-in pending is refused by the handler and neither held nor counted here.
 */
export const mfaAccountLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many MFA login attempts for this account, please try again later',
  key: (req) => (req.session?.mfaPendingUserId ? `mfa-account:${req.session.mfaPendingUserId}` : null),
});

/**
 * POST /api/auth/register
 * Register a new user account
 * First user automatically becomes ADMIN
 */
router.post('/register', accountCreationLimiter, async (req: Request, res: Response) => {
  const body = parseBody(RegisterBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { email, password, displayName } = body.data;

  try {

    // Check if this is the very first user (first admin setup bypasses all restrictions)
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    if (!isFirstUser) {
      // Enforce system settings for all subsequent registrations
      const settings = await getSystemSettings();

      if (!settings.allowRegistration) {
        return res.status(403).json({
          error: 'Registration Disabled',
          message: 'Registration is currently disabled. Please contact an administrator.',
        });
      }

      // Register user with approval status based on settings
      const user = await registerUser({
        email,
        password,
        displayName,
        isApproved: !settings.requireAdminApproval,
      });

      if (settings.requireAdminApproval) {
        // Pending approval — do NOT create a session
        return res.status(201).json({
          message: 'Registration submitted. Your account is pending admin approval.',
          pendingApproval: true,
        });
      }

      // Auto-approved registration — create session and log in, on a fresh id.
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.platformRole = user.platformRole;
      recordSignIn(req, user.id);

      return res.status(201).json({
        message: 'User registered successfully',
        user: sanitizeUser(user),
      });
    }

    // First user — no restrictions, register as normal
    const user = await registerUser({ email, password, displayName });

    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.platformRole = user.platformRole;
    recordSignIn(req, user.id);

    return res.status(201).json({
      message: 'User registered successfully',
      user: sanitizeUser(user),
    });
  } catch (error) {
    // Only a refusal of what was sent is explained; anything else is the
    // server's, and its text stays in the log.
    if (error instanceof RegistrationError) {
      return res.status(400).json({
        error: 'Registration Failed',
        message: error.message,
      });
    }
    logger.error('Error in register', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', credentialLimiter, accountLoginLimiter, async (req: Request, res: Response) => {
  const body = parseBody(LoginBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { email, password, rememberMe } = body.data;

  try {
    // Authenticate user
    const user = await authenticateUser({
      email,
      password,
      rememberMe,
    });

    // The same answer, and the same counts, whether or not the address has an account.
    if (!user) {
      credentialLimiter.recordFailure(req);
      accountLoginLimiter.recordFailure(req);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Invalid email or password',
      });
    }

    // Check if the account is pending admin approval
    if (!user.isApproved) {
      return res.status(403).json({
        error: 'Account Pending Approval',
        message: 'Your account is pending admin approval. Please contact an administrator.',
      });
    }

    if (user.mfaEnabled) {
      // A privilege transition: a fresh id before the session carries any weight.
      await regenerateSession(req);

      // Set pending MFA state — do NOT fully authenticate yet
      req.session.mfaPending = true;
      req.session.mfaPendingUserId = user.id;
      req.session.mfaRememberMe = !!rememberMe;
      req.session.mfaPendingAt = Date.now();

      return res.status(200).json({
        mfaRequired: true,
        message: 'MFA verification required. Please enter your TOTP code.',
      });
    }

    // No MFA - create full session on a fresh id (session fixation).
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.platformRole = user.platformRole;
    // Gates every other API call until the password is replaced
    req.session.mustChangePassword = user.mustChangePassword;
    recordSignIn(req, user.id);

    // Extend session if "Remember Me" is checked
    if (rememberMe && req.session.cookie) {
      req.session.cookie.maxAge = rememberMeMaxAge;
    }

    // Return sanitized user with mustChangePassword flag
    return res.status(200).json({
      message: 'Login successful',
      user: await clientUser(user),
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    logger.error('Error in login', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/logout
 * Destroy session and log out user
 */
router.post('/logout', (req: Request, res: Response) => {
  // Read before the session is gone: the sign-in's own live connections end
  // with it, and another sign-in of the same account (another device) stays.
  const { userId } = req.session;
  const sessionId = req.sessionID;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: 'Logout Failed',
        message: 'Failed to destroy session',
      });
    }
    if (userId) void endLiveSockets(userId, 'You signed out.', { onlySessionId: sessionId });

    res.clearCookie('cozyvtt.sid');
    return res.status(200).json({
      message: 'Logout successful',
    });
  });
});

/**
 * GET /api/auth/me
 * Get current authenticated user (fetches from DB to include avatarUrl and other profile fields)
 */
router.get('/me', async (req: Request, res: Response) => {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Not authenticated',
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    return res.status(200).json({
      user: await clientUser(user),
    });
  } catch (error) {
    logger.error('Error in GET /me', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * Issues a password reset link for an existing account and sends it, unless a
 * link was issued within the cooldown.
 */
async function issueResetLinkFor(user: { id: string; email: string; displayName: string }): Promise<void> {
  // A link issued within the cooldown is left as it is: nothing new is
  // sent and nothing is voided, so one inbox cannot be flooded or have
  // its link pulled from under it by repeated requests.
  const recent = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, used: false, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - RESET_LINK_COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return;

  // Rows that can never be used again go, so the table does not grow by
  // one row per request for ever.
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id, OR: [{ used: true }, { expiresAt: { lt: new Date() } }] },
  });
  // Only the newest link works. This also voids a pending invitation,
  // whose replacement goes to the same address. The row holds the
  // token's hash; the token itself goes only into the email.
  await voidOutstandingResetLinks(user.id);
  const token = await issueResetToken(user.id, RESET_LINK_TTL_MS);

  // Not awaited: waiting for the mail server only for a known address
  // would let the response time tell which addresses have accounts.
  if (isSmtpConfigured()) {
    sendPasswordResetEmail(user.email, token, user.displayName).catch((emailError) => {
      logger.error('Failed to send password reset email', { err: emailError });
    });
  }
}

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 * Always returns 200 to prevent email enumeration
 */
router.post('/forgot-password', emailDispatchLimiter, async (req: Request, res: Response) => {
  const body = parseBody(ForgotPasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { email } = body.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      // Only a known address reaches the writes that issue a link, so a failure
      // in them must not change the answer: a 500 here and a 200 for an unknown
      // address would show which addresses have accounts while it lasted. It is
      // logged for the administrator and the person gets the usual answer.
      try {
        await issueResetLinkFor(user);
      } catch (issueError) {
        logger.error('Failed to issue a password reset link', { err: issueError, userId: user.id });
      }
    }

    // Always return the same response to prevent email enumeration
    if (isSmtpConfigured()) {
      return res.status(200).json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } else {
      return res.status(200).json({
        message: 'Password reset is not available. Contact your administrator.',
      });
    }
  } catch (error) {
    // The address lookup failed, which fails the same way for every address.
    logger.error('Error in forgot-password', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */
router.post('/reset-password', credentialLimiter, async (req: Request, res: Response) => {
  const body = parseBody(ResetPasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { token, newPassword } = body.data;

  try {
    // Find valid token: by its hash, or as sent for a link issued before
    // tokens were hashed (services/passwordResetTokens).
    const resetToken = await findResetTokenRow(token);

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      credentialLimiter.recordFailure(req);
      return res.status(400).json({
        error: 'Invalid Token',
        message: 'This password reset link is invalid or has expired',
      });
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Validation Error',
        message: passwordValidation.errors.join(', '),
      });
    }

    const passwordHash = await hashPassword(newPassword);

    // Claim the link and set the password together. The claim is a
    // conditional write, so of two requests carrying the same link only one
    // finds it unused; the other changes nothing. The account's other links
    // are voided in the same step, since the password they would set is
    // settled now. Yields the account's email, or false when the link had
    // been claimed.
    const accountEmail = await prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      if (claim.count === 0) return false;

      const { email } = await tx.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
        },
        select: { email: true },
      });
      await voidOutstandingResetLinks(resetToken.userId, tx);
      return email;
    });

    if (accountEmail === false) {
      return res.status(400).json({
        error: 'Invalid Token',
        message: 'This password reset link is invalid or has expired',
      });
    }

    // The wrong passwords counted against the account were guesses at the
    // old one; a locked account opens with its new password.
    accountLoginLimiter.forget(accountLoginKey(accountEmail));

    // A reset by link is how someone recovers an account they cannot or will
    // not sign in to, so every sign-in opened with the old password ends,
    // live connections included. Nobody is signed in here to keep.
    await destroyUserLoginSessions(resetToken.userId);
    await endLiveSockets(resetToken.userId, 'Your password was reset. Sign in again.');

    return res.status(200).json({
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    logger.error('Error in reset-password', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user. Wrong current passwords count
 * against passwordCheckLimiter, shared with DELETE /account and an email
 * change: 10 per 15 minutes for the account.
 */
router.post('/change-password', requireAuth, passwordCheckLimiter, async (req: Request, res: Response) => {
  const body = parseBody(ChangePasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { currentPassword, newPassword } = body.data;

  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Verify current password
    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      passwordCheckLimiter.recordFailure(req);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Current password is incorrect',
      });
    }

    // Validate new password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Validation Error',
        message: passwordValidation.errors.join(', '),
      });
    }

    // Hash and update
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Lift the gate for this session immediately (see middleware/passwordChange.ts)
    req.session.mustChangePassword = false;

    // The wrong passwords counted against the account were guesses at the
    // old one; a locked account opens with its new password.
    accountLoginLimiter.forget(accountLoginKey(user.email));

    // A reset link issued before the change would undo it.
    await voidOutstandingResetLinks(user.id);

    // Changing a password is how someone recovers an account they think is
    // compromised, so the sessions opened with the old one have to end. This
    // one is kept, so the person doing it is not signed out of the device they
    // are holding.
    await destroyUserLoginSessions(user.id, req.sessionID);
    await endLiveSockets(user.id, 'Your password was changed on another device. Sign in again.', { exceptSessionId: req.sessionID });

    return res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('Error in change-password', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * DELETE /api/auth/account
 * Self-service account deletion. Requires password confirmation; a wrong
 * password counts against passwordCheckLimiter.
 */
router.delete('/account', requireAuth, passwordCheckLimiter, async (req: Request, res: Response) => {
  const body = parseBody(PasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { password } = body.data;

  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      passwordCheckLimiter.recordFailure(req);
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Incorrect password',
      });
    }

    // See services/accountDeletion.ts for what stays and what goes. The
    // instance must keep an admin (services/platformAdmins), which the
    // deletion checks in its own transaction.
    const deletion = await deleteAccount(userId);
    if (!deletion.deleted && deletion.refused === 'onlyAdmin') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'You are the only admin on this instance. Promote another user to admin before deleting your account.',
      });
    }
    if (!deletion.deleted) {
      return res.status(409).json({ error: 'Conflict', message: runsCampaignsMessage(deletion.runs, 'you') });
    }
    // The deletion ended the account's other sign-ins in its own transaction
    // (services/accountDeletion); the live connections end here.
    await endLiveSockets(userId, 'Your account was deleted.');
    announceRosterChange(userId, deletion.campaignIds, 'member.left');
    removePersonalFilesAfterwards(deletion.personal);

    // Destroy the session
    req.session.destroy(() => {});
    res.clearCookie('cozyvtt.sid');

    return res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Error deleting account', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete account' });
  }
});

// ============================================
// MFA Endpoints
// Multi-Factor Authentication
// ============================================

/**
 * POST /api/auth/mfa/setup
 * Generate TOTP secret and QR code for authenticated user.
 * Stores the secret in DB (not yet enabled until verified).
 * Requires: Authentication + current password. Enrolling an authenticator
 * decides who can sign in from then on, so a session alone is not enough, as
 * with turning MFA off.
 */
router.post('/mfa/setup', requireAuth, credentialLimiter, async (req: Request, res: Response) => {
  const body = parseBody(PasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { password } = body.data;

  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA is already enabled. Disable it first to set it up again.',
      });
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      credentialLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Authentication Failed', message: 'Incorrect password' });
    }

    // Generate TOTP secret
    const secret = newTotpSecret();

    // Store the pending secret (not enabled yet)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });
    forgetTotpSteps(userId);

    // Generate QR code as a data URL
    const qrCodeUrl = await qrcode.toDataURL(totpSetupUri(secret, user.email));

    return res.status(200).json({
      message: 'MFA setup initiated. Scan the QR code and verify to enable.',
      qrCodeUrl,
      secret,
    });
  } catch (error) {
    logger.error('Error in MFA setup', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to setup MFA' });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP token to complete MFA setup. Generates and returns backup codes (shown once).
 * Requires: Authentication + mfaSecret stored on user
 */
router.post('/mfa/verify', requireAuth, mfaSetupLimiter, async (req: Request, res: Response) => {
  const body = parseBody(MfaVerifyBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { token } = body.data;

  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No MFA setup in progress. Call /mfa/setup first.',
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({ error: 'Bad Request', message: 'MFA is already enabled' });
    }

    // Verify TOTP token (once: see utils/totp)
    const isValid = verifyTotpOnce(userId, user.mfaSecret, token);

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid Code',
        message: 'Invalid verification code. Please try again.',
      });
    }

    // Generate 10 backup codes
    const plainCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(plainCodes);

    // Enable MFA and save hashed backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashedCodes,
      },
    });

    // Turning the second factor on is a change to how the account is
    // protected, often made because something looked wrong, so the sessions
    // opened without it end. This one is kept, as when MFA is turned off.
    await destroyUserLoginSessions(userId, req.sessionID);
    await endLiveSockets(userId, 'Two-factor authentication was turned on from another device. Sign in again.', { exceptSessionId: req.sessionID });

    return res.status(200).json({
      message: 'MFA enabled successfully. Save these backup codes securely — they will not be shown again.',
      backupCodes: plainCodes,
    });
  } catch (error) {
    logger.error('Error in MFA verify', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify MFA token' });
  }
});

/**
 * POST /api/auth/mfa/verify-login
 * Verify TOTP or backup code during login MFA flow.
 * Requires: mfaPending session state (set by /login when user has MFA enabled)
 */
router.post('/mfa/verify-login', mfaLoginLimiter, mfaAccountLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.session.mfaPending || !req.session.mfaPendingUserId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No MFA verification pending. Please log in first.',
      });
    }

    // Too long since the password step: the pending sign-in ends here, and
    // the person proves the password again. A pending session from before
    // this check existed has no time and counts as expired.
    const since = req.session.mfaPendingAt;
    if (since === undefined || Date.now() - since > MFA_PENDING_MAX_AGE_MS) {
      req.session.mfaPending = undefined;
      req.session.mfaPendingUserId = undefined;
      req.session.mfaRememberMe = undefined;
      req.session.mfaPendingAt = undefined;
      return res.status(401).json({
        error: 'Sign-In Expired',
        message: 'Your sign-in timed out at the code step. Sign in again with your password.',
      });
    }

    const body = parseBody(MfaVerifyLoginBodySchema, req.body);
    if (!body.ok) return invalid(res, body.message);
    const { token, backupCode } = body.data;

    const user = await prisma.user.findUnique({
      where: { id: req.session.mfaPendingUserId },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid MFA state' });
    }

    let backupCodeUsed = false;
    let remainingBackupCodes: number | undefined;

    if (token) {
      // Verify TOTP token. A code that has been accepted once, here or when
      // MFA was turned on, is refused: see utils/totp.
      const isValid = verifyTotpOnce(user.id, user.mfaSecret, token);

      if (!isValid) {
        mfaLoginLimiter.recordFailure(req);
        mfaAccountLimiter.recordFailure(req);
        return res.status(401).json({
          error: 'Invalid Code',
          message: 'Invalid authentication code. Please try again.',
        });
      }
    } else {
      // Verify backup code against the Argon2 hashes on record.
      const matchIndex = await verifyBackupCode(backupCode ?? '', user.mfaBackupCodes);
      if (matchIndex === -1) {
        mfaLoginLimiter.recordFailure(req);
        mfaAccountLimiter.recordFailure(req);
        return res.status(401).json({
          error: 'Invalid Code',
          message: 'Invalid backup code. Please try again.',
        });
      }

      // Spend exactly the hash that matched, and only if it is still there.
      // The Argon2 checks above take a moment, and another sign-in may have
      // spent this code, or another one, since the list was read: writing
      // that list back would let this code work twice, or bring the other one
      // back. So the removal is one conditional statement, and no row
      // changed means the code was spent in the meantime.
      const matched = user.mfaBackupCodes[matchIndex];
      const spent = await prisma.$queryRaw<{ remaining: number }[]>`
        UPDATE "User"
        SET "mfaBackupCodes" = array_remove("mfaBackupCodes", ${matched})
        WHERE id = ${user.id} AND ${matched} = ANY("mfaBackupCodes")
        RETURNING cardinality("mfaBackupCodes") AS remaining
      `;
      if (spent.length === 0) {
        mfaLoginLimiter.recordFailure(req);
        mfaAccountLimiter.recordFailure(req);
        return res.status(401).json({
          error: 'Invalid Code',
          message: 'Invalid backup code. Please try again.',
        });
      }

      backupCodeUsed = true;
      remainingBackupCodes = Number(spent[0].remaining);
    }

    // MFA passed — create full session. rememberMe is captured before the
    // regenerate clears the pending session.
    const rememberMe = req.session.mfaRememberMe;
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.platformRole = user.platformRole;
    recordSignIn(req, user.id);
    req.session.mfaPending = undefined;
    req.session.mfaPendingUserId = undefined;
    req.session.mfaRememberMe = undefined;
    req.session.mfaPendingAt = undefined;

    if (rememberMe && req.session.cookie) {
      req.session.cookie.maxAge = rememberMeMaxAge;
    }

    // Typed rather than `any` because the backup-code fields below are added
    // conditionally: with `any` a typo in one of those names would have compiled
    // and silently dropped the warning a user needs to see.
    const response: {
      message: string;
      user: Awaited<ReturnType<typeof clientUser>>;
      mustChangePassword: boolean;
      backupCodeUsed?: boolean;
      remainingBackupCodes?: number;
      warning?: string;
    } = {
      message: 'Login successful',
      user: await clientUser(user),
      mustChangePassword: user.mustChangePassword,
    };

    // The row was read before the backup code was spent, so its list still
    // holds that code: the count is the one the removal returned.
    if (remainingBackupCodes !== undefined) {
      response.user.mfaBackupCodesRemaining = remainingBackupCodes;
    }

    if (backupCodeUsed) {
      response.backupCodeUsed = true;
      response.remainingBackupCodes = remainingBackupCodes;
      if (remainingBackupCodes !== undefined && remainingBackupCodes <= 3) {
        response.warning = `You have ${remainingBackupCodes} backup code${remainingBackupCodes !== 1 ? 's' : ''} remaining. Regenerate them in your profile settings.`;
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error in MFA verify-login', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify MFA' });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA. Requires current password and valid TOTP token.
 * Admins cannot disable MFA
 * Requires: Authentication
 */
router.post('/mfa/disable', requireAuth, credentialLimiter, async (req: Request, res: Response) => {
  const body = parseBody(MfaDisableBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { password, token } = body.data;

  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Admins must keep MFA enabled
    if (user.platformRole === 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin accounts must keep MFA enabled.',
      });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ error: 'Bad Request', message: 'MFA is not enabled' });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      credentialLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Authentication Failed', message: 'Incorrect password' });
    }

    // Verify TOTP token (once: see utils/totp)
    const tokenValid = verifyTotpOnce(user.id, user.mfaSecret, token);

    if (!tokenValid) {
      credentialLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Invalid Code', message: 'Invalid authentication code' });
    }

    // Disable MFA
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });
    forgetTotpSteps(userId);

    // Turning the second factor off is a change to how the account is
    // protected, so the sessions opened while it was on end with it. This one
    // is kept, as with a password change.
    await destroyUserLoginSessions(user.id, req.sessionID);
    await endLiveSockets(user.id, 'Two-factor authentication was turned off on another device. Sign in again.', { exceptSessionId: req.sessionID });

    return res.status(200).json({ message: 'MFA disabled successfully' });
  } catch (error) {
    logger.error('Error disabling MFA', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to disable MFA' });
  }
});

/**
 * POST /api/auth/mfa/backup-codes
 * Regenerate backup codes. Requires current password.
 * Requires: Authentication + MFA enabled
 */
router.post('/mfa/backup-codes', requireAuth, credentialLimiter, async (req: Request, res: Response) => {
  const body = parseBody(PasswordBodySchema, req.body);
  if (!body.ok) return invalid(res, body.message);
  const { password } = body.data;

  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    if (!user.mfaEnabled) {
      return res.status(400).json({ error: 'Bad Request', message: 'MFA is not enabled' });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      credentialLimiter.recordFailure(req);
      return res.status(401).json({ error: 'Authentication Failed', message: 'Incorrect password' });
    }

    // Generate new backup codes
    const plainCodes = generateBackupCodes();
    const hashedCodes = await hashBackupCodes(plainCodes);

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedCodes },
    });

    return res.status(200).json({
      message: 'Backup codes regenerated. Save these securely — they will not be shown again.',
      backupCodes: plainCodes,
    });
  } catch (error) {
    logger.error('Error regenerating backup codes', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to regenerate backup codes' });
  }
});

/**
 * GET /api/auth/registration-status
 * Returns whether public self-registration is currently enabled.
 * Used by the frontend to show/hide the register link on the login page.
 * No authentication required — this is intentionally public information.
 */
router.get('/registration-status', async (_req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      // Setup wizard is first — registration is implicitly available
      return res.status(200).json({ allowRegistration: true });
    }
    const settings = await getSystemSettings();
    return res.status(200).json({ allowRegistration: settings.allowRegistration });
  } catch {
    // Safe fallback: hide registration link on error
    return res.status(200).json({ allowRegistration: false });
  }
});

/**
 * GET /api/auth/appearance
 * Returns the instance's appearance settings (name, theme, font, branding).
 * No authentication required — the login page needs to render with the correct theme.
 */
router.get('/appearance', async (_req: Request, res: Response) => {
  try {
    const appearance = await getAppearanceSettings();
    return res.status(200).json(appearance);
  } catch {
    return res.status(200).json({
      instanceName: 'CozyVTT',
      themeId: 'cozy-default',
      customThemeColors: null,
      fontId: 'default',
      customLogoUrl: null,
      customFaviconUrl: null,
      customMascotUrl: null,
    });
  }
});

/**
 * GET /api/auth/ping
 * Session keepalive — extends the rolling session cookie without fetching user data.
 * Called periodically by the frontend during active gameplay to prevent mid-session expiry.
 */
router.get('/ping', requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

export default router;
