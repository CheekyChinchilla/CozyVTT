/**
 * Facts recorded in more than one place, with nothing keeping them in
 * step but a comment. A comment is not a check, so these are.
 *
 * The nginx stamp. `docker compose up -d --build` leaves a running container
 * alone unless its definition changed, and the nginx template is a mounted
 * file, not part of the definition. A change to it reaches an upgraded
 * instance only if something in the nginx service's definition changes too.
 * `NGINX_CONF_STAMP` is that something, and it has to change every time the
 * template does, so it is required to be the template's hash.
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
 * The stamp a given template calls for: the first twelve hex digits of its
 * SHA-256, with line endings normalised so a Windows checkout agrees.
 */
function nginxStampFor(template: string): string {
  return crypto.createHash('sha256').update(template.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
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
  it('is the hash of nginx/nginx.conf, so a changed template recreates the container on upgrade', () => {
    const expected = nginxStampFor(read('nginx/nginx.conf'));
    const m = /NGINX_CONF_STAMP:\s*"([^"]*)"/.exec(read('docker-compose.yml'));
    if (!m) throw new Error('docker-compose.yml no longer sets NGINX_CONF_STAMP on the nginx service');
    if (m[1] !== expected) {
      throw new Error(
        `nginx/nginx.conf changed: set NGINX_CONF_STAMP in docker-compose.yml to "${expected}" (it is "${m[1]}")`
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
