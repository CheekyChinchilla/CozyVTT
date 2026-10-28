import { MENU_ROW_CLASSES, commandLook, type MenuAction, type MenuCommand, type MenuItem, type SubmenuChoice } from '@/components/ui/menu';

/**
 * The rows of a menu opened on the map, the token menu and the door menu, as
 * the popover at the pointer draws them: a command a button, a submenu
 * opened in place under its command, a rule, a heading and a line of text.
 * The popover around them keeps its own placement, closing and focus; these
 * are its children, so a menu built as data draws as it always has.
 */
interface MapMenuRowsProps {
  items: MenuItem[];
  /** Closes the menu: called as a command is pressed, before it runs, unless it keeps the menu open. */
  onClose: () => void;
  /** The command whose submenu is open, by id. */
  openSubmenu?: string | null;
  onToggleSubmenu?: (id: string) => void;
}

const COMMAND = 'w-full px-4 py-2 pointer-coarse:min-h-11 text-left text-sm';
const SUBMENU = 'bg-parchment/80 border-t border-moss-green/10 px-2 py-1 space-y-0.5';
const SUBMENU_COMMAND = 'w-full px-2 py-1.5 pointer-coarse:min-h-11 text-left text-xs text-charcoal hover:bg-moss-green/10 rounded-sm transition-colors';

/** A command's classes: its look, and its submenu's. */
function commandClass(item: MenuCommand): string {
  const { text, hover, dims } = commandLook(item);
  const opens = item.children ? ' flex items-center justify-between' : '';
  return `${COMMAND} ${text} ${hover} transition-colors${dims ? ` ${dims}` : ''}${opens}`;
}

export default function MapMenuRows({ items, onClose, openSubmenu = null, onToggleSubmenu }: MapMenuRowsProps) {
  const press = (item: MenuAction | SubmenuChoice) => {
    if (!('keepsOpen' in item && item.keepsOpen)) onClose();
    item.run();
  };

  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'separator':
            return <div key={item.id} className={MENU_ROW_CLASSES.separator} />;
          case 'heading':
            return <p key={item.id} className={MENU_ROW_CLASSES.heading}>{item.label}</p>;
          case 'text':
            return <p key={item.id} className={MENU_ROW_CLASSES.text}>{item.label}</p>;
          case 'command': {
            if (!item.children) {
              return (
                <button key={item.id} className={commandClass(item)} title={item.title} disabled={item.busy?.active} onClick={() => press(item)}>
                  {item.busy?.active ? item.busy.label : item.label}
                </button>
              );
            }
            return (
              <div key={item.id}>
                <button
                  className={commandClass(item)}
                  title={item.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSubmenu?.(item.id);
                  }}
                >
                  <span>{item.label}</span>
                  <span className="text-xs opacity-60">▶</span>
                </button>
                {openSubmenu === item.id && (
                  <div className={SUBMENU}>
                    {item.busy?.active ? (
                      <p className="text-xs text-stone-gray px-2 py-1">{item.busy.label}</p>
                    ) : (
                      item.children.map((child) => (
                        <button key={child.id} className={SUBMENU_COMMAND} onClick={() => press(child)}>
                          {child.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          }
        }
      })}
    </>
  );
}
