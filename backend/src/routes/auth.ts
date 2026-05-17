/// <reference path="../types/express.d.ts" />
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { registerUser, authenticateUser, sanitizeUser, hashPassword, verifyPassword } from '../services/auth';
import { rememberMeMaxAge } from '../config/session';
import { validatePasswordStrength } from '../utils/validation';
import { isSmtpConfigured, sendPasswordResetEmail } from '../services/email';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../config/database';
import { getSystemSettings, getAppearanceSettings } from '../services/systemSettings';
import rateLimit from 'express-rate-limit';

// ============================================
// MFA Helpers
// ============================================

/** Generate 10 random 8-character alphanumeric backup codes */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase()); // 8 hex chars
  }
  return codes;
}

/** Hash a backup code (SHA-256, non-password — just needs to be irreversible for storage) */
function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

const router = Router();

/**
 * Rate limiting for authentication endpoints
 * Per SOW Section 3.4: 5 attempts per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/register
 * Register a new user account
 * First user automatically becomes ADMIN
 */
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    // Validate required fields
    if (!email || !password || !displayName) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email, password, and display name are required',
      });
    }

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
      const user = await registerUser({ email, password, displayName });

      if (settings.requireAdminApproval) {
        // Mark as pending approval — do NOT create a session
        await prisma.user.update({
          where: { id: user.id },
          data: { isApproved: false },
        });

        return res.status(201).json({
          message: 'Registration submitted. Your account is pending admin approval.',
          pendingApproval: true,
        });
      }

      // Auto-approved registration — create session and log in
      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.displayName = user.displayName;
      req.session.platformRole = user.platformRole;

      return res.status(201).json({
        message: 'User registered successfully',
        user: sanitizeUser(user),
      });
    }

    // First user — no restrictions, register as normal
    const user = await registerUser({ email, password, displayName });

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;

    return res.status(201).json({
      message: 'User registered successfully',
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'Registration Failed',
        message: error.message,
      });
    } else {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and create session
 */
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email and password are required',
      });
    }

    // Authenticate user
    const user = await authenticateUser({
      email,
      password,
      rememberMe,
    });

    if (!user) {
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
      // Set pending MFA state — do NOT fully authenticate yet
      req.session.mfaPending = true;
      req.session.mfaPendingUserId = user.id;
      req.session.mfaRememberMe = !!rememberMe;

      return res.status(200).json({
        mfaRequired: true,
        message: 'MFA verification required. Please enter your TOTP code.',
      });
    }

    // No MFA - create full session
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;

    // Extend session if "Remember Me" is checked
    if (rememberMe && req.session.cookie) {
      req.session.cookie.maxAge = rememberMeMaxAge;
    }

    // Return sanitized user with mustChangePassword flag
    return res.status(200).json({
      message: 'Login successful',
      user: sanitizeUser(user),
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({
        error: 'Login Failed',
        message: error.message,
      });
    } else {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  }
});

/**
 * POST /api/auth/logout
 * Destroy session and log out user
 */
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        error: 'Logout Failed',
        message: 'Failed to destroy session',
      });
    }

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
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Error in GET /me:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 * Always returns 200 to prevent email enumeration
 */
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email is required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (user) {
      const token = crypto.randomUUID();

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      if (isSmtpConfigured()) {
        try {
          await sendPasswordResetEmail(user.email, token, user.displayName);
        } catch (emailError) {
          console.error('Failed to send password reset email:', emailError);
        }
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
    console.error('Error in forgot-password:', error);
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
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Token and new password are required',
      });
    }

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
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

    // Hash and update password
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return res.status(200).json({
      message: 'Password has been reset successfully',
    });
  } catch (error) {
    console.error('Error in reset-password:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Current password and new password are required',
      });
    }

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

    return res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('Error in change-password:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * DELETE /api/auth/account
 * Self-service account deletion. Requires password confirmation.
 */
router.delete('/account', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Password is required to delete your account',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'Authentication Failed',
        message: 'Incorrect password',
      });
    }

    // Delete the user (cascades to memberships, characters, messages, etc.)
    await prisma.user.delete({ where: { id: userId } });

    // Destroy the session
    req.session.destroy(() => {});
    res.clearCookie('cozyvtt.sid');

    return res.status(200).json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete account' });
  }
});

// ============================================
// MFA Endpoints
// Per SOW Section 19.3: Multi-Factor Authentication
// ============================================

/**
 * POST /api/auth/mfa/setup
 * Generate TOTP secret and QR code for authenticated user.
 * Stores the secret in DB (not yet enabled until verified).
 * Requires: Authentication
 */
router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
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

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `CozyVTT:${user.email}`,
      length: 20,
    });

    // Store the pending secret (not enabled yet)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32 },
    });

    // Generate QR code as a data URL
    const otpauthUrl = speakeasy.otpauthURL({
      secret: secret.base32,
      encoding: 'base32',
      issuer: 'CozyVTT',
      label: user.email,
    });
    const qrCodeUrl = await qrcode.toDataURL(otpauthUrl);

    return res.status(200).json({
      message: 'MFA setup initiated. Scan the QR code and verify to enable.',
      qrCodeUrl,
      secret: secret.base32,
    });
  } catch (error) {
    console.error('Error in MFA setup:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to setup MFA' });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Verify TOTP token to complete MFA setup. Generates and returns backup codes (shown once).
 * Requires: Authentication + mfaSecret stored on user
 */
router.post('/mfa/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Validation Error', message: 'Verification code is required' });
    }

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

    // Verify TOTP token
    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: token.toString(),
      window: 1, // Allow 30s clock drift
    });

    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid Code',
        message: 'Invalid verification code. Please try again.',
      });
    }

    // Generate 10 backup codes
    const plainCodes = generateBackupCodes();
    const hashedCodes = plainCodes.map(hashBackupCode);

    // Enable MFA and save hashed backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashedCodes,
      },
    });

    return res.status(200).json({
      message: 'MFA enabled successfully. Save these backup codes securely — they will not be shown again.',
      backupCodes: plainCodes,
    });
  } catch (error) {
    console.error('Error in MFA verify:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify MFA token' });
  }
});

/**
 * POST /api/auth/mfa/verify-login
 * Verify TOTP or backup code during login MFA flow.
 * Requires: mfaPending session state (set by /login when user has MFA enabled)
 */
router.post('/mfa/verify-login', authLimiter, async (req: Request, res: Response) => {
  try {
    if (!req.session.mfaPending || !req.session.mfaPendingUserId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No MFA verification pending. Please log in first.',
      });
    }

    const { token, backupCode } = req.body;

    if (!token && !backupCode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Either a TOTP token or backup code is required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.session.mfaPendingUserId },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid MFA state' });
    }

    let backupCodeUsed = false;
    let remainingBackupCodes: number | undefined;

    if (token) {
      // Verify TOTP token
      const isValid = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: token.toString(),
        window: 1,
      });

      if (!isValid) {
        return res.status(401).json({
          error: 'Invalid Code',
          message: 'Invalid authentication code. Please try again.',
        });
      }
    } else {
      // Verify backup code
      const cleanedCode = backupCode.replace(/[-\s]/g, '').toUpperCase();
      const hashedInput = hashBackupCode(cleanedCode);

      const matchIndex = user.mfaBackupCodes.findIndex((h) => h === hashedInput);
      if (matchIndex === -1) {
        return res.status(401).json({
          error: 'Invalid Code',
          message: 'Invalid backup code. Please try again.',
        });
      }

      // Remove used backup code
      const updatedCodes = user.mfaBackupCodes.filter((_, i) => i !== matchIndex);
      await prisma.user.update({
        where: { id: user.id },
        data: { mfaBackupCodes: updatedCodes },
      });

      backupCodeUsed = true;
      remainingBackupCodes = updatedCodes.length;
    }

    // MFA passed — create full session
    const rememberMe = req.session.mfaRememberMe;
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;
    req.session.mfaPending = undefined;
    req.session.mfaPendingUserId = undefined;
    req.session.mfaRememberMe = undefined;

    if (rememberMe && req.session.cookie) {
      req.session.cookie.maxAge = rememberMeMaxAge;
    }

    const response: any = {
      message: 'Login successful',
      user: sanitizeUser(user),
      mustChangePassword: user.mustChangePassword,
    };

    if (backupCodeUsed) {
      response.backupCodeUsed = true;
      response.remainingBackupCodes = remainingBackupCodes;
      if (remainingBackupCodes !== undefined && remainingBackupCodes <= 3) {
        response.warning = `You have ${remainingBackupCodes} backup code${remainingBackupCodes !== 1 ? 's' : ''} remaining. Regenerate them in your profile settings.`;
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in MFA verify-login:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify MFA' });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA. Requires current password and valid TOTP token.
 * Admins cannot disable MFA per SOW Section 19.3.
 * Requires: Authentication
 */
router.post('/mfa/disable', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Password and authentication code are required',
      });
    }

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
      return res.status(401).json({ error: 'Authentication Failed', message: 'Incorrect password' });
    }

    // Verify TOTP token
    const tokenValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: token.toString(),
      window: 1,
    });

    if (!tokenValid) {
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

    return res.status(200).json({ message: 'MFA disabled successfully' });
  } catch (error) {
    console.error('Error disabling MFA:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to disable MFA' });
  }
});

/**
 * POST /api/auth/mfa/backup-codes
 * Regenerate backup codes. Requires current password.
 * Requires: Authentication + MFA enabled
 */
router.post('/mfa/backup-codes', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Validation Error', message: 'Password is required' });
    }

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
      return res.status(401).json({ error: 'Authentication Failed', message: 'Incorrect password' });
    }

    // Generate new backup codes
    const plainCodes = generateBackupCodes();
    const hashedCodes = plainCodes.map(hashBackupCode);

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedCodes },
    });

    return res.status(200).json({
      message: 'Backup codes regenerated. Save these securely — they will not be shown again.',
      backupCodes: plainCodes,
    });
  } catch (error) {
    console.error('Error regenerating backup codes:', error);
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
  } catch (error) {
    // Safe fallback: hide registration link on error
    return res.status(200).json({ allowRegistration: false });
  }
});

/**
 * GET /api/auth/appearance
 * Returns the instance's appearance settings (theme, font, branding).
 * No authentication required — the login page needs to render with the correct theme.
 */
router.get('/appearance', async (_req: Request, res: Response) => {
  try {
    const appearance = await getAppearanceSettings();
    return res.status(200).json(appearance);
  } catch (error) {
    return res.status(200).json({
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
