/**
 * Who may draw on a map, erase a drawing, and be sent one.
 *
 * The GM draws and erases anything at any time. A player draws while the
 * campaign's Players may draw is on, except while the session is paused or
 * has ended, which is the rule a player's token moves already follow; they
 * erase their own drawings only, at any time. A spectator does neither, not
 * even with a drawing of their own from before a demotion, and a former GM
 * may not erase the drawings for the GM alone they wrote while in the seat.
 * A drawing for the GM alone is sent to the GM alone. The rules are one file in each package,
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
  it.each(STATUSES)('lets the GM draw while the campaign is %s, with players kept from drawing', (status) => {
    expect(canDraw('GM', { status, playersMayDraw: false })).toBe(true);
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
  it('gives the ground layer to the GM alone, and the markup layer to anyone', () => {
    expect(canDrawOnLayer('GM', 'GROUND')).toBe(true);
    expect(canDrawOnLayer('GM', 'MARKUP')).toBe(true);
    expect(canDrawOnLayer('PLAYER', 'GROUND')).toBe(false);
    expect(canDrawOnLayer('PLAYER', 'MARKUP')).toBe(true);
  });
});

describe('canEraseDrawing', () => {
  const mine = { authorId: 'me', audience: 'ALL' };
  const theirs = { authorId: 'them', audience: 'ALL' };
  const orphan = { authorId: null, audience: 'ALL' };
  const mineForTheGm = { authorId: 'me', audience: 'GM' };

  it('lets the GM erase any drawing, one whose author is gone and one for the GM alone included', () => {
    for (const drawing of [mine, theirs, orphan, mineForTheGm]) expect(canEraseDrawing('GM', 'me', drawing)).toBe(true);
  });

  it('lets a player erase their own drawings and no one else\'s', () => {
    expect(canEraseDrawing('PLAYER', 'me', mine)).toBe(true);
    expect(canEraseDrawing('PLAYER', 'me', theirs)).toBe(false);
    expect(canEraseDrawing('PLAYER', 'me', orphan)).toBe(false);
    expect(canEraseDrawing('PLAYER', undefined, orphan)).toBe(false);
  });

  // A GM's notes for themselves go with the seat. One who has handed it
  // over, or had it taken, is a player who wrote drawings they are no longer
  // sent, and may not erase them.
  it('lets a player erase none of their own drawings that are for the GM alone', () => {
    expect(canEraseDrawing('PLAYER', 'me', mineForTheGm)).toBe(false);
  });

  it('erases only what drawingSentTo sends, for every role', () => {
    for (const role of ['GM', 'PLAYER', 'SPECTATOR', undefined]) {
      for (const drawing of [mine, theirs, orphan, mineForTheGm]) {
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
  it('sends the GM every drawing and anyone else those for everyone', () => {
    expect(drawingSentTo('GM', { audience: 'GM' })).toBe(true);
    expect(drawingSentTo('GM', { audience: 'ALL' })).toBe(true);
    for (const role of ['PLAYER', 'SPECTATOR', undefined]) {
      expect(drawingSentTo(role, { audience: 'ALL' })).toBe(true);
      expect(drawingSentTo(role, { audience: 'GM' })).toBe(false);
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
