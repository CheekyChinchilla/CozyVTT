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

/**
 * The calls that log an error whole, exactly as written (spaces collapsed),
 * by file, and why. A new call in these files is checked like any other.
 */
const LOGGED_WHOLE: Record<string, string[]> = {
  // A render error, thrown by the page's own code: its stack and the
  // component stack are what tell a developer where.
  'components/common/ErrorBoundary.tsx': ["console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);"],
  'components/character-sheets/ErrorBoundary.tsx': ["console.error('Character sheet error:', error, errorInfo);"],
  // socket.io's connect_error and the server's `error` event: neither
  // carries a request, and the transport detail is what a broken proxy shows.
  'services/socket.ts': [
    "console.error('[Socket] Connection error:', error);",
    "console.error('[Socket] Server error event:', error);",
  ],
};

/** The names a catch block, a .catch handler, an error callback or listener binds. */
function caughtNames(src: string): Set<string> {
  const names = new Set<string>();
  for (const m of src.matchAll(/catch\s*\(\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.catch\(\s*(?:async\s*)?\(?\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/componentDidCatch\(\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.on\(\s*'(?:connect_error|error)',\s*\(?\s*(\w+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bon(?:Error|Reject\w*)\s*[:=(]\s*(?:async\s*)?\(?\s*(\w+)\s*\)?\s*=>/g)) names.add(m[1]);
  for (const m of src.matchAll(/\.then\([^;]*?,\s*\(?\s*(\w+)\s*\)?\s*=>/g)) names.add(m[1]);
  return names;
}

/**
 * Whether an argument logs a caught error, or a part of one that carries the
 * request, whole: the name alone, in braces or a template, or its response,
 * config or request. errorSummary(name), errorMessage(name) and name.message
 * are fine.
 */
function logsWhole(arg: string, name: string): boolean {
  const rest = arg
    // The message itself ('Logout error:') is not the error.
    .replace(/'[^']*'|"[^"]*"/g, '')
    // The pattern below takes a call's closing brackets, so the last ) of
    // errorSummary(name) may be gone.
    .replace(new RegExp(`(?:errorSummary|errorMessage)\\(\\s*${name}\\s*\\)?`, 'g'), '')
    .replace(new RegExp(`\\b${name}\\.(?:message|name|code|status)\\b`, 'g'), '');
  return new RegExp(`(?<![\\w.])${name}\\b`).test(rest);
}

describe('console lines for caught errors', () => {
  it('pass the error through errorSummary', () => {
    const offenders: string[] = [];
    for (const [path, src] of Object.entries(SOURCES)) {
      const file = path.slice('/src/'.length);
      const caught = [...caughtNames(src)];
      const allowed = new Set(LOGGED_WHOLE[file] ?? []);
      for (const call of src.matchAll(/console\.(?:error|warn)\(([^;]*?)\)+;/gs)) {
        const text = call[0].replace(/\s+/g, ' ');
        if (allowed.has(text)) continue;
        if (caught.some((name) => logsWhole(call[1], name))) offenders.push(`${file}: ${text}`);
      }
    }
    expect(Object.keys(SOURCES).length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it('names every call it lets through', () => {
    for (const [file, calls] of Object.entries(LOGGED_WHOLE)) {
      const src = SOURCES[`/src/${file}`];
      expect(src, file).toBeDefined();
      for (const text of calls) {
        const found = [...src.matchAll(/console\.(?:error|warn)\(([^;]*?)\)+;/gs)].some((c) => c[0].replace(/\s+/g, ' ') === text);
        expect(found, text).toBe(true);
      }
    }
  });
});
