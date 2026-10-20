/**
 * What the end of a test run removes of the temporary uploads folders.
 *
 * Each test file uploads into a folder named for its run. A run removes its
 * own when it ends; a run that was killed (Ctrl-C, out of memory) never
 * ends, so the next run to end removes those too. A folder of a run that is
 * still going is in use, and is kept.
 */

import { spawnSync } from 'child_process';
import { processIsAlive, uploadsFoldersToRemove } from './helpers/testUploads';

describe('uploadsFoldersToRemove', () => {
  const alive = new Set([100, 200]);
  const isAlive = (pid: number) => alive.has(pid);

  it('removes this run\'s folders, though its process is alive', () => {
    expect(uploadsFoldersToRemove(['cozyvtt-test-uploads-100-aB3xYz', 'cozyvtt-test-uploads-100-Qq0000'], '100', isAlive))
      .toEqual(['cozyvtt-test-uploads-100-aB3xYz', 'cozyvtt-test-uploads-100-Qq0000']);
  });

  it('removes the folders of a run whose process has gone', () => {
    expect(uploadsFoldersToRemove(['cozyvtt-test-uploads-300-aB3xYz'], '100', isAlive)).toEqual(['cozyvtt-test-uploads-300-aB3xYz']);
  });

  it('keeps the folders of another run still going', () => {
    expect(uploadsFoldersToRemove(['cozyvtt-test-uploads-200-aB3xYz'], '100', isAlive)).toEqual([]);
  });

  it('keeps what it cannot tell is a dead run\'s, and anything else in the folder', () => {
    expect(uploadsFoldersToRemove([
      'cozyvtt-test-uploads-run-aB3xYz',
      'cozyvtt-test-uploads-12x-aB3xYz',
      'cozyvtt-test-uploads-300',
      'cozyvtt-archive-300-aB3xYz',
      'something-else',
    ], '100', isAlive)).toEqual([]);
  });

  it('does not take a run whose name starts with this one\'s as this one', () => {
    expect(uploadsFoldersToRemove(['cozyvtt-test-uploads-1000-aB3xYz'], '100', (pid: number) => pid === 1000)).toEqual([]);
  });
});

describe('processIsAlive', () => {
  it('is true of this process', () => {
    expect(processIsAlive(process.pid)).toBe(true);
  });

  it('is false of a process that has ended', () => {
    const ended = spawnSync(process.execPath, ['-e', '']);
    expect(ended.pid).toBeGreaterThan(0);
    expect(processIsAlive(ended.pid)).toBe(false);
  });
});
