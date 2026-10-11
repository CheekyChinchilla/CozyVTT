/**
 * A refused setup wizard says in the log where to find the setup token.
 *
 * The token is printed once, when the backend starts with setup incomplete.
 * If reading the setup state failed at that moment, or LOG_LEVEL hid the
 * line, no token was ever printed, and the wizard's only advice was to read
 * the log. The log now says it again each time the wizard is refused for a
 * missing or wrong token; the answer to the browser never carries it.
 *
 * Nothing is said once setup has run, when the token has no use and a refusal
 * is only a stranger knocking. The setup state is set by each test, so the
 * database the suite shares does not decide it.
 *
 * Requires PostgreSQL at DATABASE_URL for the app to assemble.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { setupToken } from '../../services/setupToken';
import * as systemSettings from '../../services/systemSettings';
import logger from '../../utils/logger';

const app = createTestApp();
const saved = process.env.SETUP_TOKEN;

const refused = (token?: string) => request(app).post('/api/setup/init').send({ setupToken: token });

/** Everything written to the log at error level, as one string per line. */
function errorLines(spy: jest.SpyInstance): string[] {
  return spy.mock.calls.map((call: unknown[]) => String(call[0]));
}

/** The setup state the route sees: not complete, unless a test says otherwise. */
function setupIs(state: 'open' | 'complete' | 'unreadable') {
  const spy = jest.spyOn(systemSettings, 'setupState');
  if (state === 'unreadable') spy.mockRejectedValue(new Error('database not ready'));
  else spy.mockResolvedValue({ setupCompleted: state === 'complete', hasUsers: state === 'complete' });
}

beforeEach(() => setupIs('open'));

afterEach(() => {
  jest.restoreAllMocks();
  if (saved === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = saved;
});

it('prints the generated token in the log when the wizard is refused, and never sends it to the browser', async () => {
  delete process.env.SETUP_TOKEN;
  const token = setupToken();
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const res = await refused('not-the-token');

  expect(res.status).toBe(403);
  expect(JSON.stringify(res.body)).not.toContain(token);
  expect(JSON.stringify(res.headers)).not.toContain(token);
  expect(errorLines(logged).some((line) => line.includes(token) && /setup token/.test(line))).toBe(true);
});

it('writes a line for each refusal, with no token sent at all as well', async () => {
  delete process.env.SETUP_TOKEN;
  const token = setupToken();
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  await refused('wrong');
  await refused(undefined);

  expect(errorLines(logged).filter((line) => line.includes(token))).toHaveLength(2);
});

it('says where a configured token is, without printing it', async () => {
  process.env.SETUP_TOKEN = 'a-token-the-owner-chose-0123456789';
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const res = await refused('wrong');

  expect(res.status).toBe(403);
  const lines = errorLines(logged).filter((line) => /setup token/.test(line));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain('SETUP_TOKEN');
  expect(lines[0]).not.toContain('a-token-the-owner-chose-0123456789');
  expect(JSON.stringify(res.body)).not.toContain('a-token-the-owner-chose-0123456789');
});

it('does not log the token when it was right', async () => {
  process.env.SETUP_TOKEN = 'right-token-0123456789';
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const res = await refused('right-token-0123456789');

  // Past the token the route goes on to the setup state, whatever it is here.
  expect(res.status).not.toBe(403);
  expect(errorLines(logged).filter((line) => /setup token/.test(line))).toHaveLength(0);
});

it('says nothing once setup has run', async () => {
  delete process.env.SETUP_TOKEN;
  setupIs('complete');
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const res = await refused('not-the-token');

  expect(res.status).toBe(403);
  expect(errorLines(logged).filter((line) => /setup token/.test(line))).toHaveLength(0);
});

it('prints the token even when the setup state cannot be read, which is when the start-up line is missing', async () => {
  delete process.env.SETUP_TOKEN;
  const token = setupToken();
  setupIs('unreadable');
  const logged = jest.spyOn(logger, 'error').mockImplementation(() => logger);

  const res = await refused('not-the-token');

  expect(res.status).toBe(403);
  expect(errorLines(logged).some((line) => line.includes(token))).toBe(true);
});
