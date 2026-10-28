import type { LucideIcon } from 'lucide-react';

/**
 * A menu as data: the rows a menu shows, in order, with what each does. One
 * shape for every menu (the map's token and door menus, the roster's and the
 * initiative tracker's character menu), so a menu's builder decides what it
 * offers once and any container draws it: a popover at the pointer, or a
 * list of rows on a phone.
 */
export type MenuItem = MenuCommand | MenuSeparator | MenuHeading | MenuText;

/** How a command is coloured; plain is the menu's ordinary text. */
export type MenuTone = 'plain' | 'brand' | 'accent' | 'spirit' | 'danger';

/** What every command carries, whatever pressing it does. */
export interface MenuCommandBase {
  kind: 'command';
  /** Unique within its list: the row's key. */
  id: string;
  label: string;
  /** Plain when left out. */
  tone?: MenuTone;
  /** Drawn heavier: the item most often wanted. */
  strong?: boolean;
  /** Drawn before the label, in a menu that shows icons. */
  icon?: LucideIcon;
  /** A tooltip. */
  title?: string;
  /**
   * For a command whose work takes a moment. While `active` an action shows
   * `label` in its own label's place and cannot be pressed, and a submenu
   * shows `label` in place of its choices.
   */
  busy?: { active: boolean; label: string };
}

/** A command that does something when pressed. */
export interface MenuAction extends MenuCommandBase {
  run: () => void;
  /** Pressing it leaves the menu open, so presses add up. Every other action closes it. */
  keepsOpen?: boolean;
  children?: never;
}

/** A command that opens and closes a submenu when pressed, and does nothing itself. */
export interface MenuSubmenu extends MenuCommandBase {
  children: SubmenuChoice[];
  run?: never;
  keepsOpen?: never;
}

/** A row that does something when pressed, or opens a submenu: always one of the two. */
export type MenuCommand = MenuAction | MenuSubmenu;

/** One choice in a submenu, as the popover draws it. Pressing it closes the menu. */
export interface SubmenuChoice {
  /** Unique within its submenu: the row's key. */
  id: string;
  label: string;
  run: () => void;
}

/** A rule between groups of rows. */
export interface MenuSeparator {
  kind: 'separator';
  id: string;
}

/** A line naming what the menu is about, above its commands. */
export interface MenuHeading {
  kind: 'heading';
  id: string;
  label: string;
}

/** A line of text that is not a command. */
export interface MenuText {
  kind: 'text';
  id: string;
  label: string;
}

/** Each tone's text colour, and the background it takes under the pointer. */
export const MENU_TONES: Record<MenuTone, { text: string; hover: string }> = {
  plain: { text: 'text-stone-gray', hover: 'hover:bg-moss-green/10' },
  brand: { text: 'text-brand-ink', hover: 'hover:bg-moss-green/10' },
  accent: { text: 'text-accent-ink', hover: 'hover:bg-warm-amber/10' },
  spirit: { text: 'text-spirit-ink', hover: 'hover:bg-spirit-purple/10' },
  danger: { text: 'text-danger-ink', hover: 'hover:bg-danger/10' },
};

/**
 * A command's look by its tone, the one rule both popovers lay out in their
 * own order: the tone's text colour (with `font-medium` for a strong
 * command), the background it takes under the pointer, and
 * `disabled:opacity-50` for an action that can be busy, which dims while it
 * is; a submenu never dims.
 */
export function commandLook(item: MenuCommand): { text: string; hover: string; dims: string } {
  const { text, hover } = MENU_TONES[item.tone ?? 'plain'];
  return {
    text: item.strong ? `${text} font-medium` : text,
    hover,
    dims: item.busy && !item.children ? 'disabled:opacity-50' : '',
  };
}
