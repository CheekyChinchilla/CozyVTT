/**
 * Section Editor Wrapper Component
 */

import React from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import type { FlexibleSection } from '../../../../types/flexible-character-sheet';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';

interface SectionEditorProps {
  section: FlexibleSection;
  onUpdate: (updates: Partial<FlexibleSection>) => void;
  onRemove: () => void;
  children: React.ReactNode;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  onUpdate,
  onRemove,
  children,
}) => {
  const updateTitle = (title: string) => {
    onUpdate({ title });
  };

  return (
    <div className="glass-panel overflow-hidden group">
      {/* Header with drag handle and delete */}
      <div className="flex items-center gap-3 p-3 border-b border-moss-green/20 bg-moss-green/5">
        <div className="shrink-0 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-5 h-5 text-stone-gray" />
        </div>

        <input
          type="text"
          value={section.title}
          onChange={(e) => updateTitle(e.target.value)}
          maxLength={SHEET_NAME_MAX}
          className="flex-1 text-lg font-semibold bg-transparent border-b border-transparent focus:border-moss-green focus:outline-hidden text-brand-ink"
          placeholder="Section title"
        />

        <button
          onClick={onRemove}
          className="shrink-0 p-2 rounded-sm bg-danger/10 text-danger-ink opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/15"
          title="Remove section"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Section content */}
      <div>{children}</div>
    </div>
  );
};
