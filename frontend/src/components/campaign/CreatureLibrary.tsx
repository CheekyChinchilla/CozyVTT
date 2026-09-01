/**
 * CreatureLibrary
 * DM slide-over panel for browsing, searching, and placing creatures from the library.
 * Supports SRD creatures (global, read-only) and campaign-specific custom creatures.
 * Creatures are placed on the map via a "Place on Map" button that creates a token
 * with the creature's stats copied into the token's statBlock field.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Search,
  Loader2,
  BookOpen,
  Plus,
  Copy,
  ChevronDown,
  ChevronRight,
  MapPin,
  Star,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import api from '@/services/api';
import type { CreatureTemplate, NpcStatBlock } from '@/types';
import { TokenType, GameSystem, AssetType } from '@/types';
import {
  StatBlockViewer,
  buildCreatureStatBlock,
  ProficiencyEditor,
  Pf2eProficiencyEditor,
} from './npc-stat-blocks';
import { CHALLENGE_RATINGS } from '@/utils/rules/dnd5e';
import { GAME_SYSTEM_SHORT_LABELS } from '@/constants/game-systems';
import Button from '@/components/ui/Button';
import AssetPicker from '@/components/assets/AssetPicker';
import { extractAssetId } from '@/utils/assetUrl';

// ============================================
// Constants
// ============================================

// Challenge ratings come from the shared rules module so the filter dropdown
// and the creature form cannot drift apart — and so a CR the form offers is
// always one the proficiency-bonus table recognises.
const CR_OPTIONS = CHALLENGE_RATINGS;

const SOURCE_FILTERS = [
  { value: '', label: 'All Sources' },
  { value: 'srd', label: 'SRD (Official)' },
  { value: 'custom', label: 'Custom / Homebrew' },
];

// ============================================
// Props
// ============================================

interface CreatureLibraryProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Component
// ============================================

export default function CreatureLibrary({ isOpen, onClose }: CreatureLibraryProps) {
  const { campaign, currentMap } = useCampaign();
  const { socket } = useWebSocket();

  // ── Search & filter state ──
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [crFilter, setCrFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  /**
   * Whether to limit the library to this campaign's game system.
   *
   * Defaults to doing so: a Call of Cthulhu table has no use for 322 D&D
   * monsters in its browse list. It stays a toggle rather than a hard rule
   * because only D&D 5e ships SRD content, so a DM running anything else may
   * legitimately want to borrow a stat block as a starting point.
   */
  const [matchGameSystem, setMatchGameSystem] = useState(true);

  // ── Data state ──
  const [creatures, setCreatures] = useState<CreatureTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 30;

  // ── UI state ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCreature, setEditingCreature] = useState<CreatureTemplate | null>(null);

  // ── Favorites state ──
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteCreatures, setFavoriteCreatures] = useState<CreatureTemplate[]>([]);
  const [showFavorites, setShowFavorites] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  // ── SRD seed state ──
  const [srdCount, setSrdCount] = useState<number | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Fetch creatures ──
  const fetchCreatures = useCallback(async (resetOffset = false) => {
    if (!campaign) return;
    setIsLoading(true);
    setError(null);

    const newOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);

    try {
      const result = await api.listCreatures(campaign.id, {
        search: searchQuery || undefined,
        source: sourceFilter || undefined,
        cr: crFilter || undefined,
        // A campaign with no system set has nothing to match against, so it
        // always sees everything.
        gameSystem: matchGameSystem ? (campaign.gameSystem ?? undefined) : undefined,
        limit: LIMIT,
        offset: newOffset,
      });
      if (resetOffset) {
        setCreatures(result.creatures);
      } else {
        setCreatures((prev) => newOffset === 0 ? result.creatures : [...prev, ...result.creatures]);
      }
      setTotal(result.total);
    } catch {
      setError('Failed to load creature library');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, searchQuery, sourceFilter, crFilter, matchGameSystem, offset]);

  // Fetch on open and when filters change
  useEffect(() => {
    if (!isOpen || !campaign) return;
    fetchCreatures(true);
    // Also check seed status and load favorites
    api.getSeedStatus(campaign.id)
      .then((s) => setSrdCount(s.srdCount))
      .catch(() => {}); // non-critical
    setIsLoadingFavorites(true);
    api.listCreatureFavorites(campaign.id)
      .then((res) => {
        setFavoriteIds(new Set(res.favoriteIds));
        setFavoriteCreatures(res.creatures);
      })
      .catch(() => {})
      .finally(() => setIsLoadingFavorites(false));
    // matchGameSystem belongs here with the other filters: without it, toggling
    // between this campaign's system and all systems changed the dropdown but
    // never refetched the list.
  }, [isOpen, campaign?.id, sourceFilter, crFilter, matchGameSystem]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      fetchCreatures(true);
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  // ── Place creature on map ──
  // ── Seed SRD creatures ──
  const handleSeedSrd = useCallback(async () => {
    if (!campaign || isSeeding) return;
    setIsSeeding(true);
    setSeedResult(null);
    setError(null);

    try {
      const result = await api.seedSrdCreatures(campaign.id);
      const updatedNote = result.updated ? `, ${result.updated} updated with hit points` : '';
      setSeedResult(
        `Seeded ${result.created} SRD creatures${updatedNote} (${result.skipped} already existed).`
      );
      setSrdCount((result.alreadyExisted || 0) + result.created);
      // Refresh the list
      fetchCreatures(true);
    } catch {
      setError('Failed to seed SRD creatures. Check that the server can reach api.open5e.com.');
    } finally {
      setIsSeeding(false);
    }
  }, [campaign, isSeeding, fetchCreatures]);

  // ── Place creature on map ──
  const handlePlace = useCallback(async (creature: CreatureTemplate) => {
    if (!campaign || !currentMap) return;
    setPlacingId(creature.id);

    const position = {
      x: Math.floor(currentMap.width / 2),
      y: Math.floor(currentMap.height / 2),
    };

    // HP from the creature's stat block; creatures saved before HP was tracked
    // fall back to 10, which the DM can adjust via NpcQuickEditor
    const hpMax = creature.statBlock?.hpMax ?? 10;

    try {
      const tokenPayload = {
        name: creature.name,
        imageUrl: creature.imageUrl || '',
        position,
        size: creature.size || { width: 1, height: 1 },
        type: TokenType.NPC,
        displayMode: creature.displayMode || 'pog',
        disposition: creature.disposition || 'hostile',
        hp: { current: hpMax, max: hpMax, temp: 0 },
        showHpBar: true,
        visible: true,
        controlledBy: null,
        conditions: [],
        notes: '',
        initiative: null,
        statBlock: creature.statBlock,
        creatureTemplateId: creature.id,
      };

      const result = await api.addToken(
        campaign.id,
        currentMap.id,
        tokenPayload as Parameters<typeof api.addToken>[2]
      );
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);
    } catch {
      setError('Failed to place creature on map');
    } finally {
      setPlacingId(null);
    }
  }, [campaign, currentMap, socket]);

  // ── Duplicate creature ──
  const handleDuplicate = useCallback(async (creatureId: string) => {
    if (!campaign) return;
    try {
      const duplicate = await api.duplicateCreature(campaign.id, creatureId);
      setCreatures((prev) => [duplicate, ...prev]);
      setTotal((prev) => prev + 1);
    } catch {
      setError('Failed to duplicate creature');
    }
  }, [campaign]);

  // ── Delete creature ──
  const handleDelete = useCallback(async (creatureId: string) => {
    if (!campaign) return;
    try {
      await api.deleteCreature(campaign.id, creatureId);
      setCreatures((prev) => prev.filter((c) => c.id !== creatureId));
      setTotal((prev) => prev - 1);
      if (expandedId === creatureId) setExpandedId(null);
    } catch {
      setError('Failed to delete creature');
    }
  }, [campaign, expandedId]);

  // ── Edit creature (opens form with pre-filled data) ──
  const handleEdit = useCallback((creature: CreatureTemplate) => {
    setEditingCreature(creature);
    setShowCreateForm(true);
    setExpandedId(null);
  }, []);

  // ── Handle edit completion ──
  const handleEdited = useCallback((updated: CreatureTemplate) => {
    setCreatures((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setFavoriteCreatures((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setEditingCreature(null);
    setShowCreateForm(false);
  }, []);

  // ── Toggle favorite ──
  const handleToggleFavorite = useCallback(async (creatureId: string) => {
    if (!campaign) return;
    try {
      const { favorited } = await api.toggleCreatureFavorite(campaign.id, creatureId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (favorited) {
          next.add(creatureId);
        } else {
          next.delete(creatureId);
        }
        return next;
      });
      if (favorited) {
        // Add to favorites list — find from main list or fetch
        const creature = creatures.find((c) => c.id === creatureId);
        if (creature) {
          setFavoriteCreatures((prev) => [...prev, creature].sort((a, b) => a.name.localeCompare(b.name)));
        } else {
          // Creature might not be loaded yet — fetch it
          try {
            const fetched = await api.getCreature(campaign.id, creatureId);
            setFavoriteCreatures((prev) => [...prev, fetched].sort((a, b) => a.name.localeCompare(b.name)));
          } catch { /* non-critical */ }
        }
      } else {
        setFavoriteCreatures((prev) => prev.filter((c) => c.id !== creatureId));
      }
    } catch {
      // non-critical, fail silently
    }
  }, [campaign, creatures]);

  // ── Load more ──
  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
  };

  useEffect(() => {
    if (offset > 0) fetchCreatures(false);
  }, [offset]);

  const hasMore = creatures.length < total;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="creature-lib-backdrop"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="creature-lib-panel"
            className="fixed left-0 top-0 h-full z-50 w-full max-w-md bg-paper-white shadow-2xl flex flex-col"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
              <BookOpen className="w-5 h-5 text-brand-ink flex-shrink-0" />
              <h2 className="flex-1 text-base font-bold text-brand-ink">
                Creature Library
              </h2>
              <span className="text-xs text-stone-gray/60">
                {total} creature{total !== 1 ? 's' : ''}
              </span>
              <Button onClick={onClose} variant="secondary" className="p-1.5 flex-shrink-0" title="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* ── Search & Filters ── */}
            <div className="px-4 py-3 border-b border-moss-green/10 space-y-2">
              {/* Search bar */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search creatures..."
                  className="input-cozy w-full pl-8 text-sm"
                />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80 transition-colors"
              >
                {showFilters ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Filters
              </button>

              {/* Filter controls */}
              {showFilters && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                      className="input-cozy text-xs flex-1"
                    >
                      {SOURCE_FILTERS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={crFilter}
                      onChange={(e) => setCrFilter(e.target.value)}
                      className="input-cozy text-xs w-20"
                    >
                      <option value="">All CR</option>
                      {CR_OPTIONS.map((cr) => (
                        <option key={cr} value={cr}>CR {cr}</option>
                      ))}
                    </select>
                  </div>
                  {/* Only meaningful when the campaign has a system to match. */}
                  {campaign?.gameSystem && (
                    <select
                      aria-label="Game system filter"
                      value={matchGameSystem ? 'campaign' : 'all'}
                      onChange={(e) => setMatchGameSystem(e.target.value === 'campaign')}
                      className="input-cozy text-xs w-full"
                    >
                      <option value="campaign">
                        {GAME_SYSTEM_SHORT_LABELS[campaign.gameSystem]} only (this campaign)
                      </option>
                      <option value="all">All game systems</option>
                    </select>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Create Custom
                </button>
                {/* The label names the system it imports: this seeds the D&D 5e
                    bestiary whatever the campaign's system, which was not
                    obvious from a bare "Import SRD Creatures". */}
                {srdCount === 0 && (
                  <button
                    onClick={handleSeedSrd}
                    disabled={isSeeding}
                    className="flex items-center gap-1 text-xs text-info-ink hover:text-info-ink transition-colors"
                  >
                    {isSeeding ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Seeding...</>
                    ) : (
                      <><BookOpen className="w-3 h-3" /> Import D&amp;D 5e SRD</>
                    )}
                  </button>
                )}
              </div>
              {seedResult && (
                <div className="text-[10px] text-success-ink bg-success/10 rounded px-2 py-1">
                  {seedResult}
                </div>
              )}
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="mx-4 mt-2 text-xs text-danger-ink bg-danger/10 border border-danger/20 rounded-cozy px-3 py-2">
                {error}
              </div>
            )}

            {/* ── Favorites Section ── */}
            {favoriteCreatures.length > 0 && (
              <div className="border-b border-moss-green/20">
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-moss-green/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Star className="w-3.5 h-3.5 text-warning-ink fill-amber-500" />
                    <span className="text-xs font-semibold text-stone-gray uppercase tracking-wide">
                      Favorites
                    </span>
                    <span className="text-[10px] text-stone-gray/50">({favoriteCreatures.length})</span>
                  </div>
                  {showFavorites ? (
                    <ChevronDown className="w-3.5 h-3.5 text-stone-gray/40" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-stone-gray/40" />
                  )}
                </button>
                {showFavorites && (
                  <div className="divide-y divide-moss-green/10 bg-warning/[0.02]">
                    {isLoadingFavorites ? (
                      <div className="flex items-center gap-2 text-stone-gray text-xs py-3 px-4">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading favorites...
                      </div>
                    ) : (
                      favoriteCreatures.map((creature) => (
                        <CreatureRow
                          key={`fav-${creature.id}`}
                          creature={creature}
                          isExpanded={expandedId === creature.id}
                          isPlacing={placingId === creature.id}
                          isFavorite={true}
                          gameSystem={campaign?.gameSystem ?? null}
                          onToggle={() => setExpandedId(expandedId === creature.id ? null : creature.id)}
                          onPlace={() => handlePlace(creature)}
                          onDuplicate={() => handleDuplicate(creature.id)}
                          onDelete={() => handleDelete(creature.id)}
                          onToggleFavorite={() => handleToggleFavorite(creature.id)}
                          onEdit={() => handleEdit(creature)}
                        />
                      ))
                    )}
                    <p className="text-[9px] text-stone-gray/40 px-4 py-1.5 italic">
                      Favorites are per campaign
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Creature List ── */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && creatures.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-stone-gray">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading creatures...
                </div>
              ) : creatures.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <BookOpen className="w-8 h-8 text-brand-ink/30 mx-auto mb-2" />
                  <p className="text-sm text-stone-gray/70">
                    {searchQuery ? 'No creatures match your search.' : 'No creatures in the library yet.'}
                  </p>
                  {/* The likeliest reason a non-D&D campaign looks empty: only
                      D&D 5e ships SRD content, and the library defaults to this
                      campaign's system. Say so rather than looking broken. */}
                  {!searchQuery && matchGameSystem && campaign?.gameSystem && (srdCount ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-stone-gray/60">
                      Showing {GAME_SYSTEM_SHORT_LABELS[campaign.gameSystem]} creatures only.{' '}
                      <button
                        type="button"
                        onClick={() => { setMatchGameSystem(false); setShowFilters(true); }}
                        className="underline hover:text-brand-ink"
                      >
                        Show all game systems
                      </button>{' '}
                      to browse creatures from other systems.
                    </p>
                  )}
                  {!searchQuery && srdCount === 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs text-stone-gray/60">
                        Import ~320 official D&D 5e SRD creatures with full stat blocks.
                      </p>
                      <Button
                        onClick={handleSeedSrd}
                        disabled={isSeeding}
                        className="text-xs py-2 px-4"
                      >
                        {isSeeding ? (
                          <><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> Importing from Open5e...</>
                        ) : (
                          'Import D&D 5e SRD Creatures'
                        )}
                      </Button>
                      <p className="text-[10px] text-stone-gray/40">
                        SRD 5.1 content by Wizards of the Coast, used under CC BY 4.0.
                        Served by Open5e.
                      </p>
                    </div>
                  )}
                  {!searchQuery && (srdCount === null || srdCount > 0) && (
                    <p className="text-xs text-stone-gray/50 mt-1">
                      Try adjusting your filters, or create a custom creature.
                    </p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-moss-green/10">
                  {creatures.map((creature) => (
                    <CreatureRow
                      key={creature.id}
                      creature={creature}
                      isExpanded={expandedId === creature.id}
                      isPlacing={placingId === creature.id}
                      isFavorite={favoriteIds.has(creature.id)}
                      gameSystem={campaign?.gameSystem ?? null}
                      onToggle={() => setExpandedId(expandedId === creature.id ? null : creature.id)}
                      onPlace={() => handlePlace(creature)}
                      onDuplicate={() => handleDuplicate(creature.id)}
                      onDelete={() => handleDelete(creature.id)}
                      onToggleFavorite={() => handleToggleFavorite(creature.id)}
                      onEdit={() => handleEdit(creature)}
                    />
                  ))}

                  {/* Load more */}
                  {hasMore && (
                    <div className="p-4 text-center">
                      <Button
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        variant="secondary" className="text-xs"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                            Loading...
                          </>
                        ) : (
                          `Load More (${creatures.length} of ${total})`
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Create / Edit Custom Form (inline) ── */}
            {showCreateForm && (
              // Keyed on the creature being edited so switching directly from
              // one creature to another remounts the form. handleEdit leaves
              // showCreateForm true, so without this the form kept the previous
              // creature's field state and saving wrote those stats onto the
              // newly selected creature.
              <CreatureForm
                key={editingCreature?.id ?? 'new'}
                campaignId={campaign?.id || ''}
                gameSystem={campaign?.gameSystem ?? null}
                editingCreature={editingCreature}
                onCreated={(creature) => {
                  setCreatures((prev) => [creature, ...prev]);
                  setTotal((prev) => prev + 1);
                  setShowCreateForm(false);
                  setEditingCreature(null);
                }}
                onEdited={handleEdited}
                onCancel={() => { setShowCreateForm(false); setEditingCreature(null); }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Creature Row
// ============================================

interface CreatureRowProps {
  creature: CreatureTemplate;
  isExpanded: boolean;
  isPlacing: boolean;
  isFavorite: boolean;
  gameSystem: GameSystem | null;
  onToggle: () => void;
  onPlace: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
}

function CreatureRow({
  creature,
  isExpanded,
  isPlacing,
  isFavorite,
  gameSystem,
  onToggle,
  onPlace,
  onDuplicate,
  onDelete,
  onToggleFavorite,
  onEdit,
}: CreatureRowProps) {
  const statBlock = creature.statBlock as NpcStatBlock;

  return (
    <div>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-moss-green/5 transition-colors"
      >
        {/* Creature avatar — image if available, colored initial otherwise */}
        {creature.imageUrl ? (
          <img
            src={creature.imageUrl}
            alt={creature.name}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-moss-green/20"
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm ${
              creature.disposition === 'hostile' ? 'bg-danger' :
              creature.disposition === 'friendly' ? 'bg-teal-500' : 'bg-warning'
            }`}
          >
            {creature.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-black truncate">{creature.name}</div>
          <div className="text-[10px] text-stone-gray/60 flex gap-2">
            {creature.challengeRating && <span>CR {creature.challengeRating}</span>}
            {statBlock.creatureType && <span className="truncate">{statBlock.creatureType}</span>}
          </div>
        </div>

        {/* Source badge */}
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
          creature.source === 'srd'
            ? 'bg-info/10 text-info-ink'
            : 'bg-moss-green/10 text-brand-ink'
        }`}>
          {creature.source === 'srd' ? 'SRD' : 'Custom'}
        </span>

        {/* Favorite star */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="flex-shrink-0 p-0.5 rounded hover:bg-warning/10 transition-colors"
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`w-3.5 h-3.5 transition-colors ${
            isFavorite
              ? 'text-warning-ink fill-amber-500'
              : 'text-stone-gray/30 hover:text-warning-ink'
          }`} />
        </button>

        {/* Expand icon */}
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-stone-gray/40 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-gray/40 flex-shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onPlace}
              disabled={isPlacing}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/20 transition-colors font-medium"
            >
              {isPlacing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MapPin className="w-3 h-3" />
              )}
              {isPlacing ? 'Placing...' : 'Place on Map'}
            </button>
            {creature.source !== 'srd' && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-moss-green/20 text-brand-ink hover:bg-moss-green/10 transition-colors"
                title="Edit creature"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            )}
            <button
              onClick={onDuplicate}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-moss-green/20 text-stone-gray hover:border-moss-green/40 transition-colors"
              title="Duplicate as custom creature"
            >
              <Copy className="w-3 h-3" /> Duplicate
            </button>
            {creature.source !== 'srd' && (
              <button
                onClick={onDelete}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-danger/20 text-danger-ink hover:bg-danger/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>

          {/* Stat block viewer */}
          <div className="glass-panel p-3 max-h-80 overflow-y-auto">
            <StatBlockViewer
              statBlock={statBlock}
              tokenName={creature.name}
              gameSystem={gameSystem}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Name/Description pair list — reusable for traits, actions, etc.
// ============================================

function NameDescriptionList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: Array<{ name: string; description: string }>;
  onChange: (items: Array<{ name: string; description: string }>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-stone-gray font-medium">{label}</label>
        <button
          type="button"
          onClick={() => onChange([...items, { name: '', description: '' }])}
          className="text-[10px] text-brand-ink hover:text-brand-ink/80 flex items-center gap-0.5"
        >
          <Plus className="w-2.5 h-2.5" /> Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5 items-start">
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={item.name}
              onChange={(e) => {
                const updated = [...items];
                updated[i] = { ...updated[i], name: e.target.value };
                onChange(updated);
              }}
              placeholder="Name"
              className="input-cozy w-full text-[11px]"
            />
            <textarea
              value={item.description}
              onChange={(e) => {
                const updated = [...items];
                updated[i] = { ...updated[i], description: e.target.value };
                onChange(updated);
              }}
              placeholder="Description"
              rows={2}
              className="input-cozy w-full text-[11px] resize-y"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="p-1 text-danger-ink hover:text-danger-ink flex-shrink-0 mt-0.5"
            title="Remove"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Creature Form — Create & Edit
// ============================================

interface CreatureFormProps {
  campaignId: string;
  gameSystem: GameSystem | null;
  editingCreature: CreatureTemplate | null;
  onCreated: (creature: CreatureTemplate) => void;
  onEdited: (creature: CreatureTemplate) => void;
  onCancel: () => void;
}

function CreatureForm({ campaignId, gameSystem, editingCreature, onCreated, onEdited, onCancel }: CreatureFormProps) {
  const isEdit = !!editingCreature;
  const sb = editingCreature?.statBlock;

  // ── Basic fields ──
  const [name, setName] = useState(editingCreature?.name ?? '');
  const [creatureType, setCreatureType] = useState(editingCreature?.creatureType ?? sb?.creatureType ?? '');
  const [alignment, setAlignment] = useState(editingCreature?.alignment ?? sb?.alignment ?? '');
  const [cr, setCr] = useState(editingCreature?.challengeRating ?? sb?.challengeRating ?? '');
  const [ac, setAc] = useState(sb?.ac ?? 10);
  const [speed, setSpeed] = useState(sb?.speed ?? '30 ft.');
  const [hpMax, setHpMax] = useState(sb?.hpMax ?? 10);
  const [str, setStr] = useState(sb?.abilities?.str ?? 10);
  const [dex, setDex] = useState(sb?.abilities?.dex ?? 10);
  const [con, setCon] = useState(sb?.abilities?.con ?? 10);
  const [int, setInt] = useState(sb?.abilities?.int ?? 10);
  const [wis, setWis] = useState(sb?.abilities?.wis ?? 10);
  const [cha, setCha] = useState(sb?.abilities?.cha ?? 10);
  const [disposition, setDisposition] = useState<'hostile' | 'friendly' | 'neutral'>(
    (editingCreature?.disposition as 'hostile' | 'friendly' | 'neutral') ?? 'hostile'
  );

  // ── Image field ──
  const [imageUrl, setImageUrl] = useState(editingCreature?.imageUrl ?? '');

  // ── Advanced stat block fields ──
  const [showAdvanced, setShowAdvanced] = useState(isEdit && !!(sb?.traits?.length || sb?.actions?.length));
  const [traits, setTraits] = useState<Array<{ name: string; description: string }>>(sb?.traits ?? []);
  const [actions, setActions] = useState<Array<{ name: string; description: string }>>(sb?.actions ?? []);
  const [bonusActions, setBonusActions] = useState<Array<{ name: string; description: string }>>(sb?.bonusActions ?? []);
  const [reactions, setReactions] = useState<Array<{ name: string; description: string }>>(sb?.reactions ?? []);
  const [legendaryActions, setLegendaryActions] = useState<Array<{ name: string; description: string }>>(sb?.legendaryActions ?? []);
  const [damageVulnerabilities, setDamageVulnerabilities] = useState(sb?.damageVulnerabilities ?? '');
  const [damageResistances, setDamageResistances] = useState(sb?.damageResistances ?? '');
  const [damageImmunities, setDamageImmunities] = useState(sb?.damageImmunities ?? '');
  const [conditionImmunities, setConditionImmunities] = useState(sb?.conditionImmunities ?? '');
  const [senses, setSenses] = useState(sb?.senses ?? '');
  const [languages, setLanguages] = useState(sb?.languages ?? '');

  // Saves, skills and their proficiency metadata are edited together by
  // ProficiencyEditor, which works on a whole stat block. Holding just those
  // three fields here keeps the rest of the form's flat state untouched.
  const [proficiencyFields, setProficiencyFields] = useState<
    Pick<NpcStatBlock, 'savingThrows' | 'skills' | 'proficiencies'>
  >({
    savingThrows: sb?.savingThrows,
    skills: sb?.skills,
    proficiencies: sb?.proficiencies,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Pathfinder 2e rates creatures by Level rather than Challenge Rating, and
  // stores printed modifiers instead of deriving them.
  const isPf2e = gameSystem === GameSystem.PATHFINDER_2E;
  const [level, setLevel] = useState<number | undefined>(sb?.level);

  // The stat block the proficiency editor sees: live ability scores and CR from
  // this form (both feed the derived bonuses) plus the proficiency state above.
  const workingStatBlock: NpcStatBlock = {
    ac,
    hpMax,
    speed,
    abilities: { str, dex, con, int, wis, cha },
    challengeRating: cr || undefined,
    level,
    ...proficiencyFields,
  };


  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    // Merge the proficiency edits over the source before assembling, so the
    // carry-forward below sees the current saves and skills.
    const statBlock = buildCreatureStatBlock({ ...sb, ...proficiencyFields, level }, {
      ac,
      hpMax,
      speed,
      abilities: { str, dex, con, int, wis, cha },
      creatureType,
      alignment,
      challengeRating: cr,
      traits,
      actions,
      bonusActions,
      reactions,
      legendaryActions,
      damageVulnerabilities,
      damageResistances,
      damageImmunities,
      conditionImmunities,
      senses,
      languages,
    });

    const payload = {
      name: name.trim(),
      gameSystem,
      challengeRating: cr || null,
      creatureType: creatureType || null,
      alignment: alignment || null,
      imageUrl: imageUrl || null,
      statBlock,
      size: editingCreature?.size ?? { width: 1, height: 1 },
      disposition,
      displayMode: editingCreature?.displayMode ?? 'pog' as const,
    };

    try {
      if (isEdit && editingCreature) {
        const updated = await api.updateCreature(campaignId, editingCreature.id, payload);
        onEdited(updated);
      } else {
        const creature = await api.createCreature(campaignId, payload);
        onCreated(creature);
      }
    } catch {
      setFormError(isEdit ? 'Failed to update creature' : 'Failed to create creature');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-moss-green/20 bg-parchment/40 p-4 space-y-3 max-h-[70vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-brand-ink uppercase tracking-wide">
          {isEdit ? 'Edit Creature' : 'Create Custom Creature'}
        </h3>
        <button onClick={onCancel} className="text-stone-gray hover:text-stone-gray/80 p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {formError && (
        <div className="text-xs text-danger-ink bg-danger/10 rounded px-2 py-1">{formError}</div>
      )}

      {/* Name */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Goblin Boss"
          className="input-cozy w-full text-sm"
        />
      </div>

      {/* Image — browse the campaign's token assets or upload a new one.
          Uploads go through the same endpoint as before, so magic-byte
          validation and the campaign scope are unchanged. */}
      <AssetPicker
        label="Token Image"
        type={AssetType.TOKEN}
        campaignId={campaignId}
        selectedAssetId={extractAssetId(imageUrl)}
        onSelect={(asset) => setImageUrl(asset ? asset.id : '')}
        columns={5}
        searchPlaceholder="Search token images..."
        emptyMessage="No token images yet. Upload one to get started."
      />

      {/* Type & Alignment */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Creature Type</label>
          <input
            type="text"
            value={creatureType}
            onChange={(e) => setCreatureType(e.target.value)}
            placeholder="Small humanoid"
            className="input-cozy w-full text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Alignment</label>
          <input
            type="text"
            value={alignment}
            onChange={(e) => setAlignment(e.target.value)}
            placeholder="neutral evil"
            className="input-cozy w-full text-xs"
          />
        </div>
      </div>

      {/* AC, CR, HP, Speed */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">AC</label>
          <input
            type="number"
            value={ac}
            onChange={(e) => setAc(parseInt(e.target.value, 10) || 0)}
            className="input-cozy w-full text-xs"
          />
        </div>
        {isPf2e ? (
          <div>
            <label className="text-[10px] text-stone-gray block mb-0.5" htmlFor="creature-level">Level</label>
            <input
              id="creature-level"
              type="number"
              min={-1}
              max={30}
              value={level ?? ''}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setLevel(Number.isFinite(parsed) ? parsed : undefined);
              }}
              placeholder="5"
              className="input-cozy w-full text-xs text-center"
            />
          </div>
        ) : (
          <div>
            <label className="text-[10px] text-stone-gray block mb-0.5" htmlFor="creature-cr">CR</label>
            {/* A select, not free text: CR determines the proficiency bonus, so a
                typo would silently change every derived save and skill. */}
            <select
              id="creature-cr"
              value={cr}
              onChange={(e) => setCr(e.target.value)}
              className="input-cozy w-full text-xs"
            >
              <option value="">—</option>
              {CR_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">HP Max</label>
          <input
            type="number"
            value={hpMax}
            onChange={(e) => setHpMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
            min={1}
            className="input-cozy w-full text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Speed</label>
          <input
            type="text"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            className="input-cozy w-full text-xs"
          />
        </div>
      </div>

      {/* Ability scores */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Ability Scores</label>
        <div className="grid grid-cols-6 gap-1.5">
          {([
            ['STR', str, setStr],
            ['DEX', dex, setDex],
            ['CON', con, setCon],
            ['INT', int, setInt],
            ['WIS', wis, setWis],
            ['CHA', cha, setCha],
          ] as const).map(([label, val, setter]) => (
            <div key={label} className="text-center">
              <label className="text-[8px] font-bold text-brand-ink block">{label}</label>
              <input
                type="number"
                value={val}
                onChange={(e) => (setter as (v: number) => void)(parseInt(e.target.value, 10) || 10)}
                className="input-cozy w-full text-xs text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Saves & skills — derived from the ability scores and CR above. This
          form had no fields for these at all, which is why editing a duplicated
          SRD creature used to delete them. */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-1">Saving Throws &amp; Skills</label>
        {isPf2e ? (
          <Pf2eProficiencyEditor
            statBlock={workingStatBlock}
            onChange={(updated) =>
              setProficiencyFields({
                savingThrows: updated.savingThrows,
                skills: updated.skills,
                proficiencies: updated.proficiencies,
              })
            }
          />
        ) : (
          <ProficiencyEditor
            statBlock={workingStatBlock}
            onChange={(updated) =>
              setProficiencyFields({
                savingThrows: updated.savingThrows,
                skills: updated.skills,
                proficiencies: updated.proficiencies,
              })
            }
          />
        )}
      </div>

      {/* Disposition */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Disposition</label>
        <div className="flex gap-2">
          {([
            { d: 'friendly' as const, label: 'Friendly', color: 'teal' },
            { d: 'neutral' as const, label: 'Neutral', color: 'amber' },
            { d: 'hostile' as const, label: 'Hostile', color: 'red' },
          ]).map(({ d, label, color }) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              className={`flex-1 py-1 text-[10px] rounded-cozy border transition-all ${
                disposition === d
                  ? color === 'teal'  ? 'border-teal-500 bg-teal-500/10 text-teal-700 font-semibold'
                  : color === 'amber' ? 'border-warning/60 bg-warning/10 text-warning-ink font-semibold'
                  :                     'border-danger/60 bg-danger/10 text-danger-ink font-semibold'
                  : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Advanced Stats (collapsible) ── */}
      <div className="border-t border-moss-green/10 pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-[10px] text-brand-ink hover:text-brand-ink/80 font-medium"
        >
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced Stats
        </button>

        {showAdvanced && (
          <div className="mt-2 space-y-3">
            {/* Text fields — damage/conditions/senses/languages */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Damage Vulnerabilities</label>
                <input type="text" value={damageVulnerabilities} onChange={(e) => setDamageVulnerabilities(e.target.value)} placeholder="fire" className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Damage Resistances</label>
                <input type="text" value={damageResistances} onChange={(e) => setDamageResistances(e.target.value)} placeholder="cold, bludgeoning" className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Damage Immunities</label>
                <input type="text" value={damageImmunities} onChange={(e) => setDamageImmunities(e.target.value)} placeholder="poison" className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Condition Immunities</label>
                <input type="text" value={conditionImmunities} onChange={(e) => setConditionImmunities(e.target.value)} placeholder="charmed, frightened" className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Senses</label>
                <input type="text" value={senses} onChange={(e) => setSenses(e.target.value)} placeholder="darkvision 60 ft." className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Languages</label>
                <input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Common, Goblin" className="input-cozy w-full text-[11px]" />
              </div>
            </div>

            {/* Name/description lists — traits, actions, etc. */}
            <NameDescriptionList label="Traits" items={traits} onChange={setTraits} />
            <NameDescriptionList label="Actions" items={actions} onChange={setActions} />
            <NameDescriptionList label="Bonus Actions" items={bonusActions} onChange={setBonusActions} />
            <NameDescriptionList label="Reactions" items={reactions} onChange={setReactions} />
            <NameDescriptionList label="Legendary Actions" items={legendaryActions} onChange={setLegendaryActions} />
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim()}
          className="flex-1 text-xs py-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
              {isEdit ? 'Saving...' : 'Creating...'}
            </>
          ) : (
            isEdit ? 'Save Changes' : 'Create Creature'
          )}
        </Button>
        <Button onClick={onCancel} variant="secondary" className="text-xs py-2 px-4">
          Cancel
        </Button>
      </div>

      {!isEdit && (
        <p className="text-[9px] text-stone-gray/50">
          Expand "Advanced Stats" to add traits, actions, and detailed stat block fields.
        </p>
      )}
    </div>
  );
}
