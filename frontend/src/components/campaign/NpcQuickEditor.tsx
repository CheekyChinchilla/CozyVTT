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
import {
  X,
  Eye,
  EyeOff,
  HelpCircle,
  Trash2,
  Upload,
  Loader2,
  Image as ImageIcon,
  Save,
  Plus,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorMessage } from '@/utils/errors';
import { conditionsOffered } from '@/utils/conditions';
import { TOKEN_LIMITS } from '@/constants/tokenLimits';
import { tokenControllerStanding } from '@/utils/tokenCopy';
import api from '@/services/api';
import { useGameStore } from '@/stores/gameStore';
import type { Token, UpdateTokenRequest, TokenHp, NpcStatBlock, Asset } from '@/types';
import { TokenType, TokenDisposition, AssetType, AssetScope } from '@/types';
import { StatBlockViewer, StatBlockEditor } from './npc-stat-blocks';
import Button from '@/components/ui/Button';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import AssetGrid from '@/components/assets/AssetGrid';
import TokenVisionField from './TokenVisionField';
import RemoveTokenDialog from './RemoveTokenDialog';
import { assetNameFrom } from '@/utils/assetName';
import { extractAssetId } from '@/utils/assetUrl';

/** How long typing in the stat block pauses before it is saved. */
const STAT_BLOCK_SAVE_DELAY_MS = 750;

// ============================================
// Constants
// ============================================

// The listed conditions come from utils/conditions, for the campaign's game
// system. This file used to keep its own hand-picked twelve, which left a DM
// unable to mark an NPC Deafened, Grappled or Petrified while a player
// character could be.

/**
 * One field of the token as a quick control shows it: the table's value, or
 * the DM's change in its place from when it is made until its save is
 * answered, when the table's value is the answer: the change once stored, or
 * what it was if refused. `show` numbers each change, and `drop(change)`
 * clears only that one, so an older save answered late leaves a newer change
 * showing; `drop()` clears whatever is shown.
 */
function useOwnChange<T>(live: T): [T, (value: T) => number, (change?: number) => void] {
  const [own, setOwn] = useState<{ value: T; change: number } | null>(null);
  const changes = useRef(0);
  const show = useCallback((value: T) => {
    changes.current += 1;
    setOwn({ value, change: changes.current });
    return changes.current;
  }, []);
  const drop = useCallback((change?: number) => {
    setOwn((shown) => (shown && (change === undefined || shown.change === change) ? null : shown));
  }, []);
  return [own ? own.value : live, show, drop];
}

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
  const { campaign, currentMap } = useCampaign();
  const { showToast } = useToast();

  // The token as the table holds it (the game store), which a change made
  // anywhere else reaches: another tab, a script, a player on a token they
  // control. A copy kept here hid those changes, and the next save put the
  // copy's values back over them. The prop is the token as it was opened,
  // for the moment it is not in the store.
  const liveToken = useGameStore((s) => s.tokens[token.id]);
  const current = liveToken ?? token;

  // Each quick control shows the DM's change at once, in place of the
  // table's value, until its save is answered: then the table's value again,
  // which is the change once stored, or what it was if refused.
  const [hp, showOwnHp, dropOwnHp] = useOwnChange<TokenHp | null>(current.hp ?? null);
  const [showHpBar, showOwnHpBar, dropOwnHpBar] = useOwnChange(current.showHpBar ?? false);
  const [disposition, showOwnDisposition, dropOwnDisposition] = useOwnChange<TokenDisposition | null>(current.disposition ?? null);
  const [conditions, showOwnConditions, dropOwnConditions] = useOwnChange<string[]>(current.conditions ?? []);
  const [controlledBy, showOwnController, dropOwnController] = useOwnChange<string | null>(current.controlledBy ?? null);
  const controller = tokenControllerStanding(controlledBy, campaign?.memberships);

  // Typed text is the DM's from the first key until it is saved, and stays
  // in the box when the save is refused, with the reason shown.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const name = nameDraft ?? current.name;
  const liveInitiative = current.initiative !== null && current.initiative !== undefined ? String(current.initiative) : '';
  const [initiativeDraft, setInitiativeDraft] = useState<string | null>(null);
  const initiative = initiativeDraft ?? liveInitiative;
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const notes = notesDraft ?? (current.notes ?? '');

  // A condition of the DM's own, as typed.
  const [customCondition, setCustomCondition] = useState('');
  const offeredConditions = conditionsOffered(campaign?.gameSystem ?? null);
  // Hidden and obscured are shown from the table alone, never ahead of it: a
  // button saying "hidden" while every player still saw the token was worse
  // than one that waits for the save.
  const visible = current.visible;
  const obscured = current.obscured ?? false;
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  // Set while the Remove confirmation is open.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [enableHpPrompt, setEnableHpPrompt] = useState(false);
  const [newHpMax, setNewHpMax] = useState('');
  // The stat block as typed, while it is the DM's (see the stat block saves
  // below); otherwise the table's.
  const [statBlockDraft, setStatBlockDraft] = useState<{ value: NpcStatBlock | null } | null>(null);
  const statBlock = statBlockDraft ? statBlockDraft.value : ((current.statBlock as NpcStatBlock | null | undefined) ?? null);
  const [editingStatBlock, setEditingStatBlock] = useState(false);
  const [showCreateStatBlock, setShowCreateStatBlock] = useState(false);

  // ── Token image editing state ──
  const [showImagePicker, setShowImagePicker] = useState(false);
  // The picker grid fetches and searches the pictures itself; these are what
  // was typed into its search box, and pictures uploaded here, shown first.
  const [pictureSearch, setPictureSearch] = useState('');
  const [uploadedPictures, setUploadedPictures] = useState<Asset[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingToCreature, setIsSavingToCreature] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showDuplicateNamePrompt, setShowDuplicateNamePrompt] = useState(false);
  const [duplicateName, setDuplicateName] = useState('');
  const imageFileRef = useRef<HTMLInputElement>(null);

  const tokenType = getEffectiveType(current);
  const isNpc = tokenType === TokenType.NPC;

  // ── Generic update helper ──
  // Answers whether the change was stored, so a control that showed it at
  // once can put itself back when it was not.
  const saveUpdate = useCallback(async (changes: UpdateTokenRequest): Promise<boolean> => {
    try {
      const result = await api.updateToken(campaignId, mapId, token.id, changes);
      // The DM, the only one this editor opens for, always gets the token back.
      if (result.token) onTokenUpdate(result.token);
      return true;
    } catch (err) {
      // Say why, or the edit stays in the field looking saved. A token from
      // an earlier release can hold more than the server now accepts (notes
      // past 5,000 characters, a name past 200), and the reason names the field.
      console.error('NpcQuickEditor: failed to update token', err);
      showToast(apiErrorMessage(err) || 'Could not save that change to the token', 'error');
      return false;
    }
  }, [campaignId, mapId, token.id, onTokenUpdate, showToast]);

  // ── HP adjustment ──
  // Each quick control shows its change at once and goes back to what it was
  // when the save is refused.
  const adjustHp = useCallback(async (delta: number) => {
    if (!hp) return;
    const newCurrent = Math.max(0, Math.min(hp.max, hp.current + delta));
    const newHp = { ...hp, current: newCurrent };
    const shown = showOwnHp(newHp);
    await saveUpdate({ hp: newHp });
    dropOwnHp(shown);
  }, [hp, saveUpdate, showOwnHp, dropOwnHp]);

  const setTempHp = useCallback(async (val: number) => {
    if (!hp) return;
    const newHp = { ...hp, temp: Math.max(0, val) };
    const shown = showOwnHp(newHp);
    await saveUpdate({ hp: newHp });
    dropOwnHp(shown);
  }, [hp, saveUpdate, showOwnHp, dropOwnHp]);

  const toggleShowHpBar = useCallback(async () => {
    const shown = showOwnHpBar(!showHpBar);
    await saveUpdate({ showHpBar: !showHpBar });
    dropOwnHpBar(shown);
  }, [showHpBar, saveUpdate, showOwnHpBar, dropOwnHpBar]);

  const enableHpTracking = useCallback(async () => {
    const max = parseInt(newHpMax, 10);
    if (!max || max <= 0) return;
    const newHp: TokenHp = { current: max, max, temp: 0 };
    const shownHp = showOwnHp(newHp);
    const shownBar = showOwnHpBar(true);
    setEnableHpPrompt(false);
    setNewHpMax('');
    await saveUpdate({ hp: newHp, showHpBar: true });
    dropOwnHp(shownHp);
    dropOwnHpBar(shownBar);
  }, [newHpMax, saveUpdate, showOwnHp, dropOwnHp, showOwnHpBar, dropOwnHpBar]);

  // ── Stat block ──
  // Typed into a field at a time, so it is saved once typing pauses, or at
  // once when focus leaves the stat block or the editor closes, not on every
  // keystroke: each save is followed by the whole map being sent to every
  // player again. The waiting edit carries the save for the token it was
  // made on, and saves run one after another, so the last edit is the one
  // stored.
  //
  // The typed stat block is the DM's until the last edit made is stored;
  // then the table's again, so a change from elsewhere shows.
  const pendingStatBlock = useRef<{ statBlock: NpcStatBlock; save: typeof saveUpdate; edit: number } | null>(null);
  const statBlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statBlockSaves = useRef<Promise<void>>(Promise.resolve());
  // Counts stat block edits, so a save knows whether another came after it.
  const statBlockEdits = useRef(0);

  const flushStatBlock = useCallback(() => {
    if (statBlockTimer.current) clearTimeout(statBlockTimer.current);
    statBlockTimer.current = null;
    const pending = pendingStatBlock.current;
    if (!pending) return;
    pendingStatBlock.current = null;
    // Typed text stays in the fields when a save is refused, with the reason
    // shown, so it can be put right and saved again.
    statBlockSaves.current = statBlockSaves.current.then(async () => {
      const stored = await pending.save({ statBlock: pending.statBlock });
      if (stored && statBlockEdits.current === pending.edit) setStatBlockDraft(null);
    });
  }, []);

  const dropPendingStatBlock = useCallback(() => {
    if (statBlockTimer.current) clearTimeout(statBlockTimer.current);
    statBlockTimer.current = null;
    pendingStatBlock.current = null;
  }, []);

  const handleStatBlockChange = useCallback((updated: NpcStatBlock) => {
    setStatBlockDraft({ value: updated });
    statBlockEdits.current += 1;
    pendingStatBlock.current = { statBlock: updated, save: saveUpdate, edit: statBlockEdits.current };
    if (statBlockTimer.current) clearTimeout(statBlockTimer.current);
    statBlockTimer.current = setTimeout(flushStatBlock, STAT_BLOCK_SAVE_DELAY_MS);
  }, [saveUpdate, flushStatBlock]);

  // Closing the editor, or opening it on another token, saves what is waiting.
  useEffect(() => flushStatBlock, [token.id, flushStatBlock]);

  const handleCreateStatBlock = useCallback(async () => {
    const newBlock: NpcStatBlock = {
      ac: 10,
      speed: '30 ft.',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    };
    statBlockEdits.current += 1;
    const edit = statBlockEdits.current;
    setStatBlockDraft({ value: newBlock });
    setEditingStatBlock(true);
    setShowCreateStatBlock(false);
    const created = await saveUpdate({ statBlock: newBlock });
    // Typing into the new block while it was being created is a later edit,
    // which stays the DM's until its own save.
    if (statBlockEdits.current !== edit) return;
    if (!created) setEditingStatBlock(false);
    setStatBlockDraft(null);
  }, [saveUpdate]);

  const handleRemoveStatBlock = useCallback(async () => {
    dropPendingStatBlock();
    statBlockEdits.current += 1;
    setStatBlockDraft({ value: null });
    setEditingStatBlock(false);
    // After any stat block save still under way, so that one cannot land last.
    statBlockSaves.current = statBlockSaves.current.then(async () => { await saveUpdate({ statBlock: null }); });
    await statBlockSaves.current;
    setStatBlockDraft(null);
  }, [saveUpdate, dropPendingStatBlock]);

  // ── Token image ──
  const handleOpenImagePicker = useCallback(() => {
    setShowImagePicker(true);
  }, []);

  const handlePictureLoadError = useCallback((err: unknown) => {
    showToast(apiErrorMessage(err) || 'Could not load your token pictures', 'error');
  }, [showToast]);

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
    formData.append('name', assetNameFrom(baseName));

    try {
      const { asset } = await api.uploadAsset(formData);
      setUploadedPictures((prev) => [asset, ...prev]);
      await saveUpdate({ imageUrl: asset.id });
      setShowImagePicker(false);
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Could not upload that picture', 'error');
    } finally {
      setIsUploadingImage(false);
    }
  }, [campaign, saveUpdate, showToast]);

  // Step 1: DM clicks save — try direct update, or prompt for name if SRD
  const handleSaveImageToCreature = useCallback(async () => {
    if (!campaign || !current.creatureTemplateId || !current.imageUrl) return;
    setIsSavingToCreature(true);
    setDuplicateWarning(null);

    try {
      // Direct update works for custom creatures
      await api.updateCreature(campaign.id, current.creatureTemplateId, { imageUrl: current.imageUrl });
      setShowImagePicker(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status !== 403) {
        showToast(apiErrorMessage(err) || 'Could not save the picture to the creature', 'error');
        setIsSavingToCreature(false);
        return;
      }

      // SRD creature — fetch its name and show the name prompt
      try {
        const original = await api.getCreature(campaign.id, current.creatureTemplateId);
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
        setDuplicateName(current.name);
      }
      setShowDuplicateNamePrompt(true);
    } finally {
      setIsSavingToCreature(false);
    }
  }, [campaign, current.creatureTemplateId, current.imageUrl, current.name, showToast]);

  // Step 2: DM confirms name — duplicate, rename, set image, relink token
  const handleConfirmDuplicate = useCallback(async () => {
    if (!campaign || !current.creatureTemplateId || !current.imageUrl || !duplicateName.trim()) return;
    setIsSavingToCreature(true);

    try {
      const duplicate = await api.duplicateCreature(campaign.id, current.creatureTemplateId);
      const finalName = duplicateName.trim();
      // Update the duplicate with the chosen name and the image
      await api.updateCreature(campaign.id, duplicate.id, {
        name: finalName,
        imageUrl: current.imageUrl,
      });
      // Relink this token to the new custom creature
      await saveUpdate({ creatureTemplateId: duplicate.id });
      setShowDuplicateNamePrompt(false);
      setDuplicateWarning(null);
      setShowImagePicker(false);
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Could not make a custom copy of the creature', 'error');
    } finally {
      setIsSavingToCreature(false);
    }
  }, [campaign, current.creatureTemplateId, current.imageUrl, duplicateName, saveUpdate, showToast]);

  // ── Disposition ──
  const setTokenDisposition = useCallback(async (d: TokenDisposition) => {
    const shown = showOwnDisposition(d);
    await saveUpdate({ disposition: d });
    dropOwnDisposition(shown);
  }, [saveUpdate, showOwnDisposition, dropOwnDisposition]);

  // ── Conditions ──
  const toggleCondition = useCallback(async (condition: string) => {
    const newConditions = conditions.includes(condition)
      ? conditions.filter((c) => c !== condition)
      : [...conditions, condition];
    const shown = showOwnConditions(newConditions);
    await saveUpdate({ conditions: newConditions });
    dropOwnConditions(shown);
  }, [conditions, saveUpdate, showOwnConditions, dropOwnConditions]);

  // A typed condition is added once: one the list offers takes the list's
  // spelling, and one the token already has (in any capitals) adds nothing.
  const typedCondition = customCondition.trim();
  const canAddCondition = typedCondition !== '' && conditions.length < TOKEN_LIMITS.maxConditions;
  const addCustomCondition = useCallback(() => {
    if (!canAddCondition) return;
    const same = (c: string) => c.toLowerCase() === typedCondition.toLowerCase();
    setCustomCondition('');
    if (conditions.some(same)) return;
    void toggleCondition(offeredConditions.find(same) ?? typedCondition);
  }, [canAddCondition, typedCondition, conditions, offeredConditions, toggleCondition]);

  // ── Name save on blur ──
  const handleNameBlur = useCallback(async () => {
    if (nameDraft === null) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== current.name && !(await saveUpdate({ name: trimmed }))) return;
    setNameDraft(null);
  }, [nameDraft, current.name, saveUpdate]);

  // ── Initiative save on blur ──
  const handleInitiativeBlur = useCallback(async () => {
    if (initiativeDraft === null) return;
    const parsed = initiativeDraft !== '' ? parseInt(initiativeDraft, 10) : null;
    if (parsed !== (current.initiative ?? null) && !(await saveUpdate({ initiative: parsed }))) return;
    setInitiativeDraft(null);
  }, [initiativeDraft, current.initiative, saveUpdate]);

  // ── Notes save on blur ──
  const handleNotesBlur = useCallback(async () => {
    if (notesDraft === null) return;
    if (notesDraft !== (current.notes ?? '') && !(await saveUpdate({ notes: notesDraft }))) return;
    setNotesDraft(null);
  }, [notesDraft, current.notes, saveUpdate]);

  // ── Visibility toggle ──
  // Shown from the store, so the button changes when the save is stored and
  // not before; it waits meanwhile.
  const toggleVisible = useCallback(async () => {
    setSavingVisibility(true);
    await saveUpdate({ visible: !visible });
    setSavingVisibility(false);
  }, [visible, saveUpdate]);

  // ── Identity toggle ──
  const toggleObscured = useCallback(async () => {
    setSavingVisibility(true);
    await saveUpdate({ obscured: !obscured });
    setSavingVisibility(false);
  }, [obscured, saveUpdate]);

  // ── Controller change ──
  const handleControllerChange = useCallback(async (userId: string | null) => {
    const shown = showOwnController(userId);
    await saveUpdate({ controlledBy: userId });
    dropOwnController(shown);
  }, [saveUpdate, showOwnController, dropOwnController]);

  // ── Remove token ──
  const handleRemove = useCallback(async () => {
    if (isRemoving) return;
    setConfirmingRemove(false);
    setIsRemoving(true);
    try {
      await api.deleteToken(campaignId, mapId, token.id);
      onClose();
    } catch (err) {
      showToast(apiErrorMessage(err) || 'Failed to remove the token', 'error');
      setIsRemoving(false);
    }
  }, [campaignId, mapId, token.id, onClose, isRemoving, showToast]);

  // HP bar rendering values
  const hpPct = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
  const hpColor = getHpColor(hpPct);

  // Opening the editor on another token starts it clean.
  useEffect(() => {
    setNameDraft(null);
    setInitiativeDraft(null);
    setNotesDraft(null);
    dropOwnHp();
    dropOwnHpBar();
    dropOwnDisposition();
    dropOwnConditions();
    dropOwnController();
    setStatBlockDraft(null);
    setEditingStatBlock(false);
    setShowCreateStatBlock(false);
    setShowImagePicker(false);
    setDuplicateWarning(null);
    setShowDuplicateNamePrompt(false);
    setDuplicateName('');
  }, [token.id]);

  return (
    <>
    <SlideOver
      open
      onClose={onClose}
      backdropClassName="bg-black/40"
      className="max-w-sm bg-paper-white shadow-2xl overflow-y-auto flex flex-col"
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
          className="relative group shrink-0"
          title={current.imageUrl ? 'Change token image' : 'Add a token image'}
        >
          {current.imageUrl ? (
            <img
              src={current.imageUrl}
              alt={current.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-moss-green/30"
            />
          ) : (
            // Dashed outline and an upload icon, matching the empty image
            // slot in TokenTemplateLibrary. This used to be a heart, which
            // read as "favourite" and gave no hint that the avatar is a
            // button that opens the image picker.
            <div className="w-14 h-14 rounded-full bg-stone-gray/10 border border-dashed border-stone-gray/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-stone-gray/50" />
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-forest-shadow/0 group-hover:bg-forest-shadow/40 transition-colors flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-paper-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </button>

        {/* The panel's name for a screen reader; the field below edits it */}
        <SlideOverTitle className="sr-only">{current.name}</SlideOverTitle>

        {/* Editable name */}
        <input
          type="text"
          value={name}
          aria-label="Token name"
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          // min-w-0 is load-bearing: a flex child defaults to min-width:auto,
          // and an <input>'s intrinsic minimum is wide enough that a long
          // token name pushed the badge and close button off the panel edge.
          className="flex-1 min-w-0 text-base font-bold text-brand-ink bg-transparent border-b border-transparent hover:border-moss-green/30 focus:border-moss-green focus:outline-hidden px-0"
        />

        {/* Badge */}
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
          tokenType === TokenType.OBJECT
            ? 'bg-stone-gray/10 text-stone-gray'
            : 'bg-moss-green/10 text-brand-ink'
        }`}>
          {tokenType === TokenType.OBJECT ? 'Object' : tokenType === TokenType.PLAYER ? 'Player' : 'NPC'}
        </span>

        {/* Close */}
        <SlideOverClose className="btn-secondary p-1.5 shrink-0" iconClassName="w-4 h-4" title="Close" />
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
                  className="flex items-center gap-1 text-[10px] text-brand-ink hover:text-brand-ink/80 disabled:opacity-40 transition-colors"
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {isUploadingImage ? 'Uploading...' : 'Upload'}
                </button>
                <span className="text-ink-muted">·</span>
                <button
                  onClick={() => setShowImagePicker(false)}
                  className="text-[10px] text-stone-gray hover:text-stone-gray/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            <input
              type="search"
              value={pictureSearch}
              onChange={(e) => setPictureSearch(e.target.value)}
              aria-label="Search token pictures"
              placeholder="Search by name or tag"
              className="input-cozy w-full text-xs mb-2"
            />
            <AssetGrid
              type={AssetType.TOKEN}
              search={pictureSearch}
              prepend={uploadedPictures}
              onLoadError={handlePictureLoadError}
              // imageUrl may hold a bare id or a full /api/assets path.
              selectedId={extractAssetId(current.imageUrl)}
              onSelect={(asset) => (asset ? handleSelectImage(asset.id) : handleClearImage())}
              columns={5}
              gapClass="gap-1.5"
              maxHeightClass="max-h-40"
              leadingItem={
                <button
                  type="button"
                  onClick={handleClearImage}
                  title="Use colored-letter placeholder"
                  className={`relative rounded-cozy overflow-hidden border-2 aspect-square transition-all flex items-center justify-center ${
                    !current.imageUrl
                      ? 'border-moss-green ring-1 ring-moss-green/30 bg-ink-muted/25'
                      : 'border-transparent hover:border-moss-green/40 bg-ink-muted/20'
                  }`}
                >
                  <span className="text-sm font-bold text-ink-secondary">?</span>
                  <span className="absolute bottom-0 text-[7px] text-ink-muted">None</span>
                </button>
              }
            />

            {/* Save to creature template option */}
            {current.creatureTemplateId && current.imageUrl && (
              <div className="mt-2 space-y-1.5">
                {showDuplicateNamePrompt ? (
                  <div className="rounded-cozy border border-moss-green/30 bg-parchment/40 p-2.5 space-y-2">
                    <p className="text-[11px] text-stone-gray">
                      This is an SRD creature. A custom copy will be created in your campaign library.
                    </p>
                    {duplicateWarning && (
                      <p className="text-[11px] text-warning-ink bg-warning/10 rounded-sm px-2 py-1">
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
                        className="flex-1 py-1.5 text-[10px] rounded-cozy bg-moss-green/10 border border-moss-green/30 hover:bg-moss-green/15 text-brand-ink transition-colors font-medium disabled:opacity-40"
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
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-cozy border border-moss-green/30 hover:bg-moss-green/10 text-brand-ink transition-colors"
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
                      <span className="text-info-ink ml-1 text-xs">+{hp.temp} temp</span>
                    )}
                  </div>
                </div>

                {/* HP buttons */}
                <div className="flex gap-1 mb-2">
                  {([-10, -5, -1] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => adjustHp(d)}
                      className="flex-1 py-1.5 text-xs rounded-cozy border border-danger/30 hover:bg-danger/10 text-danger-ink transition-colors font-medium"
                    >
                      {d}
                    </button>
                  ))}
                  {([1, 5, 10] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => adjustHp(d)}
                      className="flex-1 py-1.5 text-xs rounded-cozy border border-success/30 hover:bg-success/10 text-success-ink transition-colors font-medium"
                    >
                      +{d}
                    </button>
                  ))}
                </div>

                {/* Temp HP */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-stone-gray w-16 shrink-0">Temp HP:</span>
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
                    className="rounded-sm"
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
                    <Button
                      onClick={enableHpTracking}
                      className="text-xs py-1 px-3"
                    >
                      Enable
                    </Button>
                    <Button
                      onClick={() => { setEnableHpPrompt(false); setNewHpMax(''); }}
                      variant="secondary" className="text-xs py-1 px-2"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setEnableHpPrompt(true)}
                    variant="secondary" className="text-xs"
                  >
                    Enable HP tracking
                  </Button>
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
                    onClick={() => {
                      flushStatBlock();
                      setEditingStatBlock(!editingStatBlock);
                    }}
                    className="text-[10px] text-brand-ink hover:text-brand-ink/80 transition-colors"
                  >
                    {editingStatBlock ? 'View' : 'Edit'}
                  </button>
                  <span className="text-ink-muted">·</span>
                  <button
                    onClick={handleRemoveStatBlock}
                    className="text-[10px] text-danger-ink hover:text-danger-ink transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {statBlock ? (
              editingStatBlock ? (
                <div
                  className="glass-panel p-3 max-h-96 overflow-y-auto"
                  onBlur={(e) => {
                    // Focus moving between the stat block's own fields is still typing.
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) flushStatBlock();
                  }}
                >
                  <StatBlockEditor
                    statBlock={statBlock}
                    onChange={handleStatBlockChange}
                    gameSystem={campaign?.gameSystem ?? null}
                  />
                </div>
              ) : (
                <div className="glass-panel p-3 max-h-96 overflow-y-auto">
                  <StatBlockViewer
                    statBlock={statBlock}
                    tokenName={current.name}
                    gameSystem={campaign?.gameSystem ?? null}
                  />
                </div>
              )
            ) : (
              <div className="glass-panel p-3">
                {showCreateStatBlock ? (
                  <div className="flex gap-2 items-center">
                    <Button
                      onClick={handleCreateStatBlock}
                      className="text-xs py-1 px-3"
                    >
                      Create Blank
                    </Button>
                    <Button
                      onClick={() => setShowCreateStatBlock(false)}
                      variant="secondary" className="text-xs py-1 px-2"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-stone-gray/70 italic mb-2">No stat block</p>
                    <Button
                      onClick={() => setShowCreateStatBlock(true)}
                      variant="secondary" className="text-xs"
                    >
                      Add Stat Block
                    </Button>
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
                { d: TokenDisposition.NEUTRAL,  label: 'Neutral',  activeClass: 'border-warning/60 bg-warning/10 text-warning-ink font-semibold' },
                { d: TokenDisposition.HOSTILE,  label: 'Hostile',  activeClass: 'border-danger/60 bg-danger/10 text-danger-ink font-semibold' },
              ] as const).map(({ d, label, activeClass }) => (
                <button
                  key={d}
                  onClick={() => setTokenDisposition(d)}
                  aria-pressed={disposition === d}
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
            onChange={(e) => setInitiativeDraft(e.target.value)}
            onBlur={handleInitiativeBlur}
            placeholder="e.g. 14"
            className="input-cozy input-cozy-number w-full text-sm"
          />
        </section>

        {/* ── Darkvision (objects do not see) ── */}
        {tokenType !== TokenType.OBJECT && (
          <section>
            <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">Sight</h3>
            <TokenVisionField
              value={current.sightRadius ?? 0}
              onCommit={(squares) => { void saveUpdate({ sightRadius: squares }); }}
              feetPerSquare={currentMap?.feetPerSquare ?? 5}
            />
          </section>
        )}

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
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-warning/15 border border-warning/30 text-warning-ink hover:bg-danger/10 hover:border-danger/30 hover:text-danger-ink transition-colors"
                >
                  {c} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {/* The game system's conditions */}
          {offeredConditions.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {offeredConditions.map((c) => {
                const active = conditions.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCondition(c)}
                    className={`px-2 py-1 text-xs rounded-cozy border transition-all ${
                      active
                        ? 'border-warning/50 bg-warning/15 text-warning-ink'
                        : 'border-moss-green/20 hover:border-moss-green/40 text-stone-gray'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {/* A condition of the DM's own, in any game system */}
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addCustomCondition();
            }}
          >
            <input
              type="text"
              value={customCondition}
              onChange={(e) => setCustomCondition(e.target.value)}
              maxLength={TOKEN_LIMITS.maxConditionLength}
              placeholder={offeredConditions.length > 0 ? 'Another condition' : 'A condition, such as Frightened 2'}
              aria-label="Add a condition"
              className="input-cozy flex-1 min-w-0 text-xs"
            />
            <button
              type="submit"
              disabled={!canAddCondition}
              aria-label="Add condition"
              className="px-2 py-1 text-xs rounded-cozy border border-moss-green/30 text-brand-ink hover:bg-moss-green/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </section>

        {/* ── DM Notes ── */}
        <section>
          <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide mb-2">
            DM Notes <span className="font-normal normal-case opacity-60">(not shown to players)</span>
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotesDraft(e.target.value)}
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
            aria-label="Controlled By"
            value={controlledBy ?? 'none'}
            onChange={(e) => handleControllerChange(e.target.value === 'none' ? null : e.target.value)}
            className="input-cozy w-full text-sm"
          >
            <option value="none">Nobody (DM controls)</option>
            {/* A controller who is no longer a player is shown, so the
                box says who the token names, and cannot be picked again. */}
            {controller.kind === 'not a player' && controlledBy && (
              <option value={controlledBy} disabled>
                {controller.name ?? 'A former member'} (no longer a player)
              </option>
            )}
            {(campaign?.memberships ?? [])
              .filter((m) => m.role === 'PLAYER')
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.user?.displayName ?? m.userId}
                </option>
              ))}
          </select>
          {controller.kind === 'player' && (
            <p className="text-[10px] text-stone-gray/60 mt-1">
              This player can move the token on the map.
            </p>
          )}
          {controller.kind === 'not a player' && (
            <p className="text-[10px] text-warning-ink mt-1">
              {controller.name ?? 'They'} {controller.name ? 'is' : 'are'} no longer a player here, so they cannot move the token. Choose a player, or Nobody.
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
              disabled={savingVisibility}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-cozy border transition-all ${
                visible
                  ? 'border-stone-gray/30 hover:border-stone-gray/50 text-stone-gray'
                  : 'border-moss-green/40 bg-moss-green/10 text-brand-ink font-semibold'
              }`}
            >
              {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {visible ? 'Hide from Players' : 'Show to Players'}
            </button>

            <button
              onClick={toggleObscured}
              disabled={savingVisibility}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs rounded-cozy border transition-all ${
                obscured
                  ? 'border-moss-green/40 bg-moss-green/10 text-brand-ink font-semibold'
                  : 'border-stone-gray/30 hover:border-stone-gray/50 text-stone-gray'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {obscured ? 'Reveal Identity' : 'Obscure Identity'}
            </button>

            <button
              onClick={() => setConfirmingRemove(true)}
              disabled={isRemoving}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-cozy border border-danger/30 hover:bg-danger/10 text-danger-ink transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isRemoving ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </section>

      </div>
    </SlideOver>
    <RemoveTokenDialog
      token={confirmingRemove ? token : null}
      isLoading={isRemoving}
      onConfirm={handleRemove}
      onCancel={() => setConfirmingRemove(false)}
    />
    </>
  );
}
