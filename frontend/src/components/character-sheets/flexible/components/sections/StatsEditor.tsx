/**
 * Stats Editor Component
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { StatsSection } from '../../../../../types/flexible-character-sheet';
import { calculateModifier, formatModifier, generateId } from '../../utils/section-helpers';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';

interface StatsEditorProps {
  section: StatsSection;
  onUpdate: (updates: Partial<StatsSection>) => void;
}

export const StatsEditor: React.FC<StatsEditorProps> = ({ section, onUpdate }) => {
  // TODO(sheets): the server keeps at most 200 stats in a section (FLEXIBLE_MAX_FIELDS) and this
  // has no limit, so one more makes a sheet that cannot be saved. Turn the
  // add button off at the limit, as the typed sheets' lists do with listIsFull
  // and ListLimitNote.
  const addField = () => {
    const newField = {
      id: generateId(),
      name: 'New Stat',
      value: 10,
      modifier: 0,
    };
    onUpdate({ fields: [...section.fields, newField] });
  };

  const removeField = (fieldId: string) => {
    onUpdate({ fields: section.fields.filter((f) => f.id !== fieldId) });
  };

  const updateField = (fieldId: string, updates: { name?: string; value?: number }) => {
    onUpdate({
      fields: section.fields.map((f) => {
        if (f.id === fieldId) {
          const newValue = updates.value !== undefined ? updates.value : f.value;
          return {
            ...f,
            ...updates,
            value: newValue,
            modifier: calculateModifier(newValue),
          };
        }
        return f;
      }),
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {section.fields.map((field) => (
          <div
            key={field.id}
            className="bg-parchment/30 border border-moss-green/20 rounded-lg p-3 relative group"
          >
            <button
              onClick={() => removeField(field.id)}
              className="absolute top-2 right-2 p-1 rounded-sm bg-danger/10 text-danger-ink opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/15"
              title="Remove stat"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField(field.id, { name: e.target.value })}
                maxLength={SHEET_NAME_MAX}
                className="w-full text-sm font-semibold bg-transparent border-b border-moss-green/30 focus:border-moss-green focus:outline-hidden text-brand-ink"
                placeholder="Stat name"
              />

              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  value={field.value}
                  onChange={(e) =>
                    updateField(field.id, { value: parseInt(e.target.value) || 0 })
                  }
                  className="w-20 text-2xl font-bold bg-transparent border-b border-moss-green/30 focus:border-moss-green focus:outline-hidden text-brand-ink"
                />
                <span className="text-lg text-stone-gray">
                  ({formatModifier(field.modifier || 0)})
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addField}
        className="flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-brand-ink rounded-lg hover:bg-moss-green/20 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Stat
      </button>
    </div>
  );
};
