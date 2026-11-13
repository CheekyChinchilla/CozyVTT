/**
 * The validate:characters, migrate:characters and migrate:avatar-scope
 * scripts.
 *
 * validate:characters reported every character as valid, because it ignored
 * the validator's answer, and its documented `--system` example failed.
 * migrate:characters --execute stamped a game system on Flexible characters
 * from a guess. All three printed an error and exited 0 when they failed, so a
 * runbook could not tell.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';
import { validateCharacters, parseValidateArgs, exportValidationIssues, type ValidationReport } from '../validate-characters';
import { inferGameSystem, migrateCharacters } from '../migrate-characters';
import { isOldHorrorD100Sheet } from '../../legacy/horrorD100Sheet';

/** A Horror d100 sheet in the shape before 1.7.0, from the server's fixtures of that shape. */
function oldHorrorD100(name: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../legacy/__fixtures__/horror-d100-sheets/${name}.json`), 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`${name}.json holds no sheet`);
  return { ...parsed };
}

const UNREACHABLE = 'postgresql://nobody:nothing@127.0.0.1:1/none';

/** Run a script the way `npm run` does, and return how it ended. */
function runScript(file: string, args: string[], databaseUrl = process.env.DATABASE_URL ?? '') {
  const result = spawnSync(
    path.resolve(__dirname, '../../../node_modules/.bin/ts-node'),
    ['--transpile-only', path.resolve(__dirname, '..', file), ...args],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: 'utf8', timeout: 60_000 }
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

let userId: string;
const mine = (): Prisma.CharacterWhereInput => ({ userId });

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Scripts' })).id;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.character.deleteMany({ where: { userId } });
});

async function character(gameSystem: GameSystem | null, data: Record<string, unknown>, campaignId?: string) {
  return prisma.character.create({
    data: {
      userId,
      name: `Script test ${gameSystem ?? 'flexible'}`,
      gameSystem,
      data: data as Prisma.InputJsonValue,
      ...(campaignId ? { campaignId } : {}),
    },
  });
}

const blankFifthEdition = () => getBlankTemplate(GameSystem.FIFTH_EDITION).data as Record<string, unknown>;

describe('validate:characters', () => {
  it('reports a character the server would refuse as invalid', async () => {
    await character(GameSystem.FIFTH_EDITION, blankFifthEdition());
    const refused = await character(GameSystem.FIFTH_EDITION, { ...blankFifthEdition(), level: 25 });

    const report = await validateCharacters(prisma, { where: mine() });

    expect(report.validCharacters).toBe(1);
    expect(report.invalidCharacters).toBe(1);
    expect(report.issues.map((issue) => issue.characterId)).toEqual([refused.id]);
    expect(report.issues[0].errors.map((error) => error.path)).toContain('level');
  });

  it('judges a sheet from before 1.3.0 as a save would, with its older fields moved', async () => {
    // The flat proficiencies list is refused by today's schema unless it is
    // moved first, as the character routes do.
    await character(GameSystem.FIFTH_EDITION, { ...blankFifthEdition(), proficiencies: ['All armor'], languages: ['Common'] });

    const report = await validateCharacters(prisma, { where: mine() });

    expect(report.invalidCharacters).toBe(0);
    expect(report.validCharacters).toBe(1);
  });

  it('judges a Horror d100 sheet in the shape before 1.7.0 as the server answers it, converted', async () => {
    await character(GameSystem.HORROR_D100, oldHorrorD100('v1.6.0-example'));
    const malformed = await character(GameSystem.HORROR_D100, oldHorrorD100('malformed'));

    const report = await validateCharacters(prisma, { where: mine() });

    expect(report.validCharacters).toBe(1);
    expect(report.issues.map((issue) => issue.characterId)).toEqual([malformed.id]);
  });

  it('reads --system in the spelling the help gives, and in short', () => {
    expect(parseValidateArgs(['--system', 'FIFTH_EDITION'])).toMatchObject({ gameSystem: 'FIFTH_EDITION' });
    expect(parseValidateArgs(['--system', 'fifthedition'])).toMatchObject({ gameSystem: 'FIFTH_EDITION' });
    expect(parseValidateArgs(['--verbose', '--system', 'fantasy_d20'])).toMatchObject({
      gameSystem: 'FANTASY_D20',
      verbose: true,
    });
    expect(parseValidateArgs([])).not.toHaveProperty('gameSystem');
  });

  it('refuses an unknown flag, an unknown system and a missing system', () => {
    expect(parseValidateArgs(['--verbos'])).toHaveProperty('error');
    expect(parseValidateArgs(['--system', 'not_a_system'])).toHaveProperty('error');
    expect(parseValidateArgs(['--system'])).toHaveProperty('error');
  });

  it('runs with the documented --system example and exits 1 when a character is invalid', async () => {
    const refused = await character(GameSystem.FIFTH_EDITION, { ...blankFifthEdition(), level: 25 });

    const run = runScript('validate-characters.ts', ['--system', 'fifthedition', '--verbose']);

    expect(run.output).toContain('Filtering: FIFTH_EDITION');
    expect(run.output).toContain(refused.id);
    expect(run.status).toBe(1);
  });

  it('exits 1 on a mistyped flag', () => {
    const run = runScript('validate-characters.ts', ['--verbos']);
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/--verbos/);
  });

  it('exits 1 when it cannot reach the database', () => {
    expect(runScript('validate-characters.ts', [], UNREACHABLE).status).toBe(1);
  });
});

describe('validate:characters --export', () => {
  const report: ValidationReport = {
    totalCharacters: 0,
    validCharacters: 0,
    invalidCharacters: 0,
    noGameSystem: 0,
    systemBreakdown: {},
    issues: [],
  };
  let scratch: string;
  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-validate-export-'));
  });
  afterEach(() => {
    fs.chmodSync(scratch, 0o700);
    fs.rmSync(scratch, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('writes the report where it is asked to, and says where', () => {
    const target = path.join(scratch, 'validation-report.json');
    expect(exportValidationIssues(report, target)).toBe(target);
    expect(JSON.parse(fs.readFileSync(target, 'utf8')).summary.total).toBe(0);
  });

  // Root may write to a folder whatever its mode, so the refusal below
  // cannot be set up for it.
  const asAnAccount = process.getuid?.() === 0 ? it.skip : it;
  asAnAccount('writes it to the temporary folder when the working folder cannot be written, as in the production image', () => {
    const readOnly = path.join(scratch, 'app');
    const tmp = path.join(scratch, 'tmp');
    fs.mkdirSync(readOnly);
    fs.mkdirSync(tmp);
    fs.chmodSync(readOnly, 0o500);
    jest.spyOn(os, 'tmpdir').mockReturnValue(tmp);

    const written = exportValidationIssues(report, path.join(readOnly, 'validation-report.json'));

    expect(written).toBe(path.join(tmp, 'validation-report.json'));
    expect(JSON.parse(fs.readFileSync(written, 'utf8')).issues).toEqual([]);
    expect(fs.readdirSync(readOnly)).toEqual([]);
  });
});

describe('migrate:characters', () => {
  // The 5E signature the script recognises with high confidence.
  const fifthEditionShape = { stats: { strength: { score: 10 }, dexterity: { score: 12 } }, proficiencyBonus: 2 };
  // Only a medium-confidence guess.
  const looseShape = { class: 'Wizard', level: 3, race: 'Elf', stats: {} };

  it('changes nothing unless told to', async () => {
    const { id } = await character(null, fifthEditionShape);

    await migrateCharacters(prisma, { dryRun: true, where: mine() });

    expect((await prisma.character.findUniqueOrThrow({ where: { id } })).gameSystem).toBeNull();
  });

  it('applies only a confident guess, and never in a Flexible campaign', async () => {
    const flexible = await createTestCampaign(userId, { gameSystem: null });
    const fifthEditionCampaign = await createTestCampaign(userId, { gameSystem: GameSystem.FIFTH_EDITION });
    const loose = await character(null, looseShape);
    const inFlexible = await character(null, fifthEditionShape, flexible.id);
    const inFifthEdition = await character(null, fifthEditionShape, fifthEditionCampaign.id);
    const alone = await character(null, fifthEditionShape);

    const report = await migrateCharacters(prisma, { dryRun: false, where: mine() });

    const systemOf = async (id: string) => (await prisma.character.findUniqueOrThrow({ where: { id } })).gameSystem;
    expect(await systemOf(loose.id)).toBeNull();
    expect(await systemOf(inFlexible.id)).toBeNull();
    expect(await systemOf(inFifthEdition.id)).toBe('FIFTH_EDITION');
    expect(await systemOf(alone.id)).toBe('FIFTH_EDITION');
    expect(report.changes.filter((c) => c.applied).map((c) => c.characterId).sort()).toEqual([inFifthEdition.id, alone.id].sort());

    await prisma.campaign.deleteMany({ where: { id: { in: [flexible.id, fifthEditionCampaign.id] } } });
  });

  // A guess is only ever a guess: the rebuilt sheet and a loose old one are
  // reported and left for a person, and the old sheet's own characteristics
  // (each a value with its half and fifth) are the one confident sign.
  it('tells a Horror d100 sheet in either shape, confidently only by the old sheet\'s characteristics', () => {
    const rebuilt = getBlankTemplate('HORROR_D100').data;
    expect(inferGameSystem(rebuilt)).toMatchObject({ system: 'HORROR_D100', confidence: 'medium' });
    expect(inferGameSystem(oldHorrorD100('v1.6.0-example'))).toMatchObject({ system: 'HORROR_D100', confidence: 'high' });
    const { characteristics: _kept, ...withoutNumbers } = oldHorrorD100('v1.6.0-example');
    expect(inferGameSystem({ ...withoutNumbers, characteristics: {} })).toMatchObject({ system: 'HORROR_D100', confidence: 'medium' });
    expect(inferGameSystem({ profession: 'Sailor' }).system).toBeNull();
    expect(inferGameSystem(getBlankTemplate('FIFTH_EDITION').data).system).toBe('FIFTH_EDITION');
    expect(inferGameSystem(getBlankTemplate('FANTASY_D20').data).system).toBe('FANTASY_D20');
  });

  it('gives a Horror d100 sheet from before game systems the rebuilt sheet with its system', async () => {
    const old = { ...oldHorrorD100('v1.6.0-example') };
    const { id } = await character(null, old);

    await migrateCharacters(prisma, { dryRun: false, where: mine() });

    const stored = await prisma.character.findUniqueOrThrow({ where: { id } });
    expect(stored.gameSystem).toBe('HORROR_D100');
    expect(stored.data).toMatchObject({ characterName: 'Dr. Ilse Varga', converted: { from: 1 } });
    expect(isOldHorrorD100Sheet(stored.data)).toBe(false);
  });

  it('exits 1 when it cannot reach the database', () => {
    expect(runScript('migrate-characters.ts', [], UNREACHABLE).status).toBe(1);
  });
});

describe('migrate:avatar-scope', () => {
  it('exits 1 when it cannot reach the database', () => {
    expect(runScript('migrate-avatar-scope.ts', [], UNREACHABLE).status).toBe(1);
  });
});
