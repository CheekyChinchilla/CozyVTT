/**
 * FeatsList Component
 *
 * Displays feats organized by category (Ancestry, Class, Skill, General, Bonus).
 * Pathfinder 2e grants feats at specific levels based on feat type.
 */

import React from 'react';
import { Award, Star, Zap, Circle, Gift } from 'lucide-react';
import type { PF2eFeat } from '@/types/game-systems';

/** The sheet's own feat type, so this list reads the fields the editor writes. */
export type Feat = PF2eFeat;

export interface FeatsData {
  ancestryAndHeritage?: Feat[];
  class?: Feat[];
  skill?: Feat[];
  general?: Feat[];
  bonus?: Feat[];
}

interface FeatsListProps {
  feats: FeatsData;
}

const FEAT_CATEGORIES: Array<{
  key: keyof FeatsData;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}> = [
  {
    key: 'ancestryAndHeritage',
    label: 'Ancestry & Heritage',
    icon: Star,
    color: 'text-spirit-ink',
    bgColor: 'bg-spirit/10 border-spirit/30',
    description: 'Feats from ancestry and heritage choices',
  },
  {
    key: 'class',
    label: 'Class Feats',
    icon: Award,
    color: 'text-info-ink',
    bgColor: 'bg-info/10 border-info/30',
    description: 'Class-specific feats and abilities',
  },
  {
    key: 'skill',
    label: 'Skill Feats',
    icon: Zap,
    color: 'text-success-ink',
    bgColor: 'bg-success/10 border-success/30',
    description: 'Feats that enhance skills',
  },
  {
    key: 'general',
    label: 'General Feats',
    icon: Circle,
    color: 'text-ink-secondary',
    bgColor: 'bg-ink/5 border-ink/10',
    description: 'General feats available to all characters',
  },
  {
    key: 'bonus',
    label: 'Bonus Feats',
    icon: Gift,
    color: 'text-warning-ink',
    bgColor: 'bg-warning/10 border-warning/30',
    description: 'Bonus feats from class or ancestry',
  },
];

export const FeatsList: React.FC<FeatsListProps> = ({ feats }) => {
  return (
    <div className="space-y-6">
      {FEAT_CATEGORIES.map((category) => {
        const categoryFeats = feats[category.key] || [];

        if (categoryFeats.length === 0) return null;

        const Icon = category.icon;

        return (
          <div key={category.key} className={`${category.bgColor} border-2 rounded-lg p-4`}>
            {/* Category Header */}
            <div className="flex items-center space-x-2 mb-3">
              <Icon className={`w-5 h-5 ${category.color}`} />
              <h4 className={`font-bold ${category.color} text-lg`}>{category.label}</h4>
              <span className="text-xs text-ink-muted">({categoryFeats.length})</span>
            </div>

            {/* Feats by level, sorted as a copy so the character's own list
                is left as it was; a feat with no level (the schema allows it)
                comes first. */}
            <div className="space-y-2">
              {[...categoryFeats]
                .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
                .map((feat, index) => (
                  <div
                    key={`${feat.name}-${index}`}
                    className="bg-paper border border-ink/10 rounded-lg p-3 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-semibold text-ink">{feat.name}</span>
                          {feat.level != null && (
                            <span className="px-2 py-0.5 bg-ink/10 text-ink-secondary text-xs rounded-full font-medium">
                              Level {feat.level}
                            </span>
                          )}
                        </div>
                        {/* The editor's box writes `description`; the
                            built-in templates wrote `notes`. Either may be
                            present, so both are shown. */}
                        {feat.description && (
                          <p className="text-sm text-ink-secondary mt-1 whitespace-pre-line">{feat.description}</p>
                        )}
                        {feat.notes && feat.notes !== feat.description && (
                          <p className="text-sm text-ink-secondary mt-1">{feat.notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        );
      })}

      {/* Empty State */}
      {Object.values(feats).every(arr => !arr || arr.length === 0) && (
        <div className="text-center py-8 text-ink-muted italic">
          No feats recorded yet
        </div>
      )}
    </div>
  );
};

export default FeatsList;
