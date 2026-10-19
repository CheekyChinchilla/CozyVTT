/**
 * List Editor Component
 */

import React from 'react';
import { Plus, Trash2, GripVertical, CheckSquare, Square } from 'lucide-react';
import { Reorder } from 'framer-motion';
import type { ListSection } from '../../../../../types/flexible-character-sheet';
import { generateId } from '../../utils/section-helpers';
import { SHEET_SHORT_TEXT_MAX } from '@/constants/sheetLimits';

interface ListEditorProps {
  section: ListSection;
  onUpdate: (updates: Partial<ListSection>) => void;
}

export const ListEditor: React.FC<ListEditorProps> = ({ section, onUpdate }) => {
  // TODO(sheets): the server keeps at most 1000 entries in a list section (FLEXIBLE_MAX_ROWS) and this
  // has no limit, so one more makes a sheet that cannot be saved. Turn the
  // add button off at the limit, as the typed sheets' lists do with listIsFull
  // and ListLimitNote.
  const addItem = () => {
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
            <Reorder.Item key={item.id} value={item}>
              <div className="flex items-center gap-2 p-2 bg-ink/5 border border-moss-green/20 rounded-lg group hover:bg-ink/10 transition-colors">
                <div className="shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-5 h-5 text-stone-gray" />
                </div>

                <button
                  onClick={() =>
                    updateItem(item.id, { checked: !item.checked })
                  }
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
                  className="flex-1 bg-transparent border-none focus:outline-hidden text-warm-gray"
                  placeholder="Enter item text..."
                />

                <button
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 p-1 rounded-sm bg-danger/10 text-danger-ink opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/15"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="text-center py-4 text-stone-gray">
          No items yet. Click "Add Item" to get started.
        </div>
      )}

      <button
        onClick={addItem}
        className="flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-brand-ink rounded-lg hover:bg-moss-green/20 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Item
      </button>
    </div>
  );
};
