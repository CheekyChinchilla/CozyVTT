/**
 * List Display Component
 */

import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import type { ListSection } from '../../../../../types/flexible-character-sheet';

interface ListDisplayProps {
  section: ListSection;
}

export const ListDisplay: React.FC<ListDisplayProps> = ({ section }) => {
  if (section.items.length === 0) {
    return (
      <div className="p-4 text-center text-stone-gray">
        No items in this list. Switch to edit mode to add items.
      </div>
    );
  }

  return (
    <div className="p-4">
      <ul className="space-y-2">
        {section.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 p-2 hover:bg-parchment/20 rounded transition-colors"
          >
            {item.checked !== undefined && (
              <div className="flex-shrink-0 mt-0.5">
                {item.checked ? (
                  <CheckCircle2 className="w-5 h-5 text-moss-green" />
                ) : (
                  <Circle className="w-5 h-5 text-stone-gray" />
                )}
              </div>
            )}
            <span className="text-warm-gray flex-1">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
