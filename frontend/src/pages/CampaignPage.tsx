// ============================================
// Campaign Page
// Main campaign view with three-panel layout
// Left: Campaign info, character, party
// Center: Map canvas
// Right: Chat, dice roller, controls
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CampaignProvider, useCampaign } from '@/contexts/CampaignContext';
import { WebSocketProvider, useWebSocket } from '@/contexts/WebSocketContext';
import {
  ArrowLeft,
  Loader2,
  Settings,
  Map as MapIcon,
  Ghost,
  Swords,
  BookOpen,
  Package,
  Sun,
  PauseCircle,
  Cloud,
} from 'lucide-react';

// Campaign components
import CampaignInfo from '@/components/campaign/CampaignInfo';
import CampaignRoster from '@/components/campaign/CampaignRoster';
import MapCanvas from '@/components/campaign/MapCanvas';
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
import VibeTracker from '@/components/campaign/VibeTracker';
import SessionControls from '@/components/campaign/SessionControls';
import ChatPanel from '@/components/campaign/ChatPanel';
import DiceRoller from '@/components/campaign/DiceRoller';
import InitiativeTracker from '@/components/campaign/InitiativeTracker';
import ConnectionStatus from '@/components/ConnectionStatus';
import { CampaignStatus, TokenType } from '@/types';
import type { Token } from '@/types';

// ============================================
// Campaign Page Content (inside provider)
// ============================================

function CampaignPageContent() {
  const navigate = useNavigate();
  const { campaign, currentMap, loading, error, userRole, updateCampaignStatus, setActiveSession, tokens, updateTokens, refreshCurrentMap } = useCampaign();
  const { socket, reconnectCount } = useWebSocket();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectCount]);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState(false);
  const [isTokenManagerOpen, setIsTokenManagerOpen] = useState(false);
  const [isSpiritLayerOpen, setIsSpiritLayerOpen] = useState(false);
  const [isAtmospherePanelOpen, setIsAtmospherePanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreatureLibraryOpen, setIsCreatureLibraryOpen] = useState(false);
  const [isTokenTemplateLibraryOpen, setIsTokenTemplateLibraryOpen] = useState(false);
  const [quickEditToken, setQuickEditToken] = useState<Token | null>(null);

  // ============================================
  // Session WebSocket listeners
  // All clients (DM + Players) listen so campaign status stays in sync
  // ============================================
  useEffect(() => {
    if (!socket) return;

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
  }, [socket, updateCampaignStatus, setActiveSession]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-moss-green animate-spin mx-auto" />
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
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </button>
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
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header Bar */}
      <header className="flex items-center justify-between px-4 py-3 bg-moss-green/10 border-b border-moss-green/20 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>

          <div className="h-6 w-px bg-moss-green/20" />

          <h1 className="text-xl font-bold text-moss-green">
            {campaign.name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <ConnectionStatus />

          <div className="h-6 w-px bg-moss-green/20 hidden sm:block" />

          {/* Maps button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsMapManagerOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Map Library"
            >
              <MapIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Maps</span>
            </button>
          )}

          {/* Tokens button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsTokenManagerOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Token Manager"
            >
              <Swords className="w-4 h-4" />
              <span className="hidden sm:inline">Tokens</span>
            </button>
          )}

          {/* Creature Library button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsCreatureLibraryOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Creature Library"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Creatures</span>
            </button>
          )}

          {/* Token Templates button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsTokenTemplateLibraryOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Token Templates"
            >
              <Package className="w-4 h-4" />
              <span className="hidden sm:inline">Templates</span>
            </button>
          )}

          {/* Spirit Layer button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsSpiritLayerOpen(true)}
              className={`btn-secondary flex items-center gap-2 ${
                campaign?.spiritLayerEnabled ? 'ring-2 ring-spirit-purple/50' : ''
              }`}
              title="Spirit Layer Controls"
            >
              <Ghost className="w-4 h-4 text-spirit-purple" />
              <span className="hidden sm:inline">Spirit</span>
            </button>
          )}

          {/* Atmosphere button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsAtmospherePanelOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Atmosphere Controls"
            >
              <Cloud className="w-4 h-4 text-moss-green" />
              <span className="hidden sm:inline">Atmosphere</span>
            </button>
          )}

          {/* Session status indicator (visible to all) */}
          {campaign.status === CampaignStatus.ACTIVE && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-medium text-green-700 hidden sm:inline">Live</span>
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

          {/* Settings button (DM only) */}
          {userRole === 'DM' && (
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="btn-secondary flex items-center gap-2"
              title="Campaign Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
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

      {/* Main Content - Three Panel Layout */}
      <main className="flex-1 overflow-hidden hidden lg:flex">
        {/* Left Sidebar */}
        <aside className="w-80 flex-shrink-0 overflow-y-auto p-4 space-y-4 bg-parchment/30 border-r border-moss-green/20">
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

        {/* Center - Map Canvas */}
        <section className="flex-1 min-w-0 p-4">
          <MapCanvas
            onEditToken={(token) => {
              const effectiveType = token.type ?? (token.characterId ? TokenType.PLAYER : TokenType.NPC);
              if (effectiveType === TokenType.NPC || effectiveType === TokenType.OBJECT) {
                setQuickEditToken(token);
              }
            }}
          />
        </section>

        {/* Right Sidebar */}
        <aside className="w-96 flex-shrink-0 overflow-y-auto p-4 space-y-4 bg-parchment/30 border-l border-moss-green/20">
          {/* Chat */}
          <div className="h-[480px]">
            <ChatPanel />
          </div>

          {/* Dice Roller */}
          <div className="h-[580px]">
            <DiceRoller />
          </div>

          {/* Vibe Tracker */}
          <VibeTracker />

          {/* Initiative Tracker — visible to all, DM-controlled */}
          <InitiativeTracker />

          {/* Session Controls — DM only */}
          <SessionControls />
        </aside>
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
            updateTokens(tokens.map((t) => t.id === updated.id ? updated : t));
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
          <h2 className="text-xl font-bold text-moss-green">
            Desktop Required
          </h2>
          <p className="text-stone-gray">
            The campaign view is optimized for desktop screens (1024px+). Mobile
            support will be added in future updates.
          </p>
          <button onClick={() => navigate('/dashboard')} className="btn-primary">
            Back to Dashboard
          </button>
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
