/**
 * Facts the guides state about the code or the shipped files, checked against
 * them. A guide is read by someone following it step by step, so a sentence
 * that stopped being true is a step that fails for them. Where a fact is
 * written in two places that must agree, the checks that keep them in step
 * are in keepInStep.test.ts; these are the guides' own claims.
 */

import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import { isSmtpConfigured } from '../services/email';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/** The text of a guide from the heading that starts with `from` to the heading `to`. */
function section(rel: string, from: string, to: string): string {
  const guide = read(rel);
  const start = guide.indexOf(from);
  const end = guide.indexOf(to, start + from.length);
  if (start === -1 || end === -1) throw new Error(`${rel} no longer has the headings ${from} and ${to}`);
  return guide.slice(start, end);
}

describe("the Let's Encrypt steps in the deployment guide", () => {
  const steps = section('docs/DEPLOYMENT.md', "## SSL/TLS with Let's Encrypt", '## Manual Deployment');

  // The standalone method makes certbot bind port 80 itself, which the running
  // nginx container holds, so the first certificate came and every renewal
  // after it failed with "Could not bind TCP port 80".
  it('ask certbot for the webroot method, never the standalone one that needs port 80 to itself', () => {
    expect(steps).toMatch(/certbot certonly --webroot /);
    // A command to run, at the start of a line; the older method may still be named in a sentence.
    expect(steps).not.toMatch(/^\s*(?:sudo )?certbot .*--standalone/m);
  });

  // The folder certbot writes the check file into has to be one the nginx
  // container sees, and the location that serves the check has to read the
  // same folder. The guide used /var/www/certbot, which nothing mounted.
  it('give certbot a folder the nginx container mounts, and serve that same folder', () => {
    const compose = read('docker-compose.yml');
    const mount = /^\s*- \.\/nginx\/conf\.d:(\/[^:\s]+)/m.exec(compose);
    if (!mount) throw new Error('docker-compose.yml no longer mounts nginx/conf.d');

    const written = [...steps.matchAll(/certbot certonly --webroot -w "\$PWD\/(nginx\/conf\.d\/[\w-]+)"/g)].map((m) =>
      m[1].replace('nginx/conf.d', mount[1])
    );
    const served = [...steps.matchAll(/^\s*root (\/[^;\s]+);/gm)].map((m) => m[1]);

    expect(written.length).toBeGreaterThan(0);
    expect(served.length).toBeGreaterThan(0);
    expect(new Set(served)).toEqual(new Set(written));
  });

  it('end with a renewal check the reader can run', () => {
    expect(steps).toContain('sudo certbot renew --dry-run');
  });
});

describe('the manual-install nginx example in the deployment guide', () => {
  const example = section('docs/DEPLOYMENT.md', '### 5. Serve with Nginx', '## Environment Configuration');

  /** Each `location` block of the example, by its path, with the text inside it. */
  const locations = [...example.matchAll(/^\s*location\s+(?:=\s+)?(\S+)\s*\{([^}]*)\}/gm)].map((m) => ({ path: m[1], body: m[2] }));

  /**
   * The headers the frontend container sends with the app page, as lines of
   * its config file. The policy there names an extra connect address, filled
   * in at image build time and empty now that the backend shares the page's
   * address.
   */
  const pageHeaders = read('frontend/security-headers.conf')
    .split('\n')
    .filter((line) => line.startsWith('add_header '))
    .map((line) => line.replace('${CSP_CONNECT_EXTRA}', ''));

  // A host nginx serving frontend/dist never sees the container's config, so
  // the page it serves had no Content-Security-Policy and no Permissions-Policy
  // at all, and a weaker X-Frame-Options.
  it('sends the app page every header the bundled setup sends it', () => {
    const page = locations.find((location) => location.path === '/');
    expect(pageHeaders.length).toBeGreaterThan(0);
    expect(page).toBeDefined();
    for (const header of pageHeaders) expect(page?.body).toContain(header);
  });

  // The socket's block had neither header, so the backend read every
  // visitor to a live table as the proxy.
  it('hands the backend the visitor’s address and protocol from every proxied location', () => {
    const proxied = locations.filter((location) => location.body.includes('proxy_pass'));
    expect(proxied.length).toBeGreaterThan(0);
    const without = proxied
      .filter((location) => !location.body.includes('X-Forwarded-For') || !location.body.includes('X-Forwarded-Proto'))
      .map((location) => location.path);
    expect(without).toEqual([]);
  });
});

describe('HSTS, in the deployment guide', () => {
  /** The Strict-Transport-Security value helmet sets when asked for nothing about it. */
  function helmetDefault(): string | undefined {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      removeHeader: () => undefined,
      getHeader: () => undefined,
    };
    helmet()({} as never, response as never, () => undefined);
    return headers['strict-transport-security'];
  }

  // The guide said HSTS was off until the administrator added it. The backend
  // sends helmet's default with every answer it makes, /api and /socket.io
  // included, and a browser keeps a host on HTTPS for that long once it has
  // seen the header over HTTPS.
  it('says what the backend sends, which is helmet’s default because server.ts leaves it alone', () => {
    expect(read('backend/src/server.ts')).not.toMatch(/\bhsts\b|strictTransportSecurity/i);

    const sent = helmetDefault();
    expect(sent).toMatch(/^max-age=\d+; includeSubDomains$/);
    expect(read('docs/DEPLOYMENT.md')).toContain(`\`Strict-Transport-Security: ${sent}\``);
  });

  it('no longer calls HSTS something the administrator adds', () => {
    expect(read('docs/DEPLOYMENT.md')).not.toMatch(/HSTS is the one you add yourself/);
  });
});

describe('SMTP, in the deployment guide', () => {
  const settings = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const saved = Object.fromEntries(settings.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of settings) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  // Email is on only with a host, a user and a password. The guide listed the
  // variables and never said so, and a relay that needs no login looked like
  // an instance whose email was simply broken.
  it('counts as set up only with a host, a user and a password, which the guide says', () => {
    for (const name of settings) process.env[name] = 'set';
    expect(isSmtpConfigured()).toBe(true);
    for (const missing of settings) {
      process.env[missing] = '';
      expect(isSmtpConfigured()).toBe(false);
      process.env[missing] = 'set';
    }

    expect(read('docs/DEPLOYMENT.md')).toContain('`SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are **all** set');
  });
});

describe('the Admin Panel status card, in the deployment guide', () => {
  // The card's WS light is green when the backend's live-connection server
  // exists in the process (GET /api/admin/health), which it does whenever the
  // backend is running. The guide said it checked that connections can be
  // made, which a proxy that refuses WebSocket upgrades defeats unseen.
  it('does not say the card tests whether live connections can be made', () => {
    expect(read('docs/DEPLOYMENT.md')).not.toMatch(/also whether live game connections can be made/);
  });

  it('says what the live-connections light does check, and where to see whether they work', () => {
    const guide = read('docs/DEPLOYMENT.md');
    expect(guide).toContain('does not tell you that a proxy in front lets live connections through');
  });
});

describe('the game systems named in the guides', () => {
  const constants = read('frontend/src/constants/game-systems.ts');
  const options = constants.slice(constants.indexOf('export const GAME_SYSTEM_OPTIONS'));
  /** The systems the creation lists offer: a commented-out entry starts with //, not with value. */
  const selectable = [...options.slice(0, options.indexOf('];')).matchAll(/^\s*value: GameSystem\.(\w+)/gm)].map((m) => m[1]);
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

  // Shadowrun 6e is in the code but not in the lists a game system is chosen
  // from. The guides called it shipped, planned and on the roadmap, and the
  // number of systems counted it.
  it('are counted in GAME_SYSTEMS.md as the ones that can be chosen', () => {
    expect(selectable).not.toContain('SHADOWRUN_6E');
    expect(read('docs/GAME_SYSTEMS.md')).toContain(`CozyVTT currently ships ${words[selectable.length]} systems you can choose`);
  });
});

describe('the commands the guides tell a reader to run', () => {
  const guides = ['README.md', 'frontend/README.md', 'backend/docs/README.md', 'docs/GAME_SYSTEMS.md', 'docs/DEVELOPMENT.md', 'docs/CONTRIBUTING.md'];

  // `npm test` in the frontend is vitest in watch mode, which waits for a key
  // press and never exits in a terminal; the gates are `npx vitest run`.
  it('never include npm test unless the line says it is watch mode', () => {
    const offenders = guides.flatMap((rel) => {
      let inFence = false;
      return read(rel)
        .split('\n')
        .filter((line) => {
          if (line.trimStart().startsWith('```')) inFence = !inFence;
          return inFence && /\bnpm test\b/.test(line) && !/watch/i.test(line);
        })
        .map((line) => `${rel}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });
});
