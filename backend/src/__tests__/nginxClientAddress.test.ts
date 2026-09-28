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
 * connection from a private or local address, and hands the backend that
 * one address. A visitor from the internet cannot choose theirs, because
 * their own connection is not from a trusted address. These check the
 * configuration that decides it; docs/DEPLOYMENT.md describes it for
 * self-hosters.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const conf = read('nginx/nginx.conf');

/** Directive lines, comments dropped: what nginx actually runs. */
const live = conf
  .split('\n')
  .map((line) => line.replace(/#.*$/, '').trim())
  .filter(Boolean);

/** Directive lines of the HTTPS server block, which ships commented out. */
const https = conf
  .slice(conf.indexOf('\n# server {'))
  .split('\n')
  .filter((line) => /^#\s{2,}\S|^# server \{|^# \}/.test(line))
  .map((line) => line.replace(/^#\s?/, '').trim());

const values = (lines: string[], directive: string) =>
  lines.filter((line) => line.startsWith(`${directive} `)).map((line) => line.slice(directive.length).replace(/;$/, '').trim());

describe('the bundled nginx configuration', () => {
  it('believes X-Forwarded-For only from loopback and private addresses', () => {
    // The trusted ranges, exactly: one more (a public range, or 0.0.0.0/0)
    // would let a visitor from the internet choose the address the rate
    // limits count, and dodge them.
    expect(values(live, 'set_real_ip_from')).toEqual([
      '127.0.0.1',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '::1',
      'fc00::/7',
    ]);
    expect(values(live, 'real_ip_header')).toEqual(['X-Forwarded-For']);
    // Without this nginx takes only the last address in the header, which
    // behind a tunnel on the same server is another private address.
    expect(values(live, 'real_ip_recursive')).toEqual(['on']);
  });

  it.each([
    ['HTTP', live],
    ['commented HTTPS', https],
  ])('hands the backend only the resolved address, in every %s location that proxies', (_name, lines) => {
    // Each proxy_pass location, with the headers it sets.
    const locations: { name: string; forwardedFor: string[] }[] = [];
    let current: { name: string; forwardedFor: string[]; proxies: boolean } | null = null;
    for (const line of lines) {
      if (line.startsWith('location ')) current = { name: line, forwardedFor: [], proxies: false };
      else if (current && line.startsWith('proxy_pass ')) current.proxies = true;
      else if (current && /^proxy_set_header\s+X-Forwarded-For\s/.test(line)) {
        current.forwardedFor.push(line.replace(/^proxy_set_header\s+X-Forwarded-For\s+/, '').replace(/;$/, ''));
      } else if (current && line === '}') {
        if (current.proxies) locations.push({ name: current.name, forwardedFor: current.forwardedFor });
        current = null;
      }
    }
    expect(locations.length).toBeGreaterThanOrEqual(5);
    // /health in the HTTPS block sets no X-Forwarded-For; it is outside /api
    // and nothing there counts per address. Every other location must hand
    // over $remote_addr, the visitor as resolved above: an appended chain
    // would put the proxy's address last again.
    const wrong = locations
      .filter((l) => !(l.name === 'location = /health {' && l.forwardedFor.length === 0))
      .filter((l) => l.forwardedFor.length !== 1 || l.forwardedFor[0] !== '$remote_addr')
      .map((l) => `${l.name} ${JSON.stringify(l.forwardedFor)}`);
    expect(wrong).toEqual([]);
  });

  it('is paired with a backend that trusts exactly one proxy, this one', () => {
    // More hops trusted would read an address further left, which a visitor
    // can write; none would count every visitor as nginx itself.
    expect(read('backend/src/server.ts')).toMatch(/^app\.set\('trust proxy', 1\);$/m);
  });
});
