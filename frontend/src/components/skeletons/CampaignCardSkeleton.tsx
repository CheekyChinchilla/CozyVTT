// ============================================
// CampaignCardSkeleton
// Pulse skeleton matching CampaignCard layout
// ============================================

export default function CampaignCardSkeleton() {
  return (
    <div className="glass-panel p-6 animate-pulse">
      {/* Role badge (top right) */}
      <div className="flex justify-between items-start mb-3">
        <div className="h-6 w-2/3 bg-moss-green/15 rounded-lg" />
        <div className="h-6 w-16 bg-moss-green/10 rounded-full" />
      </div>

      {/* Description lines */}
      <div className="space-y-2 mb-4">
        <div className="h-4 w-full bg-stone-gray/10 rounded" />
        <div className="h-4 w-4/5 bg-stone-gray/10 rounded" />
      </div>

      {/* Status + game system badges */}
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-20 bg-warm-amber/10 rounded-full" />
        <div className="h-6 w-16 bg-moss-green/10 rounded-full" />
      </div>

      {/* Info rows */}
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-stone-gray/10 rounded" />
        <div className="h-4 w-1/2 bg-stone-gray/10 rounded" />
        <div className="h-4 w-2/3 bg-stone-gray/10 rounded" />
      </div>
    </div>
  );
}
