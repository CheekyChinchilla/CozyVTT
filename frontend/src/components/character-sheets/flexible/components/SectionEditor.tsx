/**
 * Section Editor Wrapper Component
 */

import React from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import type { FlexibleSection } from '../../../../types/flexible-character-sheet';
import { SHEET_NAME_MAX } from '@/constants/sheetLimits';
import type { DragGrip } from './DragEntry';

interface SectionEditorProps {
  section: FlexibleSection;
  onUpdate: (updates: Partial<FlexibleSection>) => void;
  onRemove: () => void;
  /** The grip a finger drags the section by (DragEntry). */
  grip: DragGrip;
  children: React.ReactNode;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  onUpdate,
  onRemove,
  grip,
  children,
}) => {
  const updateTitle = (title: string) => {
    onUpdate({ title });
  };

  return (
    <div className="bg-paper border border-ink/10 rounded-cozy shadow-lg overflow-hidden group">
      {/* Header with drag handle and delete */}
      <div className="flex items-center gap-3 p-3 border-b border-moss-green/20 bg-moss-green/5">
        <div
          data-drag-grip
          onPointerDown={grip.onPointerDown}
          className={`shrink-0 touch-target inline-flex items-center justify-center cursor-grab active:cursor-grabbing ${grip.className}`}
        >
          <GripVertical className="w-5 h-5 text-stone-gray" />
        </div>

        <input
          type="text"
          value={section.title}
          onChange={(e) => updateTitle(e.target.value)}
          maxLength={SHEET_NAME_MAX}
          className="min-w-0 flex-1 text-lg font-semibold bg-transparent border-b border-transparent focus:border-moss-green focus:outline-hidden text-brand-ink"
          placeholder="Section title"
        />

        <button
          onClick={onRemove}
          // Shown where nothing can hover, such as a phone, where a finger
          // never brings it up.
          // TODO(sheets): a keyboard reaches this button but never shows it; it wants
          // focus-visible:opacity-100, here and on the list, table and stat ones.
          className="shrink-0 touch-target inline-flex items-center justify-center p-2 rounded-sm bg-danger/10 text-danger-ink opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity hover:bg-danger/15"
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
