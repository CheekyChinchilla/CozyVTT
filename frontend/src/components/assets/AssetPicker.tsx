// ============================================
// AssetPicker
// The labelled shell around AssetGrid: a Browse/Upload header, a search
// box, the selected-asset preview row, and the collapsible grid itself.
//
// Used where an asset is chosen as part of a form — the map create/edit
// dialogs and the creature editor. The token panels use AssetGrid
// directly, because they supply their own surrounding layout.
// ============================================

import { useState } from 'react';
import { assetDirectory } from '@/utils/assetUrl';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Search, Upload } from 'lucide-react';
import { api } from '@/services/api';
import type { Asset } from '@/types';
import { AssetType, AssetScope } from '@/types';
import AssetUploadModal from '@/components/assets/AssetUploadModal';
import AssetGrid from '@/components/assets/AssetGrid';
import { Button } from '@/components/ui';

export interface AssetPickerProps {
  label: string;
  required?: boolean;
  type: AssetType;
  selectedAssetId: string | null;
  onSelect: (asset: Asset | null) => void;
  /** Scopes uploads to a campaign. Omit to upload at USER scope. */
  campaignId?: string;
  /**
   * Lets an upload go to Personal, selected at first, or this campaign's
   * library (AssetUploadModal's campaignOption). Not with campaignId.
   */
  campaignOption?: string;
  /** Whether the Upload New button is offered. */
  allowUpload?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  columns?: 3 | 4 | 5;
}

export default function AssetPicker({
  label,
  required,
  type,
  selectedAssetId,
  onSelect,
  campaignId,
  campaignOption,
  allowUpload = true,
  searchPlaceholder = 'Search assets...',
  emptyMessage,
  columns = 3,
}: AssetPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // Cached from AssetGrid so the selected-asset preview can name it without
  // a second fetch, and so a fresh upload appears without a refetch.
  const [assets, setAssets] = useState<Asset[]>([]);

  const handleUploadSuccess = (asset: Asset) => {
    setAssets((prev) => [asset, ...prev]);
    onSelect(asset);
    setExpanded(false);
  };

  const selectedAsset = selectedAssetId ? assets.find((a) => a.id === selectedAssetId) : null;
  const dir = assetDirectory(type);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-gray">
          {label}
          {required && <span className="text-danger-ink ml-1">*</span>}
        </label>
        <div className="flex gap-2">
          {selectedAssetId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-xs text-danger-ink hover:text-danger-ink"
            >
              Clear
            </button>
          )}
          {allowUpload && (
            <Button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              variant="secondary" className="text-xs py-1 px-2 flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              Upload New
            </Button>
          )}
          <Button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            variant="secondary" className="text-xs py-1 px-2"
          >
            {expanded ? 'Hide' : 'Browse Assets'}
          </Button>
        </div>
      </div>

      {/* Upload modal — pre-locked to this asset type, and to the campaign
          or the personal library unless it offers the choice of both */}
      {allowUpload && (
        <AssetUploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
          defaultType={type}
          defaultScope={campaignOption ? undefined : campaignId ? AssetScope.CAMPAIGN : AssetScope.USER}
          defaultCampaignId={campaignId}
          campaignOption={campaignOption}
        />
      )}

      {/* Selected preview — driven by the id alone, so an already-chosen
          asset shows immediately instead of only after the grid is opened.
          The name fills in once the grid has loaded and can supply it. */}
      {selectedAssetId && (
        <div className="flex items-center gap-3 p-2 bg-moss-green/10 border border-moss-green/30 rounded-lg">
          <img
            src={api.getAssetUrl(selectedAssetId, dir)}
            alt={selectedAsset?.name ?? 'Selected asset'}
            className="w-12 h-12 object-cover rounded"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-sm text-brand-ink font-medium truncate flex-1">
            {selectedAsset?.name ?? 'Selected'}
          </span>
          <Check className="w-4 h-4 text-brand-ink flex-shrink-0" />
        </div>
      )}

      {/* Asset grid */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="border border-moss-green/20 rounded-lg bg-parchment/30 p-3 space-y-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray/40" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-paper-white border border-moss-green/20 rounded focus:outline-none focus:ring-1 focus:ring-moss-green text-stone-gray"
                />
              </div>

              <AssetGrid
                type={type}
                selectedId={selectedAssetId}
                onSelect={(asset) => {
                  onSelect(asset);
                  if (asset) setExpanded(false);
                }}
                search={search}
                columns={columns}
                showNames
                emptyMessage={emptyMessage}
                onAssetsLoaded={setAssets}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
