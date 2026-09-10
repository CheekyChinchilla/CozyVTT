/**
 * Splitting VITE_SOCKET_URL into what socket.io actually wants.
 *
 * `io(url)` reads the URL's *pathname* as a namespace, not as a location — so
 * pointing the setting at `https://host/cozyvtt` asked for a namespace the
 * server has never registered, and the connection simply failed. Where the
 * endpoint lives is the separate `path` option, which was never passed at all.
 *
 * An origin with no path happened to work by accident, because the default
 * `path` is already `/socket.io`. Anything with a path did not.
 */

import { describe, it, expect } from 'vitest';
import { socketTarget } from '../socketTarget';

describe('socketTarget', () => {
  it('stays relative when nothing is configured', () => {
    // The shipped default: same origin, proxied by nginx or the dev server.
    expect(socketTarget('')).toEqual({ origin: '', path: '/socket.io' });
    expect(socketTarget(undefined)).toEqual({ origin: '', path: '/socket.io' });
  });

  it('keeps an origin as an origin', () => {
    expect(socketTarget('https://api.example.com')).toEqual({
      origin: 'https://api.example.com',
      path: '/socket.io',
    });
  });

  it('moves a path off the origin and onto the path option', () => {
    // This is the case that could never have worked: /cozyvtt was being read
    // as a namespace.
    expect(socketTarget('https://example.com/cozyvtt')).toEqual({
      origin: 'https://example.com',
      path: '/cozyvtt/socket.io',
    });
  });

  it('handles a bare path with no origin', () => {
    expect(socketTarget('/cozyvtt')).toEqual({ origin: '', path: '/cozyvtt/socket.io' });
  });

  it('does not care about a trailing slash', () => {
    expect(socketTarget('https://example.com/')).toEqual({
      origin: 'https://example.com',
      path: '/socket.io',
    });
    expect(socketTarget('https://example.com/cozyvtt/')).toEqual({
      origin: 'https://example.com',
      path: '/cozyvtt/socket.io',
    });
  });

  it('ignores surrounding whitespace, which .env files collect', () => {
    expect(socketTarget('  https://example.com/cozyvtt  ')).toEqual({
      origin: 'https://example.com',
      path: '/cozyvtt/socket.io',
    });
  });

  it('falls back to relative rather than throwing on something unparseable', () => {
    // A misconfigured .env should degrade to the default, not crash the app
    // before it can render an error.
    expect(socketTarget('not a url')).toEqual({ origin: '', path: '/socket.io' });
  });
});
