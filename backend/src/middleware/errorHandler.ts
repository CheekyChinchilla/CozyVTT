/**
 * The last-resort error handler.
 *
 * Shared with the integration-test app so tests exercise the responses users
 * actually get. While it lived inline in `server.ts`, the test harness had no
 * error handler at all and fell back to Express's default — which answers with
 * an HTML stack trace, not the JSON every client here expects.
 */

import type express from 'express';
import logger from '../utils/logger';

export function errorHandler(
  err: Error,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
): void {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  // Body-parser reports an oversized body as 413 and malformed JSON as 400.
  // Reporting those as 500 blamed the server for something the caller could fix
  // and told them nothing useful — a note too large to save looked like a crash.
  // Only these two are translated, and each to a message written here.
  //
  // Deliberately NOT forwarding `err.message` for anything else: an error from
  // any library may carry a filesystem path, a connection string or an internal
  // id, and this handler is reachable by unauthenticated requests. Nor is
  // `err.status` used as the response code — a library is free to put its own
  // numbering in that field, and `res.status()` throws on anything that is not a
  // valid code, from inside the handler that exists to stop things throwing.
  const rawStatus = 'status' in err ? (err as { status?: unknown }).status : undefined;
  const parserType = 'type' in err ? (err as { type?: unknown }).type : undefined;

  if (rawStatus === 413 || parserType === 'entity.too.large') {
    res.status(413).json({
      error: 'Payload Too Large',
      message: 'That is too large to send in one request.',
    });
    return;
  }

  if (parserType === 'entity.parse.failed') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'The request body was not valid JSON.',
    });
    return;
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
}
