/**
 * What the shipped deployment files offer and promise, checked against what
 * CozyVTT actually supports.
 *
 * One address. The page, the API and the live connection are served from the
 * same address. The example env files used to offer VITE_API_URL and
 * VITE_SOCKET_URL for a backend on another address, and a self-hoster who
 * followed them got a page that signed in and then showed every map, token,
 * avatar, sound and document blank: the page's security policy, the
 * backend's resource policy and the canvas's anonymous image loads each
 * refuse a picture from another address. The offer is gone, and so are the
 * image build arguments that carried the two settings into the bundle and
 * into the page's security policy: a value left in an older .env no longer
 * reaches the image.
 *
 * The development stack. It is for a developer's own computer: its ports are
 * published on 127.0.0.1 only, where the guide said they were (Docker binds a
 * port with no address to every interface, past the firewall), and it runs
 * in development mode whatever NODE_ENV the copied .env.example sets.
 *
 * The images. nginx:alpine named whatever nginx was newest on the day of the
 * pull, so two installs of one CozyVTT version could run different nginx
 * releases under the same configuration. Both nginx images are pinned to one
 * stable line, the same in each. `npm ci --only=production` is a deprecated
 * spelling of `--omit=dev`.
 *
 * The bundled nginx. It sent everything as it was: every JSON answer the
 * backend gives (map tokens, walls, lights, fog, the roster) went out
 * uncompressed, which a phone on mobile data feels most. It now compresses
 * text on the way out, and leaves its version out of its answers.
 *
 * Hardening. Every container runs with no-new-privileges, so nothing in it
 * can gain privileges through a setuid program; the start scripts that drop
 * from root to an unprivileged user (the backend's, Postgres's, nginx's) do
 * not need any. Each also drops every Linux capability and adds back only
 * what its start script needs while it runs as root: changing owners,
 * switching user, a port below 1024 for the two nginx, and reading a folder
 * or file another account keeps private (the backups folder, Postgres's data,
 * a TLS key copied in by the guide's steps). Without the rest, root in a
 * container cannot write another account's files, so the maintenance
 * commands the guides give run as the backend's own user. The frontend
 * container, which only serves files, runs on a read-only filesystem with
 * memory-backed folders for nginx's own scratch files. So does the proxy,
 * whose settings the entrypoint renders into memory as it starts; its
 * request and response files, which a 50 MB upload fills, are on a volume,
 * outside its 64 MB memory limit. The backend's filesystem is read-only as
 * well, apart from its three data folders and /tmp, a volume of its own for
 * the dump a backup writes and the archive a restore unpacks; its start
 * script removes what a stopped one left there, and calls Prisma directly,
 * since npx writes to the home folder. The README says what runs as root,
 * and no more.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** The settings an env file offers, set or commented out as an example. */
const offered = (rel: string) =>
  read(rel)
    .split('\n')
    .map((line) => /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);

describe('one address for the page and the backend', () => {
  it.each(['.env.example'])('%s does not offer a backend on another address', (file) => {
    expect(offered(file).filter((key) => key === 'VITE_API_URL' || key === 'VITE_SOCKET_URL')).toEqual([]);
  });

  it('is not described as an option in the development guide', () => {
    expect(read('docs/DEVELOPMENT.md')).not.toMatch(/\|\s*`VITE_(API|SOCKET)_URL`\s*\|/);
  });

  it('is not passed to the production frontend build by docker-compose.yml', () => {
    expect(service('docker-compose.yml', 'frontend')).not.toMatch(/VITE_/);
  });

  it('is not taken as a build argument by the production frontend image', () => {
    expect(read('frontend/Dockerfile.prod')).not.toMatch(/^\s*ARG\s+VITE_/m);
  });

  it("leaves the page's security headers as the file writes them", () => {
    expect(read('frontend/security-headers.conf')).not.toContain('${');
    const dockerfile = read('frontend/Dockerfile.prod');
    expect(dockerfile).toMatch(/^COPY security-headers\.conf \/etc\/nginx\/security-headers\.conf$/m);
    expect(dockerfile).not.toContain('envsubst');
  });
});

/** One service's block of a compose file, from its name to the next service. */
function service(file: string, name: string): string {
  const text = read(file);
  const start = text.indexOf(`\n  ${name}:\n`);
  if (start === -1) throw new Error(`${file} has no ${name} service`);
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z]|\n[a-z]/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/** The host side of each port a service publishes. */
function published(block: string): string[] {
  const ports = /\n {4}ports:\n((?: {6}- .*\n)+)/.exec(block);
  return ports ? [...ports[1].matchAll(/- "([^"]+)"/g)].map((m) => m[1]) : [];
}

describe('the development stack', () => {
  it.each(['database', 'backend', 'frontend'])('publishes the %s on this computer only', (name) => {
    const ports = published(service('docker-compose.dev.yml', name));
    expect(ports.length).toBeGreaterThan(0);
    expect(ports.filter((p) => !p.startsWith('127.0.0.1:'))).toEqual([]);
  });

  it('runs the backend in development mode, whatever .env says', () => {
    expect(service('docker-compose.dev.yml', 'backend')).toMatch(/\n {6}NODE_ENV: development\n/);
  });

  it('lets the browser reach the backend through the Vite proxy, on the page\'s own address', () => {
    const frontend = service('docker-compose.dev.yml', 'frontend');
    expect(frontend).not.toMatch(/VITE_API_URL|VITE_SOCKET_URL/);
    expect(frontend).toMatch(/\n {6}VITE_PROXY_TARGET: http:\/\/backend:4000\n/);
  });
});

/** Every image a file names, in FROM lines or image: keys. */
function images(rel: string): string[] {
  return [...read(rel).matchAll(/^(?:FROM\s+|\s+image:\s+)(\S+)/gm)].map((m) => m[1]);
}

describe('the images', () => {
  it('pin nginx to one stable line, the same for the proxy and the frontend', () => {
    const nginx = [...images('docker-compose.yml'), ...images('frontend/Dockerfile.prod')].filter((i) => /^nginx[:@]/.test(i));
    expect(nginx).toHaveLength(2);
    for (const image of nginx) expect(image).toMatch(/^nginx:1\.\d*[02468]-alpine$/);
    expect(new Set(nginx).size).toBe(1);
  });

  it.each(['backend/Dockerfile.prod', 'backend/Dockerfile', 'frontend/Dockerfile.prod', 'frontend/Dockerfile'])(
    '%s installs without the deprecated --only=production',
    (file) => {
      expect(read(file)).not.toContain('--only=production');
    }
  );

  it('leave the development tools out of the backend image that runs', () => {
    const stages = read('backend/Dockerfile.prod').split(/^FROM\s/m);
    expect(stages[stages.length - 1]).toMatch(/^RUN npm ci --omit=dev$/m);
  });
});

describe('the bundled nginx', () => {
  /** Top-level directive values of the template, comments dropped. */
  const setting = (name: string) =>
    read('nginx/nginx.conf')
      .split('\n')
      .filter((line) => !line.startsWith(' '))
      .map((line) => line.replace(/#.*$/, '').trim())
      .find((line) => line.startsWith(`${name} `))
      ?.slice(name.length)
      .replace(/;$/, '')
      .trim();

  it("compresses the backend's JSON and other text, for every server it runs", () => {
    expect(setting('gzip')).toBe('on');
    expect(setting('gzip_types')?.split(/\s+/)).toEqual(
      expect.arrayContaining(['application/json', 'text/css', 'application/javascript', 'image/svg+xml'])
    );
    expect(setting('gzip_vary')).toBe('on');
    // A tunnel in front marks each request as proxied; compress those too.
    expect(setting('gzip_proxied')).toBe('any');
  });

  it('does not name its version', () => {
    expect(setting('server_tokens')).toBe('off');
  });
});

/** The items of a service's list setting (`cap_add:`, `tmpfs:`, `volumes:`), comments dropped. */
function listed(block: string, key: string): string[] {
  const items = new RegExp(`\\n {4}${key}:\\n((?: {6}(?:- .*|#.*)\\n)+)`).exec(block)?.[1] ?? '';
  return [...items.matchAll(/^ {6}- ([^#\n]*?)\s*(?:#.*)?$/gm)].map((m) => m[1]);
}

/**
 * The capabilities each container adds back once it has dropped them all.
 * Each is used by the image's start script while it runs as root, and by
 * nothing after it has switched to its unprivileged user.
 */
const CAPABILITIES: Record<string, string[]> = {
  // The entrypoint gives the data folder to postgres (CHOWN), looks inside
  // it although it is postgres's alone (DAC_READ_SEARCH), then switches user.
  database: ['CHOWN', 'DAC_READ_SEARCH', 'SETGID', 'SETUID'],
  // start.sh gives the mounted folders to appuser, reads the backups folder
  // (0700, appuser's) and any private folder under uploads on the way
  // (DAC_READ_SEARCH), sets the backups folder's mode once it is appuser's
  // (FOWNER), then switches user.
  backend: ['CHOWN', 'DAC_READ_SEARCH', 'FOWNER', 'SETGID', 'SETUID'],
  // nginx's master gives its scratch folders to the nginx user, listens on
  // port 80 and starts its workers as that user.
  frontend: ['CHOWN', 'NET_BIND_SERVICE', 'SETGID', 'SETUID'],
  // The same, plus port 443 and reading a TLS key the guide's steps leave
  // readable by the host account that copied it alone.
  nginx: ['CHOWN', 'DAC_READ_SEARCH', 'NET_BIND_SERVICE', 'SETGID', 'SETUID'],
};

/** The named volumes docker-compose.yml declares at its top level. */
function topLevelVolumes(): string[] {
  const block = /\nvolumes:\n((?: {2}.*\n|\n)+)/.exec(read('docker-compose.yml'))?.[1] ?? '';
  return [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
}

/** Every `docker compose exec` or `docker exec` line the self-hoster guides give for the backend. */
function backendExecLines(rel: string): string[] {
  return read(rel)
    .split('\n')
    .filter((line) => /docker(?: compose)? exec\b/.test(line))
    .filter((line) => /docker compose exec(?: -[A-Za-z]+(?: \S+)?)* backend\b|docker exec(?: -\S+)* cozyvtt-backend\b/.test(line));
}

describe('the containers', () => {
  it.each(['database', 'backend', 'frontend', 'nginx'])('run %s with no-new-privileges', (name) => {
    expect(service('docker-compose.yml', name)).toMatch(/\n {4}security_opt:\n {6}- no-new-privileges:true\n/);
  });

  it.each(Object.keys(CAPABILITIES))('drop every capability from %s and add back only what its start needs', (name) => {
    const block = service('docker-compose.yml', name);
    expect(listed(block, 'cap_drop')).toEqual(['ALL']);
    expect([...listed(block, 'cap_add')].sort()).toEqual(CAPABILITIES[name]);
  });

  it.each(['docs/DEPLOYMENT.md', 'backend/DATABASE_MIGRATIONS.md'])(
    '%s runs every command in the backend container as its own user',
    (file) => {
      const lines = backendExecLines(file);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.filter((line) => !/docker compose exec(?: -T)? -u appuser backend\b/.test(line))).toEqual([]);
    }
  );

  it('name the backend user in the command start.sh suggests when a migration fails', () => {
    const hint = read('backend/scripts/start.sh').split('\n').filter((line) => /migrate status/.test(line));
    expect(hint).toHaveLength(1);
    expect(hint[0]).toMatch(/docker compose exec -u appuser backend /);
  });

  it('give the frontend a read-only filesystem, with room for the files nginx writes as it runs', () => {
    const frontend = service('docker-compose.yml', 'frontend');
    expect(frontend).toMatch(/\n {4}read_only: true\n/);
    const tmpfs = /\n {4}tmpfs:\n((?: {6}- .*\n)+)/.exec(frontend)?.[1] ?? '';
    // Its pid file, and the folders it keeps request bodies and proxied answers in.
    expect([...tmpfs.matchAll(/- (\S+)/g)].map((m) => m[1])).toEqual(expect.arrayContaining(['/run', '/var/cache/nginx']));
  });

  it('give the proxy a read-only filesystem, with its rendered settings and pid file in memory', () => {
    const nginx = service('docker-compose.yml', 'nginx');
    expect(nginx).toMatch(/\n {4}read_only: true\n/);
    // The entrypoint renders the template into /etc/nginx/conf.d as it starts.
    expect([...listed(nginx, 'tmpfs')].sort()).toEqual(['/etc/nginx/conf.d', '/run', '/tmp']);
  });

  it("keep the proxy's request and response files on a volume, out of its memory limit", () => {
    // A 50 MB upload passes through /var/cache/nginx; in memory it would
    // count against the proxy's 64 MB and stop it.
    const nginx = service('docker-compose.yml', 'nginx');
    expect(listed(nginx, 'tmpfs')).not.toContain('/var/cache/nginx');
    expect(listed(nginx, 'volumes')).toContain('nginx_temp:/var/cache/nginx');
    expect(topLevelVolumes()).toContain('nginx_temp');
  });

  it("give the backend a read-only filesystem, with /tmp on a volume of its own", () => {
    const backend = service('docker-compose.yml', 'backend');
    expect(backend).toMatch(/\n {4}read_only: true\n/);
    // A backup's dump of the whole database and a restore's unpacked archive
    // go to /tmp; in memory they would count against the backend's 512 MB.
    expect(listed(backend, 'tmpfs')).toEqual([]);
    expect(listed(backend, 'volumes')).toContain('backend_tmp:/tmp');
    expect(topLevelVolumes()).toContain('backend_tmp');
  });

  it('turn off the Prisma tools\' update check in the backend image, which writes to the home folder', () => {
    const stages = read('backend/Dockerfile.prod').split(/^FROM\s/m);
    expect(stages[stages.length - 1]).toMatch(/^ENV CHECKPOINT_DISABLE=1$/m);
  });

  describe('the backend start script', () => {
    const script = read('backend/scripts/start.sh');
    const lines = script.split('\n').filter((line) => !line.trimStart().startsWith('#'));
    /** Where the root phase ends: everything after it runs as appuser. */
    const appuserPhase = script.slice(script.indexOf('\nfi\n', script.indexOf('if [ "$(id -u)" = "0" ]')));

    it("runs the project's own Prisma, without npx, which writes to the home folder", () => {
      expect(lines.filter((line) => /\bnpx\b/.test(line))).toEqual([]);
      expect(script).toMatch(/^if \.\/node_modules\/\.bin\/prisma migrate deploy; then$/m);
    });

    it('removes the dumps a stopped backup or restore left in /tmp, which outlives the container, before the app starts', () => {
      // On the backend_tmp volume they would survive an upgrade, and each is a
      // copy of every credential on the instance.
      const removal = /\brm -rf ([^;|&\n]*)/.exec(appuserPhase)?.[1] ?? '';
      expect(removal.split(/\s+/)).toEqual(expect.arrayContaining(['/tmp/cozyvtt-db-*', '/tmp/cozyvtt-restore-*']));
      expect(appuserPhase.indexOf('rm -rf')).toBeLessThan(appuserPhase.lastIndexOf('exec "$@"'));
      expect(appuserPhase.indexOf('rm -rf')).toBeGreaterThan(0);
    });
  });

  it.each(['docs/DEPLOYMENT.md', 'backend/DATABASE_MIGRATIONS.md'])(
    "%s runs Prisma in the backend container as the project's own, without npx",
    (file) => {
      // The command itself, from `docker` on: a table row also names the development form.
      const commands = backendExecLines(file).map((line) => line.slice(line.search(/docker(?: compose)? exec/)));
      expect(commands.filter((command) => /\bnpx\b/.test(command.split('`')[0]))).toEqual([]);
    }
  );

  it('are described in the README as they run: only the backend is said to drop to an unprivileged user', () => {
    const readme = read('README.md');
    expect(readme).not.toMatch(/non-root Docker containers/i);
    expect(readme).toMatch(/master process runs as root/);
    expect(readme).toMatch(/drops every Linux capability except the few its start-up needs/);
  });
});
