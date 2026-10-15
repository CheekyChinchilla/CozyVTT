import { z } from 'zod';
import { MAX_ORPHANS_PER_REQUEST } from '../services/orphanedFiles';

/** DELETE /api/admin/orphaned-files: the files to delete, as the report listed them. */
export const DeleteOrphanedFilesSchema = z.object({
  paths: z
    .array(z.string().min(1).max(1024), { error: 'List the files to delete in paths' })
    .min(1, 'List at least one file to delete')
    .max(MAX_ORPHANS_PER_REQUEST, `Delete at most ${MAX_ORPHANS_PER_REQUEST} files at a time`),
});
