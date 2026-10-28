/**
 * Character Context Menu: the roster's and the initiative tracker's menu on
 * a character or a combatant, a popover at the pointer drawing the items it
 * is given (components/ui/menu.ts), each with its icon. It is drawn on the
 * body (components/ui/FloatingLayer.tsx), where the panel dividers beside
 * the party column and the rail cannot take the presses on its items.
 */

import { useEffect, useRef, useState } from 'react';
import { MENU_ROW_CLASSES, commandLook, type FlatMenuItem, type MenuAction } from '@/components/ui/menu';
import FloatingLayer from '@/components/ui/FloatingLayer';
import { menuOpened, menuShown } from '@/components/ui/openMenus';

interface CharacterContextMenuProps {
  x: number;
  y: number;
  /** What the menu offers, in order. With none, no menu is drawn. */
  items: FlatMenuItem[];
  onClose: () => void;
  /** Put the cursor on the first item: the menu was opened from the keyboard. */
  autoFocus?: boolean;
}

export default function CharacterContextMenu({
  x,
  y,
  items,
  onClose,
  autoFocus = false,
}: CharacterContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Start invisible; adjusted position set after measuring
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // On mount: measure menu and flip if it would overflow viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const adjustedX = x + rect.width > vw ? Math.max(0, x - rect.width) : x;
    const adjustedY = y + rect.height > vh ? Math.max(0, y - rect.height) : y;
    setPos({ x: adjustedX, y: adjustedY });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- measured once, as the menu opens at its point
  }, []);

  // Its opening closes the map's token or door menu, which a right-click or a
  // long-press here, sending no click, would leave open beside it. A menu
  // with no items is not drawn and closes nothing. Each opening mounts a new
  // menu: the roster and the tracker key it by opening. While it is drawn it
  // is a menu on the screen, so the tap on the map that closes it is not the
  // first of a double tap to ping.
  const drawn = items.length > 0;
  useEffect(() => {
    if (!drawn) return;
    menuOpened();
    return menuShown();
  }, [drawn]);

  // Once placed, and so visible: a hidden button cannot take the cursor.
  const placed = pos !== null;
  useEffect(() => {
    if (autoFocus && placed) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [autoFocus, placed]);

  // Close on click outside
  // TODO(play): a long-press on the map, or on another row, while this menu is open opens a second menu beside it:
  // its lift brings no mousedown here (map/clickSwallow.ts swallows iOS's, Android sends none). Close this menu when
  // another opens, as the map's menus do through whenMenuOpens, with each menu passing over its own opening.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Close on Escape, which is used up: the map hears keys after this and
  // would otherwise also put its tool away on the same press.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (items.length === 0) {
    return null;
  }

  /** A command's colour: its look, less the hover its own classes already hold for the plain tone. */
  const toneClass = (item: MenuAction): string => {
    const { text, hover, dims } = commandLook(item);
    const plain = (item.tone ?? 'plain') === 'plain';
    return `${plain ? text : `${text} ${hover}`}${dims ? ` ${dims}` : ''}`;
  };

  return (
    <FloatingLayer>
      <div
        ref={menuRef}
        // Never taller than the screen on a touch screen: with a finger's
        // 44-pixel items a long menu scrolls inside, where it would run off the
        // bottom. A mouse's menu fits, and keeps the sides of a keyboard's
        // focus ring, which a scrolling box would cut off.
        className="fixed z-50 bg-soft-cream border-2 border-moss-green/30 rounded-lg shadow-2xl py-2 min-w-[200px] pointer-coarse:max-h-[calc(100dvh-1rem)] pointer-coarse:overflow-y-auto pointer-coarse:overscroll-contain"
        style={{
          left: pos ? pos.x : x,
          top: pos ? pos.y : y,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {items.map((item) => {
          switch (item.kind) {
            case 'separator':
              return <div key={item.id} className={MENU_ROW_CLASSES.separator} />;
            case 'heading':
              return <p key={item.id} className={MENU_ROW_CLASSES.heading}>{item.label}</p>;
            case 'text':
              return <p key={item.id} className={MENU_ROW_CLASSES.text}>{item.label}</p>;
            case 'command': {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  title={item.title}
                  disabled={item.busy?.active}
                  onClick={() => {
                    item.run();
                    if (!item.keepsOpen) onClose();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2 pointer-coarse:min-h-11 text-sm hover:bg-moss-green/10 transition-colors ${toneClass(item)}`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  <span>{item.busy?.active ? item.busy.label : item.label}</span>
                </button>
              );
            }
          }
        })}
      </div>
    </FloatingLayer>
  );
}
