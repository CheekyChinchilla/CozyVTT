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
 * refuse a picture from another address. The offer is gone.
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
  it.each(['.env.example', 'frontend/.env.example'])('%s does not offer a backend on another address', (file) => {
    expect(offered(file).filter((key) => key === 'VITE_API_URL' || key === 'VITE_SOCKET_URL')).toEqual([]);
  });

  it('is not described as an option in the development guide', () => {
    expect(read('docs/DEVELOPMENT.md')).not.toMatch(/\|\s*`VITE_(API|SOCKET)_URL`\s*\|/);
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
