/**
 * Facts recorded in more than one place, with nothing keeping them in
 * step but a comment. A comment is not a check, so these are.
 *
 * The nginx stamp. `docker compose up -d --build` leaves a running container
 * alone unless its definition changed, and the nginx template is a mounted
 * file, not part of the definition. A change to it reaches an upgraded
 * instance only if something in the nginx service's definition changes too.
 * `NGINX_CONF_STAMP` is that something, and it has to change every time the
 * template does, so it is required to be the template's hash. The same holds
 * for every other single file the service mounts from the repository (the
 * script that renders the trusted proxies, among them): a mount of one file
 * keeps the file it found when the container was made, so an edited copy is
 * not seen until the container is made again. The stamp covers them all,
 * read from the service's own list of mounts.
 *
 * The database client. The backend image installs a pinned PostgreSQL client
 * major for pg_dump and psql, and the server image is pinned separately in
 * three files. A client older than the server cannot dump it.
 *
 * The restore script. backend/scripts/restore.sh prepares the file psql loads
 * in its own awk step, apart from the Admin Dashboard's restore, and has to
 * end the load with the same statements, or a backup restored from the
 * command line brings back what the dashboard's restore removes.
 *
 * The password rule's special characters, checked in the browser as you type
 * and decided on the server. The email address check, likewise.
 *
 * The combat state. The server sends it and the client reads it, and each
 * package declares it; the first field added to it after the split already
 * disagreed (required on one side, optional on the other). The fields are
 * compared here, comments aside.
 *
 * The map limits. The server enforces them and the map dialogs offer what
 * they allow; a dialog offering more than the server takes is a map the DM
 * fills in and cannot save. The file is kept identical in both packages.
 *
 * The socket flood ceilings, applied by the server and listed in the
 * WebSocket guide, which is what a self-hoster or the author of a scripted
 * client reads to know what the server will take.
 *
 * The limits on an upload's name, description and tags. The server refuses
 * an upload over them and the upload dialog stops each box at them. The file
 * is kept identical in both packages.
 *
 * The Invite Player search limits: the shortest search that matches part of
 * a name and the most matches one search returns. The server applies them and
 * the Invite Player dialog tells the DM what they are. The file is kept
 * identical in both packages.
 *
 * The character sheet limits. The server refuses a sheet over them and the
 * sheet editors stop each box at them; an editor allowing more is a sheet the
 * player fills in and cannot save. The file is kept identical in both packages.
 *
 * The session secret examples. A production server refuses the example values
 * for SESSION_SECRET, so a self-hoster who copies a block as written is told
 * to generate one; the guide's example was once changed without the list of
 * refused values, and the new example line started a server.
 *
 * The database address in the backup and restore scripts. Each reads
 * DATABASE_URL in its own copy of the same block; a fix to one (decoding the
 * password, the default port) has to reach the other.
 *
 * The kinds of thing that can use an asset. The server lists them when it
 * refuses to delete one, the client describes each kind and drops a kind it
 * does not know, and the API document lists them; a kind added on the server
 * alone shows the DM a shorter list than the server sent.
 *
 * The themes and fonts. The server accepts a theme or font only from its
 * list, for a user's preferences and the instance's default theme alike; a
 * theme the app offers that the list lacks is one nobody can save.
 *
 * The token centre. The server decides which tokens a player is sent by
 * what each of the player's tokens can see from its centre, and the client
 * draws sight from the same point. Two formulas once put the centre of a
 * token two squares or taller in different places, so the server answered
 * for a point the player's token was not at. The file is kept identical in
 * both packages.
 *
 * The env files kept out of the images. Both Dockerfiles copy the whole of
 * their folder (`COPY . .`), so only the folder's .dockerignore stands between
 * a stray .env.local or .env.production and the image's layers. The two files
 * are copies of one rule.
 *
 * The Node.js major. It is written in `.nvmrc`, every Dockerfile stage built
 * on Node, every CI job that sets Node up, the `engines` field of both
 * projects, the backend's `@types/node`, and the version the README and the
 * guides ask a reader to install. A move to a new major that misses one runs
 * CI, the images or a manual install on a different Node from the rest.
 * `.nvmrc` holds the major alone and the others are compared with it.
 *
 * The npm settings the images install with. Each project's `.npmrc` turns
 * on strict-allow-scripts, which fails an install at a package with an
 * install script that `allowScripts` does not name. A Dockerfile stage reads
 * the file only if it copies it in before it runs npm; one that copies
 * `package*.json` alone installs as if the setting were off.
 *
 * The backend's npm overrides. Each one holds a package under another at a
 * newer version than that package asks for, because the version it asks for
 * has a published advisory. The override names a version, and the package
 * above it names one too; when an update of that package asks for the same
 * version or a newer one, the override is no longer needed, and left in place
 * it would hold the package back.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { RESTORE_TRAILER } from '../utils/pgRestore';
import { sessionSecretProblem } from '../config/sessionSecret';
import { SOCKET_CEILINGS, type CeilingWindow } from '../websocket/shared';
import { THEME_IDS, FONT_IDS } from '../validators/appearance';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * The single files the nginx service mounts from the repository, in the
 * order its volumes list them. A mounted folder (certificates, local
 * settings) is left out: a folder mount sees its files change.
 */
function nginxMountedFiles(compose: string): string[] {
  const start = compose.indexOf('\n  nginx:\n');
  if (start === -1) throw new Error('docker-compose.yml no longer has an nginx service');
  const rest = compose.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z]|\n[a-z]/);
  const service = end === -1 ? rest : rest.slice(0, end + 1);
  return [...service.matchAll(/^ {6}- \.\/([^:\s]+):/gm)]
    .map((m) => m[1])
    .filter((rel) => fs.statSync(path.join(root, rel)).isFile());
}

/**
 * The stamp those files call for: the first twelve hex digits of the SHA-256
 * of each file's path and contents, with line endings normalised so a Windows
 * checkout agrees.
 */
function nginxStampFor(files: string[]): string {
  const hash = crypto.createHash('sha256');
  for (const rel of files) hash.update(`${rel}\n${read(rel).replace(/\r\n/g, '\n')}\n`);
  return hash.digest('hex').slice(0, 12);
}

/**
 * A file's instructions, one per line. Comment lines are left out: both
 * Dockerfiles explain the pinned client in a comment that names it, and a
 * check that read the comments would pass with the install line itself back
 * on the unpinned name. A line continued with a backslash is joined to the
 * next, so an install split over several lines is still one.
 */
function instructions(rel: string): string[] {
  return read(rel)
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\\\n/g, ' ')
    .split('\n');
}

/** The majors `pattern` finds in a file's instructions. */
function majors(rel: string, pattern: RegExp): number[] {
  const found = [...instructions(rel).join('\n').matchAll(pattern)].map((m) => Number(m[1]));
  if (found.length === 0) throw new Error(`${rel} no longer matches ${pattern}; update the pattern with the file`);
  return found;
}

describe('NGINX_CONF_STAMP in docker-compose.yml', () => {
  const compose = read('docker-compose.yml');
  const mounted = nginxMountedFiles(compose);

  it('covers the template and the script that renders the trusted proxies', () => {
    expect(mounted).toEqual(expect.arrayContaining(['nginx/nginx.conf', 'nginx/trusted-proxies.envsh']));
  });

  it('is the hash of every file the nginx service mounts, so a changed one recreates the container on upgrade', () => {
    const expected = nginxStampFor(mounted);
    const m = /NGINX_CONF_STAMP:\s*"([^"]*)"/.exec(compose);
    if (!m) throw new Error('docker-compose.yml no longer sets NGINX_CONF_STAMP on the nginx service');
    if (m[1] !== expected) {
      throw new Error(
        `${mounted.join(', ')} changed: set NGINX_CONF_STAMP in docker-compose.yml to "${expected}" (it is "${m[1]}")`
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

  it('is named by its pinned major on every line that installs it', () => {
    // Line by line: the majors above are gathered from every stage of a file
    // at once, so one stage back on the unpinned postgresql-client passed as
    // long as another stage still named the pinned one.
    const unpinned = clientFiles.flatMap((f) => {
      const installs = instructions(f).filter((line) => /\bapk add\b/.test(line) && /postgresql\d*-client/.test(line));
      if (installs.length === 0) throw new Error(`${f} no longer installs a PostgreSQL client with apk add; update this test with the file`);
      return installs
        .filter((line) => [...line.matchAll(/postgresql(\d*)-client/g)].some((m) => m[1] === ''))
        .map((line) => `${f}: ${line.trim()}`);
    });
    expect(unpinned).toEqual([]);
  });

  // Per file, the checks above were satisfied by any stage: the builder stage
  // of Dockerfile.prod installs the client too, so the production stage, the
  // image that runs pg_dump and psql, could lose it and every check passed.
  it('is installed in the stage that runs, in every Dockerfile', () => {
    const missing = clientFiles.filter((f) => {
      const stages = instructions(f).join('\n').split(/^FROM\s/m);
      const last = stages[stages.length - 1];
      return !/\bapk add\b[^\n]*postgresql\d+-client/.test(last);
    });
    expect(missing).toEqual([]);
  });

  it('is pinned against one server major, the same in both compose files and CI', () => {
    expect(new Set(servers).size).toBe(1);
  });

  it('is not older than the server image, or pg_dump refuses to dump it', () => {
    expect(clients[0]).toBeGreaterThanOrEqual(servers[0]);
  });
});

describe('backend/scripts/restore.sh', () => {
  const script = read('backend/scripts/restore.sh').replace(/\r\n/g, '\n');

  it('ends the load with the statements the dashboard restore ends it with, emptying the login sessions', () => {
    // The statements, as the script holds them.
    const held = /^RESTORE_TRAILER=\$\(cat <<'SQL'\n([\s\S]*?)\nSQL\n\)$/m.exec(script);
    if (!held) throw new Error('restore.sh no longer holds RESTORE_TRAILER in a heredoc; update this test with the script');
    expect(held[1].split('\n')).toEqual(RESTORE_TRAILER);

    // Handed to the awk step that writes the file psql loads.
    const awk = /awk -v key="\$RESTRICT_KEY" -v trailer="\$RESTORE_TRAILER" '\n([\s\S]*?)\n' > "\$PREPARED"/.exec(script);
    if (!awk) throw new Error('restore.sh no longer hands RESTORE_TRAILER to its awk step; update this test with the script');
    const program = awk[1];

    // Printed once, as the last thing the END block does: END runs after
    // every line of the dump has gone through, and only once it has passed
    // the checks. Anywhere else, the sessions are emptied before the dump
    // brings them back, or not at all.
    expect(program.match(/\bprint trailer\b/g) ?? []).toHaveLength(1);
    const end = /\n\s*END \{\n([\s\S]*)\n\s*\}\s*$/.exec(program);
    if (!end) throw new Error("restore.sh's awk step no longer ends with an END block; update this test with the script");
    const statements = end[1].split('\n').map((line) => line.trim()).filter(Boolean);
    expect(statements[statements.length - 1]).toBe('print trailer');
  });
});

describe('the special characters a password needs one of', () => {
  // Written in both packages: the browser checks as you type, the server
  // decides. The two used to differ, so a password the checklist passed was
  // refused on submit.
  const pattern = (rel: string) => {
    const m = /export const SPECIAL_CHARACTER = (\/.+\/[a-z]*);/.exec(read(rel));
    if (!m) throw new Error(`${rel} no longer declares SPECIAL_CHARACTER; update this test with the file`);
    return m[1];
  };

  it('are the same in the browser and on the server', () => {
    expect(pattern('frontend/src/utils/validation.ts')).toBe(pattern('backend/src/utils/validation.ts'));
  });
});

describe('the email address check', () => {
  // Written in both packages. The browser's copy decides whether the sign-in
  // page sends an address at all, so it must never refuse one the server
  // would take.
  const body = (rel: string, name: string) => {
    const m = new RegExp(`export function ${name}\\(email: string\\): boolean \\{\\n([\\s\\S]*?)\\n\\}`).exec(read(rel));
    if (!m) throw new Error(`${rel} no longer declares ${name}; update this test with the file`);
    return m[1];
  };
  const limit = (rel: string) => {
    const m = /export const MAX_EMAIL_LENGTH = (\d+);/.exec(read(rel));
    if (!m) throw new Error(`${rel} no longer declares MAX_EMAIL_LENGTH; update this test with the file`);
    return m[1];
  };

  it('is the same in the browser and on the server', () => {
    expect(body('frontend/src/utils/validation.ts', 'isValidEmail')).toBe(body('backend/src/utils/validation.ts', 'validateEmail'));
    expect(limit('frontend/src/utils/validation.ts')).toBe(limit('backend/src/utils/validation.ts'));
  });
});

/** An interface's fields, one per line, with comments and spacing removed. */
function interfaceFields(source: string, name: string): string[] {
  const m = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(source);
  if (!m) throw new Error(`no interface ${name}; update this test with the declaration`);
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('the combat state the server sends and the client reads', () => {
  const server = read('backend/src/websocket/initiativeState.ts');
  const client = read('frontend/src/types/index.ts');

  it.each(['CombatantEntry', 'CombatState'])('%s has the same fields on both sides', (name) => {
    expect(interfaceFields(client, name)).toEqual(interfaceFields(server, name));
  });
});

describe('campaign.access.revoked, which the server sends and the client reads', () => {
  const server = read('backend/src/websocket/utils.ts');
  const client = read('frontend/src/types/index.ts');
  const reasons = (source: string) => {
    const m = /export type AccessRevokedReason = ([^;]+);/.exec(source);
    if (!m) throw new Error('no AccessRevokedReason; update this test with the declaration');
    return m[1].replace(/\s+/g, ' ').trim();
  };

  it('has the same fields and reasons on both sides', () => {
    expect(interfaceFields(client, 'AccessRevoked')).toEqual(interfaceFields(server, 'AccessRevoked'));
    expect(reasons(client)).toBe(reasons(server));
  });
});

describe('the map limits', () => {
  it('are the same file in the browser and on the server', () => {
    expect(read('frontend/src/constants/mapLimits.ts')).toBe(read('backend/src/validators/mapLimits.ts'));
  });
});

describe('the token centre', () => {
  it('is the same file in the browser and on the server', () => {
    expect(read('frontend/src/utils/tokenCentre.ts')).toBe(read('backend/src/utils/tokenCentre.ts'));
  });
});

describe('the limits on an upload\'s name, description and tags', () => {
  it('are the same file in the browser and on the server', () => {
    expect(read('frontend/src/constants/assetLimits.ts')).toBe(read('backend/src/validators/assetLimits.ts'));
  });
});

describe('the Invite Player search limits', () => {
  it('are the same file in the browser and on the server', () => {
    expect(read('frontend/src/constants/inviteSearchLimits.ts')).toBe(read('backend/src/validators/inviteSearchLimits.ts'));
  });

  it('are what the Invite Player dialog uses, with no number of its own', () => {
    const dialog = read('frontend/src/components/campaign/InvitePlayerModal.tsx');
    expect(dialog).toContain("from '@/constants/inviteSearchLimits'");
    expect(dialog).not.toMatch(/first \d+ matches|Type \d+ or more/);
  });
});

describe('the character sheet limits', () => {
  it('are the same file in the browser and on the server', () => {
    expect(read('frontend/src/constants/sheetLimits.ts')).toBe(read('backend/src/validators/game-systems/sheetLimits.ts'));
  });
});

describe('the socket flood ceilings in the WebSocket guide', () => {
  const guide = read('backend/docs/WEBSOCKET_DOCUMENTATION.md');
  const per: Record<number, string> = { 1000: 'a second', 10000: 'every ten seconds', 60000: 'a minute' };
  const inWords = (windows: readonly CeilingWindow[]) =>
    windows.map(({ limit, windowMs }) => `${limit} ${per[windowMs] ?? `every ${windowMs} ms`}`).join(' and ');
  /** The rows of the guide's table of ceilings, as cells. */
  const rows = guide
    .slice(guide.indexOf('**Flood ceilings.**'), guide.indexOf('**Connections per user.**'))
    .split('\n')
    .filter((line) => line.startsWith('| '))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  /** The ceiling the guide gives `event`: its row's second cell, up to the first comma or semicolon. */
  const stated = (event: string) =>
    rows.find((cells) => cells[0].includes(`\`${event}\``))?.[1].split(/[;,]/)[0].trim();

  it.each(Object.entries(SOCKET_CEILINGS))('%s is stated as the server applies it', (event, ceiling) => {
    expect(stated(event)).toBe(inWords(ceiling.windows));
  });
});

describe('the SESSION_SECRET examples in the example files and the guides', () => {
  const files = ['.env.example', 'backend/.env.example', 'docs/DEPLOYMENT.md', 'docs/DEVELOPMENT.md', 'README.md'];
  /** Each `SESSION_SECRET=value` line, with the file it is in and the value as dotenv reads it. */
  const examples = files.flatMap((rel) =>
    [...read(rel).matchAll(/^\s*SESSION_SECRET=(.+)$/gm)].map((m) => ({ file: rel, value: m[1].trim().replace(/^(["'])(.*)\1$/, '$2') }))
  );

  it('are all refused by a production server, so a block copied as written does not run on a known secret', () => {
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.filter(({ value }) => sessionSecretProblem(value) === null)).toEqual([]);
  });
});

describe('the themes and fonts the server accepts', () => {
  const themes = read('frontend/src/themes.ts');
  /** The `id` of every entry in one of the file's exported arrays. */
  const ids = (name: string) => {
    const start = themes.indexOf(`export const ${name}`);
    if (start === -1) throw new Error(`frontend/src/themes.ts no longer declares ${name}; update this test with the file`);
    const block = themes.slice(start, themes.indexOf('\n];', start));
    return [...block.matchAll(/^\s+id: '([^']+)',$/gm)].map((m) => m[1]);
  };

  it('are the themes the app offers, and custom', () => {
    expect([...THEME_IDS].sort()).toEqual([...ids('PRESET_THEMES'), 'custom'].sort());
  });

  it('are the fonts the app offers', () => {
    expect([...FONT_IDS].sort()).toEqual(ids('FONT_OPTIONS').sort());
  });
});

describe('the DATABASE_URL block in backup.sh and restore.sh', () => {
  const block = (rel: string) => {
    const source = read(rel);
    const start = source.indexOf('# Parse DATABASE_URL');
    if (start === -1) throw new Error(`${rel} no longer has its "# Parse DATABASE_URL" block; update this test with the file`);
    return source.slice(start, source.indexOf('\nfi\n', start));
  };

  it('is the same in both scripts', () => {
    expect(block('backend/scripts/restore.sh')).toBe(block('backend/scripts/backup.sh'));
  });
});

describe('the kinds of thing that can use an asset', () => {
  /** The members of `export type AssetUseKind = | 'a' | 'b';` in a file. */
  const union = (rel: string) => {
    const m = /export type AssetUseKind =([^;]+);/.exec(read(rel));
    if (!m) throw new Error(`${rel} no longer declares AssetUseKind; update this test with the file`);
    return [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((k) => k[1]).sort();
  };
  const server = union('backend/src/services/assetUsage.ts');

  it('are the same in the browser and on the server', () => {
    expect(union('frontend/src/types/index.ts')).toEqual(server);
  });

  it('are all kept by the client when it reads a refusal', () => {
    const m = /const ASSET_USE_KINDS: readonly AssetUseKind\[\] = \[([^\]]+)\]/.exec(read('frontend/src/utils/errors.ts'));
    if (!m) throw new Error('frontend/src/utils/errors.ts no longer declares ASSET_USE_KINDS; update this test with the file');
    expect([...m[1].matchAll(/'([A-Za-z]+)'/g)].map((k) => k[1]).sort()).toEqual(server);
  });

  it('are listed in the API document', () => {
    const m = /enum: \[(map, token, character[^\]]*)\]/.exec(read('backend/docs/API_DOCUMENTATION.yaml'));
    if (!m) throw new Error('the API document no longer lists the asset use kinds; update this test with the file');
    expect(m[1].split(',').map((k) => k.trim()).sort()).toEqual(server);
  });
});

describe('the .dockerignore of each image', () => {
  /** A .dockerignore pattern as a regular expression: * stays inside a name, **\/ crosses folders. */
  function patternToRegExp(pattern: string): RegExp {
    let out = '';
    for (let i = 0; i < pattern.length; i++) {
      if (pattern.startsWith('**/', i)) {
        out += '(?:.*/)?';
        i += 2;
      } else if (pattern[i] === '*') out += '[^/]*';
      else if (pattern[i] === '?') out += '[^/]';
      else out += pattern[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`^${out}/?$`);
  }

  /** Whether Docker leaves `file` out of the build context: the last pattern that matches decides, and ! puts a file back. */
  function ignored(rel: string, file: string): boolean {
    let result = false;
    for (const line of read(rel).split(/\r?\n/)) {
      const pattern = line.trim();
      if (!pattern || pattern.startsWith('#')) continue;
      const negated = pattern.startsWith('!');
      if (patternToRegExp(negated ? pattern.slice(1) : pattern).test(file)) result = !negated;
    }
    return result;
  }

  // Each image's Dockerfile copies its whole folder. The lists named four env
  // files, so a .env.staging or .env.test, or whatever a tool writes next,
  // went into the build context and the image.
  it.each(['backend/.dockerignore', 'frontend/.dockerignore'])('%s keeps every env file out of the build context except .env.example', (rel) => {
    const strays = ['.env', '.env.local', '.env.development', '.env.production', '.env.staging', '.env.test', '.env.production.local'];
    expect(strays.filter((file) => !ignored(rel, file))).toEqual([]);
    expect(ignored(rel, '.env.example')).toBe(false);
  });

  it('is the same rule in the two images', () => {
    const envLines = (rel: string) =>
      read(rel)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('.env') || line.startsWith('!.env'));
    expect(envLines('frontend/.dockerignore')).toEqual(envLines('backend/.dockerignore'));
  });
});

describe('the Node.js major', () => {
  const expected = read('.nvmrc').trim();

  /** The leading major of a version or range ("26", "26.x", ">=26.0.0", "^26.6.5"), or the text itself when it has none. */
  const majorOf = (version: string): string => /^\D{0,2}(\d+)/.exec(version)?.[1] ?? version;

  /** Every match of `pattern` in a file, as majors; a file the pattern no longer matches fails the check. */
  function found(rel: string, text: string, pattern: RegExp): string[] {
    const versions = [...text.matchAll(pattern)].map((m) => majorOf(m.slice(1).find((g) => g !== undefined) ?? ''));
    if (versions.length === 0) throw new Error(`${rel} no longer matches ${pattern}; update this test with the file`);
    return versions;
  }

  const pkg = (rel: string) =>
    JSON.parse(read(rel)) as { engines?: { node?: string }; devDependencies?: Record<string, string> };
  const lock = JSON.parse(read('backend/package-lock.json')) as { packages: Record<string, { version?: string }> };
  const ci = read('.github/workflows/ci.yml');

  // A tag with no leading number (node:lts-alpine, node:current) is kept as
  // written, so it shows up as a disagreement.
  const places: [string, string[]][] = [
    ...['backend/Dockerfile', 'backend/Dockerfile.prod', 'frontend/Dockerfile', 'frontend/Dockerfile.prod'].map(
      (rel): [string, string[]] => [rel, found(rel, instructions(rel).join('\n'), /^FROM\s+node:(\S+)/gm)]
    ),
    ['.github/workflows/ci.yml', found('.github/workflows/ci.yml', ci, /^\s*node-version:\s*['"]?([^'"\s]+)/gm)],
    ['backend/package.json engines', [majorOf(pkg('backend/package.json').engines?.node ?? 'missing')]],
    ['frontend/package.json engines', [majorOf(pkg('frontend/package.json').engines?.node ?? 'missing')]],
    ['backend/package.json @types/node', [majorOf(pkg('backend/package.json').devDependencies?.['@types/node'] ?? 'missing')]],
    ['backend/package-lock.json @types/node', [majorOf(lock.packages['node_modules/@types/node']?.version ?? 'missing')]],
    ['README.md', found('README.md', read('README.md'), /^- Node\.js (\d+)\+/gm)],
    ['docs/DEVELOPMENT.md', found('docs/DEVELOPMENT.md', read('docs/DEVELOPMENT.md'), /\| Node\.js \| (\d+)\.x \||Comes with Node\.js (\d+)/g)],
    ['docs/DEPLOYMENT.md', found('docs/DEPLOYMENT.md', read('docs/DEPLOYMENT.md'), /Install Node\.js (\d+)|setup_(\d+)\.x/g)],
    ['docs/DEPLOYMENT.md, what node --version prints', found('docs/DEPLOYMENT.md', read('docs/DEPLOYMENT.md'), /prints `v(\d+)`/g)],
  ];

  it('is a major alone in .nvmrc, and an even one, which is what gets long-term support', () => {
    expect(expected).toMatch(/^\d+$/);
    expect(Number(expected) % 2).toBe(0);
  });

  it('is the same in every Dockerfile stage, CI job, engines field, @types/node and guide', () => {
    const disagree = places
      .filter(([, majors]) => majors.some((m) => m !== expected))
      .map(([where, majors]) => `${where}: ${majors.join(', ')}`);
    expect(disagree).toEqual([]);
  });

  // The jobs are counted so that a job added without a node-version, which
  // would run on the runner's own Node, fails here too.
  it('is set in every CI job that sets Node up', () => {
    const setups = ci.match(/uses: actions\/setup-node@/g) ?? [];
    const versions = ci.match(/^\s*node-version:/gm) ?? [];
    expect(versions.length).toBe(setups.length);
  });
});

describe('the .npmrc each image installs with', () => {
  const dockerfiles = ['backend/Dockerfile', 'backend/Dockerfile.prod', 'frontend/Dockerfile', 'frontend/Dockerfile.prod'];

  /** The files a COPY line takes from the build context; none for a copy from another stage. */
  const copied = (line: string): string[] => {
    const words = line.trim().split(/\s+/).slice(1);
    if (words.some((word) => word.startsWith('--from='))) return [];
    const paths = words.filter((word) => !word.startsWith('--'));
    return paths.slice(0, -1);
  };

  it.each(dockerfiles)('is copied into every stage of %s before npm installs there', (rel) => {
    const stages = instructions(rel).join('\n').split(/^FROM\s/m).slice(1);
    const installing = stages.filter((stage) => /^RUN\b.*\bnpm (ci|install)\b/m.test(stage));
    if (installing.length === 0) throw new Error(`${rel} no longer runs npm ci or npm install; update this test with the file`);
    const late = installing.filter((stage) => {
      const lines = stage.split('\n');
      const install = lines.findIndex((line) => /^RUN\b.*\bnpm (ci|install)\b/.test(line));
      return !lines.slice(0, install).some((line) => /^COPY\s/.test(line) && copied(line).includes('.npmrc'));
    });
    expect(late.map((stage) => `${rel}: FROM ${stage.split('\n')[0]}`)).toEqual([]);
  });
});

describe('the npm overrides in backend/package.json', () => {
  type LockPackage = { version?: string; dependencies?: Record<string, string> };
  const manifest = JSON.parse(read('backend/package.json')) as { overrides?: Record<string, unknown> };
  const lock = JSON.parse(read('backend/package-lock.json')) as { packages: Record<string, LockPackage> };

  /** Each override as [package above, package held, version held at]. */
  const overrides = Object.entries(manifest.overrides ?? {}).flatMap(([parent, held]) => {
    if (typeof held !== 'object' || held === null) throw new Error(`the override for ${parent} is not a map of packages to versions`);
    return Object.entries(held).map(([name, version]): [string, string, string] => {
      if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`the override of ${name} under ${parent} is not an exact version`);
      }
      return [parent, name, version];
    });
  });

  /** The x.y.z a version or a simple range starts from ("^7.1.5" gives 7.1.5). */
  const numbers = (version: string) => {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (!m) throw new Error(`${version} has no x.y.z version in it`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const newer = (a: string, b: string) => {
    const [x, y] = [numbers(a), numbers(b)];
    const i = x.findIndex((n, k) => n !== y[k]);
    return i !== -1 && x[i] > y[i];
  };

  /** Where npm installed `name` for the package at `where`: beside it, or higher up. */
  const installedFor = (where: string, name: string): LockPackage | undefined => {
    for (let base = where; ; base = base.slice(0, Math.max(base.lastIndexOf('/node_modules/'), 0))) {
      const found = lock.packages[`${base ? `${base}/` : ''}node_modules/${name}`];
      if (found || !base) return found;
    }
  };

  it('are installed at the version they name, wherever the package above them is', () => {
    const wrong = overrides.flatMap(([parent, name, version]) => {
      const parents = Object.keys(lock.packages).filter((where) => where.endsWith(`node_modules/${parent}`));
      if (parents.length === 0) return [`${parent}: not in the lockfile, so its override of ${name} does nothing`];
      return parents.flatMap((where) => {
        const installed = installedFor(where, name)?.version;
        return installed === version ? [] : [`${name} under ${where}: the lockfile has ${installed ?? 'nothing'}, the override ${version}`];
      });
    });
    expect(wrong).toEqual([]);
  });

  it('hold each package newer than the package above it asks for, or they are holding it back', () => {
    const wrong = overrides.flatMap(([parent, name, version]) => {
      const asked = lock.packages[`node_modules/${parent}`]?.dependencies?.[name];
      if (!asked) return [`${parent} no longer asks for ${name}: remove the override`];
      return newer(version, asked) ? [] : [`${parent} asks for ${name} ${asked}, the override holds it at ${version}: remove the override`];
    });
    expect(wrong).toEqual([]);
  });
});
