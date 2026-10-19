/**
 * The Call of Cthulhu read-only sheet works an investigator's derived
 * attributes out from the characteristics, as the editor does.
 *
 * It printed what was last stored, so an investigator the editor had not
 * saved since (one made from a built-in template, or imported) showed hit
 * points, a major wound threshold, halves and the rest that its own
 * characteristics do not give.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallOfCthulhu7eCharacterView } from '../CallOfCthulhu7eCharacterView';
import { COC_BLANK_SHEET, cocCharacter } from './cocFixture';

const characteristics = COC_BLANK_SHEET.characteristics as Record<string, unknown>;
const derivedStats = COC_BLANK_SHEET.derivedStats as Record<string, unknown>;

/** CON 60, SIZ 65, STR 80, POW 70, stored with the numbers 1.5.3's template had. */
function stale() {
  return cocCharacter({
    characteristics: {
      ...characteristics,
      STR: { regular: 80, half: 40, fifth: 16 },
      CON: { regular: 60, half: 30, fifth: 12 },
      SIZ: { regular: 65, half: 33, fifth: 13 },
      POW: { regular: 70, half: 35, fifth: 14 },
    },
    derivedStats: {
      ...derivedStats,
      hp: { maximum: 13, current: 13, formula: '(CON+SIZ)/10', majorWoundThreshold: 1 },
      magicPoints: { maximum: 10, current: 10, formula: 'POW/5' },
      damageBonus: '0',
      build: 0,
    },
  });
}

describe('the read-only sheet', () => {
  it('works out hit points and the major wound threshold', () => {
    render(<CallOfCthulhu7eCharacterView character={stale()} />);
    // CON 60 + SIZ 65: 12 hit points, a major wound at 6.
    expect(screen.getByText('/ 12', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Major Wound: 6 HP')).toBeInTheDocument();
  });

  it('works out magic points, damage bonus and build', () => {
    render(<CallOfCthulhu7eCharacterView character={stale()} />);
    // POW 70: 14 magic points. STR 80 + SIZ 65 = 145: +1D4, build 1.
    expect(screen.getByText('/ 14', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('+1d4')).toBeInTheDocument();
  });

  it('works out each characteristic\'s half', () => {
    render(<CallOfCthulhu7eCharacterView character={stale()} />);
    // SIZ 65 halves to 32, where 33 was stored.
    expect(screen.queryByText('33')).toBeNull();
  });
});
