/**
 * Runs once, after every test file.
 *
 * Removes this run's temporary uploads folders (jest.setup.ts). Each file's
 * own is removed when it ends (jest.environment.ts), but not when its worker
 * crashes part-way through it. It also removes those of a run that was
 * killed, whose process is gone, so they do not pile up; another run going
 * on at the same time keeps its own, which carry its own run name.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { processIsAlive, removeUploadsFolder, uploadsFoldersToRemove, uploadsRun } from './testUploads';

export default async function globalTeardown(): Promise<void> {
  const run = uploadsRun(process.env, process.pid);
  for (const name of uploadsFoldersToRemove(fs.readdirSync(os.tmpdir()), run, processIsAlive)) {
    removeUploadsFolder(path.join(os.tmpdir(), name));
  }
}
