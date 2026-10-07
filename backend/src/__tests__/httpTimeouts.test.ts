/**
 * How long the backend lets a request take to arrive.
 *
 * Node answers 408 to a request whose body takes longer than the server's
 * requestTimeout, 300 seconds by default. The bundled nginx streams campaign
 * imports (up to 500 MB) and backup restores straight through, so on a home
 * connection an upload slower than five minutes was cut off by the backend
 * whatever nginx allowed: 500 MB needs about 13 Mbit/s to arrive in time.
 * The headers keep Node's own, much shorter limit.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { applyRequestTimeouts, REQUEST_TIMEOUT_MS } from '../config/httpServer';

describe('the request timeout', () => {
  it('gives a request an hour to arrive, and keeps the default for its headers', () => {
    const server = http.createServer();
    const defaults = http.createServer();

    applyRequestTimeouts(server);

    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(server.requestTimeout).toBe(REQUEST_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(defaults.headersTimeout);
    expect(server.headersTimeout).toBeLessThanOrEqual(60 * 1000);
  });

  it('is applied to the server the backend listens on, before it listens', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../server.ts'), 'utf8');
    const applied = source.indexOf('applyRequestTimeouts(httpServer);');
    expect(applied).toBeGreaterThan(-1);
    expect(applied).toBeLessThan(source.indexOf('httpServer.listen('));
  });
});
