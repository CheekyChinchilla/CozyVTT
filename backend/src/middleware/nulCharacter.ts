/**
 * Refuse a request holding U+0000, which PostgreSQL cannot store
 * (validators/nulCharacter.ts).
 *
 * Mounted once after the JSON body is parsed, for every request, and again
 * after each upload route has read its form, whose fields and file name
 * arrive only then. A refused upload's file is removed. The address is
 * checked as it was sent: `%00` is the only way U+0000 reaches a path or a
 * query string, since the server refuses the raw byte in a request line.
 *
 * A password is the one text left alone. It is never stored, only hashed or
 * checked against a hash, and 1.5.4 let any client set one holding the
 * character, so refusing it would lock such an account out of signing in
 * and of every page that asks for its password.
 */

import { promises as fs } from 'fs';
import type { NextFunction, Request, Response } from 'express';
import { holdsNulCharacter, NUL_REFUSAL } from '../validators/nulCharacter';
import logger from '../utils/logger';

/**
 * Every route that reads a password from its body, and the fields it reads.
 * Only these fields, at the top of the body, on these routes and methods, are
 * left out of the check, and only when they are text: anything nested, or
 * the same name on another route, is checked as the rest is, since a body's
 * other fields may be stored as they are sent. keepInStep.test.ts compares
 * this list with the fields the routes read.
 */
export const PASSWORD_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'POST /api/auth/login': ['password'],
  'POST /api/auth/register': ['password'],
  'POST /api/setup/init': ['password'],
  'POST /api/auth/reset-password': ['newPassword'],
  'POST /api/auth/change-password': ['currentPassword', 'newPassword'],
  'DELETE /api/auth/account': ['password'],
  'POST /api/auth/mfa/setup': ['password'],
  'POST /api/auth/mfa/disable': ['password'],
  'POST /api/auth/mfa/backup-codes': ['password'],
  'PUT /api/users/:id': ['currentPassword'],
};

/**
 * Each route above as Express matches a path: letters in either case, a
 * trailing slash or none, and a `:name` as one segment.
 */
const PASSWORD_ROUTES = Object.entries(PASSWORD_FIELDS).map(([route, fields]) => {
  const [method, routePath] = route.split(' ');
  const segments = routePath.split('/').map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return { method, pattern: new RegExp(`^${segments.join('/')}/?$`, 'i'), fields };
});

/** The body as checked: without the password fields of the route it is sent to, when they are text. */
function bodyToCheck(req: Request): unknown {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const route = PASSWORD_ROUTES.find((r) => r.method === req.method && r.pattern.test(req.path));
  if (!route) return body;
  return Object.fromEntries(Object.entries(body).filter(([key, value]) => !(route.fields.includes(key) && typeof value === 'string')));
}

export async function refuseNulCharacters(req: Request, res: Response, next: NextFunction): Promise<void> {
  const held =
    req.originalUrl.includes('%00') || holdsNulCharacter(bodyToCheck(req)) || holdsNulCharacter(req.file?.originalname);
  if (!held) {
    next();
    return;
  }
  if (req.file?.path) {
    await fs.rm(req.file.path, { force: true }).catch((err: unknown) => logger.warn('Could not remove a refused upload', { err }));
  }
  res.status(400).json({ error: 'Validation Error', message: NUL_REFUSAL });
}
