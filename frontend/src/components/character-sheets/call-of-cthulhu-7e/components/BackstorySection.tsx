/**
 * BackstorySection Component
 *
 * Rich text fields for investigator background, personality, and history.
 * These fields are central to Call of Cthulhu character development.
 */

import React from 'react';
import { BookText, User, Heart, MapPin, Package, Sparkles, Activity, Ghost } from 'lucide-react';

interface BackstoryData {
  description?: string;
  personalDescription?: string;
  ideology?: string;
  significantPeople?: string;
  meaningfulLocations?: string;
  treasuredPossessions?: string;
  traits?: string;
  injuriesAndScars?: string;
  phobiasAndManias?: string;
  arcaneTomesAndSpells?: string;
  encountersWithStrangeEntities?: string;
}

interface BackstorySectionProps {
  /** Backstory data from character */
  backstory: BackstoryData;

  /** Edit mode */
  editable?: boolean;

  /** onChange handler for edit mode */
  onChange?: (field: keyof BackstoryData, value: string) => void;
}

interface BackstoryField {
  key: keyof BackstoryData;
  label: string;
  icon: React.ElementType;
  placeholder: string;
  rows?: number;
}

const BACKSTORY_FIELDS: BackstoryField[] = [
  {
    key: 'description',
    label: 'Background & History',
    icon: BookText,
    placeholder: 'Describe your investigator\'s background, education, and how they came to their current occupation...',
    rows: 4,
  },
  {
    key: 'personalDescription',
    label: 'Personal Description',
    icon: User,
    placeholder: 'Physical appearance, mannerisms, and first impressions...',
    rows: 2,
  },
  {
    key: 'ideology',
    label: 'Ideology & Beliefs',
    icon: Heart,
    placeholder: 'Core beliefs, philosophical outlook, or driving principles...',
    rows: 2,
  },
  {
    key: 'significantPeople',
    label: 'Significant People',
    icon: User,
    placeholder: 'Important people in your investigator\'s life (family, mentors, friends, rivals)...',
    rows: 2,
  },
  {
    key: 'meaningfulLocations',
    label: 'Meaningful Locations',
    icon: MapPin,
    placeholder: 'Places of significance (childhood home, favorite library, site of a life-changing event)...',
    rows: 2,
  },
  {
    key: 'treasuredPossessions',
    label: 'Treasured Possessions',
    icon: Package,
    placeholder: 'Items of personal importance beyond mere utility...',
    rows: 2,
  },
  {
    key: 'traits',
    label: 'Personality Traits',
    icon: Sparkles,
    placeholder: 'Notable character traits, habits, quirks, or behavioral patterns...',
    rows: 2,
  },
  {
    key: 'injuriesAndScars',
    label: 'Injuries & Scars',
    icon: Activity,
    placeholder: 'Physical marks, old wounds, or lasting injuries and their origins...',
    rows: 2,
  },
  {
    key: 'phobiasAndManias',
    label: 'Phobias & Manias',
    icon: Ghost,
    placeholder: 'Fears, compulsions, or irrational behaviors (often gained through traumatic experiences)...',
    rows: 2,
  },
  {
    key: 'arcaneTomesAndSpells',
    label: 'Arcane Tomes & Spells',
    icon: BookText,
    placeholder: 'Forbidden texts read or spells learned (if any)...',
    rows: 2,
  },
  {
    key: 'encountersWithStrangeEntities',
    label: 'Encounters with Strange Entities',
    icon: Ghost,
    placeholder: 'Previous encounters with the supernatural or inexplicable...',
    rows: 3,
  },
];

/**
 * BackstorySection - Rich text fields for investigator background
 */
export const BackstorySection: React.FC<BackstorySectionProps> = ({
  backstory,
  editable = false,
  onChange,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-2 pb-2 border-b-2 border-sepia-400">
        <BookText className="w-5 h-5 text-sepia-700" />
        <h3 className="text-lg font-bold text-sepia-900">Investigator Background</h3>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        {BACKSTORY_FIELDS.map((field) => {
          const Icon = field.icon;
          const value = backstory[field.key] || '';

          return (
            <div key={field.key} className="space-y-2">
              {/* Field Label */}
              <div className="flex items-center space-x-2">
                <Icon className="w-4 h-4 text-sepia-600" />
                <label className="text-sm font-semibold text-sepia-900">
                  {field.label}
                </label>
              </div>

              {/* Field Input/Display */}
              {editable ? (
                <textarea
                  value={value}
                  onChange={(e) => onChange?.(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows || 3}
                  className="w-full bg-white/50 border border-sepia-400 rounded-md px-3 py-2 text-sm text-sepia-900 placeholder:text-sepia-400 focus:outline-none focus:ring-2 focus:ring-sepia-500 resize-y"
                />
              ) : (
                <div className="bg-parchment-light/50 border border-sepia-300 rounded-md px-3 py-2 min-h-[60px]">
                  {value ? (
                    <p className="text-sm text-sepia-900 whitespace-pre-wrap">{value}</p>
                  ) : (
                    <p className="text-sm text-sepia-500 italic">No information provided</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Keeper Notes */}
      <div className="bg-amber-50 border border-amber-300 rounded-md p-4">
        <h4 className="text-sm font-semibold text-amber-900 mb-2">Keeper's Note</h4>
        <p className="text-xs text-amber-800 leading-relaxed">
          In Call of Cthulhu, backstory elements often become central to the narrative. The Keeper may use
          significant people, meaningful locations, or treasured possessions as plot hooks. Phobias and manias
          can be gained during play through traumatic sanity losses. Encounters with strange entities may
          haunt investigators throughout the campaign.
        </p>
      </div>
    </div>
  );
};

export default BackstorySection;
