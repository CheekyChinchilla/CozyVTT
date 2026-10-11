/**
 * The real server, started as its own process, stopped with SIGTERM and
 * SIGINT, the signals Docker, a service manager and Ctrl+C send.
 *
 * Without a handler, SIGTERM ended the process on the spot with nothing
 * closed; in Docker, where node is the container's first process and ignores
 * a signal it has no handler for, it was not even that, and every stop waited
 * ten seconds for SIGKILL. That first-process case needs a container to see;
 * this checks the handler is there and finishes the job.
 *
 * An error nothing caught ends the process with 1, as Node ends it, but
 * through the log, so it reaches the log files as well as the console.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.setTimeout(60000);

const backend = path.resolve(__dirname, '../..');

interface Ended {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  ms: number;
}

/** Starts the server, waits until it listens, sends the signal, and reports how it ended. */
function startAndStop(signal: NodeJS.Signals): Promise<Ended> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', 'src/server.ts'], {
      cwd: backend,
      env: { ...process.env, NODE_ENV: 'test', PORT: '0', LOG_LEVEL: 'info' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let sentAt = 0;
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (!sentAt && output.includes('CozyVTT Backend running on port')) {
        sentAt = Date.now();
        child.kill(signal);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const giveUp = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the server did not stop:\n${output}`));
    }, 45000);
    child.on('exit', (code, endedBy) => {
      clearTimeout(giveUp);
      resolve({ code, signal: endedBy, output, ms: sentAt ? Date.now() - sentAt : -1 });
    });
  });
}

it.each(['SIGTERM', 'SIGINT'] as const)('%s closes everything and exits 0 within a few seconds', async (signal) => {
  const ended = await startAndStop(signal);

  expect(ended.signal).toBeNull();
  expect(ended.code).toBe(0);
  expect(ended.output).toContain(`${signal} received; shutting down`);
  expect(ended.output).toContain('Shutdown complete');
  expect(ended.ms).toBeGreaterThanOrEqual(0);
  expect(ended.ms).toBeLessThan(5000);
});

it('writes a promise rejection nothing handled to its log, and exits 1', async () => {
  // Loaded before the server; the rejection happens once the server's own
  // code has run, as a forgotten promise in a route would.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-unhandled-'));
  const preload = path.join(dir, 'reject.js');
  fs.writeFileSync(preload, "setTimeout(() => { void Promise.reject(new Error('rejected and never handled, in a test')); }, 0);\n");
  try {
    const ended = await new Promise<Ended>((resolve, reject) => {
      const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', preload, 'src/server.ts'], {
        cwd: backend,
        env: { ...process.env, NODE_ENV: 'test', PORT: '0', LOG_LEVEL: 'info' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      const giveUp = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`the server did not stop:\n${output}`));
      }, 45000);
      child.on('exit', (code, endedBy) => {
        clearTimeout(giveUp);
        resolve({ code, signal: endedBy, output, ms: 0 });
      });
    });

    expect(ended.code).toBe(1);
    // The development console colours the level, so it is matched loosely.
    expect(ended.output).toMatch(/\[\S*error\S*\] Unhandled promise rejection; stopping/);
    expect(ended.output).toContain('rejected and never handled, in a test');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
