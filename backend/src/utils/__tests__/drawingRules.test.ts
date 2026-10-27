/**
 * Who may draw on a map, erase a drawing, and be sent one.
 *
 * The DM draws and erases anything at any time. A player draws while the
 * campaign's Players may draw is on, except while the session is paused or
 * has ended, which is the rule a player's token moves already follow; they
 * erase their own drawings only, at any time. A spectator does neither, not
 * even with a drawing of their own from before a demotion, and a former DM
 * may not erase the drawings for the DM alone they wrote while in the seat.
 * A drawing for the DM alone is sent to the DM alone. The rules are one file in each package,
 * so the draw tool offers what the server takes.
 */

import {
  canDraw, drawRefusal, canDrawOnLayer, canEraseDrawing, eraseRefusal, drawingSentTo, sessionLetsPlayersAct,
  DRAW_SPECTATOR_REFUSAL, DRAW_SETTING_REFUSAL, DRAW_PAUSED_REFUSAL, ERASE_SPECTATOR_REFUSAL, ERASE_OTHERS_REFUSAL,
} from '../drawingRules';
import * as permissions from '../../services/permissions';

const STATUSES = ['PREPARATION', 'ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'ARCHIVED'];
const live = (status: string) => status !== 'PAUSED' && status !== 'INACTIVE';

describe('canDraw', () => {
  it.each(STATUSES)('lets the DM draw while the campaign is %s, with players kept from drawing', (status) => {
    expect(canDraw('DM', { status, playersMayDraw: false })).toBe(true);
  });

  it.each(STATUSES)('lets a player draw while the campaign is %s only when the session lets them move', (status) => {
    expect(canDraw('PLAYER', { status, playersMayDraw: true })).toBe(live(status));
    expect(canDraw('PLAYER', { status, playersMayDraw: true })).toBe(permissions.canMoveTokensNow('PLAYER', status));
  });

  it('never lets a player draw with Players may draw off', () => {
    for (const status of STATUSES) expect(canDraw('PLAYER', { status, playersMayDraw: false })).toBe(false);
  });

  it.each([['SPECTATOR'], [undefined], ['dm'], ['ADMIN']])('never lets %s draw', (role) => {
    for (const status of STATUSES) expect(canDraw(role, { status, playersMayDraw: true })).toBe(false);
  });
});

describe('drawRefusal', () => {
  it('says why, one reason at a time', () => {
    expect(drawRefusal('SPECTATOR', { status: 'ACTIVE', playersMayDraw: true })).toBe(DRAW_SPECTATOR_REFUSAL);
    expect(drawRefusal('PLAYER', { status: 'PAUSED', playersMayDraw: false })).toBe(DRAW_SETTING_REFUSAL);
    expect(drawRefusal('PLAYER', { status: 'PAUSED', playersMayDraw: true })).toBe(DRAW_PAUSED_REFUSAL);
    expect(drawRefusal('PLAYER', { status: 'INACTIVE', playersMayDraw: true })).toBe(DRAW_PAUSED_REFUSAL);
  });

  it('words a pause as the move rule does', () => {
    expect(DRAW_PAUSED_REFUSAL).toBe(permissions.PAUSED_MOVE_REFUSAL.replace('move tokens', 'draw'));
  });
});

describe('canDrawOnLayer', () => {
  it('gives the ground layer to the DM alone, and the markup layer to anyone', () => {
    expect(canDrawOnLayer('DM', 'GROUND')).toBe(true);
    expect(canDrawOnLayer('DM', 'MARKUP')).toBe(true);
    expect(canDrawOnLayer('PLAYER', 'GROUND')).toBe(false);
    expect(canDrawOnLayer('PLAYER', 'MARKUP')).toBe(true);
  });
});

describe('canEraseDrawing', () => {
  const mine = { authorId: 'me', audience: 'ALL' };
  const theirs = { authorId: 'them', audience: 'ALL' };
  const orphan = { authorId: null, audience: 'ALL' };
  const mineForTheDm = { authorId: 'me', audience: 'DM' };

  it('lets the DM erase any drawing, one whose author is gone and one for the DM alone included', () => {
    for (const drawing of [mine, theirs, orphan, mineForTheDm]) expect(canEraseDrawing('DM', 'me', drawing)).toBe(true);
  });

  it('lets a player erase their own drawings and no one else\'s', () => {
    expect(canEraseDrawing('PLAYER', 'me', mine)).toBe(true);
    expect(canEraseDrawing('PLAYER', 'me', theirs)).toBe(false);
    expect(canEraseDrawing('PLAYER', 'me', orphan)).toBe(false);
    expect(canEraseDrawing('PLAYER', undefined, orphan)).toBe(false);
  });

  // A DM's notes for themselves go with the seat. One who has handed it
  // over, or had it taken, is a player who wrote drawings they are no longer
  // sent, and may not erase them.
  it('lets a player erase none of their own drawings that are for the DM alone', () => {
    expect(canEraseDrawing('PLAYER', 'me', mineForTheDm)).toBe(false);
  });

  it('erases only what drawingSentTo sends, for every role', () => {
    for (const role of ['DM', 'PLAYER', 'SPECTATOR', undefined]) {
      for (const drawing of [mine, theirs, orphan, mineForTheDm]) {
        if (canEraseDrawing(role, 'me', drawing)) expect(drawingSentTo(role, drawing)).toBe(true);
      }
    }
  });

  it('lets a spectator erase nothing, their own from before a demotion included', () => {
    expect(canEraseDrawing('SPECTATOR', 'me', mine)).toBe(false);
  });

  it('says why', () => {
    expect(eraseRefusal('PLAYER')).toBe(ERASE_OTHERS_REFUSAL);
    expect(eraseRefusal('SPECTATOR')).toBe(ERASE_SPECTATOR_REFUSAL);
  });
});

describe('drawingSentTo', () => {
  it('sends the DM every drawing and anyone else those for everyone', () => {
    expect(drawingSentTo('DM', { audience: 'DM' })).toBe(true);
    expect(drawingSentTo('DM', { audience: 'ALL' })).toBe(true);
    for (const role of ['PLAYER', 'SPECTATOR', undefined]) {
      expect(drawingSentTo(role, { audience: 'ALL' })).toBe(true);
      expect(drawingSentTo(role, { audience: 'DM' })).toBe(false);
    }
  });
});

describe('the session rule players act by', () => {
  it('is the one a player\'s token moves follow', () => {
    for (const status of STATUSES) expect(sessionLetsPlayersAct(status)).toBe(permissions.canMoveTokensNow('PLAYER', status));
  });

  it('is what services/permissions.ts gives the handlers', () => {
    expect(permissions.canDraw).toBe(canDraw);
    expect(permissions.canEraseDrawing).toBe(canEraseDrawing);
    expect(permissions.drawingSentTo).toBe(drawingSentTo);
    expect(permissions.canDrawOnLayer).toBe(canDrawOnLayer);
  });
});
