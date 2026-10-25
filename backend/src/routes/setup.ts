import type {} from '../types/express';
import { Router, Request, Response } from 'express';
import { setupState } from '../services/systemSettings';
import { RegistrationError, answeredBusy } from '../services/auth';
import { clientUser } from './auth';
import { setUpInstance, SetupAlreadyRunError } from '../services/setup';
import { setupTokenMatches, setupTokenHint } from '../services/setupToken';
import { regenerateSession } from '../utils/session';
import { systemConfigFromSetupBody } from '../utils/setupConfig';
import { parseBody, RegisterBodySchema } from '../validators/auth';
import logger from '../utils/logger';
import { hashingPerAddress } from '../middleware/hashingPerAddress';

const router = Router();

/**
 * Setup Wizard Routes
 * Initial Setup & Onboarding
 * CRITICAL: These routes must be accessible even when setup is not complete
 */

/**
 * GET /api/setup/status
 * Check if setup wizard needs to be run
 * Public endpoint - no authentication required
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const state = await setupState();

    res.status(200).json({
      setupCompleted: state.setupCompleted,
      hasUsers: state.hasUsers,
      needsSetup: !state.setupCompleted,
    });
  } catch (error) {
    logger.error('Error checking setup status', { err: error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check setup status',
    });
  }
});

/**
 * POST /api/setup/init
 * Create the first administrator, apply the wizard's settings and mark setup
 * complete, in one transaction, then sign the administrator in.
 *
 * Public, so it asks for the setup token first: the one the backend printed
 * in its log at start, or SETUP_TOKEN. Until setup has run this route is the
 * way to become the instance's administrator, and a fresh instance is often
 * reachable from the internet before its owner opens the wizard.
 */
router.post('/init', hashingPerAddress, async (req: Request, res: Response) => {
  const raw: unknown = req.body;
  const given = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>).setupToken : undefined;
  if (!setupTokenMatches(given)) {
    // The start-up line is the only other place the token is printed, and it
    // is missing when the setup state could not be read then or when
    // LOG_LEVEL hid it. Written at the one level every setting shows, to the
    // log only: the answer below never carries the token. Once setup has run
    // the token has no use and a refusal says nothing; a setup state that
    // cannot be read counts as not run.
    const setupRun = await setupState().then((state) => state.setupCompleted, () => false);
    if (!setupRun) {
      logger.error(`The setup wizard was refused: the setup token was missing or wrong. ${setupTokenHint()}`);
    }
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Setup token is missing or wrong. Copy it from the backend log (docker compose logs backend), or from SETUP_TOKEN in .env if you set one.',
    });
  }

  const body = parseBody(RegisterBodySchema, req.body);
  if (!body.ok) {
    return res.status(400).json({ error: 'Validation Error', message: body.message });
  }

  try {
    const state = await setupState();
    if (state.setupCompleted) {
      return res.status(400).json({
        error: 'Setup Already Completed',
        message: 'System setup has already been completed',
      });
    }

    const user = await setUpInstance(body.data, systemConfigFromSetupBody(req.body));

    // Create the admin session on a fresh id (session fixation).
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.platformRole = user.platformRole;
    req.session.signedInAt = Date.now();

    return res.status(201).json({
      message: 'Setup completed successfully',
      user: await clientUser(user),
    });
  } catch (error) {
    if (answeredBusy(res, error)) return;
    if (error instanceof SetupAlreadyRunError) {
      // Another wizard submitted at the same moment got there first.
      return res.status(400).json({
        error: 'Setup Already Completed',
        message: 'System setup has already been completed',
      });
    }
    if (error instanceof RegistrationError) {
      return res.status(400).json({ error: 'Validation Error', message: error.message });
    }
    // Anything else is the server's; its text stays in the log.
    logger.error('Error during setup', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during setup',
    });
  }
});

export default router;
