/**
 * The test suite refuses a database that is not a test database.
 *
 * Several suites delete rows they did not create, or drop the session table,
 * on the assumption that the database is a throwaway one. With DATABASE_URL
 * unset, Prisma and dotenv read backend/.env, which DEVELOPMENT.md points at
 * the development database; a run there would delete real data. So the run
 * stops before any suite starts unless the database's name has `test` in it
 * as a word, as `cozyvtt_test` and `cozyvtt_test_b10` do.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { testDatabaseRefusal, effectiveDatabaseUrl } from './helpers/testDatabaseGuard';

describe('testDatabaseRefusal', () => {
  it.each([
    'postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test',
    'postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test_b10',
    'postgresql://cozyvtt:cozyvtt@localhost:55433/cozyvtt_test?connection_limit=5',
    'postgresql://u:p@db:5432/test_cozyvtt?schema=setup_wizard',
    'postgresql://u:p@db:5432/cozyvtt-test',
  ])('lets %s through', (url) => {
    expect(testDatabaseRefusal(url)).toBeNull();
  });

  it.each([
    'postgresql://cozyvtt:cozyvtt@localhost:5432/cozyvtt',
    'postgresql://cozyvtt:cozyvtt@postgres:5432/cozyvtt?schema=public',
    'postgresql://u:p@db:5432/contest',
    'postgresql://u:p@db:5432/cozyvtt_testing',
  ])('refuses %s, naming the database', (url) => {
    const refusal = testDatabaseRefusal(url);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain(new URL(url).pathname.slice(1));
    expect(refusal).toContain('DATABASE_URL');
  });

  it('refuses an address it cannot read', () => {
    expect(testDatabaseRefusal('not a url')).toMatch(/cannot read/i);
  });

  it('lets a run with no database at all through, for the suites that need none', () => {
    expect(testDatabaseRefusal(undefined)).toBeNull();
  });
});

describe('effectiveDatabaseUrl', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozy-dbguard-'));
    fs.mkdirSync(path.join(dir, 'prisma'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prefers the environment', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL=postgresql://u:p@h/cozyvtt\n');
    expect(effectiveDatabaseUrl({ DATABASE_URL: 'postgresql://u:p@h/cozyvtt_test' }, dir)).toBe(
      'postgresql://u:p@h/cozyvtt_test'
    );
  });

  it('reads backend/.env when the environment has none, as Prisma and dotenv would', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'DATABASE_URL="postgresql://u:p@h/cozyvtt"\n');
    expect(effectiveDatabaseUrl({}, dir)).toBe('postgresql://u:p@h/cozyvtt');
  });

  it('reads prisma/.env after that', () => {
    fs.writeFileSync(path.join(dir, 'prisma', '.env'), 'DATABASE_URL=postgresql://u:p@h/cozyvtt\n');
    expect(effectiveDatabaseUrl({}, dir)).toBe('postgresql://u:p@h/cozyvtt');
  });

  it('is undefined when nothing names a database', () => {
    expect(effectiveDatabaseUrl({}, dir)).toBeUndefined();
  });
});

describe('jest configuration', () => {
  it('runs the guard once before any suite', () => {
    const config = fs.readFileSync(path.join(__dirname, '..', '..', 'jest.config.js'), 'utf8');
    expect(config).toMatch(/globalSetup: '<rootDir>\/src\/__tests__\/helpers\/jest\.globalSetup\.ts'/);
    const setup = fs.readFileSync(path.join(__dirname, 'helpers', 'jest.globalSetup.ts'), 'utf8');
    expect(setup).toMatch(/testDatabaseRefusal\(/);
  });
});
