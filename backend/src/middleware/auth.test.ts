/**
 * Auth Middleware — Unit Tests
 *
 * Tests requireAuth, requireAdmin, requireRole, and optionalAuth
 * using mocked Express request/response objects.
 */

import { Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin, requireRole, optionalAuth } from './auth';

// ============================================
// Helpers
// ============================================

function mockReq(sessionOverrides: Record<string, any> = {}): Partial<Request> {
  return {
    session: {
      ...sessionOverrides,
      // Minimal express-session shape
      id: 'test-session-id',
      cookie: {} as any,
      regenerate: jest.fn(),
      destroy: jest.fn(),
      reload: jest.fn(),
      resetMaxAge: jest.fn(),
      save: jest.fn(),
      touch: jest.fn(),
    } as any,
  };
}

function mockRes(): { status: jest.Mock; json: jest.Mock; res: Partial<Response> } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as any;
  return { status, json, res };
}

const mockNext: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// requireAuth
// ============================================

describe('requireAuth', () => {
  it('calls next() when session has a userId', () => {
    const req = mockReq({ userId: 'user-123' }) as Request;
    const { res } = mockRes();
    requireAuth(req, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when session has no userId', () => {
    const req = mockReq() as Request;
    const { status, json } = mockRes();
    requireAuth(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when mfaPending is set, even with a userId', () => {
    const req = mockReq({ userId: 'user-123', mfaPending: true }) as Request;
    const { status, json } = mockRes();
    requireAuth(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('MFA') })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ============================================
// requireAdmin
// ============================================

describe('requireAdmin', () => {
  it('calls next() for an authenticated ADMIN', () => {
    const req = mockReq({ userId: 'user-123', platformRole: 'ADMIN' }) as Request;
    const { res } = mockRes();
    requireAdmin(req, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when not authenticated', () => {
    const req = mockReq() as Request;
    const { status, json } = mockRes();
    requireAdmin(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized' })
    );
  });

  it('returns 403 for an authenticated non-admin user', () => {
    const req = mockReq({ userId: 'user-456', platformRole: 'USER' }) as Request;
    const { status, json } = mockRes();
    requireAdmin(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden' })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ============================================
// requireRole
// ============================================

describe('requireRole', () => {
  it('calls next() when the session role matches', () => {
    const req = mockReq({ userId: 'user-123', platformRole: 'ADMIN' }) as Request;
    const { res } = mockRes();
    requireRole('ADMIN')(req, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when not authenticated', () => {
    const req = mockReq() as Request;
    const { status, json } = mockRes();
    requireRole('ADMIN')(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
  });

  it('returns 403 when the session role does not match', () => {
    const req = mockReq({ userId: 'user-123', platformRole: 'USER' }) as Request;
    const { status, json } = mockRes();
    requireRole('ADMIN')(req, { status } as any, mockNext);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
    expect(mockNext).not.toHaveBeenCalled();
  });
});

// ============================================
// optionalAuth
// ============================================

describe('optionalAuth', () => {
  it('always calls next() regardless of session state', () => {
    const reqNoSession = mockReq() as Request;
    const { res } = mockRes();
    optionalAuth(reqNoSession, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    const reqWithSession = mockReq({ userId: 'user-123' }) as Request;
    optionalAuth(reqWithSession, res as Response, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });
});
