import { Router, Request, Response } from 'express';
import { UPLOAD_LIMITS, MAX_UPLOAD_BYTES } from '../utils/fileUtils';
import { isSmtpConfigured } from '../services/email';

const router = Router();

/**
 * Public client configuration
 *
 * The SPA is built at image-build time, so anything baked into the bundle needs
 * a rebuild to change. Upload limits are served here instead, letting the
 * MAX_<TYPE>_SIZE_MB environment variables take effect when the backend next
 * starts with them (under Docker, `docker compose up -d`: a restart keeps the
 * environment the container was created with).
 */

/**
 * GET /api/config
 * Returns the upload limits the server enforces, and whether this instance can
 * send email.
 * Public endpoint — no authentication required, no sensitive values.
 *
 * The SMTP entry is a bare boolean on purpose: host, port, user and TLS mode
 * stay on the admin-only /api/admin/config. A campaign DM is not necessarily a
 * platform admin, so without this they could not tell whether the "also email
 * them" option on an invitation would do anything at all.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    uploadLimits: { ...UPLOAD_LIMITS },
    maxUploadBytes: MAX_UPLOAD_BYTES,
    smtp: { configured: isSmtpConfigured() },
  });
});

export default router;
