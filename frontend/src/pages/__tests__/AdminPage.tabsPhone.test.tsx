/**
 * The Admin Panel's seven tabs need about 820 px, and the row never wrapped,
 * so on a phone every tab's page scrolled sideways. Below 1024 px the row now
 * scrolls in its own strip, the open tab kept in view, and on a touch screen
 * each tab is at least 44 px tall. A long name in the header breaks.
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminPage from '../AdminPage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', displayName: 'Root', platformRole: 'ADMIN' } }),
}));
vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ refreshAppearance: vi.fn() }),
}));

// Each tab's data never arrives: only the row of tabs is under test.
const pending = () => new Promise<never>(() => {});
const adminService = vi.hoisted(() => ({
  getStats: vi.fn(),
  getHealth: vi.fn(),
  getActivity: vi.fn(),
  getUsers: vi.fn(),
  getConfig: vi.fn(),
}));
vi.mock('@/services/admin.service', () => ({ adminService }));
vi.mock('@/services/api', () => ({
  api: { listAssets: () => new Promise<never>(() => {}), adminListAllCampaigns: () => new Promise<never>(() => {}) },
  default: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  adminService.getStats.mockImplementation(pending);
  adminService.getHealth.mockImplementation(pending);
  adminService.getActivity.mockImplementation(pending);
  adminService.getUsers.mockImplementation(pending);
  adminService.getConfig.mockImplementation(pending);
});

const classes = (el: Element) => el.className.split(/\s+/);

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );

it('scrolls the row of tabs in its own strip below 1024 px, so the page does not', () => {
  renderPage();
  const strip = screen.getByRole('tablist', { name: 'Admin tabs' });
  expect(classes(strip)).toEqual(expect.arrayContaining(['max-lg:overflow-x-auto']));
  // From 1024 px up all seven fit, and the row is as it was.
  expect(classes(strip)).not.toContain('overflow-x-auto');
  for (const tab of screen.getAllByRole('tab')) expect(classes(tab)).toContain('shrink-0');
});

it('makes every tab at least 44 px tall where the pointer is a finger', () => {
  renderPage();
  for (const tab of screen.getAllByRole('tab')) expect(classes(tab)).toContain('pointer-coarse:min-h-11');
});

it('scrolls the strip to show a tab opened past its edge, and back for one before it', () => {
  renderPage();
  const strip = screen.getByRole('tablist', { name: 'Admin tabs' });
  const tabs = screen.getAllByRole('tab');

  // A phone 360 px wide: the strip shows 0 to 360, the tabs 120 px apart.
  let scrollLeft = 0;
  Object.defineProperty(strip, 'scrollLeft', { get: () => scrollLeft, set: (v: number) => { scrollLeft = v; }, configurable: true });
  const rect = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: 40, width, height: 40, x: left, y: 0, toJSON: () => ({}) });
  vi.spyOn(strip, 'getBoundingClientRect').mockImplementation(() => rect(0, 360));
  tabs.forEach((tab, i) => vi.spyOn(tab, 'getBoundingClientRect').mockImplementation(() => rect(i * 120 - scrollLeft, 110)));

  fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
  expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  // Activity is the seventh, 720 to 830: the strip scrolls 470 to end at it.
  expect(scrollLeft).toBe(470);

  fireEvent.click(screen.getByRole('tab', { name: 'Users' }));
  // Users is the second, 120 to 230, which is now left of the strip.
  expect(scrollLeft).toBe(120);

  // One already in view moves nothing.
  fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
  expect(scrollLeft).toBe(120);

  // Tab from the keyboard to one half past the edge brings it into view,
  // though it is not open until it is pressed.
  fireEvent.focus(screen.getByRole('tab', { name: 'Backups' }));
  expect(scrollLeft).toBe(350);
  expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute('aria-selected', 'true');
});

it('lets a long name after Signed in as break, so it never widens the header', () => {
  // A name of one long word, such as 30 letters, ran 90 px past a 360 px phone.
  renderPage();
  const name = screen.getByText('Root');
  expect(name.parentElement).toHaveTextContent('Signed in as Root');
  expect(classes(name.parentElement as HTMLElement)).toEqual(expect.arrayContaining(['min-w-0', 'wrap-anywhere']));
});
