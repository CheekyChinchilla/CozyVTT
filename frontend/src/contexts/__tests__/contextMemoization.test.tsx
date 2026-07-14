/**
 * Context value memoization regression tests.
 *
 * The campaign/websocket/auth providers memoize their context `value`
 * objects so that a provider re-render caused by a PARENT update (with no
 * internal state change) hands consumers the exact same value reference.
 * Without this, every provider render rebuilt the value object, so every
 * `token.moved` socket event re-rendered the entire campaign subtree.
 *
 * These tests lock that in: if someone removes the useMemo (or adds an
 * un-memoized field), the reference-identity assertions fail.
 *
 * Harness note: the bump button and providers live in the SAME component so
 * each bump recreates the provider elements — otherwise React's stable
 * children-element bailout would mask a missing useMemo entirely.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memo, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Service mocks (providers pull these in transitively) ─────────────────────

vi.mock('@/services/campaign.service', () => ({
  default: { getCampaign: vi.fn().mockResolvedValue({ id: 'c1', name: 'Test', memberships: [] }) },
}));

vi.mock('@/services/api', () => ({
  default: { getMap: vi.fn(), pingSession: vi.fn() },
  api: { getMap: vi.fn(), pingSession: vi.fn() },
}));

vi.mock('@/services/socket', () => ({
  default: {
    onCharacterHpUpdated: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    getSocket: vi.fn().mockReturnValue(null),
    startHeartbeat: vi.fn(),
  },
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: vi.fn().mockRejectedValue(new Error('not authenticated')),
  },
}));

import { CampaignProvider, useCampaign } from '../CampaignContext';
import { WebSocketProvider, useWebSocket } from '../WebSocketContext';
import { AuthProvider, useAuth } from '../AuthContext';

describe('context value memoization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CampaignContext hands out a stable value across parent re-renders', async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useCampaign());
      return null;
    }

    // No :id route param → loadCampaign never fires → provider state is static.
    function Harness() {
      const [, setN] = useState(0);
      return (
        <MemoryRouter>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          <AuthProvider>
            <CampaignProvider>
              <Probe />
            </CampaignProvider>
          </AuthProvider>
        </MemoryRouter>
      );
    }
    render(<Harness />);

    // Let the AuthProvider's initial auth check settle.
    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1));

    const before = seen.length;
    await userEvent.click(screen.getByText('bump'));
    await userEvent.click(screen.getByText('bump'));

    // The bump must actually have re-rendered the consumer…
    expect(seen.length).toBeGreaterThan(before);
    // …and every render after it must observe the SAME value object.
    expect(seen[seen.length - 1]).toBe(seen[before - 1]);
  });

  it('WebSocketContext hands out a stable value across parent re-renders', async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useWebSocket());
      return null;
    }

    function Harness() {
      const [, setN] = useState(0);
      return (
        <MemoryRouter>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          <WebSocketProvider>
            <Probe />
          </WebSocketProvider>
        </MemoryRouter>
      );
    }
    render(<Harness />);

    await waitFor(() => expect(seen.length).toBeGreaterThanOrEqual(1));
    const before = seen.length;
    await userEvent.click(screen.getByText('bump'));
    await userEvent.click(screen.getByText('bump'));

    expect(seen.length).toBeGreaterThan(before);
    expect(seen[seen.length - 1]).toBe(seen[before - 1]);
  });

  it('AuthContext hands out a stable value across parent re-renders', async () => {
    const seen: Array<{ loading: boolean }> = [];
    function Probe() {
      seen.push(useAuth());
      return null;
    }

    function Harness() {
      const [, setN] = useState(0);
      return (
        <MemoryRouter>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          <AuthProvider>
            <Probe />
          </AuthProvider>
        </MemoryRouter>
      );
    }
    render(<Harness />);

    // Wait for the initial getCurrentUser() rejection to settle (loading: false).
    await waitFor(() => {
      expect(seen[seen.length - 1]?.loading).toBe(false);
    });

    const before = seen.length;
    await userEvent.click(screen.getByText('bump'));
    await userEvent.click(screen.getByText('bump'));

    expect(seen.length).toBeGreaterThan(before);
    expect(seen[seen.length - 1]).toBe(seen[before - 1]);
  });

  it('a memoized consumer skips re-rendering entirely when context state is unchanged', async () => {
    // React.memo + stable context value ⇒ parent churn can't reach the child.
    let renders = 0;
    const MemoProbe = memo(function MemoProbe() {
      useCampaign();
      renders += 1;
      return null;
    });

    function Harness() {
      const [, setN] = useState(0);
      return (
        <MemoryRouter>
          <button onClick={() => setN((n) => n + 1)}>bump</button>
          <AuthProvider>
            <CampaignProvider>
              <MemoProbe />
            </CampaignProvider>
          </AuthProvider>
        </MemoryRouter>
      );
    }
    render(<Harness />);

    // Let the initial auth check settle (it may legitimately re-render the tree).
    await waitFor(() => expect(renders).toBeGreaterThanOrEqual(1));
    const settled = renders;

    await userEvent.click(screen.getByText('bump'));
    await userEvent.click(screen.getByText('bump'));

    expect(renders).toBe(settled);
  });
});
