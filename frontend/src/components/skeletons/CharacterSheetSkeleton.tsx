// ============================================
// CharacterSheetSkeleton
// Full-page skeleton while character data loads
// ============================================

export default function CharacterSheetSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-24 h-9 bg-moss-green/10 rounded-lg" /> {/* Back button */}
        <div className="flex-1 space-y-1.5">
          <div className="h-7 w-48 bg-moss-green/15 rounded-lg" /> {/* Character name */}
          <div className="h-4 w-32 bg-stone-gray/10 rounded" />   {/* Game system */}
        </div>
        <div className="w-20 h-9 bg-moss-green/10 rounded-lg" /> {/* Save button */}
      </div>

      {/* Tab row */}
      <div className="flex gap-2 border-b border-moss-green/10 pb-0">
        {['Stats', 'Skills', 'Equipment', 'Notes'].map((_, i) => (
          <div
            key={i}
            className={`h-9 rounded-t-lg px-4 ${i === 0 ? 'w-20 bg-moss-green/20' : 'w-16 bg-stone-gray/10'}`}
          />
        ))}
      </div>

      {/* Content: two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {/* Ability scores block */}
          <div className="glass-panel p-4 space-y-3">
            <div className="h-5 w-32 bg-moss-green/15 rounded" />
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-full bg-stone-gray/10 rounded" />
                  <div className="h-10 bg-moss-green/10 rounded-lg" />
                </div>
              ))}
            </div>
          </div>

          {/* HP block */}
          <div className="glass-panel p-4 space-y-2">
            <div className="h-5 w-24 bg-moss-green/15 rounded" />
            <div className="h-12 bg-moss-green/10 rounded-lg" />
          </div>
        </div>

        {/* Middle + right columns */}
        <div className="md:col-span-2 space-y-4">
          {/* Skills block */}
          <div className="glass-panel p-4 space-y-3">
            <div className="h-5 w-24 bg-moss-green/15 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-8 bg-stone-gray/10 rounded" />
              ))}
            </div>
          </div>

          {/* Equipment block */}
          <div className="glass-panel p-4 space-y-3">
            <div className="h-5 w-28 bg-moss-green/15 rounded" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-stone-gray/10 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
