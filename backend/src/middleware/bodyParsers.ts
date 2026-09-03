/**
 * Request body parsing.
 *
 * Lives here rather than inline in `server.ts` because the integration-test app
 * has to parse bodies exactly the way the real server does. It did not: the test
 * harness used `express.json()` at its 100kb default while the server allowed
 * more, so no test could reach the code paths a large request takes, and a
 * body-size defect shipped without a single test noticing.
 */

import express from 'express';

/**
 * Express defaults to 100kb, which is smaller than the largest thing the app
 * legitimately accepts. A personal note is capped at 100,000 *characters*, and
 * characters are not bytes: accented text, em-dashes and curly quotes take two
 * or three bytes each in UTF-8, so a note well inside its own limit was refused
 * by the parser — at about 70,000 characters of European text. The writer saw
 * "An unexpected error occurred" and their autosave quietly stopped.
 *
 * 1 MB covers 100,000 characters even at four bytes each, with room for the rest
 * of the body. This is a backstop against absurd payloads, not the real limit:
 * what keeps the notes table from filling up is the validator's character cap.
 */
export const MAX_REQUEST_BODY = '1mb';

/** The body parsers, in the order they must be mounted. */
export function bodyParsers(): express.RequestHandler[] {
  return [
    express.json({ limit: MAX_REQUEST_BODY }),
    express.urlencoded({ extended: true, limit: MAX_REQUEST_BODY }),
  ];
}
