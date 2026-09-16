import argon2 from 'argon2';
import { prisma } from '../config/database';
import { User, PlatformRole } from '@prisma/client';
import { validatePasswordStrength, validateEmail, sanitizeInput } from '../utils/validation';

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

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
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

/**
 * Register a new user
 * First user automatically becomes ADMIN
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  // Validate email format
  if (!validateEmail(input.email)) {
    throw new Error('Invalid email format');
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(input.password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.errors.join(', '));
  }

  // Sanitize inputs
  const email = sanitizeInput(input.email.toLowerCase());
  const displayName = sanitizeInput(input.displayName);

  // Hash before the transaction: Argon2 is deliberately slow, and holding the
  // registration lock across it would serialise every signup on the hash.
  const passwordHash = await hashPassword(input.password);

  // The first user on an instance becomes ADMIN, decided by a count that is
  // then acted on. Two registrations racing on a fresh, internet-facing install
  // both read zero and both become admin. A transaction-scoped advisory lock
  // serialises the count-and-create so exactly one wins the first-admin role;
  // it is one fixed key, so only registration waits on registration, and it is
  // released when the transaction ends. No schema change, and it covers every
  // caller of registerUser (setup and public registration alike).
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`;

    const existingUser = await tx.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    const userCount = await tx.user.count();
    const platformRole: PlatformRole = userCount === 0 ? 'ADMIN' : 'USER';

    return tx.user.create({
      data: { email, passwordHash, displayName, platformRole },
    });
  });
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
