// ============================================
// MapManager Component
// Slide-over panel for DMs to manage campaign maps
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionExit } from '@/utils/motion';
import {
  Plus,
  MapPin,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Upload,
  Download,
  Eye,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useTableSwitch } from '@/hooks/useTableSwitch';
import { api } from '@/services/api';
import mapService from '@/services/map.service';
import type { Asset, CampaignMap } from '@/types';
import CreateMapModal from './CreateMapModal';
import TokenTransferConfirmation from './TokenTransferConfirmation';
import EditMapModal from './EditMapModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Button from '@/components/ui/Button';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import { extractAssetId } from '@/utils/assetUrl';
import { rememberPictureAsset } from './map/paint/mapPicture';
import { usePaintStore } from '@/stores/paintStore';
import { apiErrorCode, apiErrorMessage } from '@/utils/errors';
import {
  uvttImportDecision,
  uvttImportMessage,
  uvttImportTitle,
  hasOutOfBounds,
} from '@/utils/uvttImport';
import type { UvttImportDecision } from '@/utils/uvttImport';

interface MapManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Map Card
// ============================================

interface MapCardProps {
  map: CampaignMap;
  isActive: boolean;
  /** The map the DM has open to prepare on this page. */
  isPrepared: boolean;
  onSetActive: (map: CampaignMap) => void;
  onOpenToPrepare: (map: CampaignMap) => void;
  onEdit: (map: CampaignMap) => void;
  onDelete: (map: CampaignMap) => void;
  onExport: (map: CampaignMap) => void;
  switchingToId: string | null;
  openingId: string | null;
}

function MapCard({
  map,
  isActive,
  isPrepared,
  onSetActive,
  onOpenToPrepare,
  onEdit,
  onDelete,
  onExport,
  switchingToId,
  openingId,
}: MapCardProps) {
  const thumbnailId = extractAssetId(map.imageUrl);
  const isSwitchingToThis = switchingToId === map.id;
  const isOpeningThis = openingId === map.id;
  const cardExit = useMotionExit({ opacity: 0, scale: 0.95 });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={cardExit}
      className={`bg-parchment/50 border rounded-xl overflow-hidden shadow-xs transition-shadow hover:shadow-md ${
        isActive ? 'border-moss-green/60' : isPrepared ? 'border-info/60' : 'border-moss-green/20'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-36 bg-moss-green/10 overflow-hidden">
        {thumbnailId ? (
          <img
            src={api.getAssetThumbnailUrl(thumbnailId, 'maps')}
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
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-moss-green text-brand-text text-xs font-semibold rounded-full shadow-sm">
            <CheckCircle className="w-3 h-3" />
            Active
          </div>
        )}
        {/* The map open on this page to prepare, which the players are not on */}
        {isPrepared && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-paper-white text-info-ink border border-info/50 text-xs font-semibold rounded-full shadow-sm">
            <Eye className="w-3 h-3" />
            Preparing
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-semibold text-brand-ink truncate text-sm mb-0.5">{map.name}</h3>
        <p className="text-xs text-stone-gray/60">
          {map.width}×{map.height} grid · {map.gridSize}px/sq
        </p>

        {/* Actions: the two that change what is on screen on a row of
            their own, as a card two to a row is too narrow for five. */}
        <div className="flex items-center gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => onSetActive(map)}
            disabled={isActive || isSwitchingToThis}
            title={isActive ? 'Already active' : 'Set as active map'}
            className={`flex-1 text-xs py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
              isActive
                ? 'bg-moss-green/10 text-brand-ink/50 cursor-not-allowed'
                : 'bg-moss-green/10 hover:bg-moss-green/15 text-brand-ink'
            }`}
          >
            {isSwitchingToThis ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3" />
            )}
            {isActive ? 'Active' : 'Set Active'}
          </button>

          {/* Open it on this page only; the players stay where they are. */}
          {!isActive && (
            <button
              type="button"
              onClick={() => onOpenToPrepare(map)}
              disabled={isPrepared || isOpeningThis}
              title={isPrepared ? 'On your screen now, while the players stay on the active map' : 'Open on your screen only, while the players stay on the active map'}
              className={`touch-target flex-1 text-xs py-1.5 px-2 rounded-lg transition-colors flex items-center justify-center gap-1 ${
                isPrepared
                  ? 'bg-info/10 text-info-ink/60 cursor-not-allowed'
                  : 'bg-info/10 hover:bg-info/15 text-info-ink'
              }`}
            >
              {isOpeningThis ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
              {isPrepared ? 'Preparing' : 'Open to prepare'}
            </button>
          )}
        </div>

        {/* TODO(ui): Set Active, Edit, Export and Delete are under 44 px on a
            touch screen (the Map Library is drawn outside the compact
            layout's finger-controls); give them touch-target, as Open to
            prepare has. */}
        <div className="flex items-center justify-end gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => onEdit(map)}
            title="Edit map"
            aria-label="Edit map"
            className="p-1.5 rounded-lg bg-warm-amber/10 hover:bg-warm-amber/15 text-accent-ink transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onExport(map)}
            title="Export as .uvtt file"
            aria-label="Export as .uvtt file"
            className="p-1.5 rounded-lg bg-moss-green/10 hover:bg-moss-green/15 text-brand-ink transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(map)}
            disabled={isActive}
            title={isActive ? 'Cannot delete the active map' : 'Delete map'}
            aria-label={isActive ? 'Cannot delete the active map' : 'Delete map'}
            className={`p-1.5 rounded-lg transition-colors ${
              isActive
                ? 'bg-danger/5 text-danger-ink/40 cursor-not-allowed'
                : 'bg-danger/10 hover:bg-danger/15 text-danger-ink'
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
  const { campaign, currentMap, viewedMap, isPreparing, updateMap, upsertCampaignMap, removeCampaignMap, openToPrepare, mayChangeViewedMap } = useCampaign();
  const tableSwitch = useTableSwitch();

  const [maps, setMaps] = useState<CampaignMap[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingMap, setEditingMap] = useState<CampaignMap | null>(null);

  // The map being opened to prepare, while it loads.
  const [openingId, setOpeningId] = useState<string | null>(null);

  // The active map comes straight from the campaign: setCurrentMap keeps
  // campaign.currentMapId in step with every switch, so there is no separate
  // copy here to fall out of date.
  const activeMapId = campaign?.currentMapId ?? null;

  const preparedMapId = isPreparing ? viewedMap?.id ?? null : null;

  // Confirm delete
  const [mapToDelete, setMapToDelete] = useState<CampaignMap | null>(null);

  // UVTT import
  const uvttInputRef = useRef<HTMLInputElement>(null);
  const [isImportingUVTT, setIsImportingUVTT] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  /**
   * A UVTT the server would not import without being asked: its walls reach
   * outside its picture, or it carries walls for its furniture, or both. Held
   * here so the same file can be sent again with the answer.
   */
  const [uvttToConfirm, setUvttToConfirm] = useState<{
    file: File;
    decision: UvttImportDecision;
  } | null>(null);
  const [includeObjectWalls, setIncludeObjectWalls] = useState(false);

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
      fetchMaps();
    }
  }, [isOpen, fetchMaps]);

  // ---- CRUD handlers ----

  const handleCreated = (map: CampaignMap, drawnPicture?: Asset) => {
    setMaps((prev) => [map, ...prev]);
    upsertCampaignMap(map);
    // A drawn map opens on this screen with Paint on, the players staying
    // where they are; its picture is known to be drawn without asking.
    if (drawnPicture) {
      rememberPictureAsset(drawnPicture);
      usePaintStore.getState().openWhenShown(map.id);
      void handleOpenToPrepare(map);
    }
  };

  const handleUpdated = (updated: CampaignMap) => {
    setMaps((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    upsertCampaignMap(updated);
    // The table's map or the one being prepared, whichever this is. A map
    // being prepared is told of its edit by nothing else: the server sends
    // map.changed for the table's map alone.
    updateMap(updated.id, updated);
  };

  const handleExport = async (map: CampaignMap) => {
    if (!campaign?.id) return;
    setError(null);
    try {
      await api.downloadUVTTExport(campaign.id, map.id, `${map.name}.uvtt`);
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Failed to export map.');
    }
  };

  const handleDeleteClick = (map: CampaignMap) => {
    setMapToDelete(map);
  };

  const handleConfirmDelete = async () => {
    if (!campaign?.id || !mapToDelete) return;
    const map = mapToDelete;
    setMapToDelete(null);
    // The map on screen, being prepared: whatever holds it is asked first.
    // Deleting it ends preparing (removeCampaignMap).
    if (map.id === preparedMapId && !(await mayChangeViewedMap({ kind: 'delete', toMapId: activeMapId }))) return;
    try {
      await mapService.deleteMap(campaign.id, map.id);
      setMaps((prev) => prev.filter((m) => m.id !== map.id));
      removeCampaignMap(map.id);
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Failed to delete map.');
    }
  };

  // ---- UVTT import ----

  const runUVTTImport = async (
    file: File,
    opts: { confirm?: boolean; includeObjectWalls?: boolean } = {}
  ) => {
    if (!campaign?.id) return;
    setIsImportingUVTT(true);
    setError(null);
    setImportSuccess(null);
    try {
      const result = await mapService.importUVTT(campaign.id, file, undefined, undefined, opts);
      setMaps((prev) => [result.map, ...prev]);
      upsertCampaignMap(result.map);
      const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
      const parts = [count(result.totalSegments, 'wall segment')];
      if (result.portalCount > 0) parts.push(count(result.portalCount, 'door'));
      if (result.lightCount > 0) parts.push(count(result.lightCount, 'light'));
      setImportSuccess(`Imported "${result.map.name}" with ${parts.join(', ')}`);
      // Auto-clear success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (err: unknown) {
      // The file needs an answer before it can become a map. Nothing has been
      // created; ask, then send the same file again with the decision.
      if (apiErrorCode(err) === 'UVTT_IMPORT_NEEDS_CONFIRMATION') {
        const decision = uvttImportDecision(err);
        if (decision) {
          setIncludeObjectWalls(false);
          setUvttToConfirm({ file, decision });
          return;
        }
      }
      setError(apiErrorMessage(err) || 'Failed to import UVTT file.');
    } finally {
      setIsImportingUVTT(false);
    }
  };

  const handleUVTTImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !campaign?.id) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    await runUVTTImport(file);
  };

  const handleConfirmUVTTImport = async () => {
    const pending = uvttToConfirm;
    setUvttToConfirm(null);
    if (pending) await runUVTTImport(pending.file, { confirm: true, includeObjectWalls });
  };

  // ---- Map switching ----

  const handleOpenToPrepare = async (map: CampaignMap) => {
    setError(null);
    setOpeningId(map.id);
    try {
      // On this page only, so the Map Library gets out of the way of it.
      if (await openToPrepare(map.id)) onClose();
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Could not open that map. Try again.');
    } finally {
      // Only this card's: a second card opened meanwhile keeps its spinner.
      setOpeningId((opening) => (opening === map.id ? null : opening));
    }
  };

  if (!campaign) return null;

  return (
    <>
      <SlideOver
        open={isOpen}
        onClose={onClose}
        className="max-w-xl bg-paper-white shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-xs border-b border-moss-green/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-brand-ink" />
              <div>
                <SlideOverTitle className="text-xl font-bold text-brand-ink">Map Library</SlideOverTitle>
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
              <SlideOverClose
                className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
                iconClassName="w-5 h-5 text-stone-gray"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {(error ?? tableSwitch.error) && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger-ink text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error ?? tableSwitch.error}
            </div>
          )}

          {importSuccess && (
            <div className="mb-4 p-3 bg-moss-green/10 border border-moss-green/30 rounded-lg text-brand-ink text-sm flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {importSuccess}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-brand-ink animate-spin" />
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
            // One card to a row on a phone: two to a row left each about
            // 150 px, too narrow for Set Active, Edit, Export and Delete.
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <AnimatePresence>
                {maps.map((map) => (
                  <div key={map.id}>
                    <MapCard
                      map={map}
                      isActive={map.id === activeMapId}
                      isPrepared={map.id === preparedMapId}
                      onSetActive={(target) => { setError(null); void tableSwitch.requestSwitch(target); }}
                      onOpenToPrepare={(target) => { void handleOpenToPrepare(target); }}
                      onEdit={setEditingMap}
                      onDelete={handleDeleteClick}
                      onExport={handleExport}
                      switchingToId={tableSwitch.switching ? tableSwitch.pending?.id ?? null : null}
                      openingId={openingId}
                    />
                    {/* Token transfer confirmation (shown under the target card) */}
                    {tableSwitch.pending?.id === map.id && (
                      <TokenTransferConfirmation
                        tokens={tableSwitch.tableTokens}
                        fromMap={currentMap}
                        targetMap={map}
                        onConfirm={(ids) => { void tableSwitch.confirm(ids); }}
                        onCancel={tableSwitch.cancel}
                        isSwitching={tableSwitch.switching}
                      />
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </SlideOver>

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
        isOpen={!!uvttToConfirm}
        title={uvttImportTitle(uvttToConfirm?.decision)}
        message={uvttImportMessage(uvttToConfirm?.decision)}
        confirmLabel={
          uvttToConfirm && !hasOutOfBounds(uvttToConfirm.decision.outOfBounds)
            ? 'Import'
            : 'Import anyway'
        }
        variant="warning"
        onConfirm={handleConfirmUVTTImport}
        onCancel={() => setUvttToConfirm(null)}
      >
        {uvttToConfirm && uvttToConfirm.decision.objectWalls > 0 && (
          <label className="flex items-start gap-2 text-sm text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeObjectWalls}
              onChange={(e) => setIncludeObjectWalls(e.target.checked)}
              className="mt-0.5"
            />
            <span>Let furniture block sight too</span>
          </label>
        )}
      </ConfirmDialog>
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
