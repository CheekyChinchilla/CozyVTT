import { Server } from 'socket.io';
import { Server as HTTPServer, IncomingMessage, ServerResponse } from 'http';
import type { Request, Response } from 'express';
import session from 'express-session';
import { sessionConfig } from '../config/session';
import { registerEventHandlers } from './events';
import { setSocketInstance } from './utils';
import logger from '../utils/logger';

/**
 * WebSocket Infrastructure Setup
 * WebSocket Event Specification
 *
 * Initializes Socket.io with CORS configuration, session sharing with Express,
 * event handlers, and heartbeat/ping-pong for connection health.
 */

/**
 * Initialize Socket.io server
 * @param httpServer - HTTP server instance
 * @returns Socket.io server instance
 */
export function initializeWebSocket(httpServer: HTTPServer): Server {
  logger.info('Initializing WebSocket server...');

  // Create Socket.io server with configuration
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true, // Allow cookies (session authentication)
    },
    // Heartbeat configuration
    pingInterval: 25000, // Send ping every 25 seconds
    pingTimeout: 60000, // Disconnect if no pong within 60 seconds
    // Connection settings
    transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to polling
  });

  // Share Express session with Socket.io
  // This allows Socket.io to access the same session store
  const sessionMiddleware = session(sessionConfig);
  // Engine.io hands its middleware the raw Node request/response, while
  // express-session is typed for Express's subclasses of those. The casts are
  // the honest description of that mismatch: express-session only touches the
  // members `IncomingMessage`/`ServerResponse` already have (headers, cookies
  // it parses itself, `end`), which is why sharing the middleware works at all.
  io.engine.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    sessionMiddleware(req as Request, res as Response, next);
  });

  // Store the Socket.io instance for utility functions
  setSocketInstance(io);

  // Register event handlers
  registerEventHandlers(io);

  logger.info('WebSocket server initialized');
  logger.info(`WebSocket CORS origin: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);

  return io;
}

export { Server } from 'socket.io';
