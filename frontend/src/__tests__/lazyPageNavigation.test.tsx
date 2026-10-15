/**
 * What shows while a page's code is still downloading.
 *
 * App loads each page with React.lazy inside one <Suspense> whose fallback is
 * a full-screen spinner. The app's router has the router's transitions turned
 * off, so moving to a page whose code has not arrived swaps the page for the
 * spinner, as it did before the upgrade to React Router 8. With transitions
 * on, the page you were on would stay on screen instead.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { lazy, Suspense, type ComponentType } from 'react';
import { act, render, screen } from '@testing-library/react';
import { Route, Routes, useNavigate } from 'react-router';
import AppRouter from '@/AppRouter';

/** A lazy page whose code arrives when the test says so. */
function slowPage(text: string) {
  let arrive: (page: { default: ComponentType }) => void = () => {};
  const Page = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve) => {
        arrive = resolve;
      })
  );
  return { Page, arrive: () => arrive({ default: () => <p>{text}</p> }) };
}

function Dashboard() {
  const navigate = useNavigate();
  return (
    <div>
      <p>Dashboard</p>
      <button type="button" onClick={() => navigate('/characters')}>
        Characters
      </button>
    </div>
  );
}

describe('moving to a page whose code is still loading', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/dashboard');
  });

  it('shows the spinner until the next page is ready', async () => {
    const characters = slowPage('Characters page');
    render(
      <AppRouter>
        <Suspense fallback={<p>Loading page</p>}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/characters" element={<characters.Page />} />
          </Routes>
        </Suspense>
      </AppRouter>
    );

    await act(async () => screen.getByRole('button', { name: 'Characters' }).click());
    // React keeps the page it hides, out of sight, until the next one shows.
    expect(screen.getByText('Loading page')).toBeVisible();
    expect(screen.getByText('Dashboard')).not.toBeVisible();

    await act(async () => characters.arrive());
    expect(await screen.findByText('Characters page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });
});
