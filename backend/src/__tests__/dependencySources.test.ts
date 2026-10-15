/**
 * Where each project's packages come from, and which of them run code when
 * they are installed.
 *
 * Every image installs with `npm ci`, which takes each package from the
 * address its lockfile records and refuses one whose contents do not match
 * the recorded hash. An entry pointing anywhere else (a git repository, a
 * file on another server) or carrying no hash would get round both, so every
 * entry must come from the npm registry with a hash.
 *
 * A package can also run a script while it is installed: the Prisma packages
 * fetch their database engines that way, and argon2 checks for its prebuilt
 * binary. package.json's `allowScripts` names the packages allowed to, and
 * each project's `.npmrc` turns on strict-allow-scripts, so `npm ci` fails at
 * any other package with a script, in the images, in CI and on a developer's
 * machine. The list must name exactly the packages whose scripts run today:
 * a new one is then a decision made in a reviewed change, and the install of
 * a released lockfile cannot fail on a package the list forgot.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

type LockEntry = { resolved?: string; integrity?: string; link?: boolean; hasInstallScript?: boolean };

describe.each(['backend', 'frontend'])('%s', (project) => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, project, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockEntry>;
  };
  const pkg = JSON.parse(fs.readFileSync(path.join(root, project, 'package.json'), 'utf8')) as {
    allowScripts?: Record<string, boolean>;
  };
  const entries = Object.entries(lock.packages).filter(([where, entry]) => where !== '' && !entry.link);
  const nameOf = (where: string) => where.slice(where.lastIndexOf('node_modules/') + 'node_modules/'.length);

  it('takes every package from the npm registry, with a hash to check it against', () => {
    expect(entries.length).toBeGreaterThan(100);
    const strays = entries
      .filter(([, entry]) => !entry.resolved?.startsWith('https://registry.npmjs.org/') || !entry.integrity?.startsWith('sha512-'))
      .map(([where, entry]) => `${where}: ${entry.resolved ?? 'no address'}`);
    expect(strays).toEqual([]);
  });

  it('allows install scripts for exactly the packages that have them', () => {
    const withScripts = [...new Set(entries.filter(([, entry]) => entry.hasInstallScript).map(([where]) => nameOf(where)))].sort();
    expect(withScripts.length).toBeGreaterThan(0);
    expect(Object.keys(pkg.allowScripts ?? {}).sort()).toEqual(withScripts);
    expect(Object.values(pkg.allowScripts ?? {}).every((allowed) => allowed === true)).toBe(true);
  });
});
