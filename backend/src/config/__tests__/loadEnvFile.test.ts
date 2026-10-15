/**
 * The server reads backend/.env through src/config/loadEnvFile.ts. dotenv
 * prints a line to stderr on every load unless told to be quiet, even when
 * there is no file, so every start of the server would carry it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROBE = 'COZYVTT_LOAD_ENV_FILE_PROBE';

describe('loadEnvFile', () => {
  const startDir = process.cwd();
  let dir: string;
  let printed: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-load-env-'));
    process.chdir(dir);
    printed = [];
    const record = (...args: unknown[]): void => {
      printed.push(args.map(String).join(' '));
    };
    jest.spyOn(console, 'error').mockImplementation(record);
    jest.spyOn(console, 'warn').mockImplementation(record);
    jest.spyOn(console, 'log').mockImplementation(record);
    jest.spyOn(console, 'info').mockImplementation(record);
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array): boolean => {
      printed.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.chdir(startDir);
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env[PROBE];
  });

  const load = (): void => {
    jest.isolateModules(() => {
      require('../loadEnvFile');
    });
  };

  // The command-line scripts and prisma.config.ts load the file with
  // `import 'dotenv/config'`, which dotenv 18 keeps quiet by default.
  it("prints nothing when loaded the scripts' way, through dotenv/config", () => {
    fs.writeFileSync(path.join(dir, '.env'), `${PROBE}=from-file\n`);
    jest.isolateModules(() => {
      require('dotenv/config');
    });
    expect(process.env[PROBE]).toBe('from-file');
    expect(printed).toEqual([]);
  });

  it('reads the .env file and prints nothing', () => {
    fs.writeFileSync(path.join(dir, '.env'), `${PROBE}=from-file\n`);
    load();
    expect(process.env[PROBE]).toBe('from-file');
    expect(printed).toEqual([]);
  });

  it('keeps a value the environment already sets', () => {
    fs.writeFileSync(path.join(dir, '.env'), `${PROBE}=from-file\n`);
    process.env[PROBE] = 'from-environment';
    load();
    expect(process.env[PROBE]).toBe('from-environment');
  });

  it('prints nothing when there is no .env file, as in the production image', () => {
    load();
    expect(process.env[PROBE]).toBeUndefined();
    expect(printed).toEqual([]);
  });
});
