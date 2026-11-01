/**
 * The avatar on the Profile page is a button the keyboard reaches.
 *
 * It opened the file chooser on a click alone: a picture in a plain box,
 * with the file box hidden, so Tab never stopped on it, a screen reader did
 * not call it a control, and closing Crop Avatar left the focus nowhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import ProfilePage from '../ProfilePage';
import { waitForDialogFocus } from '@/test/dialogFocus';

let avatarUrl: string | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-1', email: 'sam@example.test', displayName: 'Sam', platformRole: 'USER', mfaEnabled: false, avatarUrl },
    logout: vi.fn(),
    refreshUser: vi.fn(),
    changePassword: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ appearance: null, applyUserPreferences: vi.fn() }),
}));
vi.mock('@/hooks/queries', () => ({
  useServerConfigQuery: () => ({ data: undefined }),
}));
vi.mock('@/components/profile/MFASection', () => ({ default: () => null }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>
  );
}

/** Press Tab until `target` has the focus, or fail. */
async function tabTo(target: HTMLElement) {
  for (let i = 0; i < 30 && document.activeElement !== target; i++) await userEvent.tab();
  expect(target).toHaveFocus();
}

beforeEach(() => {
  avatarUrl = null;
});

describe('the avatar on the Profile page', () => {
  it('is a button named for what it does, with or without an avatar', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Choose avatar' })).toBeInTheDocument();
  });

  it('is reached with Tab, and Enter opens the file chooser', async () => {
    avatarUrl = '/api/assets/avatars/u-1';
    const { container } = renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No avatar file input');
    const choose = vi.spyOn(input, 'click');

    const avatar = screen.getByRole('button', { name: 'Change avatar' });
    await tabTo(avatar);
    await userEvent.keyboard('{Enter}');

    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('has the focus again once Crop Avatar closes', async () => {
    const { container } = renderPage();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No avatar file input');
    const avatar = screen.getByRole('button', { name: 'Choose avatar' });
    await tabTo(avatar);

    fireEvent.change(input, { target: { files: [new File(['picture'], 'me.png', { type: 'image/png' })] } });
    await waitForDialogFocus(await screen.findByRole('dialog', { name: 'Crop Avatar' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(avatar).toHaveFocus();
  });
});
