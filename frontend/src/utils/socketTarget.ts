/**
 * Where the live connection lives, split the way socket.io wants it.
 *
 * `io(url, opts)` treats the URL's pathname as a **namespace**, not as a
 * location — so `io('https://host/cozyvtt')` asks for a namespace the server
 * never registered and the connection fails. Where the endpoint is served from
 * is the separate `path` option, which defaults to `/socket.io`.
 *
 * That default is why an origin with no path has always worked, and why
 * `VITE_SOCKET_URL` appeared functional: nobody had tried a value with a path
 * in it. This splits the setting into the two things socket.io actually takes.
 */

const DEFAULT_PATH = '/socket.io';

export interface SocketTarget {
  /** Passed to `io()`. Empty means the page's own origin. */
  origin: string;
  /** Passed as the `path` option. Always ends in `/socket.io`. */
  path: string;
}

export function socketTarget(configured: string | undefined): SocketTarget {
  const raw = (configured ?? '').trim();
  if (!raw) return { origin: '', path: DEFAULT_PATH };

  // Only two shapes are meaningful: a full origin, or an absolute path. Anything
  // else is a misconfiguration, and `URL` would quietly turn it into a path —
  // "not a url" becoming "/not%20a%20url/socket.io" is a worse failure than
  // ignoring it, because it looks deliberate in a network log.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith('/')) {
    return { origin: '', path: DEFAULT_PATH };
  }

  // `URL` needs a base to resolve a bare path like "/cozyvtt"; the base is
  // discarded unless the value supplied its own origin.
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://placeholder.invalid');
  } catch {
    // A misconfigured setting should fall back to the default rather than
    // throw before the app can render anything at all.
    return { origin: '', path: DEFAULT_PATH };
  }

  const origin = parsed.origin === 'http://placeholder.invalid' ? '' : parsed.origin;
  const prefix = parsed.pathname.replace(/\/+$/, '');

  return { origin, path: `${prefix}${DEFAULT_PATH}` };
}
