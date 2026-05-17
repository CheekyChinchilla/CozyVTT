/**
 * Text Editor Component
 */

import React, { useEffect, useRef } from 'react';
import type { TextSection } from '../../../../../types/flexible-character-sheet';

interface TextEditorProps {
  section: TextSection;
  onUpdate: (updates: Partial<TextSection>) => void;
}

export const TextEditor: React.FC<TextEditorProps> = ({ section, onUpdate }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [section.value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ value: e.target.value });
  };

  return (
    <div className="p-4">
      <textarea
        ref={textareaRef}
        value={section.value}
        onChange={handleChange}
        className="w-full min-h-[150px] p-4 bg-parchment/20 border border-moss-green/20 rounded-lg focus:border-moss-green focus:outline-none text-warm-gray resize-none"
        placeholder="Enter text content..."
      />
      <div className="mt-2 text-sm text-stone-gray text-right">
        {section.value.length} characters
      </div>
    </div>
  );
};
