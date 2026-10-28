/**
 * Initiative Tracker
 * Displays and controls combat turn order for all campaign participants.
 *
 * DM sees: full controls (add/remove combatants, set/roll initiative, next turn, end combat)
 * Players see: read-only ordered list with current turn highlighted
 *
 * Architecture:
 * - Server holds canonical CombatState in memory (initiativeState.ts)
 * - Any mutation emits the full updated state back to all campaign members via 'initiative.state'
 * - CampaignPage's useInitiativeSync() owns the subscription and mirrors that
 *   state into the game store; this panel and the map's active-token ring are
 *   both readers. Mutations still emit straight from here.
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useId } from 'react';
import {
  Swords,
  ChevronDown,
  ChevronUp,
  Play,
  SkipForward,
  XCircle,
  Plus,
  Trash2,
  Dices,
  Shield,
  Skull,
  User,
  GripVertical,
  Eye,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTokenListIgnoringMovement, useCombatState, usePeekTokenId, useGameStore } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { useTableRoll } from '@/hooks/useTableRoll';
import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { useLongPress } from '@/hooks/useLongPress';
import { showRowWhileDraggedByGrip } from '@/utils/rowDrag';
import { api } from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import CharacterContextMenu from '@/components/campaign/CharacterContextMenu';
import type { FlatMenuItem } from '@/components/ui/menu';
import CharacterRollPicker from '@/components/campaign/CharacterRollPicker';
import NpcRollPicker from '@/components/campaign/NpcRollPicker';
import CharacterSheetViewerModal from '@/components/character/CharacterSheetViewerModal';

import type { Character, CombatantEntry, Token } from '@/types';
import { TokenType } from '@/types';
import { tokenDisplayName, tokenPublicName, characterRollPublicName } from '@/utils/tokenDisplayName';
import { controlsToken } from '@/utils/tokenOwnership';
import { campaignHasCharacter, canRollTokenCharacter } from '@/utils/tokenCharacter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dispositionColor(entry: CombatantEntry): string {
  if (entry.type === 'player') return 'text-brand-ink';
  if (entry.disposition === 'friendly') return 'text-brand-ink';
  if (entry.disposition === 'hostile') return 'text-danger-ink';
  return 'text-stone-gray';
}

function dispositionIcon(entry: CombatantEntry) {
  if (entry.type === 'player') return <User className="w-3 h-3" />;
  if (entry.disposition === 'hostile') return <Skull className="w-3 h-3" />;
  return <Shield className="w-3 h-3" />;
}

// ---------------------------------------------------------------------------
// AddCombatantModal — DM picks a map token to add to initiative
// ---------------------------------------------------------------------------

interface AddCombatantModalProps {
  open: boolean;
  tokens: Token[];
  combatantIds: Set<string>;
  onAdd: (token: Token) => void;
  onClose: () => void;
}

function AddCombatantModal({ open, tokens, combatantIds, onAdd, onClose }: AddCombatantModalProps) {
  const available = tokens.filter((t) => !combatantIds.has(t.id) && t.visible);

  return (
    <Modal open={open} onClose={onClose} title="Add Combatant" size="sm">
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {available.length === 0 ? (
          <p className="text-sm text-stone-gray text-center py-4">
            All visible tokens are already in initiative.
          </p>
        ) : (
          available.map((token) => (
            <button
              key={token.id}
              type="button"
              onClick={() => { onAdd(token); onClose(); }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-moss-green/10 transition-colors text-left"
            >
              {token.imageUrl ? (
                <img
                  src={token.imageUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover border border-moss-green/20 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-gray/20 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-stone-gray" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-brand-ink truncate">{token.name}</div>
                <div className="text-xs text-stone-gray capitalize">
                  {token.type ?? 'npc'}{token.disposition ? ` · ${token.disposition}` : ''}
                </div>
              </div>
              {/*
                No initiative is shown here on purpose. A token keeps its last
                rolled value, but adding it to the order no longer carries that
                value in — a combatant joins as "—" and takes its place when
                something rolls. Advertising the old number on the button that
                adds it promised something the tracker would not deliver.
              */}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// CombatantRow
// ---------------------------------------------------------------------------

/** What moved a combatant one place, which keeps the cursor after the move. */
type MoveControl = 'grip' | 'up' | 'down';

interface CombatantRowProps {
  entry: CombatantEntry;
  isActive: boolean;
  /** This token is being pointed at — from this list, or from the map. */
  isPeeked: boolean;
  isDM: boolean;
  /** The primary pointer is a finger: the DM drags the row by its grip only. */
  coarsePointer: boolean;
  /**
   * Whether this viewer may roll initiative for this combatant. True for the DM
   * on every row, and for a player only on a token they control — so a player
   * sees one die, beside their own name.
   */
  canRoll: boolean;
  mapId: string | null;
  isDragOver: boolean;
  /** Id of the hidden hint that tells a keyboard user how the grip moves a row. */
  reorderHintId: string;
  onSetInitiative: (tokenId: string, value: number | null) => void;
  onRoll: (tokenId: string) => void;
  onRemove: (tokenId: string) => void;
  onDragStart: (e: React.DragEvent, tokenId: string) => void;
  onDragOver: (e: React.DragEvent, tokenId: string) => void;
  onDrop: (e: React.DragEvent, tokenId: string) => void;
  onDragEnd: () => void;
  /** Move this combatant one place up (-1) or down (1), from the control named, which keeps the cursor. */
  onMove: (tokenId: string, step: -1 | 1, from: MoveControl) => void;
  /** First and last in the order: Up and Down go no further. */
  isFirst: boolean;
  isLast: boolean;
  /** Right-clicking the row, or a finger's long-press on it, offers this viewer something: the sheet, rolls, or both. */
  hasMenu: boolean;
  /** Double-clicking the row opens the combatant's character sheet. */
  hasSheet: boolean;
  /** Open the row's menu at a point; `byKeyboard` puts the cursor in it. */
  onOpenMenu: (tokenId: string, x: number, y: number, byKeyboard: boolean) => void;
  onOpenSheet: (tokenId: string) => void;
}

/**
 * Where a right-click opens the menu. One from the keyboard (the menu key, or
 * Shift+F10) has no pointer position, so the menu opens under the element.
 */
function menuPoint(e: React.MouseEvent): { x: number; y: number; byKeyboard: boolean } {
  if (e.clientX === 0 && e.clientY === 0) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    return { x: rect.left, y: rect.bottom, byKeyboard: true };
  }
  return { x: e.clientX, y: e.clientY, byKeyboard: false };
}

function CombatantRow({
  entry, isActive, isPeeked, isDM, coarsePointer, canRoll, isDragOver, reorderHintId,
  onSetInitiative, onRoll, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd, onMove, isFirst, isLast,
  hasMenu, hasSheet, onOpenMenu, onOpenSheet,
}: CombatantRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(entry.initiative !== null ? String(entry.initiative) : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  // Enter and Escape hand the cursor back to the value; a click elsewhere
  // (the input's blur) leaves it where the click put it.
  const refocusValue = useRef(false);
  const name = tokenDisplayName(entry);
  // A finger held on the row opens its menu, as a right-click does; the grip
  // and an input being typed in never long-press.
  const longPress = useLongPress((at) => onOpenMenu(entry.tokenId, at.clientX, at.clientY, false));
  // On a touch screen the row drags by its grip only, so the long-press is
  // free to open the menu: an iPad's own drag would otherwise lift the row
  // at about the same moment.
  const rowDrags = isDM && !coarsePointer;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    } else if (refocusValue.current) {
      refocusValue.current = false;
      valueButtonRef.current?.focus();
    }
  }, [editing]);

  // Sync external changes (e.g. another DM updates value)
  useEffect(() => {
    if (!editing) setInputVal(entry.initiative !== null ? String(entry.initiative) : '');
  }, [entry.initiative, editing]);

  function commitEdit() {
    setEditing(false);
    const parsed = parseInt(inputVal, 10);
    const newVal = isNaN(parsed) ? null : parsed;
    if (newVal !== entry.initiative) {
      onSetInitiative(entry.tokenId, newVal);
    }
  }

  return (
    <div
      draggable={rowDrags}
      onDragStart={isDM ? (e) => {
        showRowWhileDraggedByGrip(e);
        onDragStart(e, entry.tokenId);
      } : undefined}
      onDragOver={isDM ? (e) => onDragOver(e, entry.tokenId) : undefined}
      onDrop={isDM ? (e) => onDrop(e, entry.tokenId) : undefined}
      onDragEnd={isDM ? onDragEnd : undefined}
      onMouseEnter={() => useGameStore.getState().setPeekToken(entry.tokenId, 'tracker')}
      onMouseLeave={() => useGameStore.getState().setPeekToken(null, 'tracker')}
      onPointerDown={hasMenu ? longPress.onPointerDown : undefined}
      onPointerMove={hasMenu ? longPress.onPointerMove : undefined}
      onPointerUp={hasMenu ? longPress.onPointerUp : undefined}
      onPointerCancel={hasMenu ? longPress.onPointerCancel : undefined}
      // With nothing to offer, the browser keeps its own menu, as it does in
      // a value being typed. Android's own long-press is the hook's.
      onContextMenu={hasMenu ? (e) => {
        if ((e.target as Element).closest('input')) return;
        if (longPress.takeContextMenu(e)) return;
        e.preventDefault();
        const at = menuPoint(e);
        onOpenMenu(entry.tokenId, at.x, at.y, at.byKeyboard);
      } : undefined}
      // The value, the die, the bin and the grip keep their own clicks.
      onDoubleClick={hasSheet ? (e) => {
        if ((e.target as Element).closest('input, button:not([data-combatant-name])')) return;
        onOpenSheet(entry.tokenId);
      } : undefined}
      // On a touch screen the die and bin are 44 pixels each, too wide to
      // sit beside everything else in a narrow rail: they go to a line of
      // their own, on the right.
      // No text selection or callout from a held finger; a value being
      // typed stays selectable.
      className={`flex items-center gap-2 p-2 rounded-lg transition-colors pointer-coarse:flex-wrap select-none [-webkit-touch-callout:none] [&_input]:select-text ${
        isDragOver
          ? 'border-t-2 border-moss-green'
          : isActive
            ? 'bg-warm-amber/20 border border-warm-amber/40'
            : isPeeked
              // Mirrors the map: hovering a token there tints its row here.
              ? 'bg-moss-green/10 border border-moss-green/40'
              : 'hover:bg-moss-green/5 border border-transparent'
      } ${rowDrags ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Drag handle (DM) or active dot (players). The handle also takes the
          Up and Down arrow keys, which move the row one place. It drags with
          every pointer, and is the only part of the row a finger drags. */}
      {isDM
        ? (
          <button
            type="button"
            data-grip-token={entry.tokenId}
            data-drag-grip
            draggable
            aria-label={`Move ${name}`}
            aria-describedby={reorderHintId}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // The map nudges selected walls on these keys at the window.
                e.preventDefault();
                e.stopPropagation();
                onMove(entry.tokenId, e.key === 'ArrowUp' ? -1 : 1, 'grip');
              }
            }}
            className="shrink-0 touch-target inline-flex items-center justify-center rounded-sm cursor-grab active:cursor-grabbing focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <GripVertical className="w-3.5 h-3.5 text-stone-gray/40 hover:text-stone-gray transition-colors" aria-hidden="true" />
          </button>
        )
        : <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-warm-amber' : 'bg-transparent'}`} />
      }

      {/* Active dot always shown for DM too, alongside grip */}
      {isDM && <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-warm-amber' : 'bg-transparent'}`} />}

      {/* Token image */}
      {entry.imageUrl ? (
        <img
          src={entry.imageUrl}
          alt={entry.name}
          // A picture is a drag of its own to a browser: on a touch screen
          // only the grip drags.
          draggable={coarsePointer ? false : undefined}
          className={`w-8 h-8 rounded-full object-cover shrink-0 border-2 ${
            isActive ? 'border-warm-amber' : 'border-moss-green/20'
          }`}
        />
      ) : (
        <div className={`w-8 h-8 rounded-full bg-stone-gray/20 flex items-center justify-center shrink-0 border-2 ${
          isActive ? 'border-warm-amber' : 'border-stone-gray/20'
        }`}>
          <User className="w-4 h-4 text-stone-gray" />
        </div>
      )}

      {/* Name + disposition. On a touch screen the name keeps 80 pixels
          before the die and bin go to a line of their own. */}
      <div className="flex-1 min-w-0 pointer-coarse:basis-20">
        {hasMenu ? (
          // A button, so the menu opens from a click, a tap or the keyboard,
          // under the name. From the keyboard (a click with no mouse button
          // count) the cursor goes into the menu. The second click of a
          // double-click opens nothing: the double-click opens the sheet.
          <button
            type="button"
            data-combatant-name={entry.tokenId}
            title={hasSheet ? 'Click for the sheet and rolls, or double-click to open the sheet' : 'Click for rolls'}
            onClick={(e) => {
              if (e.detail > 1) return;
              const rect = e.currentTarget.getBoundingClientRect();
              onOpenMenu(entry.tokenId, rect.left, rect.bottom, e.detail === 0);
            }}
            className={`block max-w-full touch-target text-left text-sm font-medium truncate rounded-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/50 ${isActive ? 'text-accent-ink' : 'text-brand-ink'}`}
          >
            {name}
          </button>
        ) : (
          <div className={`text-sm font-medium truncate ${isActive ? 'text-accent-ink' : 'text-brand-ink'}`}>
            {name}
          </div>
        )}
        {entry.hp && (
          <div className="text-xs text-stone-gray">
            HP {entry.hp.current}/{entry.hp.max}
          </div>
        )}
      </div>

      {/* Disposition icon */}
      <span className={`shrink-0 ${dispositionColor(entry)}`}>
        {dispositionIcon(entry)}
      </span>

      {/* Initiative value — editable for DM */}
      <div className="shrink-0 w-12 text-right">
        {isDM && editing ? (
          <input
            ref={inputRef}
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { refocusValue.current = true; commitEdit(); }
              if (e.key === 'Escape') { refocusValue.current = true; setEditing(false); }
            }}
            aria-label={`Initiative for ${name}`}
            className="w-12 text-center text-sm font-bold bg-paper/70 text-ink border border-warm-amber/50 rounded-sm px-1 py-0.5 focus:outline-hidden focus:ring-1 focus:ring-warm-amber"
          />
        ) : isDM ? (
          <button
            ref={valueButtonRef}
            type="button"
            className={`text-sm font-bold cursor-pointer rounded-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/50 ${isActive ? 'text-accent-ink' : 'text-stone-gray'}`}
            onClick={() => setEditing(true)}
            aria-label={`Initiative for ${name}: ${entry.initiative !== null ? entry.initiative : 'none'}. Edit`}
            title="Click to edit initiative value"
          >
            {entry.initiative !== null ? entry.initiative : '—'}
          </button>
        ) : (
          <span className={`text-sm font-bold cursor-default ${isActive ? 'text-accent-ink' : 'text-stone-gray'}`}>
            {entry.initiative !== null ? entry.initiative : '—'}
          </span>
        )}
      </div>

      {/* Actions. Rolling and removing are gated separately: a player may roll
          for their own combatant, but only the DM decides who is in the fight. */}
      {(canRoll || isDM) && (
        <div className="flex items-center gap-1 shrink-0 pointer-coarse:ml-auto">
          {/* The grip's Up and Down arrow keys, as buttons, where a finger is
              the pointer: a drag by touch may not work in every browser. */}
          {isDM && coarsePointer && (
            <>
              <button
                type="button"
                data-move-token={entry.tokenId}
                data-move="up"
                onClick={() => onMove(entry.tokenId, -1, 'up')}
                disabled={isFirst}
                aria-label={`Move ${name} up`}
                title="Move up one place"
                className="p-1 touch-target inline-flex items-center justify-center rounded-sm hover:bg-moss-green/10 text-stone-gray hover:text-brand-ink transition-colors disabled:opacity-40"
              >
                <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-move-token={entry.tokenId}
                data-move="down"
                onClick={() => onMove(entry.tokenId, 1, 'down')}
                disabled={isLast}
                aria-label={`Move ${name} down`}
                title="Move down one place"
                className="p-1 touch-target inline-flex items-center justify-center rounded-sm hover:bg-moss-green/10 text-stone-gray hover:text-brand-ink transition-colors disabled:opacity-40"
              >
                <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
          {canRoll && (
            <button
              onClick={() => onRoll(entry.tokenId)}
              title={isDM ? 'Roll initiative for this token' : 'Roll your initiative'}
              className="p-1 touch-target inline-flex items-center justify-center rounded-sm hover:bg-moss-green/10 text-stone-gray hover:text-brand-ink transition-colors"
            >
              <Dices className="w-3.5 h-3.5" />
            </button>
          )}
          {isDM && (
            <button
              onClick={() => onRemove(entry.tokenId)}
              title="Remove from initiative"
              className="p-1 touch-target inline-flex items-center justify-center rounded-sm hover:bg-danger/10 text-stone-gray hover:text-danger-ink transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InitiativeTracker component
// ---------------------------------------------------------------------------

export default function InitiativeTracker() {
  const { userRole, currentMap, campaign } = useCampaign();
  const { user } = useAuth();
  const { showToast } = useToast();
  // Initiative reads token names/ids, not coordinates — skip move re-renders.
  const tokens = useTokenListIgnoringMovement();
  const { socket } = useWebSocket();
  const tableRoll = useTableRoll(socket);
  // Combat state is mirrored into the game store by useInitiativeSync(), which
  // CampaignPage owns — the map's active-token ring reads the same snapshot,
  // and the subscription no longer dies with this panel.
  const combatState = useCombatState();
  // Cross-highlight: set when a row here is hovered, and when a token is
  // hovered on the map. Either way the matching row tints.
  const peekTokenId = usePeekTokenId();
  const [collapsed, setCollapsed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Drag-to-reorder state (DM only)
  const dragTokenId = useRef<string | null>(null);
  const [dragOverTokenId, setDragOverTokenId] = useState<string | null>(null);
  // A move of one place: what the live region last said, and which control
  // of which row takes the cursor back once the list has re-rendered in its
  // new order.
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const refocusAfterMove = useRef<{ tokenId: string; from: MoveControl } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reorderHintId = useId();

  const isDM = userRole === 'DM';
  const mapId = currentMap?.id ?? null;
  const coarsePointer = useCoarsePointer();

  // ── A combatant's sheet and rolls ────────────────────────────────────────
  //
  // What the map's right-click menu offers about a token's character, by the
  // same rules (utils/tokenCharacter), and the DM a creature's rolls. Only for
  // a token on the map being shown: one on another map is not loaded here.

  // `opening` counts the menus opened, so each is a menu of its own, placed
  // at its point: a long-press on another row brings no mousedown to close
  // the one open.
  const [menu, setMenu] = useState<{ tokenId: string; x: number; y: number; byKeyboard: boolean; opening: number } | null>(null);
  const menuOpenings = useRef(0);
  const [sheet, setSheet] = useState<{ character: Character; tokenId: string } | null>(null);
  const [characterRolls, setCharacterRolls] = useState<{ tokenId: string; characterId: string; x: number; y: number } | null>(null);
  const [creatureRolls, setCreatureRolls] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const membership = campaign?.memberships?.find((m) => m.userId === user?.id);

  const tokenOf = (tokenId: string): Token | undefined => tokens.find((t) => t.id === tokenId);
  const offersSheet = (token: Token | undefined): boolean => !!token && campaignHasCharacter(campaign, token.characterId);
  const offersCharacterRolls = (token: Token | undefined): boolean => !!token && canRollTokenCharacter(user, campaign, token);
  // As on the map: a creature's rolls are the DM's, and a token bound to a
  // character rolls from the sheet whatever its type says.
  const offersCreatureRolls = (token: Token | undefined): boolean =>
    !!token && isDM && !token.characterId && (token.type ?? TokenType.NPC) === TokenType.NPC;

  /**
   * What a combatant's menu offers this viewer, in order. A row has a menu
   * when this holds anything, so its right-click, long-press and name open
   * exactly the menus there are. A roll picker opens where the menu is open.
   */
  const combatantMenuItems = (token: Token): FlatMenuItem[] => {
    const items: FlatMenuItem[] = [];
    if (offersSheet(token)) {
      items.push({ kind: 'command', id: 'view-sheet', icon: Eye, label: 'View Character Sheet', run: () => { void openSheet(token.id); } });
    }
    if (offersCharacterRolls(token) || offersCreatureRolls(token)) {
      items.push({
        kind: 'command', id: 'roll', icon: Dices, label: 'Roll...',
        run: () => {
          if (!menu) return;
          const { x, y } = menu;
          if (offersCharacterRolls(token) && token.characterId) {
            setCharacterRolls({ tokenId: token.id, characterId: token.characterId, x, y });
          } else {
            setCreatureRolls({ tokenId: token.id, x, y });
          }
        },
      });
    }
    return items;
  };

  const openSheet = async (tokenId: string) => {
    const characterId = tokenOf(tokenId)?.characterId;
    if (!characterId) return;
    try {
      const { character } = await api.getCharacter(characterId);
      setSheet({ character, tokenId });
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Could not open that character sheet.', 'error');
    }
  };

  const closeMenu = () => {
    const opened = menu;
    setMenu(null);
    // From the keyboard, the cursor goes back to the name it came from.
    if (opened?.byKeyboard) {
      listRef.current?.querySelector<HTMLElement>(`[data-combatant-name="${CSS.escape(opened.tokenId)}"]`)?.focus();
    }
  };

  /**
   * Who may roll for a given combatant: the DM for anyone, a player only for a
   * token they control. `controlledBy` is the same field that decides who may
   * move a token, so the die appears exactly where the player already has
   * authority. The server enforces the same rule — this only decides whether to
   * draw the button.
   */
  const canRollFor = useCallback((tokenId: string) => {
    if (isDM) return true;
    // Only before the fight starts: re-rolling re-sorts the order, and the turn
    // pointer walks it by position, so a mid-combat change can skip someone's
    // turn. The server enforces the same rule, and that a spectator controls
    // no token.
    if (combatState.active) return false;
    return tokens.some((t) => t.id === tokenId && controlsToken(t, user?.id, userRole));
  }, [isDM, user, userRole, combatState.active, tokens]);

  /** A player has a combatant of their own that still has no initiative value. */
  const playerNeedsToRoll = !isDM && combatState.combatants.some(
    (c) => c.initiative === null && canRollFor(c.tokenId)
  );

  // ── DM Actions ───────────────────────────────────────────────────────────

  const handleAddToken = useCallback((token: Token) => {
    if (!socket || !mapId) return;
    socket.emitInitiativeAdd({ tokenId: token.id, mapId });
  }, [socket, mapId]);

  const handleRemove = useCallback((tokenId: string) => {
    if (!socket) return;
    socket.emitInitiativeRemove({ tokenId });
  }, [socket]);

  /**
   * The map a combatant's token is on. An entry follows its token to another
   * map, so the one the table is showing is only the fallback.
   */
  const mapOf = useCallback((tokenId: string): string | null =>
    combatState.combatants.find((c) => c.tokenId === tokenId)?.mapId ?? mapId,
  [combatState.combatants, mapId]);

  const handleSetInitiative = useCallback((tokenId: string, value: number | null) => {
    const onMap = mapOf(tokenId);
    if (!socket || !onMap) return;
    socket.emitInitiativeSet({ tokenId, mapId: onMap, value });
  }, [socket, mapOf]);

  const handleRollForToken = useCallback((tokenId: string) => {
    const onMap = mapOf(tokenId);
    if (!socket || !onMap) return;

    // No expression is sent. The server derives initiative from the combatant's
    // character sheet or stat block — it holds both, and this panel holds
    // neither. It also means a roll from here and a roll from the map's
    // right-click menu produce the same number by construction.
    //
    // This used to send a flat `1d20` for everything, so a Dexterity 20 rogue
    // rolled exactly what a Dexterity 8 wizard did.
    const token = tokens.find((t) => t.id === tokenId);
    socket.emitInitiativeRoll({ tokenId, mapId: onMap, characterName: token ? tokenPublicName(token) : undefined });
  }, [socket, mapOf, tokens]);

  const handleStart = useCallback(() => {
    if (!socket) return;
    socket.emitInitiativeStart();
  }, [socket]);

  const handleNext = useCallback(() => {
    if (!socket) return;
    socket.emitInitiativeNext();
  }, [socket]);

  const handleEnd = useCallback(() => {
    if (!socket) return;
    setShowEndConfirm(true);
  }, [socket]);

  const handleEndConfirmed = useCallback(() => {
    setShowEndConfirm(false);
    if (!socket) return;
    socket.emitInitiativeEnd();
  }, [socket]);

  const handleDragStart = useCallback((_e: React.DragEvent, tokenId: string) => {
    dragTokenId.current = tokenId;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, tokenId: string) => {
    e.preventDefault();
    setDragOverTokenId(tokenId);
  }, []);

  /**
   * Put one combatant at a new place in the order and send it. A drop and the
   * grip's arrow keys both come here, so both reach the server the same way.
   * Returns the moved entry and where it went, or null when nothing moved.
   */
  const reorderTo = useCallback((tokenId: string, toIndex: number) => {
    if (!socket) return null;
    const current = combatState.combatants;
    const fromIndex = current.findIndex((c) => c.tokenId === tokenId);
    if (fromIndex === -1 || toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) return null;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Optimistic update — the server's broadcast replaces this moments later.
    useGameStore.getState().setCombatState({ ...combatState, combatants: reordered });
    socket.emitInitiativeReorder({ orderedTokenIds: reordered.map((c) => c.tokenId) });
    return { moved, toIndex, total: reordered.length };
  }, [socket, combatState]);

  const handleDrop = useCallback((_e: React.DragEvent, targetTokenId: string) => {
    const draggedId = dragTokenId.current;
    dragTokenId.current = null;
    setDragOverTokenId(null);
    if (!draggedId || draggedId === targetTokenId) return;
    const toIndex = combatState.combatants.findIndex((c) => c.tokenId === targetTokenId);
    if (toIndex !== -1) reorderTo(draggedId, toIndex);
  }, [combatState.combatants, reorderTo]);

  /** The grip's Up and Down arrow keys, and the Up and Down buttons: one place, through the same path a drop takes. */
  const moveCombatant = useCallback((tokenId: string, step: -1 | 1, from: MoveControl) => {
    const fromIndex = combatState.combatants.findIndex((c) => c.tokenId === tokenId);
    if (fromIndex === -1) return;
    const result = reorderTo(tokenId, fromIndex + step);
    if (!result) return;
    refocusAfterMove.current = { tokenId, from };
    setMoveAnnouncement(`${tokenDisplayName(result.moved)} moved to ${result.toIndex + 1} of ${result.total}`);
  }, [combatState.combatants, reorderTo]);

  // Moving a focused row in the DOM can drop the cursor; put it back on the
  // control that moved the row, or on its grip where that control is now
  // off, at the top or the bottom.
  useLayoutEffect(() => {
    const moved = refocusAfterMove.current;
    if (!moved) return;
    refocusAfterMove.current = null;
    const id = CSS.escape(moved.tokenId);
    const button = moved.from === 'grip' ? null
      : listRef.current?.querySelector<HTMLButtonElement>(`[data-move-token="${id}"][data-move="${moved.from}"]`);
    const target = button && !button.disabled ? button : listRef.current?.querySelector<HTMLElement>(`[data-grip-token="${id}"]`);
    if (target && document.activeElement !== target) target.focus();
  }, [combatState.combatants]);

  const handleDragEnd = useCallback(() => {
    dragTokenId.current = null;
    setDragOverTokenId(null);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────

  const combatantIds = new Set(combatState.combatants.map((c) => c.tokenId));
  const currentCombatant = combatState.combatants.find((c) => c.tokenId === combatState.currentTokenId);

  // ── Render ───────────────────────────────────────────────────────────────

  const hasCombatants = combatState.combatants.length > 0;

  return (
    <>
      <div className="bg-soft-cream border border-moss-green/20 rounded-xl shadow-xs overflow-hidden">
        {isDM && (
          <>
            <p id={reorderHintId} className="sr-only">
              Use the Up and Down arrow keys to move this combatant one place in the order.
            </p>
            <p role="status" aria-live="polite" className="sr-only">{moveAnnouncement}</p>
          </>
        )}
        {/* Header */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-4 py-3 bg-parchment/40 hover:bg-parchment/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-brand-ink" />
            <span className="font-semibold text-brand-ink text-sm">Initiative Tracker</span>
            {combatState.active && (
              <span className="text-xs font-bold text-accent-ink bg-warm-amber/10 border border-warm-amber/20 rounded-sm px-1.5 py-0.5">
                Round {combatState.round}
              </span>
            )}
            {hasCombatants && !combatState.active && (
              <span className="text-xs text-stone-gray bg-stone-gray/10 rounded-sm px-1.5 py-0.5">
                {combatState.combatants.length} ready
              </span>
            )}
          </div>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-stone-gray" />
          ) : (
            <ChevronUp className="w-4 h-4 text-stone-gray" />
          )}
        </button>

        {!collapsed && (
          <div className="p-3 space-y-3">
            {/* Active turn banner */}
            {combatState.active && currentCombatant && (
              <div className="flex items-center gap-2 px-3 py-2 bg-warm-amber/10 border border-warm-amber/30 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-warm-amber animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-accent-ink truncate">
                  {tokenDisplayName(currentCombatant)}'s turn
                </span>
              </div>
            )}

            {/* Combatant list */}
            {hasCombatants ? (
              <div ref={listRef} className="space-y-1">
                {combatState.combatants.map((entry, index) => (
                  <CombatantRow
                    key={entry.tokenId}
                    isFirst={index === 0}
                    isLast={index === combatState.combatants.length - 1}
                    entry={entry}
                    isActive={combatState.active && entry.tokenId === combatState.currentTokenId}
                    isPeeked={entry.tokenId === peekTokenId}
                    isDM={isDM}
                    coarsePointer={coarsePointer}
                    canRoll={canRollFor(entry.tokenId)}
                    mapId={mapId}
                    isDragOver={isDM && dragOverTokenId === entry.tokenId}
                    reorderHintId={reorderHintId}
                    onSetInitiative={handleSetInitiative}
                    onRoll={handleRollForToken}
                    onRemove={handleRemove}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    onMove={moveCombatant}
                    hasMenu={(() => {
                      const token = tokenOf(entry.tokenId);
                      return !!token && combatantMenuItems(token).length > 0;
                    })()}
                    hasSheet={offersSheet(tokenOf(entry.tokenId))}
                    onOpenMenu={(tokenId, x, y, byKeyboard) => {
                      menuOpenings.current += 1;
                      setMenu({ tokenId, x, y, byKeyboard, opening: menuOpenings.current });
                    }}
                    onOpenSheet={(tokenId) => {
                      // A double-click on the name: its first click opened the menu.
                      setMenu(null);
                      void openSheet(tokenId);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-stone-gray">
                <Swords className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">No combatants yet</p>
                {isDM && (
                  <p className="text-xs mt-1">Add tokens from the map to begin</p>
                )}
              </div>
            )}

            {/* DM controls */}
            {isDM && (
              <div className="space-y-2 pt-1 border-t border-moss-green/10">
                {/* Add combatant */}
                {mapId && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium text-brand-ink border border-dashed border-moss-green/30 rounded-lg hover:bg-moss-green/5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Combatant
                  </button>
                )}

                {/* Start / Next / End */}
                {hasCombatants && (
                  <div className="flex gap-2">
                    {!combatState.active ? (
                      <button
                        onClick={handleStart}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-moss-green text-brand-text rounded-lg hover:bg-brand-hover transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Combat
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleNext}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-accent text-accent-text rounded-lg hover:bg-accent-hover transition-colors"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          Next Turn
                        </button>
                        <button
                          onClick={handleEnd}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold border border-danger/30 text-danger-ink rounded-lg hover:bg-danger/10 transition-colors"
                          title="End combat"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Initiative hint for DM */}
            {isDM && hasCombatants && !combatState.active && (
              <p className="text-xs text-stone-gray text-center">
                Drag to reorder · Click a value to edit · <Dices className="w-3 h-3 inline" /> to roll
              </p>
            )}

            {/* The same nudge for a player who has a combatant of their own and
                has not rolled yet — the die is small and easy to miss. */}
            {!isDM && hasCombatants && !combatState.active && playerNeedsToRoll && (
              <p className="text-xs text-stone-gray text-center">
                <Dices className="w-3 h-3 inline" /> to roll your initiative
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add combatant modal */}
      <AddCombatantModal
        open={showAddModal && mapId !== null}
        tokens={tokens}
        combatantIds={combatantIds}
        onAdd={handleAddToken}
        onClose={() => setShowAddModal(false)}
      />

      {menu && (() => {
        const token = tokenOf(menu.tokenId);
        if (!token) return null;
        return (
          <CharacterContextMenu
            key={menu.opening}
            x={menu.x}
            y={menu.y}
            autoFocus={menu.byKeyboard}
            items={combatantMenuItems(token)}
            onClose={closeMenu}
          />
        );
      })()}

      {sheet && campaign && membership && (
        <CharacterSheetViewerModal
          character={sheet.character}
          campaignId={campaign.id}
          membership={membership}
          // Rolls from it reach the whole table, as from Roll... below.
          publicName={characterRollPublicName(tokenOf(sheet.tokenId), user?.id)}
          onClose={() => setSheet(null)}
        />
      )}

      {characterRolls && (
        <CharacterRollPicker
          characterId={characterRolls.characterId}
          onSpendHitDie={(index) => socket?.emitHitDiceSpend({ characterId: characterRolls.characterId, index })}
          anchorX={characterRolls.x}
          anchorY={characterRolls.y}
          publicName={characterRollPublicName(tokenOf(characterRolls.tokenId), user?.id)}
          onRoll={(expression, purpose, characterName) => tableRoll({ expression, purpose, characterName })}
          onRollInitiative={canRollFor(characterRolls.tokenId) ? () => handleRollForToken(characterRolls.tokenId) : undefined}
          onClose={() => setCharacterRolls(null)}
        />
      )}

      {creatureRolls && (() => {
        const token = tokenOf(creatureRolls.tokenId);
        if (!token) return null;
        return (
          <NpcRollPicker
            token={token}
            gameSystem={campaign?.gameSystem ?? 'DND_5E'}
            anchorX={creatureRolls.x}
            anchorY={creatureRolls.y}
            onRoll={(expression, purpose, characterName) => tableRoll({ expression, purpose, characterName })}
            onClose={() => setCreatureRolls(null)}
          />
        );
      })()}

      {/* End combat confirmation */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        title="End Combat"
        message="End combat and clear initiative order?"
        confirmLabel="End Combat"
        variant="danger"
        onConfirm={handleEndConfirmed}
        onCancel={() => setShowEndConfirm(false)}
      />
    </>
  );
}
