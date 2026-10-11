/**
 * A full page load, for the API client's redirects to sign in and to the
 * pages an account must visit first. A full load also drops everything the
 * page held in memory, the cached lists included. In its own module so the
 * tests can see where a page was sent without leaving it.
 */
export function loadPage(url: string): void {
  window.location.href = url;
}
