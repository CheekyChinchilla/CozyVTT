/**
 * The last-resort error handler.
 *
 * Shared with the integration-test app so tests exercise the responses users
 * actually get. While it lived inline in `server.ts`, the test harness had no
 * error handler at all and fell back to Express's default — which answers with
 * an HTML stack trace, not the JSON every client here expects.
 */

import type express from 'express';
import { STATUS_CODES } from 'http';
import logger from '../utils/logger';

/**
 * Anything a route throws or rejects with reaches this, an Error or not:
 * Express 5 passes a rejected promise on too, and code may throw a string.
 */
export function errorHandler(
  err: unknown,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  // Body-parser reports an oversized body as 413 and malformed JSON as 400.
  // Reporting those as 500 blamed the server for something the caller could fix
  // and told them nothing useful — a note too large to save looked like a crash.
  // These two are translated, each to a message written here.
  //
  // Any other error answers 500 without its `err.message`: an error from any
  // library may carry a filesystem path, a connection string or an internal
  // id, and this handler is reachable by unauthenticated requests. The one
  // exception is an http-errors error (body-parser's own, such as its 415 for
  // a charset it cannot read): one with a 4xx `status` and `expose: true` is a
  // refusal its library wrote to be shown, and is answered with both. A bare
  // `status` is not enough, since a library is free to put its own numbering
  // in that field.
  const fields: object = typeof err === 'object' && err !== null ? err : {};
  const rawStatus = 'status' in fields ? fields.status : undefined;
  const parserType = 'type' in fields ? fields.type : undefined;
  const message = 'message' in fields && typeof fields.message === 'string' ? fields.message : String(err);
  const stack = 'stack' in fields && typeof fields.stack === 'string' ? fields.stack : undefined;
  const tooLarge = rawStatus === 413 || parserType === 'entity.too.large';
  const notJson = parserType === 'entity.parse.failed';
  const shown =
    !tooLarge && !notJson && 'expose' in fields && fields.expose === true &&
    typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus < 500
      ? rawStatus
      : undefined;

  if (tooLarge || notJson || shown !== undefined) {
    // The caller's mistake, not the server's, and never logged with its
    // message: the JSON parser's message quotes the text around the error,
    // which in a sign-in request is the password.
    logger.warn(shown === undefined ? 'Request body refused' : 'Request refused', {
      type: typeof parserType === 'string' ? parserType : undefined,
      status: tooLarge ? 413 : notJson ? 400 : shown,
      method: req.method,
      path: req.path,
    });
  } else {
    logger.error('Unhandled error', { message, stack });
  }

  // A route that failed part way through its answer: a second one cannot be
  // started, and Express's own handler ends the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (tooLarge) {
    res.status(413).json({
      error: 'Payload Too Large',
      message: 'That is too large to send in one request.',
    });
    return;
  }

  if (notJson) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'The request body was not valid JSON.',
    });
    return;
  }

  if (shown !== undefined) {
    res.status(shown).json({ error: STATUS_CODES[shown] ?? 'Bad Request', message });
    return;
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? message : 'An unexpected error occurred',
  });
}
