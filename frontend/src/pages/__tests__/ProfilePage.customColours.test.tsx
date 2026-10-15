/**
 * Dragging a custom colour on the Profile page saves once, not on every step.
 *
 * The colour picker reports every position it passes through while it is
 * dragged, and each one sent a preferences save and a reload of the signed-in
 * user: a few seconds of dragging made a hundred or more requests, enough to
 * reach the request limit, and an answer arriving late could put an older
 * colour back. The page now repaints at once and saves when the colour has
 * stopped changing for a moment, and an answer older than the latest save is
 * ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { UserPreferences } from '@/types';
import ProfilePage from '../ProfilePage';

const refreshUser = vi.fn(async () => undefined);
const applyUserPreferences = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl: null },
    logout: vi.fn(),
    refreshUser,
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));

const CUSTOM = { primary: '#7C9A6E', accent: '#D4A55A', background: '#FAF6EC', text: '#3A2E26' };

const api = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));
vi.mock('@/services/api', () => ({ api, default: api }));
vi.mock('@/services/profile.service', () => ({
  profileService: { deleteAccount: vi.fn(), updateProfile: vi.fn(), uploadAvatar: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.getUserPreferences.mockResolvedValue({ themeId: 'custom', fontId: 'default', customThemeColors: CUSTOM });
  api.updateUserPreferences.mockImplementation(async (_id: string, updates: Partial<UserPreferences>) => ({
    themeId: 'custom', fontId: 'default', customThemeColors: CUSTOM, ...updates,
  }));
});

async function backgroundPicker(): Promise<HTMLInputElement> {
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  );
  return (await screen.findByLabelText('Background color')) as HTMLInputElement;
}

const hex = (n: number) => `#${n.toString(16).padStart(2, '0')}F6EC`.toUpperCase();

describe('dragging a custom colour on the Profile page', () => {
  it('repaints on every step but saves once, with the last colour', async () => {
    const picker = await backgroundPicker();

    for (let n = 0x10; n < 0x40; n++) fireEvent.change(picker, { target: { value: hex(n) } });

    // Repainted at once, step by step.
    expect(applyUserPreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({ customThemeColors: expect.objectContaining({ background: hex(0x3f).toLowerCase() }) })
    );
    expect(api.updateUserPreferences).not.toHaveBeenCalled();

    await waitFor(() => expect(api.updateUserPreferences).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(api.updateUserPreferences.mock.calls[0][1]).toMatchObject({
      customThemeColors: expect.objectContaining({ background: hex(0x3f).toLowerCase() }),
    });
    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
  });

  it('keeps the newest colour when an older save answers last', async () => {
    const answers: ((prefs: UserPreferences) => void)[] = [];
    api.updateUserPreferences.mockImplementation(
      () => new Promise<UserPreferences>((resolve) => { answers.push(resolve); })
    );
    const picker = await backgroundPicker();

    fireEvent.change(picker, { target: { value: '#111111' } });
    await waitFor(() => expect(answers).toHaveLength(1), { timeout: 2000 });
    fireEvent.change(picker, { target: { value: '#222222' } });
    await waitFor(() => expect(answers).toHaveLength(2), { timeout: 2000 });

    await act(async () => {
      answers[1]({ themeId: 'custom', fontId: 'default', customThemeColors: { ...CUSTOM, background: '#222222' } });
    });
    await act(async () => {
      answers[0]({ themeId: 'custom', fontId: 'default', customThemeColors: { ...CUSTOM, background: '#111111' } });
    });

    expect((screen.getByLabelText('Background color') as HTMLInputElement).value).toBe('#222222');
  });
});
