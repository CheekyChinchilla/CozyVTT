/**
 * Stats Display Component
 */

import React from 'react';
import type { StatsSection } from '../../../../../types/flexible-character-sheet';
import { formatModifier } from '../../utils/section-helpers';

interface StatsDisplayProps {
  section: StatsSection;
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ section }) => {
  if (section.fields.length === 0) {
    return (
      <div className="p-4 text-center text-stone-gray">
        No stats defined. Switch to edit mode to add stats.
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {section.fields.map((field) => (
          <div
            key={field.id}
            className="bg-parchment/30 border border-moss-green/20 rounded-lg p-3"
          >
            <div className="text-sm text-stone-gray mb-1">{field.name}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-ink">{field.value}</span>
              {field.modifier !== undefined && (
                <span className="text-lg text-stone-gray">
                  ({formatModifier(field.modifier)})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
