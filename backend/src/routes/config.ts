import { Router, Request, Response } from 'express';
import { FILE_SIZE_LIMITS, MAX_UPLOAD_BYTES } from '../utils/fileUtils';

const router = Router();

/**
 * Public client configuration
 *
 * The SPA is built at image-build time, so anything baked into the bundle needs
 * a rebuild to change. Upload limits are served here instead, letting the
 * MAX_<TYPE>_SIZE_MB environment variables take effect with a restart.
 */

/**
 * GET /api/config
 * Returns the upload limits the server enforces.
 * Public endpoint — no authentication required, no sensitive values.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    uploadLimits: { ...FILE_SIZE_LIMITS },
    maxUploadBytes: MAX_UPLOAD_BYTES,
  });
});

export default router;
