/**
 * The licence documents, checked against the lockfiles.
 *
 * THIRD_PARTY_NOTICES.txt names the packages each half of CozyVTT runs and
 * every licence among them, and THIRD_PARTY_LICENSES.md the main libraries it
 * is built on. Both are written by hand, and they drifted: versions two
 * releases old, packages no longer used, one listed twice, dependencies
 * missing, and the frontend counted as unlicensed. These checks fail when a
 * dependency changes and the documents do not.
 *
 * NOTICES gives each package's major version line ("4.x", or "0.35.x" below
 * version 1), so a minor or patch update leaves it true; a major update, which
 * can change a licence, asks for a look.
 */

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

type LockEntry = { version?: string; license?: string; dev?: boolean; link?: boolean };
type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
type Project = 'frontend' | 'backend';

/**
 * The licence of each production package whose lockfile entry records none.
 * They declare it in the older `licenses` field of their package.json, which
 * npm does not copy into the lockfile.
 */
const LICENCE_NOT_IN_LOCKFILE: Record<string, string> = {
  busboy: 'MIT',
  streamsearch: 'MIT',
  'xmlhttprequest-ssl': 'MIT',
};

const nameOf = (where: string) => where.slice(where.lastIndexOf('node_modules/') + 'node_modules/'.length);

function load(project: Project) {
  const manifest = JSON.parse(read(`${project}/package.json`)) as Manifest;
  const lock = JSON.parse(read(`${project}/package-lock.json`)) as { packages: Record<string, LockEntry> };
  const licenceOf = (where: string, entry: LockEntry) =>
    entry.license ?? LICENCE_NOT_IN_LOCKFILE[nameOf(where)] ?? `none recorded for ${where}`;
  const production = Object.entries(lock.packages).filter(([where, entry]) => where !== '' && !entry.dev && !entry.link);
  return {
    dependencies: Object.keys(manifest.dependencies ?? {}),
    devDependencies: Object.keys(manifest.devDependencies ?? {}),
    top: (name: string): LockEntry | undefined => lock.packages[`node_modules/${name}`],
    licenceOf,
    production,
  };
}

const projects = { frontend: load('frontend'), backend: load('backend') };

/** A version's major line, as NOTICES gives it: "4.x", or "0.35.x" below version 1. */
const versionLine = (version: string) => {
  const [major, minor] = version.split('.');
  return major === '0' ? `0.${minor}.x` : `${major}.x`;
};

/**
 * The licence identifiers in an SPDX expression such as "Apache-2.0 AND
 * LGPL-3.0-or-later". Some packages write the operators in lower case
 * (@visx/vendor has "MIT and ISC").
 */
const licenceIds = (expression: string) =>
  expression.replace(/[()]/g, ' ').split(/\s+/).filter((word) => word && !['AND', 'OR'].includes(word.toUpperCase()));

const notices = read('THIRD_PARTY_NOTICES.txt');

/** The text of NOTICES from one section heading to the next. */
function noticeSection(heading: string, next: string): string {
  const start = notices.indexOf(heading);
  const end = notices.indexOf(next, start);
  if (start === -1 || end === -1) throw new Error(`THIRD_PARTY_NOTICES.txt no longer has the headings ${heading} and ${next}`);
  return notices.slice(start, end);
}

/** The packages a NOTICES section lists: a "name version" line, then indented lines, one a "License:". */
function noticeEntries(heading: string, next: string) {
  return noticeSection(heading, next)
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n'))
    .filter((lines) => /^[@a-z]/.test(lines[0]) && lines.some((line) => line.startsWith('  License: ')))
    .map((lines) => {
      const [name, version] = lines[0].split(' ');
      const licence = lines.find((line) => line.startsWith('  License: '))!.slice('  License: '.length).trim();
      return { name, version, licence };
    });
}

const sections: Record<Project, ReturnType<typeof noticeEntries>> = {
  frontend: noticeEntries('SECTION 3: FRONTEND DEPENDENCIES', 'SECTION 4:'),
  backend: noticeEntries('SECTION 4: BACKEND DEPENDENCIES', 'SECTION 5:'),
};

describe.each(['frontend', 'backend'] as const)('THIRD_PARTY_NOTICES.txt, for the %s', (project) => {
  const { dependencies, top, licenceOf, production } = projects[project];
  const entries = sections[project];

  it('lists every production dependency, each once', () => {
    const names = entries.map((entry) => entry.name);
    expect(dependencies.filter((name) => !names.includes(name))).toEqual([]);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it('lists only packages the project runs, at the major line and licence its lockfile records', () => {
    const wrong = entries.flatMap(({ name, version, licence }) => {
      const entry = top(name);
      if (!entry?.version || entry.dev) return [`${name}: not a package this project runs`];
      const expected = `${versionLine(entry.version)} ${licenceOf(`node_modules/${name}`, entry)}`;
      return `${version} ${licence}` === expected ? [] : [`${name}: listed as ${version} ${licence}, the lockfile has ${expected}`];
    });
    expect(wrong).toEqual([]);
  });

  it('names every licence among the packages it runs, and no other', () => {
    const label = project === 'frontend' ? 'Frontend' : 'Backend';
    const section = noticeSection('SECTION 5:', 'SECTION 6:');
    const line = new RegExp(`^ {2}${label}: +([\\s\\S]*?)\\n(?! {4})`, 'm').exec(section);
    if (!line) throw new Error(`SECTION 5 of THIRD_PARTY_NOTICES.txt no longer has a "${label}:" line`);
    const listed = line[1].split(/[\s,]+/).filter(Boolean).sort();
    const found = [...new Set(production.flatMap(([where, entry]) => licenceIds(licenceOf(where, entry))))].sort();
    expect(listed).toEqual(found);
  });
});

describe('THIRD_PARTY_LICENSES.md', () => {
  const doc = read('THIRD_PARTY_LICENSES.md');
  const tables = doc.slice(doc.indexOf('## Campaign Export/Import Libraries'));

  /** The package and project behind each library the tables name. */
  const ROWS: Record<string, [Project, string]> = {
    archiver: ['backend', 'archiver'],
    unzipper: ['backend', 'unzipper'],
    'file-type': ['backend', 'file-type'],
    React: ['frontend', 'react'],
    Vite: ['frontend', 'vite'],
    Playwright: ['frontend', '@playwright/test'],
    Zustand: ['frontend', 'zustand'],
    'TanStack Query': ['frontend', '@tanstack/react-query'],
    'react-resizable-panels': ['frontend', 'react-resizable-panels'],
    'Framer Motion': ['frontend', 'framer-motion'],
    'react-markdown': ['frontend', 'react-markdown'],
    'remark-gfm': ['frontend', 'remark-gfm'],
    'remark-breaks': ['frontend', 'remark-breaks'],
    Express: ['backend', 'express'],
    Multer: ['backend', 'multer'],
    Prisma: ['backend', 'prisma'],
    'Socket.IO': ['backend', 'socket.io'],
    Zod: ['backend', 'zod'],
    sharp: ['backend', 'sharp'],
    otplib: ['backend', 'otplib'],
  };

  const rows = [...tables.matchAll(/^\| \[([^\]]+)\]\([^)]+\) \| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => ({
    library: m[1],
    licence: m[3].trim(),
  }));

  it('names each library by a package of the project that uses it, with that package\'s licence', () => {
    expect(rows.length).toBeGreaterThan(10);
    const wrong = rows.flatMap(({ library, licence }) => {
      const row = ROWS[library];
      if (!row) return [`${library}: add it to ROWS in this test, with the package it stands for`];
      const [project, name] = row;
      const { dependencies, devDependencies, top, licenceOf } = projects[project];
      if (!dependencies.includes(name) && !devDependencies.includes(name)) return [`${library}: ${name} is not a ${project} dependency`];
      const entry = top(name);
      const recorded = entry ? licenceOf(`node_modules/${name}`, entry) : 'missing from the lockfile';
      return recorded === licence ? [] : [`${library}: says ${licence}, the lockfile has ${recorded}`];
    });
    expect(wrong).toEqual([]);
  });

  // A library that only builds or tests CozyVTT never reaches an instance,
  // so NOTICES, which lists what an instance runs, leaves it out.
  it('has every library an instance runs in NOTICES too, and leaves the development tools out of it', () => {
    const wrong = rows.flatMap(({ library }) => {
      const row = ROWS[library];
      if (!row) return [];
      const [project, name] = row;
      const listed = sections[project].some((entry) => entry.name === name);
      const runs = projects[project].dependencies.includes(name);
      if (runs && !listed) return [`${library}: missing from NOTICES`];
      if (!runs && listed) return [`${library}: a development tool, listed in NOTICES`];
      return [];
    });
    expect(wrong).toEqual([]);
  });

  it('names the icons\' licence as the icon package records it', () => {
    const entry = projects.frontend.top('lucide-react');
    expect(entry?.license).toBe('ISC');
    expect(doc).toMatch(/\[Lucide\]\([^)]+\), licensed under the ISC License/);
  });
});
