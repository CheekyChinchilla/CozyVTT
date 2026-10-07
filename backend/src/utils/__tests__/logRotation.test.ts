/**
 * Logs stay a bounded size on disk.
 *
 * In production every line goes to two files under backend/logs, which the
 * Docker setup keeps on the host, and to the console, which Docker keeps in
 * its own log for the container. None of the three had a limit, so a small
 * server's disk filled over months, and faster when something logged in a
 * loop. A host logrotate rule did not help: the backend keeps its files open,
 * so a renamed file went on growing.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import winston from 'winston';

const root = path.resolve(__dirname, '../../../..');

describe('the production log files', () => {
  const originalCwd = process.cwd();
  const originalEnv = process.env.NODE_ENV;
  let dir: string;
  let production: winston.Logger;
  // The File class the isolated logger was built with. winston loads its
  // transports lazily, so it has to be read inside the isolated registry.
  let FileTransport: typeof winston.transports.File;

  beforeAll(() => {
    // The files are opened relative to the working directory as the logger
    // loads, so it loads in a scratch directory.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-logs-'));
    process.chdir(dir);
    process.env.NODE_ENV = 'production';
    jest.isolateModules(() => {
      production = (require('../logger') as { default: winston.Logger }).default;
      FileTransport = (require('winston') as typeof winston).transports.File;
    });
  });

  afterAll(() => {
    production.close();
    process.chdir(originalCwd);
    process.env.NODE_ENV = originalEnv;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const files = () =>
    production.transports.filter(
      (t): t is winston.transports.FileTransportInstance => t instanceof FileTransport
    );

  it('are the error log and the combined log', () => {
    expect(files().map((f) => f.filename).sort()).toEqual(['combined.log', 'error.log']);
  });

  it('each start a new file at 10 MB and keep five, the newest under the plain name', () => {
    expect(files()).toHaveLength(2);
    for (const file of files()) {
      expect(file.maxsize).toBe(10 * 1024 * 1024);
      expect(file.maxFiles).toBe(5);
      expect(file.tailable).toBe(true);
    }
  });
});

describe('rotation with the options the backend uses', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-rotate-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps writing to the plain name and removes the oldest file past the limit', async () => {
    const transport = new winston.transports.File({
      filename: path.join(dir, 'combined.log'),
      maxsize: 2_000,
      maxFiles: 3,
      tailable: true,
    });
    const rotating = winston.createLogger({ format: winston.format.json(), transports: [transport] });

    for (let i = 0; i < 200; i++) {
      rotating.info(`line ${i} ${'x'.repeat(80)}`);
      // One write at a time, as a server's log lines arrive: the transport
      // checks the size after each write it has finished.
      await new Promise<void>((resolve) => transport.once('logged', () => resolve()));
    }
    await new Promise<void>((resolve) => {
      transport.once('finish', () => resolve());
      rotating.end();
    });

    const names = fs.readdirSync(dir).sort();
    expect(names).toEqual(['combined.log', 'combined1.log', 'combined2.log']);
    expect(fs.readFileSync(path.join(dir, 'combined.log'), 'utf8')).toContain('line 199 ');
    // A file can pass the limit by what arrives while the next one is being
    // opened, a few lines here and nothing to speak of at 10 MB.
    for (const name of names) {
      expect(fs.statSync(path.join(dir, name)).size).toBeLessThan(2 * 2_000);
    }
  });
});

describe('the Docker log of every container', () => {
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8');
  const lines = compose.split('\n');

  /** The indented lines under a top-level key, or a two-space key inside it. */
  function block(from: number, indent: number): string[] {
    const body: string[] = [];
    for (const line of lines.slice(from + 1)) {
      if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
      if (line.length - line.trimStart().length <= indent) break;
      body.push(line);
    }
    return body;
  }

  const services = (() => {
    const start = lines.indexOf('services:');
    const found = new Map<string, string[]>();
    lines.forEach((line, i) => {
      const m = /^ {2}([a-z][\w-]*):\s*$/.exec(line);
      if (m && i > start && block(start, 0).includes(line)) found.set(m[1], block(i, 2));
    });
    return found;
  })();

  /** The logging options a service ends up with, following a YAML alias to its anchor. */
  function loggingOf(service: string[]): string[] {
    const line = service.find((l) => /^ {4}logging:/.test(l));
    if (!line) return [];
    const alias = /logging:\s*\*([\w-]+)\s*$/.exec(line);
    if (!alias) return block(lines.indexOf(line), 4);
    const anchorAt = lines.findIndex((l) => new RegExp(`&${alias[1]}\\s*$`).test(l));
    return anchorAt === -1 ? [] : block(anchorAt, lines[anchorAt].length - lines[anchorAt].trimStart().length);
  }

  it('finds the four services', () => {
    expect([...services.keys()].sort()).toEqual(['backend', 'database', 'frontend', 'nginx']);
  });

  it.each(['backend', 'database', 'frontend', 'nginx'])('%s keeps its log to a few files of 10 MB', (name) => {
    const logging = loggingOf(services.get(name) ?? []).map((l) => l.trim());
    expect(logging).toContain('driver: json-file');
    expect(logging).toContain('max-size: "10m"');
    expect(logging).toContain('max-file: "5"');
  });
});
