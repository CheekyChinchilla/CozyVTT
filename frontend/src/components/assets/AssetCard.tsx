import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Trash2,
  Download,
  FileImage,
  FileAudio,
  User,
  MapPin,
  Tag,
  Globe,
  Users,
} from 'lucide-react';
import { Asset, AssetType, AssetScope } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import ConfirmDialog from '@/components/common/ConfirmDialog';

interface AssetCardProps {
  asset: Asset;
  viewMode: 'grid' | 'list';
  onView: () => void;
  onDelete: (id: string) => void;
}

/**
 * AssetCard Component
 * Displays a single asset with thumbnail and actions
 */
function AssetCardInner({ asset, viewMode, onView, onDelete }: AssetCardProps) {
  const { user } = useAuth();
  const [showActions, setShowActions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Check if current user can delete this asset
  const canDelete =
    user?.id === asset.uploadedById || user?.platformRole === 'ADMIN';

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Get asset thumbnail URL
  const getThumbnailUrl = (): string => {
    if (asset.type === AssetType.MAP) {
      return api.getAssetUrl(asset.id, 'maps');
    }
    if (asset.type === AssetType.TOKEN) {
      return api.getAssetUrl(asset.id, 'tokens');
    }
    if (asset.type === AssetType.AVATAR) {
      return api.getAssetUrl(asset.uploadedById, 'avatars');
    }
    // For audio, return a default icon
    return '';
  };

  // Get asset icon
  const getAssetIcon = () => {
    switch (asset.type) {
      case AssetType.MAP:
        return <MapPin className="w-8 h-8 text-warm-amber" />;
      case AssetType.TOKEN:
        return <User className="w-8 h-8 text-brand-ink" />;
      case AssetType.AUDIO:
        return <FileAudio className="w-8 h-8 text-spirit-purple" />;
      case AssetType.AVATAR:
        return <User className="w-8 h-8 text-sunset-orange" />;
      default:
        return <FileImage className="w-8 h-8 text-stone-gray" />;
    }
  };

  // Handle delete with confirmation
  const handleDelete = () => {
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(asset.id);
    } catch (error) {
      console.error('Error deleting asset:', error);
    } finally {
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  };

  // Handle download
  const handleDownload = () => {
    window.open(`/api/assets/${asset.id}/download`, '_blank');
  };

  const confirmDialog = (
    <ConfirmDialog
      isOpen={confirmOpen}
      title="Delete Asset"
      message={`Are you sure you want to delete "${asset.name}"? This action cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      isLoading={isDeleting}
      onConfirm={handleConfirmDelete}
      onCancel={() => setConfirmOpen(false)}
    />
  );

  if (viewMode === 'list') {
    return (
      <>
      {confirmDialog}
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-parchment/50 border border-moss-green/20 rounded-lg p-4 hover:shadow-lg transition-all"
      >
        <div className="flex items-center gap-4">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-20 h-20 bg-moss-green/10 rounded-lg overflow-hidden flex items-center justify-center">
            {asset.type === AssetType.AUDIO ? (
              getAssetIcon()
            ) : (
              <img
                src={getThumbnailUrl()}
                alt={asset.name}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.onerror = null; // prevent recursive error
                  target.style.display = 'none';
                }}
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-brand-ink truncate">
              {asset.name}
            </h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-stone-gray">
              <span className="flex items-center gap-1">
                {asset.scope === AssetScope.GLOBAL ? (
                  <Globe className="w-4 h-4" />
                ) : asset.scope === AssetScope.USER ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                {asset.scope === AssetScope.USER ? 'Personal' : asset.scope}
              </span>
              <span>{formatFileSize(asset.fileSize)}</span>
              <span>{asset.type}</span>
            </div>
            {asset.tags.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {asset.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-warm-amber/20 text-warm-amber text-xs rounded-md"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </span>
                ))}
                {asset.tags.length > 3 && (
                  <span className="text-xs text-stone-gray/50">
                    +{asset.tags.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onView}
              className="p-2 rounded-lg bg-moss-green/10 hover:bg-moss-green/20 text-brand-ink transition-colors"
              title="View details"
            >
              <Eye className="w-5 h-5" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg bg-sunset-orange/10 hover:bg-sunset-orange/20 text-sunset-orange transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-2 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger-ink transition-colors disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
      </>
    );
  }

  // Grid view
  return (
    <>
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className="bg-parchment/50 border border-moss-green/20 rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all relative group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Thumbnail */}
      <div className="relative w-full h-48 bg-moss-green/10 overflow-hidden">
        {asset.type === AssetType.AUDIO ? (
          <div className="flex items-center justify-center w-full h-full">
            {getAssetIcon()}
          </div>
        ) : (
          <img
            src={getThumbnailUrl()}
            alt={asset.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const iconDiv = document.createElement('div');
              iconDiv.className = 'flex items-center justify-center w-full h-full';
              iconDiv.innerHTML = '<div></div>';
              target.parentElement?.appendChild(iconDiv);
            }}
          />
        )}

        {/* Scope Badge */}
        <div className="absolute top-2 right-2 px-2 py-1 bg-paper-white backdrop-blur-sm rounded-md text-xs font-medium text-stone-gray flex items-center gap-1">
          {asset.scope === AssetScope.GLOBAL ? (
            <>
              <Globe className="w-3 h-3" />
              Global
            </>
          ) : asset.scope === AssetScope.USER ? (
            <>
              <User className="w-3 h-3" />
              Personal
            </>
          ) : (
            <>
              <Users className="w-3 h-3" />
              Campaign
            </>
          )}
        </div>

        {/* Hover Actions */}
        {showActions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center gap-3"
          >
            <button
              onClick={onView}
              className="p-3 bg-paper-white rounded-full hover:bg-white transition-colors"
              title="View details"
            >
              <Eye className="w-5 h-5 text-brand-ink" />
            </button>
            <button
              onClick={handleDownload}
              className="p-3 bg-paper-white rounded-full hover:bg-white transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5 text-sunset-orange" />
            </button>
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="p-3 bg-danger/90 rounded-full hover:bg-danger transition-colors disabled:opacity-50"
                title="Delete"
              >
                <Trash2 className="w-5 h-5 text-white" />
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-brand-ink truncate mb-2">
          {asset.name}
        </h3>

        <div className="flex items-center justify-between text-sm text-stone-gray mb-3">
          <span className="capitalize">{asset.type.toLowerCase()}</span>
          <span>{formatFileSize(asset.fileSize)}</span>
        </div>

        {/* Tags */}
        {asset.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {asset.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-warm-amber/20 text-warm-amber text-xs rounded-md"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
            {asset.tags.length > 2 && (
              <span className="text-xs text-stone-gray/50">
                +{asset.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
    {confirmDialog}
    </>
  );
}

// Memoised so the grid doesn't re-render unchanged cards when the parent
// re-fetches or when a different asset's state changes.
const AssetCard = memo(AssetCardInner);
export default AssetCard;
