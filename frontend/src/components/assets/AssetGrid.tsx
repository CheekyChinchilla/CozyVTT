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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { assetDirectory } from '@/utils/assetUrl';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import type { Asset } from '@/types';
import { AssetType } from '@/types';
import { Button } from '@/components/ui';
import { useDebounce } from '@/hooks/useDebounce';

/** Serving sub-route for each asset type — see GET /api/assets/{dir}/:id. */
export interface AssetGridProps {
  type: AssetType;
  /** Currently selected asset id, or null. */
  selectedId: string | null;
  /** Called with the asset, or null when the selected one is clicked again. */
  onSelect: (asset: Asset | null) => void;
  /**
   * Search text. With the grid's own fetch the server searches the whole
   * library (a name in part or a tag whole); with `assets` given, names are
   * filtered here. Omit for no filtering.
   */
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
  /** Notifies the parent of every asset fetched so far, so it can cache. */
  onAssetsLoaded?: (assets: Asset[]) => void;
  /** How many assets to request at a time; Load more asks for the next lot. */
  limit?: number;
  /**
   * Assets the parent knows of that the fetch may not include yet, such as
   * one just uploaded, shown first. With the grid's own fetch only.
   */
  prepend?: Asset[];
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
  /** Told when the grid's own fetch fails, so the parent can say so. */
  onLoadError?: (error: unknown) => void;
}

const COLUMN_CLASS: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

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
  prepend,
  onLoadError,
  leadingItem,
  gapClass = 'gap-2',
  hideEmptyMessage = false,
}: AssetGridProps) {
  const [fetched, setFetched] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  // The server's pages: one is fetched at first, and Load more adds the next.
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  // Which fetch is the latest, so an answer to an older search is dropped.
  const latest = useRef(0);
  // Thumbnails that failed to load, shown as their names instead.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  const controlled = providedAssets !== undefined;
  const serverSearch = useDebounce(search.trim(), 300);

  useEffect(() => {
    if (controlled) return;
    const fetchId = ++latest.current;
    setLoading(true);
    api
      .listAssets({ type, limit, usable: true, page: 1, ...(serverSearch ? { search: serverSearch } : {}) })
      .then((res) => {
        if (fetchId !== latest.current) return;
        setFetched(res.assets);
        setPage(1);
        setTotalPages(res.pagination?.totalPages ?? 1);
        onAssetsLoaded?.(res.assets);
      })
      .catch((error: unknown) => {
        // Not fatal: the empty state covers it and the upload path still
        // works. The parent says why, where it wants to.
        if (fetchId === latest.current) onLoadError?.(error);
      })
      .finally(() => {
        if (fetchId === latest.current) setLoading(false);
      });
    return () => { latest.current += 1; };
    // onAssetsLoaded is intentionally omitted: callers pass inline closures,
    // and re-fetching on every parent render would hammer the endpoint.
  }, [type, limit, controlled, serverSearch]);

  // Offered only once the first page of the current search is in (see the
  // button below), and dropped if a new search starts meanwhile, so a page is
  // only ever added to the results of the search it belongs to.
  const loadMore = async () => {
    const fetchId = latest.current;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const res = await api.listAssets({ type, limit, usable: true, page: next, ...(serverSearch ? { search: serverSearch } : {}) });
      if (fetchId !== latest.current) return;
      const known = new Set(fetched.map((a) => a.id));
      const all = [...fetched, ...res.assets.filter((a) => !known.has(a.id))];
      setFetched(all);
      setPage(next);
      setTotalPages(res.pagination?.totalPages ?? next);
      onAssetsLoaded?.(all);
    } catch (error: unknown) {
      // What is shown stays, and Load more can be pressed again.
      onLoadError?.(error);
    } finally {
      setLoadingMore(false);
    }
  };

  const extra = (prepend ?? []).filter((a) => !fetched.some((f) => f.id === a.id));
  const assets = controlled ? providedAssets : [...extra, ...fetched];
  // The server has searched the grid's own fetch already.
  const filtered = controlled && search
    ? assets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
    : assets;
  const searching = controlled ? !!search : !!serverSearch;

  if (loading && assets.length === 0) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-6 h-6 text-brand-ink animate-spin" />
      </div>
    );
  }

  const emptyNote = filtered.length === 0 && !hideEmptyMessage && (
    <p className="text-center text-sm text-stone-gray/60 py-4">
      {searching
        ? 'No results for your search.'
        : emptyMessage ?? 'No assets found. Upload one to get started.'}
    </p>
  );
  if (emptyNote && !leadingItem) return emptyNote;

  const dir = assetDirectory(type);
  // Smaller tick on the tighter embedded grids.
  const checkSize = columns >= 5 ? 'w-3 h-3' : columns === 4 ? 'w-4 h-4' : 'w-6 h-6';

  return (
    <div className={`${maxHeightClass} overflow-y-auto p-0.5`}>
      <div className={`grid ${COLUMN_CLASS[columns]} ${gapClass}`}>
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
              {/* A thumbnail that fails to load is shown as the asset's name,
                  rendered by React as text, so a name like `<img onerror=...>`
                  is never markup. Kept in state: the fallback used to replace
                  the button's children itself, React's selection overlay among
                  them, and React then failed to remove that overlay. */}
              {failed.has(asset.id) ? (
                <span className="flex w-full h-full items-center justify-center bg-moss-green/10 text-xs text-stone-gray/50 p-1 text-center">
                  {asset.name}
                </span>
              ) : (
                <img
                  src={dir === 'maps' || dir === 'tokens' ? api.getAssetThumbnailUrl(asset.id, dir) : api.getAssetUrl(asset.id, dir)}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                  onError={() => setFailed((prev) => new Set(prev).add(asset.id))}
                />
              )}
              {isSelected && (
                <div className="absolute inset-0 bg-moss-green/25 flex items-center justify-center">
                  <Check className={`${checkSize} text-brand-ink drop-shadow-sm`} />
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
      {emptyNote}
      {!controlled && !loading && page < totalPages && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
