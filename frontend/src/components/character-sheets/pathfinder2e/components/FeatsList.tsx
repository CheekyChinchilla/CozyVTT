/**
 * FeatsList Component
 *
 * Displays feats organized by category (Ancestry, Class, Skill, General, Bonus).
 * Pathfinder 2e grants feats at specific levels based on feat type.
 */

import React from 'react';
import { Award, Star, Zap, Circle, Gift } from 'lucide-react';

export interface Feat {
  level: number;
  name: string;
  notes: string;
}

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
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    description: 'Feats from ancestry and heritage choices',
  },
  {
    key: 'class',
    label: 'Class Feats',
    icon: Award,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: 'Class-specific feats and abilities',
  },
  {
    key: 'skill',
    label: 'Skill Feats',
    icon: Zap,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    description: 'Feats that enhance skills',
  },
  {
    key: 'general',
    label: 'General Feats',
    icon: Circle,
    color: 'text-stone-600',
    bgColor: 'bg-stone-50',
    description: 'General feats available to all characters',
  },
  {
    key: 'bonus',
    label: 'Bonus Feats',
    icon: Gift,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
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
          <div key={category.key} className={`${category.bgColor} border-2 border-stone-200 rounded-lg p-4`}>
            {/* Category Header */}
            <div className="flex items-center space-x-2 mb-3">
              <Icon className={`w-5 h-5 ${category.color}`} />
              <h4 className={`font-bold ${category.color} text-lg`}>{category.label}</h4>
              <span className="text-xs text-stone-500">({categoryFeats.length})</span>
            </div>

            {/* Feats List */}
            <div className="space-y-2">
              {categoryFeats
                .sort((a, b) => a.level - b.level)
                .map((feat, index) => (
                  <div
                    key={`${feat.name}-${index}`}
                    className="bg-white border border-stone-200 rounded-lg p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-semibold text-stone-800">{feat.name}</span>
                          <span className="px-2 py-0.5 bg-stone-100 text-stone-600 text-xs rounded-full font-medium">
                            Level {feat.level}
                          </span>
                        </div>
                        {feat.notes && (
                          <p className="text-sm text-stone-600 mt-1">{feat.notes}</p>
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
        <div className="text-center py-8 text-stone-500 italic">
          No feats recorded yet
        </div>
      )}
    </div>
  );
};

export default FeatsList;
