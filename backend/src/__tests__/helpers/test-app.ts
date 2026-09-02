/**
 * Test App Factory
 *
 * Creates a lightweight Express app for integration tests:
 * - No setup-wizard gate (requireSetupComplete bypassed)
 * - Memory session store (no PostgreSQL session table needed)
 * - All real route handlers and middleware
 */

import express from 'express';
import session from 'express-session';
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

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  return app;
}
