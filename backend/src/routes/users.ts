import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import type { Prisma } from '@prisma/client';
import { toJson } from '../utils/prisma-json';
import { sanitizeUser, hashPassword, verifyPassword } from '../services/auth';
import { validateEmail, sanitizeInput } from '../utils/validation';
import { isSmtpConfigured, sendPasswordResetEmail, sendEmailChangedNotice } from '../services/email';
import { destroyUserLoginSessions } from '../services/sessionStore';
import { voidOutstandingResetLinks } from '../services/passwordResetTokens';
import { isOnlyAdmin } from '../services/platformAdmins';
import { endLiveSockets, announceRosterChange } from '../websocket/utils';
import { UpdateUserPreferencesSchema, type UserPreferences } from '../validators/userPreferences';
import { parseDisplayName } from '../validators/users';
import crypto from 'crypto';
import logger from '../utils/logger';
import { deleteAccount, runsCampaignsMessage } from '../services/accountDeletion';

/**
 * User Management Routes
 * User Management Endpoints
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
    logger.error('Error fetching users', { err: error });
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
    logger.error('Error fetching user', { err: error });
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
 * Changing your own email needs currentPassword; an admin changing someone
 * else's does not.
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.session.userId;
    const isAdmin = req.session.platformRole === 'ADMIN';
    const {
      displayName,
      email,
      avatarUrl,
      platformRole,
      bio,
      globalAssetManager,
      templateEditor,
      currentPassword,
    } = req.body;

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
    const updateData: Prisma.UserUpdateInput = {};

    if (displayName !== undefined) {
      const parsedName = parseDisplayName(displayName);
      if (!parsedName.ok) {
        return res.status(400).json({
          error: 'Bad Request',
          message: parsedName.message,
        });
      }
      updateData.displayName = parsedName.name;
    }

    // The previous address, when this request changes it.
    let emailChangedFrom: string | null = null;

    if (email !== undefined) {
      // Validate email format
      if (typeof email !== 'string' || !validateEmail(email)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid email format',
        });
      }

      const newEmail = email.toLowerCase();
      if (newEmail !== existingUser.email.toLowerCase()) {
        // Reset links go to this address, so moving it is as good as holding
        // the password. Someone changing their own confirms the password, and
        // before the address is looked up, so a stolen session cannot use this
        // to learn which addresses have accounts. An admin changing someone
        // else's has no password to give.
        if (id === requestingUserId) {
          if (typeof currentPassword !== 'string' || currentPassword === '') {
            return res.status(400).json({
              error: 'Validation Error',
              message: 'Enter your current password to change your email address',
            });
          }
          if (!(await verifyPassword(existingUser.passwordHash, currentPassword))) {
            return res.status(401).json({
              error: 'Authentication Failed',
              message: 'Current password is incorrect',
            });
          }
        }

        // Check if email is already taken by another user
        const emailExists = await prisma.user.findFirst({
          where: {
            email: newEmail,
            id: { not: id },
          },
        });

        if (emailExists) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Email already in use',
          });
        }

        updateData.email = newEmail;
        emailChangedFrom = existingUser.email;
      }
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

      // The instance must keep an admin (see services/platformAdmins).
      if (platformRole === 'USER' && existingUser.platformRole === 'ADMIN' && (await isOnlyAdmin(id))) {
        return res.status(409).json({
          error: 'Conflict',
          message: id === requestingUserId
            ? 'You are the only admin on this instance. Promote another user to admin before removing your own admin role.'
            : 'This is the only admin on this instance. Promote another user to admin first.',
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

    // Only admins can grant/revoke templateEditor
    if (templateEditor !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only admins can update the template editor permission',
        });
      }

      if (typeof templateEditor !== 'boolean') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'templateEditor must be a boolean',
        });
      }

      updateData.templateEditor = templateEditor;
    }

    // Perform update. A new address also voids every unused reset or
    // invitation link, in the same transaction, so a link already sent to the
    // old address cannot set the password afterwards.
    const updatedUser = emailChangedFrom === null
      ? await prisma.user.update({ where: { id }, data: updateData })
      : await prisma.$transaction(async (tx) => {
        const row = await tx.user.update({ where: { id }, data: updateData });
        await voidOutstandingResetLinks(id, tx);
        return row;
      });

    // Tell the old address, which is the one the owner still reads if the
    // change was not theirs. Best-effort: the change is made either way.
    if (emailChangedFrom !== null && isSmtpConfigured()) {
      try {
        await sendEmailChangedNotice(emailChangedFrom, updatedUser.email, updatedUser.displayName);
      } catch (err) {
        logger.error('Failed to send email-changed notice', { err, userId: id });
      }
    }

    // The session carries platformRole from the moment it was created and
    // nothing re-reads it, so a demotion would otherwise leave the person
    // holding admin until they signed out. Compared against what was stored, so
    // setting the role to what it already was signs nobody out.
    //
    // globalAssetManager and templateEditor are deliberately not session fields
    // and are read from the database where they are used, so changing one
    // already takes effect on the next request and needs no sign-out.
    if (updateData.platformRole !== undefined && updateData.platformRole !== existingUser.platformRole) {
      await destroyUserLoginSessions(id);
      await endLiveSockets(id, 'Your platform role changed. Sign in again.');
    }

    return res.status(200).json({
      message: 'User updated successfully',
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    logger.error('Error updating user', { err: error });
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
    logger.error('Error fetching user preferences', { err: error });
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
      data: { preferences: toJson(merged) },
      select: { id: true, preferences: true },
    });

    return res.status(200).json({
      message: 'Preferences updated successfully',
      preferences: (updated.preferences as UserPreferences | null) ?? {},
    });
  } catch (error) {
    logger.error('Error updating user preferences', { err: error });
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
    // They stay, owned by no one, which leaves them readable by admins alone.
    const userAssetCount = await prisma.asset.count({
      where: { uploadedById: id, scope: 'USER' },
    });

    // See services/accountDeletion.ts for what stays and what goes.
    const deletion = await deleteAccount(id);
    if (!deletion.deleted) {
      return res.status(409).json({
        error: 'Conflict',
        message: runsCampaignsMessage(deletion.runs, 'they'),
        campaigns: deletion.runs,
      });
    }
    const campaignIds = deletion.campaignIds;

    // The session outlives the row it refers to, and the guards read the
    // session, so it has to go too.
    await destroyUserLoginSessions(id);
    await endLiveSockets(id, 'Your account was deleted.');
    announceRosterChange(id, campaignIds, 'member.left');

    return res.status(200).json({
      message: 'User deleted successfully',
      deletedUserAssetCount: userAssetCount,
    });
  } catch (error) {
    logger.error('Error deleting user', { err: error });
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

    // A reset link issued before this would replace the temporary password.
    await voidOutstandingResetLinks(id);

    // End any sessions the user already has open — otherwise they keep full
    // access on the old session and the forced-change gate would only take
    // effect at their next login
    await destroyUserLoginSessions(id);
    await endLiveSockets(id, 'An administrator reset your password. Sign in again.');

    return res.status(200).json({
      message: 'Password reset successfully',
      temporaryPassword,
      mustChangePassword: true,
      notice: 'This temporary password will only be displayed once. The user will be required to change it on next login, and any active sessions have been signed out.',
    });
  } catch (error) {
    logger.error('Error resetting password', { err: error });
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
    await voidOutstandingResetLinks(id);

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
    logger.error('Error sending password reset link', { err: error });
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
