// ============================================
// Campaign Context
// Manages campaign state and data
// ============================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { useParams, useNavigate } from 'react-router';
import campaignService from '@/services/campaign.service';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import type { Campaign, CampaignRole, CampaignStatus, CampaignMap, VibeSettings, CharacterHpUpdatedBroadcast, DmTransferredBroadcast, MemberRoleChangedBroadcast, VibeSettingsUpdatedBroadcast, CampaignSettingsUpdatedBroadcast } from '@/types';
import socketClient from '@/services/socket';
import { apiErrorMessage, apiErrorStatus, errorSummary } from '@/utils/errors';
import { withMemberRole } from '@/utils/campaignRoles';
import { optionalSessionStorage } from '@/utils/optionalStorage';

// ============================================
// Types
// ============================================

/**
 * Something on the page that cares which map it shows, such as an editor
 * with unsaved work on it. Registered with registerViewedMapGuard.
 */
export interface ViewedMapGuard {
  /**
   * Asked before the page shows another map or moves the table, with what
   * is about to happen (ViewedMapChange). False, or a promise of false,
   * leaves everything as it is. Leaving the page itself (a reload, closing
   * the tab) is the browser's beforeunload, which this does not ask.
   */
  mayLeave: (change: ViewedMapChange) => boolean | Promise<boolean>;
  /**
   * True while the map on screen must stay there. When the table is moved
   * off it from elsewhere (another tab's Set Active, a script), the page
   * then keeps it, as a map being prepared, instead of following.
   */
  holds?: () => boolean;
}

/**
 * What is about to change the map on screen, as a guard is told:
 * - `open-other`: Open to prepare on another map;
 * - `back-to-table`: Back to the table, or the phone's Back while preparing;
 * - `set-active`: the Map Library's Set Active on a map other than the one on screen;
 * - `bring-everyone`: the table brought to the map on screen (Bring everyone
 *   here, or Set Active on it), asked once the tokens to bring are chosen;
 * - `delete`: deleting the map on screen.
 * `toMapId` is the map the page shows next, or null for none.
 */
export interface ViewedMapChange {
  kind: 'open-other' | 'back-to-table' | 'set-active' | 'bring-everyone' | 'delete';
  toMapId: string | null;
}

/** Why preparing ended without the DM asking, for the page to say. */
export interface PreparingEnded {
  mapName: string;
  reason: 'deleted' | 'not-dm';
}

/** Back to the table gave up: the table moved each time its map was read. */
export class TableKeptMovingError extends Error {
  constructor() {
    super("The table moved to another map while its map was loading. Press Back to the table again.");
    this.name = 'TableKeptMovingError';
  }
}

/** This tab's map being prepared in a campaign, kept across a reload of the tab. */
export const preparingMapKey = (campaignId: string) => `cozyvtt-preparing-map:${campaignId}`;

// NOTE: live token state moved out of this context into the
// zustand game store (`@/stores/gameStore`). Context value changes
// re-render EVERY useCampaign() consumer, so the high-frequency token
// stream must not flow through here — subscribe with useTokenList() /
// useTokenListIgnoringMovement() and mutate via store actions instead.
interface CampaignContextState {
  // Campaign Data
  campaign: Campaign | null;
  /** The table's map: the campaign's current map, which every player is on. */
  currentMap: CampaignMap | null;
  /**
   * The map this page shows: the one the DM opened to prepare while they
   * prepare one, otherwise the table's. Everything drawn on the map and
   * every edit made there is for this map.
   */
  viewedMap: CampaignMap | null;
  /** Whether the DM is preparing a map the table is not on, on this page. */
  isPreparing: boolean;

  // User Role
  userRole: CampaignRole | null;

  // Loading & Error States
  loading: boolean;
  error: string | null;

  // Actions
  loadCampaign: (id: string) => Promise<void>;
  /**
   * Re-read the campaign after a change to it (settings, members, the DM
   * seat) and replace it in place: the table stays as it is, and the map,
   * which arrives over the socket, is not reloaded. A failure is logged and
   * the page keeps what it has.
   */
  refreshCampaign: () => Promise<void>;
  /**
   * Re-fetch ONLY the map on screen (tokens, walls, lights, fog) without
   * reloading the whole campaign envelope: the table's, or the one being
   * prepared. Used when tokens changed on the server without a map event,
   * such as a character's new token picture.
   */
  refreshCurrentMap: () => Promise<void>;
  /**
   * After a reconnect: re-read what arrives only as events (the session's
   * state, members' roles, the map the table is on) and reload that map.
   */
  catchUpAfterReconnect: () => Promise<void>;
  /**
   * Switch to a map, or clear it. Given a function, changes the map already
   * showing from its latest value, as a listener registered once must: a
   * map it captured earlier may have been edited since. The function form
   * never switches maps.
   */
  setCurrentMap: (map: CampaignMap | null | ((current: CampaignMap | null) => CampaignMap | null)) => void;
  /**
   * Replace whichever of the table's map and the map being prepared has
   * this id, with the map an edit answered or from its latest value. Never
   * moves the table: campaign.currentMapId is left alone.
   */
  updateMap: (mapId: string, map: CampaignMap | ((current: CampaignMap) => CampaignMap)) => void;
  /**
   * The table is on this map (map.changed). The table's map always follows;
   * the page follows too unless it shows a map being prepared, or something
   * on it holds the map on screen (ViewedMapGuard.holds), which then stays
   * as a prepared map. One naming the map being prepared ends preparing.
   * Answers whether the page now shows this map, with its tokens.
   */
  receiveTableMap: (map: CampaignMap) => boolean;
  /**
   * The table was moved to this map from this page (Set Active, Bring
   * everyone here) and the page goes with it: preparing ends, and its
   * tokens are the ones on screen.
   */
  showTableMap: (map: CampaignMap) => void;
  /**
   * DM: show a map of the campaign on this page only, to prepare it while
   * the players stay on the table's map. Resolves once its map and tokens
   * are on screen, true; false when a guard said no or another change of
   * the map on screen came first. Rejects when the map could not be loaded,
   * for the caller to say so. The table's own map opens as Back to the
   * table does.
   */
  openToPrepare: (mapId: string) => Promise<boolean>;
  /**
   * Stop preparing and show the table's map again, fetched afresh: while
   * preparing, the table's token moves, walls, fog and drawings were not
   * applied here. A table moved while the fetch is out is fetched again
   * where it is. False when a guard said no; rejects when the map could not
   * be loaded, and the page stays where it is.
   */
  backToTable: () => Promise<boolean>;
  /** Ask every registered guard whether the map on screen may change so; false when one says no. */
  mayChangeViewedMap: (change: ViewedMapChange) => Promise<boolean>;
  /**
   * Why preparing last ended without the DM asking (the map deleted, the DM
   * seat gone), until clearPreparingEnded: the page says so.
   */
  preparingEnded: PreparingEnded | null;
  clearPreparingEnded: () => void;
  /** Register a guard for changes of the map on screen; returns the function that removes it. */
  registerViewedMapGuard: (guard: ViewedMapGuard) => () => void;
  /**
   * Keep `campaign.maps` in step with the Map Library: insert a created or
   * imported map, or replace a renamed one by id. The Move to Map… submenu
   * reads that list, so a map missing from it cannot be a move target.
   */
  upsertCampaignMap: (map: CampaignMap) => void;
  /** Drop a deleted map from `campaign.maps`, and stop preparing it if it is the one being prepared. */
  removeCampaignMap: (mapId: string) => void;
  /** Update spirit layer enabled/style in local campaign state (after WS broadcast or API call) */
  updateCampaignSpiritLayer: (enabled: boolean, style?: string) => void;
  /** DM-only local preference: show both planes simultaneously or only the active one */
  dmViewBothPlanes: boolean;
  setDmViewBothPlanes: (val: boolean) => void;
  /** Whether this player personally has spirit layer visibility (individual crossover, not global toggle) */
  playerSpiritVisible: boolean;
  setPlayerSpiritVisible: (val: boolean) => void;
  /** Current active vibe period name (e.g. 'dawn', 'night') */
  currentVibe: string | null;
  /** Cached hue + CSS filter for the current vibe — used by MapCanvas for the overlay */
  activeVibeEffect: { hue: string; filter: string } | null;
  /** Called when vibe.updated WebSocket arrives — updates currentVibe + activeVibeEffect */
  updateVibe: (period: string, hue: string, filter: string) => void;
  /** The vibe periods as saved, and the vibe they leave in force (null for none) */
  updateVibeSettings: (settings: VibeSettings, currentVibe: string | null) => void;
  /** Current open session (id, sessionNumber, startedAt) — null when no active session */
  activeSession: { id: string; sessionNumber: number; startedAt: string } | null;
  /** Set active session — called by SessionControls after start/resume REST response */
  setActiveSession: (session: { id: string; sessionNumber: number; startedAt: string } | null) => void;
  /** Update campaign.status in local state — called by session WebSocket listeners */
  updateCampaignStatus: (status: CampaignStatus) => void;
  /** Active particle effect name ('rain' | 'mist' | 'leaves' | 'sparkles' | 'snow' | null) */
  activeAtmosphereEffect: string | null;
  /** Update atmosphere effect — called by AtmospherePlayer on WS broadcast */
  updateAtmosphereEffect: (effect: string | null) => void;
  /** Active ambient audio (assetId, audioUrl, volume, loop) or null when stopped */
  activeAtmosphereAudio: { assetId: string; audioUrl: string; volume: number; loop: boolean } | null;
  /** Update atmosphere audio — called by AtmospherePlayer on WS broadcast */
  updateAtmosphereAudio: (audio: { assetId: string; audioUrl: string; volume: number; loop: boolean } | null) => void;
}

// ============================================
// Context Creation
// ============================================

const CampaignContext = createContext<CampaignContextState | undefined>(
  undefined
);

// ============================================
// Provider Component
// ============================================

interface CampaignProviderProps {
  children: ReactNode;
}

/**
 * The atmosphere fields this context reads out of a campaign's `vibeSettings`
 * blob. Declared locally rather than as `Record<string, any>` so each optional
 * hop is checked — the reads below already guard with `??`, and the type now
 * says so.
 */
interface VibeSettingsBlob {
  atmosphereEffect?: string | null;
  atmosphereAudio?: {
    assetId?: string;
    volume?: number;
    loop?: boolean;
  };
}

/** The tint of the vibe in force: the period named `currentVibe`, or none. */
function vibeEffectOf(settings: VibeSettings | undefined, currentVibe: string | null | undefined): { hue: string; filter: string } | null {
  const period = currentVibe ? settings?.periods?.find((p) => p.name === currentVibe) : undefined;
  return period ? { hue: period.hue, filter: period.filter } : null;
}

export function CampaignProvider({ children }: CampaignProviderProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  // The campaign the page shows now, for work that finishes after an await.
  // None once the page closes: the next campaign's page reads the same token
  // store, and a late answer for this one would write over it.
  const shownCampaignId = useRef<string | null>(null);
  useEffect(() => {
    shownCampaignId.current = campaign?.id ?? null;
    return () => { shownCampaignId.current = null; };
  }, [campaign?.id]);
  const [currentMap, setCurrentMapState] = useState<CampaignMap | null>(null);
  // The map the DM opened to prepare on this page, or null to follow the
  // table. Read through the ref by work that finishes after an await and by
  // the socket handlers, which are registered once.
  const [preparedMap, setPreparedMapState] = useState<CampaignMap | null>(null);
  const preparedRef = useRef<CampaignMap | null>(null);
  const [preparingEnded, setPreparingEnded] = useState<PreparingEnded | null>(null);
  // The table's map as last written, read by work that finishes after an
  // await. Every move of the table, and every map.changed, is counted, so a
  // read of the table's map that went out before one is never applied over
  // it; an edit of the map (updateMap) is not a move and is not counted.
  const tableMapRef = useRef<CampaignMap | null>(null);
  const tableSeq = useRef(0);
  const campaignRef = useRef<Campaign | null>(null);
  campaignRef.current = campaign;
  // Each change of the map on screen this page makes (Open to prepare, Back
  // to the table, a switch, a reload's restore, a reconnect) is numbered, and
  // work that finishes after an await applies only while no newer one has
  // started. The table moving under the page is not one: it moves only the
  // table's map, or shows it where the page follows the table.
  const viewSeq = useRef(0);
  const guards = useRef(new Set<ViewedMapGuard>());
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // DM local view preference — not persisted, resets each session
  const [dmViewBothPlanes, setDmViewBothPlanes] = useState(true);
  // Per-player spirit visibility — set from REST on load, updated by WebSocket events
  const [playerSpiritVisible, setPlayerSpiritVisible] = useState(false);
  // Vibe tracker — cached visual effect for the current period
  const [activeVibeEffect, setActiveVibeEffect] = useState<{ hue: string; filter: string } | null>(null);
  // Current open session (for SessionControls)
  const [activeSession, setActiveSession] = useState<{ id: string; sessionNumber: number; startedAt: string } | null>(null);
  // Atmosphere state — effect + audio
  const [activeAtmosphereEffect, setActiveAtmosphereEffect] = useState<string | null>(null);
  const [activeAtmosphereAudio, setActiveAtmosphereAudio] = useState<{ assetId: string; audioUrl: string; volume: number; loop: boolean } | null>(null);
  // Each load is numbered and only the newest is applied, so the answer for
  // a campaign the page has already left cannot write over the next one.
  const loadSeq = useRef(0);
  // The return to the dashboard after a refused load; cancelled when the
  // page moves on first.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The same for re-reads after a settings or roster change: answers can
  // arrive out of order, and an older one would put back an older member list.
  const rereadSeq = useRef(0);

  // Derived: current vibe period name
  const currentVibe = campaign?.currentVibe ?? null;

  // Get user's role in the campaign
  const userRole =
    campaign && user
      ? campaign.memberships?.find((m) => m.userId === user.id)?.role || null
      : null;
  const userRoleRef = useRef(userRole);
  userRoleRef.current = userRole;

  // The map being prepared, written here only, and kept for this tab so a
  // reload (which iOS Safari makes of a tab it put in the background) comes
  // back to it.
  const setPrepared = useCallback((map: CampaignMap | null, ended?: PreparingEnded['reason']) => {
    const before = preparedRef.current;
    preparedRef.current = map;
    setPreparedMapState(map);
    if (!map && before && ended) setPreparingEnded({ mapName: before.name, reason: ended });
    const campaignId = shownCampaignId.current;
    if (!campaignId) return;
    if (map) optionalSessionStorage.setItem(preparingMapKey(campaignId), map.id);
    else optionalSessionStorage.removeItem(preparingMapKey(campaignId));
  }, []);

  /** Write the table's map, counting the change unless it is only an edit of it. */
  const putTableMap = useCallback((next: CampaignMap | null | ((current: CampaignMap | null) => CampaignMap | null), counted = true) => {
    const value = typeof next === 'function' ? next(tableMapRef.current) : next;
    if (value === tableMapRef.current) return;
    tableMapRef.current = value;
    if (counted) tableSeq.current += 1;
    setCurrentMapState(value);
  }, []);
  /** The table's map id, as last known. */
  const tableMapId = () => tableMapRef.current?.id ?? campaignRef.current?.currentMapId ?? null;
  /** The tokens of a map, now the ones on screen. */
  const showTokensOf = (map: CampaignMap) => useGameStore.getState().setTokens(map.tokens || [], map.id);
  /** A fetch of this map's tokens has ended without them: its events wait no longer. */
  const stopExpecting = (mapId: string) => {
    if (useGameStore.getState().loadingTokensOf === mapId) useGameStore.getState().expectTokensOf(null);
  };

  // The atmosphere and the vibe's tint, worked out from a campaign as the
  // server holds it: on the first load, and after a reconnect, when the DM
  // may have changed them while this page was away.
  const applyCampaignEffects = useCallback((data: Campaign) => {
    // Initialize atmosphere state from saved campaign vibeSettings
    const vs = data.vibeSettings as VibeSettingsBlob | undefined;
    setActiveAtmosphereEffect(vs?.atmosphereEffect ?? null);
    if (vs?.atmosphereAudio?.assetId) {
      setActiveAtmosphereAudio({
        assetId: vs.atmosphereAudio.assetId,
        audioUrl: `/api/assets/audio/${vs.atmosphereAudio.assetId}`,
        volume: vs.atmosphereAudio.volume ?? 0.5,
        loop: vs.atmosphereAudio.loop !== false,
      });
    } else {
      setActiveAtmosphereAudio(null);
    }

    setActiveVibeEffect(vibeEffectOf(data.vibeSettings, data.currentVibe));
  }, []);

  // Load campaign data
  const loadCampaign = useCallback(async (campaignId: string) => {
    const seq = ++loadSeq.current;
    const isNewest = () => seq === loadSeq.current;
    setLoading(true);
    setError(null);

    try {
      const data = await campaignService.getCampaign(campaignId);
      if (!isNewest()) return;
      setCampaign(data);

      // Initialize active session from campaign response
      setActiveSession(data.activeSession ?? null);

      applyCampaignEffects(data);

      // Load current map via the filtered REST endpoint so tokens are spirit-filtered
      // per this user's role. The campaign response (maps: true) returns raw unfiltered
      // token JSON — we must NOT use those tokens directly.
      if (data.currentMapId) {
        // Token events for the map that arrive while it is read wait for it.
        useGameStore.getState().expectTokensOf(data.currentMapId);
        try {
          const { map, spiritVisible } = await api.getMap(data.id, data.currentMapId);
          if (!isNewest()) return;
          putTableMap(map);
          showTokensOf(map);
          setPlayerSpiritVisible(spiritVisible ?? false);
        } catch {
          if (!isNewest()) return;
          // Fall back to embedded map metadata (no tokens) if the fetch fails
          const mapMeta = data.maps?.find((m: { id: string }) => m.id === data.currentMapId);
          if (mapMeta) {
            putTableMap(mapMeta);
            useGameStore.getState().setTokens([], mapMeta.id);
          } else {
            stopExpecting(data.currentMapId);
          }
        }
      }

      // A map this tab was preparing before a reload: for the DM only, and
      // only while it is still a map of the campaign the table is not on.
      const kept = optionalSessionStorage.getItem(preparingMapKey(data.id));
      const isDm = data.memberships?.some((m) => m.userId === userIdRef.current && m.role === 'DM') ?? false;
      if (kept && (!isDm || kept === data.currentMapId || !data.maps?.some((m) => m.id === kept))) {
        optionalSessionStorage.removeItem(preparingMapKey(data.id));
      } else if (kept) {
        // Superseded only by something the DM does here, which sets the
        // kept map itself; the table moving meanwhile does not cancel it.
        const seq = ++viewSeq.current;
        useGameStore.getState().expectTokensOf(kept);
        try {
          const { map } = await api.getMap(data.id, kept);
          if (!isNewest() || seq !== viewSeq.current) {
            stopExpecting(kept);
            return;
          }
          if (map.id === tableMapId()) {
            // The table has come to it while the page loaded.
            stopExpecting(kept);
            optionalSessionStorage.removeItem(preparingMapKey(data.id));
            return;
          }
          setPrepared(map);
          showTokensOf(map);
        } catch {
          stopExpecting(kept);
          if (isNewest()) optionalSessionStorage.removeItem(preparingMapKey(data.id));
        }
      }
    } catch (err) {
      if (!isNewest()) return;
      console.error('Failed to load campaign:', errorSummary(err));

      // Handle specific errors
      if (apiErrorStatus(err) === 403) {
        setError('You do not have permission to view this campaign');
        redirectTimer.current = setTimeout(() => navigate('/dashboard'), 2000);
      } else if (apiErrorStatus(err) === 404) {
        setError('Campaign not found');
        redirectTimer.current = setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        setError(apiErrorMessage(err) || 'Failed to load campaign');
      }
    } finally {
      if (isNewest()) setLoading(false);
    }
  }, [navigate, applyCampaignEffects, setPrepared, putTableMap]);

  /** The campaign as it is now, or null when a newer re-read has started or the page has moved on. */
  const rereadCampaign = useCallback(async (campaignId: string) => {
    const seq = ++rereadSeq.current;
    const fresh = await campaignService.getCampaign(campaignId);
    return seq === rereadSeq.current && shownCampaignId.current === campaignId ? fresh : null;
  }, []);

  // Re-read the campaign in place. Going through loadCampaign set `loading`,
  // so the page swapped the live table for its spinner and back: a Campaign
  // Settings save fetched every token picture again and reopened the
  // settings on their first tab.
  const refreshCampaign = useCallback(async () => {
    const campaignId = campaign?.id;
    if (!campaignId) return;
    try {
      const fresh = await rereadCampaign(campaignId);
      if (!fresh) return;
      setCampaign((prev) => (prev && prev.id === fresh.id ? fresh : prev));
      setActiveSession(fresh.activeSession ?? null);
    } catch (err) {
      console.error('[CampaignContext] Failed to refresh the campaign:', errorSummary(err));
    }
  }, [campaign?.id, rereadCampaign]);

  // Re-fetch the current map only — used after a WebSocket reconnect so the
  // local token/wall/light/fog state catches up with anything that broadcast
  // while we were disconnected. Cheaper than a full campaign reload and
  // doesn't blip atmosphere/audio state.
  const refreshCurrentMap = useCallback(async () => {
    const shown = preparedRef.current ?? tableMapRef.current;
    if (!campaign?.id || !shown) return;
    const seq = viewSeq.current;
    const tSeq = tableSeq.current;
    useGameStore.getState().expectTokensOf(shown.id);
    try {
      const { map, spiritVisible } = await api.getMap(campaign.id, shown.id);
      if (preparedRef.current?.id === map.id && seq === viewSeq.current) {
        setPrepared(map);
      } else if (tableMapRef.current?.id === map.id && !preparedRef.current && seq === viewSeq.current && tSeq === tableSeq.current) {
        putTableMap(map);
        setPlayerSpiritVisible(spiritVisible ?? false);
      } else {
        // The page has moved to another map, or a newer copy of this one
        // arrived meanwhile: these are not its tokens now.
        stopExpecting(map.id);
        return;
      }
      showTokensOf(map);
    } catch (err) {
      stopExpecting(shown.id);
      console.error('[CampaignContext] Failed to refresh current map after reconnect:', errorSummary(err));
      // Non-fatal — user will receive future real-time updates normally
    }
  }, [campaign?.id, setPrepared, putTableMap]);

  // Events sent while this page was offline are not replayed: a pause or an
  // end, a member's role, a switch to another map, the vibe, the weather and
  // ambient track, the spirit layer. Re-read them without the
  // full reload's loading screen, then load the map the table is on now,
  // which may not be the one this page had (a player may no longer read it).
  const catchUpAfterReconnect = useCallback(async () => {
    const campaignId = campaign?.id;
    if (!campaignId) return;
    // Each answer is applied only while the page still shows this campaign:
    // one arriving after a switch to another would write over it.
    const stillShown = () => shownCampaignId.current === campaignId;
    let mapId = tableMapId();
    let isDm = userRoleRef.current === 'DM';
    try {
      const fresh = await campaignService.getCampaign(campaignId);
      if (!stillShown()) return;
      setCampaign((prev) =>
        prev && prev.id === fresh.id
          ? {
              ...prev,
              status: fresh.status,
              memberships: fresh.memberships,
              currentMapId: fresh.currentMapId,
              currentVibe: fresh.currentVibe,
              vibeSettings: fresh.vibeSettings,
              spiritLayerEnabled: fresh.spiritLayerEnabled,
              spiritLayerStyle: fresh.spiritLayerStyle,
            }
          : prev
      );
      setActiveSession(fresh.activeSession ?? null);
      applyCampaignEffects(fresh);
      mapId = fresh.currentMapId ?? null;
      // The list just read, not the one this page had: the role may have
      // changed while it was away.
      isDm = fresh.memberships?.some((m) => m.userId === userIdRef.current && m.role === 'DM') ?? false;
    } catch (err) {
      console.error('[CampaignContext] Failed to refresh the campaign after reconnect:', errorSummary(err));
    }
    const seq = ++viewSeq.current;
    // The table moved off the map on screen while the page was away, and
    // something on it holds that map: it stays, as a prepared map.
    if (!preparedRef.current && isDm && tableMapRef.current && tableMapRef.current.id !== mapId
      && [...guards.current].some((g) => g.holds?.() === true)) {
      setPrepared(tableMapRef.current);
    }
    const prepared = preparedRef.current;
    // Still preparing, and still allowed to: the table may have come to that
    // map, or this user may no longer be its DM, while the page was away.
    const keepPreparing = prepared !== null && prepared.id !== mapId && isDm;
    let tableMap: CampaignMap | null = tableMapRef.current;
    if (mapId) {
      const tSeq = tableSeq.current;
      if (!keepPreparing) useGameStore.getState().expectTokensOf(mapId);
      try {
        const { map, spiritVisible } = await api.getMap(campaignId, mapId);
        if (!stillShown() || seq !== viewSeq.current) {
          stopExpecting(mapId);
          return;
        }
        // A map.changed that came in meanwhile is newer than this read.
        if (tSeq === tableSeq.current) {
          putTableMap(map);
          tableMap = map;
        }
        if (!keepPreparing) {
          if (prepared) setPrepared(null, prepared.id === mapId ? undefined : 'not-dm');
          if (tSeq === tableSeq.current) showTokensOf(map);
          else stopExpecting(mapId);
          setPlayerSpiritVisible(spiritVisible ?? false);
        }
      } catch (err) {
        stopExpecting(mapId);
        console.error('[CampaignContext] Failed to refresh the current map after reconnect:', errorSummary(err));
      }
    }
    if (!keepPreparing || !prepared) return;
    // The map being prepared, and its tokens, as the server holds them now.
    // One deleted while the page was away ends preparing.
    useGameStore.getState().expectTokensOf(prepared.id);
    try {
      const { map } = await api.getMap(campaignId, prepared.id);
      if (!stillShown() || seq !== viewSeq.current) {
        stopExpecting(prepared.id);
        return;
      }
      setPrepared(map);
      showTokensOf(map);
    } catch (err) {
      stopExpecting(prepared.id);
      if (!stillShown() || seq !== viewSeq.current) return;
      if (apiErrorStatus(err) === 404) {
        setPrepared(null, 'deleted');
        if (tableMap) showTokensOf(tableMap);
        else useGameStore.getState().setTokens([], null);
      } else {
        console.error('[CampaignContext] Failed to refresh the map being prepared after reconnect:', errorSummary(err));
      }
    }
  }, [campaign?.id, applyCampaignEffects, setPrepared, putTableMap]);

  // Update currentVibe + activeVibeEffect when vibe.updated WS event arrives
  const updateVibe = useCallback((period: string, hue: string, filter: string) => {
    setCampaign((prev) => (prev ? { ...prev, currentVibe: period } : null));
    setActiveVibeEffect({ hue, filter });
  }, []);

  // The vibe periods as saved, and the vibe they leave in force: from the
  // DM's own save, and from the broadcast every member's page is sent.
  const updateVibeSettings = useCallback((settings: VibeSettings, currentVibe: string | null) => {
    setCampaign((prev) => (prev ? { ...prev, vibeSettings: settings, currentVibe } : null));
    setActiveVibeEffect(vibeEffectOf(settings, currentVibe));
  }, []);

  // The DM saved the vibe periods. Every page shows them and the vibe's tint,
  // so each takes the periods and the vibe the save left: an edited period in
  // force shows its new colour, and one renamed or deleted ends the vibe.
  useEffect(() => {
    const handleVibeSettings = (data: VibeSettingsUpdatedBroadcast) => {
      if (shownCampaignId.current !== data?.campaignId) return;
      updateVibeSettings(data.vibeSettings, data.currentVibe);
    };
    socketClient.on('vibe.settings.updated', handleVibeSettings);
    return () => {
      socketClient.off('vibe.settings.updated', handleVibeSettings);
    };
  }, [updateVibeSettings]);

  // The DM saved Campaign Settings. A player at the table takes them without a
  // reload: the chat box's cooldown, the campaign's name and description, and
  // whether they may draw on the map.
  useEffect(() => {
    const handleSettings = (data: CampaignSettingsUpdatedBroadcast) => {
      if (shownCampaignId.current !== data?.campaignId) return;
      const { name, description, gameSystem, chatCooldownEnabled, chatCooldownSeconds, playersMayDraw } = data;
      setCampaign((prev) => (prev ? { ...prev, name, description, gameSystem, chatCooldownEnabled, chatCooldownSeconds, playersMayDraw } : null));
    };
    socketClient.on('campaign.settings.updated', handleSettings);
    return () => {
      socketClient.off('campaign.settings.updated', handleSettings);
    };
  }, []);

  // Update campaign.status in local state (called by session WebSocket listeners)
  const updateCampaignStatus = useCallback((status: CampaignStatus) => {
    setCampaign((prev) => (prev ? { ...prev, status } : null));
  }, []);

  // The campaign's current map and campaign.currentMapId are one fact: every
  // switch goes through here, so the id follows the map. The Map Library
  // re-reads campaign.currentMapId each time it opens for its Active badge,
  // which pointed at the map the page loaded with until this kept it current.
  const setCurrentMap = useCallback((map: CampaignMap | null | ((current: CampaignMap | null) => CampaignMap | null)) => {
    if (typeof map === 'function') {
      putTableMap(map);
      return;
    }
    putTableMap(map);
    if (map) {
      setCampaign((prev) =>
        prev && prev.currentMapId !== map.id ? { ...prev, currentMapId: map.id } : prev,
      );
    }
  }, [putTableMap]);

  // Keep campaign.maps in step with the Map Library (create, rename, import).
  const upsertCampaignMap = useCallback((map: CampaignMap) => {
    setCampaign((prev) => {
      if (!prev) return prev;
      const maps = prev.maps ?? [];
      return maps.some((m) => m.id === map.id)
        ? { ...prev, maps: maps.map((m) => (m.id === map.id ? map : m)) }
        : { ...prev, maps: [map, ...maps] };
    });
  }, []);

  // Leave the map being prepared for the table's, at once and asking no
  // guard: the map was deleted, or this user is no longer the DM. The page
  // says why (preparingEnded). The table's map shows at once with the
  // tokens it was last read with, then as it is now.
  const endPreparing = useCallback((reason: PreparingEnded['reason']) => {
    if (!preparedRef.current) return;
    const seq = ++viewSeq.current;
    setPrepared(null, reason);
    const tableMap = tableMapRef.current;
    if (tableMap) showTokensOf(tableMap);
    else useGameStore.getState().setTokens([], null);
    const campaignId = shownCampaignId.current;
    const tableId = tableMapId();
    if (!campaignId || !tableId) return;
    const tSeq = tableSeq.current;
    useGameStore.getState().expectTokensOf(tableId);
    api.getMap(campaignId, tableId)
      .then(({ map, spiritVisible }) => {
        if (seq !== viewSeq.current || shownCampaignId.current !== campaignId || tSeq !== tableSeq.current) {
          stopExpecting(tableId);
          return;
        }
        putTableMap(map);
        showTokensOf(map);
        setPlayerSpiritVisible(spiritVisible ?? false);
      })
      .catch((err: unknown) => {
        // The table's map stays on screen with the tokens it was last read with.
        stopExpecting(tableId);
        console.error('[CampaignContext] Failed to load the table\'s map:', errorSummary(err));
      });
  }, [setPrepared, putTableMap]);

  // Drop a deleted map from campaign.maps.
  const removeCampaignMap = useCallback((mapId: string) => {
    setCampaign((prev) => {
      if (!prev?.maps) return prev;
      return { ...prev, maps: prev.maps.filter((m) => m.id !== mapId) };
    });
    if (preparedRef.current?.id === mapId) endPreparing('deleted');
  }, [endPreparing]);

  const updateMap = useCallback((mapId: string, map: CampaignMap | ((current: CampaignMap) => CampaignMap)) => {
    const next = (current: CampaignMap) => (typeof map === 'function' ? map(current) : map);
    putTableMap((current) => (current && current.id === mapId ? next(current) : current), false);
    const prepared = preparedRef.current;
    if (prepared && prepared.id === mapId) setPrepared(next(prepared));
  }, [setPrepared, putTableMap]);

  // The page shows the table's map, now `map`, with its tokens. Preparing
  // ends: the table has come to the prepared map, or the page went with it.
  const followTable = useCallback((map: CampaignMap) => {
    setCurrentMap(map);
    if (preparedRef.current) setPrepared(null);
    // The map as the server sends it now is newer than any event kept for
    // a read of it still out: those are dropped, not applied over it, and
    // the read's older answer is not applied (tableSeq).
    if (useGameStore.getState().loadingTokensOf === map.id) useGameStore.getState().expectTokensOf(null);
    showTokensOf(map);
  }, [setCurrentMap, setPrepared]);

  const showTableMap = useCallback((map: CampaignMap) => {
    viewSeq.current += 1;
    followTable(map);
  }, [followTable]);

  const receiveTableMap = useCallback((map: CampaignMap): boolean => {
    const prepared = preparedRef.current;
    const shown = tableMapRef.current;
    // Unsaved work on the map on screen keeps it there as a prepared map,
    // for the DM alone: the table moves on without this page.
    const held = !prepared && shown !== null && shown.id !== map.id
      && userRoleRef.current === 'DM' && [...guards.current].some((g) => g.holds?.() === true);
    if (held) {
      setPrepared(shown);
      setCurrentMap(map);
      return false;
    }
    if (prepared && prepared.id !== map.id) {
      setCurrentMap(map);
      return false;
    }
    followTable(map);
    return true;
  }, [setCurrentMap, setPrepared, followTable]);

  const mayChangeViewedMap = useCallback(async (change: ViewedMapChange): Promise<boolean> => {
    for (const guard of [...guards.current]) {
      if (!(await guard.mayLeave(change))) return false;
    }
    return true;
  }, []);

  const registerViewedMapGuard = useCallback((guard: ViewedMapGuard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);

  const backToTable = useCallback(async (): Promise<boolean> => {
    if (!preparedRef.current) return true;
    if (!(await mayChangeViewedMap({ kind: 'back-to-table', toMapId: tableMapId() }))) return false;
    const campaignId = shownCampaignId.current;
    if (!campaignId) return false;
    const seq = ++viewSeq.current;
    // The table can move while its map is read; it is then read again where
    // it is, a few times at most.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // The table came to the map being prepared meanwhile: that is the table.
      if (!preparedRef.current) return true;
      const tableId = tableMapId();
      if (!tableId) {
        setPrepared(null);
        useGameStore.getState().setTokens([], null);
        return true;
      }
      const tSeq = tableSeq.current;
      useGameStore.getState().expectTokensOf(tableId);
      let answer: Awaited<ReturnType<typeof api.getMap>>;
      try {
        answer = await api.getMap(campaignId, tableId);
      } catch (err) {
        stopExpecting(tableId);
        console.error('[CampaignContext] Failed to load the table\'s map:', errorSummary(err));
        throw err;
      }
      if (seq !== viewSeq.current || shownCampaignId.current !== campaignId) {
        stopExpecting(tableId);
        return false;
      }
      if (tSeq !== tableSeq.current) continue;
      putTableMap(answer.map);
      setPrepared(null);
      showTokensOf(answer.map);
      setPlayerSpiritVisible(answer.spiritVisible ?? false);
      return true;
    }
    // Still preparing; the page says why.
    throw new TableKeptMovingError();
  }, [mayChangeViewedMap, setPrepared, putTableMap]);

  const openToPrepare = useCallback(async (mapId: string): Promise<boolean> => {
    const campaignId = shownCampaignId.current;
    if (!campaignId || userRoleRef.current !== 'DM') return false;
    if (mapId === tableMapId()) return backToTable();
    if (preparedRef.current?.id === mapId) return true;
    if (!(await mayChangeViewedMap({ kind: 'open-other', toMapId: mapId }))) return false;
    const seq = ++viewSeq.current;
    useGameStore.getState().expectTokensOf(mapId);
    try {
      const { map } = await api.getMap(campaignId, mapId);
      if (seq !== viewSeq.current || shownCampaignId.current !== campaignId || userRoleRef.current !== 'DM') {
        stopExpecting(mapId);
        return false;
      }
      // The table came to it while it loaded, and the page with it.
      if (map.id === tableMapId()) {
        stopExpecting(mapId);
        return true;
      }
      setPrepared(map);
      showTokensOf(map);
      return true;
    } catch (err) {
      stopExpecting(mapId);
      console.error('[CampaignContext] Failed to open the map to prepare:', errorSummary(err));
      throw err;
    }
  }, [backToTable, mayChangeViewedMap, setPrepared]);

  const clearPreparingEnded = useCallback(() => setPreparingEnded(null), []);

  // Update atmosphere effect (called by AtmospherePlayer on WS broadcast)
  const updateAtmosphereEffect = useCallback((effect: string | null) => {
    setActiveAtmosphereEffect(effect);
  }, []);

  // Update atmosphere audio (called by AtmospherePlayer on WS broadcast)
  const updateAtmosphereAudio = useCallback((audio: { assetId: string; audioUrl: string; volume: number; loop: boolean } | null) => {
    setActiveAtmosphereAudio(audio);
  }, []);

  // Listen for real-time character HP updates. They go to the game store,
  // where only the roster and the map's HP bars read them: a new context
  // value for every hit of a fight re-rendered everything on the page.
  useEffect(() => {
    const handleHpUpdated = (data: CharacterHpUpdatedBroadcast) => {
      useGameStore.getState().setCharacterHp(data.characterId, data.hp);
    };

    socketClient.onCharacterHpUpdated(handleHpUpdated);
    return () => {
      socketClient.off('character.hp.updated', handleHpUpdated);
    };
  }, []);

  /**
   * The DM seat moved.
   *
   * `userRole` is derived from the membership list, and everything that asks
   * "am I the DM?" reads it, so patching the list here brings the whole page
   * into line — the controls a DM gets appear, and the ones a former DM had
   * disappear, without a reload. The server has already changed what it will
   * accept, so a page still offering the old controls would only produce
   * refusals.
   */
  useEffect(() => {
    const handleDmTransferred = (data: DmTransferredBroadcast) => {
      setCampaign((prev) => {
        if (!prev || prev.id !== data.campaignId || !prev.memberships) return prev;
        return {
          ...prev,
          memberships: prev.memberships.map((m) =>
            m.userId === data.newDmId
              ? { ...m, role: 'DM' as CampaignRole }
              : m.userId === data.previousDmId
                ? { ...m, role: 'PLAYER' as CampaignRole }
                : m
          ),
        };
      });
    };

    socketClient.onDmTransferred(handleDmTransferred);
    return () => {
      socketClient.off('campaign.dm.transferred', handleDmTransferred);
    };
  }, []);

  /**
   * A member's role changed, possibly this user's own. The server has
   * already applied it to what it accepts, so the page follows: `userRole`
   * is read from the membership list. The `authenticated` reply also carries
   * this user's role, which catches a change made while this page was
   * offline and never heard.
   */
  useEffect(() => {
    const handleRoleChanged = (data: MemberRoleChangedBroadcast) => {
      setCampaign((prev) => (prev && prev.id === data.campaignId ? withMemberRole(prev, data.userId, data.role) : prev));
    };
    const handleAuthenticated = (data: { campaignId?: string; userId?: string; role?: CampaignRole }) => {
      if (!data?.campaignId || !data.userId || !data.role) return;
      const { campaignId, userId, role } = data;
      setCampaign((prev) => (prev && prev.id === campaignId ? withMemberRole(prev, userId, role) : prev));
    };
    // Someone joined, left, or brought a character: the roster refetches, and
    // so do the member list everything else on the page reads (Duplicate
    // keeps a token's controller only while they are a player here) and the
    // campaign's characters (which tokens offer View Character Sheet and Roll).
    const handleRosterUpdated = (data: { campaignId?: string }) => {
      const campaignId = data?.campaignId;
      if (!campaignId) return;
      rereadCampaign(campaignId)
        .then((fresh) => {
          if (!fresh) return;
          setCampaign((prev) => (prev && prev.id === fresh.id
            ? { ...prev, memberships: fresh.memberships, characters: fresh.characters ?? prev.characters }
            : prev));
        })
        .catch((err: unknown) => console.error('[CampaignContext] Failed to refresh members:', errorSummary(err)));
    };
    socketClient.onMemberRoleChanged(handleRoleChanged);
    socketClient.on('authenticated', handleAuthenticated);
    socketClient.on('roster.updated', handleRosterUpdated);
    return () => {
      socketClient.off('campaign.role.changed', handleRoleChanged);
      socketClient.off('authenticated', handleAuthenticated);
      socketClient.off('roster.updated', handleRosterUpdated);
    };
  }, [rereadCampaign]);

  // A map being prepared is the DM's alone: once this user is not the DM
  // (the seat handed over, or their role changed) the page shows the
  // table's map, which is all the server sends them now.
  useEffect(() => {
    if (userRole !== 'DM' && preparedRef.current) endPreparing('not-dm');
  }, [userRole, endPreparing]);

  // Update spirit layer enabled/style in local campaign state
  const updateCampaignSpiritLayer = useCallback((enabled: boolean, style?: string) => {
    setCampaign((prev) =>
      prev
        ? {
            ...prev,
            spiritLayerEnabled: enabled,
            spiritLayerStyle: style ?? prev.spiritLayerStyle,
          }
        : null
    );
  }, []);

  // Load campaign on mount or when ID changes.
  // The game store is a module singleton (it outlives this provider), so
  // clear it before loading a different campaign and on unmount — otherwise
  // the previous campaign's tokens would flash on the next session screen.
  useEffect(() => {
    useGameStore.getState().clearGameState();
    // Another campaign's page starts on its table's map; this tab's kept
    // map for the old one stays kept.
    preparedRef.current = null;
    setPreparedMapState(null);
    if (id) {
      loadCampaign(id);
    }
    return () => {
      // A load still on its way is for a page that is gone.
      loadSeq.current += 1;
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
      redirectTimer.current = null;
      useGameStore.getState().clearGameState();
    };
  }, [id, loadCampaign]);

  // Context value — memoized so consumers only re-render when a field they
  // read actually changes, not on every provider render (e.g. token moves
  // no longer force the whole campaign subtree to reconcile).
  const viewedMap = preparedMap ?? currentMap;
  const isPreparing = preparedMap !== null;
  const value: CampaignContextState = useMemo(() => ({
    campaign,
    currentMap,
    viewedMap,
    isPreparing,
    userRole,
    loading,
    error,
    loadCampaign,
    refreshCampaign,
    refreshCurrentMap,
    catchUpAfterReconnect,
    setCurrentMap,
    updateMap,
    receiveTableMap,
    showTableMap,
    openToPrepare,
    backToTable,
    mayChangeViewedMap,
    registerViewedMapGuard,
    preparingEnded,
    clearPreparingEnded,
    upsertCampaignMap,
    removeCampaignMap,
    updateCampaignSpiritLayer,
    dmViewBothPlanes,
    setDmViewBothPlanes,
    playerSpiritVisible,
    setPlayerSpiritVisible,
    currentVibe,
    activeVibeEffect,
    updateVibe,
    updateVibeSettings,
    activeSession,
    setActiveSession,
    updateCampaignStatus,
    activeAtmosphereEffect,
    updateAtmosphereEffect,
    activeAtmosphereAudio,
    updateAtmosphereAudio,
  }), [
    campaign,
    currentMap,
    viewedMap,
    isPreparing,
    userRole,
    loading,
    error,
    loadCampaign,
    refreshCampaign,
    refreshCurrentMap,
    setCurrentMap,
    catchUpAfterReconnect,
    updateMap,
    receiveTableMap,
    showTableMap,
    openToPrepare,
    backToTable,
    mayChangeViewedMap,
    registerViewedMapGuard,
    preparingEnded,
    clearPreparingEnded,
    upsertCampaignMap,
    removeCampaignMap,
    updateCampaignSpiritLayer,
    dmViewBothPlanes,
    playerSpiritVisible,
    currentVibe,
    activeVibeEffect,
    updateVibe,
    updateVibeSettings,
    activeSession,
    updateCampaignStatus,
    activeAtmosphereEffect,
    updateAtmosphereEffect,
    activeAtmosphereAudio,
    updateAtmosphereAudio,
  ]);

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}

// ============================================
// Hook for consuming context
// ============================================

export function useCampaign() {
  const context = useContext(CampaignContext);

  if (context === undefined) {
    throw new Error('useCampaign must be used within a CampaignProvider');
  }

  return context;
}
