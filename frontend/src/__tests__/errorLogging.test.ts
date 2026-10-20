/**
 * No console line logs a caught error whole.
 *
 * An error the API client throws carries the request it answered, body
 * included (a password, a code), and error and warning lines are kept in
 * production builds. So a caught error is logged through errorSummary, which
 * keeps its status and message. The few logged whole are not API errors and
 * are named below with the reason.
 */

import { describe, it, expect } from 'vitest';

/** Every source file, by its path under src/, tests left out. */
const SOURCES = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/**/__tests__/**', '!/src/**/*.test.{ts,tsx}', '!/src/test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** file: the names a catch binds there that may be logged whole, and why. */
const LOGGED_WHOLE: Record<string, string[]> = {
  // A render error, thrown by the page's own code: its stack and the
  // component stack are what tell a developer where.
  'components/common/ErrorBoundary.tsx': ['error'],
  'components/character-sheets/ErrorBoundary.tsx': ['error'],
  // socket.io's connect_error and the server's `error` event: neither
  // carries a request, and the transport detail is what a broken proxy shows.
  'services/socket.ts': ['error'],
};

/** The names a catch block, a .catch handler or an error listener binds. */
function caughtNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/catch\s*\(\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.catch\(\s*\(?\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/componentDidCatch\(\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.on\(\s*'(?:connect_error|error)',\s*\(?\s*(\w+)/g)) names.add(m[1]);
  return names;
}

describe('console lines for caught errors', () => {
  it('pass the error through errorSummary', () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      const file = path.slice('/src/'.length);
      const caught = caughtNames(src);
      const allowed = new Set(LOGGED_WHOLE[file] ?? []);
      for (const call of src.matchAll(/console\.(?:error|warn)\(([^;]*?)\)+;/gs)) {
        const args = call[1].split(',').map((a) => a.trim());
        for (const arg of args.slice(1)) {
          if (caught.has(arg) && !allowed.has(arg)) offenders.push(`${file}: ${call[0].replace(/\s+/g, ' ')}`);
        }
      }
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });
});
