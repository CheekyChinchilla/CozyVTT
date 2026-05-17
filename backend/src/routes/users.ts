import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { sanitizeUser, hashPassword } from '../services/auth';
import { validateEmail, sanitizeInput } from '../utils/validation';
import { isSmtpConfigured, sendPasswordResetEmail } from '../services/email';
import { UpdateUserPreferencesSchema, type UserPreferences } from '../validators/userPreferences';
import crypto from 'crypto';

/**
 * User Management Routes
 * Per SOW Section 5.2: User Management Endpoints
 */

const router = Router();

/**
 * GET /api/users
 * List all users (Admin only)
 * Requires: Admin role
 */
router.get('/', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Sanitize all users before returning
    const sanitizedUsers = users.map((user) => sanitizeUser(user));

    return res.status(200).json({ users: sanitizedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
    });
  }
});

/**
 * GET /api/users/:id
 * Get specific user
 * Requires: Authentication (users can view their own profile, admins can view any)
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === 'ADMIN';

    // Check authorization: user can only view their own profile unless admin
    if (id !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this user',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Error fetching user:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user',
    });
  }
});

/**
 * PUT /api/users/:id
 * Update user profile
 * Requires: Authentication (users can update their own profile, admins can update any)
 * Allowed fields: displayName, email, avatarUrl
 * Admins can also update: platformRole
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === 'ADMIN';
    const { displayName, email, avatarUrl, platformRole, bio, globalAssetManager } = req.body;

    // Check authorization: user can only update their own profile unless admin
    if (id !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this user',
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Build update data
    const updateData: any = {};

    if (displayName !== undefined) {
      updateData.displayName = sanitizeInput(displayName);
    }

    if (email !== undefined) {
      // Validate email format
      if (!validateEmail(email)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
      }

      // Check if email is already taken by another user
      const emailExists = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          id: { not: id },
        },
      });

      if (emailExists) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Email already in use',
        });
      }

      updateData.email = email.toLowerCase();
    }

    if (avatarUrl !== undefined) {
      updateData.avatarUrl = avatarUrl;
    }

    if (bio !== undefined) {
      // bio: null clears it, string trims and caps at 500 chars
      updateData.bio = bio === null ? null : sanitizeInput(String(bio)).slice(0, 500);
    }

    // Only admins can update platformRole
    if (platformRole !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can update platform roles',
        });
      }

      // Validate platformRole
      if (platformRole !== 'ADMIN' && platformRole !== 'USER') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid platform role',
        });
      }

      updateData.platformRole = platformRole;
    }

    // Only admins can grant/revoke globalAssetManager
    if (globalAssetManager !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can update the global asset manager permission',
        });
      }

      if (typeof globalAssetManager !== 'boolean') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'globalAssetManager must be a boolean',
        });
      }

      updateData.globalAssetManager = globalAssetManager;
    }

    // Perform update
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      message: 'User updated successfully',
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update user',
    });
  }
});

/**
 * GET /api/users/:id/preferences
 * Returns the user's stored preferences blob (theme/font/dice color/etc.).
 * Returns an empty object if the user has not set any preferences yet —
 * frontend layers on top of system defaults.
 *
 * Auth: user can fetch own preferences; admins can fetch anyone's.
 */
router.get('/:id/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === 'ADMIN';

    if (id !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to view this user\'s preferences',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, preferences: true },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    const preferences = (user.preferences as UserPreferences | null) ?? {};
    return res.status(200).json({ preferences });
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user preferences',
    });
  }
});

/**
 * PUT /api/users/:id/preferences
 * Partial-merge update — accepts any subset of UserPreferences fields and
 * merges them into the existing preferences JSON. Returns the merged blob.
 *
 * Auth: user can update own preferences; admins can update anyone's
 * (matches existing PUT /:id pattern).
 */
router.put('/:id/preferences', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === 'ADMIN';

    if (id !== requestingUserId && !isAdmin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this user\'s preferences',
      });
    }

    const parsed = UpdateUserPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid preferences payload',
        details: parsed.error.flatten(),
      });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: { preferences: true },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    const current = (existing.preferences as UserPreferences | null) ?? {};
    const merged: UserPreferences = { ...current, ...parsed.data };

    const updated = await prisma.user.update({
      where: { id },
      data: { preferences: merged as any },
      select: { id: true, preferences: true },
    });

    return res.status(200).json({
      message: 'Preferences updated successfully',
      preferences: (updated.preferences as UserPreferences | null) ?? {},
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update user preferences',
    });
  }
});

/**
 * DELETE /api/users/:id
 * Delete user (Admin only)
 * Requires: Admin role
 * Note: This will cascade delete all related data (campaigns, memberships, etc.)
 */
router.delete('/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;

    // Prevent self-deletion
    if (id === requestingUserId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You cannot delete your own account',
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Count USER-scoped assets before deletion so the frontend can warn admins.
    // Assets with scope USER are owned by this user and will be orphaned on deletion.
    const userAssetCount = await prisma.asset.count({
      where: { uploadedById: id, scope: 'USER' },
    });

    // Delete user (cascades to related data)
    await prisma.user.delete({
      where: { id },
    });

    return res.status(200).json({
      message: 'User deleted successfully',
      deletedUserAssetCount: userAssetCount,
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete user',
    });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Admin can generate a temporary password for a user
 * Requires: Admin role
 * Returns: Temporary password (one-time display)
 */
router.post('/:id/reset-password', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Generate a secure temporary password
    const temporaryPassword = generateTemporaryPassword();

    // Hash the temporary password
    const passwordHash = await hashPassword(temporaryPassword);

    // Update user's password and set mustChangePassword flag
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    return res.status(200).json({
      message: 'Password reset successfully',
      temporaryPassword,
      mustChangePassword: true,
      notice: 'This temporary password will only be displayed once. The user will be required to change it on next login.',
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reset password',
    });
  }
});

/**
 * POST /api/users/:id/send-reset-link
 * Admin sends a password reset email link to a user.
 * Creates a PasswordResetToken and emails the link — SMTP must be configured.
 * Requires: Admin role
 */
router.post('/:id/send-reset-link', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isSmtpConfigured()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'SMTP is not configured on this instance. Configure SMTP in your .env to use this feature.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: id, used: false },
      data: { used: true },
    });

    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        userId: id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    await sendPasswordResetEmail(user.email, token, user.displayName);

    return res.status(200).json({
      message: `Password reset link sent to ${user.email}.`,
    });
  } catch (error) {
    console.error('Error sending password reset link:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to send password reset link',
    });
  }
});

/**
 * Generate a cryptographically random temporary password.
 * Format: XXXX-XXXX-XXXX-XXXX (16 alphanumeric chars + dashes).
 * The user is always required to change this on first login (mustChangePassword: true).
 */
function generateTemporaryPassword(): string {
  const randomBytes = crypto.randomBytes(16);
  const base64 = randomBytes.toString('base64');
  const cleaned = base64.replace(/[+/=]/g, '');
  return cleaned.substring(0, 16).match(/.{1,4}/g)?.join('-') || cleaned.substring(0, 16);
}

export default router;
