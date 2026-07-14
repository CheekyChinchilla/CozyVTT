/**
 * WebSocket Test Server Factory
 *
 * Boots a real HTTP + Socket.io server with the production event handlers
 * (`registerEventHandlers`) and the same session-sharing mechanism as
 * production (`io.engine.use(sessionMiddleware)`), but with:
 * - A memory session store (no PostgreSQL session table needed)
 * - A test-only `/test/login-as` route that seeds `req.session.userId`
 *   directly, bypassing the real auth routes (rate limits, password
 *   hashing, MFA) — socket authentication only reads `session.userId`
 * - An ephemeral port so suites can run in parallel
 *
 * Tests written against this harness assert WIRE behavior (event names,
 * payloads, permission errors, persistence) rather than handler internals,
 * so they survive the planned events.ts split unchanged.
 */

import express from 'express';
import session from 'express-session';
import { createServer, Server as HTTPServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { AddressInfo } from 'net';
import request from 'supertest';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { registerEventHandlers } from '../../websocket/events';
import { setSocketInstance } from '../../websocket/utils';

export interface WsTestServer {
  httpServer: HTTPServer;
  io: IOServer;
  url: string;
  /** Create a session for the given user id and return its cookie header value. */
  loginAs(userId: string): Promise<string>;
  /** Connect a socket.io client carrying the given session cookie. Resolves on the server's 'connected' ack. */
  connectClient(cookie: string): Promise<ClientSocket>;
  /** Connect + emit 'authenticate' for a campaign. Resolves with the client on 'authenticated'. */
  connectAndAuth(cookie: string, campaignId: string): Promise<ClientSocket>;
  close(): Promise<void>;
}

export async function createWsTestServer(): Promise<WsTestServer> {
  const app = express();
  app.use(express.json());

  const sessionMiddleware = session({
    secret: 'ws-test-secret-do-not-use-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  });
  app.use(sessionMiddleware);

  // Test-only session bootstrap — see file header.
  app.post('/test/login-as', (req, res) => {
    (req.session as any).userId = req.body.userId;
    res.json({ ok: true });
  });

  const httpServer = createServer(app);
  const io = new IOServer(httpServer, {
    transports: ['websocket', 'polling'],
  });

  // Same session-sharing wiring as production (websocket/index.ts)
  io.engine.use((req: any, res: any, next: any) => {
    sessionMiddleware(req, res, next);
  });

  setSocketInstance(io);
  registerEventHandlers(io);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const url = `http://localhost:${port}`;

  const openClients: ClientSocket[] = [];

  async function loginAs(userId: string): Promise<string> {
    const res = await request(app).post('/test/login-as').send({ userId });
    const setCookie = res.headers['set-cookie'];
    if (!setCookie || setCookie.length === 0) {
      throw new Error('login-as did not set a session cookie');
    }
    return setCookie[0].split(';')[0];
  }

  function connectClient(cookie: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ioc(url, {
        transports: ['websocket'],
        extraHeaders: { cookie },
        forceNew: true,
        reconnection: false,
        timeout: 5000,
      });
      openClients.push(client);
      const timer = setTimeout(() => reject(new Error('connectClient: no "connected" ack within 5s')), 5000);
      client.on('connected', () => {
        clearTimeout(timer);
        resolve(client);
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async function connectAndAuth(cookie: string, campaignId: string): Promise<ClientSocket> {
    const client = await connectClient(cookie);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connectAndAuth: no "authenticated" within 5s')), 5000);
      client.once('authenticated', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('error', (err: { message: string }) => {
        clearTimeout(timer);
        reject(new Error(`authenticate rejected: ${err.message}`));
      });
      client.emit('authenticate', { campaignId });
    });
    return client;
  }

  async function close(): Promise<void> {
    for (const client of openClients) {
      client.disconnect();
    }
    io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  return { httpServer, io, url, loginAs, connectClient, connectAndAuth, close };
}

/** Wait for a single occurrence of an event, with timeout. */
export function waitForEvent<T = any>(client: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitForEvent: "${event}" not received within ${timeoutMs}ms`)),
      timeoutMs
    );
    client.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Assert an event is NOT received within a window. Resolves quietly after the
 * window; rejects if the event arrives. Keep the window short — it puts a
 * floor on test duration.
 */
export function expectNoEvent(client: ClientSocket, event: string, windowMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = (data: any) => {
      clearTimeout(timer);
      reject(new Error(`expectNoEvent: unexpectedly received "${event}": ${JSON.stringify(data)}`));
    };
    const timer = setTimeout(() => {
      client.off(event, handler);
      resolve();
    }, windowMs);
    client.once(event, handler);
  });
}
