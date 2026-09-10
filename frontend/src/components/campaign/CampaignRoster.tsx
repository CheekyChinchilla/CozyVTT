/**
 * Campaign Roster Component
 * Displays campaign members and their assigned characters with click handlers
 * Supports real-time updates via WebSocket
 */

import { useState, useEffect } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore } from '@/stores/gameStore';
import { characterTokenDrag, characterTokenRequest } from '@/utils/characterTokenDrag';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { canRollAsCharacter } from '@/services/permissions';
import { Users, Crown, Gamepad2, Eye, Edit, X, Minus, Plus, Dices, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CharacterHpInfo } from '@/utils/characterHp';
import CharacterSheetViewerModal from '../character/CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../character/CharacterSheetEditorModal';
import CharacterContextMenu from './CharacterContextMenu';
import CharacterRollPicker from './CharacterRollPicker';
import Toast, { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { CampaignRole, GameSystem, Character, RosterMember } from '@/types';
import { TokenLayer } from '@/types';

export default function CampaignRoster() {
  const { campaign, currentMap, userRole, characterHpCache, seedCharacterHpCache } = useCampaign();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  // User IDs with at least one live connection to this campaign.
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [editorCharacter, setEditorCharacter] = useState<Character | null>(null);
  const [_viewerLoading, setViewerLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; characterId: string; characterUserId: string } | null>(null);
  const [rollPicker, setRollPicker] = useState<{ x: number; y: number; characterId: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Fetch roster data
  const fetchRoster = async () => {
    if (!campaign?.id) return;

    try {
      setLoading(true);
      const response = await api.getCampaignCharacters(campaign.id);
      setRoster(response.roster);

      // Seed the HP cache in CampaignContext so MapCanvas can render player HP bars
      const hpEntries = response.roster.flatMap((m) =>
        m.characters.map((c) => ({ id: c.id, hp: c.hp }))
      );
      seedCharacterHpCache(hpEntries);
    } catch (error) {
      console.error('Error fetching campaign roster:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [campaign?.id]);

  // Listen for roster updates via WebSocket
  useEffect(() => {
    if (!socket || !campaign?.id) return;

    const handleRosterUpdate = () => {
      console.log('Roster updated - refetching...');
      fetchRoster();
    };

    socket.on('roster.updated', handleRosterUpdate);

    return () => {
      socket.off('roster.updated', handleRosterUpdate);
    };
  }, [socket, campaign?.id]);

  // Who is connected right now, shown as a dot beside each member. This is what
  // replaced the "X has joined / has left" chat messages.
  //
  // The server sends the whole set on every join and leave rather than deltas,
  // so this cannot drift out of step after a missed event — and a user with two
  // tabs open appears once and stays online until the last one closes.
  useEffect(() => {
    if (!socket || !campaign?.id) return;

    const handlePresence = (data: { campaignId: string; onlineUserIds: string[] }) => {
      if (data?.campaignId !== campaign.id) return;
      setOnlineUserIds(new Set(data.onlineUserIds ?? []));
    };

    socket.onPresenceState(handlePresence);
    // Ask for the current set: the push that accompanied our own connection may
    // have happened before this component mounted, which would otherwise leave
    // every member showing offline until somebody joined or left.
    socket.requestPresence();

    return () => {
      socket.off('presence.state', handlePresence);
    };
  }, [socket, campaign?.id]);

  // Handle character click - fetch full character and open viewer
  const handleCharacterClick = async (characterId: string) => {
    try {
      setViewerLoading(true);
      const { character } = await api.getCharacter(characterId);
      setSelectedCharacter(character);
    } catch (error) {
      console.error('Error fetching character:', error);
    } finally {
      setViewerLoading(false);
    }
  };

  // Close character viewer
  const handleCloseViewer = () => {
    setSelectedCharacter(null);
  };

  // Get user's membership in campaign
  const userMembership = campaign?.memberships?.find(m => m.userId === user?.id);

  // Handle character right-click
  const handleCharacterRightClick = (e: React.MouseEvent, characterId: string, characterUserId: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      characterId,
      characterUserId,
    });
  };

  // Close context menu
  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  // Handle context menu actions
  const handleViewCharacterSheet = async () => {
    if (contextMenu) {
      await handleCharacterClick(contextMenu.characterId);
    }
  };

  const handleEditCharacterSheet = async () => {
    if (contextMenu) {
      try {
        const { character } = await api.getCharacter(contextMenu.characterId);
        setEditorCharacter(character);
      } catch (error) {
        console.error('Error fetching character for editing:', error);
        showToast('Failed to load character for editing', 'error');
      }
    }
  };

  // Close editor modal
  const handleCloseEditor = () => {
    setEditorCharacter(null);
  };

  // Handle editor save - refresh roster
  const handleEditorSaved = async () => {
    await fetchRoster();
  };

  // Emit HP delta via WebSocket — optimistic update happens via the broadcast echo
  const handleHpDelta = (characterId: string, delta: number) => {
    socket?.emitCharacterHpUpdate({ characterId, delta });
  };

  /**
   * Put a character on the map from the roster.
   *
   * The drag works too, but only if you can see both the roster and the map at
   * once — and it is the only way there was, so a DM with the roster open over
   * the map had no way to place anyone. Placed at the centre of the map, the
   * same as the creature library, because a menu click has no cursor position.
   */
  const handleAddTokenToMap = async () => {
    if (!contextMenu || !campaign || !currentMap) return;
    const character = roster
      .flatMap((member) => member.characters)
      .find((c) => c.id === contextMenu.characterId);
    handleCloseContextMenu();
    if (!character) return;

    const position = {
      x: Math.floor(currentMap.width / 2),
      y: Math.floor(currentMap.height / 2),
    };

    try {
      const result = await api.addToken(
        campaign.id,
        currentMap.id,
        characterTokenRequest(
          characterTokenDrag({
            id: character.id,
            name: character.name,
            tokenImageUrl: character.tokenImageUrl,
            userId: character.userId,
          }),
          position,
          TokenLayer.TOKEN,
        ),
      );
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);
      showToast(`${character.name} placed on the map`, 'success');
    } catch (error) {
      console.error('Failed to place character on map:', error);
      showToast('Could not place that character on the map', 'error');
    }
  };

  const handleRemoveFromCampaign = () => {
    if (!contextMenu || !campaign) return;
    setConfirmRemove(true);
  };

  const handleConfirmRemove = async () => {
    if (!contextMenu || !campaign) return;
    setConfirmRemove(false);
    try {
      await api.assignCharacterToCampaign(contextMenu.characterId, null);
      await fetchRoster();
    } catch (error) {
      console.error('Error removing character from campaign:', error);
      showToast('Failed to remove character from campaign', 'error');
    }
  };

  // Get role icon
  const getRoleIcon = (role: CampaignRole) => {
    switch (role) {
      case 'DM':
        return Crown;
      case 'PLAYER':
        return Gamepad2;
      case 'SPECTATOR':
        return Eye;
      default:
        return Users;
    }
  };

  // Get game system badge color
  const getSystemBadgeColor = (gameSystem: GameSystem | null) => {
    switch (gameSystem) {
      case 'DND_5E':
        return 'bg-danger/10 text-danger-ink';
      case 'PATHFINDER_2E':
        return 'bg-info/10 text-info-ink';
      case 'SHADOWRUN_6E':
        return 'bg-spirit/10 text-spirit-ink';
      case 'CALL_OF_CTHULHU_7E':
        return 'bg-success/10 text-success-ink';
      default:
        return 'bg-ink/10 text-ink';
    }
  };

  // Get game system short name
  const getSystemShortName = (gameSystem: GameSystem | null) => {
    switch (gameSystem) {
      case 'DND_5E':
        return 'D&D 5e';
      case 'PATHFINDER_2E':
        return 'PF2e';
      case 'SHADOWRUN_6E':
        return 'SR6e';
      case 'CALL_OF_CTHULHU_7E':
        return 'CoC 7e';
      default:
        return 'Flex';
    }
  };

  // Group members by role
  const groupedRoster = {
    DM: roster.filter((m) => m.role === 'DM'),
    PLAYER: roster.filter((m) => m.role === 'PLAYER'),
    SPECTATOR: roster.filter((m) => m.role === 'SPECTATOR'),
  };

  return (
    <>
    <div className="glass-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-moss-green/20">
        <Users className="w-5 h-5 text-brand-ink" />
        <h3 className="text-lg font-semibold text-brand-ink">Campaign Roster</h3>
      </div>

      {loading ? (
        <div className="text-center py-4">
          <p className="text-sm text-warm-gray">Loading roster...</p>
        </div>
      ) : roster.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-warm-gray">No members yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* DM Section */}
          {groupedRoster.DM.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-brand-ink/60 uppercase tracking-wider mb-2">
                Dungeon Master
              </h4>
              <div className="space-y-2">
                {groupedRoster.DM.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
                ))}
              </div>
            </div>
          )}

          {/* Players Section */}
          {groupedRoster.PLAYER.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-brand-ink/60 uppercase tracking-wider mb-2">
                Players
              </h4>
              <div className="space-y-2">
                {groupedRoster.PLAYER.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
                ))}
              </div>
            </div>
          )}

          {/* Spectators Section */}
          {groupedRoster.SPECTATOR.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-brand-ink/60 uppercase tracking-wider mb-2">
                Spectators
              </h4>
              <div className="space-y-2">
                {groupedRoster.SPECTATOR.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>

      {/* Character Viewer Modal */}
      {selectedCharacter && userMembership && campaign && (
        <CharacterSheetViewerModal
          character={selectedCharacter}
          campaignId={campaign.id}
          membership={userMembership}
          onClose={handleCloseViewer}
        />
      )}

      {/* Character Context Menu */}
      {contextMenu && user && userMembership && (
        <CharacterContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              icon: Eye,
              label: 'View Character Sheet',
              onClick: handleViewCharacterSheet,
              visible: true,
            },
            {
              icon: Dices,
              label: 'Roll...',
              onClick: () => {
                setRollPicker({ x: contextMenu.x, y: contextMenu.y, characterId: contextMenu.characterId });
                handleCloseContextMenu();
              },
              // Rolling uses the sheet's modifiers, so it follows character
              // ownership the same way Edit below does — not `true`, which let
              // any member roll anyone's character.
              visible: canRollAsCharacter(user, { userId: contextMenu.characterUserId }, userMembership),
            },
            {
              icon: Edit,
              label: 'Edit Character Sheet',
              onClick: handleEditCharacterSheet,
              visible: user.id === contextMenu.characterUserId || userMembership.role === 'DM',
            },
            {
              icon: MapPin,
              label: 'Add to Map',
              onClick: handleAddTokenToMap,
              visible: userMembership.role === 'DM' && !!currentMap,
            },
            // "Reassign to Player" used to sit here. It never did anything —
            // it popped "not yet available" — and there is no endpoint behind
            // it either: /characters/:id/assign moves a character between
            // *campaigns*, not between owners. Better absent than advertised.
            // It comes back when the endpoint does.
            {
              icon: X,
              label: 'Remove from Campaign',
              onClick: handleRemoveFromCampaign,
              visible: user.id === contextMenu.characterUserId || userMembership.role === 'DM',
              className: 'text-danger-ink hover:bg-danger/10',
            },
          ]}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Roll Picker */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          onRoll={(expression, purpose, characterName) => {
            socket?.emitDiceRoll({ expression, purpose, characterName });
          }}
          onClose={() => setRollPicker(null)}
        />
      )}

      {/* Character Editor Modal */}
      {editorCharacter && (
        <CharacterSheetEditorModal
          character={editorCharacter}
          onClose={handleCloseEditor}
          onSaved={handleEditorSaved}
        />
      )}

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />

      <ConfirmDialog
        isOpen={confirmRemove}
        title="Remove from Campaign"
        message="Are you sure you want to remove this character from the campaign?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}

interface MemberCardProps {
  member: RosterMember;
  getRoleIcon: (role: CampaignRole) => LucideIcon;
  getSystemBadgeColor: (gameSystem: GameSystem | null) => string;
  getSystemShortName: (gameSystem: GameSystem | null) => string;
  onCharacterClick: (characterId: string) => void;
  onCharacterRightClick: (e: React.MouseEvent, characterId: string, characterUserId: string) => void;
  isDM: boolean;
  currentUserId: string;
  characterHpCache: Record<string, CharacterHpInfo>;
  onHpDelta: (characterId: string, delta: number) => void;
  /** Has at least one live connection to this campaign right now. */
  isOnline: boolean;
}

function MemberCard({ member, getRoleIcon, getSystemBadgeColor, getSystemShortName, onCharacterClick, onCharacterRightClick, isDM, currentUserId, characterHpCache, onHpDelta, isOnline }: MemberCardProps) {
  const RoleIcon = getRoleIcon(member.role);

  return (
    <div className="p-2 rounded-lg bg-parchment/50 hover:bg-parchment transition-colors">
      {/* Member Info */}
      <div className="flex items-center gap-2 mb-2">
        {/* Presence badge on the role icon. This replaces the "X has joined /
            left the campaign" chat messages, which fired on every refresh and
            every brief disconnect.

            The dot is the ONLY thing carrying this meaning here — unlike the
            header indicators, which sit next to the words "Live"/"Connected" —
            so colour alone would fail WCAG 1.4.1. Hence the label. No pulse
            either: a roster can show many of these at once. */}
        <div className="relative flex-shrink-0">
          <div
            className={`p-1.5 rounded-full ${
              member.role === 'DM' ? 'bg-moss-green/20' : 'bg-spirit-purple/20'
            }`}
          >
            <RoleIcon
              className={`w-4 h-4 ${
                member.role === 'DM' ? 'text-brand-ink' : 'text-spirit-purple'
              }`}
            />
          </div>
          <span
            role="img"
            aria-label={`${member.userName} is ${isOnline ? 'in session' : 'not in session'}`}
            title={isOnline ? 'In session' : 'Not in session'}
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-parchment ${
              isOnline ? 'bg-success' : 'bg-stone-gray/50'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-gray truncate">
            {member.userName}
          </p>
          {member.characters.length > 0 && (
            <p className="text-xs text-warm-gray">
              {member.characters.length} {member.characters.length === 1 ? 'character' : 'characters'}
            </p>
          )}
        </div>
      </div>

      {/* Characters */}
      {member.characters.length > 0 && (
        <div className="ml-9 space-y-1">
          {member.characters.map((character) => {
            // The DM may place any character. This used to also require a token
            // picture, which meant the handle only existed on characters that
            // had one — and the handle was the picture, so a character without
            // one could not be dragged at all. The canvas draws an imageless
            // token as a lettered circle, so there is nothing to gate on.
            const canDrag = isDM;
            return (
            <div
              key={character.id}
              className="rounded bg-paper/50 hover:bg-paper/70 transition-colors"
            >
              <div
                onClick={() => onCharacterClick(character.id)}
                onContextMenu={(e) => onCharacterRightClick(e, character.id, character.userId)}
                draggable={canDrag}
                onDragStart={canDrag ? (e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('text/plain', JSON.stringify(characterTokenDrag({
                    id: character.id,
                    name: character.name,
                    tokenImageUrl: character.tokenImageUrl,
                    userId: character.userId,
                  })));
                } : undefined}
                title={canDrag ? `Drag ${character.name} onto the map` : undefined}
                className={`flex items-center gap-2 p-1.5 cursor-pointer ${canDrag ? 'active:cursor-grabbing' : ''}`}
              >
              {/* Character Token — draggable by DM onto map */}
              {character.tokenImageUrl ? (
                <img
                  src={character.tokenImageUrl}
                  alt={character.name}
                  className="w-6 h-6 rounded-full object-cover border border-moss-green/20"
                  title={character.name}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-moss-green/10 border border-moss-green/20 flex items-center justify-center">
                  <span className="text-xs text-brand-ink font-semibold">
                    {character.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Character Name */}
              <p className="text-xs font-medium text-stone-gray flex-1 truncate">
                {character.name}
              </p>

              {/* Game System Badge */}
              {character.gameSystem && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${getSystemBadgeColor(
                    character.gameSystem
                  )}`}
                >
                  {getSystemShortName(character.gameSystem)}
                </span>
              )}
            </div>

            {/* HP bar + controls — shown when character has HP data and user can edit */}
            {(() => {
              const hp = characterHpCache[character.id] ?? character.hp;
              const canAdjust = isDM || character.userId === currentUserId;
              if (!hp || hp.max === 0) return null;
              const pct = Math.max(0, Math.min(1, hp.current / hp.max));
              const barColor = pct >= 0.75 ? 'bg-success'
                            : pct >= 0.50 ? 'bg-lime-500'
                            : pct >= 0.25 ? 'bg-warning'
                            :               'bg-danger';
              return (
                <div className="mt-1 space-y-1" onClick={(e) => e.stopPropagation()}>
                  {/* HP progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${pct * 100}%` }}
                    />
                    {hp.temp > 0 && (
                      <div
                        className="h-full rounded-full bg-info/75 -mt-1.5 ml-auto"
                        style={{ width: `${Math.min(1, hp.temp / hp.max) * 100}%` }}
                      />
                    )}
                  </div>
                  {/* HP controls row */}
                  {canAdjust && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onHpDelta(character.id, -5)}
                        className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-stone-gray bg-black/10 hover:bg-danger/10 hover:text-danger-ink transition-colors"
                        title="−5 HP"
                      >−5</button>
                      <button
                        onClick={() => onHpDelta(character.id, -1)}
                        className="flex items-center justify-center w-5 h-5 rounded text-stone-gray bg-black/10 hover:bg-danger/10 hover:text-danger-ink transition-colors"
                        title="−1 HP"
                      ><Minus className="w-3 h-3" /></button>
                      <span className="flex-1 text-center text-xs font-semibold text-stone-gray">
                        {hp.current}<span className="font-normal text-warm-gray">/{hp.max}</span>
                        {hp.temp > 0 && <span className="text-info-ink ml-0.5">+{hp.temp}</span>}
                      </span>
                      <button
                        onClick={() => onHpDelta(character.id, 1)}
                        className="flex items-center justify-center w-5 h-5 rounded text-stone-gray bg-black/10 hover:bg-success/10 hover:text-success-ink transition-colors"
                        title="+1 HP"
                      ><Plus className="w-3 h-3" /></button>
                      <button
                        onClick={() => onHpDelta(character.id, 5)}
                        className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-stone-gray bg-black/10 hover:bg-success/10 hover:text-success-ink transition-colors"
                        title="+5 HP"
                      >+5</button>
                    </div>
                  )}
                  {/* Read-only HP display for spectators/others who can't adjust */}
                  {!canAdjust && (
                    <p className="text-center text-xs font-semibold text-stone-gray">
                      {hp.current}<span className="font-normal text-warm-gray">/{hp.max}</span>
                      {hp.temp > 0 && <span className="text-info-ink ml-0.5">+{hp.temp}</span>}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          ); })}
        </div>
      )}
    </div>
  );
}
