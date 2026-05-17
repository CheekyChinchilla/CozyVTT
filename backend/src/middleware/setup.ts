import { Request, Response, NextFunction } from 'express';
import { isSetupCompleted } from '../services/systemSettings';

/**
 * Setup Wizard Middleware
 * Per SOW Section 12.1: Setup must run BEFORE any other routes
 * CRITICAL: Ensures system is properly initialized before use
 */

/**
 * Check if setup is completed
 * If not, return 403 with setup required message
 * Skips check for /api/setup/* routes
 */
export async function requireSetupComplete(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Skip setup check for setup routes themselves
  if (req.path.startsWith('/api/setup')) {
    return next();
  }

  // Skip setup check for health endpoint
  if (req.path === '/health') {
    return next();
  }

  try {
    const setupComplete = await isSetupCompleted();

    if (!setupComplete) {
      return res.status(403).json({
        error: 'Setup Required',
        message: 'System setup must be completed before accessing this resource',
        setupUrl: '/api/setup/status',
      });
    }

    next();
  } catch (error) {
    console.error('Error checking setup status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify setup status',
    });
  }
}
