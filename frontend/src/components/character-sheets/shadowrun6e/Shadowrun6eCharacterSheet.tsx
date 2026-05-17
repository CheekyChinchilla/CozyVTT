/**
 * Shadowrun 6e Character Sheet
 */

import { AlertCircle } from 'lucide-react';
import { CharacterSheetProps } from '../types';

export const Shadowrun6eCharacterSheet: React.FC<CharacterSheetProps> = () => {
  return (
    <div className="glass-panel p-6">
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-4 rounded-full bg-purple-100">
          <AlertCircle className="w-8 h-8 text-purple-600" />
        </div>
        <h3 className="text-xl font-semibold text-warm-gray">
          Shadowrun 6e Character Sheet
        </h3>
        <p className="text-stone-gray text-center max-w-md">
          The Shadowrun 6th Edition character sheet is not yet implemented.
        </p>
        <p className="text-sm text-stone-gray/70">
          Shadowrun 6e support is on the roadmap for a future release.
        </p>
      </div>
    </div>
  );
};

export default Shadowrun6eCharacterSheet;
