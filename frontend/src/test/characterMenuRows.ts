/**
 * The character menu open now (the roster's and the initiative tracker's,
 * `CharacterContextMenu`), a row a line, for the tests that pin what it
 * shows: `[icon] Label`, and how the item looks after it when it is not the
 * plain item. An item with any other classes, markup or attributes fails the
 * test, so a change to how the menu is built shows as a change.
 */

const MENU = 'fixed z-50 bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl py-2 min-w-[200px] pointer-coarse:max-h-[calc(100dvh-1rem)] pointer-coarse:overflow-y-auto pointer-coarse:overscroll-contain';
const ITEM = 'w-full flex items-center gap-3 px-4 py-2 pointer-coarse:min-h-11 text-sm hover:bg-moss-green/10 transition-colors';
const LOOKS: Record<string, string> = {
  [`${ITEM} text-stone-gray`]: '',
  [`${ITEM} text-danger-ink hover:bg-danger/10`]: ' (danger)',
};

/** The open character menu, or null. */
export function openCharacterMenu(): HTMLElement | null {
  const menus = Array.from(document.querySelectorAll<HTMLElement>('div.fixed.z-50')).filter((m) => m.className === MENU);
  if (menus.length > 1) throw new Error(`${menus.length} character menus open`);
  return menus[0] ?? null;
}

export function characterMenuRows(): string[] {
  const menu = openCharacterMenu();
  if (!menu) throw new Error('no character menu open');
  return Array.from(menu.children).map((row) => {
    if (!(row instanceof HTMLButtonElement)) throw new Error(`an unknown row: ${row.outerHTML}`);
    const attributes = Array.from(row.attributes).map((a) => a.name);
    if (attributes.join() !== 'class') throw new Error(`"${row.textContent}" carries ${attributes.join(', ')}`);
    const look = LOOKS[row.className];
    if (look === undefined) throw new Error(`"${row.textContent}" looks unlike any item: ${row.className}`);
    const [icon, label, ...rest] = Array.from(row.children);
    if (rest.length > 0 || !(label instanceof HTMLSpanElement) || label.attributes.length > 0) {
      throw new Error(`"${row.textContent}" is laid out unlike an item: ${row.innerHTML}`);
    }
    const name = /^lucide lucide-([a-z0-9-]+)(?: lucide-[a-z0-9-]+)* w-4 h-4$/.exec(icon?.getAttribute('class') ?? '')?.[1];
    if (icon?.tagName.toLowerCase() !== 'svg' || !name) throw new Error(`"${row.textContent}" has no icon as an item has: ${icon?.outerHTML}`);
    return `[${name}] ${label.textContent}${look}`;
  });
}
