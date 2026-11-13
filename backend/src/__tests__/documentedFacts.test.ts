/**
 * Facts the guides state about the code or the shipped files, checked against
 * them. A guide is read by someone following it step by step, so a sentence
 * that stopped being true is a step that fails for them. Where a fact is
 * written in two places that must agree, the checks that keep them in step
 * are in keepInStep.test.ts; these are the guides' own claims.
 */

import fs from 'fs';
import path from 'path';
import { isSmtpConfigured } from '../services/email';
import { createApp } from '../app';
import { LEFT_OUT_OF_BACKUP, NAME_LEFT_OUT_OF_BACKUP } from '../routes/admin';
import { appLayers } from './helpers/routeInventory';
import { BACKGROUND_WAIT_MS, backgroundLeftMessage } from '../utils/shutdown';
import { MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL } from '../services/sharedDocumentPictures';
import { EMAIL_CHANGES_PER_HOUR, EMAIL_CHANGE_WINDOW_MS, EMAIL_CHANGE_LIMIT_MESSAGE } from '../middleware/emailChangeLimiter';
import { MAX_ARCHIVE_NAME_BYTES } from '../utils/archive';
import { SUPPORTED_GAME_SYSTEMS } from '../game-systems';

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

describe("the Let's Encrypt comments in nginx/nginx.conf", () => {
  const conf = read('nginx/nginx.conf');
  const compose = read('docker-compose.yml');
  /** The folder the guide's certbot command writes the check file into. */
  const folder = /certbot certonly --webroot -w "\$PWD\/(nginx\/conf\.d\/[\w-]+)"/.exec(read('docs/DEPLOYMENT.md'))?.[1];

  // The header said the guide describes certbot --standalone. The guide's
  // steps use --webroot, because --standalone needs port 80 to itself.
  it('do not say the guide describes the standalone method', () => {
    expect(conf).not.toMatch(/certbot --standalone/);
  });

  it('name the folder the guide has certbot write into, which the files in nginx/conf.d/ serve', () => {
    expect(folder).toBeDefined();
    expect(conf).toContain(folder);
  });

  // The location below answers from /var/www/certbot, which the compose file
  // does not mount, so it finds no file; the guide's own port-80 server
  // answers the check for the domain.
  it('say the port-80 check location is unused, since nothing mounts its folder', () => {
    const location = /((?:^[ \t]*#.*\n)+)[ \t]*location \/\.well-known\/acme-challenge\/ \{\s*root ([^;]+);/m.exec(conf);
    if (!location) throw new Error('nginx.conf no longer has a port-80 location for the Let’s Encrypt check');
    expect(compose).not.toContain(`:${location[2].trim()}`);
    expect(location[1]).toMatch(/\bunused\b/i);
    expect(location[1]).toContain(folder);
  });
});

describe('the manual-install nginx example in the deployment guide', () => {
  const example = section('docs/DEPLOYMENT.md', '### 5. Serve with Nginx', '## Environment Configuration');

  /** Each `location` block of the example, by its path, with the text inside it (one level of braces, as an `if` makes, may be nested). */
  const locations = [...example.matchAll(/^\s*location\s+(?:=\s+)?(\S+)\s*\{((?:[^{}]|\{[^}]*\})*)\}/gm)].map((m) => ({ path: m[1], body: m[2] }));

  /** The headers the frontend container sends with the app page, as lines of its config file. */
  const pageHeaders = read('frontend/security-headers.conf')
    .split('\n')
    .filter((line) => line.startsWith('add_header '));

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

describe("the changelog's note for installs without Docker", () => {
  const example = section('docs/DEPLOYMENT.md', '### 5. Serve with Nginx', '## Environment Configuration');
  const note = /^- \*\*If you installed without Docker[^\n]*/m.exec(read('CHANGELOG.md'))?.[0] ?? '';

  // The note named the two X-Forwarded lines of the socket's block. The
  // example's health check block gained three lines too: X-Real-IP,
  // X-Forwarded-For and X-Forwarded-Proto.
  it('names the health check block of the example as well as the live-connection block', () => {
    expect(note).not.toBe('');
    expect(example).toMatch(/location = \/health \{[^}]*X-Forwarded-Proto/);
    expect(example).toMatch(/location \/socket\.io\/ \{[^}]*X-Forwarded-Proto/);
    expect(note).toContain('`/socket.io/` block');
    expect(note).toContain('`/health` block');
    expect(note).toContain('`X-Real-IP`');
  });
});

describe('HSTS, in the deployment guide', () => {
  /** The Strict-Transport-Security value the app's own security headers set. */
  function sentByTheApp(): string | undefined {
    const app = createApp({ session: { secret: 'test-secret-do-not-use-in-production' }, generalApiLimiter: false });
    const layer = appLayers(app).find((candidate) => candidate.name === 'helmetMiddleware');
    if (!layer || typeof layer.handle !== 'function') throw new Error('The app no longer sets its security headers with helmet');
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name.toLowerCase()] = value;
      },
      removeHeader: () => undefined,
      getHeader: () => undefined,
    };
    layer.handle({}, response, () => undefined);
    return headers['strict-transport-security'];
  }

  // The guide said HSTS was off until the administrator added it. The backend
  // sends it with every answer it makes, /api and /socket.io included, and a
  // browser keeps a host on HTTPS for that long once it has seen the header
  // over HTTPS. The value is read from the app, so an option set in app.ts
  // counts as much as a change of helmet's default.
  it('says what the backend sends, and for how many days', () => {
    const sent = sentByTheApp();
    expect(sent).toMatch(/^max-age=\d+; includeSubDomains$/);
    // Every place the guide quotes the header the backend sends.
    const quoted = [...read('docs/DEPLOYMENT.md').matchAll(/`Strict-Transport-Security: ([^`]*)`/g)].map((match) => match[1]);
    expect(quoted.length).toBeGreaterThan(0);
    expect(quoted.filter((value) => value !== sent)).toEqual([]);

    const days = Number(/max-age=(\d+)/.exec(sent ?? '')?.[1]) / 86400;
    expect(section('docs/DEPLOYMENT.md', '### HTTPS is remembered by browsers', '### How it works')).toContain(`(${days} days)`);
  });

  it('no longer calls HSTS something the administrator adds', () => {
    expect(read('docs/DEPLOYMENT.md')).not.toMatch(/HSTS is the one you add yourself/);
  });
});

describe('the database password rule', () => {
  /** A text with the line breaks and comment marks of a comment block taken out. */
  const flat = (rel: string) => read(rel).replace(/\n#[ \t]*/g, ' ');

  // A $ is legal in the user part of a URL, so it does not break the address
  // the stack writes the password into. What a $ does is in the .env file
  // itself: Docker Compose reads it there as the start of a variable name.
  // Both texts listed it with the characters that break the address.
  it('does not list $ among the characters that break the database address', () => {
    const url = new URL('postgresql://cozyvtt:pass$word@database:5432/cozyvtt');
    expect(url.hostname).toBe('database');
    expect(decodeURIComponent(url.password)).toBe('pass$word');

    for (const rel of ['.env.example', 'docs/DEPLOYMENT.md']) {
      const listed = /a character such as (.+?) breaks/.exec(flat(rel))?.[1];
      expect(listed).toBeDefined();
      expect(listed).not.toContain('$');
    }
  });

  it('says why a $ is also unsafe: Docker Compose reads it as the start of a variable name', () => {
    for (const rel of ['.env.example', 'docs/DEPLOYMENT.md']) {
      expect(flat(rel)).toMatch(/Docker Compose reads a `?\$`? in (?:this file|`\.env`) as the start of a variable name/);
    }
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
  // The card's WS part is the browser's own live connection
  // (frontend/src/services/liveConnectionCheck.ts), made as a campaign page
  // makes one, so a proxy that refuses WebSocket upgrades shows. GET
  // /api/admin/health cannot see that proxy: its `websocket` is `ok` whenever
  // the backend runs, and the card once showed WS from it.
  const guide = section('docs/DEPLOYMENT.md', '### Health Check Endpoint', '\n### ');
  const card = read('frontend/src/pages/AdminPage.tsx');

  it('says WS is a connection the browser opens of its own', () => {
    expect(guide).toContain('your browser opens a live connection of its own');
    expect(guide).not.toContain('practically always green');
  });

  it('names each thing WS can show, as the card words it', () => {
    for (const shown of ['Working', 'Polling only', 'Down']) {
      expect(guide).toContain(`**${shown}**`);
      expect(card).toContain(`'${shown}'`);
    }
  });
});

describe('where the uploads folder is changed under Docker', () => {
  // docker-compose.yml is the shipped file: an edit to it stops `git pull`.
  // The example settings file already sent the reader to the override file,
  // which git leaves alone; the settings table sent them to the shipped one.
  it('is the override file, in the settings table of the deployment guide as in the example settings', () => {
    const row = read('docs/DEPLOYMENT.md')
      .split('\n')
      .find((line) => line.startsWith('| `UPLOAD_DIR`'));
    expect(row).toBeDefined();
    expect(row).toContain('`docker-compose.override.yml`');
    expect(row).not.toContain('`docker-compose.yml`');
    expect(read('.env.example')).toContain('uploads volume in docker-compose.override.yml');
  });
});

describe('what a backup leaves out of the uploads folder, in the deployment guide', () => {
  const guide = section('docs/DEPLOYMENT.md', '### Via the Admin Panel', '\n### ');

  it('says a symbolic link is left out, with the line the backend logs for it', () => {
    expect(guide).toContain(`\`${LEFT_OUT_OF_BACKUP}\``);
  });

  it('says a name a restore refuses is left out, with the line the backend logs for it', () => {
    expect(guide).toContain(`\`${NAME_LEFT_OUT_OF_BACKUP}\``);
  });
});

describe('what stopping the backend waits for, in the deployment guide', () => {
  const guide = section('docs/DEPLOYMENT.md', '### Stopping and Starting', '\n## ');

  it('gives the wait for work still going on after a change, with the line the backend logs past it', () => {
    expect(guide).toContain(`stopping waits up to ${BACKGROUND_WAIT_MS / 1000} seconds for it`);
    expect(guide).toContain(`\`${backgroundLeftMessage(BACKGROUND_WAIT_MS)}\``);
  });
});

describe('the game systems named in the guides', () => {
  const constants = read('frontend/src/constants/game-systems.ts');
  const options = constants.slice(constants.indexOf('export const GAME_SYSTEM_OPTIONS'));
  /** The systems the creation lists offer: a commented-out entry starts with //, not with value. */
  const selectable = [...options.slice(0, options.indexOf('];')).matchAll(/^\s*value: GameSystem\.(\w+)/gm)].map((m) => m[1]);
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

  // A system that was in the code but not in the lists a game system is
  // chosen from was called shipped, planned and on the roadmap, and the
  // number of systems counted it. Every system the code has can be chosen.
  it('are counted in GAME_SYSTEMS.md as the ones that can be chosen', () => {
    expect(selectable).toEqual([...SUPPORTED_GAME_SYSTEMS]);
    expect(read('docs/GAME_SYSTEMS.md')).toContain(`CozyVTT currently ships ${words[selectable.length]} systems you can choose`);
  });
});

// The user guide quotes the lines over the sheet of a character, and of a
// template, of a game system CozyVTT no longer supports, word for word.
describe('the guide on an unsupported system', () => {
  const constants = read('frontend/src/constants/game-systems.ts');
  const guide = section('docs/USER_GUIDE.md', '#### Unsupported system', '\n---');
  /** The text a constant of the game system constants is set to, as one quoted line. */
  const setTo = (name: string) => {
    const match = new RegExp(`export const ${name} =\\s*'([^']+)';`).exec(constants);
    if (!match) throw new Error(`frontend/src/constants/game-systems.ts no longer sets ${name} to one quoted line`);
    return match[1];
  };

  it('names the system as the app does', () => {
    expect(guide).toContain(`**${setTo('UNSUPPORTED_SYSTEM_LABEL')}**`);
  });

  it.each(['UNSUPPORTED_SYSTEM_NOTICE', 'UNSUPPORTED_SYSTEM_TEMPLATE_NOTICE'])('quotes %s as the app shows it', (name) => {
    expect(guide).toContain(`*${setTo(name)}*`);
  });

  it('quotes what the import window says of a character file naming that system', () => {
    const match = /export const RETIRED_SYSTEM_FILE_NOTICE =\s*"([^"]+)";/.exec(read('frontend/src/utils/character-export.ts'));
    if (!match) throw new Error('frontend/src/utils/character-export.ts no longer sets RETIRED_SYSTEM_FILE_NOTICE to one quoted line');
    expect(guide).toContain(`*${match[1]}*`);
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

describe('docs/ARCHITECTURE.md', () => {
  const doc = read('docs/ARCHITECTURE.md');

  /** Each model of the Prisma schema, with the names of its fields and the types they have. */
  const models = new Map<string, { fields: Set<string>; types: Set<string> }>();
  for (const m of read('backend/prisma/schema.prisma').matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const fields = new Set<string>();
    const types = new Set<string>();
    for (const line of m[2].split('\n')) {
      const [name, type] = line.trim().split(/\s+/);
      if (!name || name.startsWith('//') || name.startsWith('@@')) continue;
      fields.add(name);
      if (type) types.add(type.replace(/[?[\]]/g, ''));
    }
    models.set(m[1], { fields, types });
  }

  // The diagram named fields the schema does not have (isGlobalAssetManager,
  // approved, isActive, spiritLayerActive), a relation it does not have
  // (a map using assets), and left seven models out.
  describe('the entity diagram', () => {
    const erd = /```mermaid\nerDiagram\n([\s\S]*?)```/.exec(doc)?.[1] ?? '';
    const entities = [...erd.matchAll(/^ {4}(\w+) \{\n([\s\S]*?)^ {4}\}/gm)].map((m) => ({
      name: m[1],
      fields: m[2].split('\n').map((line) => line.trim().split(/\s+/)[1]).filter((name): name is string => !!name),
    }));
    const relations = [...erd.matchAll(/^ {4}(\w+) \|\|--o[{|] (\w+) :/gm)].map((m) => [m[1], m[2]] as const);

    it('shows only models, and fields of them, that the schema has', () => {
      expect(entities.length).toBeGreaterThan(0);
      const unknown = entities.flatMap((entity) => {
        const model = models.get(entity.name);
        if (!model) return [`${entity.name} is not a model`];
        return entity.fields.filter((field) => !model.fields.has(field)).map((field) => `${entity.name}.${field}`);
      });
      expect(unknown).toEqual([]);
    });

    it('draws a relation only between models the schema relates', () => {
      const unrelated = relations
        .filter(([a, b]) => !models.get(b)?.types.has(a) && !models.get(a)?.types.has(b))
        .map(([a, b]) => `${a} -- ${b}`);
      expect(relations.length).toBeGreaterThan(0);
      expect(unrelated).toEqual([]);
    });

    it('shows every model of the schema', () => {
      const shown = new Set(entities.map((entity) => entity.name));
      expect([...models.keys()].filter((name) => !shown.has(name))).toEqual([]);
    });
  });

  // The overview said the backend serves the built frontend, as one process.
  // The Docker stack is four containers, and the backend serves no pages.
  it('describes every service of the Docker stack in its overview', () => {
    const compose = read('docker-compose.yml');
    const block = compose.slice(compose.indexOf('\nservices:'), compose.indexOf('\nvolumes:'));
    const services = [...block.matchAll(/^ {2}(\w+):$/gm)].map((m) => m[1]);
    const overview = doc.slice(doc.indexOf('## High-Level Overview'), doc.indexOf('## Backend Architecture'));
    expect(services).toEqual(expect.arrayContaining(['database', 'backend', 'frontend', 'nginx']));
    expect(services.filter((service) => !overview.includes(service))).toEqual([]);
    expect(overview).not.toMatch(/backend serves both the REST API and the built frontend/);
  });

  it('lists every middleware file, and none that is not there', () => {
    const files = fs.readdirSync(path.join(root, 'backend/src/middleware')).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    const listing = doc.slice(doc.indexOf('├── middleware/'), doc.indexOf('├── routes/'));
    const listed = [...listing.matchAll(/[├└]── (\w+\.ts)/g)].map((m) => m[1]);
    expect(files.filter((name) => !listed.includes(name))).toEqual([]);
    expect(listed.filter((name) => !files.includes(name))).toEqual([]);
  });

  it('lists every context the frontend has', () => {
    const files = fs.readdirSync(path.join(root, 'frontend/src/contexts')).filter((name) => name.endsWith('.tsx'));
    const listing = doc.slice(doc.indexOf('├── contexts/'), doc.indexOf('├── stores/'));
    expect(files.filter((name) => !listing.includes(name))).toEqual([]);
  });

  it('names only guards that exist', () => {
    const exported = new Set(
      fs
        .readdirSync(path.join(root, 'backend/src/middleware'))
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
        .flatMap((name) => [...read(`backend/src/middleware/${name}`).matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]))
    );
    const named = [...doc.matchAll(/\b(require[A-Z]\w*)\(/g)].map((m) => m[1]);
    expect(named.filter((name) => !exported.has(name))).toEqual([]);
  });
});

describe('docs/DEVELOPMENT.md', () => {
  const guide = read('docs/DEVELOPMENT.md');

  // prisma/seed.ts is a stub that logs two lines. The guide sent a new
  // contributor to it for an administrator account that it never made.
  it('promises seed data only if the seed script makes any', () => {
    const makesRecords = /\.(create|createMany|upsert)\(/.test(read('backend/prisma/seed.ts'));
    expect(/creates a sample admin account/.test(guide)).toBe(makesRecords);
  });

  // The workflow named a protected `main` and a `develop` branch that does not
  // exist. The branches CI runs on are the ones work goes through.
  it('names the branches CI runs on, and no other long-lived branch', () => {
    const triggers = /branches: \[([^\]]+)\]/.exec(read('.github/workflows/ci.yml'))?.[1].split(',').map((name) => name.trim()) ?? [];
    const branches = guide.slice(guide.indexOf('### Branches'), guide.indexOf('### Commit Messages'));
    expect(triggers.length).toBeGreaterThan(0);
    for (const name of triggers) expect(branches).toContain(`\`${name}\``);
    expect(branches).not.toContain('`develop`');
  });

  // The guide and the dev compose file said the backend ran under nodemon
  // after the dev script stopped using it.
  it("gives the backend's dev command as package.json has it, and names no watcher it does not install", () => {
    const manifest = JSON.parse(read('backend/package.json')) as {
      scripts: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(guide).toContain(`The backend's \`npm run dev\` is \`${manifest.scripts.dev}\`.`);
    if (!manifest.devDependencies?.nodemon) {
      expect(guide).not.toMatch(/nodemon/i);
      expect(read('docker-compose.dev.yml')).not.toMatch(/nodemon/i);
    }
  });
});

describe('backend/docs', () => {
  const yaml = read('backend/docs/API_DOCUMENTATION.yaml');
  /** A path as its segments, every {parameter} the same placeholder. */
  const segments = (route: string) =>
    route
      .split('?')[0]
      .replace(/\/$/, '')
      .split('/')
      .map((segment) => (/^\{.*\}$/.test(segment) ? '{}' : segment));
  const documented = [...yaml.matchAll(/^ {2}(\/\S+):\s*$/gm)].map((m) => segments(m[1]));

  // The description of the campaign fetch pointed at GET /api/maps/{id}, the
  // route before maps were nested under campaigns. The coverage script reads
  // the paths, not the prose, so it never noticed.
  it('names in its prose only routes it documents', () => {
    const mentioned = [...yaml.matchAll(/`(?:GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^`\s<*]+)`/g)].map((m) => m[1]);
    const unknown = mentioned.filter((route) => {
      const wanted = segments(route);
      return !documented.some(
        (candidate) =>
          candidate.length === wanted.length &&
          candidate.every((segment, at) => segment === wanted[at] || segment === '{}' || wanted[at] === '{}')
      );
    });
    expect(mentioned.length).toBeGreaterThan(0);
    expect(unknown).toEqual([]);
  });

  // The header said it turned off three rules and described four.
  it('redocly.yaml says how many lint rules it turns off', () => {
    const config = read('backend/docs/redocly.yaml');
    const off = config.slice(config.indexOf('\nrules:')).match(/^ {2}[\w.-]+: off$/gm)?.length ?? 0;
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];
    expect(config).toContain(`tunes off ${words[off]} lint rules`);
  });
});

describe('backend/RBAC_QUICK_REFERENCE.md', () => {
  const doc = read('backend/RBAC_QUICK_REFERENCE.md');

  /** Every non-test source file under backend/src, by path from there. */
  const sources = new Map<string, string>();
  const collect = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, 'backend/src', dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') collect(rel);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        sources.set(rel, read(`backend/src/${rel}`));
      }
    }
  };
  collect('');

  it('names only source files that exist', () => {
    const named = [...doc.matchAll(/`((?:routes|services|utils|middleware|websocket)\/[\w./-]+\.ts)`/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((file) => !sources.has(file))).toEqual([]);
  });

  // The reference taught canEditCharacter as the standard way to authorise a
  // character edit. No route calls it, and its rules differ from the route's:
  // it lets any admin through, takes the campaign from the caller, and does
  // not refuse a spectator who owns the character.
  it('tells you to import only permission helpers that a route or handler really calls', () => {
    const imported = /import \{([^}]*)\} from '\.\.\/services\/permissions'/.exec(doc)?.[1] ?? '';
    const helpers = imported
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter((name) => /^[A-Za-z]\w*$/.test(name));
    expect(helpers.length).toBeGreaterThan(0);
    const calledBy = (helper: string) =>
      [...sources].some(([file, text]) => file !== 'services/permissions.ts' && new RegExp(`\\b${helper}\\(`).test(text));
    expect(helpers.filter((helper) => !calledBy(helper))).toEqual([]);
  });

  // "Admin override applies" in the checklist implied a general override. A
  // platform admin who is not at the table is refused by the campaign guards.
  it('does not promise a general admin override in its checklist', () => {
    expect(doc).not.toMatch(/should succeed if Admin override applies/);
  });
});

describe('the schema documents in backend/prisma', () => {
  const schema = read('backend/prisma/schema.prisma');
  const modelNames = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);

  it('README.md says how many models the schema has', () => {
    expect(read('backend/prisma/README.md')).toContain(`${modelNames.length} models`);
  });

  // The README said the upload route rejects DOCUMENT; it accepts it.
  it('README.md says which asset types an upload accepts, as the route does', () => {
    const accepted = /\[((?:'[A-Z]+',? ?)+)\]\.includes\(type\)/.exec(read('backend/src/routes/assets.ts'))?.[1].match(/[A-Z]+/g) ?? [];
    expect(accepted).toContain('DOCUMENT');
    expect(read('backend/prisma/README.md')).toContain(`only ${accepted.join(' / ')} are accepted from clients`);
  });
});

describe('backend/DATABASE_MIGRATIONS.md', () => {
  const doc = read('backend/DATABASE_MIGRATIONS.md');
  const migrations = fs
    .readdirSync(path.join(root, 'backend/prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  // A migration that changes rows runs by itself on upgrade, which the page's
  // table of data scripts, run by hand, could be read to deny. The one that
  // rewrites every map's lights was not named anywhere.
  it('names every migration that changes rows, and says it runs by itself', () => {
    const changesRows = migrations.filter((name) =>
      /^\s*(UPDATE|DELETE FROM|INSERT INTO)\b/im.test(read(`backend/prisma/migrations/${name}/migration.sql`))
    );
    expect(changesRows.length).toBeGreaterThan(0);
    expect(changesRows.filter((name) => !doc.includes(name))).toEqual([]);
    expect(doc).toMatch(/run by themselves|runs by itself|run automatically/);
  });

  // `docker compose down -v` deletes the database volume. It sat under
  // Troubleshooting, in a file the deployment guide sends self-hosters to.
  it('shows a reset that deletes the database only under a development-only warning', () => {
    const resets = [...doc.matchAll(/down -v/g)].map((m) => doc.slice(Math.max(0, m.index - 700), m.index));
    expect(resets.length).toBeGreaterThan(0);
    expect(resets.filter((before) => !/development only/i.test(before))).toEqual([]);
  });

  it('spells the Compose command the current way', () => {
    expect(doc).not.toMatch(/docker-compose (?!\.)/);
  });

  it('gives the command to run each data script in the production image', () => {
    const scripts = [...read('backend/package.json').matchAll(/"[\w:-]+": "ts-node src\/scripts\/([\w-]+)\.ts"/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((name) => !doc.includes(`dist/scripts/${name}.js`))).toEqual([]);
  });
});

describe('what a reader is asked to send, and where', () => {
  const template = read('.github/ISSUE_TEMPLATE/bug_report.md').toLowerCase();

  // CONTRIBUTING.md asks for the CozyVTT version and more; the template was
  // GitHub's stock one, which asks for the browser's version and nothing about
  // the install, and says nothing about secrets in a pasted .env or log.
  it('the bug report template asks for what CONTRIBUTING.md asks for', () => {
    const asked = [...read('docs/CONTRIBUTING.md').matchAll(/^- (CozyVTT version|Browser and OS|Steps to reproduce|Expected vs actual behavior|Console output)/gm)].map((m) => m[1]);
    expect(asked).toHaveLength(5);
    for (const key of ['cozyvtt version', 'browser', 'steps to reproduce', 'expected', 'console']) expect(template).toContain(key);
  });

  it('the bug report template asks how it is installed and warns against pasting secrets', () => {
    expect(template).toMatch(/docker|install/);
    expect(template).toMatch(/proxy|tunnel/);
    expect(template).toMatch(/redact|remove (any )?(secret|password)/);
    expect(template).toContain('security.md');
  });

  it('the new-issue chooser links the security policy and has no blank issue', () => {
    const config = read('.github/ISSUE_TEMPLATE/config.yml');
    expect(config).toMatch(/blank_issues_enabled: false/);
    expect(config).toMatch(/security\/advisories\/new/);
  });

  it('SECURITY.md says what is in scope and what to do without GitHub reporting', () => {
    const policy = read('SECURITY.md');
    expect(policy).toMatch(/## What is in scope/);
    expect(policy).toMatch(/If you cannot use GitHub/);
  });

  // The Won't Do list kept the template's "explain why" line under a real entry.
  it('FUTURE_FEATURES.md keeps no template placeholder', () => {
    expect(read('docs/FUTURE_FEATURES.md')).not.toMatch(/_\(items intentionally dropped/);
  });
});

describe('the guides on moving a token and on setting up', () => {
  const guides = ['README.md', 'docs/USER_GUIDE.md', 'docs/PLAYER_GUIDE.md', 'docs/GM_GUIDE.md'].map((rel) => ({ rel, text: read(rel).replace(/\*\*/g, '') }));

  // The map picks a token up on one click and puts it down on the next;
  // letting go of the button does nothing to a held token (MapCanvas).
  // Dragging a character from the roster onto the map is a real drag, and a
  // light can be dragged, so those are not what is looked for.
  it('never tell a reader to drag a token to move it', () => {
    const wording = [
      /\b(?:drag|dragging|dragged) (?:a |the |your |any |all )?(?:player )?tokens?\b/i,
      /ready to drag/i,
      /drag it (?:where|to move)/i,
      /\bdrag to move\b/i,
    ];
    const found = guides.flatMap(({ rel, text }) => wording.flatMap((pattern) => (pattern.exec(text) ? [`${rel}: ${pattern}`] : [])));
    expect(found).toEqual([]);
  });

  // The behaviour itself is driven through MapCanvas by this suite.
  it('describe the pick-up and put-down the map really uses', () => {
    expect(read('frontend/src/components/campaign/__tests__/MapCanvasInput.test.tsx')).toContain("describe('moving a token: click to pick it up, click again to put it down'");
    for (const { text } of guides) expect(text).toMatch(/click/i);
  });

  // The wizard asks for a setup token on its admin step; the user guide's
  // account of the wizard left it out and said the wizard ran "before anyone
  // else can log in", a protection the token now supplies.
  it('the user guide names the setup token the wizard asks for', () => {
    expect(read('frontend/src/pages/SetupWizardPage.tsx')).toContain('Setup token');
    const guide = read('docs/USER_GUIDE.md');
    expect(guide).toContain('**Setup token**');
    expect(guide).not.toMatch(/before anyone else can log in/);
  });
});

describe('what the comments in the backend source point to', () => {
  /** Every non-test source file under backend/src, by path from the repository root. */
  const sources: string[] = [];
  const collect = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') collect(rel);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        sources.push(rel);
      }
    }
  };
  collect('backend/src');

  // The campaign fetch comment sent a reader to GET /api/maps/:id, the route
  // before maps were nested under their campaign.
  it('never name the maps route as it was before maps were nested under campaigns', () => {
    const found = sources.filter((rel) => /\/api\/maps\//.test(read(rel)));
    expect(found).toEqual([]);
  });

  // The types of an unreleased system cited an example file the repository
  // does not have. Those types are gone and nothing cites an example file
  // now; this keeps any new citation true.
  it('name only example character files that exist', () => {
    expect(sources.length).toBeGreaterThan(0);
    const cited = sources.flatMap((rel) => [...read(rel).matchAll(/\/Examples\/([\w.-]+)/g)].map((m) => ({ rel, file: m[1] })));
    expect(cited.filter(({ file }) => !fs.existsSync(path.join(root, 'Examples', file))).map(({ rel, file }) => `${rel}: ${file}`)).toEqual([]);
  });
});

describe('the dependency check SECURITY.md describes', () => {
  /** The steps of one CI job, each as its text. */
  function jobSteps(job: string): string[] {
    const workflow = read('.github/workflows/ci.yml');
    const start = workflow.indexOf(`\n  ${job}:\n`);
    if (start === -1) throw new Error(`.github/workflows/ci.yml no longer has a ${job} job`);
    const rest = workflow.slice(start + 1);
    const end = rest.slice(1).search(/\n {2}[a-z]/);
    const body = end === -1 ? rest : rest.slice(0, end + 1);
    return body.split(/\n {6}- /).slice(1);
  }

  const productionAudits = jobSteps('audit').filter((step) => /npm audit --omit=dev/.test(step));

  // The check reported and passed whatever it found, while the advisories it
  // found then were being cleared. SECURITY.md now says it fails the run.
  it('fails the run on a high or critical advisory in what an instance runs, in both projects', () => {
    expect(productionAudits.map((step) => /working-directory: (\w+)/.exec(step)?.[1]).sort()).toEqual(['backend', 'frontend']);
    for (const step of productionAudits) {
      expect(step).toMatch(/--audit-level=high\b/);
      expect(step).not.toMatch(/continue-on-error:\s*true/);
    }
    expect(read('SECURITY.md')).toMatch(/high or critical advisory .*fails/);
  });

  // A failing backend audit skipped the frontend's, so its result was never seen.
  it('runs every audit whatever the audits before it found', () => {
    const audits = jobSteps('audit').filter((step) => /npm audit\b/.test(step));
    expect(audits.length).toBeGreaterThan(1);
    for (const step of audits.slice(1)) expect(step).toMatch(/^\s*if: always\(\)\s*$/m);
  });

  it('reports the developer tools without failing on them', () => {
    const tools = jobSteps('audit').filter((step) => /npm audit\b/.test(step) && !/--omit=dev/.test(step));
    expect(tools.length).toBeGreaterThan(0);
    for (const step of tools) expect(step).toMatch(/continue-on-error:\s*true/);
  });
});

describe('the install-script list the guides describe', () => {
  // Each project's .npmrc turns on strict-allow-scripts, so npm fails an
  // install that meets a package with an install script allowScripts does not
  // name. Without the setting, npm 11, which builds the images and runs CI,
  // runs such a script and prints a warning. The guides say the install
  // fails; dropping the setting from either file makes that untrue, so change
  // the guides in the same change. A root .npmrc reaches neither project.
  const npmrcs = ['backend/.npmrc', 'frontend/.npmrc'];
  const paragraphs = ['SECURITY.md', 'docs/DEVELOPMENT.md'].flatMap((rel) =>
    read(rel)
      .split(/\n\s*\n/)
      .filter((paragraph) => paragraph.includes('allowScripts'))
      .map((paragraph) => ({ rel, text: paragraph.replace(/\s+/g, ' ') }))
  );

  it('say the install fails at a package not on it, since both projects tell npm to fail it', () => {
    const strict = (rel: string) =>
      fs.existsSync(path.join(root, rel)) && /^\s*strict-allow-scripts\s*=\s*true\s*$/m.test(read(rel));
    expect(npmrcs.filter((rel) => !strict(rel))).toEqual([]);
    expect(paragraphs.map(({ rel }) => rel).sort()).toEqual(['SECURITY.md', 'docs/DEVELOPMENT.md']);
    for (const { rel, text } of paragraphs) {
      expect(`${rel}: ${text}`).toMatch(/strict-allow-scripts/);
      expect(`${rel}: ${text}`).toMatch(/the install fails/);
      expect(`${rel}: ${text}`).not.toMatch(/still runs the script of a package|does not turn on/);
    }
  });
});

describe('the keyboard shortcuts the guides list', () => {
  // MAP_SHORTCUTS is what the map's ? window shows. The guides spell each
  // key the same way, as a code span, so a key added, changed or dropped
  // there fails here until the guide's table says the same. What is held is
  // the keys and who they are for (which guide's table); the descriptions
  // are not compared, since each guide words them for its readers. Read as
  // text: Jest cannot import the frontend's modules. One shortcut per line,
  // and every row of the list is counted, so a row written another way
  // fails here.
  const source = read('frontend/src/components/campaign/map/keyboard.ts');
  const listStart = source.indexOf('export const MAP_SHORTCUTS');
  const listEnd = source.indexOf('\n];', listStart);
  if (listStart === -1 || listEnd === -1) throw new Error('keyboard.ts no longer declares MAP_SHORTCUTS as a list closed by ];');
  const declared = source.slice(listStart, listEnd);
  const shortcuts = declared
    .split('\n')
    .filter((line) => /^\s*\{ keys: \[/.test(line))
    .map((line) => {
      const keys = /keys: \[(.*?)\], does:/.exec(line)?.[1] ?? '';
      return {
        keys: [...keys.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).sort(),
        who: /who: '(\w+)'/.exec(line)?.[1],
      };
    });

  /** The keys of each row of the first table after `heading`, from the row's code spans. */
  function tableKeys(rel: string, heading: string): string[][] {
    const guide = read(rel);
    const start = guide.indexOf(heading);
    if (start === -1) throw new Error(`${rel} no longer has the heading ${heading}`);
    const lines = guide.slice(start).split('\n');
    const first = lines.findIndex((line) => line.startsWith('|'));
    const end = lines.findIndex((line, i) => i > first && !line.startsWith('|'));
    return lines
      .slice(first + 2, end)
      .map((row) => [...row.matchAll(/`([^`]+)`/g)].map((m) => m[1]).sort())
      .filter((keys) => keys.length > 0);
  }

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);
  const tables = [
    { rel: 'docs/PLAYER_GUIDE.md', mine: (who?: string) => who === 'everyone' || who === 'actors' },
    { rel: 'docs/GM_GUIDE.md', mine: (who?: string) => who === 'gm' },
  ];

  it('are read from the source in its one-line form, every row of it', () => {
    expect(shortcuts.length).toBe((declared.match(/\bwho:/g) ?? []).length);
    expect(shortcuts.length).toBeGreaterThanOrEqual(15);
    for (const s of shortcuts) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(['everyone', 'actors', 'gm']).toContain(s.who);
    }
  });

  // The map's screen-reader hint names the token keys in words. Every key a
  // player can use on the map, but Tab, the clicks and the taps, is named
  // there. A screen reader takes a double tap for its own, so the hint does
  // not offer one.
  const spoken: Record<string, string> = {
    'Arrow keys': 'arrow keys',
    'Shift + arrow keys': 'with shift',
    ',': 'comma',
    '<': 'comma',
    '.': 'full stop',
    '>': 'full stop',
    '[': 'square brackets',
    ']': 'square brackets',
    Enter: 'enter',
    Esc: 'escape',
    '?': 'question mark',
  };
  it("are each named in the map's screen-reader hint", () => {
    const hint = /export const MAP_KEYS_HINT =\s*'([^']*)'/.exec(source)?.[1];
    if (hint === undefined) throw new Error('keyboard.ts no longer declares MAP_KEYS_HINT as one quoted string');
    const named = shortcuts
      .filter((s) => s.who !== 'gm')
      .flatMap((s) => s.keys)
      .filter((k) => k !== 'Tab' && !k.includes('click') && !k.includes('tap'));
    for (const k of named) {
      const word = spoken[k];
      if (word === undefined) throw new Error(`no spoken name for the key ${k}: add it here and to MAP_KEYS_HINT`);
      expect(hint.toLowerCase()).toContain(word);
    }
  });

  it.each(tables)("are each a row of $rel's Keyboard Shortcuts table, and the table lists no others", ({ rel, mine }) => {
    const rows = tableKeys(rel, '### Keyboard Shortcuts');
    const listed = shortcuts.filter((s) => mine(s.who));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.filter((s) => !rows.some((row) => same(row, s.keys))).map((s) => s.keys)).toEqual([]);
    expect(rows.filter((row) => !listed.some((s) => same(row, s.keys)))).toEqual([]);
  });
});

describe('how many older documents a delete by a campaign asset\'s uploader reads', () => {
  // The cap is a constant in the code and a number in four documents.
  const stated: Array<[string, RegExp]> = [
    ['docs/USER_GUIDE.md', /first checks up to (\d+) of the older documents/],
    ['docs/api-changes/1.7.0.md', /first read up to (\d+) of the campaign's other members' documents/],
    ['backend/docs/API_DOCUMENTATION.yaml', /newest first, at most (\d+) of them a request/],
    ['backend/RBAC_QUICK_REFERENCE.md', /`MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL` \((\d+)\) a request/],
  ];

  it.each(stated)('%s states the cap the code reads up to', (rel, pattern) => {
    const match = pattern.exec(read(rel).replace(/\s+/g, ' '));
    if (!match) throw new Error(`${rel} no longer states how many older documents the check reads`);
    expect(Number(match[1])).toBe(MAX_UNREAD_DOCUMENTS_READ_FOR_REMOVAL);
  });
});

describe('how many times an hour one account may try to change its own email address', () => {
  // The cap and its refusal are constants in the code, and a number and a
  // message in four documents.
  const stated: Array<[string, RegExp]> = [
    ['docs/USER_GUIDE.md', /can use up your (\w+) tries for an hour/],
    ['SECURITY.md', /changing one's own email address is allowed (\d+) attempts an hour per account/],
    ['SECURITY.md', /use up the owner's (\d+) email-change attempts for an hour/],
    ['docs/API_REFERENCE.md', /also limited to (\d+) attempts an hour for the account/],
    ['docs/api-changes/1.7.0.md', /caps changing your own email address at (\d+) attempts an hour per account/],
  ];
  const words: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

  it('counts them over an hour', () => {
    expect(EMAIL_CHANGE_WINDOW_MS).toBe(60 * 60 * 1000);
  });

  it.each(stated)('%s states the cap the code holds to', (rel, pattern) => {
    const match = pattern.exec(read(rel).replace(/\s+/g, ' '));
    if (!match) throw new Error(`${rel} no longer states how many email changes an hour are allowed, as ${pattern}`);
    expect(words[match[1]] ?? Number(match[1])).toBe(EMAIL_CHANGES_PER_HOUR);
  });

  it.each(['docs/USER_GUIDE.md', 'docs/API_REFERENCE.md', 'docs/api-changes/1.7.0.md'])('%s quotes the refusal as the server words it', (rel) => {
    const quoted = /You have tried to change your email address .*? Please try again later\./.exec(read(rel).replace(/\s+/g, ' '))?.[0];
    if (quoted === undefined) throw new Error(`${rel} no longer quotes the email-change refusal`);
    expect(quoted).toBe(EMAIL_CHANGE_LIMIT_MESSAGE);
  });
});

describe('the longest file name an archive may hold', () => {
  // A backup or campaign archive with a longer entry name is refused; the
  // limit is a constant in the code and a number in four documents.
  const stated: Array<[string, RegExp]> = [
    ['docs/DEPLOYMENT.md', /would be longer than ([\d,]+) bytes \(folders nested very deep\)/],
    ['docs/DEPLOYMENT.md', /each with a name of at most ([\d,]+) bytes/],
    ['docs/GM_GUIDE.md', /An archive with a file name longer than ([\d,]+) bytes is refused/],
    ['docs/api-changes/1.7.0.md', /An archive with an entry name longer than ([\d,]+) bytes/],
    ['docs/api-changes/1.7.0.md', /"The archive has a file name longer than ([\d,]+) bytes, which an archive from this server never has\."/],
    ['docs/api-changes/1.7.0.md', /would be longer than ([\d,]+) bytes, logging/],
    ['backend/docs/API_DOCUMENTATION.yaml', /holds a NUL character, is longer than ([\d,]+) bytes/],
  ];

  it.each(stated)('%s states the limit the code refuses past', (rel, pattern) => {
    const match = pattern.exec(read(rel).replace(/\s+/g, ' '));
    if (!match) throw new Error(`${rel} no longer states the longest archive file name, as ${pattern}`);
    expect(Number(match[1].replace(/,/g, ''))).toBe(MAX_ARCHIVE_NAME_BYTES);
  });
});

describe('the game content notices', () => {
  // The sentence the SRD 5.1 asks every work that uses it to carry, as the
  // SRD's first page writes it, its curly quotes included.
  const SRD_SENTENCE =
    'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';
  const NOTICES = 'GAME_CONTENT_NOTICES.md';
  const exists = (rel: string) => fs.existsSync(path.join(root, rel));
  // CC BY 4.0 asks a work to say whether it changed the material, apart from
  // the attribution, which the SRD asks be given as it writes it.
  const SRD_MODIFIED = 'CozyVTT has reformatted this material and, in places, reworded it.';
  // The Reserved Material statement and the offer of the rules, as each copy
  // of the notices gives them.
  const RESERVED =
    "Reserved Material elements in this product include, but may not be limited to: CozyVTT's name, logo, mascot, artwork and visual themes, and all elements designated as Reserved Material under the ORC License.";
  const ADAPTED =
    "CozyVTT's code is under the AGPL-3.0. The rules it expresses in the files listed in docs/GAME_SYSTEMS.md are Adapted Licensed Material, which CozyVTT offers under the ORC License.";
  /** The three copies of the notice, each as its lines. */
  const copies = (): [string, string[]][] => [
    [NOTICES, read(NOTICES).split('\n')],
    ['frontend/src/constants/gameContentNotices.ts', shownLines()],
    ['THIRD_PARTY_NOTICES.txt', noticesSection2()],
  ];

  /**
   * The lines the app shows, in About CozyVTT and the Creature Library. Read
   * as text, since Jest cannot import the frontend's modules: each is a
   * template literal on a line of its own.
   */
  function shownLines(): string[] {
    return read('frontend/src/constants/gameContentNotices.ts')
      .split('\n')
      .flatMap((line) => {
        const literal = /^\s*`([^`$\\]*)`[,;]?$/.exec(line);
        return literal ? [literal[1]] : [];
      });
  }

  /** Section 2 of THIRD_PARTY_NOTICES.txt, which credits the game content, line by line. */
  function noticesSection2(): string[] {
    const text = read('THIRD_PARTY_NOTICES.txt');
    const start = text.indexOf('SECTION 2: GAME CONTENT');
    const end = text.indexOf('SECTION 3:', start);
    if (start === -1 || end === -1) throw new Error('THIRD_PARTY_NOTICES.txt no longer has the headings SECTION 2: GAME CONTENT and SECTION 3:');
    return text.slice(start, end).split('\n').map((line) => line.trim());
  }

  it('GAME_CONTENT_NOTICES.md carries the SRD 5.1 sentence character for character', () => {
    expect(read(NOTICES).split('\n')).toContain(SRD_SENTENCE);
  });

  it('the app shows the SRD 5.1 sentence as it is written', () => {
    expect(shownLines()).toContain(SRD_SENTENCE);
  });

  it('every line the app shows is a line of GAME_CONTENT_NOTICES.md and of Section 2 of THIRD_PARTY_NOTICES.txt, word for word', () => {
    const shown = shownLines();
    expect(shown.length).toBeGreaterThanOrEqual(10);
    const notices = read(NOTICES).split('\n');
    const section2 = noticesSection2();
    expect(shown.filter((line) => !notices.includes(line))).toEqual([]);
    expect(shown.filter((line) => !section2.includes(line))).toEqual([]);
  });

  // Section 2 indents each credit by two spaces; its own sentences are not.
  it('every credit in Section 2 of THIRD_PARTY_NOTICES.txt is a line the app shows', () => {
    const text = read('THIRD_PARTY_NOTICES.txt');
    const credits = text
      .slice(text.indexOf('SECTION 2: GAME CONTENT'), text.indexOf('SECTION 3:'))
      .split('\n')
      .filter((line) => /^ {2}\S/.test(line))
      .map((line) => line.trim());
    expect(credits.length).toBeGreaterThanOrEqual(10);
    const shown = shownLines();
    expect(credits.filter((line) => !shown.includes(line))).toEqual([]);
  });

  // It replaced SRD_ATTRIBUTION.md and SRD_LICENSE.txt.
  it('is linked from README.md, and nothing points to the two files it replaced', () => {
    expect(read('README.md')).toContain('](GAME_CONTENT_NOTICES.md)');
    expect(exists('SRD_ATTRIBUTION.md') || exists('SRD_LICENSE.txt')).toBe(false);
    const pointing = [
      'README.md',
      'THIRD_PARTY_CREDITS.md',
      'THIRD_PARTY_NOTICES.txt',
      'docs/GAME_SYSTEMS.md',
      'backend/src/services/creatureSeed.ts',
      'frontend/src/components/campaign/CreatureLibrary.tsx',
    ].filter((rel) => /SRD_ATTRIBUTION\.md|SRD_LICENSE\.txt/.test(read(rel)));
    expect(pointing).toEqual([]);
  });

  it('says beside the SRD 5.1 credit, on a line of its own, that CozyVTT changed the material', () => {
    for (const [name, lines] of copies()) {
      const credit = lines.indexOf(SRD_SENTENCE);
      const next = lines.slice(credit + 1).find((line) => line.trim() !== '');
      expect([name, credit >= 0, next]).toEqual([name, true, SRD_MODIFIED]);
    }
  });

  it("reserves CozyVTT's name and art but not its code, and offers the rules its code expresses under the ORC License", () => {
    for (const [name, lines] of copies()) {
      expect([name, lines.includes(RESERVED), lines.includes(ADAPTED)]).toEqual([name, true, true]);
      expect([name, lines.filter((line) => /Reserved Material elements/.test(line) && /software/.test(line))]).toEqual([name, []]);
    }
  });

  // The credit CozyVTT asks for its own material reads the same in each copy.
  it("gives the credit for CozyVTT's own material the same in each copy", () => {
    const CREDIT =
      'If you use our Licensed Material in your own published works, please credit us as follows: CozyVTT, © 2026 CozyVTT Development Team, https://github.com/CheekyChinchilla/CozyVTT.';
    for (const [name, lines] of copies()) {
      expect([name, lines.filter((line) => line.startsWith('If you use our Licensed Material'))]).toEqual([name, [CREDIT]]);
    }
  });

  // The Horror d100 sheet follows the open d100 rules since 1.7.0, and each
  // copy of the notice says so.
  it('says in each copy, beside the Horror d100 credit, that the sheet follows the open d100 rules', () => {
    const FOLLOWS = "CozyVTT's Horror d100 sheet follows this document's rules for a character, in CozyVTT's own words.";
    // The Horror d100 notice is the one that says where the licence is held;
    // the credit is the second line after it.
    for (const [name, lines] of copies()) {
      const notice = lines.findIndex((line) => line.includes('ORC License held in the Library of Congress'));
      expect([name, notice >= 0, lines.indexOf(FOLLOWS) > notice + 1]).toEqual([name, true, true]);
    }
  });

  // The table is in the guide, so the notices name no source path.
  it('keeps no table of files, and points to the one in docs/GAME_SYSTEMS.md', () => {
    const notices = read(NOTICES);
    expect(notices).not.toMatch(/^\| System \| Files/m);
    expect(notices).toContain('](docs/GAME_SYSTEMS.md#files-that-hold-orc-material)');
  });

  it("links only the addresses its notices give", () => {
    expect(read(NOTICES)).not.toMatch(/aonprd/i);
  });

  /** The paths the guide lists as holding material under the ORC License. */
  function orcFiles(): string[] {
    const guide = read('docs/GAME_SYSTEMS.md');
    const start = guide.indexOf('## Files that hold ORC material');
    if (start === -1) throw new Error('docs/GAME_SYSTEMS.md no longer has the heading ## Files that hold ORC material');
    const table = guide.slice(start).split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| System'));
    return table.flatMap((row) => [...(row.split('|')[2] ?? '').matchAll(/`([\w./-]+)`/g)].map((m) => m[1]));
  }

  it('names only files that exist among those holding material under the ORC License, and no folder', () => {
    const named = orcFiles();
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((rel) => !exists(rel) || fs.statSync(path.join(root, rel)).isDirectory())).toEqual([]);
  });

  // A licence scanner, a fork or a contributor reading one file sees only the
  // AGPL-3.0 unless the file says otherwise. A JSON file has no comments.
  it('gives each file that holds material under the ORC License a header that says so', () => {
    const code = [
      "// This file holds material under the ORC License, beside CozyVTT's own code under the AGPL-3.0.",
      '// See GAME_CONTENT_NOTICES.md for the notice and credits.',
    ];
    const markdown = [
      "<!-- This file holds material under the ORC License, beside CozyVTT's own text under the AGPL-3.0. -->",
      '<!-- See GAME_CONTENT_NOTICES.md for the notice and credits. -->',
    ];
    const missing = orcFiles()
      .filter((rel) => !rel.endsWith('.json'))
      .filter((rel) => {
        const top = read(rel).split('\n').slice(0, 2);
        return JSON.stringify(top) !== JSON.stringify(rel.endsWith('.md') ? markdown : code);
      });
    expect(missing).toEqual([]);
  });

  it('the About window links the source repository the README clones', () => {
    const clone = /git clone (https:\/\/github\.com\/\S+?)\.git/.exec(read('README.md'))?.[1];
    const linked = /const SOURCE_CODE_URL = '([^']+)'/.exec(read('frontend/src/components/common/AboutDialog.tsx'))?.[1];
    expect(clone).toBeDefined();
    expect(linked).toBe(clone);
  });
});

describe('the game content checklist for a new game system', () => {
  const checklist = read('docs/GAME_SYSTEMS.md').slice(read('docs/GAME_SYSTEMS.md').indexOf('## Game content sources'));

  // The guide settles where a system's content comes from before any code.
  it.each([
    'An open licence',
    'A CozyVTT name',
    'Our own sentences',
    'GAME_CONTENT_NOTICES.md',
    'frontend/src/constants/gameContentNotices.ts',
    'scripts/tests/test_system_names.py',
    'Say what you changed',
    'Rules features stay open',
    'The numbers and the structure too',
    'Every source checked',
  ])('names %s', (needle) => {
    expect(checklist).toContain(needle);
  });

  it('has a game content group at the top of the full checklist, and points the notice line at condition 4', () => {
    const full = read('docs/GAME_SYSTEMS.md');
    const agreed = full.slice(full.indexOf('**Agreed first**'), full.indexOf('**Backend**'));
    expect(agreed).toContain('Game content settled first');
    expect(agreed).toContain('game-content-sources');
    expect(full).toContain('The notice in both places (condition 4)');
  });

  it('is linked from the contributor standards', () => {
    expect(read('docs/CONTRIBUTING.md')).toContain('GAME_SYSTEMS.md#game-content-sources');
  });

  it('tells contributors that what they add to game content is offered under its licence too', () => {
    expect(read('docs/CONTRIBUTING.md').replace(/\s+/g, ' ')).toContain(
      'A contribution to game content, such as a sheet or its rules, is also offered under the licence of the content it adds to'
    );
  });
});
