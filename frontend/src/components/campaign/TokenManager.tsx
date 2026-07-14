// ============================================
// TokenManager
// DM slide-over panel for adding and managing tokens on the current map
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Swords,
  X,
  Loader2,
  Eye,
  EyeOff,
  Ghost,
  Map as MapIcon,
  Trash2,
  ChevronRight,
  Plus,
  Check,
  Upload,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useGameStore, useTokenListIgnoringMovement } from '@/stores/gameStore';
import api from '@/services/api';
import type { Asset, Token, TokenDisplayMode } from '@/types';
import { AssetType, AssetScope, TokenLayer, TokenType, TokenDisposition } from '@/types';
import Button from '@/components/ui/Button';

// ============================================
// Constants
// ============================================

const SIZE_OPTIONS = [
  { label: 'Small/Med', sublabel: '1×1', value: { width: 1, height: 1 } },
  { label: 'Large',     sublabel: '2×2', value: { width: 2, height: 2 } },
  { label: 'Huge',      sublabel: '3×3', value: { width: 3, height: 3 } },
];

// ============================================
// Props
// ============================================

interface TokenManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Component
// ============================================

export default function TokenManager({ isOpen, onClose }: TokenManagerProps) {
  const { campaign, currentMap } = useCampaign();
  // Manager lists tokens by name/flags — no need to re-render on moves.
  const tokens = useTokenListIgnoringMovement();
  const { socket } = useWebSocket();

  // ── Asset picker state ──
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Add-token form state ──
  const [tokenName, setTokenName] = useState('');
  const [tokenSize, setTokenSize] = useState({ width: 1, height: 1 });
  const [tokenLayer, setTokenLayer] = useState<TokenLayer>(TokenLayer.TOKEN);
  const [assignTo, setAssignTo] = useState<string>('none');
  const [isAdding, setIsAdding] = useState(false);

  // ── Token type fields ──
  const [tokenType, setTokenType] = useState<TokenType>(TokenType.NPC);
  const [displayMode, setDisplayMode] = useState<TokenDisplayMode>('pog');
  const [disposition, setDisposition] = useState<TokenDisposition>(TokenDisposition.HOSTILE);
  const [hpMax, setHpMax] = useState<number>(0);
  const [tokenNotes, setTokenNotes] = useState('');
  const [showHpBar, setShowHpBar] = useState(true);
  const [initiative, setInitiative] = useState<string>('');
  const [objectHidden, setObjectHidden] = useState(true);

  // ── Token list action state ──
  const [movingTokenId, setMovingTokenId] = useState<string | null>(null);
  const [isMovingTokenMap, setIsMovingTokenMap] = useState(false);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);
  const [togglingLayerId, setTogglingLayerId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  // ── Load TOKEN assets for this campaign on open ──
  useEffect(() => {
    if (!isOpen || !campaign) return;
    setIsLoadingAssets(true);
    setError(null);

    api
      .listAssets({
        type: AssetType.TOKEN,
        limit: 100,
      })
      .then((res) => setAssets(res.assets))
      .catch(() => setError('Failed to load token assets'))
      .finally(() => setIsLoadingAssets(false));
  }, [isOpen, campaign?.id]);

  // ── Derived values ──
  const players = campaign?.memberships?.filter((m) => m.role !== 'DM') ?? [];
  const otherMaps = (campaign?.maps ?? []).filter((m) => m.id !== currentMap?.id);
  const canAdd = !!tokenName.trim() && !!currentMap;

  // ============================================
  // Add Token
  // ============================================

  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    // Pre-fill name from asset name only if the field is still empty
    if (!tokenName) setTokenName(asset.name || asset.originalName || '');
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !campaign) return;
    // Reset file input so the same file can be re-uploaded if needed
    e.target.value = '';

    setIsUploading(true);
    setUploadError(null);

    const baseName = file.name.replace(/\.[^.]+$/, '');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', AssetType.TOKEN);
    formData.append('scope', AssetScope.CAMPAIGN);
    formData.append('campaignId', campaign.id);
    formData.append('name', baseName);

    try {
      const { asset } = await api.uploadAsset(formData);
      setAssets((prev) => [asset, ...prev]);
      setSelectedAsset(asset);
      setTokenName((prev) => prev || asset.name || baseName);
    } catch {
      setUploadError('Upload failed — check file type and size');
    } finally {
      setIsUploading(false);
    }
  }, [campaign]);

  const handleAddToken = useCallback(async () => {
    if (!campaign || !currentMap || !tokenName.trim()) return;
    setIsAdding(true);
    setError(null);

    // Place at the center of the current map
    const position = {
      x: Math.floor(currentMap.width / 2),
      y: Math.floor(currentMap.height / 2),
    };

    try {
      // Build type-specific payload
      const basePayload = {
        name: tokenName.trim(),
        imageUrl: selectedAsset?.id || '',
        position,
        size: tokenSize,
        type: tokenType,
        displayMode,
        conditions: [] as string[],
      };

      let tokenPayload: typeof basePayload & Record<string, unknown>;
      if (tokenType === TokenType.PLAYER) {
        tokenPayload = {
          ...basePayload,
          layer: tokenLayer,
          visible: true,
          controlledBy: assignTo !== 'none' ? assignTo : null,
          disposition: null,
          hp: null,
          showHpBar: false,
          notes: '',
          initiative: null,
        };
      } else if (tokenType === TokenType.NPC) {
        const hpValue = hpMax > 0 ? { current: hpMax, max: hpMax, temp: 0 } : null;
        tokenPayload = {
          ...basePayload,
          layer: tokenLayer,
          visible: true,
          controlledBy: assignTo !== 'none' ? assignTo : null,
          disposition,
          hp: hpValue,
          showHpBar: hpMax > 0 ? showHpBar : false,
          notes: tokenNotes.trim(),
          initiative: initiative !== '' ? parseInt(initiative, 10) : null,
        };
      } else {
        // Object
        tokenPayload = {
          ...basePayload,
          layer: TokenLayer.TOKEN,
          visible: !objectHidden,
          controlledBy: null,
          disposition: null,
          hp: null,
          showHpBar: false,
          notes: tokenNotes.trim(),
          initiative: null,
        };
      }

      const result = await api.addToken(campaign.id, currentMap.id, tokenPayload as Parameters<typeof api.addToken>[2]);

      // Optimistic local update then broadcast so other clients get the new token
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);

      // Reset form (keep asset selected in case DM wants to place another)
      setTokenName('');
      setTokenSize({ width: 1, height: 1 });
      setTokenLayer(TokenLayer.TOKEN);
      setAssignTo('none');
      setDisplayMode('pog');
      setHpMax(0);
      setTokenNotes('');
      setShowHpBar(true);
      setInitiative('');
      setObjectHidden(true);
    } catch {
      setError('Failed to add token to map');
    } finally {
      setIsAdding(false);
    }
  }, [campaign, currentMap, selectedAsset, tokenName, tokenSize, tokenLayer, assignTo, tokenType, displayMode, disposition, hpMax, tokenNotes, showHpBar, initiative, objectHidden, socket]);

  // ============================================
  // Token List Actions
  // ============================================

  const handleToggleVisibility = async (token: Token) => {
    if (!campaign || !currentMap) return;
    setTogglingVisibilityId(token.id);
    try {
      await api.updateToken(campaign.id, currentMap.id, token.id, { visible: !token.visible });
      useGameStore.getState().patchToken(token.id, { visible: !token.visible });
      socket?.emitMapChange(currentMap.id);
    } catch {
      setError('Failed to toggle token visibility');
    } finally {
      setTogglingVisibilityId(null);
    }
  };

  const handleToggleLayer = async (token: Token) => {
    if (!campaign || !currentMap) return;
    setTogglingLayerId(token.id);
    const newLayer = token.layer === TokenLayer.TOKEN ? TokenLayer.SPIRIT : TokenLayer.TOKEN;
    try {
      await api.updateToken(campaign.id, currentMap.id, token.id, { layer: newLayer });
      useGameStore.getState().patchToken(token.id, { layer: newLayer });
      socket?.emitMapChange(currentMap.id);
    } catch {
      setError('Failed to move token between layers');
    } finally {
      setTogglingLayerId(null);
    }
  };

  const handleMoveToMap = async (token: Token, targetMapId: string) => {
    if (!campaign || !currentMap) return;
    setIsMovingTokenMap(true);
    setError(null);

    const targetMap = campaign.maps?.find((m) => m.id === targetMapId);
    if (!targetMap) return;

    // Read the live position (this list ignores movement, so the row's
    // token prop can be stale), clamped to fit the target map grid.
    const livePosition = useGameStore.getState().tokens[token.id]?.position ?? token.position;
    const position = {
      x: Math.min(livePosition.x, targetMap.width - token.size.width),
      y: Math.min(livePosition.y, targetMap.height - token.size.height),
    };

    try {
      await api.addToken(campaign.id, targetMapId, {
        name: token.name,
        imageUrl: token.imageUrl,
        position,
        size: token.size,
        layer: token.layer,
        visible: token.visible,
        controlledBy: token.controlledBy,
      });
      await api.deleteToken(campaign.id, currentMap.id, token.id);

      useGameStore.getState().removeToken(token.id);
      setMovingTokenId(null);

      // Broadcast to both maps
      socket?.emitMapChange(currentMap.id);
      socket?.emitMapChange(targetMapId);
    } catch {
      setError('Failed to move token to map');
    } finally {
      setIsMovingTokenMap(false);
    }
  };

  const handleDelete = async (token: Token) => {
    if (!campaign || !currentMap) return;
    setDeletingId(token.id);
    try {
      await api.deleteToken(campaign.id, currentMap.id, token.id);
      useGameStore.getState().removeToken(token.id);
      socket?.emitMapChange(currentMap.id);
    } catch {
      setError('Failed to remove token from map');
    } finally {
      setDeletingId(null);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="token-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="token-panel"
            className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-paper-white shadow-2xl overflow-y-auto flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-moss-green" />
                <h2 className="text-lg font-bold text-moss-green">Token Manager</h2>
              </div>
              <Button onClick={onClose} variant="secondary" className="p-1.5" title="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Error */}
              {error && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-700 text-sm rounded-cozy">
                  {error}
                </div>
              )}

              {/* ── Section 1: Add Token ── */}
              <section>
                <h3 className="text-sm font-semibold text-stone-gray uppercase tracking-wide mb-3">
                  Add Token
                </h3>

                {/* Token Type Selector */}
                <div className="mb-3">
                  <label className="text-xs text-stone-gray font-medium block mb-1">
                    Token Type
                  </label>
                  <div className="flex gap-2">
                    {([
                      { type: TokenType.PLAYER, label: 'Player' },
                      { type: TokenType.NPC,    label: 'NPC / Creature' },
                      { type: TokenType.OBJECT, label: 'Object' },
                    ] as const).map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => setTokenType(type)}
                        className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                          tokenType === type
                            ? 'border-moss-green bg-moss-green/10 text-moss-green font-semibold'
                            : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {tokenType === TokenType.PLAYER && (
                    <p className="text-[10px] text-stone-gray/60 mt-1">
                      Player tokens link to a character sheet. For summoned creatures, use NPC type and assign a player as controller.
                    </p>
                  )}
                </div>

                {/* Asset picker grid */}
                <div className="mb-3">
                  {/* Hidden file input for inline upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-stone-gray">Token image <span className="opacity-50">(optional — uses placeholder if empty)</span>:</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      title="Upload a new token image"
                      className="flex items-center gap-1 text-xs text-moss-green hover:text-moss-green/80 disabled:opacity-40 transition-colors"
                    >
                      {isUploading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      {isUploading ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                  {uploadError && (
                    <p className="text-[11px] text-red-600 mb-1.5">{uploadError}</p>
                  )}
                  {isLoadingAssets ? (
                    <div className="flex items-center gap-2 text-stone-gray text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading assets…
                    </div>
                  ) : assets.length === 0 ? (
                    <div className="glass-panel p-3">
                      <p className="text-sm text-stone-gray/70 italic">
                        No TOKEN assets found.
                      </p>
                      <p className="text-xs text-stone-gray/50 mt-1">
                        Click <strong>Upload</strong> above to add an image, or use the Asset Library.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-0.5">
                      {/* No-image placeholder option */}
                      <button
                        onClick={() => setSelectedAsset(null)}
                        title="Use colored-letter placeholder"
                        className={`relative rounded-cozy overflow-hidden border-2 aspect-square transition-all flex items-center justify-center ${
                          !selectedAsset
                            ? 'border-moss-green ring-2 ring-moss-green/30 bg-stone-700/60'
                            : 'border-transparent hover:border-moss-green/40 bg-stone-700/40'
                        }`}
                      >
                        <span className="text-lg font-bold text-stone-400">?</span>
                        <span className="absolute bottom-0.5 text-[8px] text-stone-500">None</span>
                      </button>
                      {assets.map((asset) => {
                        const isSelected = selectedAsset?.id === asset.id;
                        return (
                          <button
                            key={asset.id}
                            onClick={() => handleSelectAsset(asset)}
                            title={asset.name || asset.originalName}
                            className={`relative rounded-cozy overflow-hidden border-2 aspect-square transition-all ${
                              isSelected
                                ? 'border-moss-green ring-2 ring-moss-green/30'
                                : 'border-transparent hover:border-moss-green/40'
                            }`}
                          >
                            <img
                              src={api.getAssetUrl(asset.id, 'tokens')}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute inset-0 bg-moss-green/25 flex items-center justify-center">
                                <Check className="w-4 h-4 text-moss-green drop-shadow" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Token Name */}
                <div className="mb-3">
                  <label className="text-xs text-stone-gray font-medium block mb-1">
                    Token Name
                  </label>
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="e.g. Goblin Scout, Party Wizard…"
                    className="input-cozy w-full text-sm"
                  />
                </div>

                {/* Display Mode Selector — all token types */}
                <div className="mb-3">
                  <label className="text-xs text-stone-gray font-medium block mb-1">
                    Display Mode
                  </label>
                  <div className="flex gap-2">
                    {([
                      { mode: 'pog' as TokenDisplayMode,      label: 'Pog',      desc: 'Circular with border' },
                      { mode: 'top-down' as TokenDisplayMode,  label: 'Top-Down', desc: 'Circular, no border' },
                      { mode: 'full-art' as TokenDisplayMode,  label: 'Full Art', desc: 'Rectangular with alpha' },
                    ] as const).map(({ mode, label, desc }) => (
                      <button
                        key={mode}
                        onClick={() => setDisplayMode(mode)}
                        title={desc}
                        className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                          displayMode === mode
                            ? 'border-moss-green bg-moss-green/10 text-moss-green font-semibold'
                            : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-gray/50 mt-1">
                    {displayMode === 'pog' && 'Classic round token with a colored disposition ring.'}
                    {displayMode === 'top-down' && 'Circular crop, ideal for overhead/bird\u2019s-eye art.'}
                    {displayMode === 'full-art' && 'Shows full image including transparency — great for standees and monsters.'}
                  </p>
                </div>

                {/* NPC-specific fields */}
                {tokenType === TokenType.NPC && (
                  <>
                    {/* Disposition */}
                    <div className="mb-3">
                      <label className="text-xs text-stone-gray font-medium block mb-1">
                        Disposition
                      </label>
                      <div className="flex gap-2">
                        {([
                          { d: TokenDisposition.FRIENDLY, label: 'Friendly', color: 'teal' },
                          { d: TokenDisposition.NEUTRAL,  label: 'Neutral',  color: 'amber' },
                          { d: TokenDisposition.HOSTILE,  label: 'Hostile',  color: 'red' },
                        ] as const).map(({ d, label, color }) => (
                          <button
                            key={d}
                            onClick={() => setDisposition(d)}
                            className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                              disposition === d
                                ? color === 'teal'  ? 'border-teal-500 bg-teal-500/10 text-teal-700 font-semibold'
                                : color === 'amber' ? 'border-amber-500 bg-amber-500/10 text-amber-700 font-semibold'
                                :                    'border-red-500 bg-red-500/10 text-red-700 font-semibold'
                                : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* HP Max */}
                    <div className="mb-3">
                      <label className="text-xs text-stone-gray font-medium block mb-1">
                        HP Max <span className="font-normal opacity-60">(0 = no HP bar)</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={hpMax}
                        onChange={(e) => setHpMax(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="input-cozy w-full text-sm"
                      />
                      {hpMax > 0 && (
                        <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showHpBar}
                            onChange={(e) => setShowHpBar(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs text-stone-gray">Show HP bar to players</span>
                        </label>
                      )}
                    </div>

                    {/* Initiative */}
                    <div className="mb-3">
                      <label className="text-xs text-stone-gray font-medium block mb-1">
                        Initiative <span className="font-normal opacity-60">(optional)</span>
                      </label>
                      <input
                        type="number"
                        value={initiative}
                        onChange={(e) => setInitiative(e.target.value)}
                        placeholder="e.g. 14"
                        className="input-cozy w-full text-sm"
                      />
                    </div>

                    {/* DM Notes */}
                    <div className="mb-3">
                      <label className="text-xs text-stone-gray font-medium block mb-1">
                        DM Notes <span className="font-normal opacity-60">(not shown to players)</span>
                      </label>
                      <textarea
                        value={tokenNotes}
                        onChange={(e) => setTokenNotes(e.target.value)}
                        placeholder="Guard post, key holder…"
                        rows={2}
                        className="input-cozy w-full text-sm resize-none"
                      />
                    </div>
                  </>
                )}

                {/* Object-specific fields */}
                {tokenType === TokenType.OBJECT && (
                  <>
                    {/* Hidden toggle */}
                    <div className="mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={objectHidden}
                          onChange={(e) => setObjectHidden(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-xs text-stone-gray">Hidden from players on placement</span>
                      </label>
                      <p className="text-[10px] text-stone-gray/50 mt-0.5">
                        Reveal later via the context menu — useful for secret doors, hidden chests.
                      </p>
                    </div>

                    {/* DM Notes */}
                    <div className="mb-3">
                      <label className="text-xs text-stone-gray font-medium block mb-1">
                        DM Notes <span className="font-normal opacity-60">(not shown to players)</span>
                      </label>
                      <textarea
                        value={tokenNotes}
                        onChange={(e) => setTokenNotes(e.target.value)}
                        placeholder="Locked with iron key…"
                        rows={2}
                        className="input-cozy w-full text-sm resize-none"
                      />
                    </div>
                  </>
                )}

                {/* Size */}
                <div className="mb-3">
                  <label className="text-xs text-stone-gray font-medium block mb-1">
                    Size (grid cells)
                  </label>
                  <div className="flex gap-2">
                    {SIZE_OPTIONS.map((opt) => {
                      const isSelected = tokenSize.width === opt.value.width;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => setTokenSize(opt.value)}
                          className={`flex-1 py-1.5 text-center text-xs rounded-cozy border transition-all ${
                            isSelected
                              ? 'border-moss-green bg-moss-green/10 text-moss-green font-semibold'
                              : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                          }`}
                        >
                          <span className="block">{opt.label}</span>
                          <span className="block text-[10px] opacity-60">{opt.sublabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Layer (not shown for Object — always placed on material plane) */}
                {tokenType !== TokenType.OBJECT && (
                  <div className="mb-3">
                    <label className="text-xs text-stone-gray font-medium block mb-1">
                      Place on Layer
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTokenLayer(TokenLayer.TOKEN)}
                        className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                          tokenLayer === TokenLayer.TOKEN
                            ? 'border-moss-green bg-moss-green/10 text-moss-green font-semibold'
                            : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                        }`}
                      >
                        Material Plane
                      </button>
                      <button
                        onClick={() => setTokenLayer(TokenLayer.SPIRIT)}
                        className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                          tokenLayer === TokenLayer.SPIRIT
                            ? 'border-spirit-purple bg-spirit-purple/10 text-spirit-purple font-semibold'
                            : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                        }`}
                      >
                        Spirit Realm
                      </button>
                    </div>
                  </div>
                )}

                {/* Assign to player (NPC and Player only) */}
                {tokenType !== TokenType.OBJECT && players.length > 0 && (
                  <div className="mb-3">
                    <label className="text-xs text-stone-gray font-medium block mb-1">
                      Controlled by
                    </label>
                    <select
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      className="input-cozy w-full text-sm"
                    >
                      <option value="none">Nobody (DM controls)</option>
                      {players.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user?.displayName ?? m.userId}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {!currentMap && (
                  <p className="text-xs text-amber-700 mb-2">
                    No map is currently loaded — load a map first.
                  </p>
                )}

                <Button
                  onClick={handleAddToken}
                  disabled={!canAdd || isAdding}
                  className="w-full flex items-center justify-center gap-2"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {isAdding ? 'Placing…' : 'Place on Map'}
                </Button>
                <p className="text-[10px] text-stone-gray/50 mt-1.5 text-center">
                  Token is placed at the map center — drag it into position afterwards.
                </p>
              </section>

              {/* ── Section 2: Tokens on This Map ── */}
              <section>
                <h3 className="text-sm font-semibold text-stone-gray uppercase tracking-wide mb-1">
                  Tokens on Map
                  {tokens.length > 0 && (
                    <span className="ml-2 text-xs font-normal normal-case text-stone-gray/60">
                      ({tokens.length})
                    </span>
                  )}
                </h3>

                {!currentMap ? (
                  <p className="text-sm text-stone-gray/70 italic">No map loaded.</p>
                ) : tokens.length === 0 ? (
                  <p className="text-sm text-stone-gray/70 italic">
                    No tokens on this map yet. Add one above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tokens.map((token) => {
                      const isSpirit = token.layer === TokenLayer.SPIRIT;
                      const isTogglingVis = togglingVisibilityId === token.id;
                      const isTogglingLyr = togglingLayerId === token.id;
                      const isDeleting = deletingId === token.id;
                      const isShowingMapPicker = movingTokenId === token.id;

                      return (
                        <div key={token.id} className="glass-panel p-3">
                          <div className="flex items-center gap-2">
                            {/* Token avatar */}
                            {token.imageUrl ? (
                              <img
                                src={token.imageUrl}
                                alt={token.name}
                                className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-moss-green/20"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-stone-gray/10 flex items-center justify-center flex-shrink-0">
                                <Swords className="w-4 h-4 text-stone-gray/30" />
                              </div>
                            )}

                            {/* Name + badges */}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-charcoal truncate">
                                {token.name}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    isSpirit
                                      ? 'bg-spirit-purple/15 text-spirit-purple'
                                      : 'bg-moss-green/10 text-moss-green'
                                  }`}
                                >
                                  {isSpirit ? 'Spirit' : 'Material'}
                                </span>
                                {!token.visible && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-stone-gray/10 text-stone-gray">
                                    Hidden
                                  </span>
                                )}
                                {token.controlledBy && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-warm-amber/10 text-warm-amber">
                                    {players.find((p) => p.userId === token.controlledBy)?.user?.displayName ?? 'Player'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              {/* Visibility toggle */}
                              <button
                                onClick={() => handleToggleVisibility(token)}
                                disabled={isTogglingVis}
                                className="p-1.5 rounded hover:bg-moss-green/10 transition-colors"
                                title={token.visible ? 'Hide from players' : 'Show to players'}
                              >
                                {isTogglingVis ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-gray" />
                                ) : token.visible ? (
                                  <Eye className="w-3.5 h-3.5 text-moss-green" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5 text-stone-gray/40" />
                                )}
                              </button>

                              {/* Spirit layer toggle */}
                              <button
                                onClick={() => handleToggleLayer(token)}
                                disabled={isTogglingLyr}
                                className="p-1.5 rounded hover:bg-spirit-purple/10 transition-colors"
                                title={isSpirit ? 'Return to Material Plane' : 'Send to Spirit Realm'}
                              >
                                {isTogglingLyr ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-gray" />
                                ) : (
                                  <Ghost
                                    className={`w-3.5 h-3.5 ${
                                      isSpirit ? 'text-spirit-purple' : 'text-stone-gray/30'
                                    }`}
                                  />
                                )}
                              </button>

                              {/* Move to another map */}
                              {otherMaps.length > 0 && (
                                <button
                                  onClick={() =>
                                    setMovingTokenId(isShowingMapPicker ? null : token.id)
                                  }
                                  className={`p-1.5 rounded transition-colors ${
                                    isShowingMapPicker
                                      ? 'bg-warm-amber/20 text-warm-amber'
                                      : 'hover:bg-warm-amber/10 text-stone-gray/30 hover:text-warm-amber'
                                  }`}
                                  title="Move to another map"
                                >
                                  <MapIcon className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(token)}
                                disabled={isDeleting}
                                className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                                title="Remove from map"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-gray" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5 text-red-400/60 hover:text-red-500 transition-colors" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Inline map picker for Move to Map */}
                          {isShowingMapPicker && (
                            <div className="mt-2 pt-2 border-t border-moss-green/10">
                              <p className="text-[11px] text-stone-gray mb-1.5">
                                Move to which map?
                              </p>
                              {isMovingTokenMap ? (
                                <div className="flex items-center gap-2 text-stone-gray text-xs py-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Moving token…
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  {otherMaps.map((m) => (
                                    <button
                                      key={m.id}
                                      onClick={() => handleMoveToMap(token, m.id)}
                                      className="w-full text-left px-2 py-1.5 text-xs text-charcoal hover:bg-moss-green/10 rounded flex items-center gap-1.5 transition-colors"
                                    >
                                      <ChevronRight className="w-3 h-3 text-stone-gray/40" />
                                      {m.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
