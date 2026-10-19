/**
 * The security headers the app page is served with.
 *
 * These live in nginx configuration, so nothing in the application would fail
 * if they were weakened or dropped; the app works fine with no policy at all,
 * which is exactly how it shipped without one. This reads the files instead.
 *
 * Two things are pinned. First, the directives that make the policy worth
 * having, chief among them a script-src with no 'unsafe-inline': the built page
 * has no inline script, so injected markup cannot execute, and that is the
 * whole point.
 *
 * Second, the nginx inheritance trap. A location block that sets any add_header
 * of its own silently discards every add_header from the enclosing server
 * block, and `try_files` sends `/` through the `= /index.html` block. A policy
 * written once at server level therefore reaches nothing. Every location has to
 * include the file, so that is asserted per block rather than trusted.
 */

import { describe, it, expect } from 'vitest';
// Imported as text rather than read with fs: this project has no Node types,
// and a test is not a reason to add a dependency to the whole frontend.
import headers from '../../security-headers.conf?raw';
import siteConfig from '../../nginx.conf?raw';

/** The Content-Security-Policy value, as one string. */
const csp = (() => {
  const match = headers.match(/add_header\s+Content-Security-Policy\s+"([^"]+)"/);
  if (!match) throw new Error('no Content-Security-Policy in security-headers.conf');
  return match[1];
})();

/** One directive's source list, e.g. directive('script-src'). */
function directive(name: string): string {
  const found = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`no ${name} in the policy`);
  return found.slice(name.length).trim();
}

describe('the app page policy', () => {
  it('refuses inline and evaluated script, which is what stops an injection running', () => {
    expect(directive('script-src')).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(directive('script-src')).toContain("'self'");
    expect(directive('script-src-attr')).toBe("'none'");
  });

  it('shuts the doors nothing needs', () => {
    expect(directive('object-src')).toBe("'none'");
    expect(directive('frame-ancestors')).toBe("'none'");
    expect(directive('base-uri')).toBe("'self'");
    expect(directive('form-action')).toBe("'self'");
  });

  it('allows what the app genuinely loads', () => {
    // The typefaces are part of the app and come from this instance; small
    // ones are inlined into the stylesheet as data: addresses by the build.
    expect(directive('font-src').split(/\s+/).sort()).toEqual(["'self'", 'data:']);
    expect(directive('style-src')).not.toMatch(/https?:/);
    // Canvas exports and the avatar crop preview.
    expect(directive('img-src')).toContain('data:');
    expect(directive('img-src')).toContain('blob:');
    // Socket.io, and the sandboxed PDF frame in the document reader.
    // The socket on the page's own host, named outright: a bare ws: or wss:
    // allowed a connection to any host, and 'self' alone does not match ws:
    // and wss: in every supported browser.
    expect(directive('connect-src').split(/\s+/)).toEqual(["'self'", 'ws://$host:*', 'wss://$host:*']);
    expect(directive('frame-src')).toContain("'self'");
    expect(directive('media-src')).toContain("'self'");
  });

  it('leaves plain-HTTP instances alone', () => {
    // CozyVTT is commonly served over http on a home network. This directive
    // would rewrite every request on such an instance to https and break it.
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('carries the headers that are not the policy', () => {
    expect(headers).toMatch(/add_header\s+X-Content-Type-Options\s+"nosniff"/);
    expect(headers).toMatch(/add_header\s+X-Frame-Options\s+"DENY"/);
    expect(headers).toMatch(/add_header\s+Referrer-Policy/);
  });

  it('marks every header `always`, so they survive an error response too', () => {
    const added = headers.match(/^\s*add_header\s+.*$/gm) ?? [];
    expect(added.length).toBeGreaterThan(0);
    for (const line of added) expect(line.trimEnd()).toMatch(/\salways;$/);
  });
});

describe('the site config', () => {
  const include = 'include /etc/nginx/security-headers.conf;';

  it('includes the headers in every location, because nginx does not inherit them', () => {
    const blocks = siteConfig.match(/location[^{]*\{[^}]*\}/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    const missing = blocks
      .filter((block) => !block.includes(include))
      .map((block) => block.slice(0, block.indexOf('{')).trim());
    expect(missing).toEqual([]);
  });

  it('still serves the SPA fallback', () => {
    // Pages are walked in spaFallback.test.ts; this is that the fallback is there.
    expect(siteConfig).toMatch(/try_files \$uri \/index\.html;/);
  });

  /** A directive's value at server level, comments dropped. */
  const setting = (name: string) =>
    siteConfig
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .find((line) => line.startsWith(`${name} `))
      ?.slice(name.length)
      .replace(/;$/, '')
      .trim();

  it('compresses the scripts, styles and data it sends', () => {
    // About 2 MB of script and style went out as it was, the whole app on
    // every first visit, to a phone on mobile data as much as anyone.
    expect(setting('gzip')).toBe('on');
    expect(setting('gzip_types')?.split(/\s+/)).toEqual(
      expect.arrayContaining(['text/css', 'application/javascript', 'application/json', 'image/svg+xml'])
    );
    expect(setting('gzip_vary')).toBe('on');
  });

  it('does not name its nginx version', () => {
    expect(setting('server_tokens')).toBe('off');
  });
});
