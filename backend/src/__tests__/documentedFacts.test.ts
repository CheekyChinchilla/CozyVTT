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
  const enumCount = (schema.match(/^enum \w+ \{/gm) ?? []).length;
  const verification = read('backend/prisma/SCHEMA_VERIFICATION.md');

  // The verification file said "20 models" when there were 21.
  it('state how many models and enums the schema has', () => {
    expect(read('backend/prisma/README.md')).toContain(`${modelNames.length} models`);
    expect(verification).toContain(`**${modelNames.length} models and ${enumCount} enums today**`);
  });

  it('SCHEMA_VERIFICATION.md names every model it does not cover', () => {
    const covered = [...verification.slice(verification.indexOf('## Models'), verification.indexOf('## Enums')).matchAll(/^- ✅ (\w+)$/gm)].map((m) => m[1]);
    const uncovered = verification.slice(0, verification.indexOf('## Models'));
    expect(covered.length).toBeGreaterThan(0);
    expect(modelNames.filter((name) => !covered.includes(name) && !uncovered.includes(`\`${name}\``))).toEqual([]);
  });

  // It also ended on "VERIFIED AND COMPLETE" and a next phase long finished.
  it('SCHEMA_VERIFICATION.md does not close with a present-tense assurance', () => {
    expect(verification).not.toMatch(/Schema Status:\*\* ✅ \*\*VERIFIED AND COMPLETE\*\*/);
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
