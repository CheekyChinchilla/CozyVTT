import { validateTokenShapes } from '../tokens';

/**
 * Every field a token carries is checked, not only the JSON-valued ones.
 *
 * The map routes hand-checked a few fields and stored the rest as sent: a
 * player's `position` kept whatever keys arrived beside x and y, `rotation`
 * took any JSON value, and the DM's `visible`, `showHpBar`, `initiative`,
 * `controlledBy` and `characterId` were never typed at all. Whatever was
 * stored then went to every member on each map fetch.
 */
const USER = '5d0d4c6e-7c2b-4f7e-9a1a-3f2c1b0a9e8d';

const ok = (body: Record<string, unknown>) => {
  const result = validateTokenShapes(body);
  if (!result.ok) throw new Error(result.message);
  return result.value;
};
const refused = (body: Record<string, unknown>) => {
  const result = validateTokenShapes(body);
  return result.ok ? null : result.message;
};

describe('validateTokenShapes', () => {
  describe('position', () => {
    it('is rebuilt from x and y, so nothing sent alongside them is stored', () => {
      expect(ok({ position: { x: 1, y: 2, junk: 'x'.repeat(2000), nested: { a: [1] } } }).position).toEqual({ x: 1, y: 2 });
    });

    it.each([
      [{ x: '1', y: 2 }],
      [{ x: 1 }],
      [[1, 2]],
      ['1,2'],
      [null],
      // Whole squares only: the client always sends them, and other clients
      // draw a fractional one misaligned.
      [{ x: 5.5, y: 3 }],
      [{ x: 1, y: 0.25 }],
    ])('refuses %j', (position) => {
      expect(refused({ position })).toMatch(/position/);
    });
  });

  describe('rotation', () => {
    it.each([0, 90, 360])('accepts %d degrees', (rotation) => {
      expect(ok({ rotation }).rotation).toBe(rotation);
    });

    it.each([[-1], [361], ['north'], [{ evil: 'x' }], [null]])('refuses %j', (rotation) => {
      expect(refused({ rotation })).toMatch(/rotation/);
    });
  });

  describe('booleans', () => {
    it('accepts true and false for visible and showHpBar', () => {
      expect(ok({ visible: false, showHpBar: true })).toMatchObject({ visible: false, showHpBar: true });
    });

    // 'false' is the case that matters: a truthy string stored as `visible`
    // showed players a token the DM believed hidden.
    it.each([['visible', 'false'], ['visible', 1], ['showHpBar', 'no'], ['showHpBar', null]])(
      'refuses %s = %j', (field, value) => {
        expect(refused({ [field]: value })).toMatch(new RegExp(field));
      }
    );
  });

  describe('ids', () => {
    it.each(['controlledBy', 'characterId', 'creatureTemplateId'])('%s takes a UUID or null', (field) => {
      expect(ok({ [field]: USER })[field as 'controlledBy']).toBe(USER);
      expect(ok({ [field]: null })[field as 'controlledBy']).toBeNull();
    });

    it.each([
      ['controlledBy', { $ne: null }],
      ['characterId', ['x']],
      ['creatureTemplateId', 'not-a-uuid'],
      ['controlledBy', ''],
    ])('refuses %s = %j', (field, value) => {
      expect(refused({ [field]: value })).toMatch(new RegExp(field));
    });
  });

  describe('initiative', () => {
    it('takes a number or null', () => {
      expect(ok({ initiative: 17 }).initiative).toBe(17);
      expect(ok({ initiative: null }).initiative).toBeNull();
    });

    it.each([['abc'], [{ value: 3 }], [[17]]])('refuses %j', (initiative) => {
      expect(refused({ initiative })).toMatch(/initiative/);
    });
  });

  describe('text', () => {
    it('takes a name, notes and an image address as strings', () => {
      expect(ok({ name: 'Goblin', notes: 'sneaky', imageUrl: '/api/assets/tokens/x' })).toMatchObject({
        name: 'Goblin', notes: 'sneaky', imageUrl: '/api/assets/tokens/x',
      });
    });

    it.each([
      ['an object', 'name', { evil: true }],
      ['201 characters', 'name', 'x'.repeat(201)],
      ['an array', 'notes', ['x']],
      ['5001 characters', 'notes', 'x'.repeat(5001)],
      ['an object', 'imageUrl', { src: 'x' }],
    ])('refuses %s as %s', (_what, field, value) => {
      expect(refused({ [field]: value })).toMatch(new RegExp(field));
    });
  });

  it('checks only what the payload carries', () => {
    expect(ok({})).toEqual({ hp: undefined, statBlock: undefined, sightRadius: undefined });
  });
});
