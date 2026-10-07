/**
 * Runs the test app as a real process of its own, listening on a free port.
 *
 * A request that makes the server throw outside any error handler ends the
 * process it runs in. Inside Jest that ends nothing: the runner catches the
 * exception and blames the test, so a suite that sends such a request can only
 * see "the process stayed up" by sending it to a different process. Start this
 * with `node -r ts-node/register/transpile-only` and read the port from the
 * `LISTENING <port>` line it prints.
 */

import { createTestApp } from './test-app';

const server = createTestApp().listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not report a port');
  }
  process.stdout.write(`LISTENING ${address.port}\n`);
});
