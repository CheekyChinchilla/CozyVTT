// ============================================
// AssetCardSkeleton
// Pulse skeleton matching AssetCard (grid + list variants)
// ============================================

interface AssetCardSkeletonProps {
  viewMode?: 'grid' | 'list';
}

export default function AssetCardSkeleton({ viewMode = 'grid' }: AssetCardSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className="bg-parchment/50 border border-moss-green/10 rounded-lg p-4 animate-pulse">
        <div className="flex items-center gap-4">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-20 h-20 bg-moss-green/10 rounded-lg" />

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-5 w-2/3 bg-moss-green/15 rounded" />
            <div className="flex gap-3">
              <div className="h-4 w-16 bg-stone-gray/10 rounded" />
              <div className="h-4 w-12 bg-stone-gray/10 rounded" />
              <div className="h-4 w-14 bg-stone-gray/10 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-5 w-12 bg-warm-amber/10 rounded-md" />
              <div className="h-5 w-14 bg-warm-amber/10 rounded-md" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="w-9 h-9 bg-moss-green/10 rounded-lg" />
            <div className="w-9 h-9 bg-stone-gray/10 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-parchment/50 border border-moss-green/10 rounded-xl overflow-hidden animate-pulse">
      {/* Thumbnail */}
      <div className="w-full h-48 bg-moss-green/10" />

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="h-5 w-3/4 bg-moss-green/15 rounded" />
        <div className="flex items-center justify-between">
          <div className="h-4 w-1/4 bg-stone-gray/10 rounded" />
          <div className="h-4 w-1/5 bg-stone-gray/10 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-12 bg-warm-amber/10 rounded-md" />
          <div className="h-5 w-14 bg-warm-amber/10 rounded-md" />
        </div>
      </div>
    </div>
  );
}
