/**
 * Every method and path an Express app answers, read from its router stack.
 *
 * The route tests walk the app the integration tests use, so a route added to
 * any router shows up here without anyone listing it. Express 4 keeps the
 * stack on `app._router`, which its type definitions leave out; the shapes
 * below are the parts this reads.
 */

import type { Express, RequestHandler } from 'express';

interface StackHandler {
  handle: unknown;
  method?: string;
}

interface RouteRecord {
  path: string | string[];
  methods: Record<string, boolean>;
  stack: StackHandler[];
}

interface Layer {
  name: string;
  handle: unknown;
  regexp: RegExp & { fast_slash?: boolean };
  keys: Array<{ name: string | number }>;
  route?: RouteRecord;
}

export interface MountedRoute {
  /** Upper case, as in `GET`. */
  method: string;
  /** The full path with Express parameters, as in `/api/campaigns/:campaignId`. */
  path: string;
  /** Every handler on the route, guards first, in the order Express runs them. */
  handlers: unknown[];
}

function stackOf(handle: unknown): Layer[] | null {
  if ((typeof handle === 'function' || typeof handle === 'object') && handle !== null && 'stack' in handle) {
    const stack = (handle as { stack: unknown }).stack;
    if (Array.isArray(stack)) return stack as Layer[];
  }
  return null;
}

/**
 * The path a router was mounted at, recovered from the pattern Express built
 * for it. `/api/campaigns/:campaignId/maps` becomes
 * `^\/api\/campaigns(?:\/([^/]+?))\/maps\/?(?=\/|$)`, so the parameter
 * groups are put back by name and the escaping removed.
 */
export function mountPathOf(layer: Pick<Layer, 'regexp' | 'keys'>): string {
  if (layer.regexp.fast_slash) return '';
  let index = 0;
  const source = layer.regexp.source
    .replace(/\(\?:(\\\/)?\(\[\^\\?\/\]\+\?\)\)/g, (_m, slash: string | undefined) =>
      `${slash ? '/' : ''}:${String(layer.keys[index++]?.name)}`
    )
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');
  if (/[\\()[\]^$*+?|]/.test(source)) {
    throw new Error(`Cannot read the mount path from ${layer.regexp.source}; teach routeInventory this pattern`);
  }
  return source;
}

function walk(layers: Layer[], prefix: string, out: MountedRoute[]): void {
  for (const layer of layers) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const handlers = layer.route.stack.map((s) => s.handle);
      for (const method of Object.keys(layer.route.methods)) {
        if (!layer.route.methods[method]) continue;
        for (const p of paths) {
          const full = `${prefix}${p === '/' ? '' : p}` || '/';
          out.push({ method: method === '_all' ? 'ALL' : method.toUpperCase(), path: full, handlers });
        }
      }
      continue;
    }
    const nested = stackOf(layer.handle);
    if (layer.name === 'router' && nested) {
      walk(nested, `${prefix}${mountPathOf(layer)}`, out);
    }
  }
}

/** Every route the app answers, in mount order. */
export function mountedRoutes(app: Express): MountedRoute[] {
  const root = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!root) throw new Error('The app has no router yet; add a route or middleware first');
  const out: MountedRoute[] = [];
  walk(root.stack, '', out);
  return out;
}

/** `GET /api/users/:id`, the form the inventories are written in. */
export const routeKey = (route: Pick<MountedRoute, 'method' | 'path'>): string => `${route.method} ${route.path}`;

/** Whether the route runs this handler, compared by identity. */
export const runs = (route: MountedRoute, handler: RequestHandler): boolean => route.handlers.includes(handler);

export interface AppLayer {
  /** The function's name, as in `session` or `router`. */
  name: string;
  /** Where it is mounted: '' for every path, `/api` for `app.use('/api', ...)`, the path of a route; null when unreadable, as for `*`. */
  path: string | null;
  handle: unknown;
  /** A route defined on the app itself, such as `GET /health`. */
  route: boolean;
}

/** The app's own middleware, routes and routers, in the order a request meets them. */
export function appLayers(app: Express): AppLayer[] {
  const root = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!root) throw new Error('The app has no router yet; add a route or middleware first');
  return root.stack.map((layer) => {
    let mount: string | null;
    if (layer.route) {
      mount = Array.isArray(layer.route.path) ? layer.route.path.join(',') : layer.route.path;
    } else {
      try {
        mount = mountPathOf(layer);
      } catch {
        mount = null;
      }
    }
    return { name: layer.name, path: mount, handle: layer.handle, route: Boolean(layer.route) };
  });
}
