import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import {
  X,
  Download,
  Trash2,
  Calendar,
  HardDrive,
  FileType,
  User,
  Globe,
  Users,
  Tag as TagIcon,
  MapPin,
  FileAudio,
  Image as ImageIcon,
  ArrowRightLeft,
  Check,
  Loader,
} from 'lucide-react';
import { Asset, AssetType, AssetScope, PlatformRole, Campaign } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import campaignService from '../../services/campaign.service';
import Button from '@/components/ui/Button';

interface AssetDetailPanelProps {
  asset: Asset;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate?: (asset: Asset) => void;
}

/**
 * AssetDetailPanel Component
 * Slide-out panel showing asset details, preview, and actions
 * Added "Move to…" scope reassignment section
 */
export default function AssetDetailPanel({ asset, onClose, onDelete, onUpdate }: AssetDetailPanelProps) {
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Local asset state so scope changes reflect immediately
  const [currentAsset, setCurrentAsset] = useState<Asset>(asset);

  // Move-to section state
  const [moveScope, setMoveScope] = useState<AssetScope | null>(null);
  const [moveCampaignId, setMoveCampaignId] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveSuccess, setMoveSuccess] = useState(false);

  // Campaigns the user belongs to
  const [userCampaigns, setUserCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    setCurrentAsset(asset);
  }, [asset]);

  useEffect(() => {
    campaignService.getCampaigns().then(setUserCampaigns).catch(() => {});
  }, []);

  // Reset move state whenever the panel opens on a new asset
  useEffect(() => {
    setMoveScope(null);
    setMoveCampaignId('');
    setMoveError(null);
    setMoveSuccess(false);
  }, [asset.id]);

  // ---------- Permission helpers ----------
  const isOwner = user?.id === currentAsset.uploadedById;
  const isAdmin = user?.platformRole === PlatformRole.ADMIN;
  const canUploadGlobal = isAdmin || !!user?.globalAssetManager;

  // Check permissions
  const canDelete = isOwner || isAdmin;

  // Scope is fixed for avatars
  const isScopeFixed = currentAsset.type === AssetType.AVATAR;

  // User can move if they own the asset or are admin
  const canMove = !isScopeFixed && (isOwner || isAdmin);

  // Campaigns where the current user is DM (owns the campaign)
  const dmCampaigns = userCampaigns.filter((c) => c.ownerId === user?.id);

  // Available scopes to move to (exclude current)
  const availableMoveScopes: AssetScope[] = [];
  if (currentAsset.scope !== AssetScope.USER) availableMoveScopes.push(AssetScope.USER);
  if (currentAsset.scope !== AssetScope.CAMPAIGN && userCampaigns.length > 0)
    availableMoveScopes.push(AssetScope.CAMPAIGN);
  if (currentAsset.scope !== AssetScope.GLOBAL && canUploadGlobal)
    availableMoveScopes.push(AssetScope.GLOBAL);

  // ---------- Helpers ----------
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAssetUrl = (): string => {
    if (currentAsset.type === AssetType.MAP) return api.getAssetUrl(currentAsset.id, 'maps');
    if (currentAsset.type === AssetType.TOKEN) return api.getAssetUrl(currentAsset.id, 'tokens');
    if (currentAsset.type === AssetType.AVATAR) return api.getAssetUrl(currentAsset.uploadedById, 'avatars');
    if (currentAsset.type === AssetType.AUDIO) return api.getAssetUrl(currentAsset.id, 'audio');
    return '';
  };

  const getTypeIcon = () => {
    switch (currentAsset.type) {
      case AssetType.MAP:
        return <MapPin className="w-5 h-5 text-warm-amber" />;
      case AssetType.TOKEN:
        return <User className="w-5 h-5 text-moss-green" />;
      case AssetType.AUDIO:
        return <FileAudio className="w-5 h-5 text-spirit-purple" />;
      case AssetType.AVATAR:
        return <User className="w-5 h-5 text-sunset-orange" />;
      default:
        return <ImageIcon className="w-5 h-5 text-stone-gray" />;
    }
  };

  const scopeLabel = (scope: AssetScope) => {
    if (scope === AssetScope.GLOBAL) return 'Global';
    if (scope === AssetScope.USER) return 'Personal';
    return 'Campaign';
  };

  const scopeIcon = (scope: AssetScope) => {
    if (scope === AssetScope.GLOBAL) return <Globe className="w-4 h-4" />;
    if (scope === AssetScope.USER) return <User className="w-4 h-4" />;
    return <Users className="w-4 h-4" />;
  };

  // ---------- Handlers ----------
  const handleDownload = () => {
    window.open(`/api/assets/${currentAsset.id}/download`, '_blank');
  };

  const handleDelete = () => setConfirmOpen(true);

  const handleConfirmDelete = () => {
    onDelete(currentAsset.id);
    setConfirmOpen(false);
    onClose();
  };

  const handleMove = async () => {
    if (!moveScope) return;
    if (moveScope === AssetScope.CAMPAIGN && !moveCampaignId) {
      setMoveError('Please select a campaign.');
      return;
    }

    setMoving(true);
    setMoveError(null);
    setMoveSuccess(false);

    try {
      const result = await api.patchAssetScope(
        currentAsset.id,
        moveScope,
        moveScope === AssetScope.CAMPAIGN ? moveCampaignId : undefined,
      );
      const updated = result.asset;
      setCurrentAsset(updated);
      setMoveSuccess(true);
      setMoveScope(null);
      setMoveCampaignId('');
      onUpdate?.(updated);
    } catch (err: any) {
      setMoveError(err?.response?.data?.error ?? 'Failed to move asset. Please try again.');
    } finally {
      setMoving(false);
    }
  };

  // Campaigns available in the picker depend on target scope:
  // Moving TO campaign — user must be a member (any role)
  const campaignsForPicker =
    moveScope === AssetScope.CAMPAIGN ? userCampaigns : dmCampaigns;

  return (
    <>
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Asset"
        message={`Are you sure you want to delete "${currentAsset.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="absolute right-0 top-0 h-full w-full max-w-2xl bg-paper-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-sm border-b border-moss-green/20 p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-moss-green mb-1 truncate">
                    {currentAsset.name}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 px-2 py-1 bg-parchment/50 border border-moss-green/20 rounded-md text-sm text-stone-gray">
                      {getTypeIcon()}
                      {currentAsset.type}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 bg-parchment/50 border border-moss-green/20 rounded-md text-sm text-stone-gray">
                      {scopeIcon(currentAsset.scope)}
                      {scopeLabel(currentAsset.scope)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-stone-gray" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 mt-4">
                <Button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download
                </Button>
                {canDelete && (
                  <Button
                    onClick={handleDelete}
                    variant="danger" className="flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Preview */}
              <div>
                <h3 className="text-lg font-semibold text-moss-green mb-3">Preview</h3>
                <div className="relative w-full rounded-lg overflow-hidden bg-moss-green/10">
                  {currentAsset.type === AssetType.AUDIO ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <FileAudio className="w-20 h-20 mx-auto mb-4 text-spirit-purple" />
                        <audio src={getAssetUrl()} controls className="mx-auto" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={getAssetUrl()}
                      alt={currentAsset.name}
                      className="w-full h-auto"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.innerHTML = `
                            <div class="flex items-center justify-center h-64">
                              <div class="text-stone-gray/40">Preview not available</div>
                            </div>
                          `;
                        }
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Description */}
              {currentAsset.description && (
                <div>
                  <h3 className="text-lg font-semibold text-moss-green mb-3">Description</h3>
                  <p className="text-stone-gray whitespace-pre-wrap">{currentAsset.description}</p>
                </div>
              )}

              {/* Tags */}
              {currentAsset.tags.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-moss-green mb-3">Tags</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {currentAsset.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-warm-amber/20 text-warm-amber rounded-full text-sm"
                      >
                        <TagIcon className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Move to… */}
              {canMove && availableMoveScopes.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-moss-green mb-3 flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5" />
                    Move to…
                  </h3>
                  <div className="p-4 bg-parchment/50 border border-moss-green/20 rounded-lg space-y-4">
                    {/* Scope selector buttons */}
                    <div className="flex flex-wrap gap-2">
                      {availableMoveScopes.map((scope) => (
                        <button
                          key={scope}
                          onClick={() => {
                            setMoveScope(scope);
                            setMoveCampaignId('');
                            setMoveError(null);
                            setMoveSuccess(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            moveScope === scope
                              ? 'bg-moss-green text-paper-white border-moss-green'
                              : 'bg-paper-white text-stone-gray border-moss-green/30 hover:border-moss-green/60 hover:bg-moss-green/5'
                          }`}
                        >
                          {scopeIcon(scope)}
                          {scopeLabel(scope)}
                        </button>
                      ))}
                    </div>

                    {/* Campaign picker */}
                    {moveScope === AssetScope.CAMPAIGN && (
                      <div>
                        <label className="block text-sm text-stone-gray/70 mb-1">
                          Select campaign
                        </label>
                        <select
                          value={moveCampaignId}
                          onChange={(e) => setMoveCampaignId(e.target.value)}
                          className="w-full px-3 py-2 bg-paper-white border border-moss-green/30 rounded-lg text-stone-gray text-sm focus:outline-none focus:border-moss-green"
                        >
                          <option value="">— choose a campaign —</option>
                          {campaignsForPicker.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Error / success */}
                    {moveError && (
                      <p className="text-sm text-red-600">{moveError}</p>
                    )}
                    {moveSuccess && (
                      <p className="flex items-center gap-1 text-sm text-moss-green">
                        <Check className="w-4 h-4" />
                        Asset moved successfully.
                      </p>
                    )}

                    {/* Confirm button */}
                    {moveScope && !moveSuccess && (
                      <Button
                        onClick={handleMove}
                        disabled={moving || (moveScope === AssetScope.CAMPAIGN && !moveCampaignId)}
                        className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {moving ? (
                          <Loader className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="w-4 h-4" />
                        )}
                        {moving ? 'Moving…' : `Move to ${scopeLabel(moveScope)}`}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Scope is fixed notice for avatars */}
              {isScopeFixed && (
                <div className="p-3 bg-warm-amber/10 border border-warm-amber/30 rounded-lg text-sm text-stone-gray">
                  Avatar assets are always stored in your personal library and cannot be moved.
                </div>
              )}

              {/* Metadata */}
              <div>
                <h3 className="text-lg font-semibold text-moss-green mb-3">Metadata</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-parchment/50 border border-moss-green/20 rounded-lg">
                    <HardDrive className="w-5 h-5 text-stone-gray/60" />
                    <div>
                      <p className="text-sm text-stone-gray/70">File Size</p>
                      <p className="text-stone-gray font-medium">{formatFileSize(currentAsset.fileSize)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-parchment/50 border border-moss-green/20 rounded-lg">
                    <FileType className="w-5 h-5 text-stone-gray/60" />
                    <div>
                      <p className="text-sm text-stone-gray/70">MIME Type</p>
                      <p className="text-stone-gray font-medium">{currentAsset.mimeType}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-parchment/50 border border-moss-green/20 rounded-lg">
                    <FileType className="w-5 h-5 text-stone-gray/60" />
                    <div>
                      <p className="text-sm text-stone-gray/70">Original Filename</p>
                      <p className="text-stone-gray font-medium break-all">{currentAsset.originalName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-parchment/50 border border-moss-green/20 rounded-lg">
                    <User className="w-5 h-5 text-stone-gray/60" />
                    <div>
                      <p className="text-sm text-stone-gray/70">Uploaded By</p>
                      <p className="text-stone-gray font-medium">
                        {user?.id === currentAsset.uploadedById ? 'You' : 'Another user'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-parchment/50 border border-moss-green/20 rounded-lg">
                    <Calendar className="w-5 h-5 text-stone-gray/60" />
                    <div>
                      <p className="text-sm text-stone-gray/70">Uploaded On</p>
                      <p className="text-stone-gray font-medium">{formatDate(currentAsset.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Technical Details */}
              <div>
                <h3 className="text-lg font-semibold text-moss-green mb-3">Technical Details</h3>
                <div className="p-4 bg-parchment/50 border border-moss-green/20 rounded-lg">
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between">
                      <span className="text-stone-gray/70">Asset ID:</span>
                      <span className="text-stone-gray">{currentAsset.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-gray/70">Filename:</span>
                      <span className="text-stone-gray truncate ml-4">{currentAsset.filename}</span>
                    </div>
                    {currentAsset.campaignId && (
                      <div className="flex justify-between">
                        <span className="text-stone-gray/70">Campaign ID:</span>
                        <span className="text-stone-gray truncate ml-4">{currentAsset.campaignId}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
