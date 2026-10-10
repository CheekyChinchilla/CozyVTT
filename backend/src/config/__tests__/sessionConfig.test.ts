/**
 * The login-session settings the server runs with.
 *
 * The test apps build their own sessions, so nothing else loads this file's
 * settings: the refusal to start in production on a known session secret,
 * and the cookie's flags. A public instance on the placeholder secret lets
 * anyone who has read .env.example sign their own session cookies.
 *
 * The settings are loaded afresh for each case, with the environment the case
 * names, as the server loads them once at start.
 */

import express from 'express';
import session from 'express-session';
import request from 'supertest';
import type loggerInstance from '../../utils/logger';

type SessionModule = typeof import('../session');
type Logger = typeof loggerInstance;

class Exited extends Error {
  constructor(readonly code: string | number | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

const saved = { ...process.env };
const loaded: SessionModule[] = [];

/** What the freshly loaded settings logged. */
let logged: { error: jest.SpyInstance; warn: jest.SpyInstance };

/**
 * config/session.ts as the server would load it under `env`, with its own
 * copy of the logger, watched.
 */
function loadWith(env: Record<string, string | undefined>): SessionModule {
  process.env = { ...saved, ...env };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  let mod: SessionModule | undefined;
  jest.isolateModules(() => {
    const logger = (require('../../utils/logger') as { default: Logger }).default;
    logged = {
      error: jest.spyOn(logger, 'error').mockImplementation(() => logger),
      warn: jest.spyOn(logger, 'warn').mockImplementation(() => logger),
    };
    try {
      mod = require('../session') as SessionModule;
    } catch (error) {
      if (!(error instanceof Exited)) throw error;
    }
  });
  if (!mod) throw new Exited(exit.mock.calls[0]?.[0] as number | undefined);
  loaded.push(mod);
  return mod;
}

let exit: jest.SpyInstance;

beforeEach(() => {
  exit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Exited(code);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...saved };
});

afterAll(async () => {
  // Each load made a pool; none of them connected, but each is closed.
  await Promise.all(loaded.map((m) => m.sessionPool.end()));
});

describe('the session secret', () => {
  it.each([
    ['unset', undefined],
    ['the .env.example placeholder', 'CHANGE_ME_TO_RANDOM_STRING_32_CHARS_MIN'],
    ['the old development default', 'development-secret-change-in-production'],
  ])('stops a production server when it is %s, saying how to make one', (_label, secret) => {
    expect(() => loadWith({ NODE_ENV: 'production', SESSION_SECRET: secret })).toThrow(Exited);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logged.error).toHaveBeenCalledWith(expect.stringContaining('openssl rand -hex 32'));
  });

  it('starts a production server with a real secret, and signs with it', () => {
    const { sessionConfig } = loadWith({ NODE_ENV: 'production', SESSION_SECRET: 'a-real-secret-of-some-length-0123456789' });
    expect(exit).not.toHaveBeenCalled();
    expect(sessionConfig.secret).toBe('a-real-secret-of-some-length-0123456789');
  });

  it('only warns outside production, and uses a development secret', () => {
    const { sessionConfig } = loadWith({ NODE_ENV: 'development', SESSION_SECRET: undefined });
    expect(exit).not.toHaveBeenCalled();
    expect(logged.warn).toHaveBeenCalledWith(expect.stringContaining('SESSION_SECRET'));
    expect(sessionConfig.secret).toBe('dev-only-insecure-secret-do-not-use-in-production');
  });
});

describe('the session settings', () => {
  it('expire after an hour of inactivity unless SESSION_MAX_AGE says otherwise, and remember for 30 days', () => {
    const defaults = loadWith({ SESSION_MAX_AGE: undefined, REMEMBER_ME_MAX_AGE: undefined });
    expect(defaults.sessionConfig.cookie?.maxAge).toBe(60 * 60 * 1000);
    expect(defaults.sessionConfig.rolling).toBe(true);
    expect(defaults.rememberMeMaxAge).toBe(30 * 24 * 60 * 60 * 1000);

    const custom = loadWith({ SESSION_MAX_AGE: '7200000', REMEMBER_ME_MAX_AGE: '86400000' });
    expect(custom.sessionConfig.cookie?.maxAge).toBe(7200000);
    expect(custom.rememberMeMaxAge).toBe(86400000);
  });

  it('save nothing for a visitor who has not signed in', () => {
    const { sessionConfig } = loadWith({});
    expect(sessionConfig.saveUninitialized).toBe(false);
    expect(sessionConfig.resave).toBe(false);
  });
});

describe('the cookie, as a browser receives it', () => {
  /** The real settings on a bare app, with sessions kept in memory. */
  function appWith(sessionConfig: session.SessionOptions): express.Express {
    const app = express();
    app.set('trust proxy', 1);
    app.use(session({ ...sessionConfig, store: new session.MemoryStore() }));
    app.get('/sign-in', (req, res) => {
      req.session.userId = 'someone';
      res.status(204).end();
    });
    app.get('/look', (_req, res) => res.status(204).end());
    return app;
  }

  const cookieOf = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = raw?.find((c) => c.startsWith('cozyvtt.sid='));
    if (!cookie) throw new Error(`no cozyvtt.sid cookie in ${JSON.stringify(raw)}`);
    return cookie;
  };

  it('is named cozyvtt.sid, kept from scripts, and sent on same-site requests and links from elsewhere', async () => {
    const app = appWith(loadWith({}).sessionConfig);
    const cookie = cookieOf(await request(app).get('/sign-in'));
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).toMatch(/; Path=\//);
  });

  it('is marked Secure when the request came over HTTPS through the proxy, and not over plain HTTP', async () => {
    const app = appWith(loadWith({}).sessionConfig);
    expect(cookieOf(await request(app).get('/sign-in').set('X-Forwarded-Proto', 'https'))).toMatch(/; Secure/i);
    expect(cookieOf(await request(app).get('/sign-in'))).not.toMatch(/; Secure/i);
  });

  it('is not set for a visitor who has not signed in', async () => {
    const app = appWith(loadWith({}).sessionConfig);
    const res = await request(app).get('/look');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('is renewed on every answer once signed in, so only inactivity ends it', async () => {
    const app = appWith(loadWith({}).sessionConfig);
    const agent = request.agent(app);
    await agent.get('/sign-in');
    const later = await agent.get('/look');
    expect(cookieOf(later)).toMatch(/; Expires=/);
  });
});
