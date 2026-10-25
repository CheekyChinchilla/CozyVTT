/**
 * What the end of a test run removes of the temporary uploads folders.
 *
 * Each test file uploads into a folder named for its run. A run removes its
 * own when it ends; a run that was killed (Ctrl-C, out of memory) never
 * ends, so the next run to end removes those too. A folder of a run that is
 * still going is in use, and is kept.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { processIsAlive, removeUploadsFolder, uploadsFoldersToRemove, uploadsRun } from './helpers/testUploads';

// A file's uploads folder lasts until the file has ended, its own afterAll
// hooks included, so one that cleans up after itself finds its files there.
const uploads = process.env.UPLOAD_DIR;
afterAll(() => {
  expect(uploads).toMatch(/cozyvtt-test-uploads-/);
  expect(fs.existsSync(uploads as string)).toBe(true);
});

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

describe('uploadsRun', () => {
  it('is the run jest.globalSetup.ts named', () => {
    expect(uploadsRun({ COZYVTT_TEST_RUN: '4242' }, 77)).toBe('4242');
  });

  // Two runs that both fell back to one shared name would each remove the
  // other's folders while they were still in use.
  it('is the process\'s own id when no run was named', () => {
    expect(uploadsRun({}, 77)).toBe('77');
  });
});

describe('removeUploadsFolder', () => {
  afterEach(() => jest.restoreAllMocks());

  // On Windows a file still held open fails the removal with EBUSY or EPERM,
  // which `force` does not cover; the end of run sweep tries again.
  it('tries again a few times, then lets a folder it cannot remove be', () => {
    const rm = jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
    });
    expect(() => removeUploadsFolder('/tmp/cozyvtt-test-uploads-1-aB3xYz')).not.toThrow();
    expect(rm).toHaveBeenCalledWith('/tmp/cozyvtt-test-uploads-1-aB3xYz', { recursive: true, force: true, maxRetries: 3 });
  });

  it('removes the folder and what is in it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-remove-check-'));
    fs.writeFileSync(path.join(dir, 'a.png'), 'x');
    removeUploadsFolder(dir);
    expect(fs.existsSync(dir)).toBe(false);
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
