// ============================================
// CampaignSettingsModal
// DM-only slide-over panel for campaign settings
// General info, member management, danger zone
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Settings,
  Save,
  Loader2,
  Users,
  Trash2,
  UserMinus,
  UserPlus,
  AlertTriangle,
  ShieldCheck,
  MessageCircle,
  Download,
} from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import campaignService from '@/services/campaign.service';
import InvitePlayerModal from './InvitePlayerModal';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import type { CampaignMembership } from '@/types';

interface CampaignSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ============================================
// Tab type
// ============================================

type SettingsTab = 'general' | 'chat' | 'members' | 'danger';

export default function CampaignSettingsModal({
  isOpen,
  onClose,
}: CampaignSettingsModalProps) {
  const { campaign, refreshCampaign } = useCampaign();
  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Tab ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // ── General settings form ────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // ── Chat settings ────────────────────────────
  const [chatCooldownEnabled, setChatCooldownEnabled] = useState(false);
  const [chatCooldownSeconds, setChatCooldownSeconds] = useState(5);
  const [savingChat, setSavingChat] = useState(false);

  // ── Members ──────────────────────────────────
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<CampaignMembership | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // ── Export ────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportIncludeAudio, setExportIncludeAudio] = useState(false);

  // ── Danger zone ──────────────────────────────
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync form values when modal opens or campaign changes
  useEffect(() => {
    if (isOpen && campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setChatCooldownEnabled(campaign.chatCooldownEnabled);
      setChatCooldownSeconds(campaign.chatCooldownSeconds);
      setDeleteConfirmName('');
      setActiveTab('general');
    }
  }, [isOpen, campaign]);

  if (!campaign) return null;

  const memberships: CampaignMembership[] = campaign.memberships ?? [];

  // ── Handlers ─────────────────────────────────

  const handleSaveGeneral = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Campaign name cannot be empty', 'error');
      return;
    }
    setSavingGeneral(true);
    try {
      await campaignService.updateCampaign(campaign.id, {
        name: trimmedName,
        description: description.trim() || undefined,
      });
      await refreshCampaign();
      showToast('Campaign settings saved', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to save settings', 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveChat = async () => {
    setSavingChat(true);
    try {
      await campaignService.updateCampaign(campaign.id, {
        chatCooldownEnabled,
        chatCooldownSeconds,
      });
      await refreshCampaign();
      showToast('Chat settings saved', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to save chat settings', 'error');
    } finally {
      setSavingChat(false);
    }
  };

  const handleRemoveMemberClick = (membership: CampaignMembership) => {
    setMemberToRemove(membership);
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    setRemovingMemberId(memberToRemove.userId);
    setMemberToRemove(null);
    try {
      await api.removeCampaignMember(campaign.id, memberToRemove.userId);
      await refreshCampaign();
      showToast('Player removed from campaign', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to remove member', 'error');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleDeleteCampaign = async () => {
    setShowDeleteConfirm(false);
    setDeletingCampaign(true);
    try {
      await campaignService.deleteCampaign(campaign.id);
      showToast(`Campaign "${campaign.name}" deleted`, 'success');
      navigate('/dashboard');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to delete campaign', 'error');
      setDeletingCampaign(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await api.exportCampaign(campaign.id, { includeAudio: exportIncludeAudio });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      a.download = `${safeName}-export.cozyvtt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Campaign exported successfully', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to export campaign', 'error');
    } finally {
      setExporting(false);
    }
  };

  const isDmSelf = (membership: CampaignMembership) =>
    membership.userId === user?.id || membership.role === 'DM';

  const deleteNameMatches = deleteConfirmName.trim() === campaign.name;

  // ── Render ───────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-full max-w-xl bg-paper-white shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* ── Header ── */}
              <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-sm border-b border-moss-green/20 px-6 py-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Settings className="w-6 h-6 text-moss-green" />
                    <div>
                      <h2 className="text-xl font-bold text-moss-green">Campaign Settings</h2>
                      <p className="text-xs text-stone-gray truncate max-w-[220px]">{campaign.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
                    aria-label="Close settings"
                  >
                    <X className="w-5 h-5 text-stone-gray" />
                  </button>
                </div>

                {/* ── Tabs ── */}
                <div className="flex gap-1 mt-4">
                  {(
                    [
                      { id: 'general', label: 'General' },
                      { id: 'chat', label: 'Chat' },
                      { id: 'members', label: 'Members' },
                      { id: 'danger', label: 'Danger Zone' },
                    ] as { id: SettingsTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? tab.id === 'danger'
                            ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                            : 'bg-moss-green/15 text-moss-green border border-moss-green/20'
                          : 'text-stone-gray hover:bg-warm-gray/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Content ── */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* ════ GENERAL TAB ════ */}
                {activeTab === 'general' && (
                  <div className="space-y-5">
                    <div>
                      <label
                        htmlFor="cs-name"
                        className="block text-sm font-semibold text-stone-gray mb-1.5"
                      >
                        Campaign Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="cs-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                        className="input-cozy w-full"
                        placeholder="My Campaign"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="cs-description"
                        className="block text-sm font-semibold text-stone-gray mb-1.5"
                      >
                        Description <span className="text-warm-gray font-normal">(optional)</span>
                      </label>
                      <textarea
                        id="cs-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        maxLength={1000}
                        className="input-cozy w-full resize-none"
                        placeholder="Describe your campaign…"
                      />
                      <p className="mt-1 text-xs text-warm-gray text-right">
                        {description.length}/1000
                      </p>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveGeneral}
                        disabled={savingGeneral || !name.trim()}
                        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingGeneral ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>

                    {/* ── Export ── */}
                    <div className="pt-4 mt-4 border-t border-moss-green/15 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-stone-gray">
                        <Download className="w-4 h-4 text-moss-green" />
                        Export Campaign
                      </div>
                      <p className="text-xs text-warm-gray">
                        Download a <span className="font-mono">.cozyvtt</span> archive containing maps, creatures,
                        token templates, and all associated assets. Character data is not included for privacy.
                      </p>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-stone-gray">Include audio assets</p>
                          <p className="text-xs text-warm-gray">Ambient tracks and sound effects</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={exportIncludeAudio}
                          onClick={() => setExportIncludeAudio((v) => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-moss-green/50 ${
                            exportIncludeAudio ? 'bg-moss-green' : 'bg-warm-gray/30'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                              exportIncludeAudio ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleExport}
                        disabled={exporting}
                        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {exporting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Exporting…
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Export Campaign
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ════ CHAT TAB ════ */}
                {activeTab === 'chat' && (
                  <div className="space-y-5">
                    <div className="flex items-start gap-3 p-4 rounded-lg bg-moss-green/5 border border-moss-green/15">
                      <MessageCircle className="w-5 h-5 text-moss-green flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-stone-gray">
                        A message cooldown prevents players from sending messages too quickly.
                        When enabled, each player must wait the configured number of seconds
                        before sending their next message.
                      </p>
                    </div>

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-stone-gray">Enable message cooldown</p>
                        <p className="text-xs text-warm-gray mt-0.5">Off by default — players can chat freely</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={chatCooldownEnabled}
                        onClick={() => setChatCooldownEnabled((v) => !v)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-moss-green/50 ${
                          chatCooldownEnabled ? 'bg-moss-green' : 'bg-warm-gray/30'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            chatCooldownEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Cooldown duration */}
                    {chatCooldownEnabled && (
                      <div>
                        <label
                          htmlFor="cs-cooldown-seconds"
                          className="block text-sm font-semibold text-stone-gray mb-1.5"
                        >
                          Cooldown duration <span className="font-normal text-warm-gray">(seconds)</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            id="cs-cooldown-seconds"
                            type="number"
                            min={1}
                            max={300}
                            value={chatCooldownSeconds}
                            onChange={(e) => {
                              const v = Math.max(1, Math.min(300, Number(e.target.value)));
                              setChatCooldownSeconds(v);
                            }}
                            className="input-cozy w-28"
                          />
                          <span className="text-sm text-warm-gray">
                            {chatCooldownSeconds === 1
                              ? '1 second between messages'
                              : `${chatCooldownSeconds} seconds between messages`}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-warm-gray">Between 1 and 300 seconds.</p>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveChat}
                        disabled={savingChat}
                        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingChat ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save Changes
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* ════ MEMBERS TAB ════ */}
                {activeTab === 'members' && (
                  <div className="space-y-4">
                    {/* Invite button */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-stone-gray">
                        <Users className="w-4 h-4" />
                        <span>{memberships.length} member{memberships.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowInviteModal(true)}
                        className="btn-secondary flex items-center gap-2 text-sm"
                      >
                        <UserPlus className="w-4 h-4" />
                        Invite Player
                      </button>
                    </div>

                    {/* Member list */}
                    <div className="space-y-2">
                      {memberships.map((membership) => {
                        const isSelf = membership.userId === user?.id;
                        const isDm = membership.role === 'DM';
                        const isRemoving = removingMemberId === membership.userId;

                        return (
                          <div
                            key={membership.userId}
                            className="flex items-center justify-between p-3 rounded-lg bg-parchment/50 border border-moss-green/10"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-moss-green/15 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-bold text-moss-green uppercase">
                                  {(membership.user?.displayName ?? '?')[0]}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-stone-gray truncate">
                                  {membership.user?.displayName ?? 'Unknown'}
                                  {isSelf && (
                                    <span className="ml-1.5 text-xs font-normal text-warm-gray">(you)</span>
                                  )}
                                </p>
                                <p className="text-xs text-warm-gray truncate">
                                  {membership.user?.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Role badge */}
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                                  isDm
                                    ? 'bg-spirit-purple/10 text-spirit-purple border-spirit-purple/20'
                                    : membership.role === 'SPECTATOR'
                                    ? 'bg-stone-gray/10 text-stone-gray border-stone-gray/20'
                                    : 'bg-moss-green/10 text-moss-green border-moss-green/20'
                                }`}
                              >
                                {isDm ? (
                                  <span className="flex items-center gap-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    DM
                                  </span>
                                ) : (
                                  membership.role
                                )}
                              </span>

                              {/* Remove button — DM and self cannot be removed */}
                              {!isDmSelf(membership) && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMemberClick(membership)}
                                  disabled={isRemoving}
                                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                                  aria-label={`Remove ${membership.user?.displayName} from campaign`}
                                >
                                  {isRemoving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <UserMinus className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ════ DANGER ZONE TAB ════ */}
                {activeTab === 'danger' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                      <div className="flex items-start gap-3 mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-red-800 mb-1">Delete Campaign</h3>
                          <p className="text-sm text-red-700">
                            Permanently deletes this campaign and all associated maps, tokens, chat
                            history, and session records. Characters and uploaded assets are{' '}
                            <strong>not</strong> deleted — they remain in your library.
                          </p>
                          <p className="text-sm text-red-700 mt-2">
                            This action <strong>cannot be undone</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label
                            htmlFor="cs-delete-confirm"
                            className="block text-sm font-semibold text-red-800 mb-1.5"
                          >
                            Type <span className="font-mono bg-red-100 px-1 rounded">{campaign.name}</span> to confirm:
                          </label>
                          <input
                            id="cs-delete-confirm"
                            type="text"
                            value={deleteConfirmName}
                            onChange={(e) => setDeleteConfirmName(e.target.value)}
                            className="input-cozy w-full border-red-300 focus:border-red-500 focus:ring-red-500/20"
                            placeholder={campaign.name}
                            autoComplete="off"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={!deleteNameMatches || deletingCampaign}
                          className="btn-danger w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {deletingCampaign ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Deleting…
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4" />
                              Delete Campaign
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remove member confirm dialog */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        title="Remove Player"
        message={`Remove ${memberToRemove?.user?.displayName ?? 'this player'} from "${campaign.name}"? They will lose access to the campaign immediately.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Final delete confirm dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Campaign"
        message={`Are you absolutely sure you want to permanently delete "${campaign.name}"? This cannot be undone.`}
        confirmLabel="Delete Forever"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingCampaign}
        onConfirm={handleDeleteCampaign}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Invite player modal */}
      {showInviteModal && (
        <InvitePlayerModal
          campaignId={campaign.id}
          onClose={() => setShowInviteModal(false)}
          onSuccess={() => {
            setShowInviteModal(false);
            refreshCampaign();
            showToast('Invitation sent!', 'success');
          }}
        />
      )}
    </>
  );
}
