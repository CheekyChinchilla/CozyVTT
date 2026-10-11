// ============================================
// Admin Routes
//
// All routes require platform ADMIN role.
// ============================================

import crypto from 'crypto';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type { FileHandle } from 'fs/promises';
import path from 'path';
import multer from 'multer';
import archiver from 'archiver';
import { Router, type RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { errorCode, errorMessage, errorStderr } from '../utils/errors';
import {
  getSystemSettings,
  updateSystemSettings,
} from '../services/systemSettings';
import { sanitizeInput, validateEmail, isSameOriginPath } from '../utils/validation';
import { UpdateSystemSettingsSchema } from '../validators/systemSettings';
import { parseDisplayName, MAX_DISPLAY_NAME_LENGTH } from '../validators/users';
import { hashPassword, sanitizeUser } from '../services/auth';
import { isSmtpConfigured, sendTestEmail, sendWelcomeEmail, sendInvitationEmail } from '../services/email';
import { voidOutstandingResetLinks, issueResetToken } from '../services/passwordResetTokens';
import { writeAdminLog } from '../services/systemLog';
import { restartAdminMfaGrace } from '../services/adminMfaPolicy';
import { buildDumpArgs, buildRestoreArgs, prepareDumpForRestore, pgConnection, type PreparedDump } from '../utils/pgRestore';
import { UPLOAD_LIMITS } from '../utils/fileUtils';
import { sessionMaxAge, rememberMeMaxAge } from '../config/sessionDurations';
import { extractArchiveSafely, openArchiveFile, ArchiveRefusedError, ArchiveLimitError } from '../utils/archive';
import {
  startRestore,
  startReplacingDatabase,
  endRestore,
  restoreRunning,
  restoreUploadName,
  removeLeftoverRestoreUploads,
} from '../services/restoreState';
import { resolveBackupDir, ensureBackupDir } from '../utils/backupDir';
import { MULTIPART_FIELD_LIMITS } from '../utils/multipartLimits';
import { getSocketInstance } from '../websocket/utils';
import { clearAllState as clearAllCombatState } from '../websocket/initiativeState';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);
const UPLOADS_DIR = process.env.UPLOAD_DIR || 'uploads';
// Outside uploads/, which self-hosters are told to sync off-site as media. See utils/backupDir.ts.
const BACKUP_DIR = resolveBackupDir();
const BACKUP_FILENAME_RE = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?\.zip$/;

// Guards for restoring an uploaded backup archive (see utils/archive.ts).
// A full-instance backup legitimately bundles every uploaded file, but the
// upload itself is capped at 4 GB by multer and media compresses poorly, so a
// 10 GB decompressed ceiling comfortably fits real backups while stopping a
// zip bomb long before it can exhaust the disk.
const RESTORE_MAX_FILES = 100_000;
const RESTORE_MAX_TOTAL_BYTES = 10 * 1024 * 1024 * 1024;

/** A restore's upload whose name does not end in .zip. */
class NotAZipName extends Error {
  constructor() {
    super('Only .zip backup files are accepted');
  }
}

// Multer storage for restore uploads — saves the uploaded ZIP to BACKUP_DIR temporarily
const restoreStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureBackupDir(BACKUP_DIR)
      .then(() => cb(null, BACKUP_DIR))
      .catch((err) => cb(err, BACKUP_DIR));
  },
  filename: (_req, _file, cb) => {
    cb(null, restoreUploadName());
  },
});
const restoreUpload = multer({
  storage: restoreStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024, ...MULTIPART_FIELD_LIMITS }, // 4 GB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new NotAZipName());
    }
  },
});

const router = Router();

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// ============================================
// Helpers
// ============================================

/**
 * How long an invitation link stays valid. Longer than the 1-hour password
 * reset window on purpose — an invitation has to survive someone not checking
 * email over a weekend.
 */
const INVITE_EXPIRY_DAYS = 7;

/**
 * The address and display name a new account is made with, as Create User
 * and Invite User take them. The address is trimmed and lowercased, and one
 * holding `<` or `>` is refused rather than stripped, so the address checked
 * for a duplicate is the one stored and the one the email goes to. The name
 * is checked as sign-up checks it (parseDisplayName); with none given, it is
 * the part of the address before the @.
 */
function newAccountFields(
  email: unknown,
  displayName: unknown
): { ok: true; email: string; displayName: string } | { ok: false; message: string } {
  if (!email || typeof email !== 'string') return { ok: false, message: 'Email is required' };
  const address = email.trim().toLowerCase();
  if (!validateEmail(address) || /[<>]/.test(address)) return { ok: false, message: 'Invalid email address' };

  const given = displayName !== undefined && displayName !== null && !(typeof displayName === 'string' && displayName.trim() === '');
  const name = parseDisplayName(given ? displayName : address.split('@')[0].slice(0, MAX_DISPLAY_NAME_LENGTH));
  if (!name.ok) return { ok: false, message: name.message };
  return { ok: true, email: address, displayName: name.name };
}

/** A write refused because another account already has the address. */
function isAddressTaken(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const ADDRESS_TAKEN = { error: 'Conflict', message: 'Email is already in use' } as const;

function generateTemporaryPassword(): string {
  const bytes = crypto.randomBytes(16);
  const base64 = bytes.toString('base64');
  const cleaned = base64.replace(/[+/=]/g, '');
  const truncated = (cleaned + 'AAAAAAAAAAAAAAAA').slice(0, 16).toUpperCase();
  return `${truncated.slice(0, 4)}-${truncated.slice(4, 8)}-${truncated.slice(8, 12)}-${truncated.slice(12, 16)}`;
}

// ============================================
// GET /api/admin/stats
// Returns aggregate counts for the dashboard.
// ============================================
router.get('/stats', async (_req, res) => {
  try {
    const [
      userCount,
      campaignCount,
      activeCampaignCount,
      assetStats,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdownRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: 'ACTIVE' } }),
      prisma.asset.aggregate({ _sum: { fileSize: true } }),
      prisma.session.count({ where: { endedAt: null } }),
      prisma.session.count(),
      prisma.character.count(),
      prisma.map.count(),
      prisma.asset.groupBy({
        by: ['type'],
        _count: { id: true },
        _sum: { fileSize: true },
      }),
    ]);

    const assetBreakdown = assetBreakdownRaw.map((row) => ({
      type: row.type,
      count: row._count.id,
      sizeBytes: row._sum.fileSize ?? 0,
    }));

    return res.json({
      userCount,
      campaignCount,
      activeCampaignCount,
      totalStorageBytes: assetStats._sum.fileSize ?? 0,
      activeSessionCount,
      sessionCount,
      characterCount,
      mapCount,
      assetBreakdown,
    });
  } catch (error) {
    logger.error('Error fetching admin stats', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch stats' });
  }
});

// ============================================
// GET /api/admin/health
// Whether the database answers and the live-connection server is running,
// for the dashboard's status card. Answers 200 with each part's state; a
// request that cannot reach this route at all tells the card the API is down.
// ============================================
router.get('/health', async (_req, res) => {
  let database: 'ok' | 'error' = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.warn('Health check: the database did not answer', { err: error });
    database = 'error';
  }
  let websocket: 'ok' | 'error' = 'ok';
  let connections = 0;
  try {
    connections = getSocketInstance().engine.clientsCount;
  } catch {
    websocket = 'error';
  }
  return res.json({
    status: database === 'ok' && websocket === 'ok' ? 'healthy' : 'degraded',
    services: { api: 'ok', database, websocket },
    connections,
  });
});

// ============================================
// GET /api/admin/settings
// Returns current system settings.
// ============================================
router.get('/settings', async (_req, res) => {
  try {
    const settings = await getSystemSettings();
    return res.json({ settings });
  } catch (error) {
    logger.error('Error fetching system settings', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch settings' });
  }
});

// ============================================
// PUT /api/admin/settings
// Updates system settings.
// ============================================
router.put('/settings', async (req, res) => {
  const parsed = UpdateSystemSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return res.status(400).json({
      error: 'Validation Error',
      message: issue ? `${issue.path.join('.') || 'settings'}: ${issue.message}` : 'Invalid settings',
    });
  }
  try {
    const {
      instanceName, timezone, allowRegistration, requireAdminApproval,
      themeId, customThemeColors, fontId,
      customLogoUrl, customFaviconUrl, customMascotUrl,
    } = parsed.data;

    const updateData: Parameters<typeof updateSystemSettings>[0] = {};

    if (instanceName !== undefined) {
      updateData.instanceName = sanitizeInput(instanceName).slice(0, 100);
    }
    if (timezone !== undefined) {
      updateData.timezone = sanitizeInput(timezone).slice(0, 50);
    }
    if (allowRegistration !== undefined) {
      updateData.allowRegistration = allowRegistration;
    }
    if (requireAdminApproval !== undefined) {
      updateData.requireAdminApproval = requireAdminApproval;
    }
    if (themeId !== undefined) {
      updateData.themeId = themeId;
    }
    if (customThemeColors !== undefined) {
      updateData.customThemeColors = customThemeColors;
    }
    if (fontId !== undefined) {
      updateData.fontId = fontId;
    }
    // Branding images are files this instance serves. See isSameOriginPath.
    const branding = {
      customLogoUrl,
      customFaviconUrl,
      customMascotUrl,
    } satisfies Record<string, string | null | undefined>;
    for (const [field, value] of Object.entries(branding)) {
      if (value === undefined) continue;
      if (typeof value === 'string' && value !== '' && !isSameOriginPath(value)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `${field} must be a path served by this instance, such as /default-logo.png. Replace the images in frontend/public/ and rebuild to change the branding.`,
        });
      }
      const stored = typeof value === 'string' && value !== '' ? value : null;
      updateData[field as 'customLogoUrl' | 'customFaviconUrl' | 'customMascotUrl'] = stored;
    }

    const settings = await updateSystemSettings(updateData);

    await writeAdminLog(
      req.session.userId!,
      `Updated system settings: ${Object.keys(updateData).join(', ')}`,
      'INFO',
      { changes: updateData }
    );

    return res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    logger.error('Error updating system settings', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to update settings' });
  }
});

// ============================================
// POST /api/admin/users
// Creates a new user account with a temporary password.
// ============================================
router.post('/users', async (req, res) => {
  try {
    const { platformRole } = req.body;
    const fields = newAccountFields(req.body.email, req.body.displayName);
    if (!fields.ok) {
      return res.status(400).json({ error: 'Bad Request', message: fields.message });
    }

    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      return res.status(409).json(ADDRESS_TAKEN);
    }

    const role = platformRole === 'ADMIN' ? 'ADMIN' : 'USER';
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: fields.email,
          displayName: fields.displayName,
          passwordHash,
          platformRole: role,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      // Another request made an account with this address since the check.
      if (isAddressTaken(error)) return res.status(409).json(ADDRESS_TAKEN);
      throw error;
    }

    await writeAdminLog(
      req.session.userId!,
      `Created user ${user.email} with role ${role}`,
      'INFO',
      { targetUserId: user.id, role }
    );

    // Send the welcome email if SMTP is configured. Awaited, because whether it
    // succeeded decides if the admin needs to see the password at all.
    let emailSent = false;
    if (isSmtpConfigured()) {
      try {
        await sendWelcomeEmail(user.email, user.displayName, temporaryPassword);
        emailSent = true;
      } catch (err) {
        logger.error(`[admin] Failed to send welcome email to ${user.email}`, { err: err });
      }
    }

    return res.status(201).json({
      message: emailSent
        ? `User created. Sign-in details were emailed to ${user.email}.`
        : 'User created successfully',
      user: sanitizeUser(user),
      emailSent,
      // Withheld once the user has it by email — no reason for the admin to
      // hold a working credential for someone else's account
      ...(emailSent ? {} : { temporaryPassword }),
    });
  } catch (error) {
    logger.error('Error creating user', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create user' });
  }
});

// ============================================
// POST /api/admin/users/invite
// Creates an account with NO usable password and emails the new user a link to
// choose their own. Requires SMTP — the link is the only way into the account,
// so there is nothing to hand over manually.
// ============================================

router.post('/users/invite', async (req, res) => {
  try {
    if (!isSmtpConfigured()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message:
          'SMTP is not configured on this instance, so invitations cannot be emailed. Configure SMTP in your .env, or use Create User to generate a temporary password instead.',
      });
    }

    const { platformRole } = req.body;
    const fields = newAccountFields(req.body.email, req.body.displayName);
    if (!fields.ok) {
      return res.status(400).json({ error: 'Bad Request', message: fields.message });
    }

    const existing = await prisma.user.findUnique({ where: { email: fields.email } });
    if (existing) {
      return res.status(409).json(ADDRESS_TAKEN);
    }

    const role = platformRole === 'ADMIN' ? 'ADMIN' : 'USER';

    // The account is created with an unusable password: a hash of random bytes
    // that are discarded immediately. Nobody — including this admin — holds a
    // credential for it. The invitation token is the only way in.
    const unusablePassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(unusablePassword);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: fields.email,
          displayName: fields.displayName,
          passwordHash,
          platformRole: role,
          // The invitation link sets the password, so there is nothing to force
          // a change of afterwards
          mustChangePassword: false,
        },
      });
    } catch (error) {
      // Another request made an account with this address since the check.
      if (isAddressTaken(error)) return res.status(409).json(ADDRESS_TAKEN);
      throw error;
    }

    // Stored as its hash; the token itself goes only into the email.
    const token = await issueResetToken(user.id, INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const inviter = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { displayName: true },
    });

    try {
      await sendInvitationEmail(
        user.email,
        token,
        user.displayName,
        inviter?.displayName || 'An administrator',
        INVITE_EXPIRY_DAYS
      );
    } catch (err) {
      // The account exists but is unreachable without the emailed link, so roll
      // it back rather than leaving an unusable account behind
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      logger.error(`[admin] Failed to send invitation to ${user.email}`, { err });
      return res.status(502).json({
        error: 'Email Delivery Failed',
        message: 'The invitation could not be emailed, so the account was not created. Check your SMTP settings and try again.',
      });
    }

    await writeAdminLog(
      req.session.userId!,
      `Invited user ${user.email} with role ${role}`,
      'INFO',
      { targetUserId: user.id, role }
    );

    return res.status(201).json({
      message: `Invitation sent to ${user.email}`,
      user: sanitizeUser(user),
      expiresInDays: INVITE_EXPIRY_DAYS,
    });
  } catch (error) {
    logger.error('Error inviting user', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to invite user' });
  }
});

// ============================================
// POST /api/admin/users/:id/resend-invite
// Issues a fresh invitation link, invalidating any outstanding one.
// ============================================

router.post('/users/:id/resend-invite', async (req, res) => {
  try {
    if (!isSmtpConfigured()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'SMTP is not configured on this instance, so invitations cannot be emailed.',
      });
    }

    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // An invitation is for an account nobody has signed in to yet, as the
    // Admin Panel offers it. Anyone else has a password of their own, and a
    // reset link (POST /api/users/:id/send-reset-link) lasts an hour, not 7 days.
    if (user.lastLoginAt !== null) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'This account has already signed in, so there is no invitation to resend. Use Send reset link to email them a link to set a new password.',
      });
    }

    // Invalidate outstanding links so only the newest one works
    await voidOutstandingResetLinks(id);

    const token = await issueResetToken(id, INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const inviter = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { displayName: true },
    });

    await sendInvitationEmail(
      user.email,
      token,
      user.displayName,
      inviter?.displayName || 'An administrator',
      INVITE_EXPIRY_DAYS
    );

    await writeAdminLog(
      req.session.userId!,
      `Resent invitation to ${user.email}`,
      'INFO',
      { targetUserId: user.id }
    );

    return res.status(200).json({
      message: `Invitation resent to ${user.email}`,
      expiresInDays: INVITE_EXPIRY_DAYS,
    });
  } catch (error) {
    logger.error('Error resending invitation', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to resend invitation' });
  }
});

// ============================================
// POST /api/admin/users/:id/approve
// Approves a pending user account.
// ============================================
router.post('/users/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, isApproved: true },
    });

    if (!target) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    if (target.isApproved) {
      return res.status(400).json({ error: 'Bad Request', message: 'User is already approved' });
    }

    await prisma.user.update({
      where: { id },
      data: { isApproved: true },
    });

    await writeAdminLog(
      req.session.userId!,
      `Approved account for user ${target.email}`,
      'INFO',
      { targetUserId: id }
    );

    return res.json({ message: 'User account approved.' });
  } catch (error) {
    logger.error('Error approving user', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to approve user' });
  }
});

// ============================================
// POST /api/admin/users/:id/reset-mfa
// Resets MFA for a locked-out user (forces re-enrollment).
// ============================================
router.post('/users/:id/reset-mfa', async (req, res) => {
  try {
    const { id } = req.params;

    // Turning off one's own MFA asks for the current password and a code
    // (POST /api/auth/mfa/disable); a session alone must not get round that.
    if (id === req.session.userId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You cannot reset your own MFA from here. Use the two-factor settings on your profile, which ask for your password.',
      });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, mfaEnabled: true },
    });

    if (!target) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    if (!target.mfaEnabled) {
      return res.status(400).json({ error: 'Bad Request', message: 'MFA is not enabled for this user' });
    }

    await prisma.user.update({
      where: { id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });

    // The activity-log line for the reset; its time also starts the account's
    // 7 days to set MFA up again, should it be an administrator.
    await restartAdminMfaGrace({
      targetUserId: id,
      byUserId: req.session.userId!,
      level: 'WARNING',
      message: `Reset MFA for user ${target.email}`,
    });

    return res.json({ message: 'MFA has been reset. The user signs in with their password alone until they turn it on again; an administrator is asked to set it up again within 7 days.' });
  } catch (error) {
    logger.error('Error resetting MFA', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset MFA' });
  }
});

// ============================================
// GET /api/admin/activity
// Returns recent user registrations, game sessions, currently-online users,
// and the newest 100 lines of the activity log (SystemLog), each with the
// administrator who acted.
// Online users are queried from the connect-pg-simple session table.
// ============================================
router.get('/activity', async (_req, res) => {
  try {
    // Who is signed in, from the connect-pg-simple session table: one row per
    // user with their latest expiry, worked out by the database. Loading every
    // live session into Node and searching them per user grew with the table,
    // which a sign-in script could make very large.
    const rawSessions = await prisma.$queryRaw<{ userId: string; expire: Date }[]>`
      SELECT DISTINCT ON (sess->>'userId') sess->>'userId' AS "userId", expire
      FROM session
      WHERE expire > NOW() AND sess->>'userId' IS NOT NULL
      ORDER BY sess->>'userId', expire DESC
    `;
    const latestExpiry = new Map(rawSessions.map((s) => [s.userId, s.expire]));
    const onlineUserIds = [...latestExpiry.keys()];

    const [recentUsers, recentSessions, onlineUsersData, recentLogs] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          email: true,
          displayName: true,
          platformRole: true,
          mfaEnabled: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.session.findMany({
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: {
          campaign: {
            select: { id: true, name: true },
          },
        },
      }),
      onlineUserIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: onlineUserIds } },
            select: {
              id: true,
              email: true,
              displayName: true,
              platformRole: true,
              lastLoginAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          level: true,
          message: true,
          userId: true,
          context: true,
          createdAt: true,
        },
      }),
    ]);

    const onlineUsers = onlineUsersData.map((u) => ({
      ...u,
      sessionExpiry: latestExpiry.get(u.id) ?? null,
    }));

    // The administrator who wrote each line, looked up now: a line keeps only
    // the account's id, so one whose account has since been deleted, like the
    // instance's own lines, names no one (actor null).
    const actorIds = [...new Set(recentLogs.flatMap((log) => (log.userId ? [log.userId] : [])))];
    const actors = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const logs = recentLogs.map((log) => ({
      ...log,
      actor: (log.userId && actorById.get(log.userId)) || null,
    }));

    return res.json({ recentUsers, recentSessions, onlineUsers, recentLogs: logs });
  } catch (error) {
    logger.error('Error fetching admin activity', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch activity' });
  }
});

// ============================================
// GET /api/admin/config
// Returns read-only server configuration values
// (upload limits, session timeouts, SMTP status).
// ============================================
router.get('/config', (_req, res) => {
  return res.json({
    uploadLimits: { ...UPLOAD_LIMITS },
    sessionTimeoutMs: sessionMaxAge,
    rememberMeTimeoutMs: rememberMeMaxAge,
    smtp: {
      configured: isSmtpConfigured(),
      host: process.env.SMTP_HOST || null,
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || null,
      secure: process.env.SMTP_SECURE === 'true',
    },
  });
});

// ============================================
// POST /api/admin/smtp/test
// Sends a test email to the calling admin to verify SMTP.
// ============================================
router.post('/smtp/test', async (req, res) => {
  if (!isSmtpConfigured()) {
    return res.status(400).json({ error: 'Bad Request', message: 'SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.' });
  }

  try {
    const admin = await prisma.user.findUnique({
      where: { id: req.session.userId! },
      select: { email: true, displayName: true },
    });
    if (!admin) {
      return res.status(404).json({ error: 'Not Found', message: 'Admin user not found' });
    }

    await sendTestEmail(admin.email, admin.displayName);
    await writeAdminLog(req.session.userId!, `Sent SMTP test email to ${admin.email}`, 'INFO');

    return res.json({ message: `Test email sent to ${admin.email}` });
  } catch (error: unknown) {
    logger.error('SMTP test error', { err: error });
    return res.status(500).json({ error: 'SMTP Error', message: errorMessage(error) || 'Failed to send test email' });
  }
});

/**
 * pg_dump did not produce a dump. Carries only what is safe to log: the exec
 * error's own message repeats the command line, database URL and password
 * included.
 */
class DumpFailed extends Error {
  constructor(
    readonly code: string | undefined,
    readonly stderr: string | undefined
  ) {
    super('pg_dump failed');
  }
}

/** pg_dump could not be started at all: it is not installed where the backend runs. */
class ToolMissing extends Error {
  constructor(readonly tool: string) {
    super(`${tool} is not installed`);
  }
}

/**
 * The private temporary folder the dump is written into could not be made.
 * Its error can carry ENOENT too, which is why a missing tool is its own
 * error: the two need different fixes.
 */
class TempFolderUnusable extends Error {
  constructor(readonly code: string | undefined) {
    super('temporary folder unusable');
  }
}

const TOOL_MISSING_REPLY = {
  error: 'Tool Not Available',
  message: 'pg_dump is not installed. Rebuild the backend Docker image from the current source; its Dockerfile installs the PostgreSQL client tools.',
};

/** The backups folder refused a new backup (its owner or mode, a full disk). */
class BackupFolderUnusable extends Error {
  constructor(readonly code: string | undefined) {
    super('backups folder unusable');
  }
}

/** Errors that come from the filesystem refusing a folder or running out of room. */
const FOLDER_ERRORS = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOSPC', 'EDQUOT', 'ENOENT', 'ENOTDIR']);

/** A backups-folder failure as BackupFolderUnusable, anything else as it came. */
function inBackupsFolder(error: unknown): unknown {
  const code = errorCode(error);
  return code !== undefined && FOLDER_ERRORS.has(code) ? new BackupFolderUnusable(code) : error;
}

function backupFolderReply(what: string) {
  return {
    error: 'Backup Failed',
    message: `${what} in the backups folder (${BACKUP_DIR}). Check that it exists, that the backend's user owns it and can write to it, and that its disk has room.`,
  };
}

/**
 * What to do about a temporary folder a backup or restore could not use.
 * Under Docker it is inside the backend container, on the disk Docker keeps
 * its containers on, and TMPDIR in .env does not reach the container.
 */
const TEMP_FOLDER_ADVICE =
  'Check that it exists and that the backend can write to it. If it is full, free some space on the disk it is on (under Docker, the disk Docker keeps its containers on); on an install without Docker you can also set TMPDIR to a folder with more room.';

function tempFolderReply() {
  return {
    error: 'Backup Failed',
    message: `The backup could not use the temporary folder (${os.tmpdir()}). ${TEMP_FOLDER_ADVICE}`,
  };
}

/**
 * Write a backup ZIP into BACKUP_DIR: a pg_dump of the database (flags
 * explained in utils/pgRestore.ts), plus the uploaded files when asked. Create
 * Backup takes both; a restore takes the database alone as the copy that lets
 * it be undone. The ZIP is named by the second it was made, like every backup
 * the dashboard lists.
 */
/**
 * A backup name of its own, and the partial file to write it into. The name
 * is the second the backup was asked for; two asked for in the same second,
 * or a restore's safety copy taken in the second a backup was made, used to
 * be given the same name, and the later one silently replaced the earlier.
 * While the name is taken, `-2`, `-3` and so on follow it. A name is ours
 * once we hold its partial file, opened exclusively, and no finished backup
 * has it: a finished one is only ever renamed from a partial its writer held.
 */
async function openNewBackup(): Promise<{ filename: string; handle: FileHandle }> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  for (let n = 1; ; n++) {
    const filename = n === 1 ? `backup-${timestamp}.zip` : `backup-${timestamp}-${n}.zip`;
    const partialPath = path.join(BACKUP_DIR, filename + PARTIAL);
    let handle: FileHandle;
    try {
      // 'wx' refuses an existing file instead of truncating it. Readable by the
      // backend's own user alone: the archive holds every password hash, MFA
      // secret and backup code on the instance.
      handle = await fs.open(partialPath, 'wx', 0o600);
    } catch (error) {
      const code = errorCode(error);
      if (code === 'EEXIST') continue;
      throw inBackupsFolder(error);
    }
    if (await exists(path.join(BACKUP_DIR, filename))) {
      await handle.close();
      await fs.unlink(partialPath).catch(() => {});
      continue;
    }
    return { filename, handle };
  }
}

/**
 * Backups being written now, by name. Each is written to its name plus
 * PARTIAL, which the list never shows, and renamed once it is complete, so a
 * backup the backend is stopped partway through never appears as a backup.
 */
const backupsInProgress = new Set<string>();
const PARTIAL = '.partial';

const exists = (file: string) => fs.access(file).then(() => true, () => false);

async function writeBackupZip(dbUrl: string, withUploads: boolean): Promise<{ filename: string; sizeBytes: number }> {
  await ensureBackupDir(BACKUP_DIR).catch((error: unknown) => { throw inBackupsFolder(error); });
  const { filename, handle } = await openNewBackup();
  backupsInProgress.add(filename);
  const zipPath = path.join(BACKUP_DIR, filename);
  const partialPath = zipPath + PARTIAL;
  // The stream takes the handle over once it exists; until then a failure
  // has to close it here.
  let streamed = false;
  let dumpDir: string | null = null;

  try {
    // pg_dump creates its file with the default mode, which on a host without
    // Docker leaves the whole database readable by every local account for as
    // long as the backup runs. mkdtemp makes a folder only this user can open.
    try {
      dumpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-db-'));
    } catch (mkdtempError: unknown) {
      throw new TempFolderUnusable(errorCode(mkdtempError));
    }
    const sqlPath = path.join(dumpDir, 'database.sql');
    try {
      await execFileAsync('pg_dump', buildDumpArgs(dbUrl, sqlPath), { env: pgConnection(dbUrl).env });
    } catch (execError: unknown) {
      if (errorCode(execError) === 'ENOENT') throw new ToolMissing('pg_dump');
      throw new DumpFailed(errorCode(execError), errorStderr(execError));
    }

    await new Promise<void>((resolve, reject) => {
      streamed = true;
      const output = handle.createWriteStream();
      const archive = archiver('zip', { zlib: { level: 6 } });
      // Both ends can fail: the archive while reading, the file while
      // writing (a full disk). A stream error with nobody listening is an
      // uncaught exception, which exits the process mid-backup. Creating the
      // file on a full disk succeeds; running out of room shows up here.
      output.on('error', (error) => reject(inBackupsFolder(error)));
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      archive.file(sqlPath, { name: 'database.sql' });
      if (withUploads) {
        // Under an "uploads/" prefix, skipping the backups subdir older installs had there
        archive.directory(UPLOADS_DIR, 'uploads', (entry) => {
          return entry.name.startsWith('backups/') ? false : entry;
        });
      }
      archive.finalize();
    });

    // Complete: only now does it take a backup's name.
    await fs.rename(partialPath, zipPath).catch((error: unknown) => { throw inBackupsFolder(error); });
    const stat = await fs.stat(zipPath);
    return { filename, sizeBytes: stat.size };
  } catch (error) {
    if (!streamed) await handle.close().catch(() => {});
    await fs.unlink(partialPath).catch(() => {});
    throw error;
  } finally {
    backupsInProgress.delete(filename);
    if (dumpDir !== null) await fs.rm(dumpDir, { recursive: true, force: true }).catch(() => {});
  }
}


// ============================================
// POST /api/admin/backups
// Creates a full instance backup: pg_dump of the database + all uploaded
// files bundled into a single downloadable ZIP archive.
// Requires pg_dump, which the backend Dockerfiles install.
// ============================================
router.post('/backups', async (req, res) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Configuration Error', message: 'DATABASE_URL is not set' });
  }
  // A backup taken while a restore replaces the database would hold neither.
  if (restoreRunning()) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A restore is running. Make the backup once it has finished.',
    });
  }

  try {
    const { filename, sizeBytes } = await writeBackupZip(dbUrl, true);

    await writeAdminLog(req.session.userId!, `Created instance backup: ${filename}`, 'INFO', {
      filename,
      sizeBytes,
    });

    return res.status(201).json({ filename, sizeBytes, createdAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof ToolMissing) {
      return res.status(500).json(TOOL_MISSING_REPLY);
    }
    if (error instanceof TempFolderUnusable) {
      logger.error('Backup could not make its temporary folder', { code: error.code, tmpdir: os.tmpdir() });
      return res.status(500).json(tempFolderReply());
    }
    if (error instanceof BackupFolderUnusable) {
      logger.error('Backup could not be written to the backups folder', { code: error.code, dir: BACKUP_DIR });
      return res.status(500).json(backupFolderReply('The backup could not be written'));
    }
    if (error instanceof DumpFailed) {
      logger.error('pg_dump error', { stderr: error.stderr, code: error.code });
      return res.status(500).json({ error: 'Backup Failed', message: 'Database dump failed. Check server logs for details.' });
    }
    logger.error('Backup error', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create backup' });
  }
});

// ============================================
// GET /api/admin/backups
// Lists all available instance backups.
// ============================================
router.get('/backups', async (_req, res) => {
  try {
    await ensureBackupDir(BACKUP_DIR);
    const files = await fs.readdir(BACKUP_DIR);
    // A restore's upload waits here until the restore ends; with none running,
    // one still here was left by a backend stopped mid-restore.
    if (!restoreRunning()) await removeLeftoverRestoreUploads(BACKUP_DIR, files);
    // A partial file no backup here is writing was left by a backend stopped
    // partway through one; it can never be finished, and it is the size of a
    // backup.
    for (const f of files) {
      const name = f.endsWith(PARTIAL) ? f.slice(0, -PARTIAL.length) : null;
      if (name === null || !BACKUP_FILENAME_RE.test(name) || backupsInProgress.has(name)) continue;
      await fs.unlink(path.join(BACKUP_DIR, f))
        .then(() => logger.warn('Removed an unfinished backup left by a stopped backend', { file: f }))
        .catch(() => {});
    }
    const backups = await Promise.all(
      files
        .filter(f => BACKUP_FILENAME_RE.test(f))
        .map(async f => {
          const stat = await fs.stat(path.join(BACKUP_DIR, f));
          return { filename: f, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
        })
    );
    backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ backups });
  } catch (error) {
    // Not an empty list: that reads as every backup being gone.
    logger.error('Backups folder could not be read', { code: errorCode(error), dir: BACKUP_DIR });
    return res.status(500).json(backupFolderReply('The list of backups could not be read'));
  }
});

// ============================================
// GET /api/admin/backups/:filename/download
// Downloads a backup ZIP file.
// ============================================
router.get('/backups/:filename/download', async (req, res) => {
  const { filename } = req.params;

  if (!BACKUP_FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'Bad Request', message: 'Invalid backup filename' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  try {
    await fs.access(filepath);
  } catch {
    return res.status(404).json({ error: 'Not Found', message: 'Backup file not found' });
  }

  return res.download(filepath, filename);
});

// ============================================
// DELETE /api/admin/backups/:filename
// Deletes a backup file.
// ============================================
router.delete('/backups/:filename', async (req, res) => {
  const { filename } = req.params;

  if (!BACKUP_FILENAME_RE.test(filename)) {
    return res.status(400).json({ error: 'Bad Request', message: 'Invalid backup filename' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  try {
    await fs.unlink(filepath);
  } catch {
    return res.status(404).json({ error: 'Not Found', message: 'Backup file not found' });
  }

  await writeAdminLog(req.session.userId!, `Deleted backup: ${filename}`, 'INFO', { filename });
  return res.json({ message: 'Backup deleted' });
});

// ============================================
// POST /api/admin/backups/restore
// Restores the entire instance from an uploaded backup ZIP.
// The ZIP must contain database.sql (created by pg_dump --clean --if-exists)
// and optionally an uploads/ directory.
// WARNING: This overwrites the current database and copies the archive's
// uploaded files over the existing ones. A backup of the database as it was
// is written first, so the database half can be undone.
// ============================================
/**
 * The uploaded backup is saved into the backups folder before the route
 * runs, so a folder the backend cannot write to, or whose disk is full,
 * refuses it here. Say which folder, and that nothing changed.
 */
const takeRestoreUpload: RequestHandler = (req, res, next) => {
  restoreUpload.single('backup')(req, res, (error?: unknown) => {
    if (!error) return next();
    // The restore never started, so it ends here.
    endRestore();
    if (error instanceof NotAZipName) {
      return res.status(400).json({ error: 'Invalid Backup', message: 'Only .zip backup files are accepted. Nothing was changed.' });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Backup Too Large', message: 'The backup is larger than 4 GB, the most a restore accepts. Nothing was changed.' });
      }
      return res.status(400).json({ error: 'Invalid Backup', message: `The upload could not be read: ${error.message}. Nothing was changed.` });
    }
    const folderError = inBackupsFolder(error);
    if (!(folderError instanceof BackupFolderUnusable)) return next(error);
    logger.error('Uploaded backup could not be saved to the backups folder', { code: folderError.code, dir: BACKUP_DIR });
    const reply = backupFolderReply('The uploaded backup could not be saved');
    return res.status(500).json({ error: 'Restore Failed', message: `${reply.message} Nothing was changed.` });
  });
};

/**
 * One restore at a time (services/restoreState.ts), claimed before the
 * upload is taken: two at once each loaded their dump in turn and copied
 * their uploaded files over each other's. Released when the restore ends,
 * by takeRestoreUpload when the upload is refused and by the route otherwise.
 */
const oneRestoreAtATime: RequestHandler = (_req, res, next) => {
  if (!startRestore()) {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A restore is already running. Wait for it to finish, then try again if you still need to.',
    });
  }
  return next();
};

router.post('/backups/restore', oneRestoreAtATime, takeRestoreUpload, async (req, res) => {
  if (!req.file) {
    endRestore();
    return res.status(400).json({ error: 'Bad Request', message: 'No backup file provided' });
  }

  const uploadedZip = req.file.path;
  let tempDir: string | null = null;

  try {
    // The upload is a backup too, written by multer with the default mode;
    // close it to everyone but the backend's user before anything else.
    await fs.chmod(uploadedZip, 0o600);

    // The backup is unpacked, and the copy psql loads written, in a folder
    // only the backend's user can open: both are the whole database.
    // Nothing has changed until the safety copy: a temporary folder that
    // cannot be made, or fills while the backup is unpacked, says so.
    const tempFolderRefused = (error: unknown) => {
      logger.error('Restore could not use its temporary folder', { code: errorCode(error), tmpdir: os.tmpdir() });
      return res.status(500).json({
        error: 'Restore Failed',
        message: `The restore could not unpack the backup in the temporary folder (${os.tmpdir()}). ${TEMP_FOLDER_ADVICE} Nothing was changed.`,
      });
    };
    try {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-restore-'));
    } catch (error) {
      return tempFolderRefused(error);
    }

    // 1. Extract ZIP to temp directory.
    // openArchiveFile refuses a file that is not a ZIP, and one listing more
    // entries than a backup may hold, before reading its directory;
    // extractArchiveSafely rejects path-traversal (zip-slip) entries and caps
    // the total decompressed size (zip-bomb protection). Each refusal says why,
    // with 400, or 413 for a size limit.
    try {
      const directory = await openArchiveFile(uploadedZip, RESTORE_MAX_FILES);
      await extractArchiveSafely(directory, tempDir, {
        maxFiles: RESTORE_MAX_FILES,
        maxTotalBytes: RESTORE_MAX_TOTAL_BYTES,
      });
    } catch (error) {
      if (error instanceof ArchiveRefusedError) {
        logger.warn('Restore refused the uploaded backup', { reason: error.message });
        return res.status(error instanceof ArchiveLimitError ? 413 : 400).json({
          error: error instanceof ArchiveLimitError ? 'Backup Too Large' : 'Invalid Backup',
          message: `${error.message} Nothing was changed.`,
        });
      }
      const code = errorCode(error);
      if (code !== undefined && FOLDER_ERRORS.has(code)) return tempFolderRefused(error);
      throw error;
    }

    // 2. Validate the backup contains database.sql
    const sqlPath = path.join(tempDir, 'database.sql');
    try {
      await fs.access(sqlPath);
    } catch {
      return res.status(400).json({
        error: 'Invalid Backup',
        message: 'This file does not appear to be a valid CozyVTT backup (database.sql not found inside ZIP)',
      });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return res.status(500).json({ error: 'Configuration Error', message: 'DATABASE_URL is not set' });
    }

    // 3. Check the dump is a complete CozyVTT backup that runs nothing but
    // SQL, and write the copy psql loads: the schema is replaced first, and a
    // setting this server would reject (a dump written by a newer pg_dump) is
    // dropped from the header. See utils/pgRestore.ts for why each matters.
    // A refused file has changed nothing, and no tool has run yet.
    const restorePath = path.join(tempDir, 'restore.sql');
    let prepared: PreparedDump;
    try {
      prepared = await prepareDumpForRestore(sqlPath, restorePath);
    } catch (error) {
      logger.error('Restore could not write the file psql loads', { code: errorCode(error), tmpdir: os.tmpdir() });
      return res.status(500).json({
        error: 'Restore Failed',
        message: `The restore could not write its working copy of the backup in the temporary folder (${os.tmpdir()}). ${TEMP_FOLDER_ADVICE} Nothing was changed.`,
      });
    }
    const { skipped, refused } = prepared;
    if (refused !== null) {
      return res.status(400).json({
        error: 'Invalid Backup',
        message: `This file cannot be restored because ${refused}. Nothing was changed.`,
      });
    }
    if (skipped.settings.length > 0 || skipped.ownership > 0 || skipped.privileges > 0) {
      logger.info('Restore: skipped statements this server would reject', skipped);
    }

    // 4. Keep the database as it is now, so the restore can be undone. A
    // backup that loads cleanly can still be the wrong one, or an empty one.
    let safetyBackup: string;
    try {
      safetyBackup = (await writeBackupZip(dbUrl, false)).filename;
    } catch (error) {
      if (error instanceof ToolMissing) {
        return res.status(500).json(TOOL_MISSING_REPLY);
      }
      if (error instanceof TempFolderUnusable) {
        logger.error('Backup before restore could not make its temporary folder', { code: error.code, tmpdir: os.tmpdir() });
        return res.status(500).json({ ...tempFolderReply(), message: `${tempFolderReply().message} Nothing was restored.` });
      }
      if (error instanceof BackupFolderUnusable) {
        logger.error('Backup before restore could not be written to the backups folder', { code: error.code, dir: BACKUP_DIR });
        const reply = backupFolderReply('A backup of the current database could not be written');
        return res.status(500).json({ error: 'Restore Failed', message: `${reply.message} Nothing was restored.` });
      }
      if (error instanceof DumpFailed) {
        logger.error('pg_dump error before restore', { stderr: error.stderr, code: error.code });
      } else {
        logger.error('Backup before restore failed', { err: error });
      }
      return res.status(500).json({
        error: 'Restore Failed',
        message: 'A backup of the current database could not be written, so nothing was restored. The reason is in the server log. If the database cannot be backed up as it is, the deployment guide shows how to restore this backup from the command line.',
      });
    }
    const undo = `The database as it was before is saved as ${safetyBackup} in the backup list.`;

    // 5. Load the prepared dump. One transaction, stopped at the first
    // failure, so a load that fails leaves the existing database as it was.
    //
    // Nothing else may act on the database while it is replaced: a write
    // waiting behind the load's locks would land on the restored rows. So
    // every live connection ends now, before the load, and until the restore
    // ends a new connection and every API request are refused
    // (services/restoreState.ts). Best-effort for the sockets: a socket layer
    // that is not up has none to end.
    startReplacingDatabase();
    try {
      const io = getSocketInstance();
      io.emit('error', { message: 'The instance is being restored from a backup. Sign in again once it has finished.' });
      io.disconnectSockets(true);
    } catch (error) {
      logger.warn('Restore: live sockets could not be ended', { err: error });
    }
    try {
      await execFileAsync('psql', buildRestoreArgs(dbUrl, restorePath), { env: pgConnection(dbUrl).env });
    } catch (execError: unknown) {
      if (errorCode(execError) === 'ENOENT') {
        return res.status(500).json({
          error: 'Tool Not Available',
          message: 'psql is not installed. Rebuild the backend Docker image from the current source; its Dockerfile installs the PostgreSQL client tools.',
        });
      }
      // stderr only: the error's message repeats the command line, database URL and password included.
      logger.error('psql restore error', { stderr: errorStderr(execError), code: errorCode(execError) });
      return res.status(500).json({
        error: 'Restore Failed',
        message: `Database restore failed and the existing database is unchanged. Check server logs for details. ${undo}`,
      });
    }

    // 6. The database is the backup's from here on, whatever the steps below
    // do. It holds no login sessions, so everyone signs in again; the live
    // connections ended before the load. The in-memory combat state belonged
    // to the old data.
    clearAllCombatState();

    // 7. Copy the archive's uploaded files over the existing ones. A backup
    // without any is fine; a copy that fails is not, and is reported after the
    // database side has been finished, so what was restored is usable.
    const extractedUploads = path.join(tempDir, 'uploads');
    const hasUploads = await fs.access(extractedUploads).then(() => true, () => false);
    let filesError: string | null = null;
    if (hasUploads) {
      try {
        await fs.cp(extractedUploads, UPLOADS_DIR, { recursive: true });
      } catch (error) {
        logger.error('Restore: copying uploaded files failed', { code: errorCode(error), err: error });
        filesError = errorCode(error) ?? 'unknown error';
      }
    }

    // 8. Bring a backup from an older release up to this version's schema.
    // start.sh runs the same command on every boot, so a failure here is
    // recovered by a restart, and the response says so.
    try {
      await execFileAsync('npx', ['prisma', 'migrate', 'deploy']);
    } catch (execError: unknown) {
      logger.error('Migrations after restore failed', { stderr: errorStderr(execError), code: errorCode(execError) });
      // TODO(restore): this return skips step 9, so a restore whose migrations
      // failed leaves no entry in the admin log although the database was
      // replaced. It should write the same best-effort entry before answering.
      return res.status(500).json({
        error: 'Restore Incomplete',
        message:
          'The backup was restored, but bringing its database up to this version failed. ' +
          'Restart the backend (docker compose restart backend), which runs migrations on start, then check the server logs. ' +
          (filesError
            ? `Copying the uploaded files failed too (${filesError}); once the backend is up, restore again or copy the archive's uploads folder in by hand. `
            : '') +
          undo,
      });
    }

    // 9. Log the restore (best-effort — DB just changed so this may use restored data)
    await writeAdminLog(req.session.userId!, 'Restored instance from backup', 'WARNING', { safetyBackup }).catch(() => {});

    if (filesError !== null) {
      return res.status(500).json({
        error: 'Restore Incomplete',
        message:
          `The database was restored and is up to date, but copying the uploaded files from the backup failed (${filesError}). ` +
          'Check that the uploads directory is writable and has room, then restore again, ' +
          `or copy the archive's uploads folder into it by hand. ${undo}`,
      });
    }

    return res.json({
      message: `Restore complete. ${undo} Your session is no longer valid — please refresh and log in again.`,
      safetyBackup,
    });
  } catch (error) {
    logger.error('Restore error', { err: error });
    return res.status(500).json({ error: 'Restore Failed', message: 'An unexpected error occurred during restore' });
  } finally {
    // The restore is over once it has answered; its files are removed after,
    // each under a name of its own.
    endRestore();
    // Always clean up temp files
    await fs.unlink(uploadedZip).catch(() => {});
    if (tempDir !== null) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
