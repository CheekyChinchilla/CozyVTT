/**
 * The visitor's address, as the bundled nginx hands it to the backend.
 *
 * The backend's rate limits count per address, and it trusts exactly one
 * proxy: the address it counts is the last one in X-Forwarded-For. Behind a
 * Cloudflare Tunnel or any proxy of the self-hoster's own, nginx used to
 * append the address it was connected from, the tunnel's, so every visitor
 * reached the backend as the same address and five wrong passwords from
 * anyone locked the whole instance out of signing in.
 *
 * nginx now takes the visitor from X-Forwarded-For, believing it only on a
 * connection from a trusted address, and hands the backend that one address.
 * Trusted means loopback, plus whatever the self-hoster lists in
 * NGINX_TRUSTED_PROXIES in .env for a tunnel or proxy in front. It used to
 * mean every private range, and Docker relays a visitor over IPv6 from its
 * own gateway, a private address, so such a visitor could choose the address
 * the limits counted. X-Forwarded-Proto, which decides whether the session
 * cookie is marked Secure, is believed from the same addresses only. These
 * check the configuration that decides it; docs/DEPLOYMENT.md describes it
 * for self-hosters.
 *
 * The proxying rules live in nginx/locations.conf, which the plain-HTTP
 * server in the template includes, and so does the HTTPS server a
 * self-hoster writes in nginx/conf.d/ from the deployment guide's example:
 * one list of rules for both, so an upgrade that changes them reaches HTTPS
 * too. nginx/conf.d/ is the self-hoster's own, ignored by git, so neither
 * HTTPS nor anything else of theirs needs an edit to a tracked file.
 *
 * Also here, because it is the same files' promise about who reaches the
 * backend: the backup restore upload streams to the backend, which refuses
 * a non-admin before nginx has taken the body, and so does a campaign import,
 * which has room for the largest archive the backend accepts. And nginx
 * finds the backend and frontend again after either container is recreated.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CAMPAIGN_ARCHIVE_MAX_BYTES } from '../utils/campaignArchiveSize';
import { UPLOAD_OVERHEAD_BYTES, parseProxyBodySize } from '../utils/proxyLimits';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const conf = read('nginx/nginx.conf');

/** Directive lines, comments dropped: what nginx actually runs. */
const directives = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);

const live = directives(conf);

/** The proxying rules every server includes. */
const locations = directives(read('nginx/locations.conf'));

/** Where the nginx container finds the files the template includes. */
const LOCATIONS_PATH = '/etc/nginx/cozyvtt/locations.conf';
const LOCAL_DIR = '/etc/nginx/cozyvtt.d';

/** The nginx service's block of docker-compose.yml. */
const nginxService = (() => {
  const compose = read('docker-compose.yml');
  return compose.slice(compose.indexOf('\n  nginx:\n'), compose.indexOf('\nvolumes:'));
})();

/** The example HTTPS file in the deployment guide, as a self-hoster copies it. */
const httpsExample = (() => {
  const guide = read('docs/DEPLOYMENT.md');
  // Indented as a step of a numbered list; the indent is dropped.
  const m = /^( *)```nginx\n\1(# nginx\/conf\.d\/https\.conf[\s\S]*?)\n\1```/m.exec(guide);
  if (!m) throw new Error('docs/DEPLOYMENT.md no longer has the nginx/conf.d/https.conf example');
  return m[2]
    .split('\n')
    .map((line) => (line.startsWith(m[1]) ? line.slice(m[1].length) : line))
    .join('\n');
})();

const values = (lines: string[], directive: string) =>
  lines.filter((line) => line.startsWith(`${directive} `)).map((line) => line.slice(directive.length).replace(/;$/, '').trim());

/** Each location that proxies, with the directives inside it. */
function proxyingLocations(lines: string[]): { name: string; directives: string[] }[] {
  const found: { name: string; directives: string[] }[] = [];
  let current: { name: string; directives: string[] } | null = null;
  for (const line of lines) {
    if (line.startsWith('location ')) current = { name: line, directives: [] };
    else if (current && line === '}') {
      if (current.directives.some((d) => d.startsWith('proxy_pass '))) found.push(current);
      current = null;
    } else if (current) current.directives.push(line.replace(/\s+/g, ' '));
  }
  return found;
}

describe('the bundled nginx configuration', () => {
  it('believes X-Forwarded-For only from loopback and the addresses .env lists', () => {
    // The trusted addresses, exactly: one more (a private range, which is
    // where Docker relays IPv6 visitors from, or 0.0.0.0/0) would let a
    // visitor choose the address the rate limits count, and dodge them.
    expect(values(live, 'set_real_ip_from')).toEqual(['127.0.0.1', '::1']);
    expect(live).toContain('${NGINX_REAL_IP_FROM}');
    expect(values(live, 'real_ip_header')).toEqual(['X-Forwarded-For']);
    // Without this nginx takes only the last address in the header, which
    // behind a tunnel on the same server is another private address.
    expect(values(live, 'real_ip_recursive')).toEqual(['on']);
  });

  it('hands the backend only the resolved address, in every location that proxies', () => {
    const located = proxyingLocations(locations);
    expect(located.length).toBeGreaterThanOrEqual(5);
    // Every location must hand over $remote_addr, the visitor as resolved
    // above: an appended chain would put the proxy's address last again.
    const wrong = located
      .map((l) => ({ name: l.name, forwardedFor: values(l.directives, 'proxy_set_header').filter((v) => /^X-Forwarded-For\s/.test(v)) }))
      .filter((l) => l.forwardedFor.length !== 1 || !/^X-Forwarded-For\s+\$remote_addr$/.test(l.forwardedFor[0]))
      .map((l) => `${l.name} ${JSON.stringify(l.forwardedFor)}`);
    expect(wrong).toEqual([]);
  });

  // The restore path accepts a whole instance backup, up to 4 GB. Buffered,
  // nginx takes all of it onto its own disk before the backend sees the
  // request, from anyone; streamed, the backend refuses a non-admin before
  // reading the body.
  it('streams the backup restore upload to the backend', () => {
    const restore = proxyingLocations(locations).filter((l) => l.name === 'location /api/admin/backups/restore {');
    expect(restore).toHaveLength(1);
    expect(values(restore[0].directives, 'proxy_request_buffering')).toEqual(['off']);
    expect(values(restore[0].directives, 'client_max_body_size')).toEqual(['4096M']);
  });

  // A campaign archive is up to 500 MB, ten times the body every other route
  // gets. Under the general /api/ location a large one met a 413 page, and
  // one that took more than a minute to unpack met a 504 while the backend
  // went on importing it.
  it('streams a campaign import to the backend with room for the largest archive', () => {
    const imports = proxyingLocations(locations).filter((l) => l.name === 'location /api/campaigns/import {');
    expect(imports).toHaveLength(1);
    const [location] = imports;
    expect(values(location.directives, 'proxy_request_buffering')).toEqual(['off']);
    const [bodySize] = values(location.directives, 'client_max_body_size');
    expect(parseProxyBodySize(bodySize)).toBeGreaterThanOrEqual(CAMPAIGN_ARCHIVE_MAX_BYTES + UPLOAD_OVERHEAD_BYTES);
    const [readTimeout] = values(location.directives, 'proxy_read_timeout');
    expect(Number(/^(\d+)s$/.exec(readTimeout)?.[1])).toBeGreaterThanOrEqual(300);
  });

  // A name written into proxy_pass is looked up once, when nginx starts.
  // Recreating only the backend, as `docker compose up -d` does after a
  // change to .env, left nginx sending to an address nobody had any more.
  it("looks the containers up through Docker's name server when a request needs them", () => {
    expect(values(live, 'resolver')).toEqual(['127.0.0.11 valid=10s ipv6=off']);
  });

  it('names the backend and frontend only through variables', () => {
    expect(values(locations, 'set').map((v) => v.replace(/\s+/g, ' '))).toEqual([
      '$cozyvtt_backend http://backend:4000',
      '$cozyvtt_frontend http://frontend:80',
    ]);
    expect(values(live, 'set')).toEqual([]);
    const targets = proxyingLocations(locations).map((l) => values(l.directives, 'proxy_pass')[0]);
    expect(targets.length).toBeGreaterThanOrEqual(6);
    expect(targets.filter((t) => t !== '$cozyvtt_backend' && t !== '$cozyvtt_frontend')).toEqual([]);
  });

  it('believes X-Forwarded-Proto only from the addresses it believes X-Forwarded-For from', () => {
    // A trusted connection is told apart by the address it really came from.
    const geo = /^geo \$realip_remote_addr \$cozyvtt_trusted_proxy \{\n([\s\S]*?)\n\}/m.exec(conf);
    if (!geo) throw new Error('nginx/nginx.conf no longer marks a trusted connection with a geo block');
    const entries = geo[1].split('\n').map((line) => line.trim()).filter(Boolean);
    expect(entries).toEqual(['default   0;', '127.0.0.1 1;', '::1       1;', '${NGINX_TRUSTED_GEO}']);

    const proto = /^map "\$cozyvtt_trusted_proxy:\$http_x_forwarded_proto" \$real_proto \{\n([\s\S]*?)\n\}/m.exec(conf);
    if (!proto) throw new Error('nginx/nginx.conf no longer decides $real_proto from the trusted flag and the header');
    expect(proto[1].split('\n').map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean)).toEqual([
      'default $scheme;',
      '"1:https" https;',
      '"1:http" http;',
    ]);
    expect(live.filter((line) => line.includes('$http_x_forwarded_proto') && !line.startsWith('map '))).toEqual([]);
  });

  it('has the trusted list rendered into it from NGINX_TRUSTED_PROXIES in .env', () => {
    const compose = read('docker-compose.yml');
    const nginx = compose.slice(compose.indexOf('\n  nginx:\n'), compose.indexOf('\nvolumes:'));
    expect(nginx).toMatch(/\n {6}NGINX_TRUSTED_PROXIES: \$\{NGINX_TRUSTED_PROXIES:-\}\n/);
    // Empty unless the script below fills them, so the template renders even
    // where the script cannot run.
    expect(nginx).toMatch(/\n {6}NGINX_REAL_IP_FROM: ""\n/);
    expect(nginx).toMatch(/\n {6}NGINX_TRUSTED_GEO: ""\n/);
    const filter = /\n {6}NGINX_ENVSUBST_FILTER: "([^"]*)"\n/.exec(nginx)?.[1] ?? '';
    expect(filter.split('|').sort()).toEqual(['NGINX_MAX_BODY_SIZE', 'NGINX_REAL_IP_FROM', 'NGINX_TRUSTED_GEO']);
    // Sourced by the image's entrypoint before it renders the template.
    expect(nginx).toMatch(/\n {6}- \.\/nginx\/trusted-proxies\.envsh:\/docker-entrypoint\.d\/\d\d-[a-z-]+\.envsh:ro\n/);
    const order = /docker-entrypoint\.d\/(\d\d)-/.exec(nginx)?.[1];
    expect(Number(order)).toBeLessThan(20);
  });

  it('gives the plain-HTTP server the shared proxying rules, and proxies nothing itself', () => {
    expect(values(live, 'include')).toContain(LOCATIONS_PATH);
    expect(proxyingLocations(live)).toEqual([]);
    expect(nginxService).toMatch(/\n {6}- \.\/nginx\/locations\.conf:\/etc\/nginx\/cozyvtt\/locations\.conf:ro\n/);
  });

  it("reads the self-hoster's own settings from nginx/conf.d, at the top level, after the shipped server", () => {
    const include = `${LOCAL_DIR}/*.conf`;
    const at = conf.split('\n').findIndex((line) => line.trim() === `include ${include};`);
    expect(at).toBeGreaterThan(-1);
    // Outside every server block, so a file there can hold a whole server.
    let depth = 0;
    for (const line of conf.split('\n').slice(0, at).map((l) => l.replace(/#.*$/, ''))) {
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    }
    expect(depth).toBe(0);
    expect(conf.indexOf('\nserver {')).toBeLessThan(at > -1 ? conf.indexOf(`include ${include};`) : -1);
    expect(nginxService).toMatch(/\n {6}- \.\/nginx\/conf\.d:\/etc\/nginx\/cozyvtt\.d:ro\n/);
  });

  it('keeps nginx/conf.d out of git, apart from its README', () => {
    const ignored = (rel: string) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: root }).status === 0;
    expect(ignored('nginx/conf.d/https.conf')).toBe(true);
    expect(ignored('nginx/conf.d/anything.conf')).toBe(true);
    expect(ignored('nginx/conf.d/README.md')).toBe(false);
    expect(fs.existsSync(path.join(root, 'nginx/conf.d/README.md'))).toBe(true);
  });

  it('ships no HTTPS server to uncomment in a tracked file', () => {
    expect(conf).not.toMatch(/^#\s*server \{/m);
    expect(conf).not.toMatch(/^#\s*listen 443/m);
  });

  it("has an HTTPS example in the deployment guide that includes the shared rules and reads the certificates' folder", () => {
    const lines = directives(httpsExample);
    expect(values(lines, 'include')).toEqual([LOCATIONS_PATH]);
    expect(values(lines, 'ssl_certificate')).toEqual(['/etc/nginx/certs/server.crt']);
    expect(values(lines, 'ssl_certificate_key')).toEqual(['/etc/nginx/certs/server.key']);
    expect(values(lines, 'listen')).toEqual(expect.arrayContaining(['443 ssl']));
  });

  it('is paired with a backend that trusts exactly one proxy, this one', () => {
    // More hops trusted would read an address further left, which a visitor
    // can write; none would count every visitor as nginx itself.
    expect(read('backend/src/server.ts')).toMatch(/^app\.set\('trust proxy', 1\);$/m);
  });
});
