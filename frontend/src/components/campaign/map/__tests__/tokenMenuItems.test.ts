/**
 * The token menu as data: which items a viewer is offered on a token, in
 * what order, how each looks and what each does. Pure, so each rule is
 * checked here alone; MapCanvasMenus.test.tsx checks the menu MapCanvas
 * draws from it.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import { CampaignRole, TokenLayer, TokenType, type Token } from '@/types';
import type { MenuCommand, MenuItem } from '@/components/ui/menu';
import { tokenMenuHasItems, tokenMenuItems, type TokenMenuActions, type TokenMenuContext } from '../tokenMenuItems';

function token(extra: Partial<Token> = {}): Token {
  return {
    id: 'tok-1', name: 'Goblin', imageUrl: '', characterId: null, position: { x: 2, y: 3 }, size: { width: 1, height: 1 },
    layer: TokenLayer.TOKEN, visible: true, type: TokenType.NPC, conditions: [], rotation: 0, controlledBy: null,
    metadata: {}, disposition: null, hp: null, showHpBar: false, initiative: null, ...extra,
  };
}

/** A spy that stands in for any of the actions. */
const spy = () => vi.fn<(...args: unknown[]) => void>();

function actions(): Record<keyof TokenMenuActions, Mock<(...args: unknown[]) => void>> {
  return {
    viewSheet: spy(), rollCharacter: spy(), rotate: spy(), rollCreature: spy(), edit: spy(),
    addToInitiative: spy(), duplicate: spy(), saveAsTemplate: spy(), setVisible: spy(), setObscured: spy(),
    setLayer: spy(), moveToMap: spy(), remove: spy(),
  };
}

function context(extra: Partial<TokenMenuContext> = {}): TokenMenuContext {
  return {
    role: CampaignRole.DM,
    mayViewSheet: false,
    mayRoll: false,
    mayRotate: true,
    mapId: 'map-a',
    maps: [{ id: 'map-a', name: 'Map A' }, { id: 'map-b', name: 'Map B' }, { id: 'map-c', name: 'Map C' }],
    busy: { crossing: false, moving: false },
    actions: actions(),
    ...extra,
  };
}

/** Each row as its label, a rule as ---. */
const labels = (items: MenuItem[]) => items.map((i) => (i.kind === 'separator' ? '---' : i.label));
const ids = (items: MenuItem[]) => items.map((i) => i.id);
function commandOf(items: MenuItem[], id: string): MenuCommand {
  const item = items.find((i) => i.id === id);
  if (!item || item.kind !== 'command') throw new Error(`no command ${id}`);
  return item;
}

const DM_ITEMS = [
  'Edit Token', 'Add to Initiative', 'Duplicate Token', 'Save as Template', 'Hide from Players', 'Obscure Identity',
  'Send to Spirit Realm', '---', 'Move to Map…', '---', 'Remove from Map',
];

describe('what a viewer who is not the DM is offered', () => {
  it.each([CampaignRole.PLAYER, CampaignRole.SPECTATOR, null])('as %s: the sheet, its rolls and the turns, as allowed', (role) => {
    const pc = token({ characterId: 'char-1', type: TokenType.PLAYER });
    expect(labels(tokenMenuItems(pc, context({ role, mayViewSheet: true, mayRoll: true, mayRotate: true }))))
      .toEqual(['View Character Sheet', 'Roll...', 'Rotate Left', 'Rotate Right']);
    expect(labels(tokenMenuItems(pc, context({ role, mayViewSheet: true, mayRoll: false, mayRotate: false }))))
      .toEqual(['View Character Sheet']);
    expect(tokenMenuItems(token(), context({ role, mayRotate: false }))).toEqual([]);
  });

  it('offers no sheet or roll for a token with no character, whatever the context says', () => {
    expect(labels(tokenMenuItems(token(), context({ role: CampaignRole.PLAYER, mayViewSheet: true, mayRoll: true, mayRotate: false }))))
      .toEqual([]);
  });
});

describe("the DM's items", () => {
  it('on a creature: the turns, its Roll..., then every DM item with the rules between', () => {
    const items = tokenMenuItems(token(), context());
    expect(labels(items)).toEqual(['Rotate Left', 'Rotate Right', 'Roll...', ...DM_ITEMS]);
    expect(ids(items)).toEqual([
      'rotate-left', 'rotate-right', 'roll-creature', 'edit', 'add-to-initiative', 'duplicate', 'save-as-template',
      'visibility', 'identity', 'plane', 'separator-moves', 'move-to-map', 'separator-remove', 'remove',
    ]);
  });

  it("on a character: its sheet and Roll... first, and no creature's Roll..., whatever the token's type", () => {
    for (const type of [TokenType.PLAYER, TokenType.NPC, undefined]) {
      const items = tokenMenuItems(token({ characterId: 'char-1', type }), context({ mayViewSheet: true, mayRoll: true }));
      expect(labels(items)).toEqual(['View Character Sheet', 'Roll...', 'Rotate Left', 'Rotate Right', ...DM_ITEMS]);
      expect(ids(items).slice(0, 2)).toEqual(['view-sheet', 'roll']);
    }
  });

  it('takes a token with no type for a creature, and for a player with a character', () => {
    expect(labels(tokenMenuItems(token({ type: undefined }), context()))).toContain('Roll...');
    expect(labels(tokenMenuItems(token({ type: undefined, characterId: 'gone' }), context()))).not.toContain('Roll...');
  });

  it('offers no Roll... for a player token or an object without a character', () => {
    for (const type of [TokenType.PLAYER, TokenType.OBJECT]) {
      expect(labels(tokenMenuItems(token({ type }), context()))).not.toContain('Roll...');
    }
  });

  it('keeps an object on its plane', () => {
    expect(labels(tokenMenuItems(token({ type: TokenType.OBJECT }), context())))
      .toEqual(['Rotate Left', 'Rotate Right', ...DM_ITEMS.filter((l) => l !== 'Send to Spirit Realm')]);
  });

  it('offers Add to Initiative only on a map', () => {
    expect(labels(tokenMenuItems(token(), context({ mapId: null })))).not.toContain('Add to Initiative');
  });

  it('names each switch by what it would do', () => {
    const items = tokenMenuItems(token({ visible: false, obscured: true, layer: TokenLayer.SPIRIT }), context());
    expect(labels(items)).toEqual(expect.arrayContaining(['Reveal to Players', 'Reveal Identity', 'Return to Material Plane']));
  });

  it('keeps the rule before the moves when there is no other map', () => {
    expect(labels(tokenMenuItems(token(), context({ maps: [{ id: 'map-a', name: 'Map A' }] }))).slice(-4))
      .toEqual(['Send to Spirit Realm', '---', '---', 'Remove from Map']);
  });

  it('leaves the DM items out for anyone else, even with every permission', () => {
    expect(labels(tokenMenuItems(token(), context({ role: CampaignRole.PLAYER })))).toEqual(['Rotate Left', 'Rotate Right']);
  });
});

describe('how the items look', () => {
  it('gives each its tone, Edit Token its weight and Rotate its tooltips, the rest plain', () => {
    const items = tokenMenuItems(token({ characterId: 'char-1' }), context({ mayViewSheet: true, mayRoll: true }));
    const looks = items.filter((i) => i.kind === 'command').map((i) => [i.label, i.tone ?? 'plain', i.strong ?? false, i.title ?? null]);
    expect(looks).toEqual([
      ['View Character Sheet', 'plain', false, null],
      ['Roll...', 'plain', false, null],
      ['Rotate Left', 'plain', false, 'Turn 45 degrees anticlockwise'],
      ['Rotate Right', 'plain', false, 'Turn 45 degrees clockwise'],
      ['Edit Token', 'brand', true, null],
      ['Add to Initiative', 'accent', false, null],
      ['Duplicate Token', 'plain', false, null],
      ['Save as Template', 'plain', false, null],
      ['Hide from Players', 'plain', false, null],
      ['Obscure Identity', 'plain', false, null],
      ['Send to Spirit Realm', 'spirit', false, null],
      ['Move to Map…', 'accent', false, null],
      ['Remove from Map', 'danger', false, null],
    ]);
  });

  it('gives the way back from the spirit realm the brand tone', () => {
    expect(commandOf(tokenMenuItems(token({ layer: TokenLayer.SPIRIT }), context()), 'plane').tone).toBe('brand');
  });

  it('keeps the menu open for the turns alone', () => {
    const items = tokenMenuItems(token({ characterId: 'char-1' }), context({ mayViewSheet: true, mayRoll: true }));
    expect(items.filter((i) => i.kind === 'command' && i.keepsOpen).map((i) => i.id)).toEqual(['rotate-left', 'rotate-right']);
  });
});

describe('the waits', () => {
  it('says Moving… on the crossing while one is on its way, and only then', () => {
    expect(commandOf(tokenMenuItems(token(), context()), 'plane').busy).toEqual({ active: false, label: 'Moving…' });
    expect(commandOf(tokenMenuItems(token(), context({ busy: { crossing: true, moving: false } })), 'plane').busy)
      .toEqual({ active: true, label: 'Moving…' });
  });

  it('says Moving… in place of the maps while a move is on its way', () => {
    expect(commandOf(tokenMenuItems(token(), context()), 'move-to-map').busy).toEqual({ active: false, label: 'Moving…' });
    expect(commandOf(tokenMenuItems(token(), context({ busy: { crossing: false, moving: true } })), 'move-to-map').busy)
      .toEqual({ active: true, label: 'Moving…' });
  });

  it('leaves every other item without a wait', () => {
    const items = tokenMenuItems(token({ characterId: 'char-1' }), context({ mayViewSheet: true, mayRoll: true }));
    expect(items.filter((i) => i.kind === 'command' && i.busy).map((i) => i.id)).toEqual(['plane', 'move-to-map']);
  });
});

describe('Move to Map…', () => {
  it('holds the other maps in the campaign’s order, each moving the token there', () => {
    const ctx = context();
    const move = commandOf(tokenMenuItems(token(), ctx), 'move-to-map');
    expect(move.run).toBeUndefined();
    expect(move.children?.map((c) => [c.id, c.label])).toEqual([['map:map-b', 'Map B'], ['map:map-c', 'Map C']]);

    move.children?.[1].run?.();
    expect(ctx.actions.moveToMap).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-1' }), 'map-c');
  });

  it('holds every map while no map is shown', () => {
    const move = commandOf(tokenMenuItems(token(), context({ mapId: null })), 'move-to-map');
    expect(move.children?.map((c) => c.label)).toEqual(['Map A', 'Map B', 'Map C']);
  });
});

describe('what each item does', () => {
  const goblin = token({ characterId: 'char-1', visible: true, obscured: false });

  it.each([
    ['view-sheet', 'viewSheet', []],
    ['roll', 'rollCharacter', []],
    ['rotate-left', 'rotate', [-45]],
    ['rotate-right', 'rotate', [45]],
    ['edit', 'edit', []],
    ['add-to-initiative', 'addToInitiative', ['map-a']],
    ['duplicate', 'duplicate', []],
    ['save-as-template', 'saveAsTemplate', []],
    ['visibility', 'setVisible', [false]],
    ['identity', 'setObscured', [true]],
    ['plane', 'setLayer', [TokenLayer.SPIRIT]],
    ['remove', 'remove', []],
  ] as const)('%s calls %s with the token and nothing else', (id, action, args) => {
    const ctx = context({ mayViewSheet: true, mayRoll: true });
    commandOf(tokenMenuItems(goblin, ctx), id).run?.();

    expect(ctx.actions[action]).toHaveBeenCalledTimes(1);
    expect(ctx.actions[action]).toHaveBeenCalledWith(goblin, ...args);
    const others = Object.entries(ctx.actions).filter(([name]) => name !== action);
    for (const [, fn] of others) expect(fn).not.toHaveBeenCalled();
  });

  it("rolls a creature's dice from a creature's Roll...", () => {
    const ctx = context();
    commandOf(tokenMenuItems(token(), ctx), 'roll-creature').run?.();
    expect(ctx.actions.rollCreature).toHaveBeenCalledWith(expect.objectContaining({ id: 'tok-1' }));
  });

  it('turns each switch back', () => {
    const ctx = context();
    const items = tokenMenuItems(token({ visible: false, obscured: true, layer: TokenLayer.SPIRIT }), ctx);
    for (const id of ['visibility', 'identity', 'plane']) commandOf(items, id).run?.();
    expect(ctx.actions.setVisible).toHaveBeenCalledWith(expect.anything(), true);
    expect(ctx.actions.setObscured).toHaveBeenCalledWith(expect.anything(), false);
    expect(ctx.actions.setLayer).toHaveBeenCalledWith(expect.anything(), TokenLayer.TOKEN);
  });

  it('does nothing while the list is built', () => {
    const ctx = context({ mayViewSheet: true, mayRoll: true });
    tokenMenuItems(token({ characterId: 'char-1' }), ctx);
    for (const fn of Object.values(ctx.actions)) expect(fn).not.toHaveBeenCalled();
  });
});

describe('whether there is a menu', () => {
  it('is whether the list has anything in it, for every viewer and token', () => {
    const tokens = [
      token(), token({ characterId: 'char-1' }), token({ type: TokenType.OBJECT }), token({ type: TokenType.PLAYER, characterId: 'char-1' }),
    ];
    for (const role of [CampaignRole.DM, CampaignRole.PLAYER, CampaignRole.SPECTATOR, null]) {
      for (const mayViewSheet of [false, true]) {
        for (const mayRoll of [false, true]) {
          for (const mayRotate of [false, true]) {
            for (const t of tokens) {
              const { actions: _actions, ...view } = context({ role, mayViewSheet, mayRoll, mayRotate });
              expect(tokenMenuHasItems(t, view)).toBe(tokenMenuItems(t, context({ role, mayViewSheet, mayRoll, mayRotate })).length > 0);
            }
          }
        }
      }
    }
  });

  it("is none for a player's creature or a paused player's own token with no character", () => {
    const { actions: _actions, ...view } = context({ role: CampaignRole.PLAYER, mayRotate: false });
    expect(tokenMenuHasItems(token(), view)).toBe(false);
    expect(tokenMenuHasItems(token({ characterId: 'char-1' }), { ...view, mayViewSheet: true })).toBe(true);
  });
});
