/**
 * Stats Editor Component
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { StatsSection } from '../../../../../types/flexible-character-sheet';
import { calculateModifier, formatModifier, generateId } from '../../utils/section-helpers';

interface StatsEditorProps {
  section: StatsSection;
  onUpdate: (updates: Partial<StatsSection>) => void;
}

export const StatsEditor: React.FC<StatsEditorProps> = ({ section, onUpdate }) => {
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
              className="absolute top-2 right-2 p-1 rounded bg-red-50 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
              title="Remove stat"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <input
                type="text"
                value={field.name}
                onChange={(e) => updateField(field.id, { name: e.target.value })}
                className="w-full text-sm font-semibold bg-transparent border-b border-moss-green/30 focus:border-moss-green focus:outline-none text-moss-green"
                placeholder="Stat name"
              />

              <div className="flex items-baseline gap-2">
                <input
                  type="number"
                  value={field.value}
                  onChange={(e) =>
                    updateField(field.id, { value: parseInt(e.target.value) || 0 })
                  }
                  className="w-20 text-2xl font-bold bg-transparent border-b border-moss-green/30 focus:border-moss-green focus:outline-none text-moss-green"
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
        className="flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-moss-green rounded-lg hover:bg-moss-green/20 transition-colors w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Stat
      </button>
    </div>
  );
};
