/**
 * Campaign Roster Component
 * Displays campaign members and their assigned characters with click handlers
 * Supports real-time updates via WebSocket
 */

import { HP_HUES, TEMP_HP_FILL, hpTier, hueColour } from '@/utils/tokenColours';
import { useState, useEffect, useEffectEvent, useRef } from 'react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore, useCharacterHp, useOnlineUserIds } from '@/stores/gameStore';
import { characterTokenDrag, characterTokenRequest } from '@/utils/characterTokenDrag';
import { useAuth } from '@/contexts/AuthContext';
import { useTableRoll } from '@/hooks/useTableRoll';
import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { useLongPress, type LongPressPoint } from '@/hooks/useLongPress';
import { showRowWhileDraggedByGrip } from '@/utils/rowDrag';
import { api } from '@/services/api';
import { apiErrorMessage, errorSummary } from '@/utils/errors';
import { canRollAsCharacter, canEditCharacter, canRemoveCharacterFromCampaign } from '@/services/permissions';
import { Users, Crown, Gamepad2, Eye, Edit, X, Minus, Plus, Dices, MapPin, GripVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CharacterHpInfo } from '@/utils/characterHp';
import CharacterSheetViewerModal from '../character/CharacterSheetViewerModal';
import CharacterSheetEditorModal from '../character/CharacterSheetEditorModal';
import CharacterContextMenu from './CharacterContextMenu';
import CharacterRollPicker from './CharacterRollPicker';
import Toast, { useToast } from '@/components/Toast';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { CampaignRole, GameSystem, Character, RosterMember, User, CampaignMembership } from '@/types';
import type { FlatMenuItem } from '@/components/ui/menu';
import { TokenLayer } from '@/types';

/** A character's menu, open at a point. */
interface CharacterMenu { x: number; y: number; characterId: string; characterUserId: string; opening: number }

export default function CampaignRoster() {
  const { campaign, currentMap, userRole } = useCampaign();
  const characterHpCache = useCharacterHp();
  const { socket } = useWebSocket();
  const tableRoll = useTableRoll(socket);
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  // Who is connected right now, shown as a dot beside each member. This is
  // what replaced the "X has joined / has left" chat messages. Kept in the
  // game store by usePresenceSync, which the campaign page mounts.
  const onlineUserIds = useOnlineUserIds();
  const [loading, setLoading] = useState(true);
  // The last load failed, so an empty list is not an empty campaign.
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [editorCharacter, setEditorCharacter] = useState<Character | null>(null);
  const [_viewerLoading, setViewerLoading] = useState(false);
  // `opening` counts the menus opened, so each is a menu of its own, placed
  // at its point: a long-press on another row brings no mousedown to close
  // the one open.
  const [contextMenu, setContextMenu] = useState<CharacterMenu | null>(null);
  const menuOpenings = useRef(0);
  const [rollPicker, setRollPicker] = useState<{ x: number; y: number; characterId: string } | null>(null);
  // The character Remove from Campaign asks about. Kept apart from the menu,
  // which closes as soon as the item is chosen.
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Each fetch is numbered and only the newest answer is shown: two
  // refetches can answer out of order.
  const rosterSeq = useRef(0);

  // Fetch roster data. "Loading roster..." is for the first load only; a
  // refetch keeps the list on screen, so a drag or hover on it carries on.
  const fetchRoster = async () => {
    if (!campaign?.id) return;
    const seq = ++rosterSeq.current;

    try {
      const response = await api.getCampaignCharacters(campaign.id);
      if (seq !== rosterSeq.current) return;
      setRoster(response.roster);
      setLoadFailed(false);

      // Seed the HP cache so MapCanvas can render player HP bars
      const hpEntries = response.roster.flatMap((m) =>
        m.characters.map((c) => ({ id: c.id, hp: c.hp }))
      );
      useGameStore.getState().seedCharacterHp(hpEntries);
    } catch (error) {
      if (seq !== rosterSeq.current) return;
      setLoadFailed(true);
      showToast(apiErrorMessage(error) || 'Could not load the roster', 'error');
    } finally {
      if (seq === rosterSeq.current) setLoading(false);
    }
  };

  const refetchRoster = useEffectEvent(() => {
    fetchRoster();
  });

  useEffect(() => {
    refetchRoster();
  }, [campaign?.id]);

  // Listen for roster updates via WebSocket
  useEffect(() => {
    if (!socket || !campaign?.id) return;

    const handleRosterUpdate = () => {
      console.log('Roster updated - refetching...');
      refetchRoster();
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
      showToast(apiErrorMessage(error) || 'Could not open that character sheet', 'error');
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

  // A character's menu, opened at a point by a right-click or a long-press
  const handleCharacterMenu = (at: LongPressPoint, characterId: string, characterUserId: string) => {
    menuOpenings.current += 1;
    setContextMenu({
      x: at.clientX,
      y: at.clientY,
      characterId,
      characterUserId,
      opening: menuOpenings.current,
    });
  };
  // A finger's drags start from a grip on a touch screen, so a long-press
  // elsewhere on the row is free to open its menu.
  const coarsePointer = useCoarsePointer();

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
        showToast(apiErrorMessage(error) || 'Failed to load character for editing', 'error');
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
      showToast(`${character.name} placed on the map`, 'success');
    } catch (error) {
      showToast(apiErrorMessage(error) || 'Could not place that character on the map', 'error');
    }
  };

  /** What a character's menu offers this viewer, in order. */
  const characterMenuItems = (menu: CharacterMenu, viewer: User, membership: CampaignMembership): FlatMenuItem[] => {
    const owner = { userId: menu.characterUserId };
    const items: FlatMenuItem[] = [{ kind: 'command', id: 'view-sheet', icon: Eye, label: 'View Character Sheet', run: handleViewCharacterSheet }];
    // Rolling uses the sheet's modifiers, so it follows character
    // ownership, like Edit and Remove below — not `true`, which let
    // any member roll anyone's character.
    if (canRollAsCharacter(viewer, owner, membership)) {
      items.push({
        kind: 'command', id: 'roll', icon: Dices, label: 'Roll...',
        run: () => {
          setRollPicker({ x: menu.x, y: menu.y, characterId: menu.characterId });
          handleCloseContextMenu();
        },
      });
    }
    if (canEditCharacter(viewer, owner, membership)) {
      items.push({ kind: 'command', id: 'edit-sheet', icon: Edit, label: 'Edit Character Sheet', run: handleEditCharacterSheet });
    }
    if (membership.role === 'DM' && currentMap) {
      items.push({ kind: 'command', id: 'add-to-map', icon: MapPin, label: 'Add to Map', run: handleAddTokenToMap });
    }
    // "Reassign to Player" used to sit here. It never did anything —
    // it popped "not yet available" — and there is no endpoint behind
    // it either: /characters/:id/assign moves a character between
    // *campaigns*, not between owners. Better absent than advertised.
    // It comes back when the endpoint does.
    if (canRemoveCharacterFromCampaign(viewer, owner, membership)) {
      items.push({ kind: 'command', id: 'remove', icon: X, label: 'Remove from Campaign', tone: 'danger', run: handleRemoveFromCampaign });
    }
    return items;
  };

  const handleRemoveFromCampaign = () => {
    if (!contextMenu || !campaign) return;
    setConfirmRemove(contextMenu.characterId);
  };

  const handleConfirmRemove = async () => {
    const characterId = confirmRemove;
    setConfirmRemove(null);
    if (!characterId || !campaign) return;
    try {
      await api.assignCharacterToCampaign(characterId, null);
      await fetchRoster();
    } catch (error) {
      console.error('Error removing character from campaign:', errorSummary(error));
      showToast(apiErrorMessage(error) || 'Failed to remove character from campaign', 'error');
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
      ) : roster.length === 0 && loadFailed ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-warm-gray">The roster could not be loaded.</p>
          <button
            type="button"
            onClick={() => { void fetchRoster(); }}
            className="text-xs text-brand-ink underline hover:text-brand-ink/80"
          >
            Try again
          </button>
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
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterMenu={handleCharacterMenu} coarsePointer={coarsePointer} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} canAdjustOwn={userMembership?.role === 'PLAYER'} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
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
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterMenu={handleCharacterMenu} coarsePointer={coarsePointer} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} canAdjustOwn={userMembership?.role === 'PLAYER'} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
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
                  <MemberCard key={member.userId} member={member} getRoleIcon={getRoleIcon} getSystemBadgeColor={getSystemBadgeColor} getSystemShortName={getSystemShortName} onCharacterClick={handleCharacterClick} onCharacterMenu={handleCharacterMenu} coarsePointer={coarsePointer} isDM={userRole === 'DM'} currentUserId={user?.id ?? ''} canAdjustOwn={userMembership?.role === 'PLAYER'} characterHpCache={characterHpCache} onHpDelta={handleHpDelta} isOnline={onlineUserIds.has(member.userId)} />
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
          key={contextMenu.opening}
          x={contextMenu.x}
          y={contextMenu.y}
          items={characterMenuItems(contextMenu, user, userMembership)}
          onClose={handleCloseContextMenu}
        />
      )}

      {/* Roll Picker */}
      {rollPicker && (
        <CharacterRollPicker
          characterId={rollPicker.characterId}
          onSpendHitDie={(index) =>
            socket?.emitHitDiceSpend({ characterId: rollPicker.characterId, index })
          }
          anchorX={rollPicker.x}
          anchorY={rollPicker.y}
          onRoll={(expression, purpose, characterName) => tableRoll({ expression, purpose, characterName })}
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

      {/* TODO(ui): the confirmation does not name the character it removes;
          say "Remove <name> from the campaign?" so a menu opened on the
          wrong row cannot remove someone unseen. */}
      <ConfirmDialog
        isOpen={confirmRemove !== null}
        title="Remove from Campaign"
        message="Are you sure you want to remove this character from the campaign?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleConfirmRemove}
        onCancel={() => setConfirmRemove(null)}
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
  /** Open a character's menu at a point: a right-click, or a finger's long-press. */
  onCharacterMenu: (at: LongPressPoint, characterId: string, characterUserId: string) => void;
  /** The primary pointer is a finger: a character drags by its grip only. */
  coarsePointer: boolean;
  isDM: boolean;
  currentUserId: string;
  /** The viewer is a player, so may adjust their own characters' hit points; a spectator may not. */
  canAdjustOwn: boolean;
  characterHpCache: Record<string, CharacterHpInfo>;
  onHpDelta: (characterId: string, delta: number) => void;
  /** Has at least one live connection to this campaign right now. */
  isOnline: boolean;
}

function MemberCard({ member, getRoleIcon, getSystemBadgeColor, getSystemShortName, onCharacterClick, onCharacterMenu, coarsePointer, isDM, currentUserId, canAdjustOwn, characterHpCache, onHpDelta, isOnline }: MemberCardProps) {
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
        <div className="relative shrink-0">
          <div
            className={`p-1.5 rounded-full ${
              member.role === 'DM' ? 'bg-moss-green/20' : 'bg-spirit-purple/20'
            }`}
          >
            {/* eslint-disable-next-line react-hooks/static-components -- getRoleIcon picks one of two lucide icons; no component is made here */}
            <RoleIcon
              className={`w-4 h-4 ${
                member.role === 'DM' ? 'text-brand-ink' : 'text-spirit-ink'
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
      {/* Not indented on a touch screen, where the hit point buttons are 44
          pixels each and need the room. */}
      {member.characters.length > 0 && (
        <div className="ml-9 pointer-coarse:ml-0 space-y-1">
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
              className="rounded-sm bg-paper/50 hover:bg-paper/70 transition-colors"
            >
              <CharacterRow
                character={character}
                canDrag={canDrag}
                coarsePointer={coarsePointer}
                onClick={() => onCharacterClick(character.id)}
                onMenu={(at) => onCharacterMenu(at, character.id, character.userId)}
                badgeColor={getSystemBadgeColor(character.gameSystem)}
                systemShortName={getSystemShortName(character.gameSystem)}
              />

            {/* HP bar + controls — shown when character has HP data and user can edit */}
            {(() => {
              const hp = characterHpCache[character.id] ?? character.hp;
              const canAdjust = isDM || (canAdjustOwn && character.userId === currentUserId);
              if (!hp || hp.max === 0) return null;
              const pct = Math.max(0, Math.min(1, hp.current / hp.max));
              // The tiers and colours of the map's HP bars.
              const barColor = hueColour(HP_HUES[hpTier(pct)]);
              return (
                <div className="mt-1 space-y-1" onClick={(e) => e.stopPropagation()}>
                  {/* HP progress bar */}
                  <div className="h-1.5 w-full rounded-full bg-black/20 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct * 100}%`, backgroundColor: barColor }}
                    />
                    {hp.temp > 0 && (
                      <div
                        className="h-full rounded-full -mt-1.5 ml-auto"
                        style={{ width: `${Math.min(1, hp.temp / hp.max) * 100}%`, backgroundColor: TEMP_HP_FILL }}
                      />
                    )}
                  </div>
                  {/* HP controls row */}
                  {/* On a touch screen the buttons are 44 pixels each, and four
                      of them do not fit one line of a narrow panel: the row
                      wraps, keeping each pair together, the plus pair on the
                      right. */}
                  {canAdjust && (
                    <div className="flex items-center gap-1 pointer-coarse:flex-wrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onHpDelta(character.id, -5)}
                          className="flex items-center justify-center w-5 h-5 touch-target rounded-sm text-xs font-bold text-stone-gray bg-black/10 hover:bg-danger/10 hover:text-danger-ink transition-colors"
                          title="−5 HP"
                        >−5</button>
                        <button
                          onClick={() => onHpDelta(character.id, -1)}
                          className="flex items-center justify-center w-5 h-5 touch-target rounded-sm text-stone-gray bg-black/10 hover:bg-danger/10 hover:text-danger-ink transition-colors"
                          title="−1 HP"
                        ><Minus className="w-3 h-3" /></button>
                      </div>
                      <span className="flex-1 text-center text-xs font-semibold text-stone-gray">
                        {hp.current}<span className="font-normal text-warm-gray">/{hp.max}</span>
                        {hp.temp > 0 && <span className="text-info-ink ml-0.5">+{hp.temp}</span>}
                      </span>
                      <div className="flex items-center gap-1 pointer-coarse:ml-auto">
                        <button
                          onClick={() => onHpDelta(character.id, 1)}
                          className="flex items-center justify-center w-5 h-5 touch-target rounded-sm text-stone-gray bg-black/10 hover:bg-success/10 hover:text-success-ink transition-colors"
                          title="+1 HP"
                        ><Plus className="w-3 h-3" /></button>
                        <button
                          onClick={() => onHpDelta(character.id, 5)}
                          className="flex items-center justify-center w-5 h-5 touch-target rounded-sm text-xs font-bold text-stone-gray bg-black/10 hover:bg-success/10 hover:text-success-ink transition-colors"
                          title="+5 HP"
                        >+5</button>
                      </div>
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

interface CharacterRowProps {
  character: RosterMember['characters'][number];
  /** The viewer is the DM, who may drag the character onto the map. */
  canDrag: boolean;
  coarsePointer: boolean;
  onClick: () => void;
  onMenu: (at: LongPressPoint) => void;
  badgeColor: string;
  systemShortName: string;
}

/**
 * A character's line in the roster: a click or a tap opens the sheet, and a
 * right-click or a finger's long-press the character's menu. The DM drags it
 * onto the map, with a mouse from anywhere on the line and on a touch screen
 * from the grip at its start only, which never long-presses: an iPad's own
 * drag would otherwise lift the line at about the time the menu opens.
 */
function CharacterRow({ character, canDrag, coarsePointer, onClick, onMenu, badgeColor, systemShortName }: CharacterRowProps) {
  const longPress = useLongPress(onMenu);
  const dragTitle = `Drag ${character.name} onto the map`;
  const rowDrags = canDrag && !coarsePointer;
  return (
    <div
      onClick={onClick}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onContextMenu={(e) => {
        if (longPress.takeContextMenu(e)) return;
        e.preventDefault();
        onMenu({ clientX: e.clientX, clientY: e.clientY });
      }}
      draggable={rowDrags}
      onDragStart={canDrag ? (e) => {
        showRowWhileDraggedByGrip(e);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', JSON.stringify(characterTokenDrag({
          id: character.id,
          name: character.name,
          tokenImageUrl: character.tokenImageUrl,
          userId: character.userId,
        })));
      } : undefined}
      title={rowDrags ? dragTitle : undefined}
      className={`flex items-center gap-2 p-1.5 cursor-pointer select-none [-webkit-touch-callout:none] ${rowDrags ? 'active:cursor-grabbing' : ''}`}
    >
      {/* 44 pixels square to a finger, but 24 of the row's width: its
          target reaches 10 pixels into the padding and the gap either side,
          which leaves the name room in a narrow panel. */}
      {canDrag && coarsePointer && (
        <span
          data-drag-grip
          draggable
          title={dragTitle}
          aria-hidden="true"
          className="touch-target inline-flex items-center justify-center shrink-0 -my-1.5 -mx-2.5 rounded-sm text-stone-gray/60 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      )}

      {/* Character Token — draggable by DM onto map */}
      {character.tokenImageUrl ? (
        <img
          src={character.tokenImageUrl}
          alt={character.name}
          // A picture is a drag of its own to a browser: on a touch screen
          // only the grip drags.
          draggable={coarsePointer ? false : undefined}
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

      {/* Character name and game system badge, side by side; on a touch
          screen, where the grip and the bigger targets take the room, the
          badge goes under the name. */}
      <div className="flex-1 min-w-0 flex items-center gap-2 pointer-coarse:flex-col pointer-coarse:items-start pointer-coarse:gap-0.5">
        <p className="text-xs font-medium text-stone-gray flex-1 max-w-full truncate">
          {character.name}
        </p>
        {character.gameSystem && (
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
            {systemShortName}
          </span>
        )}
      </div>
    </div>
  );
}
