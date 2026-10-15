/**
 * The one-time setup token the wizard asks for.
 *
 * Until setup has run, POST /api/setup/init makes whoever calls it the
 * administrator, and a fresh instance is often reachable before its owner
 * gets to the wizard. The route now asks for a token only the owner can
 * read: SETUP_TOKEN when they set one, otherwise a random value made at
 * first use and printed in the backend log at start.
 */

const saved = process.env.SETUP_TOKEN;

type SetupToken = typeof import('../setupToken');

/** The module loaded afresh, as the server loads it once at start. */
function load(env: string | undefined): SetupToken {
  if (env === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = env;
  let mod: SetupToken | undefined;
  jest.isolateModules(() => {
    mod = require('../setupToken') as SetupToken;
  });
  if (!mod) throw new Error('module did not load');
  return mod;
}

afterAll(() => {
  if (saved === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = saved;
});

it('makes a 32-character random token once, and keeps it for the life of the process', () => {
  const mod = load(undefined);
  const token = mod.setupToken();
  expect(token).toMatch(/^[0-9a-f]{32}$/);
  expect(mod.setupToken()).toBe(token);
  expect(load(undefined).setupToken()).not.toBe(token);
});

it('uses SETUP_TOKEN when it is set, trimmed', () => {
  const mod = load('  my-own-setup-token  ');
  expect(mod.setupToken()).toBe('my-own-setup-token');
  expect(mod.setupTokenMatches('my-own-setup-token')).toBe(true);
});

it('treats a blank SETUP_TOKEN as unset', () => {
  expect(load('   ').setupToken()).toMatch(/^[0-9a-f]{32}$/);
});

it('matches only the exact token, given as text', () => {
  const mod = load('the-right-token');
  expect(mod.setupTokenMatches('the-right-token')).toBe(true);
  expect(mod.setupTokenMatches('the-right-tokeN')).toBe(false);
  expect(mod.setupTokenMatches('the-right-token ')).toBe(false);
  expect(mod.setupTokenMatches('')).toBe(false);
  expect(mod.setupTokenMatches(undefined)).toBe(false);
  expect(mod.setupTokenMatches({ equals: 'the-right-token' })).toBe(false);
  expect(mod.setupTokenMatches(['the-right-token'])).toBe(false);
});
