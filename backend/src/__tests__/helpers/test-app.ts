/**
 * Test App Factory
 *
 * The app the integration tests drive, built by the server's own createApp
 * (src/app.ts): the same security headers, CORS, proxy setting, body parsers,
 * gates, routers, order, 404 and error handler. It differs in exactly three
 * ways, each an AppOptions setting:
 *
 * - **Sessions are kept in memory**, signed with a fixed test secret. Their
 *   behaviour and cookie are the server's (config/sessionOptions.ts).
 * - **No general request limit.** A suite makes hundreds of requests from one
 *   address and would trip it. The per-route limiters inside the routers stay;
 *   limiterWiring.e2e.test.ts and appAssembly.e2e.test.ts check both.
 * - **No setup-wizard gate.** The suites make their accounts in the database
 *   directly, on a database whose setup state they do not set. The setup
 *   routes themselves are mounted; setupWizard.e2e.test.ts covers the gate.
 *
 * This file used to configure its own copy of the server's app instead, and
 * every part the copy left out or set differently went untested: a body-size
 * bug shipped through its old 100kb parser, and the security headers and the
 * password-change gate were never checked. Do not set anything up here that
 * the server sets up in app.ts.
 */

import type express from 'express';
import { createApp } from '../../app';
import { sessionOptions } from '../../config/sessionOptions';

export function createTestApp(): express.Express {
  return createApp({
    session: { ...sessionOptions, secret: 'test-secret-do-not-use-in-production' },
    generalApiLimiter: false,
    setupGate: false,
  });
}
