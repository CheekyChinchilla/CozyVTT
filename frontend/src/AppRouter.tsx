import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router';

/**
 * The router the app runs in.
 *
 * React Router 7 and later wrap each move between pages in a React
 * transition unless told not to. Code that changes state and then navigates,
 * such as signing out and then opening the sign-in page, would then render
 * once more at the old address with the new state: the profile page with no
 * one signed in, which sends the browser to sign in with a return address
 * that replaces the move. Turning transitions off keeps moves as React Router
 * 6 made them: the new page renders at once, and a page still loading shows
 * the spinner.
 */
export default function AppRouter({ children }: { children: ReactNode }) {
  return <BrowserRouter useTransitions={false}>{children}</BrowserRouter>;
}
