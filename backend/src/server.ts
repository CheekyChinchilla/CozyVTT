// CRITICAL: Load environment variables FIRST before any imports that use them
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { sessionConfig } from './config/session';
import { requireSetupComplete } from './middleware/setup';
import { requirePasswordChanged } from './middleware/passwordChange';
import setupRoutes from './routes/setup';
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import userRoutes from './routes/users';
import characterRoutes from './routes/characters';
import invitationRoutes from './routes/invitations';
import assetRoutes from './routes/assets';
import mapRoutes from './routes/maps';
import creatureRoutes from './routes/creatures';
import tokenTemplateRoutes from './routes/tokenTemplates';
import adminRoutes from './routes/admin';
import configRoutes from './routes/config';
import { initializeWebSocket } from './websocket';
import logger from './utils/logger';
import { prisma } from './config/database';
import { FILE_SIZE_LIMITS } from './utils/fileUtils';
import { getProxyLimitWarnings } from './utils/proxyLimits';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// Trust the first proxy hop (Nginx).
// Required so that:
//   - express-rate-limit can read X-Forwarded-For for accurate IP identification
//   - Session cookies are issued with secure:true when the request arrives over HTTPS
//   - req.protocol reflects https rather than http
app.set('trust proxy', 1);

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Helmet: sets secure HTTP response headers
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

// General API rate limiter — applied to all /api/* routes
// Stricter per-endpoint limiters (auth, file uploads) are applied inside each router
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '300'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded. Please slow down.' },
});

// ============================================
// BODY PARSING
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SESSION MANAGEMENT
// ============================================

app.use(session(sessionConfig));

// ============================================
// SETUP WIZARD GATE
// ============================================

// Blocks all routes until the one-time setup wizard has been completed.
// Exceptions: /health and /api/setup/* are always accessible.
app.use(requireSetupComplete);

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
app.use('/api', generalApiLimiter);

// Accounts flagged `mustChangePassword` (admin-created, or admin-reset) can do
// nothing but change it until they do — see middleware/passwordChange.ts
app.use('/api', requirePasswordChanged);

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

// Campaigns
app.use('/api/campaigns', campaignRoutes);

// Characters
app.use('/api/characters', characterRoutes);

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

// 404 catch-all
app.use('*', (_req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// ============================================
// WEBSOCKET
// ============================================

initializeWebSocket(httpServer);

// ============================================
// START SERVER
// ============================================

httpServer.listen(PORT, () => {
  logger.info(`CozyVTT Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);

  const uploadLimits = Object.entries(FILE_SIZE_LIMITS)
    .map(([type, bytes]) => `${type} ${Math.round(bytes / (1024 * 1024))}MB`)
    .join(', ');
  logger.info(`Upload limits: ${uploadLimits}`);

  // A proxy body-size cap below the configured limits turns uploads into 413s
  // that never reach this process — surface it at startup rather than in a
  // bug report.
  for (const warning of getProxyLimitWarnings()) {
    logger.warn(warning);
  }
});

export default app;
