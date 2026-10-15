/**
 * Every method and path an Express app answers, read from its router stack.
 *
 * The route tests walk the app the integration tests use, so a route added to
 * any router shows up here without anyone listing it. Express keeps the stack
 * on `app.router`. Its layers no longer hold the path a router was mounted
 * at, so this file wraps `app.use` and notes the path of each layer it adds:
 * import it before the app is built, as every test file does by importing it
 * at the top. routeInventoryHelper.test.ts holds what this reads from the
 * server's app, and fails when an upgrade or a change here reads it
 * differently.
 */

import express, { type Application, type Express } from 'express';

/** One entry of a router's stack: a middleware, a route or a router. */
type ILayer = Express['router']['stack'][number];

/** The path each app-level layer was mounted at; null when not a plain path. */
const mountPaths = new WeakMap<ILayer, string | null>();

const originalUse = express.application.use;

/** Express's own `app.use`, which also notes the path of each layer it adds. */
function recordingUse(this: Application, ...args: unknown[]): Application {
  const stack = this.router.stack;
  const before = stack.length;
  const [first] = args;
  // A first argument that is not a handler is the path; without one, the
  // layer matches every path, which the route tests write as ''.
  const isHandler = typeof first === 'function' || (Array.isArray(first) && first.length > 0 && typeof first.flat(Infinity)[0] === 'function');
  let mount: string | null = '';
  if (!isHandler) mount = typeof first === 'string' ? (first === '/' ? '' : first) : null;
  Reflect.apply(originalUse, this, args);
  for (const layer of stack.slice(before)) mountPaths.set(layer, mount);
  return this;
}
express.application.use = recordingUse;

export interface MountedRoute {
  /** Upper case, as in `GET`. */
  method: string;
  /** The full path with Express parameters, as in `/api/campaigns/:campaignId`. */
  path: string;
  /** Every handler on the route, guards first, in the order Express runs them. */
  handlers: unknown[];
}

function stackOf(handle: unknown): ILayer[] | null {
  if (typeof handle === 'function' && 'stack' in handle && Array.isArray(handle.stack)) {
    const stack: unknown[] = handle.stack;
    return stack.every(isLayer) ? stack : null;
  }
  return null;
}

function isLayer(value: unknown): value is ILayer {
  return typeof value === 'object' && value !== null && 'handle' in value && 'name' in value;
}

/** The path a layer of the app's own stack was mounted at. */
function mountPathOf(layer: ILayer): string | null {
  const mount = mountPaths.get(layer);
  if (mount === undefined) {
    throw new Error('This layer was added before routeInventory was imported; import it before building the app');
  }
  return mount;
}

/** The methods a route answers, in the order its handlers were added. */
function methodsOf(stack: ILayer[]): string[] {
  // A handler added with `.all()` has no method of its own.
  const methods = stack.map((handler): string | undefined => handler.method).map((method) => (method === undefined ? 'ALL' : method.toUpperCase()));
  return [...new Set(methods)];
}

function walk(layers: ILayer[], prefix: string, out: MountedRoute[], topLevel: boolean): void {
  for (const layer of layers) {
    if (layer.route) {
      const handlers = layer.route.stack.map((s) => s.handle);
      const full = `${prefix}${layer.route.path === '/' ? '' : layer.route.path}` || '/';
      for (const method of methodsOf(layer.route.stack)) out.push({ method, path: full, handlers });
      continue;
    }
    const nested = stackOf(layer.handle);
    if (layer.name === 'router' && nested) {
      if (!topLevel) throw new Error('A router is mounted inside a router; teach routeInventory to read its path');
      const mount = mountPathOf(layer);
      if (mount === null) throw new Error('A router is mounted at a path that is not a plain string; teach routeInventory to read it');
      walk(nested, `${prefix}${mount}`, out, false);
    }
  }
}

/** Every route the app answers, in mount order. */
export function mountedRoutes(app: Express): MountedRoute[] {
  const out: MountedRoute[] = [];
  walk(app.router.stack, '', out, true);
  return out;
}

/** `GET /api/users/:id`, the form the inventories are written in. */
export const routeKey = (route: Pick<MountedRoute, 'method' | 'path'>): string => `${route.method} ${route.path}`;

/** Whether the route runs this handler, compared by identity. */
export const runs = (route: MountedRoute, handler: unknown): boolean => route.handlers.includes(handler);

export interface AppLayer {
  /** The function's name, as in `session` or `router`. */
  name: string;
  /** Where it is mounted: '' for every path, `/api` for `app.use('/api', ...)`, the path of a route; null when not a plain path. */
  path: string | null;
  handle: unknown;
  /** A route defined on the app itself, such as `GET /health`. */
  route: boolean;
}

/** The app's own middleware, routes and routers, in the order a request meets them. */
export function appLayers(app: Express): AppLayer[] {
  return app.router.stack.map((layer) => ({
    name: layer.name,
    path: layer.route ? layer.route.path : mountPathOf(layer),
    handle: layer.handle,
    route: Boolean(layer.route),
  }));
}
