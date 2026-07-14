// ============================================
// Admin Routes
//
// All routes require platform ADMIN role.
// ============================================

import crypto from 'crypto';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import multer from 'multer';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../config/database';
import {
  getSystemSettings,
  updateSystemSettings,
} from '../services/systemSettings';
import { sanitizeInput, validateEmail } from '../utils/validation';
import { hashPassword, sanitizeUser } from '../services/auth';
import { isSmtpConfigured, sendTestEmail, sendWelcomeEmail } from '../services/email';
import { FILE_SIZE_LIMITS } from '../utils/fileUtils';
import { extractArchiveSafely } from '../utils/archive';
import logger from '../utils/logger';

const execFileAsync = promisify(execFile);
const UPLOADS_DIR = process.env.UPLOAD_DIR || 'uploads';
const BACKUP_DIR = path.join(UPLOADS_DIR, 'backups');
const BACKUP_FILENAME_RE = /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/;

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
    fs.mkdir(BACKUP_DIR, { recursive: true })
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
    if (customLogoUrl !== undefined) {
      updateData.customLogoUrl = typeof customLogoUrl === 'string' ? customLogoUrl : null;
    }
    if (customFaviconUrl !== undefined) {
      updateData.customFaviconUrl = typeof customFaviconUrl === 'string' ? customFaviconUrl : null;
    }
    if (customMascotUrl !== undefined) {
      updateData.customMascotUrl = typeof customMascotUrl === 'string' ? customMascotUrl : null;
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

    // Send welcome email if SMTP is configured
    if (isSmtpConfigured()) {
      sendWelcomeEmail(user.email, user.displayName, temporaryPassword).catch((err) => {
        logger.error(`[admin] Failed to send welcome email to ${user.email}`, { err: err });
      });
    }

    return res.status(201).json({
      message: 'User created successfully',
      user: sanitizeUser(user),
      temporaryPassword,
    });
  } catch (error) {
    logger.error('Error creating user', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to create user' });
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
    uploadLimits: {
      MAP: FILE_SIZE_LIMITS.MAP,
      TOKEN: FILE_SIZE_LIMITS.TOKEN,
      AUDIO: FILE_SIZE_LIMITS.AUDIO,
      AVATAR: FILE_SIZE_LIMITS.AVATAR,
    },
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
  } catch (error: any) {
    logger.error('SMTP test error', { err: error });
    return res.status(500).json({ error: 'SMTP Error', message: error.message || 'Failed to send test email' });
  }
});

// ============================================
// POST /api/admin/backups
// Creates a full instance backup: pg_dump of the database + all uploaded
// files bundled into a single downloadable ZIP archive.
// Requires pg_dump (postgresql-client) to be installed in the container.
// ============================================
router.post('/backups', async (req, res) => {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Configuration Error', message: 'DATABASE_URL is not set' });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const zipFilename = `backup-${timestamp}.zip`;
  const zipPath = path.join(BACKUP_DIR, zipFilename);
  const sqlPath = path.join(os.tmpdir(), `cozyvtt-db-${Date.now()}.sql`);

  try {
    // 1. Dump database to a temp SQL file
    // --clean --if-exists adds DROP statements so the restore works on an existing DB
    try {
      await execFileAsync('pg_dump', ['--dbname', dbUrl, '--file', sqlPath, '--clean', '--if-exists']);
    } catch (execError: any) {
      if (execError.code === 'ENOENT') {
        return res.status(500).json({
          error: 'Tool Not Available',
          message: 'pg_dump is not installed. Rebuild the backend Docker image to include postgresql-client.',
        });
      }
      logger.error('pg_dump error:', execError.stderr || execError.message);
      return res.status(500).json({ error: 'Backup Failed', message: 'Database dump failed. Check server logs for details.' });
    }

    // 2. Bundle database.sql + uploads/ (excluding previous backups) into a ZIP
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      // Include the SQL dump
      archive.file(sqlPath, { name: 'database.sql' });
      // Include uploaded files under an "uploads/" prefix, skipping the backups subdir
      archive.directory(UPLOADS_DIR, 'uploads', (entry) => {
        return entry.name.startsWith('backups/') ? false : entry;
      });
      archive.finalize();
    });

    await fs.unlink(sqlPath).catch(() => {});

    const stat = await fs.stat(zipPath);
    await writeAdminLog(req.session.userId!, `Created instance backup: ${zipFilename}`, 'INFO', {
      filename: zipFilename,
      sizeBytes: stat.size,
    });

    return res.status(201).json({ filename: zipFilename, sizeBytes: stat.size, createdAt: new Date().toISOString() });
  } catch (error) {
    // Clean up partial output on failure
    await fs.unlink(zipPath).catch(() => {});
    await fs.unlink(sqlPath).catch(() => {});
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
    await fs.mkdir(BACKUP_DIR, { recursive: true });
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
// WARNING: This overwrites the current database and all uploaded files.
// ============================================
router.post('/backups/restore', restoreUpload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Bad Request', message: 'No backup file provided' });
  }

  const uploadedZip = req.file.path;
  const tempDir = path.join(os.tmpdir(), `cozyvtt-restore-${Date.now()}`);

  try {
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

    // 3. Restore the database
    try {
      await execFileAsync('psql', ['--dbname', dbUrl, '--file', sqlPath]);
    } catch (execError: any) {
      if (execError.code === 'ENOENT') {
        return res.status(500).json({
          error: 'Tool Not Available',
          message: 'psql is not installed. Rebuild the backend Docker image to include postgresql-client.',
        });
      }
      logger.error('psql restore error:', execError.stderr || execError.message);
      return res.status(500).json({ error: 'Restore Failed', message: 'Database restore failed. Check server logs for details.' });
    }

    // 4. Restore uploaded files (if present in backup)
    const extractedUploads = path.join(tempDir, 'uploads');
    try {
      await fs.access(extractedUploads);
      await fs.cp(extractedUploads, UPLOADS_DIR, { recursive: true });
    } catch {
      // No uploads dir in backup — skip (DB-only backup is still valid)
    }

    // 5. Log the restore (best-effort — DB just changed so this may use restored data)
    await writeAdminLog(req.session.userId!, 'Restored instance from backup', 'WARNING', {}).catch(() => {});

    return res.json({
      message: 'Restore complete. Your session is no longer valid — please refresh and log in again.',
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
