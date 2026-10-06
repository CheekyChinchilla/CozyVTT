/**
 * What the last-resort error handler writes to the log.
 *
 * A request body that is not valid JSON fails in the parser, and the parser's
 * message quotes the text around the mistake. The handler logged that message
 * before answering 400, so a hand-written client's malformed sign-in put part
 * of its password into the error log. A refused body is the caller's mistake,
 * not the server's, and is logged as what kind of refusal it was.
 */

import express from 'express';
import request from 'supertest';
import { bodyParsers } from '../bodyParsers';
import { errorHandler } from '../errorHandler';
import { captureLogs, objectField } from '../../__tests__/helpers/logCapture';

const SECRET = 'hunter2-not-for-the-log';

function app(): express.Express {
  const a = express();
  a.use(bodyParsers());
  a.post('/api/auth/login', (_req, res) => res.json({ ok: true }));
  a.get('/boom', () => {
    throw new Error('kaboom');
  });
  a.use(errorHandler);
  return a;
}

describe('a request body that is not valid JSON', () => {
  it('is answered 400 and none of it reaches the log', async () => {
    const logs = captureLogs();
    const res = await request(app())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(`{"email":"someone@example.com","password": ${SECRET}}`);
    await logs.stop();

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The request body was not valid JSON.');
    expect(logs.lines.join('')).not.toContain('hunter2');
  });

  it('is logged as a refused body, with where it was sent', async () => {
    const logs = captureLogs();
    await request(app()).post('/api/auth/login').set('Content-Type', 'application/json').send('{"a": nope}');
    const entries = await logs.stop();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'warn',
      message: 'Request body refused',
      type: 'entity.parse.failed',
      status: 400,
      method: 'POST',
      path: '/api/auth/login',
    });
  });
});

describe('a request body over the size limit', () => {
  it('is answered 413 and logged as a refused body', async () => {
    const logs = captureLogs();
    const res = await request(app())
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ note: SECRET + 'x'.repeat(2 * 1024 * 1024) }));
    const entries = await logs.stop();

    expect(res.status).toBe(413);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'warn', type: 'entity.too.large', status: 413 });
    expect(logs.lines.join('')).not.toContain('hunter2');
  });
});

describe('any other error', () => {
  it('is answered 500 and logged with its message and stack', async () => {
    const logs = captureLogs();
    const res = await request(app()).get('/boom');
    const entries = await logs.stop();

    expect(res.status).toBe(500);
    const logged = entries.find((e) => e.level === 'error');
    expect(String(logged?.message)).toContain('kaboom');
    expect(String(logged?.stack ?? objectField(logged ?? {}, 'err').stack)).toContain('Error: kaboom');
  });
});
