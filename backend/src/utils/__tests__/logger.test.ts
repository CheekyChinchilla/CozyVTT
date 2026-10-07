/**
 * What the backend logger writes.
 *
 * Almost every route logs a caught error as `{ err: error }`. An Error's
 * message and stack are not enumerable, so written out as JSON it became `{}`,
 * and the log files kept only the static label: "Error adding token" with no
 * reason. These tests read the lines a log file would hold.
 *
 * The same lines also carry what users typed and what other services said
 * back, so email addresses are cut down to something recognisable and a value
 * of absurd length keeps only its two ends.
 */

import winston from 'winston';
import { Prisma } from '@prisma/client';
import logger from '../logger';
import { captureLogs, objectField } from '../../__tests__/helpers/logCapture';

const LEVEL = Symbol.for('level');
const MESSAGE = Symbol.for('message');

describe('an error logged inside the metadata', () => {
  it('is written with its message and stack', async () => {
    const logs = captureLogs();
    logger.error('Error adding token', { err: new Error('boom') });
    const [entry] = await logs.stop();

    const err = objectField(entry, 'err');
    expect(err.name).toBe('Error');
    expect(err.message).toBe('boom');
    expect(String(err.stack)).toContain('Error: boom');
    expect(entry.message).toBe('Error adding token');
  });

  it('keeps a database error\'s code and fields beside its message', async () => {
    const logs = captureLogs();
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`name`)', {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ['name'] },
    });
    logger.error('Error creating map', { error });
    const [entry] = await logs.stop();

    const written = objectField(entry, 'error');
    expect(written.name).toBe('PrismaClientKnownRequestError');
    expect(written.code).toBe('P2002');
    expect(written.message).toContain('Unique constraint failed');
    expect(written.meta).toEqual({ target: ['name'] });
  });

  it('includes the error it was caused by', async () => {
    const logs = captureLogs();
    logger.error('Restore failed', { err: new Error('outer', { cause: new Error('inner reason') }) });
    const [entry] = await logs.stop();

    const cause = objectField(objectField(entry, 'err'), 'cause');
    expect(cause.message).toBe('inner reason');
  });

  it('leaves the object the caller passed unchanged', async () => {
    const logs = captureLogs();
    const err = new Error('boom');
    const meta = { err, detail: { to: 'someone@example.com' } };
    logger.error('Failed', meta);
    await logs.stop();

    expect(meta.err).toBe(err);
    expect(meta.detail.to).toBe('someone@example.com');
  });

  it('is shown on the development console too', () => {
    const console = logger.transports.find((t) => t instanceof winston.transports.Console);
    expect(console?.format).toBeDefined();
    const info = { level: 'error', message: 'Error adding token', err: new Error('boom'), [LEVEL]: 'error' };
    const shared = logger.format.transform(info);
    if (typeof shared === 'boolean') throw new Error('the logger format dropped the entry');
    const shown = console?.format?.transform(shared);
    if (!shown || typeof shown === 'boolean') throw new Error('the console format dropped the entry');
    expect(String(shown[MESSAGE])).toContain('boom');
  });
});

describe('email addresses', () => {
  it('are cut to the first letter and the domain', async () => {
    const logs = captureLogs();
    logger.info('Email sent', { type: 'password_reset', to: 'alice.smith@example.com' });
    const [entry] = await logs.stop();

    expect(entry.to).toBe('a***@example.com');
    expect(logs.lines.join('')).not.toContain('alice.smith');
  });

  it('are masked in the message and in an error\'s text', async () => {
    const logs = captureLogs();
    logger.error('[admin] Failed to send welcome email to bob@example.org', {
      err: new Error('Message failed: 550 mailbox unavailable <carol.jones@mail.example.net>'),
    });
    const [entry] = await logs.stop();

    expect(entry.message).toBe('[admin] Failed to send welcome email to b***@example.org');
    expect(objectField(entry, 'err').message).toBe('Message failed: 550 mailbox unavailable <c***@mail.example.net>');
    const raw = logs.lines.join('');
    expect(raw).not.toContain('bob@');
    expect(raw).not.toContain('carol.jones');
  });

  it('are masked inside nested metadata and arrays', async () => {
    const logs = captureLogs();
    logger.warn('Mail rejected', { result: { rejected: ['dave@example.com', 'erin@example.com'] } });
    const [entry] = await logs.stop();

    expect(objectField(entry, 'result').rejected).toEqual(['d***@example.com', 'e***@example.com']);
  });

  it('leave package paths and version numbers alone', async () => {
    const logs = captureLogs();
    const text = 'at /app/node_modules/@prisma/client/runtime/library.js (socket.io@4.8.3)';
    logger.info(text);
    const [entry] = await logs.stop();

    expect(entry.message).toBe(text);
  });
});

describe('a value of absurd length', () => {
  it('keeps its start and its end, so the line stays readable and small', async () => {
    const logs = captureLogs();
    const message =
      'Invalid `prisma.character.findUnique()` invocation: ' + 'x'.repeat(1_000_000) + ' Argument `id`: Invalid value provided.';
    logger.error('Error updating HP', { err: new Error(message) });
    const [entry] = await logs.stop();

    const written = String(objectField(entry, 'err').message);
    expect(written.startsWith('Invalid `prisma.character.findUnique()` invocation')).toBe(true);
    expect(written.endsWith('Argument `id`: Invalid value provided.')).toBe(true);
    expect(written).toMatch(/characters left out/);
    expect(logs.lines.join('').length).toBeLessThan(40_000);
  });
});
