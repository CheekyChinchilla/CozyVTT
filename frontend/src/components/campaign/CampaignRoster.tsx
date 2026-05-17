/**
 * Campaign Roster Component
 * Displays campaign members and their assigned characters with click handlers
 * Supports real-time updates via WebSocket
 */

import { useState, useEffect } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import { Users, Crown, Gamepad2, Eye, Edit, UserPlus, X, Minus, Plus, Dices } from 'lucide-react';
import type { CharacterHpInfo } from '@/utils/characterHp';
import CharacterSheetViewerModal from '../character/CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../character/CharacterSheetEditorModal';
import CharacterContextMenu from './CharacterContextMenu';
import CharacterRollPicker from './CharacterRollPicker';
import Toast, { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { CampaignRole, GameSystem, Character } from '@/types';

interface RosterMember {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: CampaignRole;
  joinedAt: string;
  characters: {
    id: string;
    name: string;
    tokenImageUrl: string | null;
    gameSystem: GameSystem | null;
    userId: string;
    hp: CharacterHpInfo | null;
  }[];
}

export default function CampaignRoster() {
  const { campaign, userRole, characterHpCache, seedCharacterHpCache } = useCampaign();
  const { socket } = useWebSocket();
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [roster, setRoster] = useState<RosterMember[]>([]);
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
      const hpEntries = response.roster.flatMap((m: RosterMember) =>
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

  const handleReassignCharacter = async () => {
    showToast('Character reassignment is not yet available', 'info');
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
        return 'bg-red-100 text-red-700';
      case 'PATHFINDER_2E':
        return 'bg-blue-100 text-blue-700';
      case 'SHADOWRUN_6E':
        return 'bg-purple-100 text-purple-700';
      case 'CALL_OF_CTHULHU_7E':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
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
        <Users className="w-5 h-5 text-moss-green" />
        <h3 className="text-lg font-semibold text-moss-green">Campaign Roster</h3>
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
              <h4 className="text-xs font-semibold text-moss-green/60 uppercase tracking-wider mb-2">
                Dungeon Master
              </h4>
              <div className="space-y-2">
                {groupedRoster.DM.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} />
                ))}
              </div>
            </div>
          )}

          {/* Players Section */}
          {groupedRoster.PLAYER.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-moss-green/60 uppercase tracking-wider mb-2">
                Players
              </h4>
              <div className="space-y-2">
                {groupedRoster.PLAYER.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} />
                ))}
              </div>
            </div>
          )}

          {/* Spectators Section */}
          {groupedRoster.SPECTATOR.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-moss-green/60 uppercase tracking-wider mb-2">
                Spectators
              </h4>
              <div className="space-y-2">
                {groupedRoster.SPECTATOR.map((member) => (
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterRightClick={handleCharacterRightClick} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} />
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
              visible: true,
            },
            {
              icon: Edit,
              label: 'Edit Character Sheet',
              onClick: handleEditCharacterSheet,
              visible: user.id === contextMenu.characterUserId || userMembership.role === 'DM',
            },
            {
              icon: UserPlus,
              label: 'Reassign to Player',
              onClick: handleReassignCharacter,
              visible: userMembership.role === 'DM',
            },
            {
              icon: X,
              label: 'Remove from Campaign',
              onClick: handleRemoveFromCampaign,
              visible: user.id === contextMenu.characterUserId || userMembership.role === 'DM',
              className: 'text-red-600 hover:bg-red-50',
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
          onRoll={(expression, purpose) => {
            socket?.emitDiceRoll({ expression, purpose });
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
  getRoleIcon: (role: CampaignRole) => any;
  getSystemBadgeColor: (gameSystem: GameSystem | null) => string;
  getSystemShortName: (gameSystem: GameSystem | null) => string;
  onCharacterClick: (characterId: string) => void;
  onCharacterRightClick: (e: React.MouseEvent, characterId: string, characterUserId: string) => void;
  isDM: boolean;
  currentUserId: string;
  characterHpCache: Record<string, CharacterHpInfo>;
  onHpDelta: (characterId: string, delta: number) => void;
}

function MemberCard({ member, getRoleIcon, getSystemBadgeColor, getSystemShortName, onCharacterClick, onCharacterRightClick, isDM, currentUserId, characterHpCache, onHpDelta }: MemberCardProps) {
  const RoleIcon = getRoleIcon(member.role);

  return (
    <div className="p-2 rounded-lg bg-parchment/50 hover:bg-parchment transition-colors">
      {/* Member Info */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`p-1.5 rounded-full ${
            member.role === 'DM' ? 'bg-moss-green/20' : 'bg-spirit-purple/20'
          }`}
        >
          <RoleIcon
            className={`w-4 h-4 ${
              member.role === 'DM' ? 'text-moss-green' : 'text-spirit-purple'
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
            const canDrag = isDM && !!character.tokenImageUrl;
            return (
            <div
              key={character.id}
              className="rounded bg-paper/50 hover:bg-paper/70 transition-colors"
            >
              <div
                onClick={() => onCharacterClick(character.id)}
                onContextMenu={(e) => onCharacterRightClick(e, character.id, character.userId)}
                className="flex items-center gap-2 p-1.5 cursor-pointer"
              >
              {/* Character Token — draggable by DM onto map */}
              {character.tokenImageUrl ? (
                <img
                  src={character.tokenImageUrl}
                  alt={character.name}
                  draggable={canDrag}
                  onDragStart={canDrag ? (e) => {
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                      type: 'character-token',
                      characterId: character.id,
                      name: character.name,
                      imageUrl: character.tokenImageUrl,
                      userId: character.userId,
                    }));
                  } : undefined}
                  className={`w-6 h-6 rounded-full object-cover border border-moss-green/20 ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  title={canDrag ? `Drag ${character.name} onto the map` : character.name}
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-moss-green/10 border border-moss-green/20 flex items-center justify-center">
                  <span className="text-xs text-moss-green font-semibold">
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
              const barColor = pct >= 0.75 ? 'bg-green-500'
                            : pct >= 0.50 ? 'bg-lime-500'
                            : pct >= 0.25 ? 'bg-amber-500'
                            :               'bg-red-500';
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
                        className="h-full rounded-full bg-blue-300/75 -mt-1.5 ml-auto"
                        style={{ width: `${Math.min(1, hp.temp / hp.max) * 100}%` }}
                      />
                    )}
                  </div>
                  {/* HP controls row */}
                  {canAdjust && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onHpDelta(character.id, -5)}
                        className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-stone-gray bg-black/10 hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="−5 HP"
                      >−5</button>
                      <button
                        onClick={() => onHpDelta(character.id, -1)}
                        className="flex items-center justify-center w-5 h-5 rounded text-stone-gray bg-black/10 hover:bg-red-100 hover:text-red-600 transition-colors"
                        title="−1 HP"
                      ><Minus className="w-3 h-3" /></button>
                      <span className="flex-1 text-center text-xs font-semibold text-stone-gray">
                        {hp.current}<span className="font-normal text-warm-gray">/{hp.max}</span>
                        {hp.temp > 0 && <span className="text-blue-500 ml-0.5">+{hp.temp}</span>}
                      </span>
                      <button
                        onClick={() => onHpDelta(character.id, 1)}
                        className="flex items-center justify-center w-5 h-5 rounded text-stone-gray bg-black/10 hover:bg-green-100 hover:text-green-600 transition-colors"
                        title="+1 HP"
                      ><Plus className="w-3 h-3" /></button>
                      <button
                        onClick={() => onHpDelta(character.id, 5)}
                        className="flex items-center justify-center w-5 h-5 rounded text-xs font-bold text-stone-gray bg-black/10 hover:bg-green-100 hover:text-green-600 transition-colors"
                        title="+5 HP"
                      >+5</button>
                    </div>
                  )}
                  {/* Read-only HP display for spectators/others who can't adjust */}
                  {!canAdjust && (
                    <p className="text-center text-xs font-semibold text-stone-gray">
                      {hp.current}<span className="font-normal text-warm-gray">/{hp.max}</span>
                      {hp.temp > 0 && <span className="text-blue-500 ml-0.5">+{hp.temp}</span>}
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
