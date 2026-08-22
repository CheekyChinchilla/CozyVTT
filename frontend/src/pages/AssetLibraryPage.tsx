import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Search,
  Grid3x3,
  List,
  FolderOpen,
  Globe,
  Users,
  User,
  Home,
  AlertCircle,
  X,
  Tag,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { useAssetsQuery, type AssetListParams } from '@/hooks/queries';
import { Asset, AssetType, AssetScope, PlatformRole } from '../types';
import AssetCard from '../components/assets/AssetCard';
import AssetUploadModal from '../components/assets/AssetUploadModal';
import AssetDetailPanel from '../components/assets/AssetDetailPanel';
import Toast from '../components/Toast';
import AssetCardSkeleton from '../components/skeletons/AssetCardSkeleton';
import Button from '@/components/ui/Button';

type ViewMode = 'grid' | 'list';
type FolderScope = 'all' | 'global' | 'user' | 'campaign';

/**
 * Asset Library Page
 * Asset Library Refactor — three-scope model, tag filtering, search UX
 */
export default function AssetLibraryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [folderScope, setFolderScope] = useState<FolderScope>('all');
  const [selectedType, setSelectedType] = useState<AssetType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  const isAdmin = user?.platformRole === PlatformRole.ADMIN;
  const canUploadGlobal = isAdmin || user?.globalAssetManager === true;

  // Server-side page of assets via react-query — one cache entry per
  // (page, scope, type) combination.
  const queryClient = useQueryClient();
  const scopeParam =
    folderScope === 'global' ? AssetScope.GLOBAL
    : folderScope === 'user' ? AssetScope.USER
    : folderScope === 'campaign' ? AssetScope.CAMPAIGN
    : undefined;
  const assetParams: AssetListParams = {
    page: currentPage,
    limit: 24,
    ...(selectedType !== 'all' ? { type: selectedType } : {}),
    ...(scopeParam ? { scope: scopeParam } : {}),
  };
  const assetsQuery = useAssetsQuery(assetParams);

  const assets = assetsQuery.data?.assets ?? [];
  const totalPages = assetsQuery.data?.pagination.totalPages ?? 1;
  const totalCount = assetsQuery.data?.pagination.total ?? 0;
  const loading = assetsQuery.isPending;

  useEffect(() => {
    if (assetsQuery.isError) {
      setToast({ message: 'Failed to load assets', type: 'error' });
    }
  }, [assetsQuery.isError]);

  // Reset page and tags when scope/type changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedTags([]);
  }, [folderScope, selectedType]);

  // All unique tags from the current result set
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    assets.forEach((asset) => asset.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [assets]);

  // Filter and sort assets (client-side: search + tags)
  const filteredAssets = useMemo(() => {
    let filtered = [...assets];

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (asset) =>
          asset.name.toLowerCase().includes(query) ||
          asset.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    if (selectedTags.length > 0) {
      filtered = filtered.filter((asset) =>
        selectedTags.every((t) => asset.tags.includes(t))
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'size':
          return b.fileSize - a.fileSize;
        case 'date':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filtered;
  }, [assets, debouncedSearch, selectedTags, sortBy]);

  // Uploads/deletes change page counts, so invalidate every cached asset
  // page rather than splicing one page's array locally.
  const handleUploadSuccess = (_newAsset: Asset) => {
    queryClient.invalidateQueries({ queryKey: ['assets'] });
    setIsUploadModalOpen(false);
    setToast({ message: 'Asset uploaded successfully!', type: 'success' });
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      await api.deleteAsset(assetId);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      setSelectedAsset(null);
      setToast({ message: 'Asset deleted successfully', type: 'success' });
    } catch (error) {
      setToast({ message: 'Failed to delete asset', type: 'error' });
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Whether to show the upload button in the current scope context
  const showUploadButton = folderScope !== 'global' || canUploadGlobal;

  const folderButtons: { key: FolderScope; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All Assets', icon: <FolderOpen className="w-4 h-4" /> },
    { key: 'global', label: 'Global', icon: <Globe className="w-4 h-4" /> },
    { key: 'user', label: 'Personal', icon: <User className="w-4 h-4" /> },
    { key: 'campaign', label: 'Campaign', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <div className="bg-moss-green/10 border-b border-moss-green/20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate('/dashboard')}
                variant="secondary" className="flex items-center gap-2"
                title="Back to Dashboard"
              >
                <Home className="w-5 h-5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-brand-ink mb-2">Asset Library</h1>
                <p className="text-stone-gray">Manage your maps, tokens, audio, and avatars</p>
              </div>
            </div>

            {/* Upload button — hidden when viewing Global as non-manager */}
            {showUploadButton ? (
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2"
              >
                <Upload className="w-5 h-5" />
                <span className="hidden sm:inline">Upload Asset</span>
              </Button>
            ) : (
              <div className="px-4 py-2 text-sm text-stone-gray/60 italic hidden sm:block">
                Managed by administrators
              </div>
            )}
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8">
        {/* Toolbar */}
        <div className="bg-parchment/50 border border-moss-green/20 rounded-xl p-4 mb-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-gray/40" />
              <input
                type="text"
                placeholder="Search assets by name or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray placeholder-stone-gray/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-gray/40 hover:text-stone-gray transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Folder Scope */}
            <div className="flex gap-2 flex-wrap">
              {folderButtons.map(({ key, label, icon }) => (
                <Button
                  key={key}
                  onClick={() => setFolderScope(key)}
                  variant={folderScope === key ? 'primary' : 'secondary'}
                  className="flex items-center gap-2 !rounded-lg"
                >
                  {icon}
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              ))}
            </div>

            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AssetType | 'all')}
              className="px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray"
            >
              <option value="all">All Types</option>
              <option value={AssetType.MAP}>Maps</option>
              <option value={AssetType.TOKEN}>Tokens</option>
              <option value={AssetType.AUDIO}>Audio</option>
              <option value={AssetType.AVATAR}>Avatars</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'size')}
              className="px-4 py-2 bg-paper-white border border-moss-green/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-moss-green text-stone-gray"
            >
              <option value="date">Sort by Date</option>
              <option value="name">Sort by Name</option>
              <option value="size">Sort by Size</option>
            </select>

            {/* View Mode Toggle */}
            <div role="group" aria-label="View mode" className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-moss-green text-white'
                    : 'bg-paper-white text-stone-gray hover:bg-moss-green/10 border border-moss-green/20'
                }`}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <Grid3x3 className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? 'bg-moss-green text-white'
                    : 'bg-paper-white text-stone-gray hover:bg-moss-green/10 border border-moss-green/20'
                }`}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                <List className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Tag chips + result count */}
        {!loading && (
          <div className="flex flex-col gap-2 mb-6">
            {/* Result count */}
            <p className="text-sm text-stone-gray/60">
              {filteredAssets.length === 0
                ? 'No assets found'
                : filteredAssets.length === totalCount
                ? `Showing ${filteredAssets.length} asset${filteredAssets.length !== 1 ? 's' : ''}`
                : `Showing ${filteredAssets.length} of ${totalCount} assets`}
            </p>

            {/* Tag chips */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-4 h-4 text-stone-gray/40 shrink-0" />
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-moss-green text-white border-moss-green'
                        : 'bg-parchment/50 text-stone-gray border-moss-green/20 hover:border-moss-green/50'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-stone-gray/60 hover:text-stone-gray underline ml-1 transition-colors"
                  >
                    Clear tags
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Assets Grid/List */}
        {loading ? (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'space-y-4'
            }
          >
            {[...Array(8)].map((_, i) => (
              <AssetCardSkeleton key={i} viewMode={viewMode} />
            ))}
          </div>
        ) : toast?.type === 'error' && filteredAssets.length === 0 ? (
          <div className="bg-parchment/50 border border-danger/20 rounded-xl p-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-danger-ink" />
            <h2 className="text-lg font-semibold text-brand-ink mb-2">Failed to load assets</h2>
            <p className="text-stone-gray mb-6 text-sm">Check your connection and try again.</p>
            <Button onClick={() => assetsQuery.refetch()}>
              Try Again
            </Button>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="bg-parchment/50 border border-moss-green/20 rounded-xl p-12 text-center">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-stone-gray/30" />
            <h2 className="text-xl font-semibold text-brand-ink mb-2">No assets found</h2>
            <p className="text-stone-gray mb-6">
              {searchQuery || selectedTags.length > 0
                ? 'Try adjusting your search or filters'
                : folderScope === 'global' && !canUploadGlobal
                ? 'No global assets have been uploaded yet'
                : 'Upload your first asset to get started'}
            </p>
            {!searchQuery && selectedTags.length === 0 && showUploadButton && (
              <Button onClick={() => setIsUploadModalOpen(true)}>
                Upload Asset
              </Button>
            )}
          </div>
        ) : (
          <>
            <motion.div
              layout
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                  : 'space-y-4'
              }
            >
              <AnimatePresence>
                {filteredAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    viewMode={viewMode}
                    onView={() => setSelectedAsset(asset)}
                    onDelete={handleDeleteAsset}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <Button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  variant="secondary" className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </Button>
                <span className="px-4 py-2 text-stone-gray">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  variant="secondary" className="disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Upload Modal */}
      <AssetUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Detail Panel */}
      {selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDelete={handleDeleteAsset}
        />
      )}

      {/* Toast Notifications */}
      <Toast
        message={toast?.message || ''}
        type={toast?.type || 'info'}
        show={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
