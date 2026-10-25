/**
 * The dummy password hash is made when the server starts.
 *
 * A sign-in for an email with no account is checked against a dummy hash, so
 * it takes as long as a wrong password. The hash was made on the first such
 * sign-in, through the server's line of hashes, so after a restart under load
 * an unknown address needed two turns in the line where a known one needed
 * one: it waited longer, and was answered 503 more often, until one dummy
 * hash had been made. The server now makes it as it starts, outside the line,
 * and a sign-in still makes it if that failed.
 *
 * Argon2 and the account lookup are replaced here; each test loads the
 * service afresh, so the dummy hash starts unmade.
 */

const calls: Array<{ kind: 'hash' | 'verify'; finish: (value: unknown) => void; fail: (error: unknown) => void }> = [];

jest.mock('argon2', () => ({
  __esModule: true,
  default: {
    argon2id: 2,
    hash: jest.fn(() => new Promise((resolve, reject) => calls.push({ kind: 'hash', finish: resolve, fail: reject }))),
    verify: jest.fn(() => new Promise((resolve, reject) => calls.push({ kind: 'verify', finish: resolve, fail: reject }))),
  },
}));

jest.mock('../../config/database', () => ({
  prisma: { user: { findUnique: jest.fn(async () => null) } },
}));

type AuthModule = typeof import('../auth');

const settle = () => new Promise((resolve) => setImmediate(resolve));

function freshAuth(): AuthModule {
  let loaded: AuthModule | undefined;
  jest.isolateModules(() => {
    loaded = jest.requireActual<AuthModule>('../auth');
  });
  if (!loaded) throw new Error('auth service did not load');
  return loaded;
}

async function drain() {
  await settle();
  while (calls.length > 0) {
    const next = calls.shift();
    next?.finish(next.kind === 'hash' ? '$argon2id$made' : false);
    await settle();
  }
}

afterEach(async () => {
  await drain();
});

it('is made at start even with every turn taken and the line full, and a sign-in then only checks against it', async () => {
  const auth = freshAuth();
  const held = Array.from({ length: auth.HASH_SLOTS + auth.HASH_QUEUE_MAX }, () => auth.hashPassword('held').catch(() => 'busy'));
  await settle();
  expect(calls).toHaveLength(auth.HASH_SLOTS);

  const made = auth.makeDummyPasswordHash();
  await settle();
  expect(calls.map((p) => p.kind)).toEqual(['hash', 'hash', 'hash']);
  calls.pop()?.finish('$argon2id$dummy');
  await expect(made).resolves.toBeUndefined();

  await drain();
  await Promise.all(held);

  const signIn = auth.authenticateUser({ email: 'nobody@test.invalid', password: 'guess' });
  await settle();
  // One check against the dummy hash, and no hash made on the way.
  expect(calls.map((p) => p.kind)).toEqual(['verify']);
  calls.shift()?.finish(false);
  await expect(signIn).resolves.toBeNull();
});

it('is made on the first sign-in for an unknown email if making it at start failed', async () => {
  const auth = freshAuth();
  const made = auth.makeDummyPasswordHash();
  await settle();
  calls.shift()?.fail(new Error('out of memory'));
  // Start-up goes on: the failure is not thrown.
  await expect(made).resolves.toBeUndefined();

  const signIn = auth.authenticateUser({ email: 'nobody@test.invalid', password: 'guess' });
  await settle();
  expect(calls.map((p) => p.kind)).toEqual(['hash']);
  calls.shift()?.finish('$argon2id$dummy');
  await settle();
  expect(calls.map((p) => p.kind)).toEqual(['verify']);
  calls.shift()?.finish(false);
  await expect(signIn).resolves.toBeNull();
});
