// ============================================
// MapManager Component
// Slide-over panel for DMs to manage campaign maps
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  MapPin,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Upload,
  Download,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';
import { api } from '@/services/api';
import mapService from '@/services/map.service';
import type { Map, Token } from '@/types';
import CreateMapModal from './CreateMapModal';
import EditMapModal from './EditMapModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Button from '@/components/ui/Button';

interface MapManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Extract asset UUID from a stored imageUrl like /api/assets/maps/{uuid}
 */
function extractAssetId(url: string | null | undefined): string {
  if (!url) return '';
  const parts = url.split('/');
  return parts[parts.length - 1] || '';
}

// ============================================
// Token Transfer Confirmation
// ============================================

interface TokenTransferProps {
  tokens: Token[];
  targetMap: Map;
  onConfirm: (selectedTokenIds: string[]) => void;
  onCancel: () => void;
  isSwitching: boolean;
}

function TokenTransferConfirmation({
  tokens,
  targetMap,
  onConfirm,
  onCancel,
  isSwitching,
}: TokenTransferProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleToken = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(tokens.map((t) => t.id)));
  const selectNone = () => setSelected(new Set());

  return (
    <div className="mt-3 p-3 bg-warm-amber/10 border border-warm-amber/30 rounded-lg space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-warm-amber flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-stone-gray">
            Current map has {tokens.length} token{tokens.length !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-stone-gray/70">
            Select which to transfer to <span className="font-medium">{targetMap.name}</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 text-xs">
        <button type="button" onClick={selectAll} className="text-moss-green hover:underline">
          Select all
        </button>
        <span className="text-stone-gray/40">·</span>
        <button type="button" onClick={selectNone} className="text-stone-gray hover:underline">
          Select none
        </button>
      </div>

      <div className="space-y-1 max-h-36 overflow-y-auto">
        {tokens.map((token) => (
          <label
            key={token.id}
            className="flex items-center gap-2 p-1.5 rounded hover:bg-warm-amber/10 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(token.id)}
              onChange={() => toggleToken(token.id)}
              className="rounded accent-moss-green"
            />
            <span className="text-sm text-stone-gray truncate">{token.name}</span>
            {token.layer === 'spirit' && (
              <span className="text-xs text-spirit-purple bg-spirit-purple/10 px-1 rounded">spirit</span>
            )}
          </label>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          onClick={onCancel}
          disabled={isSwitching}
          variant="secondary" className="text-xs py-1 px-3"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(Array.from(selected))}
          disabled={isSwitching}
          className="text-xs py-1 px-3 flex items-center gap-1.5"
        >
          {isSwitching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Switching...
            </>
          ) : (
            <>
              <ChevronRight className="w-3 h-3" />
              Switch Map
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Map Card
// ============================================

interface MapCardProps {
  map: Map;
  isActive: boolean;
  campaignId: string;
  onSetActive: (map: Map) => void;
  onEdit: (map: Map) => void;
  onDelete: (map: Map) => void;
  onExport: (map: Map) => void;
  switchingToId: string | null;
  tokens: Token[];
  currentMap: Map | null;
}

function MapCard({
  map,
  isActive,
  campaignId: _campaignId,
  onSetActive,
  onEdit,
  onDelete,
  onExport,
  switchingToId,
  tokens: _tokens,
  currentMap: _currentMap,
}: MapCardProps) {
  const thumbnailId = extractAssetId(map.imageUrl);
  const isSwitchingToThis = switchingToId === map.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`bg-parchment/50 border rounded-xl overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
        isActive ? 'border-moss-green/60' : 'border-moss-green/20'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-moss-green/10 overflow-hidden">
        {thumbnailId ? (
          <img
            src={api.getAssetUrl(thumbnailId, 'maps')}
            alt={map.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const t = e.target as HTMLImageElement;
              t.onerror = null;
              t.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-10 h-10 text-stone-gray/30" />
          </div>
        )}

        {/* Active badge */}
        {isActive && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-moss-green text-white text-xs font-semibold rounded-full shadow">
            <CheckCircle className="w-3 h-3" />
            Active
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-semibold text-moss-green truncate text-sm mb-0.5">{map.name}</h3>
        <p className="text-xs text-stone-gray/60">
          {map.width}×{map.height} grid · {map.gridSize}px/sq
        </p>

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => onSetActive(map)}
            disabled={isActive || isSwitchingToThis}
            title={isActive ? 'Already active' : 'Set as active map'}
            className={`flex-1 text-xs py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
              isActive
                ? 'bg-moss-green/10 text-moss-green/50 cursor-not-allowed'
                : 'bg-moss-green/10 hover:bg-moss-green/20 text-moss-green'
            }`}
          >
            {isSwitchingToThis ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3" />
            )}
            {isActive ? 'Active' : 'Set Active'}
          </button>

          <button
            type="button"
            onClick={() => onEdit(map)}
            title="Edit map"
            className="p-1.5 rounded-lg bg-warm-amber/10 hover:bg-warm-amber/20 text-warm-amber transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onExport(map)}
            title="Export as .uvtt file"
            className="p-1.5 rounded-lg bg-moss-green/10 hover:bg-moss-green/20 text-moss-green transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(map)}
            disabled={isActive}
            title={isActive ? 'Cannot delete the active map' : 'Delete map'}
            className={`p-1.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-red-500/5 text-red-400/40 cursor-not-allowed'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-600'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// MapManager (main component)
// ============================================

export default function MapManager({ isOpen, onClose }: MapManagerProps) {
  const { campaign, currentMap, setCurrentMap } = useCampaign();
  const { socket } = useWebSocket();

  const [maps, setMaps] = useState<Map[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingMap, setEditingMap] = useState<Map | null>(null);

  // Map switching state
  const [switchingToMap, setSwitchingToMap] = useState<Map | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // Local active map tracking — updated after each successful switch
  // (campaign.currentMapId is not updated by setCurrentMap, only by refreshCampaign)
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  // Tokens fetched from the full current map before showing transfer UI
  const [currentMapTokens, setCurrentMapTokens] = useState<Token[]>([]);

  // Confirm delete
  const [mapToDelete, setMapToDelete] = useState<Map | null>(null);

  // UVTT import
  const uvttInputRef = useRef<HTMLInputElement>(null);
  const [isImportingUVTT, setIsImportingUVTT] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Fetch maps when the panel opens
  const fetchMaps = useCallback(async () => {
    if (!campaign?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const fetched = await mapService.getMaps(campaign.id);
      setMaps(fetched);
    } catch {
      setError('Failed to load maps.');
    } finally {
      setIsLoading(false);
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (isOpen) {
      // Sync active map from campaign on open
      setActiveMapId(campaign?.currentMapId ?? null);
      fetchMaps();
    }
  }, [isOpen, fetchMaps, campaign?.currentMapId]);

  // ---- CRUD handlers ----

  const handleCreated = (map: Map) => {
    setMaps((prev) => [map, ...prev]);
  };

  const handleUpdated = (updated: Map) => {
    setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    // If the updated map is the current one, refresh context
    if (currentMap?.id === updated.id) {
      setCurrentMap(updated);
    }
  };

  const handleExport = async (map: Map) => {
    if (!campaign?.id) return;
    try {
      const url = api.getExportUVTTUrl(campaign.id, map.id);
      // Use a hidden link to trigger the download with session cookies
      const link = document.createElement('a');
      link.href = url;
      link.download = `${map.name}.uvtt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to export map.');
    }
  };

  const handleDeleteClick = (map: Map) => {
    setMapToDelete(map);
  };

  const handleConfirmDelete = async () => {
    if (!campaign?.id || !mapToDelete) return;
    const map = mapToDelete;
    setMapToDelete(null);
    try {
      await mapService.deleteMap(campaign.id, map.id);
      setMaps((prev) => prev.filter((m) => m.id !== map.id));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete map.');
    }
  };

  // ---- UVTT import ----

  const handleUVTTImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !campaign?.id) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    setIsImportingUVTT(true);
    setError(null);
    setImportSuccess(null);
    try {
      const result = await mapService.importUVTT(campaign.id, file);
      setMaps((prev) => [result.map, ...prev]);
      const parts = [`${result.totalSegments} wall segments`];
      if (result.portalCount > 0) parts.push(`${result.portalCount} doors`);
      if ((result as any).lightCount > 0) parts.push(`${(result as any).lightCount} lights`);
      setImportSuccess(`Imported "${result.map.name}" with ${parts.join(', ')}`);
      // Auto-clear success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to import UVTT file.';
      setError(msg);
    } finally {
      setIsImportingUVTT(false);
    }
  };

  // ---- Map switching ----

  const handleSetActiveClick = async (map: Map) => {
    if (!campaign?.id || map.id === activeMapId) return;

    if (currentMap) {
      // Fetch full current map to get actual tokens (context tokens may be empty
      // because they come from the lightweight campaign maps list)
      setIsSwitching(true);
      try {
        const fullCurrentMap = await mapService.getMap(campaign.id, currentMap.id);
        const actualTokens = fullCurrentMap.tokens || [];
        setCurrentMapTokens(actualTokens);
        setIsSwitching(false);
        if (actualTokens.length > 0) {
          // Show token transfer confirmation UI
          setSwitchingToMap(map);
        } else {
          performSwitch(map, []);
        }
      } catch {
        setIsSwitching(false);
        setCurrentMapTokens([]);
        performSwitch(map, []);
      }
    } else {
      performSwitch(map, []);
    }
  };

  const handleTransferConfirm = async (selectedTokenIds: string[]) => {
    if (!switchingToMap) return;
    await performSwitch(switchingToMap, selectedTokenIds);
    setSwitchingToMap(null);
  };

  const handleTransferCancel = () => {
    setSwitchingToMap(null);
    setCurrentMapTokens([]);
  };

  const performSwitch = async (targetMap: Map, tokenIdsToTransfer: string[]) => {
    if (!campaign?.id) return;
    setIsSwitching(true);
    setError(null);

    try {
      // 1. Transfer selected tokens to the new map
      if (tokenIdsToTransfer.length > 0 && currentMap) {
        const tokensToTransfer = currentMapTokens.filter((t) =>
          tokenIdsToTransfer.includes(t.id)
        );
        await Promise.all(
          tokensToTransfer.map(async (token) => {
            // Add to new map (clamp position to new map bounds)
            await api.addToken(campaign.id, targetMap.id, {
              characterId: token.characterId,
              name: token.name,
              imageUrl: extractAssetId(token.imageUrl) || token.imageUrl,
              position: {
                x: Math.min(token.position.x, targetMap.width - 1),
                y: Math.min(token.position.y, targetMap.height - 1),
              },
              size: token.size,
              layer: token.layer,
              visible: token.visible,
              controlledBy: token.controlledBy,
              rotation: token.rotation,
              conditions: token.conditions,
              metadata: token.metadata,
            });
            // Remove from current map
            await api.deleteToken(campaign.id, currentMap.id, token.id);
          })
        );
      }

      // 2. Set target map as current
      await mapService.setCurrentMap(campaign.id, targetMap.id);

      // 3. Fetch full map (with filtered tokens)
      const fullMap = await mapService.getMap(campaign.id, targetMap.id);

      // 4. Update context + live token store
      setCurrentMap(fullMap);
      useGameStore.getState().setTokens(fullMap.tokens || []);

      // 5. Update local active map tracking so the badge updates immediately
      setActiveMapId(targetMap.id);
      setCurrentMapTokens([]);

      // 6. Notify other connected clients via WebSocket
      if (socket) {
        socket.emitMapChange(targetMap.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to switch map. Please try again.');
    } finally {
      setIsSwitching(false);
    }
  };

  if (!campaign) return null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-full max-w-xl bg-paper-white shadow-2xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-sm border-b border-moss-green/20 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-6 h-6 text-moss-green" />
                    <div>
                      <h2 className="text-xl font-bold text-moss-green">Map Library</h2>
                      <p className="text-xs text-stone-gray">{campaign.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={() => uvttInputRef.current?.click()}
                      disabled={isImportingUVTT}
                      variant="secondary" className="flex items-center gap-2 text-sm"
                      title="Import a .uvtt or .dd2vtt file (Dungeondraft, DunGen, Dungeon Alchemist, etc.)"
                    >
                      {isImportingUVTT ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Import UVTT
                    </Button>
                    <input
                      ref={uvttInputRef}
                      type="file"
                      accept=".uvtt,.dd2vtt,.df2vtt"
                      onChange={handleUVTTImport}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Create Map
                    </Button>
                    <button
                      onClick={onClose}
                      className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-stone-gray" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-700 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                {importSuccess && (
                  <div className="mb-4 p-3 bg-moss-green/10 border border-moss-green/30 rounded-lg text-moss-green text-sm flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    {importSuccess}
                  </div>
                )}

                {isLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-moss-green animate-spin" />
                  </div>
                ) : maps.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <MapPin className="w-14 h-14 mx-auto text-stone-gray/25" />
                    <p className="text-stone-gray font-medium">No maps yet</p>
                    <p className="text-sm text-stone-gray/60">
                      Create your first map to start your adventure.
                    </p>
                    <Button
                      type="button"
                      onClick={() => setCreateModalOpen(true)}
                      className="inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create Map
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <AnimatePresence>
                      {maps.map((map) => (
                        <div key={map.id}>
                          <MapCard
                            map={map}
                            isActive={map.id === activeMapId}
                            campaignId={campaign.id}
                            onSetActive={handleSetActiveClick}
                            onEdit={setEditingMap}
                            onDelete={handleDeleteClick}
                            onExport={handleExport}
                            switchingToId={isSwitching ? switchingToMap?.id ?? null : null}
                            tokens={currentMapTokens}
                            currentMap={currentMap}
                          />
                          {/* Token transfer confirmation (shown under the target card) */}
                          {switchingToMap?.id === map.id && (
                            <TokenTransferConfirmation
                              tokens={currentMapTokens}
                              targetMap={map}
                              onConfirm={handleTransferConfirm}
                              onCancel={handleTransferCancel}
                              isSwitching={isSwitching}
                            />
                          )}
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Map Modal */}
      <CreateMapModal
        isOpen={createModalOpen}
        campaignId={campaign.id}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Edit Map Modal */}
      {editingMap && (
        <EditMapModal
          isOpen={!!editingMap}
          map={editingMap}
          campaignId={campaign.id}
          onClose={() => setEditingMap(null)}
          onUpdated={handleUpdated}
        />
      )}
      <ConfirmDialog
        isOpen={!!mapToDelete}
        title="Delete Map"
        message={`Delete "${mapToDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setMapToDelete(null)}
      />
    </>
  );
}
