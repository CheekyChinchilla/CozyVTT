// ============================================
// NpcQuickEditor
// DM-only slide-over for live NPC/Object token editing
// - HP tracking with ±buttons
// - Disposition selector
// - Conditions management
// - DM notes (never sent to players)
// - Visibility + remove quick actions
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Eye,
  EyeOff,
  Trash2,
  Heart,
  Upload,
  Loader2,
  Check,
  Image as ImageIcon,
  Save,
} from 'lucide-react';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useCampaign } from '@/contexts/CampaignContext';
import api from '@/services/api';
import type { Token, TokenHp, NpcStatBlock, Asset } from '@/types';
import { TokenType, TokenDisposition, AssetType, AssetScope } from '@/types';
import { StatBlockViewer, StatBlockEditor } from './npc-stat-blocks';

// ============================================
// Constants
// ============================================

const COMMON_CONDITIONS = [
  'Blinded',
  'Charmed',
  'Exhausted',
  'Frightened',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
];

// ============================================
// Props
// ============================================

interface NpcQuickEditorProps {
  token: Token;
  campaignId: string;
  mapId: string;
  onClose: () => void;
  onTokenUpdate: (updated: Token) => void;
}

// ============================================
// Helpers
// ============================================

function getHpColor(pct: number): string {
  if (pct >= 0.75) return '#22c55e'; // green
  if (pct >= 0.5)  return '#84cc16'; // lime
  if (pct >= 0.25) return '#f59e0b'; // amber
  return '#ef4444';                   // red
}

function getEffectiveType(token: Token): TokenType {
  if (token.type) return token.type;
  return token.characterId ? TokenType.PLAYER : TokenType.NPC;
}

// ============================================
// Component
// ============================================

export default function NpcQuickEditor({ token, campaignId, mapId, onClose, onTokenUpdate }: NpcQuickEditorProps) {
  const { socket } = useWebSocket();
  const { campaign } = useCampaign();

  // Local editable state (mirrors token, updates on save)
  const [name, setName] = useState(token.name);
  const [hp, setHp] = useState<TokenHp | null>(token.hp ?? null);
  const [showHpBar, setShowHpBar] = useState(token.showHpBar ?? false);
  const [disposition, setDisposition] = useState<TokenDisposition | null>(token.disposition ?? null);
  const [initiative, setInitiative] = useState<string>(token.initiative !== null && token.initiative !== undefined ? String(token.initiative) : '');
  const [conditions, setConditions] = useState<string[]>(token.conditions ?? []);
  const [notes, setNotes] = useState(token.notes ?? '');
  const [visible, setVisible] = useState(token.visible);
  const [controlledBy, setControlledBy] = useState<string | null>(token.controlledBy ?? null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [enableHpPrompt, setEnableHpPrompt] = useState(false);
  const [newHpMax, setNewHpMax] = useState('');
  const [statBlock, setStatBlock] = useState<NpcStatBlock | null>((token.statBlock as NpcStatBlock) ?? null);
  const [editingStatBlock, setEditingStatBlock] = useState(false);
  const [showCreateStatBlock, setShowCreateStatBlock] = useState(false);

  // ── Token image editing state ──
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingToCreature, setIsSavingToCreature] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showDuplicateNamePrompt, setShowDuplicateNamePrompt] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const imageFileRef = useRef<HTMLInputElement>(null);

  const tokenType = getEffectiveType(token);
  const isNpc = tokenType === TokenType.NPC;

  const isSaving = useRef(false);

  // ── Generic update helper ──
  const saveUpdate = useCallback(async (changes: Partial<Token>) => {
    if (isSaving.current) return;
    try {
      const result = await api.updateToken(campaignId, mapId, token.id, changes as Parameters<typeof api.updateToken>[3]);
      onTokenUpdate(result.token);
      socket?.emitMapChange(mapId);
    } catch (err) {
      console.error('NpcQuickEditor: failed to update token', err);
    }
  }, [campaignId, mapId, token.id, onTokenUpdate, socket]);

  // ── HP adjustment ──
  const adjustHp = useCallback(async (delta: number) => {
    if (!hp) return;
    const newCurrent = Math.max(0, Math.min(hp.max, hp.current + delta));
    const newHp = { ...hp, current: newCurrent };
    setHp(newHp);
    await saveUpdate({ hp: newHp });
  }, [hp, saveUpdate]);

  const setTempHp = useCallback(async (val: number) => {
    if (!hp) return;
    const newHp = { ...hp, temp: Math.max(0, val) };
    setHp(newHp);
    await saveUpdate({ hp: newHp });
  }, [hp, saveUpdate]);

  const toggleShowHpBar = useCallback(async () => {
    const next = !showHpBar;
    setShowHpBar(next);
    await saveUpdate({ showHpBar: next });
  }, [showHpBar, saveUpdate]);

  const enableHpTracking = useCallback(async () => {
    const max = parseInt(newHpMax, 10);
    if (!max || max <= 0) return;
    const newHp: TokenHp = { current: max, max, temp: 0 };
    setHp(newHp);
    setShowHpBar(true);
    setEnableHpPrompt(false);
    setNewHpMax('');
    await saveUpdate({ hp: newHp, showHpBar: true });
  }, [newHpMax, saveUpdate]);

  // ── Stat block ──
  const handleStatBlockChange = useCallback(async (updated: NpcStatBlock) => {
    setStatBlock(updated);
    await saveUpdate({ statBlock: updated } as Partial<Token>);
  }, [saveUpdate]);

  const handleCreateStatBlock = useCallback(async () => {
    const newBlock: NpcStatBlock = {
      ac: 10,
      speed: '30 ft.',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    };
    setStatBlock(newBlock);
    setEditingStatBlock(true);
    setShowCreateStatBlock(false);
    await saveUpdate({ statBlock: newBlock } as Partial<Token>);
  }, [saveUpdate]);

  const handleRemoveStatBlock = useCallback(async () => {
    setStatBlock(null);
    setEditingStatBlock(false);
    await saveUpdate({ statBlock: null } as Partial<Token>);
  }, [saveUpdate]);

  // ── Token image ──
  const loadAssets = useCallback(async () => {
    if (assets.length > 0) return; // already loaded
    setIsLoadingAssets(true);
    try {
      const res = await api.listAssets({ type: AssetType.TOKEN, limit: 100 });
      setAssets(res.assets);
    } catch {
      console.error('NpcQuickEditor: failed to load token assets');
    } finally {
      setIsLoadingAssets(false);
    }
  }, [assets.length]);

  const handleOpenImagePicker = useCallback(() => {
    setShowImagePicker(true);
    loadAssets();
  }, [loadAssets]);

  const handleSelectImage = useCallback(async (assetId: string) => {
    await saveUpdate({ imageUrl: assetId });
    setShowImagePicker(false);
  }, [saveUpdate]);

  const handleClearImage = useCallback(async () => {
    await saveUpdate({ imageUrl: '' });
    setShowImagePicker(false);
  }, [saveUpdate]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !campaign) return;
    e.target.value = '';

    setIsUploadingImage(true);
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
      await saveUpdate({ imageUrl: asset.id });
      setShowImagePicker(false);
    } catch {
      console.error('NpcQuickEditor: image upload failed');
    } finally {
      setIsUploadingImage(false);
    }
  }, [campaign, saveUpdate]);

  // Step 1: DM clicks save — try direct update, or prompt for name if SRD
  const handleSaveImageToCreature = useCallback(async () => {
    if (!campaign || !token.creatureTemplateId || !token.imageUrl) return;
    setIsSavingToCreature(true);
    setDuplicateWarning(null);

    try {
      // Direct update works for custom creatures
      await api.updateCreature(campaign.id, token.creatureTemplateId, { imageUrl: token.imageUrl });
      setShowImagePicker(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 403) {
        console.error('NpcQuickEditor: failed to save image to creature template');
        setIsSavingToCreature(false);
        return;
      }

      // SRD creature — fetch its name and show the name prompt
      try {
        const original = await api.getCreature(campaign.id, token.creatureTemplateId);
        setDuplicateName(original.name);

        // Check for existing duplicates to warn
        const { creatures } = await api.listCreatures(campaign.id, {
          search: original.name,
          source: 'custom',
          limit: 50,
        });
        const existingDupe = creatures.find(
          (c) => c.name.startsWith(original.name) && c.source === 'custom'
        );
        if (existingDupe) {
          setDuplicateWarning(
            `A custom copy of "${original.name}" already exists in this campaign.`
          );
        }
      } catch {
        setDuplicateName(token.name);
      }
      setShowDuplicateNamePrompt(true);
    } finally {
      setIsSavingToCreature(false);
    }
  }, [campaign, token.creatureTemplateId, token.imageUrl, token.name]);

  // Step 2: DM confirms name — duplicate, rename, set image, relink token
  const handleConfirmDuplicate = useCallback(async () => {
    if (!campaign || !token.creatureTemplateId || !token.imageUrl || !duplicateName.trim()) return;
    setIsSavingToCreature(true);

    try {
      const duplicate = await api.duplicateCreature(campaign.id, token.creatureTemplateId);
      const finalName = duplicateName.trim();
      // Update the duplicate with the chosen name and the image
      await api.updateCreature(campaign.id, duplicate.id, {
        name: finalName,
        imageUrl: token.imageUrl,
      });
      // Relink this token to the new custom creature
      await saveUpdate({ creatureTemplateId: duplicate.id } as Partial<Token>);
      setShowDuplicateNamePrompt(false);
      setDuplicateWarning(null);
      setShowImagePicker(false);
    } catch {
      console.error('NpcQuickEditor: failed to duplicate SRD creature');
    } finally {
      setIsSavingToCreature(false);
    }
  }, [campaign, token.creatureTemplateId, token.imageUrl, duplicateName, saveUpdate]);

  // ── Disposition ──
  const setTokenDisposition = useCallback(async (d: TokenDisposition) => {
    setDisposition(d);
    await saveUpdate({ disposition: d });
  }, [saveUpdate]);

  // ── Conditions ──
  const toggleCondition = useCallback(async (condition: string) => {
    const newConditions = conditions.includes(condition)
      ? conditions.filter((c) => c !== condition)
      : [...conditions, condition];
    setConditions(newConditions);
    await saveUpdate({ conditions: newConditions });
  }, [conditions, saveUpdate]);

  // ── Name save on blur ──
  const handleNameBlur = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== token.name) {
      await saveUpdate({ name: trimmed });
    }
  }, [name, token.name, saveUpdate]);

  // ── Initiative save on blur ──
  const handleInitiativeBlur = useCallback(async () => {
    const parsed = initiative !== '' ? parseInt(initiative, 10) : null;
    const current = token.initiative ?? null;
    if (parsed !== current) {
      await saveUpdate({ initiative: parsed });
    }
  }, [initiative, token.initiative, saveUpdate]);

  // ── Notes save on blur ──
  const handleNotesBlur = useCallback(async () => {
    if (notes !== (token.notes ?? '')) {
      await saveUpdate({ notes });
    }
  }, [notes, token.notes, saveUpdate]);

  // ── Visibility toggle ──
  const toggleVisible = useCallback(async () => {
    const next = !visible;
    setVisible(next);
    await saveUpdate({ visible: next });
  }, [visible, saveUpdate]);

  // ── Controller change ──
  const handleControllerChange = useCallback(async (userId: string | null) => {
    setControlledBy(userId);
    await saveUpdate({ controlledBy: userId });
  }, [saveUpdate]);

  // ── Remove token ──
  const handleRemove = useCallback(async () => {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await api.deleteToken(campaignId, mapId, token.id);
      socket?.emitMapChange(mapId);
      onClose();
    } catch (err) {
      console.error('NpcQuickEditor: failed to remove token', err);
      setIsRemoving(false);
    }
  }, [campaignId, mapId, token.id, socket, onClose, isRemoving]);

  // HP bar rendering values
  const hpPct = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const hpColor = getHpColor(hpPct);

  // Sync token changes from outside (if parent re-opens with different token)
  useEffect(() => {
    setName(token.name);
    setHp(token.hp ?? null);
    setShowHpBar(token.showHpBar ?? false);
    setDisposition(token.disposition ?? null);
    setInitiative(token.initiative !== null && token.initiative !== undefined ? String(token.initiative) : '');
    setConditions(token.conditions ?? []);
    setNotes(token.notes ?? '');
    setVisible(token.visible);
    setControlledBy(token.controlledBy ?? null);
    setStatBlock((token.statBlock as NpcStatBlock) ?? null);
    setEditingStatBlock(false);
    setShowCreateStatBlock(false);
    setShowImagePicker(false);
    setDuplicateWarning(null);
    setShowDuplicateNamePrompt(false);
    setDuplicateName('');
  }, [token.id]);

  return (
    <AnimatePresence>
      <>
        {/* Backdrop */}
        <motion.div
          key="npc-editor-backdrop"
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Panel */}
        <motion.div
          key="npc-editor-panel"
          className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-paper-white shadow-2xl overflow-y-auto flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
            {/* Hidden file input for image upload */}
            <input
              ref={imageFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Token image — clickable to change */}
            <button
              onClick={handleOpenImagePicker}
              className="relative group flex-shrink-0"
              title="Change token image"
            >
              {token.imageUrl ? (
                <img
                  src={token.imageUrl}
                  alt={token.name}
                  className="w-10 h-10 rounded-full object-cover border-2 border-moss-green/30"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-moss-green/10 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-moss-green/40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <ImageIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>

            {/* Editable name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              className="flex-1 text-base font-bold text-moss-green bg-transparent border-b border-transparent hover:border-moss-green/30 focus:border-moss-green focus:outline-none px-0"
            />

            {/* Badge */}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              tokenType === TokenType.OBJECT
                ? 'bg-stone-gray/10 text-stone-gray'
                : 'bg-moss-green/10 text-moss-green'
            }`}>
              {tokenType === TokenType.OBJECT ? 'Object' : 'NPC'}
            </span>

            {/* Close */}
            <button onClick={onClose} className="btn-secondary p-1.5 flex-shrink-0" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* ── Token Image Picker ── */}
            {showImagePicker && (
              <section className="glass-panel p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide">
                    Token Image
                  </h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => imageFileRef.current?.click()}
                      disabled={isUploadingImage}
                      className="flex items-center gap-1 text-[10px] text-moss-green hover:text-moss-green/80 disabled:opacity-40 transition-colors"
                    >
                      {isUploadingImage ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Upload className="w-3 h-3" />
                      )}
                      {isUploadingImage ? 'Uploading...' : 'Upload'}
                    </button>
                    <span className="text-stone-300">·</span>
                    <button
                      onClick={() => setShowImagePicker(false)}
                      className="text-[10px] text-stone-gray hover:text-stone-gray/80 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {isLoadingAssets ? (
                  <div className="flex items-center gap-2 text-stone-gray text-xs py-3">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading assets...
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
                    {/* No-image (placeholder) option */}
                    <button
                      onClick={handleClearImage}
                      title="Use colored-letter placeholder"
                      className={`relative rounded-cozy overflow-hidden border-2 aspect-square transition-all flex items-center justify-center ${
                        !token.imageUrl
                          ? 'border-moss-green ring-1 ring-moss-green/30 bg-stone-700/60'
                          : 'border-transparent hover:border-moss-green/40 bg-stone-700/40'
                      }`}
                    >
                      <span className="text-sm font-bold text-stone-400">?</span>
                      <span className="absolute bottom-0 text-[7px] text-stone-500">None</span>
                    </button>
                    {assets.map((asset) => {
                      const isSelected = token.imageUrl?.includes(asset.id);
                      return (
                        <button
                          key={asset.id}
                          onClick={() => handleSelectImage(asset.id)}
                          title={asset.name || asset.originalName}
                          className={`relative rounded-cozy overflow-hidden border-2 aspect-square transition-all ${
                            isSelected
                              ? 'border-moss-green ring-1 ring-moss-green/30'
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
                              <Check className="w-3 h-3 text-moss-green drop-shadow" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Save to creature template option */}
                {token.creatureTemplateId && token.imageUrl && (
                  <div className="mt-2 space-y-1.5">
                    {showDuplicateNamePrompt ? (
                      <div className="rounded-cozy border border-moss-green/30 bg-parchment/40 p-2.5 space-y-2">
                        <p className="text-[11px] text-stone-gray">
                          This is an SRD creature. A custom copy will be created in your campaign library.
                        </p>
                        {duplicateWarning && (
                          <p className="text-[11px] text-amber-700 bg-amber-500/10 rounded px-2 py-1">
                            {duplicateWarning}
                          </p>
                        )}
                        <div>
                          <label className="text-[10px] text-stone-gray block mb-0.5">
                            Name for the custom creature:
                          </label>
                          <input
                            type="text"
                            value={duplicateName}
                            onChange={(e) => setDuplicateName(e.target.value)}
                            placeholder="e.g. Goblin (Forest Variant)"
                            className="input-cozy w-full text-xs"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleConfirmDuplicate}
                            disabled={isSavingToCreature || !duplicateName.trim()}
                            className="flex-1 py-1.5 text-[10px] rounded-cozy bg-moss-green/10 border border-moss-green/30 hover:bg-moss-green/20 text-moss-green transition-colors font-medium disabled:opacity-40"
                          >
                            {isSavingToCreature ? (
                              <span className="flex items-center justify-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                              </span>
                            ) : (
                              'Create & Save Image'
                            )}
                          </button>
                          <button
                            onClick={() => { setShowDuplicateNamePrompt(false); setDuplicateWarning(null); }}
                            className="px-3 py-1.5 text-[10px] rounded-cozy border border-moss-green/20 hover:bg-moss-green/5 text-stone-gray transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleSaveImageToCreature}
                        disabled={isSavingToCreature}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-cozy border border-moss-green/30 hover:bg-moss-green/10 text-moss-green transition-colors"
                      >
                        {isSavingToCreature ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3" />
                        )}
                        {isSavingToCreature ? 'Saving...' : 'Save image to creature template'}
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── HP Section (NPC only) ── */}
            {isNpc && (
              <section>
                <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                  Hit Points
                </h3>
                {hp && hp.max > 0 ? (
                  <>
                    {/* HP bar */}
                    <div className="mb-2">
                      <div className="relative h-4 bg-ink-black/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{ width: `${hpPct * 100}%`, backgroundColor: hpColor }}
                        />
                        {hp.temp > 0 && (
                          <div
                            className="absolute top-0 right-0 h-full rounded-r-full"
                            style={{
                              width: `${Math.min(1, hp.temp / hp.max) * 100}%`,
                              backgroundColor: 'rgba(147, 197, 253, 0.75)',
                            }}
                          />
                        )}
                      </div>
                      <div className="text-center text-sm font-semibold mt-1" style={{ color: hpColor }}>
                        {hp.current} / {hp.max}
                        {hp.temp > 0 && (
                          <span className="text-blue-400 ml-1 text-xs">+{hp.temp} temp</span>
                        )}
                      </div>
                    </div>

                    {/* HP buttons */}
                    <div className="flex gap-1 mb-2">
                      {([-10, -5, -1] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => adjustHp(d)}
                          className="flex-1 py-1.5 text-xs rounded-cozy border border-red-500/30 hover:bg-red-500/10 text-red-600 transition-colors font-medium"
                        >
                          {d}
                        </button>
                      ))}
                      {([1, 5, 10] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => adjustHp(d)}
                          className="flex-1 py-1.5 text-xs rounded-cozy border border-green-500/30 hover:bg-green-500/10 text-green-600 transition-colors font-medium"
                        >
                          +{d}
                        </button>
                      ))}
                    </div>

                    {/* Temp HP */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-stone-gray w-16 flex-shrink-0">Temp HP:</span>
                      <input
                        type="number"
                        min={0}
                        value={hp.temp}
                        onChange={(e) => setTempHp(parseInt(e.target.value, 10) || 0)}
                        className="input-cozy input-cozy-number w-20 text-sm text-center"
                      />
                    </div>

                    {/* Show HP to players toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showHpBar}
                        onChange={toggleShowHpBar}
                        className="rounded"
                      />
                      <span className="text-xs text-stone-gray">Show HP bar to players</span>
                    </label>
                  </>
                ) : (
                  <div className="glass-panel p-3">
                    <p className="text-sm text-stone-gray/70 italic mb-2">No HP tracking</p>
                    {enableHpPrompt ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          min={1}
                          value={newHpMax}
                          onChange={(e) => setNewHpMax(e.target.value)}
                          placeholder="Max HP"
                          className="input-cozy input-cozy-number text-sm w-24"
                        />
                        <button
                          onClick={enableHpTracking}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          Enable
                        </button>
                        <button
                          onClick={() => { setEnableHpPrompt(false); setNewHpMax(''); }}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEnableHpPrompt(true)}
                        className="btn-secondary text-xs"
                      >
                        Enable HP tracking
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── Stat Block (NPC only) ── */}
            {isNpc && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide">
                    Stat Block
                  </h3>
                  {statBlock && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingStatBlock(!editingStatBlock)}
                        className="text-[10px] text-moss-green hover:text-moss-green/80 transition-colors"
                      >
                        {editingStatBlock ? 'View' : 'Edit'}
                      </button>
                      <span className="text-stone-300">·</span>
                      <button
                        onClick={handleRemoveStatBlock}
                        className="text-[10px] text-red-500 hover:text-red-600 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {statBlock ? (
                  editingStatBlock ? (
                    <div className="glass-panel p-3 max-h-96 overflow-y-auto">
                      <StatBlockEditor
                        statBlock={statBlock}
                        onChange={handleStatBlockChange}
                      />
                    </div>
                  ) : (
                    <div className="glass-panel p-3 max-h-96 overflow-y-auto">
                      <StatBlockViewer
                        statBlock={statBlock}
                        tokenName={token.name}
                        gameSystem={campaign?.gameSystem ?? null}
                      />
                    </div>
                  )
                ) : (
                  <div className="glass-panel p-3">
                    {showCreateStatBlock ? (
                      <div className="flex gap-2 items-center">
                        <button
                          onClick={handleCreateStatBlock}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          Create Blank
                        </button>
                        <button
                          onClick={() => setShowCreateStatBlock(false)}
                          className="btn-secondary text-xs py-1 px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-stone-gray/70 italic mb-2">No stat block</p>
                        <button
                          onClick={() => setShowCreateStatBlock(true)}
                          className="btn-secondary text-xs"
                        >
                          Add Stat Block
                        </button>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ── Disposition (NPC only) ── */}
            {isNpc && (
              <section>
                <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                  Disposition
                </h3>
                <div className="flex gap-2">
                  {([
                    { d: TokenDisposition.FRIENDLY, label: 'Friendly', activeClass: 'border-teal-500 bg-teal-500/10 text-teal-700 font-semibold' },
                    { d: TokenDisposition.NEUTRAL,  label: 'Neutral',  activeClass: 'border-amber-500 bg-amber-500/10 text-amber-700 font-semibold' },
                    { d: TokenDisposition.HOSTILE,  label: 'Hostile',  activeClass: 'border-red-500 bg-red-500/10 text-red-700 font-semibold' },
                  ] as const).map(({ d, label, activeClass }) => (
                    <button
                      key={d}
                      onClick={() => setTokenDisposition(d)}
                      className={`flex-1 py-1.5 text-xs rounded-cozy border transition-all ${
                        disposition === d
                          ? activeClass
                          : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Initiative ── */}
            <section>
              <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                Initiative <span className="font-normal normal-case opacity-60">(optional)</span>
              </h3>
              <input
                type="number"
                value={initiative}
                onChange={(e) => setInitiative(e.target.value)}
                onBlur={handleInitiativeBlur}
                placeholder="e.g. 14"
                className="input-cozy input-cozy-number w-full text-sm"
              />
            </section>

            {/* ── Conditions ── */}
            <section>
              <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                Conditions
              </h3>

              {/* Active conditions */}
              {conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {conditions.map((c) => (
                    <button
                      key={c}
                      onClick={() => toggleCondition(c)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-700 transition-colors"
                    >
                      {c} <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              {/* Common conditions grid */}
              <div className="flex flex-wrap gap-1">
                {COMMON_CONDITIONS.map((c) => {
                  const active = conditions.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggleCondition(c)}
                      className={`px-2 py-1 text-xs rounded-cozy border transition-all ${
                        active
                          ? 'border-amber-500/50 bg-amber-500/15 text-amber-700'
                          : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── DM Notes ── */}
            <section>
              <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                DM Notes <span className="font-normal normal-case opacity-60">(not shown to players)</span>
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Guard post, special abilities, loot…"
                rows={3}
                className="input-cozy w-full text-sm resize-none"
              />
            </section>

            {/* ── Controlled By ── */}
            <section>
              <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                Controlled By
              </h3>
              <select
                value={controlledBy ?? 'none'}
                onChange={(e) => handleControllerChange(e.target.value === 'none' ? null : e.target.value)}
                className="input-cozy w-full text-sm"
              >
                <option value="none">Nobody (DM controls)</option>
                {(campaign?.memberships ?? [])
                  .filter((m) => m.role !== 'DM')
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.displayName ?? m.userId}
                    </option>
                  ))}
              </select>
              {controlledBy && (
                <p className="text-[10px] text-stone-gray/60 mt-1">
                  This player can move the token on the map.
                </p>
              )}
            </section>

            {/* ── Quick Actions ── */}
            <section>
              <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
                Quick Actions
              </h3>

              <div className="flex gap-2">
                <button
                  onClick={toggleVisible}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-cozy border transition-all ${
                    visible
                      ? 'border-stone-gray/30 hover:border-stone-gray/50 text-stone-gray'
                      : 'border-moss-green/40 bg-moss-green/10 text-moss-green font-semibold'
                  }`}
                >
                  {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {visible ? 'Hide from Players' : 'Show to Players'}
                </button>

                <button
                  onClick={handleRemove}
                  disabled={isRemoving}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-cozy border border-red-500/30 hover:bg-red-500/10 text-red-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isRemoving ? 'Removing…' : 'Remove'}
                </button>
              </div>
            </section>

          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
