/**
 * Forced Password Change Middleware — Unit Tests
 *
 * Accounts flagged `mustChangePassword` may only reach the endpoints needed to
 * replace that password. Everything else must be refused, or an admin-issued
 * temporary password keeps working indefinitely.
 */

import { Request, Response, NextFunction } from 'express';
import { requirePasswordChanged, PASSWORD_CHANGE_REQUIRED } from './passwordChange';

// The middleware falls back to a database read when the session predates the
// flag; that path is exercised in the "legacy session" tests below.
const mockFindUnique = jest.fn();
jest.mock('../config/database', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

function mockReq(path: string, sessionOverrides: Record<string, any> = {}): Request {
  return {
    path,
    session: {
      ...sessionOverrides,
      id: 'test-session-id',
      cookie: {} as any,
      regenerate: jest.fn(),
      destroy: jest.fn(),
      reload: jest.fn(),
      resetMaxAge: jest.fn(),
      save: jest.fn(),
      touch: jest.fn(),
    } as any,
  } as unknown as Request;
}

function mockRes(): { status: jest.Mock; json: jest.Mock; res: Response } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json, res: { status, json } as unknown as Response };
}

const mockNext: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// Pass-through cases
// ============================================

describe('requirePasswordChanged — allows through', () => {
  it('unauthenticated requests (other guards handle those)', async () => {
    const req = mockReq('/campaigns');
    const { res } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('sessions with no pending password change', async () => {
    const req = mockReq('/campaigns', { userId: 'user-1', mustChangePassword: false });
    const { res, status } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it.each([
    '/auth/change-password',
    '/auth/logout',
    '/auth/me',
    '/auth/ping',
    '/auth/appearance',
    '/config',
  ])('the allowlisted path %s even while pending', async (path) => {
    const req = mockReq(path, { userId: 'user-1', mustChangePassword: true });
    const { res, status } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

// ============================================
// Blocking
// ============================================

describe('requirePasswordChanged — blocks', () => {
  it('any other route while a password change is pending', async () => {
    const req = mockReq('/campaigns', { userId: 'user-1', mustChangePassword: true });
    const { res, status, json } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: PASSWORD_CHANGE_REQUIRED })
    );
  });

  it('a near-miss path that only starts like an allowlisted one', async () => {
    const req = mockReq('/auth/me/campaigns', { userId: 'user-1', mustChangePassword: true });
    const { res, status } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});

// ============================================
// Sessions created before the flag existed
// ============================================

describe('requirePasswordChanged — legacy sessions', () => {
  it('reads the database once and caches the answer in the session', async () => {
    mockFindUnique.mockResolvedValue({ mustChangePassword: true });
    const req = mockReq('/campaigns', { userId: 'user-1' }); // no flag in session
    const { res, status } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(403);
    // Cached, so the next request costs nothing
    expect(req.session.mustChangePassword).toBe(true);
  });

  it('lets a legacy session through when the account is fine', async () => {
    mockFindUnique.mockResolvedValue({ mustChangePassword: false });
    const req = mockReq('/campaigns', { userId: 'user-1' });
    const { res } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(req.session.mustChangePassword).toBe(false);
  });

  it('fails open on a database error rather than locking everyone out', async () => {
    mockFindUnique.mockRejectedValue(new Error('connection refused'));
    const req = mockReq('/campaigns', { userId: 'user-1' });
    const { res, status } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('does not block when the session points at a deleted user', async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = mockReq('/campaigns', { userId: 'ghost' });
    const { res } = mockRes();

    await requirePasswordChanged(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
