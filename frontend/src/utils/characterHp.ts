/**
 * Character HP extraction utility
 * Extracts { current, max, temp } from character sheet data
 * in a game-system-aware way, since each system stores HP differently.
 */

export interface CharacterHpInfo {
  current: number;
  max: number;
  temp: number;
}

export function extractCharacterHp(
  gameSystem: string | null,
  data: Record<string, unknown> | null | undefined
): CharacterHpInfo | null {
  if (!data || !gameSystem) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;

  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E':
    case 'FLEXIBLE': {
      if (d.hp && typeof d.hp.maximum === 'number' && d.hp.maximum > 0) {
        return {
          current: typeof d.hp.current === 'number' ? d.hp.current : d.hp.maximum,
          max: d.hp.maximum,
          temp: typeof d.hp.temporary === 'number' ? d.hp.temporary : 0,
        };
      }
      return null;
    }
    case 'CALL_OF_CTHULHU_7E': {
      const hp = d.derivedStats?.hp;
      if (hp && typeof hp.maximum === 'number' && hp.maximum > 0) {
        return {
          current: typeof hp.current === 'number' ? hp.current : hp.maximum,
          max: hp.maximum,
          temp: 0,
        };
      }
      return null;
    }
    default:
      return null;
  }
}
