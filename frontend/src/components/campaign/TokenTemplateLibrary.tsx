/**
 * TokenTemplateLibrary
 * DM slide-over panel for browsing, creating, editing, and placing saved token templates.
 * Tokens saved here can be reused across maps and copied to other campaigns.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Search,
  Loader2,
  Package,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Copy,
  ChevronDown,
  ChevronRight,
  Upload,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useGameStore } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import api from '@/services/api';
import type { TokenTemplate, NpcStatBlock, Campaign } from '@/types';
import { TokenType, AssetType, AssetScope, CampaignRole } from '@/types';
import type { TokenDisplayMode } from '@/types';
import StatBlockEditor from './npc-stat-blocks/StatBlockEditor';
import Button from '@/components/ui/Button';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';

function defaultStatBlockForNpc(): NpcStatBlock {
  return {
    ac: 10,
    speed: '30 ft.',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  };
}

// ============================================
// Props
// ============================================

interface TokenTemplateLibraryProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Component
// ============================================

export default function TokenTemplateLibrary({ isOpen, onClose }: TokenTemplateLibraryProps) {
  const { campaign, currentMap } = useCampaign();
  const { socket } = useWebSocket();

  // ── Data state ──
  const [templates, setTemplates] = useState<TokenTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // ── UI state ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TokenTemplate | null>(null);
  const [copyMenuId, setCopyMenuId] = useState<string | null>(null);
  const [dmCampaigns, setDmCampaigns] = useState<Campaign[]>([]);

  // ── Fetch templates ──
  const fetchTemplates = useCallback(async () => {
    if (!campaign) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listTokenTemplates(campaign.id, {
        search: searchQuery || undefined,
        type: typeFilter || undefined,
        limit: 100,
        offset: 0,
      });
      setTemplates(result.templates);
      setTotal(result.total);
    } catch {
      setError('Failed to load token templates');
    } finally {
      setIsLoading(false);
    }
  }, [campaign, searchQuery, typeFilter]);

  useEffect(() => {
    if (!isOpen || !campaign) return;
    fetchTemplates();
  }, [isOpen, campaign?.id, typeFilter]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => fetchTemplates(), 300);
    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery]);

  // Fetch campaigns user is DM of (for copy-to feature)
  useEffect(() => {
    if (!isOpen) return;
    api.listCampaigns().then(({ campaigns }) => {
      setDmCampaigns(
        campaigns.filter(
          (c: any) => c.userRole === CampaignRole.DM && c.id !== campaign?.id
        )
      );
    }).catch(() => {});
  }, [isOpen, campaign?.id]);

  // ── Place template on map ──
  const handlePlace = useCallback(async (template: TokenTemplate) => {
    if (!campaign || !currentMap) return;
    setPlacingId(template.id);

    const position = {
      x: Math.floor(currentMap.width / 2),
      y: Math.floor(currentMap.height / 2),
    };

    try {
      const tokenPayload = {
        name: template.name,
        imageUrl: template.imageUrl || '',
        position,
        size: template.size || { width: 1, height: 1 },
        type: template.type || TokenType.OBJECT,
        displayMode: template.displayMode || 'pog',
        disposition: template.disposition || null,
        hp: template.hp || null,
        showHpBar: template.showHpBar || false,
        visible: true,
        controlledBy: null,
        conditions: [],
        notes: template.notes || '',
        initiative: null,
        statBlock: template.statBlock || null,
        sightRadius: template.sightRadius || undefined,
      };

      const result = await api.addToken(
        campaign.id,
        currentMap.id,
        tokenPayload as Parameters<typeof api.addToken>[2]
      );
      useGameStore.getState().addToken(result.token);
      socket?.emitMapChange(currentMap.id);
    } catch {
      setError('Failed to place token on map');
    } finally {
      setPlacingId(null);
    }
  }, [campaign, currentMap, socket]);

  // ── Delete template ──
  const handleDelete = useCallback(async (id: string) => {
    if (!campaign) return;
    try {
      await api.deleteTokenTemplate(campaign.id, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setTotal((prev) => prev - 1);
      if (expandedId === id) setExpandedId(null);
    } catch {
      setError('Failed to delete template');
    }
  }, [campaign, expandedId]);

  // ── Edit ──
  const handleEdit = useCallback((template: TokenTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
    setExpandedId(null);
  }, []);

  // ── Copy to campaign ──
  const handleCopyToCampaign = useCallback(async (templateId: string, targetCampaignId: string) => {
    if (!campaign) return;
    try {
      await api.copyTokenTemplateToCampaign(campaign.id, templateId, targetCampaignId);
      setCopyMenuId(null);
    } catch {
      setError('Failed to copy template');
    }
  }, [campaign]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="token-tpl-backdrop"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="token-tpl-panel"
            className="fixed left-0 top-0 h-full z-50 w-full max-w-md bg-paper-white shadow-2xl flex flex-col"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
              <Package className="w-5 h-5 text-brand-ink flex-shrink-0" />
              <h2 className="flex-1 text-base font-bold text-brand-ink">Token Templates</h2>
              <span className="text-xs text-stone-gray/60">
                {total} template{total !== 1 ? 's' : ''}
              </span>
              <Button onClick={onClose} variant="secondary" className="p-1.5 flex-shrink-0" title="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Search & Filters */}
            <div className="px-4 py-3 border-b border-moss-green/10 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="input-cozy w-full pl-8 text-sm"
                />
              </div>

              <div className="flex gap-2 items-center">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="input-cozy text-xs flex-1"
                >
                  <option value="">All Types</option>
                  <option value="object">Objects</option>
                  <option value="npc">NPCs</option>
                  <option value="player">Players</option>
                </select>
                <button
                  onClick={() => { setEditingTemplate(null); setShowForm(true); }}
                  className="flex items-center gap-1 text-xs text-brand-ink hover:text-brand-ink/80 transition-colors"
                >
                  <Plus className="w-3 h-3" /> New Template
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-4 mt-2 text-xs text-danger-ink bg-danger/10 border border-danger/20 rounded-cozy px-3 py-2">
                {error}
              </div>
            )}

            {/* Template List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && templates.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-stone-gray">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Loading templates...
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <Package className="w-8 h-8 text-brand-ink/30 mx-auto mb-2" />
                  <p className="text-sm text-stone-gray/70">
                    {searchQuery ? 'No templates match your search.' : 'No saved token templates yet.'}
                  </p>
                  <p className="text-xs text-stone-gray/50 mt-1">
                    Save tokens from the map or create a new template to get started.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-moss-green/10">
                  {templates.map((template) => (
                    <TemplateRow
                      key={template.id}
                      template={template}
                      isExpanded={expandedId === template.id}
                      isPlacing={placingId === template.id}
                      showCopyMenu={copyMenuId === template.id}
                      dmCampaigns={dmCampaigns}
                      onToggle={() => setExpandedId(expandedId === template.id ? null : template.id)}
                      onPlace={() => handlePlace(template)}
                      onEdit={() => handleEdit(template)}
                      onDelete={() => handleDelete(template.id)}
                      onToggleCopyMenu={() => setCopyMenuId(copyMenuId === template.id ? null : template.id)}
                      onCopyToCampaign={(targetId) => handleCopyToCampaign(template.id, targetId)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Create / Edit Form */}
            {showForm && (
              <TemplateForm
                campaignId={campaign?.id || ''}
                editingTemplate={editingTemplate}
                onCreated={(t) => {
                  setTemplates((prev) => [t, ...prev]);
                  setTotal((prev) => prev + 1);
                  setShowForm(false);
                  setEditingTemplate(null);
                }}
                onEdited={(t) => {
                  setTemplates((prev) => prev.map((x) => x.id === t.id ? t : x));
                  setShowForm(false);
                  setEditingTemplate(null);
                }}
                onCancel={() => { setShowForm(false); setEditingTemplate(null); }}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Template Row
// ============================================

interface TemplateRowProps {
  template: TokenTemplate;
  isExpanded: boolean;
  isPlacing: boolean;
  showCopyMenu: boolean;
  dmCampaigns: Campaign[];
  onToggle: () => void;
  onPlace: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleCopyMenu: () => void;
  onCopyToCampaign: (targetCampaignId: string) => void;
}

function TemplateRow({
  template,
  isExpanded,
  isPlacing,
  showCopyMenu,
  dmCampaigns,
  onToggle,
  onPlace,
  onEdit,
  onDelete,
  onToggleCopyMenu,
  onCopyToCampaign,
}: TemplateRowProps) {
  const typeColors: Record<string, string> = {
    object: 'bg-warning/10 text-warning-ink',
    npc: 'bg-danger/10 text-danger-ink',
    player: 'bg-teal-500/10 text-teal-600',
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-moss-green/5 transition-colors"
      >
        {/* Avatar */}
        {template.imageUrl ? (
          <img
            src={template.imageUrl}
            alt={template.name}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-moss-green/20"
          />
        ) : (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm ${
            template.disposition === 'hostile' ? 'bg-danger' :
            template.disposition === 'friendly' ? 'bg-teal-500' : 'bg-warning'
          }`}>
            {template.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-black truncate">{template.name}</div>
          <div className="text-[10px] text-stone-gray/60">
            {template.size.width}x{template.size.height}
            {template.notes && <span className="ml-1 truncate">&middot; {template.notes}</span>}
          </div>
        </div>

        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${typeColors[template.type] || typeColors.object}`}>
          {template.type}
        </span>

        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-stone-gray/40 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-stone-gray/40 flex-shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onPlace}
              disabled={isPlacing}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-cozy bg-moss-green/10 text-brand-ink border border-moss-green/30 hover:bg-moss-green/20 transition-colors font-medium"
            >
              {isPlacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
              {isPlacing ? 'Placing...' : 'Place on Map'}
            </button>
            <button
              onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-moss-green/20 text-brand-ink hover:bg-moss-green/10 transition-colors"
              title="Edit template"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <div className="relative">
              <button
                onClick={onToggleCopyMenu}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-moss-green/20 text-stone-gray hover:border-moss-green/40 transition-colors"
                title="Copy to another campaign"
              >
                <Copy className="w-3 h-3" /> Copy
              </button>
              {showCopyMenu && dmCampaigns.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-paper-white border border-moss-green/20 rounded-cozy shadow-lg py-1 min-w-[180px] max-h-48 overflow-y-auto">
                  <div className="px-2 py-1 text-[9px] text-stone-gray/60 uppercase tracking-wide font-semibold">
                    Copy to campaign
                  </div>
                  {dmCampaigns.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => onCopyToCampaign(c.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-moss-green/5 transition-colors truncate"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {showCopyMenu && dmCampaigns.length === 0 && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-paper-white border border-moss-green/20 rounded-cozy shadow-lg p-3 min-w-[180px]">
                  <p className="text-[10px] text-stone-gray/60">No other campaigns where you are DM.</p>
                </div>
              )}
            </div>
            <button
              onClick={onDelete}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-cozy border border-danger/20 text-danger-ink hover:bg-danger/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>

          {/* Details */}
          {template.statBlock && (
            <div className="glass-panel p-2 text-[10px] text-stone-gray space-y-0.5">
              <div>AC {(template.statBlock as NpcStatBlock).ac} &middot; Speed {(template.statBlock as NpcStatBlock).speed}</div>
            </div>
          )}
          {template.hp && (
            <div className="text-[10px] text-stone-gray/60">
              HP: {template.hp.current}/{template.hp.max}{template.hp.temp > 0 && ` (+${template.hp.temp} temp)`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Template Form — Create & Edit
// ============================================

interface TemplateFormProps {
  campaignId: string;
  editingTemplate: TokenTemplate | null;
  onCreated: (t: TokenTemplate) => void;
  onEdited: (t: TokenTemplate) => void;
  onCancel: () => void;
}

function TemplateForm({ campaignId, editingTemplate, onCreated, onEdited, onCancel }: TemplateFormProps) {
  const isEdit = !!editingTemplate;
  const { data: serverConfig } = useServerConfigQuery();

  const [name, setName] = useState(editingTemplate?.name ?? '');
  const [type, setType] = useState<string>(editingTemplate?.type ?? 'object');
  const [disposition, setDisposition] = useState<string>(editingTemplate?.disposition ?? '');
  const [displayMode, setDisplayMode] = useState<TokenDisplayMode>(editingTemplate?.displayMode ?? 'pog');
  const [width, setWidth] = useState(editingTemplate?.size?.width ?? 1);
  const [height, setHeight] = useState(editingTemplate?.size?.height ?? 1);
  const [notes, setNotes] = useState(editingTemplate?.notes ?? '');
  const [imageUrl, setImageUrl] = useState(editingTemplate?.imageUrl ?? '');
  const [showHpBar, setShowHpBar] = useState(editingTemplate?.showHpBar ?? false);
  const [hpMax, setHpMax] = useState(editingTemplate?.hp?.max ?? 10);
  const [statBlock, setStatBlock] = useState<NpcStatBlock | null>(
    (editingTemplate?.statBlock as NpcStatBlock | null) ?? null
  );
  const [showStatBlock, setShowStatBlock] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const tokenLimit = getUploadLimit(serverConfig, AssetType.TOKEN);
    if (file.size > tokenLimit) { setFormError(`Image must be under ${formatUploadLimit(tokenLimit)}`); return; }

    setIsUploading(true);
    setFormError(null);
    try {
      // Fields before the file so the server can name the type if it rejects an
      // oversize upload mid-stream.
      const formData = new FormData();
      formData.append('type', AssetType.TOKEN);
      formData.append('scope', AssetScope.CAMPAIGN);
      formData.append('campaignId', campaignId);
      formData.append('name', file.name.replace(/\.[^.]+$/, ''));
      formData.append('file', file);
      const { asset } = await api.uploadAsset(formData);
      setImageUrl(asset.id);
    } catch {
      setFormError('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setFormError('Name is required'); return; }
    setIsSubmitting(true);
    setFormError(null);

    const payload: Partial<TokenTemplate> = {
      name: name.trim(),
      imageUrl: imageUrl || null,
      type: type as TokenTemplate['type'],
      disposition: disposition ? (disposition as TokenTemplate['disposition']) : null,
      displayMode: displayMode as TokenTemplate['displayMode'],
      size: { width, height },
      notes: notes || null,
      hp: showHpBar ? { current: hpMax, max: hpMax, temp: 0 } : null,
      showHpBar,
      statBlock: type === 'npc' ? statBlock : null,
    };

    try {
      if (isEdit && editingTemplate) {
        const updated = await api.updateTokenTemplate(campaignId, editingTemplate.id, payload);
        onEdited(updated);
      } else {
        const created = await api.createTokenTemplate(campaignId, payload);
        onCreated(created);
      }
    } catch {
      setFormError(isEdit ? 'Failed to update template' : 'Failed to create template');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-moss-green/20 bg-parchment/40 p-4 space-y-3 max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-brand-ink uppercase tracking-wide">
          {isEdit ? 'Edit Template' : 'New Token Template'}
        </h3>
        <button onClick={onCancel} className="text-stone-gray hover:text-stone-gray/80 p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      {formError && (
        <div className="text-xs text-danger-ink bg-danger/10 rounded px-2 py-1">{formError}</div>
      )}

      {/* Name */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Treasure Chest" className="input-cozy w-full text-sm" />
      </div>

      {/* Image */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Image</label>
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <img
              src={imageUrl.startsWith('http') || imageUrl.startsWith('/') ? imageUrl : `/api/assets/${imageUrl}/file`}
              alt="Token" className="w-10 h-10 rounded-full object-cover border border-moss-green/20"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-stone-gray/10 flex items-center justify-center border border-dashed border-stone-gray/30">
              <Upload className="w-4 h-4 text-stone-gray/40" />
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleImageUpload} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="text-[10px] text-brand-ink hover:text-brand-ink/80 flex items-center gap-1">
            {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {imageUrl ? 'Change' : 'Upload'}
          </button>
          {imageUrl && <button type="button" onClick={() => setImageUrl('')} className="text-[10px] text-danger-ink hover:text-danger-ink">Remove</button>}
        </div>
      </div>

      {/* Type & Display Mode */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Token Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input-cozy w-full text-xs">
            <option value="object">Object</option>
            <option value="npc">NPC</option>
            <option value="player">Player</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Display Mode</label>
          <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as TokenDisplayMode)} className="input-cozy w-full text-xs">
            <option value="pog">Pog (circular)</option>
            <option value="top-down">Top-Down</option>
            <option value="full-art">Full Art</option>
          </select>
        </div>
      </div>

      {/* Size & Disposition */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Width</label>
          <input type="number" value={width} onChange={(e) => setWidth(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} min={1} max={10} className="input-cozy input-cozy-number w-full text-xs text-center" />
        </div>
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Height</label>
          <input type="number" value={height} onChange={(e) => setHeight(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} min={1} max={10} className="input-cozy input-cozy-number w-full text-xs text-center" />
        </div>
        <div>
          <label className="text-[10px] text-stone-gray block mb-0.5">Disposition</label>
          <select value={disposition} onChange={(e) => setDisposition(e.target.value)} className="input-cozy w-full text-xs">
            <option value="">None</option>
            <option value="friendly">Friendly</option>
            <option value="neutral">Neutral</option>
            <option value="hostile">Hostile</option>
          </select>
        </div>
      </div>

      {/* HP Toggle */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="template-hp" checked={showHpBar} onChange={(e) => setShowHpBar(e.target.checked)} className="rounded border-moss-green/30" />
        <label htmlFor="template-hp" className="text-[10px] text-stone-gray">Show HP Bar</label>
        {showHpBar && (
          <input type="number" value={hpMax} onChange={(e) => setHpMax(Math.max(1, parseInt(e.target.value, 10) || 1))} min={1} className="input-cozy input-cozy-number w-16 text-xs text-center ml-2" placeholder="Max HP" />
        )}
      </div>

      {/* Stat Block (NPC only) */}
      {type === 'npc' && (
        <div className="border-t border-moss-green/10 pt-2">
          <button
            type="button"
            onClick={() => {
              if (!statBlock) setStatBlock(defaultStatBlockForNpc());
              setShowStatBlock((prev) => !prev);
            }}
            className="flex items-center gap-1 w-full text-left py-1 text-[10px] font-semibold text-brand-ink uppercase tracking-wide hover:text-brand-ink/80 transition-colors"
          >
            {showStatBlock ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Stat Block
            {!statBlock && <span className="ml-1 text-stone-gray/60 normal-case font-normal">(none)</span>}
          </button>
          {showStatBlock && statBlock && (
            <div className="pl-1 pt-1">
              <StatBlockEditor statBlock={statBlock} onChange={setStatBlock} />
              <button
                type="button"
                onClick={() => { setStatBlock(null); setShowStatBlock(false); }}
                className="mt-2 text-[10px] text-danger-ink hover:text-danger-ink flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear stat block
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-[10px] text-stone-gray block mb-0.5">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input-cozy w-full text-xs resize-y" placeholder="Optional description or notes" />
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()} className="flex-1 text-xs py-2">
          {isSubmitting ? (
            <><Loader2 className="w-3 h-3 animate-spin inline mr-1" />{isEdit ? 'Saving...' : 'Creating...'}</>
          ) : (
            isEdit ? 'Save Changes' : 'Create Template'
          )}
        </Button>
        <Button onClick={onCancel} variant="secondary" className="text-xs py-2 px-4">Cancel</Button>
      </div>
    </div>
  );
}
