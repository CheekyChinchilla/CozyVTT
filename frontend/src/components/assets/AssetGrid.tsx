// ============================================
// AssetGrid
// The selectable thumbnail grid shared by every place that picks an
// asset — map create/edit, the token manager, the NPC quick editor and
// the creature editor. Each of those grew its own near-identical copy;
// this is the one implementation.
//
// Deliberately just the grid. The map dialogs and the creature editor
// wrap it in AssetPicker (label, search, upload, preview row), while the
// token panels embed it bare in their own layout — which is why the
// shell lives one level up instead of behind `showSearch`-style flags.
// ============================================

import { useEffect, useState, type ReactNode } from 'react';
import { assetDirectory } from '@/utils/assetUrl';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import type { Asset } from '@/types';
import { AssetType } from '@/types';

/** Serving sub-route for each asset type — see GET /api/assets/{dir}/:id. */
export interface AssetGridProps {
  type: AssetType;
  /** Currently selected asset id, or null. */
  selectedId: string | null;
  /** Called with the asset, or null when the selected one is clicked again. */
  onSelect: (asset: Asset | null) => void;
  /** Free-text filter applied to asset names. Omit for no filtering. */
  search?: string;
  /** Thumbnails per row. */
  columns?: 3 | 4 | 5;
  /** Max grid height before it scrolls. */
  maxHeightClass?: string;
  /** Show the asset name over each thumbnail. */
  showNames?: boolean;
  /** Rendered when the fetch returns nothing at all. */
  emptyMessage?: string;
  /** Assets fetched by a parent instead — skips this component's own fetch. */
  assets?: Asset[];
  /** Notifies the parent when this component fetches, so it can cache. */
  onAssetsLoaded?: (assets: Asset[]) => void;
  /** How many assets to request. */
  limit?: number;
  /**
   * Rendered as the first cell, before any asset. The token panels use this
   * for their "None" placeholder option, which has to sit inside the grid to
   * line up with the thumbnails.
   */
  leadingItem?: ReactNode;
  /** Grid gap utility, since the embedded grids are tighter than the picker's. */
  gapClass?: string;
  /** Suppress the empty state when a leadingItem still makes the grid useful. */
  hideEmptyMessage?: boolean;
}

const COLUMN_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

/**
 * Broken-image fallback: swap the thumbnail for the asset's name.
 *
 * SECURITY: the name is written with textContent, never innerHTML, so a
 * maliciously-named asset like `<img onerror=...>` is rendered as literal
 * text rather than executed. Preserved verbatim from the original pickers —
 * do not "simplify" this into innerHTML.
 */
function renderNameFallback(target: HTMLImageElement, name: string): void {
  target.style.display = 'none';
  const parent = target.parentElement;
  if (!parent) return;
  parent.classList.add('bg-moss-green/10', 'flex', 'items-center', 'justify-center');
  const span = document.createElement('span');
  span.className = 'text-xs text-stone-gray/50 p-1 text-center';
  span.textContent = name;
  parent.replaceChildren(span);
}

export default function AssetGrid({
  type,
  selectedId,
  onSelect,
  search = '',
  columns = 3,
  maxHeightClass = 'max-h-52',
  showNames = false,
  emptyMessage,
  assets: providedAssets,
  onAssetsLoaded,
  limit = 50,
  leadingItem,
  gapClass = 'gap-2',
  hideEmptyMessage = false,
}: AssetGridProps) {
  const [fetched, setFetched] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);

  const controlled = providedAssets !== undefined;
  const assets = controlled ? providedAssets : fetched;

  useEffect(() => {
    if (controlled) return;
    let cancelled = false;
    setLoading(true);
    api
      .listAssets({ type, limit, usable: true })
      .then((res) => {
        if (cancelled) return;
        setFetched(res.assets);
        onAssetsLoaded?.(res.assets);
      })
      .catch(() => {
        // Listing failures are non-fatal — the empty state covers it, and the
        // upload path still works.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // onAssetsLoaded is intentionally omitted: callers pass inline closures,
    // and re-fetching on every parent render would hammer the endpoint.
  }, [type, limit, controlled]);

  const filtered = search
    ? assets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : assets;

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-6 h-6 text-brand-ink animate-spin" />
      </div>
    );
  }

  if (filtered.length === 0 && !leadingItem && !hideEmptyMessage) {
    return (
      <p className="text-center text-sm text-stone-gray/60 py-4">
        {assets.length === 0
          ? emptyMessage ?? 'No assets found. Upload one to get started.'
          : 'No results for your search.'}
      </p>
    );
  }

  const dir = assetDirectory(type);
  // Smaller tick on the tighter embedded grids.
  const checkSize = columns >= 5 ? 'w-3 h-3' : columns === 4 ? 'w-4 h-4' : 'w-6 h-6';

  return (
    <div className={`grid ${COLUMN_CLASS[columns]} ${gapClass} ${maxHeightClass} overflow-y-auto p-0.5`}>
      {leadingItem}
      {filtered.map((asset) => {
        const isSelected = selectedId === asset.id;
        return (
          <button
            key={asset.id}
            type="button"
            title={asset.name}
            onClick={() => onSelect(isSelected ? null : asset)}
            className={`relative rounded-cozy overflow-hidden border-2 transition-all aspect-square ${
              isSelected
                ? 'border-moss-green ring-2 ring-moss-green/30'
                : 'border-transparent hover:border-moss-green/40'
            }`}
          >
            <img
              src={api.getAssetUrl(asset.id, dir)}
              alt={asset.name}
              className="w-full h-full object-cover"
              onError={(e) => renderNameFallback(e.target as HTMLImageElement, asset.name)}
            />
            {isSelected && (
              <div className="absolute inset-0 bg-moss-green/25 flex items-center justify-center">
                <Check className={`${checkSize} text-brand-ink drop-shadow`} />
              </div>
            )}
            {showNames && (
              <div className="absolute bottom-0 inset-x-0 bg-forest-shadow/60 px-1 py-0.5">
                <p className="text-paper-white text-xs truncate">{asset.name}</p>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
