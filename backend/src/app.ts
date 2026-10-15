/**
 * The Express app: every middleware, route and error handler, in the order a
 * request meets them.
 *
 * server.ts builds the app here, gives it the real session store and starts
 * it. The integration tests build theirs here too
 * (src/__tests__/helpers/test-app.ts), so they drive the same headers, gates,
 * routes and order as the server, and differ only in what AppOptions lets
 * them change. The route inventory and limiter wiring tests read this app.
 */

import express, { type RequestHandler } from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { requireSetupComplete } from './middleware/setup';
import { requirePasswordChanged } from './middleware/passwordChange';
import { requireAdminMfa } from './middleware/adminMfa';
import { bodyParsers } from './middleware/bodyParsers';
import { originCheck } from './middleware/originCheck';
import { errorHandler } from './middleware/errorHandler';
import { refuseWhileDatabaseIsReplaced } from './middleware/restoreGate';
import setupRoutes from './routes/setup';
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import campaignMacroRoutes from './routes/campaignMacros';
import campaignDocumentRoutes from './routes/campaignDocuments';
import userRoutes from './routes/users';
import characterRoutes from './routes/characters';
import characterTemplateRoutes from './routes/characterTemplates';
import invitationRoutes from './routes/invitations';
import assetRoutes from './routes/assets';
import mapRoutes from './routes/maps';
import creatureRoutes from './routes/creatures';
import tokenTemplateRoutes from './routes/tokenTemplates';
import adminRoutes from './routes/admin';
import adminStorageRoutes from './routes/adminStorage';
import configRoutes from './routes/config';
import { prisma } from './config/database';
import { positiveIntegerFromEnv } from './config/env';

export interface AppOptions {
  /**
   * The sign-in session's settings. The server passes config/session.ts's,
   * which keep sessions in PostgreSQL.
   */
  session: session.SessionOptions;
  /**
   * The per-address limit on every /api request. Left out, one is made with
   * the server's settings (createGeneralApiLimiter); `false` mounts none, for
   * a test that sends hundreds of requests from one address.
   */
  generalApiLimiter?: RequestHandler | false;
  /**
   * Whether every route but /health and /api/setup waits for the setup
   * wizard. On unless `false`.
   */
  setupGate?: boolean;
}

/**
 * General API rate limiter, applied to all /api/* routes. Stricter
 * per-endpoint limiters (auth, file uploads) are applied inside each router.
 */
export function createGeneralApiLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: positiveIntegerFromEnv('RATE_LIMIT_MAX_REQUESTS', 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please slow down.' },
  });
}

export function createApp(options: AppOptions): express.Express {
  const app = express();

  // Trust the first proxy hop (Nginx).
  // Required so that:
  //   - express-rate-limit can read X-Forwarded-For for accurate IP identification
  //   - Session cookies are issued with secure:true when the request arrives over HTTPS
  //   - req.protocol reflects https rather than http
  // A count: Express compares it with the hop number itself. A list of
  // addresses or ranges would go through proxy-addr's range matching, which
  // had a published advisory before 2.0.8.
  app.set('trust proxy', 1);

  // ============================================
  // SECURITY MIDDLEWARE
  // ============================================

  // Helmet: sets secure HTTP response headers.
  //
  // These cover what this process answers, which in the production stack is
  // /api and /socket.io. The app page is served by the frontend container, so
  // its policy lives in frontend/security-headers.conf. The two describe the
  // same application and should be changed together; the page's is the wider of
  // the two, because it also covers the page's stylesheets, fonts and frames.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Required for Framer Motion / Tailwind inline styles
          imgSrc: ["'self'", 'data:', 'blob:'],    // Canvas exports and base64 avatars
          connectSrc: ["'self'", 'ws:', 'wss:'],   // WebSocket connections
          mediaSrc: ["'self'"],                     // Audio playback
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],               // Equivalent to X-Frame-Options: DENY
        },
      },
      crossOriginEmbedderPolicy: false, // Disabled: audio/canvas require cross-origin resource access
    })
  );

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    })
  );

  // A browser request from another site, a same-site page on another port
  // included, changes nothing. See middleware/originCheck.ts.
  app.use(originCheck);

  // ============================================
  // BODY PARSING
  // ============================================

  // See middleware/bodyParsers.ts for why the limit is what it is.
  app.use(bodyParsers());

  // ============================================
  // RESTORE GATE
  // ============================================

  // While a restore replaces the database every API request is refused, ahead
  // of the session lookup, which would wait behind the load. See
  // middleware/restoreGate.ts.
  app.use('/api', refuseWhileDatabaseIsReplaced);

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  app.use(session(options.session));

  // ============================================
  // SETUP WIZARD GATE
  // ============================================

  // Blocks all routes until the one-time setup wizard has been completed.
  // Exceptions: /health and /api/setup/* are always accessible.
  if (options.setupGate !== false) app.use(requireSetupComplete);

  // ============================================
  // ROUTES
  // ============================================

  // Health check — always accessible, no auth required, not rate-limited
  app.get('/health', async (_req, res) => {
    let dbStatus = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'healthy' : 'degraded';
    res.status(dbStatus === 'ok' ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        api: 'ok',
        database: dbStatus,
      },
    });
  });

  // Apply general rate limiter to all API routes
  const generalApiLimiter = options.generalApiLimiter ?? createGeneralApiLimiter();
  if (generalApiLimiter !== false) app.use('/api', generalApiLimiter);

  // Accounts flagged `mustChangePassword` (admin-created, or admin-reset) can do
  // nothing but change it until they do — see middleware/passwordChange.ts
  app.use('/api', requirePasswordChanged);

  // Administrators must use two-factor authentication: past the deadline an
  // admin without it can do nothing but set it up (middleware/adminMfa.ts).
  app.use('/api', requireAdminMfa);

  // Setup wizard (accessible before setup is complete)
  app.use('/api/setup', setupRoutes);

  // Public client configuration (upload limits)
  app.use('/api/config', configRoutes);

  // Authentication: login, register, password reset, MFA
  app.use('/api/auth', authRoutes);

  // User management
  app.use('/api/users', userRoutes);

  // Admin panel (requires ADMIN platform role)
  app.use('/api/admin', adminRoutes);
  app.use('/api/admin', adminStorageRoutes);

  // Campaigns
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/campaigns', campaignMacroRoutes);
  app.use('/api/campaigns', campaignDocumentRoutes);

  // Characters
  app.use('/api/characters', characterRoutes);
  // Distinct from GET /api/characters/templates/:system/:name, which serves the
  // hardcoded starter presets rather than these user-published ones.
  app.use('/api/character-templates', characterTemplateRoutes);

  // Campaign invitations
  app.use('/api/invitations', invitationRoutes);

  // Asset library
  app.use('/api/assets', assetRoutes);

  // Maps (nested under campaigns)
  app.use('/api/campaigns/:campaignId/maps', mapRoutes);

  // Creature Library (nested under campaigns)
  app.use('/api/campaigns/:campaignId/creatures', creatureRoutes);

  // Token Templates (nested under campaigns)
  app.use('/api/campaigns/:campaignId/token-templates', tokenTemplateRoutes);

  // Whatever no route above answered. Mounted without a path, which matches
  // every one.
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist',
    });
  });

  // ============================================
  // GLOBAL ERROR HANDLER
  // ============================================

  app.use(errorHandler);

  return app;
}
