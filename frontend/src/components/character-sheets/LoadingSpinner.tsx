/**
 * Loading spinner for lazy-loaded character sheets
 */

import { Loader2 } from 'lucide-react';

export const CharacterSheetLoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Loader2 className="w-8 h-8 text-moss-green animate-spin" />
      <p className="text-sm text-stone-gray">Loading character sheet...</p>
    </div>
  );
};
