/**
 * Add Section Menu Component
 */

import React, { useEffect, useRef } from 'react';
import {
  Target,
  Package,
  Sparkles,
  Sword,
  BookOpen,
  FileText,
  Hash,
  List,
  Table,
} from 'lucide-react';
import type { SectionTemplate } from '../../../../types/flexible-character-sheet';
import { getCommonTemplates, getBlankTemplates } from '../utils/section-templates';

interface AddSectionMenuProps {
  onSelect: (template: SectionTemplate) => void;
  onClose: () => void;
}

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Target,
  Package,
  Sparkles,
  Sword,
  BookOpen,
  FileText,
  Hash,
  List,
  Table,
};

export const AddSectionMenu: React.FC<AddSectionMenuProps> = ({ onSelect, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const commonTemplates = getCommonTemplates();
  const blankTemplates = getBlankTemplates();

  const renderTemplate = (template: SectionTemplate) => {
    const Icon = ICON_MAP[template.icon] || FileText;

    return (
      <button
        key={template.id}
        onClick={() => onSelect(template)}
        className="w-full text-left p-3 hover:bg-moss-green/10 transition-colors rounded-lg group"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 p-2 rounded bg-moss-green/10 group-hover:bg-moss-green/20 transition-colors">
            <Icon className="w-5 h-5 text-moss-green" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-moss-green">{template.name}</div>
            <div className="text-sm text-stone-gray">{template.description}</div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div
      ref={menuRef}
      className="absolute z-50 mt-2 w-full max-w-md bg-paper border border-moss-green/30 rounded-lg shadow-lg max-h-96 overflow-y-auto"
    >
      <div className="p-2">
        <div className="px-3 py-2 text-xs font-semibold text-stone-gray uppercase tracking-wide">
          Common Templates
        </div>
        <div className="space-y-1">
          {commonTemplates.map(renderTemplate)}
        </div>

        <div className="my-2 border-t border-stone-gray/20"></div>

        <div className="px-3 py-2 text-xs font-semibold text-stone-gray uppercase tracking-wide">
          Blank Templates
        </div>
        <div className="space-y-1">
          {blankTemplates.map(renderTemplate)}
        </div>
      </div>
    </div>
  );
};
