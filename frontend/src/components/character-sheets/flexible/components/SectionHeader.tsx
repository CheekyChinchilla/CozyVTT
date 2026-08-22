/**
 * Section Header Component
 */

import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  isCollapsed?: boolean;
  onToggle?: () => void;
  showToggle?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  isCollapsed = false,
  onToggle,
  showToggle = true,
}) => {
  return (
    <div
      className={`flex items-center justify-between p-3 border-b border-moss-green/20 ${
        showToggle && onToggle ? 'cursor-pointer hover:bg-moss-green/5 transition-colors' : ''
      }`}
      onClick={showToggle && onToggle ? onToggle : undefined}
    >
      <h3 className="text-lg font-semibold text-brand-ink">{title}</h3>
      {showToggle && onToggle && (
        <button
          type="button"
          className="p-1 rounded hover:bg-moss-green/10 transition-colors"
          aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-brand-ink" />
          ) : (
            <ChevronUp className="w-5 h-5 text-brand-ink" />
          )}
        </button>
      )}
    </div>
  );
};
