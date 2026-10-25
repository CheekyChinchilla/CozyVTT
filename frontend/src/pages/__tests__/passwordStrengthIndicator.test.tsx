/**
 * The sign-up page and the setup wizard show one password strength indicator.
 *
 * Each page drew its own copy of it. Both now render PasswordStrengthIndicator;
 * the sign-up page adds the id its password field names and announces the
 * change. These pin what each page shows and fail if the two drift apart.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { AuthContextType } from '@/types/user.types';

vi.mock('framer-motion', () => {
  const MotionDiv = (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: unknown } & Record<string, unknown>;
    const plain = Object.fromEntries(Object.entries(rest).filter(([k]) => !/^(initial|animate|exit|transition|layout|whileHover|whileTap)$/.test(k)));
    return <div {...(plain as Record<string, unknown>)}>{children as never}</div>;
  };
  return {
    useReducedMotionConfig: () => false,
    motion: new Proxy({}, { get: () => MotionDiv }),
    AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
  };
});
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ mascotUrl: '/mascot.png' }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: (): Partial<AuthContextType> => ({ authenticated: false, loading: false, register: vi.fn(), adoptSession: vi.fn() }),
}));
vi.mock('@/services/api', () => ({
  api: { getRegistrationStatus: vi.fn().mockResolvedValue({ allowRegistration: true }) },
}));
const setupService = vi.hoisted(() => ({
  checkSetupStatus: vi.fn().mockResolvedValue({ setupCompleted: false, hasUsers: false, needsSetup: true }),
  initializeSetup: vi.fn(),
}));
vi.mock('@/services/setup.service', () => ({ setupService, default: setupService }));

import RegisterPage from '../auth/RegisterPage';
import SetupWizardPage from '../SetupWizardPage';

/** The indicator's markup: the block that holds "Password Strength:". */
function indicator(): HTMLElement {
  const label = screen.getByText('Password Strength:');
  return label.parentElement!.parentElement!;
}

function onRegister(password: string): HTMLElement {
  render(<MemoryRouter><RegisterPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  return indicator();
}

async function onSetup(password: string): Promise<HTMLElement> {
  render(<MemoryRouter><SetupWizardPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /next/i }));
  await screen.findByText('Create Admin Account');
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  return indicator();
}

const PASSWORDS: [string, string][] = [
  ['Weak', 'abc'],
  ['Fair', 'abcdefgh1'],
  ['Good', 'Abcdefgh12!x'],
  ['Strong', 'StrongPass123!@#$'],
];

describe('the password strength indicator', () => {
  it.each(PASSWORDS)('shows %s the same on both pages', async (label, password) => {
    const register = onRegister(password);
    expect(register.id).toBe('password-strength');
    expect(register.getAttribute('aria-live')).toBe('polite');
    const bare = register.cloneNode(true) as HTMLElement;
    bare.removeAttribute('id');
    bare.removeAttribute('aria-live');
    const registerMarkup = bare.outerHTML;
    cleanup();

    const setup = await onSetup(password);
    expect(setup.textContent).toContain(label);
    expect(setup.outerHTML).toBe(registerMarkup);
  });

  it('draws the bar and label as they always were', () => {
    expect(onRegister('abcdefgh1').outerHTML).toBe(
      '<div id="password-strength" class="mt-2" aria-live="polite">' +
        '<div class="flex items-center justify-between mb-1">' +
        '<span class="text-xs text-warm-gray">Password Strength:</span>' +
        '<span class="text-xs font-medium text-danger-ink">Fair</span>' +
        '</div>' +
        '<div class="w-full bg-warm-gray/20 rounded-full h-1.5">' +
        '<div class="h-1.5 rounded-full transition-all bg-danger" style="width: 43%;"></div>' +
        '</div>' +
        '</div>'
    );
  });
});
