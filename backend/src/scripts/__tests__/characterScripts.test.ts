/**
 * The validate:characters, migrate:characters and migrate:avatar-scope
 * scripts.
 *
 * validate:characters reported every character as valid, because it ignored
 * the validator's answer, and its documented `--system dnd5e` failed.
 * migrate:characters --execute stamped a game system on Flexible characters
 * from a guess. All three printed an error and exited 0 when they failed, so a
 * runbook could not tell.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import type { Prisma } from '@prisma/client';
import { prisma, createTestUser, createTestCampaign, cleanupUsers } from '../../__tests__/helpers/db';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';
import { validateCharacters, parseValidateArgs } from '../validate-characters';
import { migrateCharacters } from '../migrate-characters';

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

const blankDnd = () => getBlankTemplate(GameSystem.DND_5E).data as Record<string, unknown>;

describe('validate:characters', () => {
  it('reports a character the server would refuse as invalid', async () => {
    await character(GameSystem.DND_5E, blankDnd());
    const refused = await character(GameSystem.DND_5E, { ...blankDnd(), level: 25 });

    const report = await validateCharacters(prisma, { where: mine() });

    expect(report.validCharacters).toBe(1);
    expect(report.invalidCharacters).toBe(1);
    expect(report.issues.map((issue) => issue.characterId)).toEqual([refused.id]);
    expect(report.issues[0].errors.map((error) => error.path)).toContain('level');
  });

  it('judges a sheet from before 1.3.0 as a save would, with its older fields moved', async () => {
    // The flat proficiencies list is refused by today's schema unless it is
    // moved first, as the character routes do.
    await character(GameSystem.DND_5E, { ...blankDnd(), proficiencies: ['All armor'], languages: ['Common'] });

    const report = await validateCharacters(prisma, { where: mine() });

    expect(report.invalidCharacters).toBe(0);
    expect(report.validCharacters).toBe(1);
  });

  it('reads --system in the spelling the help gives, and in short', () => {
    expect(parseValidateArgs(['--system', 'DND_5E'])).toMatchObject({ gameSystem: 'DND_5E' });
    expect(parseValidateArgs(['--system', 'dnd5e'])).toMatchObject({ gameSystem: 'DND_5E' });
    expect(parseValidateArgs(['--verbose', '--system', 'pathfinder_2e'])).toMatchObject({
      gameSystem: 'PATHFINDER_2E',
      verbose: true,
    });
    expect(parseValidateArgs([])).not.toHaveProperty('gameSystem');
  });

  it('refuses an unknown flag, an unknown system and a missing system', () => {
    expect(parseValidateArgs(['--verbos'])).toHaveProperty('error');
    expect(parseValidateArgs(['--system', 'gurps'])).toHaveProperty('error');
    expect(parseValidateArgs(['--system'])).toHaveProperty('error');
  });

  it('runs with the documented --system example and exits 1 when a character is invalid', async () => {
    const refused = await character(GameSystem.DND_5E, { ...blankDnd(), level: 25 });

    const run = runScript('validate-characters.ts', ['--system', 'dnd5e', '--verbose']);

    expect(run.output).toContain('Filtering: DND_5E');
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

describe('migrate:characters', () => {
  // The D&D 5e signature the script recognises with high confidence.
  const dndShape = { stats: { strength: { score: 10 }, dexterity: { score: 12 } }, proficiencyBonus: 2 };
  // Only a medium-confidence guess.
  const looseShape = { class: 'Wizard', level: 3, race: 'Elf', stats: {} };

  it('changes nothing unless told to', async () => {
    const { id } = await character(null, dndShape);

    await migrateCharacters(prisma, { dryRun: true, where: mine() });

    expect((await prisma.character.findUniqueOrThrow({ where: { id } })).gameSystem).toBeNull();
  });

  it('applies only a confident guess, and never in a Flexible campaign', async () => {
    const flexible = await createTestCampaign(userId, { gameSystem: null });
    const dndCampaign = await createTestCampaign(userId, { gameSystem: GameSystem.DND_5E });
    const loose = await character(null, looseShape);
    const inFlexible = await character(null, dndShape, flexible.id);
    const inDnd = await character(null, dndShape, dndCampaign.id);
    const alone = await character(null, dndShape);

    const report = await migrateCharacters(prisma, { dryRun: false, where: mine() });

    const systemOf = async (id: string) => (await prisma.character.findUniqueOrThrow({ where: { id } })).gameSystem;
    expect(await systemOf(loose.id)).toBeNull();
    expect(await systemOf(inFlexible.id)).toBeNull();
    expect(await systemOf(inDnd.id)).toBe('DND_5E');
    expect(await systemOf(alone.id)).toBe('DND_5E');
    expect(report.changes.filter((c) => c.applied).map((c) => c.characterId).sort()).toEqual([inDnd.id, alone.id].sort());

    await prisma.campaign.deleteMany({ where: { id: { in: [flexible.id, dndCampaign.id] } } });
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
