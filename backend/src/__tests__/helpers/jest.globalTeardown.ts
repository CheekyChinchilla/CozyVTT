/**
 * Runs once, after every test file.
 *
 * Removes this run's temporary uploads folders (jest.setup.ts). Each file's
 * own is removed when it ends (jest.afterEnv.ts), but a file whose tests are
 * all skipped runs no afterAll. Another run going on at the same time keeps
 * its own, which carry its own run name.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export default async function globalTeardown(): Promise<void> {
  const prefix = `cozyvtt-test-uploads-${process.env.COZYVTT_TEST_RUN ?? 'run'}-`;
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (name.startsWith(prefix)) fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
  }
}
