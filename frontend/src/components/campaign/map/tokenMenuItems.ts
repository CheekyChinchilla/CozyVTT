// ============================================
// The token menu as data: what a viewer is offered on a token, in order,
// with what each item does. The menu a right-click or a long-press opens on
// the map draws this list, and whether there is a menu at all is whether the
// list has anything in it, so the two cannot disagree.
//
// Pure: no React, no DOM. What a viewer may do is decided by the caller
// (utils/tokenCharacter, MapCanvas's move rule) and handed in.
// ============================================

import { CampaignRole, TokenLayer, TokenType, type Token } from '@/types';
import type { MenuAction, MenuItem } from '@/components/ui/menu';
import { dmTokenControls } from '@/utils/dmTokenMenu';
import { ROTATION_STEP } from '@/utils/tokenRotation';

/** What the menu's items do, each given the token the menu is open on. */
export interface TokenMenuActions {
  viewSheet: (token: Token) => void;
  /** Rolls from the token's character's sheet. */
  rollCharacter: (token: Token) => void;
  /** Turns the token by `step` degrees, clockwise when positive. */
  rotate: (token: Token, step: number) => void;
  /** The DM's rolls for a creature with no character. */
  rollCreature: (token: Token) => void;
  edit: (token: Token) => void;
  addToInitiative: (token: Token, mapId: string) => void;
  duplicate: (token: Token) => void;
  saveAsTemplate: (token: Token) => void;
  setVisible: (token: Token, visible: boolean) => void;
  setObscured: (token: Token, obscured: boolean) => void;
  setLayer: (token: Token, layer: TokenLayer) => void;
  moveToMap: (token: Token, mapId: string) => void;
  /** Asks first, through the same dialog as the Token Roster. */
  remove: (token: Token) => void;
}

/** The viewer, what they may do with this token, and the table around it. */
export interface TokenMenuView {
  /** The viewer's role in the campaign; null until it is known. */
  role: CampaignRole | null;
  /**
   * The token's character is one of this campaign's, which every member may
   * read (utils/tokenCharacter). A token keeps its character after the
   * character leaves, and then offers no sheet.
   */
  mayViewSheet: boolean;
  /** The viewer may roll from the token's character's sheet (utils/tokenCharacter). */
  mayRoll: boolean;
  /**
   * The viewer may turn the token, by the move rule: the DM any token at any
   * time, a player a token they control while the session is live.
   */
  mayRotate: boolean;
  /** The map on screen, or null while none is. */
  mapId: string | null;
  /** The campaign's maps, in its order; Move to Map… offers all but the one on screen. */
  maps: ReadonlyArray<{ id: string; name: string }>;
  /** A crossing between the planes, or a move to another map, is on its way. */
  busy: { crossing: boolean; moving: boolean };
}

/** What the token menu is built from: the view, and what its items do. */
export interface TokenMenuContext extends TokenMenuView {
  actions: TokenMenuActions;
}

/** A command the token menu offers. */
function command(
  id: string,
  label: string,
  run: () => void,
  extra: Pick<MenuAction, 'tone' | 'strong' | 'title' | 'keepsOpen' | 'busy'> = {},
): MenuAction {
  return { kind: 'command', id, label, run, ...extra };
}

export function tokenMenuItems(token: Token, ctx: TokenMenuContext): MenuItem[] {
  const act = ctx.actions;
  const items: MenuItem[] = [];

  // The character's sheet and rolls, by the same rules as the initiative
  // tracker's menu.
  if (token.characterId) {
    if (ctx.mayViewSheet) items.push(command('view-sheet', 'View Character Sheet', () => act.viewSheet(token)));
    if (ctx.mayRoll) items.push(command('roll', 'Roll...', () => act.rollCharacter(token)));
  }

  // The menu stays open so presses add up.
  if (ctx.mayRotate) {
    items.push(
      command('rotate-left', 'Rotate Left', () => act.rotate(token, -ROTATION_STEP), {
        title: `Turn ${ROTATION_STEP} degrees anticlockwise`, keepsOpen: true,
      }),
      command('rotate-right', 'Rotate Right', () => act.rotate(token, ROTATION_STEP), {
        title: `Turn ${ROTATION_STEP} degrees clockwise`, keepsOpen: true,
      }),
    );
  }

  if (ctx.role !== CampaignRole.DM) return items;

  const type = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
  const controls = dmTokenControls(type);

  // A creature's own rolls. The `characterId` check is what keeps a token
  // typed NPC and bound to a character (a companion, or a PC the DM re-typed)
  // from offering Roll... twice: it rolls from the sheet, above.
  if (type === TokenType.NPC && !token.characterId) {
    items.push(command('roll-creature', 'Roll...', () => act.rollCreature(token)));
  }

  // Every token type. The editor shows a player token its name, image,
  // darkvision and controller; the NPC-only sections stay hidden.
  items.push(command('edit', 'Edit Token', () => act.edit(token), { tone: 'brand', strong: true }));

  const { mapId } = ctx;
  if (mapId) items.push(command('add-to-initiative', 'Add to Initiative', () => act.addToInitiative(token, mapId), { tone: 'accent' }));

  items.push(
    command('duplicate', 'Duplicate Token', () => act.duplicate(token)),
    command('save-as-template', 'Save as Template', () => act.saveAsTemplate(token)),
  );

  if (controls.hide) {
    items.push(command('visibility', token.visible ? 'Hide from Players' : 'Reveal to Players', () => act.setVisible(token, !token.visible)));
  }
  if (controls.obscure) {
    items.push(command('identity', token.obscured ? 'Reveal Identity' : 'Obscure Identity', () => act.setObscured(token, !token.obscured)));
  }

  // Creatures cross planes; scenery does not.
  if (controls.crossPlanes) {
    const toSpirit = token.layer === TokenLayer.TOKEN;
    items.push(command(
      'plane',
      toSpirit ? 'Send to Spirit Realm' : 'Return to Material Plane',
      () => act.setLayer(token, toSpirit ? TokenLayer.SPIRIT : TokenLayer.TOKEN),
      { tone: toSpirit ? 'spirit' : 'brand', busy: { active: ctx.busy.crossing, label: 'Moving…' } },
    ));
  }

  // TODO(ui): with no other map to move to, this rule and the next stand
  // together above Remove from Map, a double line; this one belongs only
  // above Move to Map….
  items.push({ kind: 'separator', id: 'separator-moves' });
  const otherMaps = ctx.maps.filter((m) => m.id !== mapId);
  if (otherMaps.length > 0) {
    items.push({
      kind: 'command',
      id: 'move-to-map',
      label: 'Move to Map…',
      tone: 'accent',
      busy: { active: ctx.busy.moving, label: 'Moving…' },
      children: otherMaps.map((m) => ({ id: `map:${m.id}`, label: m.name, run: () => act.moveToMap(token, m.id) })),
    });
  }
  items.push({ kind: 'separator', id: 'separator-remove' });

  items.push(command('remove', 'Remove from Map', () => act.remove(token), { tone: 'danger' }));
  return items;
}

/** Actions that do nothing, for asking what the menu holds without opening it. */
const NO_ACTIONS: TokenMenuActions = {
  viewSheet: () => undefined, rollCharacter: () => undefined, rotate: () => undefined, rollCreature: () => undefined,
  edit: () => undefined, addToInitiative: () => undefined, duplicate: () => undefined, saveAsTemplate: () => undefined,
  setVisible: () => undefined, setObscured: () => undefined, setLayer: () => undefined, moveToMap: () => undefined,
  remove: () => undefined,
};

/**
 * Whether the token menu offers this viewer anything on this token: whether
 * its list has anything in it. A right-click, a long-press and Enter ask
 * this before opening it, so none opens an empty menu or misses one.
 */
export function tokenMenuHasItems(token: Token, view: TokenMenuView): boolean {
  return tokenMenuItems(token, { ...view, actions: NO_ACTIONS }).length > 0;
}
