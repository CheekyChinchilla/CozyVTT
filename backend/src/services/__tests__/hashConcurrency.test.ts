/**
 * Only a few password hashes run at once.
 *
 * Argon2 takes 64 MB a hash and runs on libuv's four threads, which file
 * reads share. A correct password is never counted by the sign-in limits, so
 * a flood of sign-ins with one could fill the pool, stall file serving and
 * push the 512 MB container towards its memory limit. Every hash and check
 * now waits for one of HASH_SLOTS turns; at most HASH_QUEUE_MAX wait, each
 * for at most HASH_WAIT_MS, and a caller beyond either is told the server is
 * busy (the routes answer 503).
 *
 * Argon2 is replaced here by calls that finish only when the test says.
 */

const pending: Array<(value: unknown) => void> = [];

jest.mock('argon2', () => ({
  __esModule: true,
  default: {
    argon2id: 2,
    hash: jest.fn(() => new Promise((resolve) => pending.push(resolve))),
    verify: jest.fn(() => new Promise((resolve) => pending.push(resolve))),
  },
}));

import argon2 from 'argon2';
import { hashPassword, verifyPassword, ServerBusyError, HASH_SLOTS, HASH_QUEUE_MAX, HASH_WAIT_MS } from '../auth';

/** Let every promise that can settle do so. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** How many argon2 calls have started. */
const started = () => jest.mocked(argon2.hash).mock.calls.length + jest.mocked(argon2.verify).mock.calls.length;

/** Finish every argon2 call running, and those that start meanwhile, until none is left. */
async function drain() {
  await settle();
  while (pending.length > 0) {
    pending.shift()?.('$argon2id$done');
    await settle();
  }
}

beforeEach(() => {
  jest.mocked(argon2.hash).mockClear();
  jest.mocked(argon2.verify).mockClear();
});

afterEach(async () => {
  jest.useRealTimers();
  await drain();
});

it('runs two hashes or checks at a time and starts the next as one finishes', async () => {
  expect(HASH_SLOTS).toBe(2);
  const calls = [
    ...Array.from({ length: 3 }, () => hashPassword('a')),
    ...Array.from({ length: 3 }, () => verifyPassword('$argon2id$x', 'a')),
  ];
  await settle();
  expect(started()).toBe(2);

  pending.shift()?.('$argon2id$one');
  await settle();
  expect(started()).toBe(3);

  await drain();
  expect(started()).toBe(6);
  await expect(Promise.all(calls)).resolves.toHaveLength(6);
});

it('tells the caller beyond the waiting line that the server is busy', async () => {
  expect(HASH_QUEUE_MAX).toBe(50);
  const held = Array.from({ length: HASH_SLOTS + HASH_QUEUE_MAX }, () => hashPassword('a'));
  await settle();
  expect(started()).toBe(HASH_SLOTS);

  await expect(hashPassword('one too many')).rejects.toBeInstanceOf(ServerBusyError);
  // A busy check is an error, never a wrong password, which the limits would count.
  await expect(verifyPassword('$argon2id$x', 'one too many')).rejects.toBeInstanceOf(ServerBusyError);

  await drain();
  await expect(Promise.all(held)).resolves.toHaveLength(HASH_SLOTS + HASH_QUEUE_MAX);
});

it('gives up on a wait longer than HASH_WAIT_MS, under the 15 seconds the sign-in waits', async () => {
  expect(HASH_WAIT_MS).toBeLessThan(15_000);
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
  const running = [hashPassword('a'), hashPassword('b')];
  const waiting = hashPassword('c');
  const outcome = waiting.then(
    () => 'hashed',
    (error: unknown) => (error instanceof ServerBusyError ? 'busy' : 'other')
  );
  await settle();

  jest.advanceTimersByTime(HASH_WAIT_MS);
  await expect(outcome).resolves.toBe('busy');

  // The two turns are still the two running, and free again once they finish.
  await drain();
  await Promise.all(running);
  const after = hashPassword('d');
  await settle();
  expect(started()).toBe(3);
  await drain();
  await after;
});

it('still reports a hash that does not match as false', async () => {
  const check = verifyPassword('$argon2id$x', 'wrong');
  await settle();
  pending.shift()?.(false);
  await expect(check).resolves.toBe(false);
});
