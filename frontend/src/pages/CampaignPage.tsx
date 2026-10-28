// ============================================
// Campaign Page
// The game table: the map, the session panels and the Party content, drawn
// once (components/campaign/tableHosts.tsx) and arranged by one of the
// page's arrangements, today the desktop's three columns
// (components/campaign/DesktopTable.tsx). Everything an arrangement change
// must keep stays here: the page's listeners, every window and slide-over
// and whether it is open, and the token quick editor.
// ============================================

import { useState, useEffect, useId, lazy, Suspense, type ReactNode } from 'react';
import { isCampaignOwner } from '@/utils/campaignRoles';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { COMPACT_LAYOUT_QUERY } from '@/constants/layout';
import { CampaignProvider, useCampaign } from '@/contexts/CampaignContext';
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext';
import { LayoutProvider, useCompactLayout } from '@/contexts/LayoutContext';
import { useGameStore } from '@/stores/gameStore';
import { useInitiativeSync } from '@/hooks/useInitiativeSync';
import { usePresenceSync } from '@/hooks/usePresenceSync';
import { ArrowLeft, Loader2 } from 'lucide-react';

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
import TableRefusals from '@/components/campaign/TableRefusals';
import NpcQuickEditor from '@/components/campaign/NpcQuickEditor';
import CreatureLibrary from '@/components/campaign/CreatureLibrary';
import TokenTemplateLibrary from '@/components/campaign/TokenTemplateLibrary';
import TokenRoster from '@/components/campaign/TokenRoster';
import CampaignSettingsModal from '@/components/campaign/CampaignSettingsModal';
import CampaignDocumentsModal from '@/components/documents/CampaignDocumentsModal';
import ShortcutsPanel from '@/components/campaign/ShortcutsPanel';
import SessionPanels from '@/components/campaign/SessionPanels';
import DesktopTable from '@/components/campaign/DesktopTable';
import { TableHosts, type TablePart } from '@/components/campaign/tableHosts';
import { type SessionToolKey } from '@/components/campaign/SessionToolbar';
import { CampaignStatus } from '@/types';
import type { Token } from '@/types';
import Button from '@/components/ui/Button';
import { useOnRejoin } from '@/hooks/useOnRejoin';
import { optionalStorage } from '@/utils/optionalStorage';
import { useAccessRevoked } from '@/hooks/useAccessRevoked';

/** Set to `yes` once this browser has chosen Continue anyway on a narrow screen. */
const NARROW_SCREEN_KEY = 'cozyvtt.continueOnNarrowScreen';

// ============================================
// Campaign Page Content (inside provider)
// ============================================

function CampaignPageContent() {
  const navigate = useNavigate();
  const { campaign, currentMap, loading, error, userRole, updateCampaignStatus, setActiveSession, refreshCurrentMap, catchUpAfterReconnect } = useCampaign();
  const { user } = useAuth();

  /**
   * Owning a campaign and running it are different things once the DM seat can
   * move. The owner keeps the powers that are theirs — deleting the campaign,
   * and taking the seat back — so they need a way into the settings panel even
   * when somebody else is the DM. Without this, handing the game over left the
   * campaign with nobody able to delete it: the owner had the permission and no
   * route to it, the new DM had the route and no permission.
   */
  const isOwner = isCampaignOwner(campaign, user?.id);
  const canOpenSettings = userRole === 'DM' || isOwner;
  const { socket, joinedEpoch, status } = useWebSocket();

  // Mirror combat/initiative state into the game store. Owned here rather than
  // by the initiative panel so both the tracker and the map's active-token
  // ring read one source, and so the subscription survives the panel being
  // collapsed or unmounted.
  useInitiativeSync();
  // Who is online, for the roster's dots and the chat's To list, the same way.
  usePresenceSync(campaign?.id);

  // After a WebSocket reconnect, catch up via REST. The real-time stream
  // only pushes deltas; moves, wall edits and fog ops, a pause or an end, a
  // member's new role and a switch to another map that broadcast while this
  // client was offline are not replayed, so without this the page stays on
  // its pre-disconnect state until the next live event arrives (or a hard
  // refresh). Once the connection has joined the campaign again, so nothing
  // sent while the read is in flight is missed.
  useOnRejoin(joinedEpoch, catchUpAfterReconnect);

  // Removed from the campaign, the campaign deleted, or the sign-in ended
  // elsewhere: say why and leave the table.
  useAccessRevoked();

  // A player changing their character's token image rewrites the image on every
  // token bound to that character, server-side — tokens hold their own copy. The
  // map has to refetch to show it, but only when tokens really changed: this
  // event also fires for every HP tweak and sheet save.
  useEffect(() => {
    if (!socket) return;
    const handleCharacterUpdated = (data: { tokensChanged?: boolean }) => {
      if (data?.tokensChanged) refreshCurrentMap();
    };
    socket.on('character.updated', handleCharacterUpdated);
    return () => {
      socket.off('character.updated', handleCharacterUpdated);
    };
    // refreshCurrentMap MUST be a dependency. It is a useCallback keyed on the
    // campaign and map ids, so its identity changes once they load. Keyed on
    // `socket` alone this effect would run once and capture the version built
    // before either existed — whose body returns immediately — and the refresh
    // would silently never happen. (`socket` is a module singleton, so it never
    // changes identity and cannot re-trigger this on its own.)
  }, [socket, refreshCurrentMap]);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [isTokenManagerOpen, setIsTokenManagerOpen] = useState(false);
  const [isSpiritLayerOpen, setIsSpiritLayerOpen] = useState(false);
  const [isAtmospherePanelOpen, setIsAtmospherePanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  // The keyboard shortcuts window, opened from the header or by ? on the map.
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isCreatureLibraryOpen, setIsCreatureLibraryOpen] = useState(false);
  const [isTokenTemplateLibraryOpen, setIsTokenTemplateLibraryOpen] = useState(false);
  const [quickEditToken, setQuickEditToken] = useState<Token | null>(null);
  const compact = useCompactLayout();

  // Below 1024 px the page covers itself with a "Desktop Required" notice
  // until **Continue anyway**, which this browser then remembers.
  const [continueOnNarrowScreen, setContinueOnNarrowScreen] = useState(
    () => optionalStorage.getItem(NARROW_SCREEN_KEY) === 'yes',
  );
  const continueAnyway = () => {
    optionalStorage.setItem(NARROW_SCREEN_KEY, 'yes');
    setContinueOnNarrowScreen(true);
  };
  // The notice is drawn only below lg (1024 px); while it shows it holds the
  // keyboard, over any window or side panel open under it.
  const narrowScreen = useMediaQuery(COMPACT_LAYOUT_QUERY);
  const narrowNoticeRef = useFocusTrap(narrowScreen && !continueOnNarrowScreen);
  const narrowNoticeTitleId = useId();

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
      // Through the client, not the raw io instance. The client keeps a registry
      // so listeners survive a reconnect, and `getSocket().off()` only detaches
      // from the current instance — the registry entry would survive and be
      // re-attached on the next reconnect, stacking up four more stale handlers
      // every time this effect re-ran.
      socket.off('session.started', handleStarted);
      socket.off('session.paused', handlePaused);
      socket.off('session.ended', handleEnded);
      socket.off('session.resumed', handleResumed);
    };
  }, [socket, status, updateCampaignStatus, setActiveSession]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
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
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
        <div className="card-cozy max-w-md text-center space-y-4">
          <p className="text-danger-ink font-medium">{error}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
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

  // The map, the session panels and the Party content, each drawn once here
  // and moved into the slots of the arrangement on screen, so a change of
  // arrangement remounts none of them.
  const tableParts: Record<TablePart, ReactNode> = {
    map: (
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center" aria-live="polite" aria-label="Loading map">
            <Loader2 className="w-8 h-8 text-brand-ink animate-spin" aria-hidden="true" />
          </div>
        }
      >
        <MapCanvas onEditToken={setQuickEditToken} onShowShortcuts={() => setIsShortcutsOpen(true)} />
      </Suspense>
    ),
    session: <SessionPanels />,
    party: (
      <div className="space-y-4">
        <CampaignInfo />
        <CampaignRoster />
        {/* Token Roster — DM only */}
        {userRole === 'DM' && (
          <TokenRoster onEditToken={setQuickEditToken} />
        )}
      </div>
    ),
  };

  return (
    // The dynamic viewport height: on a phone or a tablet the browser's
    // toolbar comes and goes, and h-screen (100vh) is the height without it,
    // which put the bottom of the page under the toolbar.
    <div className="h-dvh flex flex-col bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
      <TableHosts parts={tableParts}>
        {/* No compact arrangement is drawn yet; LayoutProvider below says
            false on every screen. */}
        {!compact && (
          <DesktopTable
            campaign={campaign}
            isOwner={isOwner}
            openTools={{
              maps: isMapManagerOpen,
              tokens: isTokenManagerOpen,
              creatures: isCreatureLibraryOpen,
              templates: isTokenTemplateLibraryOpen,
              spirit: isSpiritLayerOpen,
              atmosphere: isAtmospherePanelOpen,
              settings: isSettingsOpen,
            }}
            onOpenTool={(key) => sessionPanelOpeners[key]()}
            onOpenDocuments={() => setIsDocumentsOpen(true)}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            continueOnNarrowScreen={continueOnNarrowScreen}
          />
        )}
      </TableHosts>

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
            // A stat block saves when the editor closes, so its answer often
            // arrives after the DM closed the editor or opened another token.
            // Update the editor only while it still shows this token.
            setQuickEditToken((open) => (open?.id === updated.id ? updated : open));
            useGameStore.getState().replaceToken(updated);
          }}
        />
      )}

      {/* Campaign Settings slide-over panel — the DM, or the owner, who sees
          only the parts that are theirs (see CampaignSettingsModal). */}
      {canOpenSettings && (
        <CampaignSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {campaign?.id && (
        <CampaignDocumentsModal
          isOpen={isDocumentsOpen}
          onClose={() => setIsDocumentsOpen(false)}
          campaignId={campaign.id}
          isDM={userRole === 'DM'}
        />
      )}

      <ShortcutsPanel open={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} role={userRole} />

      {/* Atmosphere Player — mounts for ALL users, manages ambient audio sync */}
      <AtmospherePlayer />

      {/* What the server refuses, shown as a message */}
      <TableRefusals />

      {/* Narrow screen notice, on <body> above every panel and window (z-60)
          so none can cover it; toasts stay above it. */}
      {!continueOnNarrowScreen && createPortal(
        <div className="lg:hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-80">
          <div
            ref={narrowNoticeRef}
            role={narrowScreen ? 'dialog' : undefined}
            aria-modal={narrowScreen ? true : undefined}
            aria-labelledby={narrowNoticeTitleId}
            className="card-cozy max-w-md text-center space-y-4"
          >
            <h2 id={narrowNoticeTitleId} className="text-xl font-bold text-brand-ink">
              Desktop Required
            </h2>
            <p className="text-stone-gray">
              The campaign view is optimized for desktop screens (1024px+). Mobile
              support will be added in future updates.
            </p>
            <p className="text-stone-gray">
              On a narrow window or a tablet you can continue anyway. The page keeps
              its desktop layout, so some panels will be cramped.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
              <Button variant="secondary" onClick={continueAnyway}>
                Continue anyway
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
        {/* The compact arrangement is not drawn yet: every screen gets the
            desktop's, and below 1024 px the Desktop Required notice over it. */}
        <LayoutProvider compact={false}>
          <CampaignPageContent />
        </LayoutProvider>
      </WebSocketProvider>
    </CampaignProvider>
  );
}
