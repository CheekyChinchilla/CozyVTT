/**
 * Signing out deletes the user's drafts of Paint in this browser.
 *
 * A draft holds the pixels of a map the GM has not saved, which the players
 * have not seen; it is kept in the browser's IndexedDB, which outlives the
 * sign-in. On a shared computer the next person to use the browser could
 * read it there. So an explicit sign-out drops every draft of the user who
 * signs out, and leaves another user's alone. (Leaving a page with paint
 * not saved on screen asks first, as before: no sign-out is on that page.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from '../AuthContext';
import { memoryDraftStore, type MemoryDraftStore } from '@/test/memoryDraftStore';
import { draftKey, type DraftHeader, type PaintTab } from '@/components/campaign/map/paint/paintDrafts';
import type { User } from '@/types/user.types';
import { PlatformRole } from '@/types';

const h = vi.hoisted(() => ({
  store: null as unknown,
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/services/auth.service', () => ({
  authService: {
    getCurrentUser: (...args: never[]) => h.getCurrentUser(...args),
    logout: (...args: never[]) => h.logout(...args),
    login: vi.fn(),
    register: vi.fn(),
  },
}));

/** This tab, as drafts tell tabs apart; the browser cannot tell which others are open. */
const tab: PaintTab = { id: () => 'this-tab', open: () => Promise.resolve(null) };
vi.mock('@/components/campaign/map/paint/paintDrafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/campaign/map/paint/paintDrafts')>()),
  paintDraftStore: () => h.store,
  paintTab: () => tab,
}));

const person = (id: string): User => ({
  id,
  email: `${id}@example.test`,
  displayName: id,
  platformRole: PlatformRole.USER,
  globalAssetManager: false,
  templateEditor: false,
  mfaEnabled: false,
  mustChangePassword: false,
  avatarUrl: null,
  bio: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
});

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const drafts = () => h.store as MemoryDraftStore;
const header = (userId: string, mapId: string, tabId = 'closed-tab'): DraftHeader => ({
  key: draftKey(userId, 'campaign-1', mapId, tabId), userId, campaignId: 'campaign-1', mapId, tabId, baseUrl: '', width: 10, height: 10, savedAt: 0,
});
const kept = () => [...drafts().headers.values()].map((d) => `${d.userId} ${d.mapId}`).sort();

beforeEach(() => {
  vi.clearAllMocks();
  h.store = memoryDraftStore();
  h.logout.mockResolvedValue(undefined);
  h.getCurrentUser.mockResolvedValue(person('alice'));
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('signing out', () => {
  it('deletes the drafts of the user signing out in this browser, and no one else\'s', async () => {
    await drafts().put(header('alice', 'map-a'), [], true);
    await drafts().put(header('alice', 'map-b', 'this-tab'), [], true);
    await drafts().put(header('bob', 'map-a'), [], true);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    await act(async () => { await result.current.logout(); });

    expect(kept()).toEqual(['bob map-a']);
    expect(result.current.user).toBeNull();
  });

  it('deletes them when the server could not be told, as the browser signs out anyway', async () => {
    await drafts().put(header('alice', 'map-a'), [], true);
    h.logout.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));

    await act(async () => { await result.current.logout(); });

    expect(kept()).toEqual([]);
  });

  it('is not held up by a store that does not answer', async () => {
    drafts().hanging = true;
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let done = false;
      act(() => { void result.current.logout().then(() => { done = true; }); });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
