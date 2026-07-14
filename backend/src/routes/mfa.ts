import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import { verifyPassword, sanitizeUser } from '../services/auth';
import {
  generateMfaSecret,
  generateQrCode,
  verifyTotpToken,
  generateBackupCodes,
  hashBackupCodes,
  verifyBackupCode,
} from '../services/mfa';
import { rememberMeMaxAge } from '../config/session';
import logger from '../utils/logger';

/**
 * MFA Routes
 * Multi-Factor Authentication Flow
 *
 * Endpoints:
 *   POST /api/auth/mfa/setup        - Begin MFA setup (generate secret + QR)
 *   POST /api/auth/mfa/verify       - Complete MFA setup (verify TOTP, generate backup codes)
 *   POST /api/auth/mfa/verify-login - Verify MFA during login (TOTP or backup code)
 *   POST /api/auth/mfa/disable      - Disable MFA (requires password + TOTP)
 *   POST /api/auth/mfa/backup-codes - Regenerate backup codes
 */

const router = Router();

// Rate limit MFA setup verification (5 attempts per 15 minutes)
const mfaSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Rate Limited', message: 'Too many MFA verification attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit MFA login verification (5 attempts per 15 minutes, separate from setup)
const mfaLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Rate Limited', message: 'Too many MFA login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/auth/mfa/setup
 * Begin MFA setup: generate TOTP secret and QR code
 * Requires: Authenticated user without MFA already enabled
 */
router.post('/setup', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA is already enabled. Disable it first to reconfigure.',
      });
    }

    // Generate TOTP secret
    const { secret, otpauthUrl } = generateMfaSecret(user.email);

    // Generate QR code data URL
    const qrCodeUrl = await generateQrCode(otpauthUrl);

    // Store secret temporarily (mfaEnabled stays false until verified)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    return res.status(200).json({
      message: 'MFA setup initiated. Scan the QR code with your authenticator app.',
      qrCodeUrl,
      secret,
    });
  } catch (error) {
    logger.error('Error setting up MFA', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to set up MFA',
    });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Complete MFA setup: verify TOTP token and generate backup codes
 * Requires: Authenticated user with pending MFA secret
 */
router.post('/verify', authenticated, mfaSetupLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'A 6-digit TOTP token is required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mfaSecret: true, mfaEnabled: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    if (user.mfaEnabled) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA is already enabled',
      });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA setup has not been initiated. Call /api/auth/mfa/setup first.',
      });
    }

    // Verify the TOTP token
    const isValid = verifyTotpToken(user.mfaSecret, token);

    if (!isValid) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid TOTP code. Please try again with a fresh code from your authenticator app.',
      });
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await hashBackupCodes(backupCodes);

    // Enable MFA and store hashed backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: hashedCodes,
      },
    });

    return res.status(200).json({
      message: 'MFA enabled successfully. Save your backup codes - they will only be shown once.',
      backupCodes,
    });
  } catch (error) {
    logger.error('Error verifying MFA setup', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify MFA setup',
    });
  }
});

/**
 * POST /api/auth/mfa/verify-login
 * Verify MFA during login flow (TOTP token or backup code)
 * No auth middleware - uses mfaPending session state
 * 5 attempts then temporary lockout
 */
router.post('/verify-login', mfaLoginLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check for pending MFA session
    if (!req.session.mfaPending || !req.session.mfaPendingUserId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No pending MFA verification. Please login first.',
      });
    }

    const { token, backupCode } = req.body;
    const userId = req.session.mfaPendingUserId;

    if (!token && !backupCode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Either a TOTP token or backup code is required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      // Clear invalid pending state
      req.session.mfaPending = undefined;
      req.session.mfaPendingUserId = undefined;
      req.session.mfaRememberMe = undefined;
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'MFA verification failed. Please login again.',
      });
    }

    let verified = false;
    let usedBackupCode = false;
    let remainingBackupCodes = user.mfaBackupCodes.length;

    if (token) {
      // Verify TOTP token
      verified = verifyTotpToken(user.mfaSecret, token);
    } else if (backupCode) {
      // Verify backup code
      const matchIndex = await verifyBackupCode(backupCode, user.mfaBackupCodes);
      if (matchIndex >= 0) {
        verified = true;
        usedBackupCode = true;

        // Remove the used backup code
        const updatedCodes = [...user.mfaBackupCodes];
        updatedCodes.splice(matchIndex, 1);
        await prisma.user.update({
          where: { id: userId },
          data: { mfaBackupCodes: updatedCodes },
        });

        remainingBackupCodes = updatedCodes.length;
      }
    }

    if (!verified) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid MFA code. Please try again.',
      });
    }

    // MFA verified - promote session to fully authenticated
    const rememberMe = req.session.mfaRememberMe;

    // Clear MFA pending state
    req.session.mfaPending = undefined;
    req.session.mfaPendingUserId = undefined;
    req.session.mfaRememberMe = undefined;

    // Set authenticated session fields
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.platformRole = user.platformRole;

    // Apply remember me if requested
    if (rememberMe) {
      req.session.cookie.maxAge = rememberMeMaxAge;
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const response: Record<string, unknown> = {
      message: 'MFA verification successful',
      user: sanitizeUser(user),
      mustChangePassword: user.mustChangePassword,
    };

    // Warn if backup codes are running low
    if (usedBackupCode) {
      response.backupCodeUsed = true;
      response.remainingBackupCodes = remainingBackupCodes;
      if (remainingBackupCodes <= 3) {
        response.warning = `Only ${remainingBackupCodes} backup code(s) remaining. Please regenerate your backup codes.`;
      }
    }

    return res.status(200).json(response);
  } catch (error) {
    logger.error('Error verifying MFA login', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify MFA',
    });
  }
});

/**
 * POST /api/auth/mfa/disable
 * Disable MFA (requires current password + TOTP code)
 * Admin accounts cannot disable MFA
 */
router.post('/disable', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Both current password and TOTP code are required',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    if (!user.mfaEnabled) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA is not enabled',
      });
    }

    // Admin accounts cannot disable MFA
    if (user.platformRole === 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin accounts cannot disable MFA. MFA is required for all administrators.',
      });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid password',
      });
    }

    // Verify TOTP token
    if (!user.mfaSecret || !verifyTotpToken(user.mfaSecret, token)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid TOTP code',
      });
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

    return res.status(200).json({
      message: 'MFA has been disabled successfully',
    });
  } catch (error) {
    logger.error('Error disabling MFA', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to disable MFA',
    });
  }
});

/**
 * POST /api/auth/mfa/backup-codes
 * Regenerate backup codes (requires password for re-authentication)
 * POST /api/auth/mfa/backup-codes
 */
router.post('/backup-codes', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Current password is required to regenerate backup codes',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, mfaEnabled: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    if (!user.mfaEnabled) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'MFA is not enabled. Enable MFA first.',
      });
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid password',
      });
    }

    // Generate new backup codes
    const backupCodes = generateBackupCodes(10);
    const hashedCodes = await hashBackupCodes(backupCodes);

    // Replace old codes with new ones
    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: hashedCodes },
    });

    return res.status(200).json({
      message: 'Backup codes regenerated. Save these codes - they will only be shown once.',
      backupCodes,
    });
  } catch (error) {
    logger.error('Error regenerating backup codes', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to regenerate backup codes',
    });
  }
});

export default router;
