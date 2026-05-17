/**
 * Text Display Component
 */

import React from 'react';
import type { TextSection } from '../../../../../types/flexible-character-sheet';

interface TextDisplayProps {
  section: TextSection;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({ section }) => {
  if (!section.value || section.value.trim() === '') {
    return (
      <div className="p-4 text-center text-stone-gray">
        No text content. Switch to edit mode to add content.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="bg-parchment/20 border border-moss-green/10 rounded-lg p-4">
        <pre className="whitespace-pre-wrap font-sans text-warm-gray leading-relaxed">
          {section.value}
        </pre>
      </div>
    </div>
  );
};
