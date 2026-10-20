/**
 * Runs once, after every test file.
 *
 * Removes this run's temporary uploads folders (jest.setup.ts). Each file's
 * own is removed when it ends (jest.afterEnv.ts), but a file whose tests are
 * all skipped runs no afterAll. It also removes those of a run that was
 * killed, whose process is gone, so they do not pile up; another run going
 * on at the same time keeps its own, which carry its own run name.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { processIsAlive, uploadsFoldersToRemove, uploadsRun } from './testUploads';

export default async function globalTeardown(): Promise<void> {
  const run = uploadsRun(process.env, process.pid);
  for (const name of uploadsFoldersToRemove(fs.readdirSync(os.tmpdir()), run, processIsAlive)) {
    fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
  }
}
