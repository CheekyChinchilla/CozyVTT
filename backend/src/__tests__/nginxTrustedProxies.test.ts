/**
 * nginx/trusted-proxies.envsh, which turns NGINX_TRUSTED_PROXIES from .env
 * into the lines nginx/nginx.conf is rendered with.
 *
 * The nginx image's entrypoint sources every `*.envsh` file in
 * /docker-entrypoint.d/ before it renders the template. This one reads a list
 * of addresses and ranges, separated by spaces or commas, and exports one
 * `set_real_ip_from` per entry and one geo entry per entry. An entry that is
 * not an address or a range is left out with a warning, so nothing but an
 * address can reach the configuration. Being sourced, it must leave the
 * entrypoint's shell as it found it, and fail at nothing: the entrypoint runs
 * with `set -e`.
 *
 * Run with the system's sh here; the image runs it with busybox sh.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const script = path.join(root, 'nginx/trusted-proxies.envsh');

interface Rendered {
  realIpFrom: string;
  geo: string;
  warnings: string;
  options: string;
  status: number | null;
}

/** Source the script as the entrypoint does, with the given list. */
function render(list: string | undefined): Rendered {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
  if (list !== undefined) env.NGINX_TRUSTED_PROXIES = list;
  const run = spawnSync(
    'sh',
    ['-c', `set -e; before="$-"; . "${script}"; printf '%s\\n%s\\n%s\\n' "$NGINX_REAL_IP_FROM" "$NGINX_TRUSTED_GEO" "$before:$-"`],
    { env, encoding: 'utf8', cwd: root }
  );
  const [realIpFrom = '', geo = '', options = ''] = run.stdout.split('\n');
  return { realIpFrom, geo, warnings: run.stderr, options, status: run.status };
}

describe('nginx/trusted-proxies.envsh', () => {
  it('trusts nothing beyond loopback when the list is empty or missing', () => {
    for (const list of [undefined, '', '   ']) {
      const r = render(list);
      expect(r.status).toBe(0);
      expect(r.realIpFrom).toBe('');
      expect(r.geo).toBe('');
      expect(r.warnings).toBe('');
    }
  });

  it('writes one line for each address or range, separated by spaces or commas', () => {
    const r = render('172.16.0.0/12, 192.168.1.10  2001:db8::/32,::ffff:10.0.0.1');
    expect(r.status).toBe(0);
    expect(r.realIpFrom).toBe(
      'set_real_ip_from 172.16.0.0/12; set_real_ip_from 192.168.1.10; set_real_ip_from 2001:db8::/32; set_real_ip_from ::ffff:10.0.0.1; '
    );
    expect(r.geo).toBe('172.16.0.0/12 1; 192.168.1.10 1; 2001:db8::/32 1; ::ffff:10.0.0.1 1; ');
    expect(r.warnings).toBe('');
  });

  it.each([
    ['a name', 'proxy.example.com'],
    ['a directive', '10.0.0.1;include'],
    ['a pattern the shell would expand', '*'],
    ['a command', '$(id)'],
    ['a range with two prefixes', '10.0.0.0/8/8'],
    ['a prefix alone', '/8'],
    ['three numbers', '10.0.0'],
    ['a number past 255', '999.1.1.1'],
    ['an IPv4 prefix past 32', '10.0.0.0/33'],
    ['an address with a port', '172.17.0.1:80'],
  ])('leaves out %s, with a warning, and keeps the rest', (_label, bad) => {
    const r = render(`10.0.0.5 ${bad}`);
    expect(r.status).toBe(0);
    expect(r.realIpFrom).toBe('set_real_ip_from 10.0.0.5; ');
    expect(r.geo).toBe('10.0.0.5 1; ');
    expect(r.warnings).toContain(`'${bad}'`);
    expect(r.warnings).toContain('NGINX_TRUSTED_PROXIES');
  });

  it("leaves the entrypoint's shell options as it found them", () => {
    const r = render('* 10.0.0.5');
    const [before, after] = r.options.split(':');
    expect(after).toBe(before);
  });

  it('is executable, which the entrypoint requires before it sources a file', () => {
    expect(fs.statSync(script).mode & 0o111).not.toBe(0);
  });
});
