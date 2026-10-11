/**
 * Every app page is served by the app, including the one named like a folder.
 *
 * The Asset Library lives at /assets, which is also the name of the folder the
 * build puts its scripts and styles in. The page's fallback, `try_files $uri
 * $uri/ /index.html`, matched that folder and nginx then refused to list it,
 * 403 Forbidden (it may first redirect /assets to /assets/, an absolute
 * redirect that sends a visitor on port 8160 to port 80). Opening the page by
 * clicking worked, since the router never asks the server; reloading or
 * bookmarking it did not.
 *
 * No nginx runs in these tests, so this walks the site config the way nginx's
 * documentation says it reads a request, for the few directives the file
 * uses: the location choice (exact, then the first matching regular
 * expression, then the longest prefix), `if (-d ...)` with `rewrite ... last`,
 * `try_files` (a name ending in a slash tests for a folder, a match carries
 * on in the same location with that name as the address, the last argument
 * is an internal redirect) and the static handler (a folder answers with its
 * index file, or 403 when it has none and autoindex is off). The walk is a
 * reading of the documentation and has not been checked against a running
 * nginx.
 */

import { describe, it, expect } from 'vitest';
import siteConfig from '../../nginx.conf?raw';

/** What the built app holds in the web root. */
const BUILD = {
  files: ['/index.html', '/favicon-32.png', '/assets/index-3f9a.js', '/assets/index-8c21.css', '/assets/inter-latin.woff2'],
  folders: ['/', '/assets'],
};

interface Location {
  /** `=` exact, `~*` case-insensitive regular expression, or `` for a prefix. */
  modifier: '=' | '~*' | '';
  pattern: string;
  body: string;
}

/** The server block's locations, in file order. */
function locations(config: string): Location[] {
  const found: Location[] = [];
  const start = /location\s+(=\s+|~\*\s+)?(\S+)\s*\{/g;
  for (let match = start.exec(config); match; match = start.exec(config)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; end < config.length && depth > 0; end++) {
      if (config[end] === '{') depth++;
      else if (config[end] === '}') depth--;
    }
    found.push({
      modifier: (match[1]?.trim() ?? '') as Location['modifier'],
      pattern: match[2],
      body: config.slice(match.index + match[0].length, end - 1),
    });
  }
  return found;
}

/** nginx's choice: an exact match, else the first matching regular expression, else the longest prefix. */
function chooseLocation(all: Location[], uri: string): Location {
  const exact = all.find((l) => l.modifier === '=' && l.pattern === uri);
  if (exact) return exact;
  const regex = all.find((l) => l.modifier === '~*' && new RegExp(l.pattern, 'i').test(uri));
  if (regex) return regex;
  const prefixes = all.filter((l) => l.modifier === '' && uri.startsWith(l.pattern));
  const longest = prefixes.sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (!longest) throw new Error(`no location for ${uri}`);
  return longest;
}

type Served = { status: 200; file: string } | { status: 301 | 403 | 404; target?: string };

const isFolder = (uri: string) => BUILD.folders.includes(uri.length > 1 ? uri.replace(/\/$/, '') : uri);
const isFile = (uri: string) => BUILD.files.includes(uri);

/** The static handler: a file, a folder (its index file, a redirect to the slash, or a refusal), or nothing. */
function serveStatic(uri: string): Served {
  if (isFile(uri)) return { status: 200, file: uri };
  if (isFolder(uri)) {
    if (!uri.endsWith('/')) return { status: 301, target: `${uri}/` };
    return isFile(`${uri}index.html`) ? { status: 200, file: `${uri}index.html` } : { status: 403 };
  }
  return { status: 404 };
}

/** What the visitor is finally given for a request path. */
function serve(config: string, requested: string): Served {
  const all = locations(config);
  let uri = requested;
  for (let turn = 0; turn < 10; turn++) {
    const location = chooseLocation(all, uri);

    const folderRule = /if\s*\(\s*-d\s+\$request_filename\s*\)\s*\{\s*rewrite\s+\^\s+(\S+)\s+last;\s*\}/.exec(location.body);
    if (folderRule && isFolder(uri)) {
      uri = folderRule[1];
      continue;
    }

    const tryFiles = /try_files\s+([^;]+);/.exec(location.body);
    if (!tryFiles) return serveStatic(uri);

    const choices = tryFiles[1].trim().split(/\s+/);
    const fallback = choices.pop() as string;
    let next: string | null = null;
    for (const choice of choices) {
      const name = choice.replace('$uri', uri);
      // A name ending in a slash is tested as a folder, any other as a file.
      if (name.endsWith('/') ? isFolder(name) : isFile(name)) {
        next = name;
        break;
      }
    }
    if (next !== null) {
      if (!next.endsWith('/')) return { status: 200, file: next };
      uri = next;
      return serveStatic(uri);
    }
    if (fallback.startsWith('=')) return { status: Number(fallback.slice(1)) as 404 };
    uri = fallback;
  }
  throw new Error(`${requested} was redirected too many times`);
}

describe('the app page fallback', () => {
  it.each([
    ['the Asset Library, reloaded', '/assets'],
    ['the Asset Library, with a slash after it', '/assets/'],
    ['the front page', '/'],
    ['the dashboard', '/dashboard'],
    ['a campaign', '/campaigns/6f1c0b6e-9a07-4b8d-a1a5-2f9d3c1e7a10'],
    ['a page that does not exist, for the router to turn away', '/no/such/page'],
  ])('serves the app for %s', (_name, path) => {
    expect(serve(siteConfig, path)).toEqual({ status: 200, file: '/index.html' });
  });

  it('still serves the files of the build as they are', () => {
    expect(serve(siteConfig, '/assets/index-3f9a.js')).toEqual({ status: 200, file: '/assets/index-3f9a.js' });
    expect(serve(siteConfig, '/assets/index-8c21.css')).toEqual({ status: 200, file: '/assets/index-8c21.css' });
    expect(serve(siteConfig, '/assets/inter-latin.woff2')).toEqual({ status: 200, file: '/assets/inter-latin.woff2' });
    expect(serve(siteConfig, '/favicon-32.png')).toEqual({ status: 200, file: '/favicon-32.png' });
  });

  it('does not list or refuse the build folder, or redirect to it', () => {
    for (const path of ['/assets', '/assets/']) {
      const served = serve(siteConfig, path);
      expect(served.status).not.toBe(403);
      expect(served.status).not.toBe(301);
    }
  });

  it('makes any redirect of its own relative, which keeps the visitor\'s port', () => {
    expect(siteConfig).toMatch(/^\s*absolute_redirect\s+off;/m);
  });

  it('is checked against the way it failed: the old fallback refuses /assets', () => {
    const old = siteConfig.replace(/location \/ \{[\s\S]*?\n {4}\}\n/, 'location / {\n        try_files $uri $uri/ /index.html;\n    }\n');
    expect(old).not.toBe(siteConfig);
    expect(serve(old, '/assets')).toEqual({ status: 403 });
    expect(serve(old, '/assets/')).toEqual({ status: 403 });
    // Pages that are not folders were never affected.
    expect(serve(old, '/dashboard')).toEqual({ status: 200, file: '/index.html' });
  });
});
