// CRITICAL: Load environment variables FIRST before any imports that use them
import './config/loadEnvFile';

import { createServer } from 'http';
import { sessionConfig, sessionPool } from './config/session';
import { enforceDatabaseCredential } from './config/databaseGuard';
import { createApp } from './app';
import { initializeWebSocket } from './websocket';
import logger from './utils/logger';
import { prisma } from './config/database';
import { UPLOAD_LIMITS } from './utils/fileUtils';
import { getProxyLimitWarnings } from './utils/proxyLimits';
import { applyRequestTimeouts } from './config/httpServer';
import { createShutdown, onShutdownSignals, onProcessFailure } from './utils/shutdown';
import { setupState } from './services/systemSettings';
import { removeLeftoverRestoreUploads } from './services/restoreState';
import { resolveBackupDir } from './utils/backupDir';
import { setupTokenHint } from './services/setupToken';
import { backupsInProgress } from './services/backupsInProgress';
import { personalFilesBeingRemoved } from './services/accountDeletion';
import { makeDummyPasswordHash } from './services/auth';

// An error nothing caught is written to the log before the process ends.
onProcessFailure();

// A production instance on the placeholder database password stops here.
enforceDatabaseCredential();

// Every middleware, route and error handler, in order: see app.ts. The
// integration tests build their app with the same function.
const app = createApp({ session: sessionConfig });
const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// ============================================
// WEBSOCKET
// ============================================

const io = initializeWebSocket(httpServer);

// Docker's stop, a service manager's stop and Ctrl+C all end the backend
// here, which lets a backup being written finish, then closes the sockets,
// lets the removal of a deleted account's files finish, and closes the
// database and the session store.
onShutdownSignals(createShutdown({ io, prisma, sessionPool, backups: backupsInProgress, files: personalFilesBeingRemoved }));

// ============================================
// START SERVER
// ============================================

// A large import or restore streamed through nginx can take longer than
// Node's default five minutes to arrive; see config/httpServer.ts.
applyRequestTimeouts(httpServer);

// Started before the server listens, so the first sign-ins for unknown
// emails find it made or being made; see services/auth.ts.
void makeDummyPasswordHash();

httpServer.listen(PORT, () => {
  logger.info(`CozyVTT Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);

  const uploadLimits = Object.entries(UPLOAD_LIMITS)
    .map(([type, bytes]) => `${type} ${Math.round(bytes / (1024 * 1024))}MB`)
    .join(', ');
  logger.info(`Upload limits: ${uploadLimits}`);

  // A proxy body-size cap below the configured limits turns uploads into 413s
  // that never reach this process — surface it at startup rather than in a
  // bug report.
  for (const warning of getProxyLimitWarnings()) {
    logger.warn(warning);
  }

  // A backend stopped mid-restore left the uploaded backup in the backups
  // folder; nothing can finish restoring it now.
  void removeLeftoverRestoreUploads(resolveBackupDir());

  // Until setup has run, the wizard asks for a token only the owner can
  // read, so a stranger who finds the instance first cannot become its
  // administrator. Printed here, where the owner reads the log, unless they
  // set one themselves in .env.
  setupState()
    .then(({ setupCompleted }) => {
      if (setupCompleted) return;
      logger.warn(`Setup is not complete. ${setupTokenHint()}`);
    })
    .catch((err: unknown) => logger.error('Could not read the setup state at start', { err }));
});

export default app;
