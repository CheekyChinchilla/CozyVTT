// ============================================
// Campaign Page
// Main campaign view with three-panel layout
// Left: Campaign info, character, party
// Center: Map canvas
// Right: Chat, dice roller, controls
// ============================================

import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampaignProvider, useCampaign } from '@/contexts/CampaignContext';
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';
import {
  ArrowLeft,
  Loader2,
  Sun,
  PauseCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type PanelImperativeHandle,
} from 'react-resizable-panels';

// Campaign components
import CampaignInfo from '@/components/campaign/CampaignInfo';
import CampaignRoster from '@/components/campaign/CampaignRoster';
// Lazy-loaded — MapCanvas is by far the largest component in the app; splitting
// it into its own chunk keeps the CampaignPage shell fast to load and paints
// the sidebars while the canvas code downloads.
const MapCanvas = lazy(() => import('@/components/campaign/MapCanvas'));
import MapManager from '@/components/campaign/MapManager';
import TokenManager from '@/components/campaign/TokenManager';
import SpiritLayerControls from '@/components/campaign/SpiritLayerControls';
import AtmospherePanel from '@/components/campaign/AtmospherePanel';
import AtmospherePlayer from '@/components/campaign/AtmospherePlayer';
import NpcQuickEditor from '@/components/campaign/NpcQuickEditor';
import CreatureLibrary from '@/components/campaign/CreatureLibrary';
import TokenTemplateLibrary from '@/components/campaign/TokenTemplateLibrary';
import TokenRoster from '@/components/campaign/TokenRoster';
import CampaignSettingsModal from '@/components/campaign/CampaignSettingsModal';
import SessionSidebar from '@/components/campaign/SessionSidebar';
import SessionToolbar, { type SessionToolKey } from '@/components/campaign/SessionToolbar';
import ConnectionStatus from '@/components/ConnectionStatus';
import { CampaignStatus, TokenType } from '@/types';
import type { Token } from '@/types';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';

// ============================================
// Campaign Page Content (inside provider)
// ============================================

function CampaignPageContent() {
  const navigate = useNavigate();
  const { campaign, currentMap, loading, error, userRole, updateCampaignStatus, setActiveSession, refreshCurrentMap } = useCampaign();
  const { socket, reconnectCount, status } = useWebSocket();

  // After a WebSocket reconnect, refetch the current map's state via REST.
  // The real-time stream only pushes deltas; any moves/wall edits/fog ops
  // that broadcast while this client was offline are not replayed, so without
  // this refresh the local map view stays frozen on pre-disconnect state
  // until the next live event arrives (or a hard refresh). reconnectCount is
  // 0 on initial load and ticks once per successful reconnect, so this skips
  // the initial mount.
  useEffect(() => {
    if (reconnectCount > 0) {
      refreshCurrentMap();
    }
    // refreshCurrentMap is stable enough for this trigger pattern
  }, [reconnectCount]);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [isTokenManagerOpen, setIsTokenManagerOpen] = useState(false);
  const [isSpiritLayerOpen, setIsSpiritLayerOpen] = useState(false);
  const [isAtmospherePanelOpen, setIsAtmospherePanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreatureLibraryOpen, setIsCreatureLibraryOpen] = useState(false);
  const [isTokenTemplateLibraryOpen, setIsTokenTemplateLibraryOpen] = useState(false);
  const [quickEditToken, setQuickEditToken] = useState<Token | null>(null);

  // Resizable panel layout — persisted to localStorage so each user's
  // column sizes survive reloads.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'cozyvtt-session-layout',
    storage: localStorage,
  });
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const togglePanel = (
    panelRef: React.RefObject<PanelImperativeHandle | null>,
    fallbackSize: string
  ) => {
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      // A panel restored from a collapsed saved layout has no previous
      // size to expand back to — fall back to its default share.
      if (panel.getSize().asPercentage === 0) {
        panel.resize(fallbackSize);
      }
    } else {
      panel.collapse();
    }
  };

  // SessionToolbar reports which tool was clicked; the open/close state
  // for each slide-over stays here.
  const sessionPanelOpeners: Record<SessionToolKey, () => void> = {
    maps: () => setIsMapManagerOpen(true),
    tokens: () => setIsTokenManagerOpen(true),
    creatures: () => setIsCreatureLibraryOpen(true),
    templates: () => setIsTokenTemplateLibraryOpen(true),
    spirit: () => setIsSpiritLayerOpen(true),
    atmosphere: () => setIsAtmospherePanelOpen(true),
    settings: () => setIsSettingsOpen(true),
  };

  // ============================================
  // Session WebSocket listeners
  // All clients (DM + Players) listen so campaign status stays in sync
  // ============================================
  useEffect(() => {
    // Register on the live socket only once it is actually connected. The socket
    // wrapper is a stable singleton whose underlying connection is created
    // asynchronously, so registering before the connection exists would silently
    // no-op. Re-running when `status` flips to 'connected' — including after a
    // reconnect that recreates the socket — (re)registers on the live socket.
    if (!socket || status !== 'connected') return;

    const handleStarted = (data: { sessionId: string; sessionNumber: number; startedAt: string }) => {
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({ id: data.sessionId, sessionNumber: data.sessionNumber, startedAt: data.startedAt });
    };
    const handlePaused = () => {
      updateCampaignStatus(CampaignStatus.PAUSED);
    };
    const handleEnded = () => {
      updateCampaignStatus(CampaignStatus.INACTIVE);
      setActiveSession(null);
    };
    const handleResumed = (data: { sessionId: string; sessionNumber: number; startedAt: string }) => {
      updateCampaignStatus(CampaignStatus.ACTIVE);
      setActiveSession({ id: data.sessionId, sessionNumber: data.sessionNumber, startedAt: data.startedAt });
    };

    socket.onSessionStarted(handleStarted);
    socket.onSessionPaused(handlePaused);
    socket.onSessionEnded(handleEnded);
    socket.onSessionResumed(handleResumed);

    return () => {
      const socketInstance = socket.getSocket();
      if (!socketInstance) return;
      socketInstance.off('session.started', handleStarted);
      socketInstance.off('session.paused', handlePaused);
      socketInstance.off('session.ended', handleEnded);
      socketInstance.off('session.resumed', handleResumed);
    };
  }, [socket, status, updateCampaignStatus, setActiveSession]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-brand-ink animate-spin mx-auto" />
          <p className="text-stone-gray">Loading campaign...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="card-cozy max-w-md text-center space-y-4">
          <p className="text-spirit-red font-medium">{error}</p>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // No campaign loaded
  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="card-cozy max-w-md text-center space-y-4">
          <p className="text-stone-gray">Campaign not found</p>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-moss-green/10 border-b border-moss-green/20 shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate('/dashboard')}
            variant="secondary" className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Button>

          <div className="h-6 w-px bg-moss-green/20" />

          <h1 className="text-xl font-bold text-brand-ink">
            {campaign.name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <ConnectionStatus />

          {/* Session status indicator (visible to all) */}
          {campaign.status === CampaignStatus.ACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success-ink hidden sm:inline">Live</span>
            </div>
          )}
          {campaign.status === CampaignStatus.PAUSED && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <PauseCircle className="w-3.5 h-3.5 text-warm-amber" />
              <span className="text-xs font-medium text-warm-amber hidden sm:inline">Paused</span>
            </div>
          )}
          {campaign.status === CampaignStatus.INACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-stone-gray/10 border border-stone-gray/20">
              <div className="w-2 h-2 rounded-full bg-stone-gray/50" />
              <span className="text-xs font-medium text-stone-gray hidden sm:inline">Inactive</span>
            </div>
          )}

          {/* Vibe indicator (visible to all) */}
          {campaign?.currentVibe && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-warm-amber/10 border border-warm-amber/20">
              <Sun className="w-3.5 h-3.5 text-warm-amber" />
              <span className="text-xs font-medium text-warm-amber capitalize hidden sm:inline">
                {campaign.currentVibe}
              </span>
            </div>
          )}

          {/* DM tools — grouped icon toolbar */}
          {userRole === 'DM' && (
            <>
              <div className="h-6 w-px bg-moss-green/20" />
              <SessionToolbar
                openPanels={{
                  maps: isMapManagerOpen,
                  tokens: isTokenManagerOpen,
                  creatures: isCreatureLibraryOpen,
                  templates: isTokenTemplateLibraryOpen,
                  spirit: isSpiritLayerOpen,
                  atmosphere: isAtmospherePanelOpen,
                  settings: isSettingsOpen,
                }}
                onOpen={(key) => sessionPanelOpeners[key]()}
                spiritLayerEnabled={campaign?.spiritLayerEnabled}
              />
            </>
          )}

          {/* Sidebar collapse toggles (all roles) */}
          <div className="h-6 w-px bg-moss-green/20" />
          <div className="flex items-center gap-1">
            <Tooltip content={leftCollapsed ? 'Show party panel' : 'Hide party panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={leftCollapsed ? PanelLeftOpen : PanelLeftClose}
                aria-label={leftCollapsed ? 'Show party panel' : 'Hide party panel'}
                onClick={() => togglePanel(leftPanelRef, '20%')}
              />
            </Tooltip>
            <Tooltip content={rightCollapsed ? 'Show session panel' : 'Hide session panel'} side="bottom">
              <Button
                variant="ghost"
                iconOnly
                icon={rightCollapsed ? PanelRightOpen : PanelRightClose}
                aria-label={rightCollapsed ? 'Show session panel' : 'Hide session panel'}
                onClick={() => togglePanel(rightPanelRef, '25%')}
              />
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Session Paused Banner — visible to players when session is paused */}
      {campaign.status === CampaignStatus.PAUSED && userRole !== 'DM' && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-warm-amber/10 border-b border-warm-amber/20">
          <PauseCircle className="w-4 h-4 text-warm-amber flex-shrink-0" />
          <p className="text-xs font-medium text-warm-amber">
            Session is paused. Token movement is disabled and dice rolls are automatically secret.
          </p>
        </div>
      )}

      {/* Main Content - Three Resizable Panels */}
      <main className="flex-1 min-h-0 overflow-hidden hidden lg:block">
        <Group
          orientation="horizontal"
          className="h-full w-full"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          {/* Left Panel — party & campaign info */}
          <Panel
            id="party"
            defaultSize={20}
            minSize="260px"
            collapsible
            panelRef={leftPanelRef}
            onResize={(size) => setLeftCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            <aside className="h-full overflow-y-auto p-4 space-y-4 bg-parchment/30 border-r border-moss-green/20">
              <CampaignInfo />
              <CampaignRoster />
              {/* Token Roster — DM only */}
              {userRole === 'DM' && (
                <TokenRoster
                  onEditToken={(token) => {
                    const effectiveType = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
                    if (effectiveType === TokenType.NPC || effectiveType === TokenType.OBJECT) {
                      setQuickEditToken(token);
                    }
                  }}
                />
              )}
            </aside>
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Center Panel — map canvas */}
          <Panel id="map" defaultSize={55} minSize={30} className="h-full">
            <section className="h-full min-w-0 p-4">
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center" aria-live="polite" aria-label="Loading map">
                    <Loader2 className="w-8 h-8 text-brand-ink animate-spin" aria-hidden="true" />
                  </div>
                }
              >
                <MapCanvas
                  onEditToken={(token) => {
                    const effectiveType = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
                    if (effectiveType === TokenType.NPC || effectiveType === TokenType.OBJECT) {
                      setQuickEditToken(token);
                    }
                  }}
                />
              </Suspense>
            </section>
          </Panel>

          <Separator className="w-1.5 bg-moss-green/10 transition-colors data-[separator=hover]:bg-brand/30 data-[separator=active]:bg-brand/50" />

          {/* Right Panel — tabbed session rail (Chat / Dice / Initiative / Session) */}
          <Panel
            id="rail"
            defaultSize={25}
            minSize="300px"
            collapsible
            panelRef={rightPanelRef}
            onResize={(size) => setRightCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            <SessionSidebar />
          </Panel>
        </Group>
      </main>

      {/* Map Manager slide-over panel (DM only) */}
      {userRole === 'DM' && (
        <MapManager
          isOpen={isMapManagerOpen}
          onClose={() => setIsMapManagerOpen(false)}
        />
      )}

      {/* Token Manager slide-over panel (DM only) */}
      {userRole === 'DM' && (
        <TokenManager
          isOpen={isTokenManagerOpen}
          onClose={() => setIsTokenManagerOpen(false)}
        />
      )}

      {/* Spirit Layer Controls slide-over panel (DM only) */}
      {userRole === 'DM' && (
        <SpiritLayerControls
          isOpen={isSpiritLayerOpen}
          onClose={() => setIsSpiritLayerOpen(false)}
        />
      )}

      {/* Atmosphere Panel slide-over (DM only) */}
      {userRole === 'DM' && (
        <AtmospherePanel
          isOpen={isAtmospherePanelOpen}
          onClose={() => setIsAtmospherePanelOpen(false)}
        />
      )}

      {/* Creature Library slide-over (DM only) */}
      {userRole === 'DM' && (
        <CreatureLibrary
          isOpen={isCreatureLibraryOpen}
          onClose={() => setIsCreatureLibraryOpen(false)}
        />
      )}

      {/* Token Template Library slide-over (DM only) */}
      {userRole === 'DM' && (
        <TokenTemplateLibrary
          isOpen={isTokenTemplateLibraryOpen}
          onClose={() => setIsTokenTemplateLibraryOpen(false)}
        />
      )}

      {/* NPC Quick Editor — DM only */}
      {userRole === 'DM' && quickEditToken && campaign && currentMap && (
        <NpcQuickEditor
          token={quickEditToken}
          campaignId={campaign.id}
          mapId={currentMap.id}
          onClose={() => setQuickEditToken(null)}
          onTokenUpdate={(updated) => {
            setQuickEditToken(updated);
            useGameStore.getState().replaceToken(updated);
          }}
        />
      )}

      {/* Campaign Settings slide-over panel (DM only) */}
      {userRole === 'DM' && (
        <CampaignSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Atmosphere Player — mounts for ALL users, manages ambient audio sync */}
      <AtmospherePlayer />

      {/* Mobile Warning */}
      <div className="lg:hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
        <div className="card-cozy max-w-md text-center space-y-4">
          <h2 className="text-xl font-bold text-brand-ink">
            Desktop Required
          </h2>
          <p className="text-stone-gray">
            The campaign view is optimized for desktop screens (1024px+). Mobile
            support will be added in future updates.
          </p>
          <Button onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Campaign Page (with provider wrapper)
// ============================================

export default function CampaignPage() {
  return (
    <CampaignProvider>
      <WebSocketProvider>
        <CampaignPageContent />
      </WebSocketProvider>
    </CampaignProvider>
  );
}
