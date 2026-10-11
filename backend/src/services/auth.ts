import argon2 from 'argon2';
import { prisma } from '../config/database';
import { User, PlatformRole, type Prisma } from '@prisma/client';
import { validatePasswordStrength, validateEmail, sanitizeInput } from '../utils/validation';
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
};

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
 * Hash password using Argon2
 * CRITICAL: Passwords must be hashed immediately upon receipt
 */
export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify password against hash
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    return false;
  }
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
  if (!validateEmail(input.email)) {
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
    email: sanitizeInput(input.email.toLowerCase()),
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
 * Authenticate user with email and password
 */
export async function authenticateUser(input: LoginInput): Promise<User | null> {
  const email = input.email.toLowerCase();

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // TODO(accounts): an email with no account returns here without a password
  // check, so it answers measurably faster than a wrong password for a real
  // account, and the timing tells the two apart even though the response is
  // the same. Verify against a fixed dummy hash here so both take as long.
  if (!user) {
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
