// ============================================
// Admin: files in the uploads folder that no asset names
//
// Mounted under /api/admin beside routes/admin.ts. Platform ADMIN only.
// What counts as such a file, and why deleting re-checks each one, is in
// services/orphanedFiles.ts.
// ============================================

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { findOrphanedFiles, deleteOrphanedFiles, ORPHAN_MIN_AGE_MS } from '../services/orphanedFiles';
import { DeleteOrphanedFilesSchema } from '../validators/orphanedFiles';
import { writeAdminLog } from '../services/systemLog';
import logger from '../utils/logger';

const router = Router();

router.use('/orphaned-files', requireAuth, requireAdmin);

const MINIMUM_AGE_MINUTES = ORPHAN_MIN_AGE_MS / 60_000;

/**
 * GET /api/admin/orphaned-files
 * The files in the uploads folder's asset folders that no asset names and
 * that have not changed for an hour. Lists; deletes nothing.
 */
router.get('/orphaned-files', async (_req, res) => {
  try {
    const report = await findOrphanedFiles();
    return res.status(200).json({ ...report, minimumAgeMinutes: MINIMUM_AGE_MINUTES });
  } catch (error) {
    logger.error('Error listing leftover uploads', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to check the uploads folder' });
  }
});

/**
 * DELETE /api/admin/orphaned-files
 * Body: { paths: string[] }, as the report listed them. Each one is deleted
 * only if it is still a file no asset names; the rest are skipped.
 */
router.delete('/orphaned-files', async (req, res) => {
  const parsed = DeleteOrphanedFilesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues[0]?.message ?? 'List the files to delete in paths',
    });
  }
  try {
    const result = await deleteOrphanedFiles(parsed.data.paths);
    if (result.deleted.length > 0 || result.failed.length > 0) {
      await writeAdminLog(
        req.session.userId!,
        `Deleted ${result.deleted.length} leftover file${result.deleted.length === 1 ? '' : 's'} from the uploads folder`,
        result.failed.length > 0 ? 'WARNING' : 'INFO',
        { deleted: result.deleted.length, failed: result.failed.length, skipped: result.skipped.length }
      );
    }
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error deleting leftover uploads', { err: error });
    return res.status(500).json({ error: 'Internal Server Error', message: 'Failed to delete the files' });
  }
});

export default router;
