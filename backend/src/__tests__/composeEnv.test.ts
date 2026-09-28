/**
 * Every setting the example env file offers, and the backend reads, is passed
 * through to the backend container by the shipped compose file.
 *
 * `.env.example` is the file every Docker self-hoster copies, and Docker
 * Compose hands a container only the variables its `environment:` block
 * names. Three settings the file offered (the two session timeouts and the
 * log level) were never named there, so setting them did nothing on a
 * Docker install and nothing said so. This keeps the three files in step.
 */

import fs from 'fs';
import path from 'path';
import { CONFIGURABLE_ASSET_TYPES, fileSizeLimitVar, resolveFileSizeLimits } from '../utils/fileUtils';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * Settings offered by the example file that the Docker setup deliberately does
 * not pass through, each with the reason.
 */
const NOT_PASSED_THROUGH: Record<string, string> = {
  // Backups are bind-mounted at ./backend/backups; a path inside the
  // container that is not mounted would lose every backup on a rebuild.
  BACKUP_DIR: 'the backups volume in docker-compose.yml decides where they go',
};

/** The keys the backend reads from its environment, from the source itself. */
function keysTheBackendReads(): Set<string> {
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        // process.env.NAME, and env.NAME where a module is handed the
        // environment as a parameter (resolveBackupDir, getProxyLimitWarnings).
        for (const m of fs.readFileSync(full, 'utf8').matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]*)/g)) keys.add(m[1]);
      }
    }
  };
  walk(path.join(root, 'backend/src'));
  // The upload limits are read by a name built from the list of types, so ask
  // the backend for those names; a copy of the template here would go stale.
  for (const type of CONFIGURABLE_ASSET_TYPES) keys.add(fileSizeLimitVar(type));
  return keys;
}

/** Keys the example file offers, set or commented out as an example. */
function keysTheExampleOffers(): string[] {
  const keys: string[] = [];
  for (const line of read('.env.example').split('\n')) {
    const m = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/** The keys the compose file's backend service names in its environment. */
function keysComposePasses(file: string): Set<string> {
  const text = read(file);
  const start = text.indexOf('\n  backend:');
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z]/);
  const block = end === -1 ? rest : rest.slice(0, end + 1);
  const env = block.slice(block.indexOf('environment:'));
  const keys = new Set<string>();
  for (const m of env.matchAll(/^\s{6}([A-Z][A-Z0-9_]*):/gm)) keys.add(m[1]);
  return keys;
}

describe.each(['docker-compose.yml', 'docker-compose.dev.yml'])('%s', (file) => {
  it('passes every backend setting the example env file offers to the backend container', () => {
    const backend = keysTheBackendReads();
    const passed = keysComposePasses(file);
    const missing = keysTheExampleOffers().filter(
      (key) => backend.has(key) && !passed.has(key) && !(key in NOT_PASSED_THROUGH)
    );
    expect(missing).toEqual([]);
  });
});

// Two modules read their settings through an environment object passed in
// (so their own tests can hand them one), and one builds the names from a
// list. The scan above has to see those too, or the check passes by not
// looking at them.
describe('the settings the backend reads', () => {
  // The names above come from fileSizeLimitVar, not from a scan, so check the
  // backend really reads them: a limit read under another name would leave
  // docker-compose.yml passing names nothing uses.
  it.each([...CONFIGURABLE_ASSET_TYPES])('read the %s upload limit under the name the check expects', (type) => {
    const limits = resolveFileSizeLimits({ [fileSizeLimitVar(type)]: '7' });
    expect(limits[type]).toBe(7 * 1024 * 1024);
  });

  it('include those read through an injected environment object', () => {
    const backend = keysTheBackendReads();
    for (const key of ['NGINX_MAX_BODY_SIZE', 'MAX_MAP_SIZE_MB', 'MAX_TOKEN_SIZE_MB', 'MAX_AUDIO_SIZE_MB', 'MAX_AVATAR_SIZE_MB', 'MAX_DOCUMENT_SIZE_MB']) {
      expect(backend).toContain(key);
    }
  });
});
