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
    ['an IPv6 prefix past 128', '2001:db8::/129'],
    ['two IPv6 groups', '1:2'],
    ['three colons in a row', '2001:db8:::1'],
    ['an IPv6 group of five digits', '12345::1'],
    ['an IPv6 address with a zone', 'fe80::1%eth0'],
    ['two "::"', '2001::db8::1'],
    ['nine IPv6 groups', '1:2:3:4:5:6:7:8:9'],
    ['eight IPv6 groups and "::"', '1::2:3:4:5:6:7:8'],
    ['an IPv6 address ending in one colon', '2001:db8::1:'],
    ['an IPv6 address starting with one colon', ':2001:db8::1'],
    ['a colon alone', ':'],
    ['an IPv4 tail past 255', '::ffff:192.0.2.256'],
    ['an IPv4 tail after seven groups', '1:2:3:4:5:6:7:192.0.2.1'],
    ['an IPv6 prefix with a leading zero', '2001:db8::/032'],
    ['seven IPv6 groups and "::", which nginx cannot read', '1:2:3:4:5:6:7::'],
  ])('leaves out %s, with a warning, and keeps the rest', (_label, bad) => {
    const r = render(`10.0.0.5 ${bad}`);
    expect(r.status).toBe(0);
    expect(r.realIpFrom).toBe('set_real_ip_from 10.0.0.5; ');
    expect(r.geo).toBe('10.0.0.5 1; ');
    expect(r.warnings).toContain(`'${bad}'`);
    expect(r.warnings).toContain('NGINX_TRUSTED_PROXIES');
  });

  it('keeps every well-formed IPv6 address and range', () => {
    const good = [
      '::1',
      '2001:db8::/32',
      'fc00::/7',
      '::ffff:192.0.2.1',
      '2001:db8::/128',
      '2001:DB8:0:0:8:800:200C:417A',
      '1:2:3:4:5:6::',
      '::2:3:4:5:6:7:8',
      '1:2:3:4:5:6:192.0.2.1',
      '64:ff9b::192.0.2.1/96',
    ];
    const r = render(good.join(' '));
    expect(r.status).toBe(0);
    expect(r.realIpFrom).toBe(good.map((g) => `set_real_ip_from ${g}; `).join(''));
    expect(r.geo).toBe(good.map((g) => `${g} 1; `).join(''));
    expect(r.warnings).toBe('');
  });

  /**
   * nginx refuses to start on an IPv6 entry it cannot read (it takes it for a
   * host name and fails to find it), and the container then restarts until
   * .env is fixed. So every entry the script keeps must be an address nginx
   * reads. Compared here on generated entries with the IPv6 parser of the
   * URL standard, which shares no code with the script: an address in
   * brackets is a valid URL host exactly when it is an IPv6 address. Of the
   * forms that parser takes and nginx does not, seven groups followed by
   * '::' is left out of what the script should keep. An embedded IPv4 tail of
   * 255.255.255.255 is another: the script keeps it, and so does this
   * comparison, since no proxy has that address.
   */
  it('keeps exactly the IPv6 entries an IPv6 parser accepts, with a prefix of 0 to 128', () => {
    let seed = 152;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (n: number): number => Math.floor(random() * n);
    const hex = '0123456789abcdefABCDEF';
    const group = (): string => {
      const length = random() < 0.9 ? 1 + pick(4) : random() < 0.5 ? 0 : 5;
      let g = '';
      for (let i = 0; i < length; i++) g += hex[pick(hex.length)];
      return g;
    };
    const octet = (): string => {
      const x = random();
      if (x < 0.1) return String(256 + pick(50));
      if (x < 0.15) return `0${pick(10)}`;
      return String(pick(256));
    };
    const address = (): string => {
      const tail = random() < 0.3;
      const groups = Array.from({ length: pick(tail ? 8 : 10) }, group);
      let a: string;
      if (random() < 0.6) {
        const at = pick(groups.length + 1);
        a = `${groups.slice(0, at).join(':')}::${groups.slice(at).join(':')}`;
      } else {
        a = groups.join(':');
      }
      if (random() < 0.05) {
        const at = pick(a.length + 1);
        a = `${a.slice(0, at)}:${a.slice(at)}`;
      }
      if (tail) {
        const v4 = [octet(), octet(), octet(), octet()].slice(0, random() < 0.9 ? 4 : 3).join('.');
        a += `${a === '' || a.endsWith(':') ? '' : ':'}${v4}`;
      }
      return a;
    };
    const isIPv6 = (a: string): boolean => {
      if (/^([0-9A-Fa-f]{1,4}:){7}:$/.test(a)) return false;
      try {
        new URL(`http://[${a}]/`);
        return true;
      } catch {
        return false;
      }
    };
    const prefixes = ['', '', '', '/0', '/7', '/64', '/128', '/129', '/200', '/064', '/1000', '/', '/-1', '/1/2'];

    const entries: string[] = [];
    const expected: string[] = [];
    while (entries.length < 1200) {
      const a = address();
      if (!a.includes(':')) continue;
      const prefix = prefixes[pick(prefixes.length)];
      entries.push(a + prefix);
      if (isIPv6(a) && /^(\/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?$/.test(prefix)) expected.push(a + prefix);
    }
    // Both kinds are well represented, so the comparison means something.
    expect(expected.length).toBeGreaterThan(150);
    expect(entries.length - expected.length).toBeGreaterThan(200);

    const r = render(entries.join(' '));
    expect(r.status).toBe(0);
    const kept = r.geo.split('; ').filter((e) => e !== '').map((e) => e.replace(/ 1$/, ''));
    expect(kept.filter((e) => !expected.includes(e))).toEqual([]);
    expect(expected.filter((e) => !kept.includes(e))).toEqual([]);
    expect(kept).toEqual(expected);
  }, 60_000);

  it("leaves the entrypoint's shell options as it found them", () => {
    const r = render('* 10.0.0.5');
    const [before, after] = r.options.split(':');
    expect(after).toBe(before);
  });

  it('is executable, which the entrypoint requires before it sources a file', () => {
    expect(fs.statSync(script).mode & 0o111).not.toBe(0);
  });
});
