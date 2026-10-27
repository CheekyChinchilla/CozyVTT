/**
 * List Editor Component
 */

import React from 'react';
import { Plus, Trash2, GripVertical, CheckSquare, Square } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { DragEntry } from '../DragEntry';
import type { ListSection } from '../../../../../types/flexible-character-sheet';
import { generateId } from '../../utils/section-helpers';
import { FLEXIBLE_MAX_ROWS, SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';
import ListLimitNote, { ADD_BUTTON_OFF, listIsFull } from '../../../ListLimitNote';

interface ListEditorProps {
  section: ListSection;
  onUpdate: (updates: Partial<ListSection>) => void;
}

export const ListEditor: React.FC<ListEditorProps> = ({ section, onUpdate }) => {
  // The server keeps at most FLEXIBLE_MAX_ROWS entries in a list section, so
  // Add Item turns off there.
  const itemsFull = listIsFull(section.items, FLEXIBLE_MAX_ROWS);
  const addItem = () => {
    if (itemsFull) return;
    const newItem = {
      id: generateId(),
      text: '',
      checked: false,
    };
    onUpdate({ items: [...section.items, newItem] });
  };

  const removeItem = (itemId: string) => {
    onUpdate({ items: section.items.filter((i) => i.id !== itemId) });
  };

  const updateItem = (itemId: string, updates: { text?: string; checked?: boolean }) => {
    onUpdate({
      items: section.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)),
    });
  };

  const reorderItems = (newItems: typeof section.items) => {
    onUpdate({ items: newItems });
  };

  return (
    <div className="p-4 space-y-4">
      {section.items.length > 0 ? (
        <Reorder.Group axis="y" values={section.items} onReorder={reorderItems} className="space-y-2">
          {section.items.map((item) => (
            <DragEntry key={item.id} value={item}>
              {(grip) => (
                <div className="flex items-center gap-2 p-2 bg-ink/5 border border-moss-green/20 rounded-lg group hover:bg-ink/10 transition-colors">
                  <div
                    data-drag-grip
                    onPointerDown={grip.onPointerDown}
                    className={`shrink-0 touch-target inline-flex items-center justify-center cursor-grab active:cursor-grabbing ${grip.className}`}
                  >
                    <GripVertical className="w-5 h-5 text-stone-gray" />
                  </div>

                  <button
                    onClick={() =>
                      updateItem(item.id, { checked: !item.checked })
                    }
                    // TODO(sheets): this tick has no accessible name or state; it wants
                    // aria-label "Done" (or the entry's text) and aria-pressed.
                    className="shrink-0"
                  >
                    {item.checked ? (
                      <CheckSquare className="w-5 h-5 text-brand-ink" />
                    ) : (
                      <Square className="w-5 h-5 text-stone-gray" />
                  )}
                </button>

                <input
                  type="text"
                  value={item.text}
                  onChange={(e) => updateItem(item.id, { text: e.target.value })}
                  maxLength={SHEET_SHORT_TEXT_MAX}
                  className="min-w-0 flex-1 bg-transparent border-none focus:outline-hidden text-warm-gray"
                  placeholder="Enter item text..."
                />

                <button
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 touch-target inline-flex items-center justify-center p-1 rounded-sm bg-danger/10 text-danger-ink opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity hover:bg-danger/15"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              )}
            </DragEntry>
          ))}
        </Reorder.Group>
      ) : (
        <div className="text-center py-4 text-stone-gray">
          No items yet. Click "Add Item" to get started.
        </div>
      )}

      <button
        onClick={addItem}
        disabled={itemsFull}
        className={`flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-brand-ink rounded-lg hover:bg-moss-green/15 transition-colors w-full justify-center ${ADD_BUTTON_OFF}`}
      >
        <Plus className="w-4 h-4" />
        Add Item
      </button>
      <ListLimitNote full={itemsFull} max={FLEXIBLE_MAX_ROWS} />
    </div>
  );
};
