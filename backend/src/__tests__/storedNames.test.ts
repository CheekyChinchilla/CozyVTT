/**
 * The names that stored data and the wire use.
 *
 * Version 1.7.0 gave the game systems and the GM's role CozyVTT's own names,
 * and its migration renamed every stored value. This holds the new names in
 * the database's enums and in the code that reads or writes them, and the
 * old ones nowhere in either package but the two copies of the alias table
 * that read them as the new (legacy/gameSystemAliases.ts), which must take
 * each one. The route, the event and its fields, and the invitation's field
 * that older versions named for the role are still sent for this release.
 *
 * A source file, type, function or variable may be renamed freely. What a
 * database row, a campaign archive, a character file, a browser's storage or
 * a client program holds may not, and a rename that reached one along with
 * the code around it would leave stored data or a script unread: the enum
 * values, the share an archive gives each drawing, the sheet keys, the route
 * paths and template names, the socket event and its fields, and the keys
 * the app keeps in a browser. So each is looked for here, in the code outside
 * the tests, by how that code writes it. The template names the web client
 * asks for are also held against the server's templates, since the server
 * answers a name it does not know with the blank sheet.
 */

import fs from 'fs';
import path from 'path';
import { CampaignRole, DrawingAudience, GameSystem, MessageType } from '@prisma/client';
import { SUPPORTED_GAME_SYSTEMS } from '../game-systems';
import { getCharacterTemplate } from '../utils/character-templates';
import { FLEXIBLE_TEMPLATES } from '../utils/character-templates/flexible-templates';
import {
  LEGACY_GAME_SYSTEMS, LEGACY_GM, normaliseDrawingAudience, normaliseDrawingShare, normaliseGameSystem, normaliseMessageType, normaliseRole,
} from '../legacy/gameSystemAliases';
import { OLD_ONLY_KEYS, OLD_ONLY_SKILLS } from '../legacy/horrorD100Sheet';

const root = path.resolve(__dirname, '../../..');

type Package = 'backend' | 'frontend';

/** Each source file of a package, by its path from the repository root: outside its tests, or every one. */
function sources(pkg: Package, withTests = false): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (withTests || (entry.name !== '__tests__' && entry.name !== 'test')) walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && (withTests || !/\.(test|spec)\.tsx?$/.test(entry.name))) {
        files.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
      }
    }
  };
  walk(`${pkg}/src`);
  return files;
}

const code: Record<Package, Map<string, string>> = { backend: sources('backend'), frontend: sources('frontend') };

/** The files of a package whose code writes the name as `written` matches. */
function filesWriting(pkg: Package, written: RegExp): string[] {
  return [...code[pkg]].filter(([, text]) => written.test(text)).map(([rel]) => rel);
}

interface Kept {
  /** The name, as data holds it. */
  name: string;
  /** The package whose code reads or writes it. */
  pkg: Package;
  /** How that code writes it. */
  written: RegExp;
}

/** The database's enums that hold a game system or the GM, with the values each holds now. */
const ENUMS: Array<{ enumName: string; values: readonly string[]; expected: readonly string[] }> = [
  { enumName: 'GameSystem', values: Object.values(GameSystem), expected: ['FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100'] },
  { enumName: 'CampaignRole', values: Object.values(CampaignRole), expected: ['GM', 'PLAYER', 'SPECTATOR'] },
  { enumName: 'MessageType', values: Object.values(MessageType), expected: ['PLAYER', 'GM', 'SYSTEM', 'DICE_ROLL', 'CHARACTER_ACTION', 'WHISPER'] },
  { enumName: 'DrawingAudience', values: Object.values(DrawingAudience), expected: ['ALL', 'GM'] },
];

const KEPT: Kept[] = [
  // The game systems, as the server checks and stores them and the app compares them.
  { name: 'FIFTH_EDITION', pkg: 'backend', written: /\bGameSystem\.FIFTH_EDITION\b/ },
  { name: 'FIFTH_EDITION', pkg: 'frontend', written: /\bFIFTH_EDITION = 'FIFTH_EDITION'/ },
  { name: 'FANTASY_D20', pkg: 'backend', written: /\bGameSystem\.FANTASY_D20\b/ },
  { name: 'FANTASY_D20', pkg: 'frontend', written: /\bFANTASY_D20 = 'FANTASY_D20'/ },
  { name: 'HORROR_D100', pkg: 'backend', written: /\bGameSystem\.HORROR_D100\b/ },
  { name: 'HORROR_D100', pkg: 'frontend', written: /\bHORROR_D100 = 'HORROR_D100'/ },
  // The GM's message type and drawing audience; the role route takes the database's roles.
  { name: 'GM', pkg: 'backend', written: /CHAT_TYPES = \['PLAYER', 'GM'\]/ },
  { name: 'GM', pkg: 'backend', written: /DRAWING_AUDIENCES = \['ALL', 'GM'\]/ },
  { name: 'GM', pkg: 'backend', written: /Object\.values\(CampaignRole\)\.find\(\(option\) => option === given\)/ },
  // The markup share a campaign archive writes for each drawing, and reads back.
  { name: 'GM', pkg: 'backend', written: /MARKUP_SHARES = \['GM', 'PLAYERS'\]/ },
  { name: 'GM', pkg: 'backend', written: /=== \w+ \? 'GM' : 'PLAYERS';/ },
  { name: 'GM', pkg: 'backend', written: /share: drawingShare\(row, \w+\)/ },
  { name: 'GM', pkg: 'backend', written: /ShareSchema = z\.preprocess\(normaliseDrawingShare, z\.enum\(MARKUP_SHARES\)\)/ },
  // Each enum on its own: both write it the same way, so one changed alone
  // would leave the other to pass for it.
  { name: 'GM', pkg: 'frontend', written: /enum CampaignRole \{[^}]*\bGM = 'GM',/ },
  { name: 'GM', pkg: 'frontend', written: /enum MessageType \{[^}]*\bGM = 'GM',/ },
  { name: 'GM', pkg: 'frontend', written: /audience: 'ALL' \| 'GM'/ },
  // The record a Horror d100 sheet converted from the shape before 1.7.0
  // carries, which marks it as converted and holds its old values.
  { name: 'converted', pkg: 'backend', written: /^\s+converted: HorrorD100ConversionRecordSchema\.optional\(\),$/m },
  { name: 'converted', pkg: 'frontend', written: /^\s+converted\?: HorrorD100ConversionRecord;$/m },
  // The routes, and the template names a request can give. The hand-over
  // is taken at the path older versions gave it too, as every old value is.
  { name: '/:campaignId/gm', pkg: 'backend', written: /router\.put\('\/:campaignId\/gm', authenticated, transferGMSeat\);/ },
  { name: '/:campaignId/dm', pkg: 'backend', written: /router\.put\('\/:campaignId\/dm', authenticated, transferGMSeat\);/ },
  { name: '/api/campaigns/:campaignId/gm', pkg: 'frontend', written: /`\/api\/campaigns\/\$\{campaignId\}\/gm`/ },
  { name: '/templates/:gameSystem/:templateName', pkg: 'backend', written: /'\/templates\/:gameSystem\/:templateName'/ },
  { name: 'blank', pkg: 'backend', written: /templateName === 'blank'/ },
  { name: 'fighter', pkg: 'backend', written: /templateName === 'fighter'/ },
  { name: 'privateinvestigator', pkg: 'backend', written: /templateName === 'privateinvestigator'/ },
  { name: 'pi', pkg: 'backend', written: /templateName === 'pi'/ },
  // The GM's seat moving, as the server sends it and the app hears it.
  { name: 'campaign.gm.transferred', pkg: 'backend', written: /broadcastToCampaign\(campaignId, 'campaign\.gm\.transferred', transferred\)/ },
  { name: 'campaign.gm.transferred', pkg: 'frontend', written: /addListener\('campaign\.gm\.transferred'/ },
  { name: 'previousGmId', pkg: 'backend', written: /^\s+previousGmId: /m },
  { name: 'previousGmId', pkg: 'frontend', written: /\.previousGmId\b/ },
  { name: 'newGmId', pkg: 'backend', written: /^\s+newGmId: /m },
  { name: 'newGmId', pkg: 'frontend', written: /\.newGmId\b/ },
  // The GM a pending invitation names, in the invitation's campaign.
  { name: 'gm', pkg: 'backend', written: /campaign: \{ \.\.\.campaign, gm, dm: gm \}/ },
  { name: 'gm', pkg: 'frontend', written: /^\s+gm\?: \{$/m },
  // What the app keeps in a browser.
  { name: 'cozyvtt_user_theme', pkg: 'frontend', written: /'cozyvtt_user_theme'/ },
  { name: 'cozyvtt-session-tab', pkg: 'frontend', written: /'cozyvtt-session-tab'/ },
  { name: 'cozyvtt-session-layout', pkg: 'frontend', written: /'cozyvtt-session-layout'/ },
  { name: 'cozyvtt.signInNotice', pkg: 'frontend', written: /'cozyvtt\.signInNotice'/ },
  { name: 'cozyvtt-preparing-map:', pkg: 'frontend', written: /`cozyvtt-preparing-map:\$\{campaignId\}`/ },
  { name: 'cozyvtt-paint-tab', pkg: 'frontend', written: /'cozyvtt-paint-tab'/ },
  { name: 'cozyvtt-paint-tab:', pkg: 'frontend', written: /'cozyvtt-paint-tab:'/ },
  { name: 'cozyvtt-paint-drafts', pkg: 'frontend', written: /'cozyvtt-paint-drafts'/ },
];

/**
 * The names versions before 1.7.0 sent, still sent beside the new ones for
 * this release so a script or a browser tab made for one keeps working. Each
 * goes in the release after.
 */
const SENT_FOR_THIS_RELEASE: Kept[] = [
  { name: 'campaign.dm.transferred', pkg: 'backend', written: /broadcastToCampaign\(campaignId, 'campaign\.dm\.transferred', transferred\)/ },
  { name: 'previousDmId', pkg: 'backend', written: /^\s+previousDmId: outgoing\?\.userId \?\? null,$/m },
  { name: 'newDmId', pkg: 'backend', written: /^\s+newDmId: incomingId,$/m },
  { name: 'dm', pkg: 'backend', written: /campaign: \{ \.\.\.campaign, gm, dm: gm \}/ },
];

describe('the names stored data and the wire use', () => {
  it.each(ENUMS)('the database enum $enumName holds $expected', ({ values, expected }) => {
    expect([...values]).toEqual([...expected]);
  });

  it.each(KEPT)('$name is written as $written in the $pkg code', ({ pkg, written }) => {
    expect(filesWriting(pkg, written)).not.toEqual([]);
  });

  it.each(SENT_FOR_THIS_RELEASE)('$name, as older versions sent it, is still written as $written in the $pkg code', ({ pkg, written }) => {
    expect(filesWriting(pkg, written)).not.toEqual([]);
  });

  it('reads the source of both packages', () => {
    expect(code.backend.size).toBeGreaterThan(100);
    expect(code.frontend.size).toBeGreaterThan(300);
  });
});

describe('the values older versions stored and sent', () => {
  it('are read as the game systems the database holds now, each one', () => {
    expect(Object.values(LEGACY_GAME_SYSTEMS).sort()).toEqual([...SUPPORTED_GAME_SYSTEMS].sort());
    for (const [old, now] of Object.entries(LEGACY_GAME_SYSTEMS)) {
      expect(normaliseGameSystem(old)).toBe(now);
      expect(normaliseGameSystem(now)).toBe(now);
    }
  });

  it('leave no system as none and anything else for the caller to refuse', () => {
    expect(normaliseGameSystem(null)).toBeNull();
    for (const value of [undefined, '', 'flexible', 'fifth_edition', 'constructor', '__proto__', 5, {}]) {
      expect(normaliseGameSystem(value)).toBeUndefined();
    }
  });

  it.each([
    ['a role', normaliseRole],
    ['a message type', normaliseMessageType],
    ['a drawing audience', normaliseDrawingAudience],
    ['a drawing share', normaliseDrawingShare],
  ])('read the GM\'s old value as GM in %s, and leave anything else as given', (_what, normalise) => {
    expect(normalise(LEGACY_GM)).toBe('GM');
    expect(normalise('GM')).toBe('GM');
    for (const value of ['PLAYER', 'ALL', 'PLAYERS', 'dm', undefined, null, 3]) expect(normalise(value)).toBe(value);
  });

  // Every other file reads and writes the new values only, tests included,
  // so a value an older version used reaches the database only through the
  // alias table. A test showing one is read gets it from the table.
  it.each(['backend', 'frontend'] as const)('appear in no %s source file but the alias table and the tests beside it', (pkg) => {
    const legacy = `${pkg}/src/legacy/`;
    const old = new RegExp(`\\b(${[...Object.keys(LEGACY_GAME_SYSTEMS), LEGACY_GM].join('|')})\\b`);
    const writing = [...sources(pkg, true)].filter(([rel, text]) => !rel.startsWith(legacy) && old.test(text)).map(([rel]) => rel);
    expect(writing).toEqual([]);
  });
});

// The Horror d100 sheet was rebuilt in 1.7.0 under keys of its own. The keys
// only the sheet before it had are read by the conversion alone
// (legacy/horrorD100Sheet.ts, which lists them), so nothing else can come to
// read or write a sheet in the old shape.
describe('the keys only the Horror d100 sheet before 1.7.0 had', () => {
  // Those written as a compound word, which no sentence holds. The rest are
  // one plain word each, which a comment may well use.
  const compound = [...OLD_ONLY_KEYS, ...OLD_ONLY_SKILLS].filter((key) => /[a-z][A-Z]/.test(key));

  // The keys that are one plain word are looked for only where code reads
  // or writes a key of that name: after a dot, as a quoted string, or before
  // a colon at the start of a line. A sentence that uses the word is not a
  // hit, and neither is the word as a bare variable name, which this cannot
  // tell from prose. The two group keys of the old skills block are left
  // out: the weapon skill reader (utils/rules/horrorD100.ts) compares a
  // weapon's typed skill name with the same two words, as "Fighting (Sword)"
  // was typed on a sheet before 1.7.0, and that is no sheet key.
  const WORDS_A_WEAPON_NAMES = ['fighting', 'firearms'];
  const single = [...OLD_ONLY_KEYS, ...OLD_ONLY_SKILLS].filter((key) => !/[a-z][A-Z]/.test(key) && !WORDS_A_WEAPON_NAMES.includes(key));

  it.each(['backend', 'frontend'] as const)('appear in no %s source file outside the conversion and its tests', (pkg) => {
    const old = new RegExp(`\\b(${compound.join('|')})\\b`);
    const writing = [...sources(pkg, true)].filter(([rel, text]) => !rel.startsWith('backend/src/legacy/') && old.test(text)).map(([rel]) => rel);
    expect(writing).toEqual([]);
  });

  it('are the ones the conversion tells an old sheet by', () => {
    expect(compound.length).toBeGreaterThanOrEqual(12);
    expect(single.length).toBeGreaterThanOrEqual(3);
  });

  it.each(['backend', 'frontend'] as const)('are not read or written as a key in any %s source file outside the conversion, the one-word ones', (pkg) => {
    const names = single.join('|');
    const asKey = new RegExp(`\\.(${names})\\b|['"\`](${names})['"\`]|^\\s*(${names})\\??:`, 'm');
    const writing = [...sources(pkg, true)].filter(([rel, text]) => !rel.startsWith('backend/src/legacy/') && asKey.test(text)).map(([rel]) => rel);
    expect(writing).toEqual([]);
  });
});

/** The window where a character is made, which asks the server for a starter sheet by template name. */
const NEW_CHARACTER_WINDOW = 'frontend/src/components/character/NewCharacterModal.tsx';

/** The template names a list of the window's options gives, as `value: '<name>'`. */
const valuesIn = (options: string): string[] => [...options.matchAll(/value: '([^']+)'/g)].map((match) => match[1]);

/** The template names the window offers, by game system, and for a character with none. */
function templateNamesSent(): { bySystem: Map<string, string[]>; flexible: string[] } {
  const text = code.frontend.get(NEW_CHARACTER_WINDOW) ?? '';
  const bySystem = new Map<string, string[]>();
  for (const [, system, options] of text.matchAll(/\[GameSystem\.(\w+)\]: \[([\s\S]*?)\n {2}\],/g)) {
    bySystem.set(system, valuesIn(options));
  }
  const flexible = /if \(!gameSystem\) \{\s*return \[([\s\S]*?)\];/.exec(text);
  return { bySystem, flexible: flexible ? valuesIn(flexible[1]) : [] };
}

// The server answers a template name it does not know with the blank sheet,
// so a name changed on one side alone would start every example character
// blank, with no error.
describe('the template names the web client sends', () => {
  const { bySystem, flexible } = templateNamesSent();

  it('are read for each game system and for a character with none', () => {
    expect([...bySystem.keys()].sort()).toEqual([...SUPPORTED_GAME_SYSTEMS].sort());
    for (const names of bySystem.values()) expect(names.length).toBeGreaterThanOrEqual(2);
    expect(flexible.length).toBeGreaterThanOrEqual(2);
  });

  it.each(SUPPORTED_GAME_SYSTEMS)('are each a template the server has for %s', (system) => {
    const blank = getCharacterTemplate(system, 'blank').name;
    const answeredBlank = (bySystem.get(system) ?? []).filter((name) => name !== 'blank' && getCharacterTemplate(system, name).name === blank);
    expect(answeredBlank).toEqual([]);
  });

  it('are each a flexible template the server has, for a character with no system', () => {
    expect(flexible.filter((name) => !Object.hasOwn(FLEXIBLE_TEMPLATES, name))).toEqual([]);
  });
});
