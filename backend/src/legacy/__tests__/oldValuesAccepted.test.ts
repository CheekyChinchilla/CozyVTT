/**
 * Each schema that takes a game system or the GM's value takes the one a
 * version before 1.7.0 used and gives back the new, and nothing else that
 * is no game system gets through with it. A stat block naming its system by
 * an old value is held to that system's bounds and rolls initiative as it
 * does, and the validate:characters command takes an old name on its
 * command line.
 */

import { GAME_SYSTEM_NOT_SUPPORTED } from '../../game-systems';
import { GameSystemSchema } from '../../validators/gameSystem';
import { ChatMessageSchema } from '../../validators/chat';
import { DrawingPreviewSchema, NewDrawingSchema, archiveShare } from '../../validators/drawings';
import { NpcStatBlockSchema } from '../../validators/statBlock';
import { resolveStatBlockInitiative } from '../../utils/rules/initiative';
import { parseValidateArgs } from '../../scripts/validate-characters';
import { RETIRED_GAME_SYSTEM } from '../retiredGameSystem';
import { LEGACY_GAME_SYSTEMS, LEGACY_GM } from '../gameSystemAliases';

const OLD = Object.entries(LEGACY_GAME_SYSTEMS);
const abilities = { str: 60, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
const line = { kind: 'line', color: '#3d8bd9', width: 4, points: [[10, 10], [200, 120]] };

describe('a game system', () => {
  it.each(OLD)('given as %s is read as %s', (old, now) => {
    expect(GameSystemSchema.parse(old)).toBe(now);
    expect(GameSystemSchema.parse(now)).toBe(now);
  });

  it.each([RETIRED_GAME_SYSTEM, 'dnd5e', 'fifth_edition', '', 5])('given as %p is refused in plain words', (value) => {
    const result = GameSystemSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(GAME_SYSTEM_NOT_SUPPORTED);
  });
});

describe('the GM\'s old value', () => {
  it('is read as GM in a chat message\'s type', () => {
    expect(ChatMessageSchema.parse({ content: 'Hi', type: LEGACY_GM }).type).toBe('GM');
  });

  it('is read as GM in a drawing\'s audience, added or previewed', () => {
    expect(NewDrawingSchema.parse({ ...line, audience: LEGACY_GM }).audience).toBe('GM');
    expect(DrawingPreviewSchema.parse({ previewId: 'old-tab', kind: 'line', color: '#3d8bd9', width: 4, audience: LEGACY_GM }).audience).toBe('GM');
  });

  it('is read as the GM\'s share in an archive\'s drawing', () => {
    expect(archiveShare({ share: LEGACY_GM }, 'ALL')).toBe('GM');
  });
});

describe('a stat block naming its system by an old value', () => {
  it.each(OLD)('naming %s is stored naming %s', (old, now) => {
    expect(NpcStatBlockSchema.parse({ ac: 12, speed: '30 ft.', abilities: { ...abilities, str: 11 }, gameSystem: old }).gameSystem).toBe(now);
  });

  it('is held to the bounds of the system it names: a Horror d100 creature keeps a characteristic of 60', () => {
    const [old] = OLD.find(([, now]) => now === 'HORROR_D100') ?? [''];
    expect(NpcStatBlockSchema.parse({ ac: 12, speed: '30 ft.', abilities, gameSystem: old }).abilities.str).toBe(60);
  });

  it('keeps a label no version wrote, as given', () => {
    expect(NpcStatBlockSchema.parse({ ac: 12, speed: '30 ft.', abilities: { ...abilities, str: 11 }, gameSystem: 'Homebrew' }).gameSystem).toBe('Homebrew');
  });

  it('rolls initiative with its DEX modifier at a 5E table', () => {
    const [old] = OLD.find(([, now]) => now === 'FIFTH_EDITION') ?? [''];
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { gameSystem: old, abilities })).toEqual({ kind: 'roll', expression: '1d20+2', label: '1d20+2' });
    expect(resolveStatBlockInitiative('FIFTH_EDITION', { gameSystem: 'HORROR_D100', abilities })).toBeNull();
  });
});

describe('validate:characters --system', () => {
  it.each(OLD)('takes %s, in any case and with or without its underscores, as %s', (old, now) => {
    for (const spelling of [old, old.toLowerCase(), old.replace(/_/g, '').toLowerCase()]) {
      expect(parseValidateArgs(['--system', spelling])).toMatchObject({ gameSystem: now });
    }
  });
});
