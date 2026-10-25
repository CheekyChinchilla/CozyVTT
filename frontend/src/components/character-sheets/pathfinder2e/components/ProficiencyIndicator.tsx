/**
 * ProficiencyIndicator Component
 *
 * Displays proficiency rank as a colored badge with abbreviation.
 * Pathfinder 2e uses 5 proficiency ranks: Untrained, Trained, Expert, Master, Legendary
 */

import React from 'react';

export type ProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

interface ProficiencyIndicatorProps {
  /**
   * Optional: a stored sheet need not record one, and older or imported sheets
   * often do not. Absent or unrecognised renders nothing.
   */
  rank?: ProficiencyRank;
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
    bgColor: 'bg-ink/10',
    textColor: 'text-ink-secondary',
  },
  trained: {
    label: 'Trained',
    abbr: 'T',
    color: 'blue-500',
    bgColor: 'bg-info/15 border border-info/30',
    textColor: 'text-info-ink',
  },
  expert: {
    label: 'Expert',
    abbr: 'E',
    color: 'green-500',
    bgColor: 'bg-success/15 border border-success/30',
    textColor: 'text-success-ink',
  },
  master: {
    label: 'Master',
    abbr: 'M',
    color: 'purple-500',
    bgColor: 'bg-spirit/15 border border-spirit/30',
    textColor: 'text-spirit-ink',
  },
  legendary: {
    label: 'Legendary',
    abbr: 'L',
    color: 'amber-500',
    bgColor: 'bg-warning/15 border border-warning/30',
    textColor: 'text-warning-ink',
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
  // `proficiencyRank` is optional on a strike, and a sheet written by an older
  // version, imported from elsewhere, or converted from an earlier shape may
  // not carry one at all. Reading the config blind used to throw and take the
  // whole sheet down with it.
  //
  // Nothing is rendered rather than falling back to Untrained: a Fighter's
  // warhammer is not untrained, and a "U" would assert something about the
  // character that simply is not known.
  const config = rank ? PROFICIENCY_CONFIG[rank] : undefined;
  if (!config) return null;

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

export default ProficiencyIndicator;
