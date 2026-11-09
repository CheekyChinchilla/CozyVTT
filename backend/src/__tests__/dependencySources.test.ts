/**
 * Where each project's packages come from, and which of them run code when
 * they are installed.
 *
 * Every image installs with `npm ci`, which takes each package from the
 * address its lockfile records and refuses one whose contents do not match
 * the recorded hash. An entry pointing anywhere else (a git repository, a
 * file on another server) or carrying no hash would get round both, so every
 * entry must come from the npm registry with a hash. A package bundled inside
 * another comes in that package's download, so npm records it with no address
 * or hash of its own; it passes when it has neither, and the package that
 * bundles it names it and passes. One with an address of its own is fetched
 * from there unchecked when the parent's download lacks it.
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

type LockEntry = { resolved?: string; integrity?: string; link?: boolean; hasInstallScript?: boolean; inBundle?: boolean; bundleDependencies?: string[] };

const nameOf = (where: string) => where.slice(where.lastIndexOf('node_modules/') + 'node_modules/'.length);

/** The entries of a lockfile's `packages` that do not come from the npm registry with a hash, each with its address. */
function strays(packages: Record<string, LockEntry>): string[] {
  const checked = (where: string): boolean => {
    const entry = packages[where];
    if (entry?.resolved?.startsWith('https://registry.npmjs.org/') && entry.integrity?.startsWith('sha512-')) return true;
    // Bundled: no address or hash of its own, which npm would fetch from
    // unchecked when its parent's download lacks it, and a parent that is
    // itself checked and names it in bundleDependencies.
    const at = where.lastIndexOf('/node_modules/');
    if (entry?.inBundle !== true || entry.resolved !== undefined || entry.integrity !== undefined || at <= 0) return false;
    const parent = where.slice(0, at);
    return (packages[parent]?.bundleDependencies ?? []).includes(nameOf(where)) && checked(parent);
  };
  return Object.entries(packages)
    .filter(([where, entry]) => where !== '' && !entry.link && !checked(where))
    .map(([where, entry]) => `${where}: ${entry.resolved ?? 'no address'}`);
}

describe('the check of where packages come from', () => {
  const registry = (name: string): LockEntry => ({ resolved: `https://registry.npmjs.org/${name}/-/${name}-1.0.0.tgz`, integrity: 'sha512-x' });
  const parent = { ...registry('wasm'), bundleDependencies: ['inner'] };

  it('passes a package bundled in a parent from the registry that names it, with no address or hash of its own', () => {
    expect(strays({ 'node_modules/wasm': parent, 'node_modules/wasm/node_modules/inner': { inBundle: true } })).toEqual([]);
  });

  it('reports a package marked bundled that has an address of its own, which npm would fetch unchecked', () => {
    expect(strays({ 'node_modules/wasm': parent, 'node_modules/wasm/node_modules/inner': { inBundle: true, resolved: 'https://example.com/inner.tgz' } }))
      .toEqual(['node_modules/wasm/node_modules/inner: https://example.com/inner.tgz']);
  });

  it('reports a package marked bundled that its parent does not name', () => {
    expect(strays({ 'node_modules/wasm': registry('wasm'), 'node_modules/wasm/node_modules/inner': { inBundle: true } }))
      .toEqual(['node_modules/wasm/node_modules/inner: no address']);
  });

  it('reports a package marked bundled with no parent, or under one with no hash', () => {
    expect(strays({ 'node_modules/wasm': parent, 'node_modules/wasmx': { inBundle: true } })).toEqual(['node_modules/wasmx: no address']);
    const unhashed = { ...parent, integrity: undefined };
    expect(strays({ 'node_modules/wasm': unhashed, 'node_modules/wasm/node_modules/inner': { inBundle: true } })).toHaveLength(2);
  });
});

describe.each(['backend', 'frontend'])('%s', (project) => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, project, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockEntry>;
  };
  const pkg = JSON.parse(fs.readFileSync(path.join(root, project, 'package.json'), 'utf8')) as {
    allowScripts?: Record<string, boolean>;
  };
  const entries = Object.entries(lock.packages).filter(([where, entry]) => where !== '' && !entry.link);

  it('takes every package from the npm registry, with a hash to check it against', () => {
    expect(entries.length).toBeGreaterThan(100);
    expect(strays(lock.packages)).toEqual([]);
  });

  it('allows install scripts for exactly the packages that have them', () => {
    const withScripts = [...new Set(entries.filter(([, entry]) => entry.hasInstallScript).map(([where]) => nameOf(where)))].sort();
    expect(withScripts.length).toBeGreaterThan(0);
    expect(Object.keys(pkg.allowScripts ?? {}).sort()).toEqual(withScripts);
    expect(Object.values(pkg.allowScripts ?? {}).every((allowed) => allowed === true)).toBe(true);
  });
});
