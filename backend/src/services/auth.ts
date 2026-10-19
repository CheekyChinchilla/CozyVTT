import argon2 from 'argon2';
import crypto from 'crypto';
import type { Response } from 'express';
import { prisma } from '../config/database';
import { User, PlatformRole, type Prisma } from '@prisma/client';
import { validatePasswordStrength, validateEmail } from '../utils/validation';
import { parseDisplayName } from '../validators/users';

/**
 * Authentication Service
 * Handles user registration, login, and password management
 * Uses Argon2 with specific parameters
 */

// Argon2 configuration
/**
 * Fixed advisory-lock key for the registration path, so a concurrent signup
 * cannot race the first-admin decision. Any stable bigint; chosen once.
 */
const REGISTRATION_LOCK_KEY = 481507_2026;

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} as const;

/**
 * A registration refused for what was sent: an invalid address, a weak
 * password, a bad display name or an address already in use. The register
 * and setup routes answer these with 400 and the message; any other error is
 * the server's and is answered with a fixed message, so database text never
 * reaches someone who is not signed in.
 */
export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistrationError';
  }
}

/**
 * Thrown by the setup wizard's registration when an account already exists:
 * another wizard submitted at the same moment got there first, or an older
 * version's setup had already created the administrator.
 */
export class SetupAlreadyRunError extends Error {
  constructor() {
    super('Setup has already been run');
    this.name = 'SetupAlreadyRunError';
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  /**
   * False when the instance requires an admin to approve new accounts. Set in
   * the create itself: the column defaults to approved, so a separate write
   * afterwards would leave the account able to sign in until it landed, and
   * for good if it failed.
   */
  isApproved?: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * How many password hashes or checks run at once. Each takes 64 MB and a
 * thread of libuv's four, which file reads share, and a correct password is
 * never counted by the sign-in limits, so a flood of sign-ins with one could
 * otherwise fill the pool, stall file serving and push the container towards
 * its memory limit.
 */
export const HASH_SLOTS = 2;

/** How many may wait for a turn; one more is told the server is busy. */
export const HASH_QUEUE_MAX = 50;

/**
 * How long one may wait for a turn before it is told the server is busy:
 * inside the 15 seconds the sign-in limits let a request wait, so the busy
 * answer arrives first.
 */
export const HASH_WAIT_MS = 10_000;

/** What a person is told when the server is too busy to check a password. */
export const SERVER_BUSY_MESSAGE = 'The server is busy, try again in a moment.';

/**
 * No turn to hash or check a password came: too many waiting, or the wait ran
 * out. Every route that hashes answers it with 503 (answeredBusy).
 */
export class ServerBusyError extends Error {
  constructor() {
    super(SERVER_BUSY_MESSAGE);
    this.name = 'ServerBusyError';
  }
}

let hashesRunning = 0;
const hashWaiting: Array<() => void> = [];

/** A turn to hash, once one is free; ServerBusyError past the queue or the wait. */
function hashTurn(): Promise<void> {
  if (hashesRunning < HASH_SLOTS) {
    hashesRunning += 1;
    return Promise.resolve();
  }
  if (hashWaiting.length >= HASH_QUEUE_MAX) return Promise.reject(new ServerBusyError());
  return new Promise((resolve, reject) => {
    const admit = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      const queued = hashWaiting.indexOf(admit);
      if (queued !== -1) hashWaiting.splice(queued, 1);
      reject(new ServerBusyError());
    }, HASH_WAIT_MS);
    hashWaiting.push(admit);
  });
}

/** Hand the turn to the next waiting, or free it. */
function endHashTurn(): void {
  const next = hashWaiting.shift();
  if (next) next();
  else hashesRunning -= 1;
}

async function withHashTurn<T>(work: () => Promise<T>): Promise<T> {
  await hashTurn();
  try {
    return await work();
  } finally {
    endHashTurn();
  }
}

/**
 * Hash password using Argon2
 * CRITICAL: Passwords must be hashed immediately upon receipt
 */
export async function hashPassword(password: string): Promise<string> {
  return withHashTurn(() => argon2.hash(password, ARGON2_OPTIONS));
}

/**
 * Verify password against hash. A hash Argon2 cannot read is false; a busy
 * server throws ServerBusyError, which must never count as a wrong password.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return withHashTurn(() => argon2Matches(hash, password));
}

async function argon2Matches(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Which of `hashes` the password matches, checked one after another in a
 * single turn, or -1 for none. For the backup codes: with a turn for each
 * hash, a server that became busy partway answered 503 with some of them
 * checked and no wrong code counted, so guesses went uncounted under load.
 * Busy before the first check throws ServerBusyError, with nothing checked.
 */
export async function firstMatchingHash(hashes: string[], password: string): Promise<number> {
  return withHashTurn(async () => {
    for (let i = 0; i < hashes.length; i++) {
      if (await argon2Matches(hashes[i], password)) return i;
    }
    return -1;
  });
}

/**
 * Answer 503 with the busy message when `error` is ServerBusyError, and say
 * whether it did. Every route that hashes or checks a password asks this
 * first in its catch.
 */
export function answeredBusy(res: Response, error: unknown): boolean {
  if (!(error instanceof ServerBusyError)) return false;
  res.setHeader('Retry-After', '5');
  res.status(503).json({ error: 'Service Unavailable', message: SERVER_BUSY_MESSAGE });
  return true;
}

/** A registration checked and hashed, ready to be written. */
export interface PreparedRegistration {
  email: string;
  displayName: string;
  passwordHash: string;
}

/**
 * Check a registration and hash its password, before any transaction.
 *
 * Argon2 is deliberately slow, and holding the registration lock across it
 * would serialise every signup on the hash. Throws RegistrationError for
 * anything that was sent wrongly.
 */
export async function prepareRegistration(input: RegisterInput): Promise<PreparedRegistration> {
  // An address holding < or > is refused, as Create User and Invite User
  // refuse one, so the address stored is the one sign-in looks up.
  if (!validateEmail(input.email) || /[<>]/.test(input.email)) {
    throw new RegistrationError('Invalid email format');
  }

  const passwordValidation = validatePasswordStrength(input.password);
  if (!passwordValidation.valid) {
    throw new RegistrationError(passwordValidation.errors.join(', '));
  }

  const parsedName = parseDisplayName(input.displayName);
  if (!parsedName.ok) {
    throw new RegistrationError(parsedName.message);
  }

  return {
    email: input.email.toLowerCase(),
    displayName: parsedName.name,
    passwordHash: await hashPassword(input.password),
  };
}

/**
 * Create the account inside a transaction, under the registration lock.
 *
 * The first user on an instance becomes ADMIN, decided by a count that is
 * then acted on. Two registrations racing on a fresh, internet-facing install
 * both read zero and both become admin. A transaction-scoped advisory lock
 * serialises the count-and-create so exactly one wins the first-admin role;
 * it is one fixed key, so only registration waits on registration, and it is
 * released when the transaction ends. The setup wizard passes `mustBeFirst`:
 * it may only ever create the first account, so a count that is not zero
 * means another wizard, or an older setup, got there first.
 */
export async function createRegisteredUser(
  tx: Prisma.TransactionClient,
  prepared: PreparedRegistration,
  isApproved: boolean,
  options: { mustBeFirst?: boolean } = {}
): Promise<User> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`;

  const userCount = await tx.user.count();
  if (options.mustBeFirst && userCount > 0) {
    throw new SetupAlreadyRunError();
  }

  const existingUser = await tx.user.findUnique({ where: { email: prepared.email } });
  if (existingUser) {
    throw new RegistrationError('Email already registered');
  }

  const platformRole: PlatformRole = userCount === 0 ? 'ADMIN' : 'USER';

  return tx.user.create({
    data: { ...prepared, platformRole, isApproved },
  });
}

/**
 * Register a new user
 * First user automatically becomes ADMIN
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  const prepared = await prepareRegistration(input);
  return prisma.$transaction((tx) => createRegisteredUser(tx, prepared, input.isApproved ?? true));
}

/**
 * A hash nobody's password matches, made once with the same cost as a real
 * one. An email with no account used to be answered straight after the lookup
 * while a known one went on to the Argon2 check, so the time a sign-in took
 * told which addresses have accounts, though the reply was the same. Checking
 * the given password against this hash makes both paths pay for the hash.
 */
let dummyHash: Promise<string> | null = null;
function dummyPasswordHash(): Promise<string> {
  if (dummyHash === null) {
    // A hash refused for a busy server is made again next time.
    dummyHash = hashPassword(crypto.randomBytes(32).toString('hex')).catch((error: unknown) => {
      dummyHash = null;
      throw error;
    });
  }
  return dummyHash;
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(input: LoginInput): Promise<User | null> {
  const email = input.email.toLowerCase();

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // An unknown email costs the same as a wrong password: see dummyPasswordHash.
  if (!user) {
    await verifyPassword(await dummyPasswordHash(), input.password);
    return null;
  }

  // Verify password
  const isValidPassword = await verifyPassword(user.passwordHash, input.password);

  if (!isValidPassword) {
    return null;
  }

  // Update last login timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return user;
}

/**
 * Get user by ID (for session deserialization)
 */
export async function getUserById(id: string): Promise<User | null> {
  return await prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Sanitize user object for client (remove sensitive fields)
 */
export function sanitizeUser(user: User) {
  const { passwordHash, mfaSecret, mfaBackupCodes, ...sanitized } = user;
  return sanitized;
}
