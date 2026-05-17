import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { PlatformRole } from '@/types/user.types';
import type { AuthContextType, User } from '@/types/user.types';

// ============================================
// Mock AuthContext
// ============================================

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '@/contexts/AuthContext';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function makeAuthState(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    loading: false,
    authenticated: false,
    mfaPending: false,
    mustChangePassword: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    verifyMFA: vi.fn(),
    verifyMFAWithBackupCode: vi.fn(),
    setupMFA: vi.fn(),
    completeMFASetup: vi.fn(),
    disableMFA: vi.fn(),
    changePassword: vi.fn(),
    refreshUser: vi.fn(),
    ...overrides,
  };
}

const mockUser: User = {
  id: 'user-1',
  email: 'alice@example.com',
  displayName: 'Alice',
  platformRole: PlatformRole.USER,
  globalAssetManager: false,
  mfaEnabled: false,
  avatarUrl: null,
  bio: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastLoginAt: null,
};

const adminUser: User = { ...mockUser, platformRole: PlatformRole.ADMIN };

function renderRoute(children: React.ReactNode, requireRole?: PlatformRole) {
  return render(
    <MemoryRouter>
      <ProtectedRoute requireRole={requireRole}>{children}</ProtectedRoute>
    </MemoryRouter>
  );
}

// ============================================
// Tests
// ============================================

describe('ProtectedRoute', () => {
  it('shows loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ loading: true }));
    renderRoute(<div>Protected Content</div>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /auth/login when not authenticated', () => {
    mockUseAuth.mockReturnValue(makeAuthState({ loading: false, authenticated: false, user: null }));
    renderRoute(<div>Protected Content</div>);
    // Navigate replaces the route — content should not render
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({ loading: false, authenticated: true, user: mockUser })
    );
    renderRoute(<div>Protected Content</div>);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('renders children when authenticated and no role required', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({ loading: false, authenticated: true, user: mockUser })
    );
    renderRoute(<div>Any User Content</div>);
    expect(screen.getByText('Any User Content')).toBeInTheDocument();
  });

  it('shows Access Denied when user role does not match requireRole', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({ loading: false, authenticated: true, user: mockUser })
    );
    renderRoute(<div>Admin Only</div>, PlatformRole.ADMIN);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Admin Only')).not.toBeInTheDocument();
  });

  it('renders children when user role matches requireRole', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({ loading: false, authenticated: true, user: adminUser })
    );
    renderRoute(<div>Admin Only</div>, PlatformRole.ADMIN);
    expect(screen.getByText('Admin Only')).toBeInTheDocument();
    expect(screen.queryByText('Access Denied')).not.toBeInTheDocument();
  });

  it('shows required and current roles in Access Denied message', () => {
    mockUseAuth.mockReturnValue(
      makeAuthState({ loading: false, authenticated: true, user: mockUser })
    );
    renderRoute(<div>Admin Content</div>, PlatformRole.ADMIN);
    expect(screen.getByText(/Required role:/)).toBeInTheDocument();
    expect(screen.getByText(/Your role:/)).toBeInTheDocument();
  });
});
