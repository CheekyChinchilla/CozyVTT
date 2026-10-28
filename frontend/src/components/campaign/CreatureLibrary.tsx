/**
 * CreatureLibrary
 * DM slide-over panel for browsing, searching, and placing creatures from the library.
 * Supports SRD creatures (global, read-only) and campaign-specific custom creatures.
 * Creatures are placed on the map via a "Place on Map" button that creates a token
 * with the creature's stats copied into the token's statBlock field.
 */

import { DISPOSITION_PICKED, tokenPlaceholder } from '@/utils/tokenColours';
import { useState, useEffect, useEffectEvent, useCallback, useRef, type RefObject } from 'react';
import {
  X,
  Search,
  Loader2,
  BookOpen,
  Skull,
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
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { STAT_BLOCK_LIMITS } from '@/constants/statBlockLimits';
import type { CreatureTemplate, NpcStatBlock } from '@/types';
import { TokenType, GameSystem, AssetType, TokenDisposition } from '@/types';
import {
  StatBlockViewer,
  buildCreatureStatBlock,
  ProficiencyEditor,
  Pf2eProficiencyEditor,
} from './npc-stat-blocks';
import { changeAbilitiesOrRating } from './npc-stat-blocks/statBlockProficiency';
import { PF2E_ATTRIBUTE_LABELS, readAttributeModifiers } from './npc-stat-blocks/pf2eStatBlock';
import { ABILITY_KEYS, CHALLENGE_RATINGS, type AbilityKey } from '@/utils/rules/dnd5e';
import { GAME_SYSTEM_SHORT_LABELS } from '@/constants/game-systems';
import Button from '@/components/ui/Button';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import AssetPicker from '@/components/assets/AssetPicker';
import { extractAssetId } from '@/utils/assetUrl';
import { cn } from '@/utils/cn';
import { BackToList, useLibraryFormStep } from './libraryFormStep';

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

/**
 * The credit the SRD 5.1's licence, CC BY 4.0, asks for wherever its material
 * is shown: beside the import, and at the foot of the library whenever it
 * lists an SRD creature. SRD_ATTRIBUTION.md has the full notice.
 */
function SrdCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[10px] text-stone-gray/60 ${className}`}>
      Includes material from the{' '}
      <a
        href="https://dnd.wizards.com/resources/systems-reference-document"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-brand-ink"
      >
        System Reference Document 5.1
      </a>{' '}
      by Wizards of the Coast LLC, licensed under{' '}
      <a
        href="https://creativecommons.org/licenses/by/4.0/legalcode"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-brand-ink"
      >
        CC BY 4.0
      </a>
      . Served by Open5e.
    </p>
  );
}

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
  // The creature whose Delete button was clicked, until it is confirmed or cancelled.
  const [creatureToDelete, setCreatureToDelete] = useState<CreatureTemplate | null>(null);
  // On a narrow screen the form is a step of its own, in place of the list.
  const {
    asStep: formAsStep,
    compact,
    headingRef: formHeadingRef,
    createButtonRef: formCreateButtonRef,
    opened: formOpened,
    closed: formClosed,
  } = useLibraryFormStep(showCreateForm);

  // ── Favorites state ──
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteCreatures, setFavoriteCreatures] = useState<CreatureTemplate[]>([]);
  const [showFavorites, setShowFavorites] = useState(true);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);

  // ── SRD seed state ──
  const [srdCount, setSrdCount] = useState<number | null>(null);
  // Only an administrator may import the SRD creatures; the server says who.
  const [canSeed, setCanSeed] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  // Kept apart from `error`, which every list load clears, so a failed
  // import's reason stays up when the list loads again.
  const [seedError, setSeedError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The search the list last loaded with. Opening the library loads the list
  // (the effect below); the search box's wait reloads it only for a search
  // that differs, where it used to fire on opening too and load it twice.
  const searchedFor = useRef(searchQuery);

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
    searchedFor.current = searchQuery;
    fetchCreatures(true);
    // Also check seed status and load favorites
    api.getSeedStatus(campaign.id)
      .then((s) => { setSrdCount(s.srdCount); setCanSeed(s.canSeed === true); })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetches on opening and on a filter change; typing searches through the debounce below
  }, [isOpen, campaign?.id, sourceFilter, crFilter, matchGameSystem]);

  // Debounced search
  useEffect(() => {
    if (!isOpen || searchQuery === searchedFor.current) return;
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchedFor.current = searchQuery;
      fetchCreatures(true);
    }, 300);
    return () => clearTimeout(searchTimeoutRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the search text changes, after a pause in typing
  }, [searchQuery]);

  // ── Seed SRD creatures ──
  const handleSeedSrd = useCallback(async () => {
    if (!campaign || isSeeding) return;
    setIsSeeding(true);
    setSeedResult(null);
    setSeedError(null);

    try {
      const result = await api.seedSrdCreatures(campaign.id);
      const updatedNote = result.updated ? `, ${result.updated} updated with hit points` : '';
      setSeedResult(
        `Seeded ${result.created} SRD creatures${updatedNote} (${result.skipped} already existed).`
      );
      setSrdCount((result.alreadyExisted || 0) + result.created);
      // Refresh the list
      fetchCreatures(true);
    } catch (err) {
      setSeedError(apiErrorMessage(err) || 'Failed to seed SRD creatures. Check that the server can reach api.open5e.com.');
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
        disposition: creature.disposition,
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
        tokenPayload
      );
      useGameStore.getState().addToken(result.token);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Failed to place creature on map');
    } finally {
      setPlacingId(null);
    }
  }, [campaign, currentMap]);

  // ── Duplicate creature ──
  const handleDuplicate = useCallback(async (creatureId: string) => {
    if (!campaign) return;
    try {
      const duplicate = await api.duplicateCreature(campaign.id, creatureId);
      setCreatures((prev) => [duplicate, ...prev]);
      setTotal((prev) => prev + 1);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Failed to duplicate creature');
    }
  }, [campaign]);

  // ── Delete creature ──
  const handleDelete = useCallback(async (creatureId: string) => {
    if (!campaign) return;
    setCreatureToDelete(null);
    try {
      await api.deleteCreature(campaign.id, creatureId);
      setCreatures((prev) => prev.filter((c) => c.id !== creatureId));
      // A favourite goes from Favorites too, whichever list it was deleted from.
      setFavoriteCreatures((prev) => prev.filter((c) => c.id !== creatureId));
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(creatureId);
        return next;
      });
      setTotal((prev) => prev - 1);
      if (expandedId === creatureId) setExpandedId(null);
    } catch (err) {
      setError(apiErrorMessage(err) || 'Failed to delete creature');
    }
  }, [campaign, expandedId]);

  // ── Edit creature (opens form with pre-filled data) ──
  // A wide screen folds the row away to make room for the form under the
  // list. On a narrow one the list is out of sight while the form is open,
  // and the row stays open so its Edit button can take focus back.
  const handleEdit = useCallback((creature: CreatureTemplate, opener: HTMLElement) => {
    setEditingCreature(creature);
    setShowCreateForm(true);
    if (!compact) setExpandedId(null);
    formOpened(opener);
  }, [compact, formOpened]);

  const closeForm = useCallback(() => {
    setShowCreateForm(false);
    setEditingCreature(null);
    formClosed();
  }, [formClosed]);

  // ── Handle edit completion ──
  const handleEdited = useCallback((updated: CreatureTemplate) => {
    setCreatures((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    setFavoriteCreatures((prev) => prev.map((c) => c.id === updated.id ? updated : c));
    closeForm();
  }, [closeForm]);

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
    } catch (err) {
      setError(apiErrorMessage(err) || 'Could not change your favourites');
    }
  }, [campaign, creatures]);

  // ── Load more ──
  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
  };

  const loadNextPage = useEffectEvent(() => fetchCreatures(false));
  useEffect(() => {
    if (offset > 0) loadNextPage();
  }, [offset]);

  const hasMore = creatures.length < total;

  return (
    <>
    <SlideOver
      open={isOpen}
      onClose={onClose}
      side="left"
      backdropClassName="bg-black/40"
      className="max-w-md bg-paper-white shadow-2xl flex flex-col"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
        <Skull className="w-5 h-5 text-brand-ink shrink-0" />
        <SlideOverTitle className="flex-1 text-base font-bold text-brand-ink">
          Creature Library
        </SlideOverTitle>
        <span className="text-xs text-stone-gray/60">
          {total} creature{total !== 1 ? 's' : ''}
        </span>
        <SlideOverClose className="btn-secondary p-1.5 shrink-0" iconClassName="w-4 h-4" title="Close" />
      </div>

      {/* ── The list, with its search and filters: out of sight while the
          form is a step of its own, and kept mounted, so the control that
          opened the form is there to take focus back. Hidden by its class,
          which needs no help from the base styles' [hidden] rule against
          `contents`, and by the attribute, for assistive technology ── */}
      <div hidden={formAsStep} className={formAsStep ? 'hidden' : 'contents'}>
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
          {/* TODO(ui): while a creature's edit form is open on a wide screen,
              Create Custom leaves it open as Edit Creature, since
              editingCreature is not cleared. It should open an empty form,
              as New Template does in Token Templates. */}
          <button
            ref={formCreateButtonRef}
            onClick={(e) => { setShowCreateForm(true); formOpened(e.currentTarget); }}
            className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80 transition-colors"
          >
            <Plus className="w-3 h-3" /> Create Custom
          </button>
          {/* The label names the system it imports: this seeds the D&D 5e
              bestiary whatever the campaign's system, which was not
              obvious from a bare "Import SRD Creatures". */}
          {srdCount === 0 && canSeed && (
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
          <div className="text-[10px] text-success-ink bg-success/10 rounded-sm px-2 py-1">
            {seedResult}
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {[error, seedError].filter(Boolean).map((message) => (
        <div key={message} className="mx-4 mt-2 text-xs text-danger-ink bg-danger/10 border border-danger/20 rounded-cozy px-3 py-2">
          {message}
        </div>
      ))}

      {/* ── Favorites Section ── */}
      {favoriteCreatures.length > 0 && (
        <div className="border-b border-moss-green/20">
          <button
            onClick={() => setShowFavorites(!showFavorites)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-moss-green/5 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Star className="w-3.5 h-3.5 text-warning-ink fill-warning" />
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
            <div className="divide-y divide-moss-green/10 bg-warning/2">
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
                    onDelete={() => setCreatureToDelete(creature)}
                    onToggleFavorite={() => handleToggleFavorite(creature.id)}
                    onEdit={(opener) => handleEdit(creature, opener)}
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
            <Skull className="w-8 h-8 text-brand-ink/30 mx-auto mb-2" />
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
            {!searchQuery && srdCount === 0 && !canSeed && (
              <p className="mt-4 text-xs text-stone-gray/60">
                The ~320 official D&amp;D 5e SRD creatures have not been imported on this server.
                Only an administrator can import them, since every campaign shares them. Ask an administrator to import them.
              </p>
            )}
            {!searchQuery && srdCount === 0 && canSeed && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-stone-gray/60">
                  Import ~320 official D&D 5e SRD creatures with full stat blocks, for every campaign on this server.
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
                <SrdCredit />
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
                onDelete={() => setCreatureToDelete(creature)}
                onToggleFavorite={() => handleToggleFavorite(creature.id)}
                onEdit={(opener) => handleEdit(creature, opener)}
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
      {creatures.some((c) => c.source === 'srd') && (
        <SrdCredit className="px-4 py-2 border-t border-moss-green/10" />
      )}
      </div>{/* the list */}

      {formAsStep && <BackToList onClick={closeForm} />}

      {/* ── Create / Edit Custom Form: under the list, or in its place on a
          narrow screen ── */}
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
          asStep={formAsStep}
          headingRef={formHeadingRef}
          onCreated={(creature) => {
            setCreatures((prev) => [creature, ...prev]);
            setTotal((prev) => prev + 1);
            closeForm();
          }}
          onEdited={handleEdited}
          onCancel={closeForm}
        />
      )}
    </SlideOver>
    <ConfirmDialog
      isOpen={creatureToDelete !== null}
      title="Delete creature"
      message={`Delete "${creatureToDelete?.name ?? ''}" from this campaign's creature library? Tokens already on a map keep their own copy of its stats. This cannot be undone.`}
      confirmLabel="Delete"
      variant="danger"
      onConfirm={() => creatureToDelete && handleDelete(creatureToDelete.id)}
      onCancel={() => setCreatureToDelete(null)}
    />
    </>
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
  /** Called with the Edit button, which takes focus back when the form's step closes. */
  onEdit: (opener: HTMLElement) => void;
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
      {/* Summary row. The star is a button of its own, laid over the row's
          button in the gap left for it: a button inside a button is not valid
          HTML, and a screen reader read the two as one control. */}
      <div className="relative hover:bg-moss-green/5 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="w-full text-left px-4 py-2.5 flex items-center gap-3"
        >
          {/* Creature avatar — image if available, colored initial otherwise */}
          {creature.imageUrl ? (
            <img
              src={creature.imageUrl}
              alt={creature.name}
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-moss-green/20"
            />
          ) : (
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${tokenPlaceholder('npc', creature.disposition)}`}
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
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
            creature.source === 'srd'
              ? 'bg-info/10 text-info-ink'
              : 'bg-moss-green/10 text-brand-ink'
          }`}>
            {creature.source === 'srd' ? 'SRD' : 'Custom'}
          </span>

          {/* Room for the favourite star */}
          <span className="w-4.5 shrink-0" aria-hidden="true" />

          {/* Expand icon */}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-stone-gray/40 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-stone-gray/40 shrink-0" />
          )}
        </button>

        {/* Favorite star, over the room left for it: the row's right padding,
            the chevron and the gap before it come to 2.75rem. */}
        <button
          type="button"
          onClick={onToggleFavorite}
          className="absolute top-1/2 right-11 -translate-y-1/2 p-0.5 rounded-sm hover:bg-warning/10 transition-colors"
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`w-3.5 h-3.5 transition-colors ${
            isFavorite
              ? 'text-warning-ink fill-warning'
              : 'text-stone-gray/30 hover:text-warning-ink'
          }`} />
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={onPlace}
              disabled={isPlacing}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/15 transition-colors font-medium"
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
                onClick={(e) => onEdit(e.currentTarget)}
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
                aria-label={`Delete ${creature.name}`}
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
          disabled={items.length >= STAT_BLOCK_LIMITS.maxListEntries}
          className="text-[10px] text-brand-ink hover:text-brand-ink/80 flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
              maxLength={STAT_BLOCK_LIMITS.maxEntryNameLength}
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
              maxLength={STAT_BLOCK_LIMITS.maxEntryDescriptionLength}
              rows={2}
              className="input-cozy w-full text-[11px] resize-y"
            />
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
            className="p-1 text-danger-ink hover:text-danger-ink shrink-0 mt-0.5"
            title="Remove"
            aria-label="Remove"
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
  /** The form is a step of its own, in the list's place: it fills the panel. */
  asStep: boolean;
  /** For the heading, which takes focus as the step opens. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  onCreated: (creature: CreatureTemplate) => void;
  onEdited: (creature: CreatureTemplate) => void;
  onCancel: () => void;
}

function CreatureForm({ campaignId, gameSystem, editingCreature, asStep, headingRef, onCreated, onEdited, onCancel }: CreatureFormProps) {
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
  const [disposition, setDisposition] = useState<TokenDisposition>(
    editingCreature?.disposition ?? TokenDisposition.HOSTILE
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

  // Ability scores and CR feed every derived save and skill, so a change
  // moves them, as in the token editor: the form used to show the new totals
  // and save the old ones. Pathfinder modifiers are printed values, not derived.
  const changeNumbers = (changes: Partial<Pick<NpcStatBlock, 'abilities' | 'challengeRating'>>) => {
    if (isPf2e) return;
    const next = changeAbilitiesOrRating(workingStatBlock, changes);
    setProficiencyFields({ savingThrows: next.savingThrows, skills: next.skills, proficiencies: next.proficiencies });
  };
  const scoreSetters: Record<AbilityKey, (value: number) => void> = {
    str: setStr, dex: setDex, con: setCon, int: setInt, wis: setWis, cha: setCha,
  };
  const changeScore = (ability: AbilityKey, value: number) => {
    scoreSetters[ability](value);
    changeNumbers({ abilities: { ...workingStatBlock.abilities, [ability]: value } });
  };

  // A Pathfinder stat block holds attribute modifiers (the token editor writes
  // them, and rolls and the viewer read them); there is no score behind them.
  const [attributeModifiers, setAttributeModifiers] = useState<Record<AbilityKey, number>>(() =>
    readAttributeModifiers(sb ?? workingStatBlock)
  );


  const handleSubmit = async () => {
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);

    // Merge the proficiency edits over the source before assembling, so the
    // carry-forward below sees the current saves and skills.
    const statBlock = buildCreatureStatBlock({ ...sb, ...proficiencyFields, level, ...(isPf2e ? { attributeModifiers } : {}) }, {
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
    } catch (err) {
      setFormError(apiErrorMessage(err) || (isEdit ? 'Failed to update creature' : 'Failed to create creature'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        'bg-parchment/40 p-4 space-y-3 overflow-y-auto',
        asStep ? 'flex-1 min-h-0' : 'border-t border-moss-green/20 max-h-[70vh]'
      )}
    >
      <div className="flex items-center justify-between">
        <h3 ref={headingRef} tabIndex={-1} className="text-xs font-semibold text-brand-ink uppercase tracking-wide">
          {isEdit ? 'Edit Creature' : 'Create Custom Creature'}
        </h3>
        {/* As a step, Back to the list above the form does this. */}
        {!asStep && (
          // TODO(ui): this X has no accessible name, so a screen reader
          // announces a bare "button". It should be named, as "Close form".
          <button onClick={onCancel} className="text-stone-gray hover:text-stone-gray/80 p-0.5">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {formError && (
        <div className="text-xs text-danger-ink bg-danger/10 rounded-sm px-2 py-1">{formError}</div>
      )}

      {/* Name */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Goblin Boss"
          maxLength={STAT_BLOCK_LIMITS.maxNameLength}
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
            maxLength={STAT_BLOCK_LIMITS.maxCreatureTypeLength}
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
            maxLength={STAT_BLOCK_LIMITS.maxAlignmentLength}
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
              onChange={(e) => {
                setCr(e.target.value);
                changeNumbers({ challengeRating: e.target.value || undefined });
              }}
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
            maxLength={STAT_BLOCK_LIMITS.maxSpeedLength}
            className="input-cozy w-full text-xs"
          />
        </div>
      </div>

      {/* Ability scores, or a Pathfinder creature's attribute modifiers */}
      {isPf2e ? (
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Attribute Modifiers</label>
          <div className="grid grid-cols-6 gap-1.5">
            {ABILITY_KEYS.map((ability) => (
              <div key={ability} className="text-center">
                <label className="text-[8px] font-bold text-brand-ink block">{PF2E_ATTRIBUTE_LABELS[ability]}</label>
                <input
                  type="number"
                  value={attributeModifiers[ability]}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setAttributeModifiers((prev) => ({ ...prev, [ability]: Number.isFinite(parsed) ? parsed : 0 }));
                  }}
                  className="input-cozy w-full text-xs text-center"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Ability Scores</label>
          <div className="grid grid-cols-6 gap-1.5">
            {ABILITY_KEYS.map((ability) => (
              <div key={ability} className="text-center">
                <label className="text-[8px] font-bold text-brand-ink block">{ability.toUpperCase()}</label>
                <input
                  type="number"
                  value={workingStatBlock.abilities[ability]}
                  onChange={(e) => changeScore(ability, parseInt(e.target.value, 10) || 10)}
                  className="input-cozy w-full text-xs text-center"
                />
              </div>
            ))}
          </div>
        </div>
      )}

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
            { d: TokenDisposition.FRIENDLY, label: 'Friendly', color: 'teal' },
            { d: TokenDisposition.NEUTRAL, label: 'Neutral', color: 'amber' },
            { d: TokenDisposition.HOSTILE, label: 'Hostile', color: 'red' },
          ]).map(({ d, label, color }) => (
            <button
              key={d}
              type="button"
              onClick={() => setDisposition(d)}
              className={`flex-1 py-1 text-[10px] rounded-cozy border transition-all ${
                disposition === d
                  ? color === 'teal'  ? DISPOSITION_PICKED.friendly
                  : color === 'amber' ? DISPOSITION_PICKED.neutral
                  :                    DISPOSITION_PICKED.hostile
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
                <input type="text" value={damageVulnerabilities} onChange={(e) => setDamageVulnerabilities(e.target.value)} placeholder="fire" maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Damage Resistances</label>
                <input type="text" value={damageResistances} onChange={(e) => setDamageResistances(e.target.value)} placeholder="cold, bludgeoning" maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Damage Immunities</label>
                <input type="text" value={damageImmunities} onChange={(e) => setDamageImmunities(e.target.value)} placeholder="poison" maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Condition Immunities</label>
                <input type="text" value={conditionImmunities} onChange={(e) => setConditionImmunities(e.target.value)} placeholder="charmed, frightened" maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Senses</label>
                <input type="text" value={senses} onChange={(e) => setSenses(e.target.value)} placeholder="darkvision 60 ft." maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
              </div>
              <div>
                <label className="text-[10px] text-stone-gray block mb-0.5">Languages</label>
                <input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="Common, Goblin" maxLength={STAT_BLOCK_LIMITS.maxDetailLength} className="input-cozy w-full text-[11px]" />
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
