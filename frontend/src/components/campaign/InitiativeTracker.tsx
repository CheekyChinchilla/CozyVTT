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
 * - On mount, client requests state with 'initiative.request_state'
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useTokenListIgnoringMovement } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import ConfirmDialog from '@/components/common/ConfirmDialog';

import type { CombatState, CombatantEntry, Token } from '@/types';

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
  tokens: Token[];
  combatantIds: Set<string>;
  mapId: string;
  onAdd: (token: Token) => void;
  onClose: () => void;
}

function AddCombatantModal({ tokens, combatantIds, mapId: _mapId, onAdd, onClose }: AddCombatantModalProps) {
  const available = tokens.filter((t) => !combatantIds.has(t.id) && t.visible);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        className="bg-soft-cream border-2 border-moss-green/30 rounded-xl shadow-2xl w-full max-w-sm mx-4"
      >
        <div className="flex items-center justify-between p-4 border-b border-moss-green/20">
          <h3 className="font-bold text-brand-ink">Add Combatant</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-stone-gray/10 transition-colors">
            <XCircle className="w-4 h-4 text-stone-gray" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-stone-gray text-center py-4">
              All visible tokens are already in initiative.
            </p>
          ) : (
            available.map((token) => (
              <button
                key={token.id}
                onClick={() => { onAdd(token); onClose(); }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-moss-green/10 transition-colors text-left"
              >
                {token.imageUrl ? (
                  <img
                    src={token.imageUrl}
                    alt={token.name}
                    className="w-8 h-8 rounded-full object-cover border border-moss-green/20 flex-shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-stone-gray/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-stone-gray" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-brand-ink truncate">{token.name}</div>
                  <div className="text-xs text-stone-gray capitalize">
                    {token.type ?? 'npc'}{token.disposition ? ` · ${token.disposition}` : ''}
                  </div>
                </div>
                {token.initiative !== null && (
                  <span className="text-xs font-bold text-warm-amber">Init {token.initiative}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CombatantRow
// ---------------------------------------------------------------------------

interface CombatantRowProps {
  entry: CombatantEntry;
  isActive: boolean;
  isDM: boolean;
  mapId: string | null;
  isDragOver: boolean;
  onSetInitiative: (tokenId: string, value: number | null) => void;
  onRoll: (tokenId: string) => void;
  onRemove: (tokenId: string) => void;
  onDragStart: (e: React.DragEvent, tokenId: string) => void;
  onDragOver: (e: React.DragEvent, tokenId: string) => void;
  onDrop: (e: React.DragEvent, tokenId: string) => void;
  onDragEnd: () => void;
}

function CombatantRow({
  entry, isActive, isDM, isDragOver,
  onSetInitiative, onRoll, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: CombatantRowProps) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(entry.initiative !== null ? String(entry.initiative) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
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
      draggable={isDM}
      onDragStart={isDM ? (e) => onDragStart(e, entry.tokenId) : undefined}
      onDragOver={isDM ? (e) => onDragOver(e, entry.tokenId) : undefined}
      onDrop={isDM ? (e) => onDrop(e, entry.tokenId) : undefined}
      onDragEnd={isDM ? onDragEnd : undefined}
      className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
        isDragOver
          ? 'border-t-2 border-moss-green'
          : isActive
            ? 'bg-warm-amber/20 border border-warm-amber/40'
            : 'hover:bg-moss-green/5 border border-transparent'
      } ${isDM ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Drag handle (DM) or active dot (players) */}
      {isDM
        ? <GripVertical className="w-3.5 h-3.5 text-stone-gray/40 flex-shrink-0 hover:text-stone-gray transition-colors" />
        : <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-warm-amber' : 'bg-transparent'}`} />
      }

      {/* Active dot always shown for DM too, alongside grip */}
      {isDM && <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? 'bg-warm-amber' : 'bg-transparent'}`} />}

      {/* Token image */}
      {entry.imageUrl ? (
        <img
          src={entry.imageUrl}
          alt={entry.name}
          className={`w-8 h-8 rounded-full object-cover flex-shrink-0 border-2 ${
            isActive ? 'border-warm-amber' : 'border-moss-green/20'
          }`}
        />
      ) : (
        <div className={`w-8 h-8 rounded-full bg-stone-gray/20 flex items-center justify-center flex-shrink-0 border-2 ${
          isActive ? 'border-warm-amber' : 'border-stone-gray/20'
        }`}>
          <User className="w-4 h-4 text-stone-gray" />
        </div>
      )}

      {/* Name + disposition */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${isActive ? 'text-warm-amber' : 'text-brand-ink'}`}>
          {entry.name}
        </div>
        {entry.hp && (
          <div className="text-xs text-stone-gray">
            HP {entry.hp.current}/{entry.hp.max}
          </div>
        )}
      </div>

      {/* Disposition icon */}
      <span className={`flex-shrink-0 ${dispositionColor(entry)}`}>
        {dispositionIcon(entry)}
      </span>

      {/* Initiative value — editable for DM */}
      <div className="flex-shrink-0 w-12 text-right">
        {isDM && editing ? (
          <input
            ref={inputRef}
            type="number"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); } }}
            className="w-12 text-center text-sm font-bold bg-paper/70 text-ink border border-warm-amber/50 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-warm-amber"
          />
        ) : (
          <span
            className={`text-sm font-bold cursor-${isDM ? 'pointer' : 'default'} ${isActive ? 'text-warm-amber' : 'text-stone-gray'}`}
            onClick={() => isDM && setEditing(true)}
            title={isDM ? 'Click to edit initiative value' : undefined}
          >
            {entry.initiative !== null ? entry.initiative : '—'}
          </span>
        )}
      </div>

      {/* DM actions */}
      {isDM && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onRoll(entry.tokenId)}
            title="Roll initiative for this token"
            className="p-1 rounded hover:bg-moss-green/10 text-stone-gray hover:text-brand-ink transition-colors"
          >
            <Dices className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onRemove(entry.tokenId)}
            title="Remove from initiative"
            className="p-1 rounded hover:bg-danger/10 text-stone-gray hover:text-danger-ink transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main InitiativeTracker component
// ---------------------------------------------------------------------------

export default function InitiativeTracker() {
  const { userRole, currentMap } = useCampaign();
  // Initiative reads token names/ids, not coordinates — skip move re-renders.
  const tokens = useTokenListIgnoringMovement();
  const { socket } = useWebSocket();
  const [combatState, setCombatState] = useState<CombatState>({
    active: false,
    round: 0,
    currentTokenId: null,
    combatants: [],
  });
  const [collapsed, setCollapsed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Drag-to-reorder state (DM only)
  const dragTokenId = useRef<string | null>(null);
  const [dragOverTokenId, setDragOverTokenId] = useState<string | null>(null);

  const isDM = userRole === 'DM';
  const mapId = currentMap?.id ?? null;

  // ── WebSocket listeners ──────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const handleState = (state: CombatState) => {
      setCombatState(state);
    };

    socket.onInitiativeState(handleState);

    // Request current state on mount (handles reconnects too)
    socket.emitInitiativeRequestState();

    return () => {
      socket.getSocket()?.off('initiative.state', handleState);
    };
  }, [socket]);

  // ── DM Actions ───────────────────────────────────────────────────────────

  const handleAddToken = useCallback((token: Token) => {
    if (!socket || !mapId) return;
    socket.emitInitiativeAdd({ tokenId: token.id, mapId });
  }, [socket, mapId]);

  const handleRemove = useCallback((tokenId: string) => {
    if (!socket) return;
    socket.emitInitiativeRemove({ tokenId });
  }, [socket]);

  const handleSetInitiative = useCallback((tokenId: string, value: number | null) => {
    if (!socket || !mapId) return;
    socket.emitInitiativeSet({ tokenId, mapId, value });
  }, [socket, mapId]);

  const handleRollForToken = useCallback((tokenId: string) => {
    if (!socket || !mapId) return;

    // Try to find a linked character to get the system-specific expression
    const token = tokens.find((t) => t.id === tokenId);
    let expression: string | null = null;

    if (token?.characterId) {
      // We'll derive the expression client-side from the character in context
      // (characters are loaded in CampaignContext via the roster)
      // Fall back to 1d20 if we can't determine the system
      expression = '1d20';
    } else {
      expression = '1d20';
    }

    socket.emitInitiativeRoll({ tokenId, mapId, expression, characterName: token?.name });
  }, [socket, mapId, tokens]);

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

  const handleDrop = useCallback((_e: React.DragEvent, targetTokenId: string) => {
    if (!socket || !dragTokenId.current || dragTokenId.current === targetTokenId) return;

    const current = combatState.combatants;
    const fromIndex = current.findIndex((c) => c.tokenId === dragTokenId.current);
    const toIndex = current.findIndex((c) => c.tokenId === targetTokenId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Optimistic update
    setCombatState((prev) => ({ ...prev, combatants: reordered }));
    socket.emitInitiativeReorder({ orderedTokenIds: reordered.map((c) => c.tokenId) });

    dragTokenId.current = null;
    setDragOverTokenId(null);
  }, [socket, combatState.combatants]);

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
      <div className="bg-soft-cream border border-moss-green/20 rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-4 py-3 bg-parchment/40 hover:bg-parchment/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-brand-ink" />
            <span className="font-semibold text-brand-ink text-sm">Initiative Tracker</span>
            {combatState.active && (
              <span className="text-xs font-bold text-warm-amber bg-warm-amber/10 border border-warm-amber/20 rounded px-1.5 py-0.5">
                Round {combatState.round}
              </span>
            )}
            {hasCombatants && !combatState.active && (
              <span className="text-xs text-stone-gray bg-stone-gray/10 rounded px-1.5 py-0.5">
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
                <div className="w-2 h-2 rounded-full bg-warm-amber animate-pulse flex-shrink-0" />
                <span className="text-xs font-semibold text-warm-amber truncate">
                  {currentCombatant.name}'s turn
                </span>
              </div>
            )}

            {/* Combatant list */}
            {hasCombatants ? (
              <div className="space-y-1">
                {combatState.combatants.map((entry) => (
                  <CombatantRow
                    key={entry.tokenId}
                    entry={entry}
                    isActive={combatState.active && entry.tokenId === combatState.currentTokenId}
                    isDM={isDM}
                    mapId={mapId}
                    isDragOver={isDM && dragOverTokenId === entry.tokenId}
                    onSetInitiative={handleSetInitiative}
                    onRoll={handleRollForToken}
                    onRemove={handleRemove}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
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
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-moss-green text-white rounded-lg hover:bg-moss-green/90 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Combat
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleNext}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-semibold bg-warm-amber text-white rounded-lg hover:bg-warm-amber/90 transition-colors"
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
          </div>
        )}
      </div>

      {/* Add combatant modal */}
      {showAddModal && mapId && (
        <AddCombatantModal
          tokens={tokens}
          combatantIds={combatantIds}
          mapId={mapId}
          onAdd={handleAddToken}
          onClose={() => setShowAddModal(false)}
        />
      )}

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
