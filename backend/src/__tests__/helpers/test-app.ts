/**
 * Test App Factory
 *
 * Creates an Express app for integration tests that matches the real server
 * everywhere it can. It deliberately differs in exactly three ways:
 *
 * - **No setup-wizard gate.** `requireSetupComplete` would block every route.
 * - **Memory session store**, so tests need no PostgreSQL session table.
 * - **No rate limiters.** A suite makes hundreds of requests from one address
 *   and would trip them; the limiters have their own tests in
 *   `rateLimiters.test.ts`.
 *
 * Everything else — the body parsers, the error handler, the routers and the
 * 404 — is imported from the same place the server gets it. That is not tidiness:
 * this file used to configure its own body parser at Express's 100kb default
 * while the server allowed more, so no test could reach the code paths a large
 * request takes, and it had no error handler at all, falling through to
 * Express's HTML stack-trace page instead of the JSON clients expect. A
 * body-size bug shipped through that gap. Do not reintroduce a local copy of
 * anything the server configures.
 */

import express from 'express';
import session from 'express-session';
import { bodyParsers } from '../../middleware/bodyParsers';
import { errorHandler } from '../../middleware/errorHandler';
import authRoutes from '../../routes/auth';
import campaignRoutes from '../../routes/campaigns';
import characterRoutes from '../../routes/characters';
import characterTemplateRoutes from '../../routes/characterTemplates';
import assetRoutes from '../../routes/assets';
import creatureRoutes from '../../routes/creatures';
import userRoutes from '../../routes/users';
import mapRoutes from '../../routes/maps';

export function createTestApp(): express.Express {
  const app = express();

  app.use(bodyParsers());

  // Memory store — no PostgreSQL needed for tests
  app.use(
    session({
      secret: 'test-secret-do-not-use-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  // Health check
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
  });

  // Routes (no requireSetupComplete wrapping)
  app.use('/api/auth', authRoutes);
  app.use('/api/campaigns', campaignRoutes);
  // Mounted separately in server.ts too — the creature routes hang off a
  // campaign path rather than the campaigns router, so they need their own line.
  app.use('/api/campaigns/:campaignId/creatures', creatureRoutes);
  app.use('/api/campaigns/:campaignId/maps', mapRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/character-templates', characterTemplateRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/assets', assetRoutes);

  // Catch-all 404
  app.use('*', (_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  app.use(errorHandler);

  return app;
}
