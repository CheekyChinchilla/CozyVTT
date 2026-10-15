/**
 * The route inventory helper reads the app the way the route tests expect.
 *
 * Five test files (the route inventory, the limiter wiring, the campaign role
 * guards, the admin routes and the app assembly) rely on what
 * helpers/routeInventory.ts reads from Express's router stack, and that stack
 * is internal to Express. helpers/routeInventory.expected.json holds every
 * route and every app layer, with the handlers each route runs by name, as
 * the helper read them from the app server.ts builds. A change to Express or
 * to the helper that reads any of them differently fails here.
 *
 * When a route or middleware is added on purpose, regenerate the file: run
 * this test with WRITE_ROUTE_INVENTORY=1 and read the diff before committing
 * it.
 */

import fs from 'fs';
import path from 'path';
import { createApp, createGeneralApiLimiter } from '../app';
import { sessionOptions } from '../config/sessionOptions';
import { appLayers, mountedRoutes } from './helpers/routeInventory';

const EXPECTED = path.join(__dirname, 'helpers', 'routeInventory.expected.json');

const nameOf = (handler: unknown): string =>
  typeof handler === 'function' && handler.name ? handler.name : '<anonymous>';

interface Inventory {
  routes: Array<{ method: string; path: string; handlers: string[] }>;
  layers: Array<{ name?: string; path: string | null; route: boolean }>;
}

function inventory(): Inventory {
  // The app as the server builds it: every gate on, the general limit included.
  const app = createApp({
    session: { ...sessionOptions, secret: 'test-secret-do-not-use-in-production' },
    generalApiLimiter: createGeneralApiLimiter(),
  });
  return {
    routes: mountedRoutes(app).map((route) => ({
      method: route.method,
      path: route.path,
      handlers: route.handlers.map(nameOf),
    })),
    layers: appLayers(app)
      // A route's layer runs Express's own dispatcher, whose name is Express's
      // business; the route's path says which one it is.
      .map((layer) => (layer.route ? { path: layer.path, route: true } : { name: layer.name, path: layer.path, route: false })),
  };
}

it('reads every route and app layer as recorded', () => {
  const actual = inventory();
  if (process.env.WRITE_ROUTE_INVENTORY === '1') {
    fs.writeFileSync(EXPECTED, `${JSON.stringify(actual, null, 2)}\n`);
  }
  const expected: unknown = JSON.parse(fs.readFileSync(EXPECTED, 'utf8'));
  expect(actual).toEqual(expected);
});

it('records enough of the app to mean something', () => {
  const { routes, layers } = inventory();
  expect(routes.length).toBeGreaterThan(150);
  expect(routes.find((route) => route.method === 'GET' && route.path === '/api/campaigns/:campaignId/maps/:id')?.handlers).toContain('requireAuth');
  expect(layers.filter((layer) => layer.name === 'router').length).toBeGreaterThan(10);
});
