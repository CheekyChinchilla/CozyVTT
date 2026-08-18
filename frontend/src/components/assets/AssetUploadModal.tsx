import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, FileImage, FileAudio, User, MapPin, Loader, Tag as TagIcon, Globe, Users } from 'lucide-react';
import { api } from '../../services/api';
import { Asset, AssetType, AssetScope, PlatformRole, Campaign, CampaignRole } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import campaignService from '../../services/campaign.service';
import { Button, Modal } from '@/components/ui';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';

interface AssetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (asset: Asset) => void;
  /** When set, locks the asset type and hides the type selector */
  defaultType?: AssetType;
  /** When set, locks the scope and hides the scope selector */
  defaultScope?: AssetScope;
  /** When set, pre-selects and locks the campaign, hides the campaign dropdown */
  defaultCampaignId?: string;
}

/**
 * AssetUploadModal Component
 * Upload modal scope selector refactored for three-scope model
 */
export default function AssetUploadModal({ isOpen, onClose, onSuccess, defaultType, defaultScope, defaultCampaignId }: AssetUploadModalProps) {
  const { user } = useAuth();
  const { data: serverConfig } = useServerConfigQuery();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.platformRole === PlatformRole.ADMIN;
  const canUploadGlobal = isAdmin || user?.globalAssetManager === true;

  // Compute the effective default scope:
  // - If a defaultScope prop was given, use it (falling back to USER if no permission for GLOBAL)
  // - If defaultCampaignId is set, default to CAMPAIGN
  // - Otherwise, default to USER (Personal)
  const computeDefaultScope = (): AssetScope => {
    if (defaultScope) {
      if (defaultScope === AssetScope.GLOBAL && !canUploadGlobal) return AssetScope.USER;
      return defaultScope;
    }
    if (defaultCampaignId) return AssetScope.CAMPAIGN;
    return AssetScope.USER;
  };

  // Form fields
  const [assetType, setAssetType] = useState<AssetType>(defaultType ?? AssetType.MAP);
  const [assetScope, setAssetScope] = useState<AssetScope>(computeDefaultScope);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Campaign selection state
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(defaultCampaignId ?? '');

  // When type is AVATAR, always force USER scope
  useEffect(() => {
    if (assetType === AssetType.AVATAR) {
      setAssetScope(AssetScope.USER);
    }
  }, [assetType]);

  // Fetch all campaigns the user belongs to (used for scope availability + dropdown)
  useEffect(() => {
    if (isOpen && !defaultCampaignId) {
      campaignService.getCampaigns().then((data) => {
        setAllCampaigns(data);
        // Auto-select first campaign if only one and scope is CAMPAIGN
        if (data.length === 1) {
          setSelectedCampaignId(data[0].id);
        }
      });
    }
  }, [isOpen, defaultCampaignId]);

  // Campaigns shown in dropdown:
  // TOKEN uploads: any campaign membership (players can upload tokens)
  // All other types: DM-only campaigns
  const dropdownCampaigns = assetType === AssetType.TOKEN
    ? allCampaigns
    : allCampaigns.filter((c) =>
        c.ownerId === user?.id ||
        c.memberships?.some((m) => m.userId === user?.id && m.role === CampaignRole.DM)
      );

  // Whether the Campaign scope option should be available
  const hasCampaignAccess = allCampaigns.length > 0;

  // Reset form — returns to default values (honouring any locked defaults)
  const resetForm = () => {
    setSelectedFile(null);
    setAssetType(defaultType ?? AssetType.MAP);
    setAssetScope(computeDefaultScope());
    setName('');
    setDescription('');
    setTags([]);
    setTagInput('');
    setSelectedCampaignId(defaultCampaignId ?? '');
    setError(null);
    setUploadProgress(0);
  };

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  // Validate file based on asset type
  const validateFile = (file: File, type: AssetType): string | null => {
    // Server-configured limit (MAX_<TYPE>_SIZE_MB), with a local fallback
    const maxSize = getUploadLimit(serverConfig, type);

    const allowedTypes: Record<AssetType, string[]> = {
      [AssetType.MAP]: ['image/jpeg', 'image/png', 'image/webp'],
      [AssetType.TOKEN]: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      [AssetType.AUDIO]: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
      [AssetType.AVATAR]: ['image/jpeg', 'image/png', 'image/webp'],
      [AssetType.DOCUMENT]: ['application/pdf', 'text/plain', 'text/markdown'],
      [AssetType.OTHER]: [],
    };

    if (file.size > maxSize) {
      return `File size exceeds maximum of ${formatUploadLimit(maxSize)}`;
    }

    const allowed = allowedTypes[type];
    if (allowed.length > 0 && !allowed.includes(file.type)) {
      return `Invalid file type. Allowed types: ${allowed.join(', ')}`;
    }

    return null;
  };

  const handleFileSelection = (file: File) => {
    const validationError = validateFile(file, assetType);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedFile(file);
    setError(null);

    if (!name) {
      setName(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  // Not memoized: it must see the current asset type and limits, otherwise
  // dropped files are validated against whatever type was selected on mount.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelection(files[0]);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    if (!name.trim()) {
      setError('Please enter a name for the asset');
      return;
    }

    if (assetScope === AssetScope.CAMPAIGN && !selectedCampaignId) {
      setError('Please select a campaign');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Metadata first, file last: multer parses parts in order, so the server
      // knows the asset type even when it aborts an oversize file mid-stream
      // and can name the type and its limit in the error.
      const formData = new FormData();
      formData.append('type', assetType);
      formData.append('scope', assetScope);
      formData.append('name', name.trim());
      if (description.trim()) {
        formData.append('description', description.trim());
      }
      if (tags.length > 0) {
        formData.append('tags', tags.join(','));
      }
      if (assetScope === AssetScope.CAMPAIGN && selectedCampaignId) {
        formData.append('campaignId', selectedCampaignId);
      }
      formData.append('file', selectedFile);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await api.uploadAsset(formData);

      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        onSuccess(response.asset);
        resetForm();
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload asset');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  // Scope descriptions shown below the selector
  const scopeDescriptions: Record<AssetScope, string> = {
    [AssetScope.USER]: 'Only you can see this asset. Available in all your campaigns.',
    [AssetScope.CAMPAIGN]: 'Shared with all members of the selected campaign.',
    [AssetScope.GLOBAL]: 'Available to all users across all campaigns on this platform.',
  };

  // Locked context banner label
  const lockedLabel = defaultType && defaultScope
    ? `Uploading as a ${defaultScope} ${defaultType.toLowerCase()} asset`
    : defaultScope
    ? `Scope locked to ${defaultScope}`
    : defaultCampaignId
    ? 'Campaign locked for this upload'
    : null;

  // Whether AVATAR type is active (scope is always USER, selector hidden)
  const isAvatarType = assetType === AssetType.AVATAR;

  return (
    <Modal open={isOpen} onClose={handleClose} title="Upload Asset" icon={Upload} size="lg" closeDisabled={uploading}>
          {/* Content */}
          <div className="space-y-6">
            {/* Locked context banner */}
            {lockedLabel && (
              <div className="flex items-center gap-2 px-3 py-2 bg-moss-green/10 border border-moss-green/20 rounded-lg text-sm text-moss-green">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span>{lockedLabel}</span>
              </div>
            )}

            {/* Asset Type Selection — hidden when type is pre-locked */}
            {!defaultType && (
              <div>
                <label className="block text-sm font-medium text-moss-green mb-2">
                  Asset Type
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { type: AssetType.MAP, icon: MapPin, label: 'Map' },
                    { type: AssetType.TOKEN, icon: User, label: 'Token' },
                    { type: AssetType.AUDIO, icon: FileAudio, label: 'Audio' },
                    { type: AssetType.AVATAR, icon: User, label: 'Avatar' },
                  ].map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => setAssetType(type)}
                      disabled={uploading}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        assetType === type
                          ? 'border-moss-green bg-moss-green/10 text-moss-green'
                          : 'border-moss-green/20 text-stone-gray hover:border-moss-green/50'
                      } disabled:opacity-50`}
                    >
                      <Icon className="w-6 h-6 mx-auto mb-2" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Scope Selection — hidden when scope is pre-locked OR when type is AVATAR */}
            {!defaultScope && !isAvatarType && (
              <div>
                <label className="block text-sm font-medium text-moss-green mb-2">
                  Scope
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Personal — always visible */}
                  <button
                    onClick={() => setAssetScope(AssetScope.USER)}
                    disabled={uploading}
                    className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                      assetScope === AssetScope.USER
                        ? 'border-moss-green bg-moss-green/10 text-moss-green'
                        : 'border-moss-green/20 text-stone-gray hover:border-moss-green/50'
                    } disabled:opacity-50`}
                  >
                    <User className="w-5 h-5" />
                    <span className="text-sm font-medium">Personal</span>
                  </button>

                  {/* Campaign — only shown if user has campaigns */}
                  {hasCampaignAccess && (
                    <button
                      onClick={() => setAssetScope(AssetScope.CAMPAIGN)}
                      disabled={uploading}
                      className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        assetScope === AssetScope.CAMPAIGN
                          ? 'border-moss-green bg-moss-green/10 text-moss-green'
                          : 'border-moss-green/20 text-stone-gray hover:border-moss-green/50'
                      } disabled:opacity-50`}
                    >
                      <Users className="w-5 h-5" />
                      <span className="text-sm font-medium">Campaign</span>
                    </button>
                  )}

                  {/* Global — only for admin or globalAssetManager */}
                  {canUploadGlobal && (
                    <button
                      onClick={() => setAssetScope(AssetScope.GLOBAL)}
                      disabled={uploading}
                      className={`p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-1 ${
                        assetScope === AssetScope.GLOBAL
                          ? 'border-moss-green bg-moss-green/10 text-moss-green'
                          : 'border-moss-green/20 text-stone-gray hover:border-moss-green/50'
                      } disabled:opacity-50`}
                    >
                      <Globe className="w-5 h-5" />
                      <span className="text-sm font-medium">Global</span>
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-stone-gray/70">
                  {scopeDescriptions[assetScope]}
                </p>
              </div>
            )}

            {/* AVATAR auto-scope notice */}
            {isAvatarType && !defaultScope && (
              <div className="flex items-center gap-2 px-3 py-2 bg-parchment/50 border border-moss-green/20 rounded-lg text-sm text-stone-gray">
                <User className="w-4 h-4 flex-shrink-0 text-moss-green" />
                <span>Avatars are always saved to your Personal library.</span>
              </div>
            )}

            {/* Campaign Selection — shown only when scope is CAMPAIGN and campaign not pre-locked */}
            {!defaultCampaignId && assetScope === AssetScope.CAMPAIGN && (
              <div>
                <label className="block text-sm font-medium text-moss-green mb-2">
                  Select Campaign
                </label>
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  disabled={uploading}
                  className="w-full px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-warm-amber text-stone-gray disabled:opacity-50"
                >
                  <option value="">-- Select a campaign --</option>
                  {dropdownCampaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                {dropdownCampaigns.length === 0 && (
                  <p className="mt-2 text-sm text-stone-gray/70">
                    {assetType === AssetType.TOKEN
                      ? 'You need to be a member of a campaign to upload tokens.'
                      : 'You need to be a DM of a campaign to upload campaign assets.'}
                  </p>
                )}
              </div>
            )}

            {/* File Upload Area */}
            <div>
              <label className="block text-sm font-medium text-moss-green mb-2">
                File
                <span className="ml-2 font-normal text-xs text-stone-gray/70">
                  max {formatUploadLimit(getUploadLimit(serverConfig, assetType))}
                </span>
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-moss-green bg-moss-green/10'
                    : selectedFile
                    ? 'border-moss-green bg-moss-green/10'
                    : 'border-moss-green/30 hover:border-moss-green/50'
                } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                  className="hidden"
                  accept={
                    assetType === AssetType.MAP || assetType === AssetType.TOKEN || assetType === AssetType.AVATAR
                      ? 'image/*'
                      : assetType === AssetType.AUDIO
                      ? 'audio/*'
                      : '*'
                  }
                />

                {selectedFile ? (
                  <>
                    <FileImage className="w-12 h-12 mx-auto mb-3 text-moss-green" />
                    <p className="text-moss-green font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-stone-gray mt-1">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-3 text-stone-gray/40" />
                    <p className="text-stone-gray font-medium mb-1">Drag and drop your file here</p>
                    <p className="text-sm text-stone-gray/70">or click to browse</p>
                  </>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-moss-green mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={uploading}
                placeholder="Enter asset name..."
                className="w-full px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray disabled:opacity-50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-moss-green mb-2">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={uploading}
                placeholder="Enter asset description..."
                rows={3}
                className="w-full px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray resize-none disabled:opacity-50"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-moss-green mb-2">
                Tags (Optional)
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                disabled={uploading}
                placeholder="Type a tag and press Enter..."
                className="w-full px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray disabled:opacity-50"
              />
              {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-warm-amber/20 text-warm-amber rounded-full text-sm"
                    >
                      <TagIcon className="w-3 h-3" />
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        disabled={uploading}
                        className="ml-1 hover:text-red-500 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-moss-green">Uploading...</span>
                  <span className="text-sm text-stone-gray">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-moss-green/20 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-moss-green"
                  />
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div role="alert" className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-moss-green/20">
            <Button
              onClick={handleClose}
              disabled={uploading}
              variant="secondary" className="disabled:opacity-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !name.trim() || uploading}
              className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload
                </>
              )}
            </Button>
          </div>
    </Modal>
  );
}
