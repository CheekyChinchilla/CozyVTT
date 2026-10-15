/**
 * What shows while a page's code is still downloading.
 *
 * App loads each page with React.lazy inside one <Suspense> whose fallback is
 * a full-screen spinner. Opening the app shows that spinner until the first
 * page arrives. Moving to another page is different since React Router 7:
 * the router makes every move a React transition, so the page you were on
 * stays on screen until the next one is ready, and the spinner does not
 * flash. These checks hold that across router upgrades; the same move with
 * the router's transitions turned off, as React Router 6 behaved, still
 * swaps the page for the spinner.
 */

import { describe, it, expect } from 'vitest';
import { lazy, Suspense, type ComponentType } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';

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

function renderApp(useTransitions?: boolean) {
  const characters = slowPage('Characters page');
  render(
    <MemoryRouter initialEntries={['/dashboard']} useTransitions={useTransitions}>
      <Suspense fallback={<p>Loading page</p>}>
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/characters" element={<characters.Page />} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  );
  return characters;
}

describe('moving to a page whose code is still loading', () => {
  it('keeps the current page on screen until the next one is ready', async () => {
    const characters = renderApp();

    await act(async () => screen.getByRole('button', { name: 'Characters' }).click());
    expect(screen.getByText('Dashboard')).toBeVisible();
    expect(screen.queryByText('Loading page')).not.toBeInTheDocument();

    await act(async () => characters.arrive());
    expect(await screen.findByText('Characters page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('shows the spinner instead when the router does not use transitions', async () => {
    const characters = renderApp(false);

    await act(async () => screen.getByRole('button', { name: 'Characters' }).click());
    // React keeps the page it hides, out of sight, until the next one shows.
    expect(screen.getByText('Loading page')).toBeVisible();
    expect(screen.getByText('Dashboard')).not.toBeVisible();

    await act(async () => characters.arrive());
    expect(await screen.findByText('Characters page')).toBeInTheDocument();
  });
});
