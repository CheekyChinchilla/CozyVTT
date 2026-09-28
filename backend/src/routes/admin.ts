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
import unzipper from 'unzipper';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import { errorCode, errorMessage, errorStderr } from '../utils/errors';
import {
  getSystemSettings,
  updateSystemSettings,
} from '../services/systemSettings';
import { sanitizeInput, validateEmail, isSameOriginPath } from '../utils/validation';
import { hashPassword, sanitizeUser } from '../services/auth';
import { isSmtpConfigured, sendTestEmail, sendWelcomeEmail, sendInvitationEmail } from '../services/email';
import { buildDumpArgs, buildRestoreArgs, prepareDumpForRestore, pgConnection } from '../utils/pgRestore';
import { UPLOAD_LIMITS } from '../utils/fileUtils';
import { extractArchiveSafely } from '../utils/archive';
import { resolveBackupDir, ensureBackupDir } from '../utils/backupDir';
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

// Multer storage for restore uploads — saves the uploaded ZIP to BACKUP_DIR temporarily
const restoreStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureBackupDir(BACKUP_DIR)
      .then(() => cb(null, BACKUP_DIR))
      .catch((err) => cb(err, BACKUP_DIR));
  },
  filename: (_req, _file, cb) => {
    cb(null, `restore-temp-${Date.now()}.zip`);
  },
});
const restoreUpload = multer({
  storage: restoreStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB max
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip backup files are accepted'));
    }
  },
});

const router = Router();

// All admin routes require authentication + admin role
router.use(requireAuth, requireAdmin);

// ============================================
// Helpers
// ============================================

async function writeAdminLog(
  adminUserId: string,
  message: string,
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'INFO',
  context?: Prisma.InputJsonObject
): Promise<void> {
  try {
    await prisma.systemLog.create({
      data: {
        level,
        message,
        userId: adminUserId,
        context: context ?? Prisma.JsonNull,
      },
    });
  } catch (e) {
    logger.error('Failed to write system log', { err: e });
  }
}

/**
 * How long an invitation link stays valid. Longer than the 1-hour password
 * reset window on purpose — an invitation has to survive someone not checking
 * email over a weekend.
 */
const INVITE_EXPIRY_DAYS = 7;

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
  try {
    const {
      instanceName, timezone, allowRegistration, requireAdminApproval,
      themeId, customThemeColors, fontId,
      customLogoUrl, customFaviconUrl, customMascotUrl,
    } = req.body;

    const updateData: Parameters<typeof updateSystemSettings>[0] = {};

    if (typeof instanceName === 'string') {
      updateData.instanceName = sanitizeInput(instanceName).slice(0, 100);
    }
    if (typeof timezone === 'string') {
      updateData.timezone = sanitizeInput(timezone).slice(0, 50);
    }
    if (typeof allowRegistration === 'boolean') {
      updateData.allowRegistration = allowRegistration;
    }
    if (typeof requireAdminApproval === 'boolean') {
      updateData.requireAdminApproval = requireAdminApproval;
    }
    if (typeof themeId === 'string') {
      updateData.themeId = sanitizeInput(themeId).slice(0, 50);
    }
    if (customThemeColors !== undefined) {
      updateData.customThemeColors = customThemeColors;
    }
    if (typeof fontId === 'string') {
      updateData.fontId = sanitizeInput(fontId).slice(0, 50);
    }
    // Branding images are files this instance serves. See isSameOriginPath.
    const branding = {
      customLogoUrl,
      customFaviconUrl,
      customMascotUrl,
    } satisfies Record<string, unknown>;
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
    const { email, displayName, platformRole } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'Email is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid email address' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'Email is already in use' });
    }

    const role = platformRole === 'ADMIN' ? 'ADMIN' : 'USER';
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const rawName = typeof displayName === 'string' && displayName.trim()
      ? displayName
      : email.split('@')[0];

    const user = await prisma.user.create({
      data: {
        email: sanitizeInput(email).toLowerCase(),
        displayName: sanitizeInput(rawName).slice(0, 50),
        passwordHash,
        platformRole: role,
        mustChangePassword: true,
      },
    });

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

    const { email, displayName, platformRole } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Bad Request', message: 'Email is required' });
    }
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid email address' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: 'Email is already in use' });
    }

    const role = platformRole === 'ADMIN' ? 'ADMIN' : 'USER';
    const rawName = typeof displayName === 'string' && displayName.trim()
      ? displayName
      : email.split('@')[0];

    // The account is created with an unusable password: a hash of random bytes
    // that are discarded immediately. Nobody — including this admin — holds a
    // credential for it. The invitation token is the only way in.
    const unusablePassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(unusablePassword);

    const user = await prisma.user.create({
      data: {
        email: sanitizeInput(email).toLowerCase(),
        displayName: sanitizeInput(rawName).slice(0, 50),
        passwordHash,
        platformRole: role,
        // The invitation link sets the password, so there is nothing to force
        // a change of afterwards
        mustChangePassword: false,
      },
    });

    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

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

    // Invalidate outstanding links so only the newest one works
    await prisma.passwordResetToken.updateMany({
      where: { userId: id, used: false },
      data: { used: true },
    });

    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: {
        userId: id,
        token,
        expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
    });

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

    await writeAdminLog(
      req.session.userId!,
      `Reset MFA for user ${target.email}`,
      'WARNING',
      { targetUserId: id }
    );

    return res.json({ message: 'MFA has been reset. The user must re-enroll on next login.' });
  } catch (error) {
    logger.error('Error resetting MFA', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to reset MFA' });
  }
});

// ============================================
// GET /api/admin/activity
// Returns recent user registrations, game sessions, currently-online users,
// and recent admin action logs.
// Note: SystemLog table is written by admin actions. Activity tab now surfaces it.
// Online users are queried from the connect-pg-simple session table.
// ============================================
router.get('/activity', async (_req, res) => {
  try {
    // Query the connect-pg-simple session table for active sessions.
    // Only userId and expiry are extracted — no tokens or sensitive session data.
    const rawSessions = await prisma.$queryRaw<{ userId: string; expire: Date }[]>`
      SELECT sess->>'userId' AS "userId", expire
      FROM session
      WHERE expire > NOW() AND sess->>'userId' IS NOT NULL
    `;

    const onlineUserIds = [...new Set(rawSessions.map((s) => s.userId))];

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
      sessionExpiry: rawSessions.find((s) => s.userId === u.id)?.expire ?? null,
    }));

    return res.json({ recentUsers, recentSessions, onlineUsers, recentLogs });
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
    sessionTimeoutMs: parseInt(process.env.SESSION_MAX_AGE || '3600000'),
    rememberMeTimeoutMs: parseInt(process.env.REMEMBER_ME_MAX_AGE || '2592000000'),
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

/**
 * Write a backup ZIP into BACKUP_DIR: a pg_dump of the database (flags
 * explained in utils/pgRestore.ts), plus the uploaded files when asked. Create
 * Backup takes both; a restore takes the database alone as the copy that lets
 * it be undone. The ZIP is named by the second it was made, like every backup
 * the dashboard lists.
 */
/**
 * A backup file of its own, opened exclusively. The name is the second the
 * backup was asked for; two asked for in the same second, or a restore's
 * safety copy taken in the second a backup was made, used to be given the
 * same name, and the later one silently replaced the earlier. While the name
 * is taken, `-2`, `-3` and so on follow it.
 */
async function openNewBackup(): Promise<{ filename: string; handle: FileHandle }> {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  for (let n = 1; ; n++) {
    const filename = n === 1 ? `backup-${timestamp}.zip` : `backup-${timestamp}-${n}.zip`;
    try {
      // 'wx' refuses an existing file instead of truncating it. Readable by the
      // backend's own user alone: the archive holds every password hash, MFA
      // secret and backup code on the instance.
      const handle = await fs.open(path.join(BACKUP_DIR, filename), 'wx', 0o600);
      return { filename, handle };
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
  }
}

async function writeBackupZip(dbUrl: string, withUploads: boolean): Promise<{ filename: string; sizeBytes: number }> {
  await ensureBackupDir(BACKUP_DIR);
  const { filename, handle } = await openNewBackup();
  const zipPath = path.join(BACKUP_DIR, filename);
  const sqlPath = path.join(os.tmpdir(), `cozyvtt-db-${Date.now()}.sql`);
  // The stream takes the handle over once it exists; until then a failure
  // has to close it here.
  let streamed = false;

  try {
    try {
      await execFileAsync('pg_dump', buildDumpArgs(dbUrl, sqlPath), { env: pgConnection(dbUrl).env });
    } catch (execError: unknown) {
      if (errorCode(execError) === 'ENOENT') throw execError;
      throw new DumpFailed(errorCode(execError), errorStderr(execError));
    }

    await new Promise<void>((resolve, reject) => {
      streamed = true;
      const output = handle.createWriteStream();
      const archive = archiver('zip', { zlib: { level: 6 } });
      // Both ends can fail: the archive while reading, the file while
      // writing (a full disk). A stream error with nobody listening is an
      // uncaught exception, which exits the process mid-backup.
      output.on('error', reject);
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

    const stat = await fs.stat(zipPath);
    return { filename, sizeBytes: stat.size };
  } catch (error) {
    // Leave no partial ZIP behind: the dashboard would list it as a backup
    if (!streamed) await handle.close().catch(() => {});
    await fs.unlink(zipPath).catch(() => {});
    throw error;
  } finally {
    await fs.unlink(sqlPath).catch(() => {});
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

  try {
    const { filename, sizeBytes } = await writeBackupZip(dbUrl, true);

    await writeAdminLog(req.session.userId!, `Created instance backup: ${filename}`, 'INFO', {
      filename,
      sizeBytes,
    });

    return res.status(201).json({ filename, sizeBytes, createdAt: new Date().toISOString() });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return res.status(500).json({
        error: 'Tool Not Available',
        message: 'pg_dump is not installed. Rebuild the backend Docker image from the current source; its Dockerfile installs the PostgreSQL client tools.',
      });
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
  } catch {
    return res.json({ backups: [] });
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
router.post('/backups/restore', restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Bad Request', message: 'No backup file provided' });
  }

  const uploadedZip = req.file.path;
  const tempDir = path.join(os.tmpdir(), `cozyvtt-restore-${Date.now()}`);

  try {
    // The upload is a backup too, written by multer with the default mode;
    // close it to everyone but the backend's user before anything else.
    await fs.chmod(uploadedZip, 0o600);

    // 1. Extract ZIP to temp directory.
    // extractArchiveSafely rejects path-traversal (zip-slip) entries and caps
    // the entry count and total decompressed size (zip-bomb protection).
    const directory = await unzipper.Open.file(uploadedZip);
    await extractArchiveSafely(directory, tempDir, {
      maxFiles: RESTORE_MAX_FILES,
      maxTotalBytes: RESTORE_MAX_TOTAL_BYTES,
    });

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
    const { skipped, refused } = await prepareDumpForRestore(sqlPath, restorePath);
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
      if (errorCode(error) === 'ENOENT') {
        return res.status(500).json({
          error: 'Tool Not Available',
          message: 'pg_dump is not installed. Rebuild the backend Docker image from the current source; its Dockerfile installs the PostgreSQL client tools.',
        });
      }
      if (error instanceof DumpFailed) {
        logger.error('pg_dump error before restore', { stderr: error.stderr, code: error.code });
      } else {
        logger.error('Backup before restore failed', { err: error });
      }
      return res.status(500).json({
        error: 'Restore Failed',
        message: 'A backup of the current database could not be written, so nothing was restored. Check server logs for details.',
      });
    }
    const undo = `The database as it was before is saved as ${safetyBackup} in the backup list.`;

    // 5. Load the prepared dump. One transaction, stopped at the first
    // failure, so a load that fails leaves the existing database as it was.
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

    // 6. Copy the archive's uploaded files over the existing ones. A backup
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

    // 7. Bring a backup from an older release up to this version's schema.
    // start.sh runs the same command on every boot, so a failure here is
    // recovered by a restart, and the response says so.
    try {
      await execFileAsync('npx', ['prisma', 'migrate', 'deploy']);
    } catch (execError: unknown) {
      logger.error('Migrations after restore failed', { stderr: errorStderr(execError), code: errorCode(execError) });
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

    // 8. Everyone is signed out. The restored database holds no login
    // sessions, and a socket that stayed open would keep the identity and
    // campaign role it cached before the restore. Best-effort: the restore
    // itself is done. The in-memory combat state belonged to the old data.
    try {
      const io = getSocketInstance();
      io.emit('error', { message: 'The instance was restored from a backup. Sign in again.' });
      io.disconnectSockets(true);
    } catch (error) {
      logger.warn('Restore: live sockets could not be ended', { err: error });
    }
    clearAllCombatState();

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
    // Always clean up temp files
    await fs.unlink(uploadedZip).catch(() => {});
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

export default router;
