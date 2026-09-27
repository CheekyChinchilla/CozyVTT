/**
 * Two facts recorded in more than one place, with nothing keeping them in
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
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * The stamp a given template calls for: the first twelve hex digits of its
 * SHA-256, with line endings normalised so a Windows checkout agrees.
 */
function nginxStampFor(template: string): string {
  return crypto.createHash('sha256').update(template.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
}

function majors(rel: string, pattern: RegExp): number[] {
  const found = [...read(rel).matchAll(pattern)].map((m) => Number(m[1]));
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

  it('is pinned against one server major, the same in both compose files and CI', () => {
    expect(new Set(servers).size).toBe(1);
  });

  it('is not older than the server image, or pg_dump refuses to dump it', () => {
    expect(clients[0]).toBeGreaterThanOrEqual(servers[0]);
  });
});
