// ============================================
// TokenRoster
// DM-only compact list of tokens on the current map
// Grouped by type (Player / NPC / Object)
// Actions: Edit (NPC/Object), Duplicate, Remove
// ============================================

import { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { useGameStore, useTokenListIgnoringMovement } from '@/stores/gameStore';
import api from '@/services/api';
import { setTokenFlag } from '@/utils/tokenFlags';
import type { Token } from '@/types';
import { TokenType } from '@/types';
import { tokenCopyRequest, clampTokenPosition, copyController } from '@/utils/tokenCopy';
import { apiErrorMessage } from '@/utils/errors';
import RemoveTokenDialog from './RemoveTokenDialog';

// ============================================
// Props
// ============================================

interface TokenRosterProps {
  onEditToken?: (token: Token) => void;
}

// ============================================
// Helpers
// ============================================

function getEffectiveType(token: Token): TokenType {
  if (token.type) return token.type;
  return token.characterId ? TokenType.PLAYER : TokenType.NPC;
}

function hpLabel(token: Token): string {
  if (!token.hp || token.hp.max === 0) return '';
  const pct = token.hp.current / token.hp.max;
  const color = pct >= 0.75 ? '🟢' : pct >= 0.50 ? '🟡' : pct >= 0.25 ? '🟠' : '🔴';
  return `${color} ${token.hp.current}/${token.hp.max}`;
}

// ============================================
// Sub-component: Token Row
// ============================================

interface TokenRowProps {
  token: Token;
  campaignId: string;
  mapId: string;
  onEditToken?: (token: Token) => void;
}

function TokenRow({ token, campaignId, mapId, onEditToken }: TokenRowProps) {
  const { campaign, currentMap } = useCampaign();
  const { socket } = useWebSocket();
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  // Set while the Remove confirmation is open.
  const [confirmingRemove, setConfirmingRemove] = useState(false);


  const handleDuplicate = useCallback(async () => {
    if (!currentMap) return;
    setIsDuplicating(true);
    try {
      // The roster subscribes ignoring movement, so this row's `token` prop
      // can hold a stale position — read the live one at action time.
      const livePosition = useGameStore.getState().tokens[token.id]?.position ?? token.position;
      const position = clampTokenPosition(
        { x: livePosition.x + 1, y: livePosition.y + 1 },
        token.size,
        currentMap
      );
      const result = await api.addToken(campaignId, mapId, {
        ...tokenCopyRequest(token, position),
        // A copy starts fresh and belongs to nobody's character; see MapCanvas.
        characterId: null,
        controlledBy: copyController(token.controlledBy, campaign?.memberships),
        hp: token.hp ? { current: token.hp.max, max: token.hp.max, temp: 0 } : null,
        conditions: [],
      });
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(mapId);
    } catch (err) {
      // A copy is a new token, so an older one whose fields predate validation
      // is refused: say which, so the DM can fix it in Edit Token.
      showToast(apiErrorMessage(err) || 'Failed to duplicate the token', 'error');
    } finally {
      setIsDuplicating(false);
    }
  }, [token, campaignId, mapId, currentMap, socket, showToast]);

  const handleToggleVisible = useCallback(async () => {
    try {
      await setTokenFlag(campaignId, mapId, token, 'visible', !token.visible, socket);
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Failed to change whether players can see the token', 'error');
    }
  }, [token, campaignId, mapId, socket, showToast]);

  const handleToggleObscured = useCallback(async () => {
    try {
      await setTokenFlag(campaignId, mapId, token, 'obscured', !token.obscured, socket);
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Failed to change whether the token\'s identity is hidden', 'error');
    }
  }, [token, campaignId, mapId, socket, showToast]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    setConfirmingRemove(false);
    setIsDeleting(true);
    try {
      await api.deleteToken(campaignId, mapId, token.id);
      useGameStore.getState().removeToken(token.id);
      socket?.emitMapChange(mapId);
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Failed to remove the token', 'error');
      setIsDeleting(false);
    }
  }, [token, campaignId, mapId, socket, isDeleting, showToast]);

  const hp = hpLabel(token);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-cozy hover:bg-moss-green/5 group">
      {/* Token image */}
      {token.imageUrl ? (
        <img
          src={token.imageUrl}
          alt={token.name}
          className={`w-7 h-7 rounded-full object-cover border border-moss-green/20 flex-shrink-0 ${
            !token.visible ? 'opacity-40' : ''
          }`}
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-moss-green/10 flex-shrink-0" />
      )}

      {/* Name + HP */}
      <div className="flex-1 min-w-0">
        <p title={token.name} className={`text-xs font-medium truncate ${!token.visible ? 'text-stone-gray/50' : 'text-charcoal'}`}>
          {token.name}
          {!token.visible && <span className="ml-1 text-[10px] text-stone-gray/40">(hidden)</span>}
          {token.obscured && <span className="ml-1 text-[10px] text-stone-gray/40">(obscured)</span>}
        </p>
        {hp && (
          <p className="text-[10px] text-stone-gray/60">{hp}</p>
        )}
      </div>

      {/* Actions — shown on hover, while one has keyboard focus, and always on a
          screen with no hover (touch), where they would otherwise be tappable
          before they could be seen. */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity flex-shrink-0">
        {/* Edit — every token type */}
        {onEditToken && (
          <button
            onClick={() => onEditToken(token)}
            title="Edit token"
            aria-label={`Edit ${token.name}`}
            className="p-1.5 rounded hover:bg-moss-green/10 text-brand-ink transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Toggle visibility */}
        <button
          onClick={handleToggleVisible}
          title={token.visible ? 'Hide from players' : 'Show to players'}
          aria-label={token.visible ? `Hide ${token.name} from players` : `Show ${token.name} to players`}
          className="p-1.5 rounded hover:bg-moss-green/10 text-stone-gray transition-colors"
        >
          {token.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>

        {/* Obscure / reveal identity */}
        <button
          onClick={handleToggleObscured}
          title={token.obscured ? 'Reveal identity' : 'Obscure identity'}
          aria-label={token.obscured ? `Reveal identity of ${token.name}` : `Obscure identity of ${token.name}`}
          className={`p-1.5 rounded hover:bg-moss-green/10 transition-colors ${token.obscured ? 'text-brand-ink' : 'text-stone-gray'}`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>

        {/* Duplicate */}
        <button
          onClick={handleDuplicate}
          disabled={isDuplicating}
          title="Duplicate token"
          aria-label={`Duplicate ${token.name}`}
          className="p-1.5 rounded hover:bg-moss-green/10 text-stone-gray transition-colors disabled:opacity-40"
        >
          {isDuplicating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Remove */}
        <button
          onClick={() => setConfirmingRemove(true)}
          disabled={isDeleting}
          title="Remove from map"
          aria-label={`Remove ${token.name} from map`}
          className="p-1.5 rounded hover:bg-danger/10 text-danger-ink/60 hover:text-danger-ink transition-colors disabled:opacity-40"
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <RemoveTokenDialog
        token={confirmingRemove ? token : null}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingRemove(false)}
      />
    </div>
  );
}

// ============================================
// Sub-component: Type Group
// ============================================

interface TokenGroupProps {
  label: string;
  tokens: Token[];
  campaignId: string;
  mapId: string;
  onEditToken?: (token: Token) => void;
  defaultOpen?: boolean;
}

function TokenGroup({ label, tokens, campaignId, mapId, onEditToken, defaultOpen = true }: TokenGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  if (tokens.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-stone-gray/70 uppercase tracking-wider hover:text-stone-gray transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {label} ({tokens.length})
      </button>
      {isOpen && (
        <div>
          {tokens.map((t) => (
            <TokenRow
              key={t.id}
              token={t}
              campaignId={campaignId}
              mapId={mapId}
              onEditToken={onEditToken}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function TokenRoster({ onEditToken }: TokenRosterProps) {
  const { campaign, currentMap } = useCampaign();
  // Movement-ignoring subscription: the roster renders names/flags/HP, not
  // coordinates, so it stays static while tokens are dragged around the map.
  const tokens = useTokenListIgnoringMovement();
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!currentMap || !campaign) return null;

  const players  = tokens.filter((t) => getEffectiveType(t) === TokenType.PLAYER);
  const npcs     = tokens.filter((t) => getEffectiveType(t) === TokenType.NPC);
  const objects  = tokens.filter((t) => getEffectiveType(t) === TokenType.OBJECT);

  if (tokens.length === 0) return null;

  return (
    <div className="glass-panel overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-moss-green/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-brand-ink">Token Roster</span>
          <span className="text-xs text-stone-gray/60">({tokens.length})</span>
        </div>
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4 text-stone-gray/60" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone-gray/60" />
        )}
      </button>

      {/* Token list */}
      {!isCollapsed && (
        <div className="border-t border-moss-green/10 py-1 space-y-0.5">
          <TokenGroup
            label="Players"
            tokens={players}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={true}
          />
          <TokenGroup
            label="NPCs"
            tokens={npcs}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={true}
          />
          <TokenGroup
            label="Objects"
            tokens={objects}
            campaignId={campaign.id}
            mapId={currentMap.id}
            onEditToken={onEditToken}
            defaultOpen={false}
          />
        </div>
      )}
    </div>
  );
}
