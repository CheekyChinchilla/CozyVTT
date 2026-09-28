/**
 * Facts recorded in more than one place, with nothing keeping them in
 * step but a comment. A comment is not a check, so these are.
 *
 * The nginx stamp. `docker compose up -d --build` leaves a running container
 * alone unless its definition changed, and the nginx template is a mounted
 * file, not part of the definition. A change to it reaches an upgraded
 * instance only if something in the nginx service's definition changes too.
 * `NGINX_CONF_STAMP` is that something, and it has to change every time the
 * template does, so it is required to be the template's hash.
 *
 * The database client. The backend image installs a pinned PostgreSQL client
 * major for pg_dump and psql, and the server image is pinned separately in
 * three files. A client older than the server cannot dump it.
 *
 * The restore script. backend/scripts/restore.sh prepares the file psql loads
 * in its own awk step, apart from the Admin Dashboard's restore, and has to
 * end the load with the same statements, or a backup restored from the
 * command line brings back what the dashboard's restore removes.
 *
 * The password rule's special characters, checked in the browser as you type
 * and decided on the server.
 *
 * The combat state. The server sends it and the client reads it, and each
 * package declares it; the first field added to it after the split already
 * disagreed (required on one side, optional on the other). The fields are
 * compared here, comments aside.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { RESTORE_TRAILER } from '../utils/pgRestore';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * The stamp a given template calls for: the first twelve hex digits of its
 * SHA-256, with line endings normalised so a Windows checkout agrees.
 */
function nginxStampFor(template: string): string {
  return crypto.createHash('sha256').update(template.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
}

/**
 * A file's instructions, one per line. Comment lines are left out: both
 * Dockerfiles explain the pinned client in a comment that names it, and a
 * check that read the comments would pass with the install line itself back
 * on the unpinned name. A line continued with a backslash is joined to the
 * next, so an install split over several lines is still one.
 */
function instructions(rel: string): string[] {
  return read(rel)
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ')
    .split('\n');
}

/** The majors `pattern` finds in a file's instructions. */
function majors(rel: string, pattern: RegExp): number[] {
  const found = [...instructions(rel).join('\n').matchAll(pattern)].map((m) => Number(m[1]));
  if (found.length === 0) throw new Error(`${rel} no longer matches ${pattern}; update the pattern with the file`);
  return found;
}

describe('NGINX_CONF_STAMP in docker-compose.yml', () => {
  it('is the hash of nginx/nginx.conf, so a changed template recreates the container on upgrade', () => {
    const expected = nginxStampFor(read('nginx/nginx.conf'));
    const m = /NGINX_CONF_STAMP:\s*"([^"]*)"/.exec(read('docker-compose.yml'));
    if (!m) throw new Error('docker-compose.yml no longer sets NGINX_CONF_STAMP on the nginx service');
    if (m[1] !== expected) {
      throw new Error(
        `nginx/nginx.conf changed: set NGINX_CONF_STAMP in docker-compose.yml to "${expected}" (it is "${m[1]}")`
      );
    }
    expect(m[1]).toBe(expected);
  });
});

describe('the PostgreSQL client the backend image installs', () => {
  const clientFiles = ['backend/Dockerfile', 'backend/Dockerfile.prod'];
  const serverFiles = ['docker-compose.yml', 'docker-compose.dev.yml', '.github/workflows/ci.yml'];
  const clients = clientFiles.flatMap((f) => majors(f, /postgresql(\d+)-client/g));
  const servers = serverFiles.flatMap((f) => majors(f, /image:\s*postgres:(\d+)-alpine/g));

  it('is one major, in every Dockerfile stage', () => {
    expect(new Set(clients).size).toBe(1);
  });

  it('is named by its pinned major on every line that installs it', () => {
    // Line by line: the majors above are gathered from every stage of a file
    // at once, so one stage back on the unpinned postgresql-client passed as
    // long as another stage still named the pinned one.
    const unpinned = clientFiles.flatMap((f) => {
      const installs = instructions(f).filter((line) => /\bapk add\b/.test(line) && /postgresql\d*-client/.test(line));
      if (installs.length === 0) throw new Error(`${f} no longer installs a PostgreSQL client with apk add; update this test with the file`);
      return installs
        .filter((line) => [...line.matchAll(/postgresql(\d*)-client/g)].some((m) => m[1] === ''))
        .map((line) => `${f}: ${line.trim()}`);
    });
    expect(unpinned).toEqual([]);
  });

  // Per file, the checks above were satisfied by any stage: the builder stage
  // of Dockerfile.prod installs the client too, so the production stage, the
  // image that runs pg_dump and psql, could lose it and every check passed.
  it('is installed in the stage that runs, in every Dockerfile', () => {
    const missing = clientFiles.filter((f) => {
      const stages = instructions(f).join('\n').split(/^FROM\s/m);
      const last = stages[stages.length - 1];
      return !/\bapk add\b[^\n]*postgresql\d+-client/.test(last);
    });
    expect(missing).toEqual([]);
  });

  it('is pinned against one server major, the same in both compose files and CI', () => {
    expect(new Set(servers).size).toBe(1);
  });

  it('is not older than the server image, or pg_dump refuses to dump it', () => {
    expect(clients[0]).toBeGreaterThanOrEqual(servers[0]);
  });
});

describe('backend/scripts/restore.sh', () => {
  const script = read('backend/scripts/restore.sh').replace(/\r\n/g, '\n');

  it('ends the load with the statements the dashboard restore ends it with, emptying the login sessions', () => {
    // The statements, as the script holds them.
    const held = /^RESTORE_TRAILER=\$\(cat <<'SQL'\n([\s\S]*?)\nSQL\n\)$/m.exec(script);
    if (!held) throw new Error('restore.sh no longer holds RESTORE_TRAILER in a heredoc; update this test with the script');
    expect(held[1].split('\n')).toEqual(RESTORE_TRAILER);

    // Handed to the awk step that writes the file psql loads.
    const awk = /awk -v key="\$RESTRICT_KEY" -v trailer="\$RESTORE_TRAILER" '\n([\s\S]*?)\n' > "\$PREPARED"/.exec(script);
    if (!awk) throw new Error('restore.sh no longer hands RESTORE_TRAILER to its awk step; update this test with the script');
    const program = awk[1];

    // Printed once, as the last thing the END block does: END runs after
    // every line of the dump has gone through, and only once it has passed
    // the checks. Anywhere else, the sessions are emptied before the dump
    // brings them back, or not at all.
    expect(program.match(/\bprint trailer\b/g) ?? []).toHaveLength(1);
    const end = /\n\s*END \{\n([\s\S]*)\n\s*\}\s*$/.exec(program);
    if (!end) throw new Error("restore.sh's awk step no longer ends with an END block; update this test with the script");
    const statements = end[1].split('\n').map((line) => line.trim()).filter(Boolean);
    expect(statements[statements.length - 1]).toBe('print trailer');
  });
});

describe('the special characters a password needs one of', () => {
  // Written in both packages: the browser checks as you type, the server
  // decides. The two used to differ, so a password the checklist passed was
  // refused on submit.
  const pattern = (rel: string) => {
    const m = /export const SPECIAL_CHARACTER = (\/.+\/[a-z]*);/.exec(read(rel));
    if (!m) throw new Error(`${rel} no longer declares SPECIAL_CHARACTER; update this test with the file`);
    return m[1];
  };

  it('are the same in the browser and on the server', () => {
    expect(pattern('frontend/src/utils/validation.ts')).toBe(pattern('backend/src/utils/validation.ts'));
  });
});

/** An interface's fields, one per line, with comments and spacing removed. */
function interfaceFields(source: string, name: string): string[] {
  const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!m) throw new Error(`no interface ${name}; update this test with the declaration`);
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('the combat state the server sends and the client reads', () => {
  const server = read('backend/src/websocket/initiativeState.ts');
  const client = read('frontend/src/types/index.ts');

  it.each(['CombatantEntry', 'CombatState'])('%s has the same fields on both sides', (name) => {
    expect(interfaceFields(client, name)).toEqual(interfaceFields(server, name));
  });
});
