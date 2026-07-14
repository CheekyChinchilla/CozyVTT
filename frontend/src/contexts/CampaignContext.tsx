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
  ReactNode,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import campaignService from '@/services/campaign.service';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import type { Campaign, CampaignRole, CampaignStatus, Map, VibeSettings, VibePeriod, CharacterHpUpdatedBroadcast } from '@/types';
import type { CharacterHpInfo } from '@/utils/characterHp';
import socketClient from '@/services/socket';

// ============================================
// Types
// ============================================

// NOTE: live token state moved out of this context into the
// zustand game store (`@/stores/gameStore`). Context value changes
// re-render EVERY useCampaign() consumer, so the high-frequency token
// stream must not flow through here — subscribe with useTokenList() /
// useTokenListIgnoringMovement() and mutate via store actions instead.
interface CampaignContextState {
  // Campaign Data
  campaign: Campaign | null;
  currentMap: Map | null;

  // User Role
  userRole: CampaignRole | null;

  // Loading & Error States
  loading: boolean;
  error: string | null;

  // Actions
  loadCampaign: (id: string) => Promise<void>;
  refreshCampaign: () => Promise<void>;
  /**
   * Re-fetch ONLY the current map (tokens, walls, lights, fog) without
   * reloading the whole campaign envelope. Used after a WebSocket reconnect
   * to pick up state changes that broadcast while we were disconnected
   * (e.g. token positions moved by other players during the drop).
   */
  refreshCurrentMap: () => Promise<void>;
  setCurrentMap: (map: Map | null) => void;
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
  /** Called after saving ConfigureVibeModal — patches campaign.vibeSettings in local state */
  updateVibeSettings: (settings: VibeSettings) => void;
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
  /** Cache of character HP keyed by characterId — populated from roster, updated by character.hp.updated WS events */
  characterHpCache: Record<string, CharacterHpInfo>;
  /** Seed the HP cache from roster data (called by CampaignRoster after fetch) */
  seedCharacterHpCache: (entries: { id: string; hp: CharacterHpInfo | null }[]) => void;
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

export function CampaignProvider({ children }: CampaignProviderProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [currentMap, setCurrentMap] = useState<Map | null>(null);
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
  // Character HP cache — keyed by characterId, updated by WS event and roster seed
  const [characterHpCache, setCharacterHpCache] = useState<Record<string, CharacterHpInfo>>({});

  // Derived: current vibe period name
  const currentVibe = campaign?.currentVibe ?? null;

  // Get user's role in the campaign
  const userRole =
    campaign && user
      ? campaign.memberships?.find((m) => m.userId === user.id)?.role || null
      : null;

  // Load campaign data
  const loadCampaign = useCallback(async (campaignId: string) => {
    setLoading(true);
    setError(null);

    try {
      const data = await campaignService.getCampaign(campaignId);
      setCampaign(data);

      // Initialize active session from campaign response
      setActiveSession(data.activeSession ?? null);

      // Initialize atmosphere state from saved campaign vibeSettings
      const vs = data.vibeSettings as Record<string, any> | undefined;
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

      // Initialize vibe effect from saved campaign state
      if (data.currentVibe && data.vibeSettings?.periods) {
        const activePeriod = (data.vibeSettings.periods as VibePeriod[]).find(
          (p) => p.name === data.currentVibe,
        );
        setActiveVibeEffect(
          activePeriod ? { hue: activePeriod.hue, filter: activePeriod.filter } : null,
        );
      } else {
        setActiveVibeEffect(null);
      }

      // Load current map via the filtered REST endpoint so tokens are spirit-filtered
      // per this user's role. The campaign response (maps: true) returns raw unfiltered
      // token JSON — we must NOT use those tokens directly.
      if (data.currentMapId) {
        try {
          const { map, spiritVisible } = await api.getMap(data.id, data.currentMapId);
          setCurrentMap(map);
          useGameStore.getState().setTokens(map.tokens || []);
          setPlayerSpiritVisible(spiritVisible ?? false);
        } catch {
          // Fall back to embedded map metadata (no tokens) if the fetch fails
          const mapMeta = data.maps?.find((m: { id: string }) => m.id === data.currentMapId);
          if (mapMeta) {
            setCurrentMap(mapMeta);
            useGameStore.getState().setTokens([]);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to load campaign:', err);

      // Handle specific errors
      if (err.response?.status === 403) {
        setError('You do not have permission to view this campaign');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else if (err.response?.status === 404) {
        setError('Campaign not found');
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        setError(err.response?.data?.message || 'Failed to load campaign');
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // Refresh campaign data
  const refreshCampaign = useCallback(async () => {
    if (campaign?.id) {
      await loadCampaign(campaign.id);
    }
  }, [campaign?.id, loadCampaign]);

  // Re-fetch the current map only — used after a WebSocket reconnect so the
  // local token/wall/light/fog state catches up with anything that broadcast
  // while we were disconnected. Cheaper than a full campaign reload and
  // doesn't blip atmosphere/audio state.
  const refreshCurrentMap = useCallback(async () => {
    if (!campaign?.id || !currentMap?.id) return;
    try {
      const { map, spiritVisible } = await api.getMap(campaign.id, currentMap.id);
      setCurrentMap(map);
      useGameStore.getState().setTokens(map.tokens || []);
      setPlayerSpiritVisible(spiritVisible ?? false);
    } catch (err) {
      console.error('[CampaignContext] Failed to refresh current map after reconnect:', err);
      // Non-fatal — user will receive future real-time updates normally
    }
  }, [campaign?.id, currentMap?.id]);

  // Update currentVibe + activeVibeEffect when vibe.updated WS event arrives
  const updateVibe = useCallback((period: string, hue: string, filter: string) => {
    setCampaign((prev) => (prev ? { ...prev, currentVibe: period } : null));
    setActiveVibeEffect({ hue, filter });
  }, []);

  // Patch campaign.vibeSettings after ConfigureVibeModal saves
  const updateVibeSettings = useCallback((settings: VibeSettings) => {
    setCampaign((prev) => (prev ? { ...prev, vibeSettings: settings } : null));
  }, []);

  // Update campaign.status in local state (called by session WebSocket listeners)
  const updateCampaignStatus = useCallback((status: CampaignStatus) => {
    setCampaign((prev) => (prev ? { ...prev, status } : null));
  }, []);

  // Update atmosphere effect (called by AtmospherePlayer on WS broadcast)
  const updateAtmosphereEffect = useCallback((effect: string | null) => {
    setActiveAtmosphereEffect(effect);
  }, []);

  // Update atmosphere audio (called by AtmospherePlayer on WS broadcast)
  const updateAtmosphereAudio = useCallback((audio: { assetId: string; audioUrl: string; volume: number; loop: boolean } | null) => {
    setActiveAtmosphereAudio(audio);
  }, []);

  // Seed HP cache from roster API response (called by CampaignRoster after fetchRoster)
  const seedCharacterHpCache = useCallback((entries: { id: string; hp: CharacterHpInfo | null }[]) => {
    setCharacterHpCache((prev) => {
      const next = { ...prev };
      for (const { id, hp } of entries) {
        if (hp) next[id] = hp;
      }
      return next;
    });
  }, []);

  // Listen for real-time character HP updates
  useEffect(() => {
    const handleHpUpdated = (data: CharacterHpUpdatedBroadcast) => {
      setCharacterHpCache((prev) => ({
        ...prev,
        [data.characterId]: data.hp,
      }));
    };

    socketClient.onCharacterHpUpdated(handleHpUpdated);
    return () => {
      socketClient.off('character.hp.updated', handleHpUpdated);
    };
  }, []);

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
    if (id) {
      loadCampaign(id);
    }
    return () => {
      useGameStore.getState().clearGameState();
    };
  }, [id, loadCampaign]);

  // Context value — memoized so consumers only re-render when a field they
  // read actually changes, not on every provider render (e.g. token moves
  // no longer force the whole campaign subtree to reconcile).
  const value: CampaignContextState = useMemo(() => ({
    campaign,
    currentMap,
    userRole,
    loading,
    error,
    loadCampaign,
    refreshCampaign,
    refreshCurrentMap,
    setCurrentMap,
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
    characterHpCache,
    seedCharacterHpCache,
  }), [
    campaign,
    currentMap,
    userRole,
    loading,
    error,
    loadCampaign,
    refreshCampaign,
    refreshCurrentMap,
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
    characterHpCache,
    seedCharacterHpCache,
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
