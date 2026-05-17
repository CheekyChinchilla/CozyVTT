/**
 * ProficiencyIndicator Component
 *
 * Displays proficiency rank as a colored badge with abbreviation.
 * Pathfinder 2e uses 5 proficiency ranks: Untrained, Trained, Expert, Master, Legendary
 */

import React from 'react';

export type ProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

interface ProficiencyIndicatorProps {
  rank: ProficiencyRank;
  size?: 'sm' | 'md' | 'lg';
}

const PROFICIENCY_CONFIG: Record<ProficiencyRank, {
  label: string;
  abbr: string;
  color: string;
  bgColor: string;
  textColor: string;
}> = {
  untrained: {
    label: 'Untrained',
    abbr: 'U',
    color: 'stone-400',
    bgColor: 'bg-stone-100',
    textColor: 'text-stone-600',
  },
  trained: {
    label: 'Trained',
    abbr: 'T',
    color: 'blue-500',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
  },
  expert: {
    label: 'Expert',
    abbr: 'E',
    color: 'green-500',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
  },
  master: {
    label: 'Master',
    abbr: 'M',
    color: 'purple-500',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
  },
  legendary: {
    label: 'Legendary',
    abbr: 'L',
    color: 'amber-500',
    bgColor: 'bg-amber-100',
    textColor: 'text-amber-700',
  },
};

const SIZE_CLASSES = {
  sm: 'w-5 h-5 text-xs',
  md: 'w-6 h-6 text-sm',
  lg: 'w-8 h-8 text-base',
};

export const ProficiencyIndicator: React.FC<ProficiencyIndicatorProps> = ({
  rank,
  size = 'md',
}) => {
  const config = PROFICIENCY_CONFIG[rank];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={`${sizeClass} ${config.bgColor} ${config.textColor} rounded-full flex items-center justify-center font-bold`}
      title={config.label}
    >
      {config.abbr}
    </div>
  );
};

/**
 * Calculate proficiency bonus based on character level and proficiency rank
 */
export const calculateProficiencyBonus = (level: number, rank: ProficiencyRank): number => {
  switch (rank) {
    case 'untrained': return 0;
    case 'trained': return level + 2;
    case 'expert': return level + 4;
    case 'master': return level + 6;
    case 'legendary': return level + 8;
    default: return 0;
  }
};

export default ProficiencyIndicator;
