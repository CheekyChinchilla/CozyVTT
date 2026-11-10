// ============================================
// CampaignSettingsModal
// DM-only slide-over panel for campaign settings
// General info, member management, danger zone
// ============================================

import { useState, useEffect, useCallback } from 'react';
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
  Crown,
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
import { CampaignRole } from '@/types';
import type { AccessRevoked, AssignableCampaignRole, CampaignMembership, CampaignInvitationSummary } from '@/types';
import Button from '@/components/ui/Button';
import SlideOver, { SlideOverClose, SlideOverTitle } from '@/components/ui/SlideOver';
import { apiErrorMessage } from '@/utils/errors';
import { CAMPAIGN_ROLE_LABEL, isCampaignOwner } from '@/utils/campaignRoles';
import { CAMPAIGN_LIMITS } from '@/constants/campaignLimits';

interface CampaignSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Told once the campaign is deleted, with the notice every tab of the
   * campaign is sent too (useAccessRevoked says it once, whichever comes
   * first, and goes to the dashboard).
   */
  onDeleted: (revoked: AccessRevoked) => void;
}

// ============================================
// Tab type
// ============================================

type SettingsTab = 'general' | 'chat' | 'members' | 'danger';

/** What the Role picker beside a member offers, in its order. */
const ROLE_CHOICES = [CampaignRole.PLAYER, CampaignRole.SPECTATOR] as const satisfies readonly AssignableCampaignRole[];

/** The picker's value as a role it offers. */
const roleChoice = (value: string): AssignableCampaignRole | undefined => ROLE_CHOICES.find((role) => role === value);

/** A switch's press, a finger's height around its 24 px pill on a touch screen. */
const SWITCH_PRESS = "pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-['']";

export default function CampaignSettingsModal({
  isOpen,
  onClose,
  onDeleted,
}: CampaignSettingsModalProps) {
  const { campaign, refreshCampaign, userRole } = useCampaign();

  /**
   * The panel is open to the DM and to the campaign's owner, who are not always
   * the same person once the game has been handed over.
   *
   * An owner who is no longer the DM keeps exactly two powers, and the server
   * agrees with this list: they can delete the campaign, and they can take the
   * DM seat back. Everything else here — renaming, chat settings, exporting,
   * inviting, removing members — is gated on being the DM, so offering it would
   * only produce refusals.
   */
  const isDmViewer = userRole === 'DM';
  const { showToast } = useToast();
  const { user } = useAuth();
  const mayDelete = isCampaignOwner(campaign, user?.id) || user?.platformRole === 'ADMIN';

  // ── Tab ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // ── General settings form ────────────────────
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

  // ── Players may draw ─────────────────────────
  // What the switch shows while its save is on its way; the campaign's own
  // value otherwise, which the settings broadcast keeps current.
  const [playersMayDrawShown, setPlayersMayDrawShown] = useState<boolean | null>(null);

  // ── Chat settings ────────────────────────────
  const [chatCooldownEnabled, setChatCooldownEnabled] = useState(false);
  const [chatCooldownSeconds, setChatCooldownSeconds] = useState(5);
  const [savingChat, setSavingChat] = useState(false);

  // ── Members ──────────────────────────────────
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<CampaignMembership | null>(null);
  // What Remove's question calls the member asked about.
  const removingRole = memberToRemove ? CAMPAIGN_ROLE_LABEL[memberToRemove.role] : CAMPAIGN_ROLE_LABEL[CampaignRole.PLAYER];
  const [memberToPromote, setMemberToPromote] = useState<CampaignMembership | null>(null);
  const [promotingMemberId, setPromotingMemberId] = useState<string | null>(null);
  // The role each Role picker shows while its change is on its way, by member;
  // the membership's own role otherwise.
  const [pendingRoles, setPendingRoles] = useState<Record<string, AssignableCampaignRole>>({});
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteKey, setInviteKey] = useState(0);
  // The invitations that still stand, for the DM to see and withdraw.
  const [invitations, setInvitations] = useState<CampaignInvitationSummary[]>([]);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  // ── Export ────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportIncludeAudio, setExportIncludeAudio] = useState(false);

  // ── Danger zone ──────────────────────────────
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletingCampaign, setDeletingCampaign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Seed the form when the dialog opens, or for another campaign. Not on
  // every campaign object: the page fetches the same campaign again when
  // someone joins or leaves and after a reconnect, and re-seeding then threw
  // away what the DM was typing and jumped back to the first tab.
  useEffect(() => {
    if (isOpen && campaign) {
      setName(campaign.name);
      setDescription(campaign.description ?? '');
      setChatCooldownEnabled(campaign.chatCooldownEnabled);
      setChatCooldownSeconds(campaign.chatCooldownSeconds);
      setDeleteConfirmName('');
      setActiveTab(isDmViewer ? 'general' : 'members');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds the form on opening and for another campaign; a refetch of the same one must keep what the DM typed
  }, [isOpen, campaign?.id]);

  const loadInvitations = useCallback(async () => {
    if (!campaign?.id) return;
    try {
      setInvitations((await api.listCampaignInvitations(campaign.id)).invitations);
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Could not load the pending invitations', 'error');
    }
  }, [campaign?.id, showToast]);

  useEffect(() => {
    if (isOpen && isDmViewer && activeTab === 'members') void loadInvitations();
  }, [isOpen, isDmViewer, activeTab, loadInvitations]);

  if (!campaign) return null;

  const memberships: CampaignMembership[] = campaign.memberships ?? [];

  const handleWithdrawInvitation = async (invitation: CampaignInvitationSummary) => {
    setWithdrawingId(invitation.id);
    try {
      await api.withdrawCampaignInvitation(campaign.id, invitation.id);
      setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      showToast(`Withdrew the invitation to ${invitation.user.displayName}`, 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to withdraw the invitation', 'error');
    } finally {
      setWithdrawingId(null);
    }
  };

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
        // An emptied box clears the description; leaving it out kept the old one.
        description: description.trim() || null,
      });
      await refreshCampaign();
      showToast('Campaign settings saved', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to save settings', 'error');
    } finally {
      setSavingGeneral(false);
    }
  };

  /** Players may draw: saved as soon as it is switched, so it reaches a table in play at once. */
  const handlePlayersMayDraw = async (next: boolean) => {
    setPlayersMayDrawShown(next);
    try {
      await campaignService.updateCampaign(campaign.id, { playersMayDraw: next });
      await refreshCampaign();
      showToast(next ? 'Players may draw on the map now' : 'Only you can draw on the map now', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Could not change who may draw on the map', 'error');
    } finally {
      setPlayersMayDrawShown(null);
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
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to save chat settings', 'error');
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
      showToast(`${CAMPAIGN_ROLE_LABEL[memberToRemove.role]} removed from campaign`, 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to remove member', 'error');
    } finally {
      setRemovingMemberId(null);
    }
  };

  /**
   * Make a member a player or a spectator. The picker shows the role chosen
   * while the server is asked, and the campaign is read again once it has
   * answered, so the row keeps it; a refusal puts the row back and says why.
   * The member's own page follows through `campaign.role.changed`.
   */
  const handleChangeRole = async (membership: CampaignMembership, role: AssignableCampaignRole) => {
    if (role === membership.role) return;
    const { userId } = membership;
    setPendingRoles((prev) => ({ ...prev, [userId]: role }));
    try {
      await api.changeCampaignMemberRole(campaign.id, userId, role);
      await refreshCampaign();
      showToast(`${membership.user?.displayName ?? 'The member'} is now a ${CAMPAIGN_ROLE_LABEL[role].toLowerCase()}`, 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to change the role', 'error');
    } finally {
      setPendingRoles((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  };

  /**
   * Hand the game to someone else. One action on the server: they become DM and
   * you become a player. Ownership of the campaign does not move, so if you own
   * it you still do.
   */
  const handleConfirmMakeDm = async () => {
    if (!memberToPromote) return;
    const promoted = memberToPromote;
    setPromotingMemberId(promoted.userId);
    setMemberToPromote(null);
    try {
      await api.transferDM(campaign.id, promoted.userId);
      await refreshCampaign();
      showToast(`${promoted.user?.displayName ?? 'They'} is now the DM`, 'success');
      // This panel is DM-only, and the caller has just stopped being the DM.
      onClose();
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to transfer the DM role', 'error');
    } finally {
      setPromotingMemberId(null);
    }
  };

  // The server also tells this tab, before it answers; the page's handler
  // says whichever comes first, once, as for Leave Campaign.
  const handleDeleteCampaign = async () => {
    setShowDeleteConfirm(false);
    setDeletingCampaign(true);
    try {
      await campaignService.deleteCampaign(campaign.id);
      onDeleted({ campaignId: campaign.id, reason: 'campaign-deleted', message: `${campaign.name} was deleted.` });
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to delete campaign', 'error');
      setDeletingCampaign(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
      const outcome = await api.downloadCampaignExport(
        campaign.id,
        { includeAudio: exportIncludeAudio },
        `${safeName}-export.cozyvtt`
      );
      if (outcome === 'saved') showToast('Campaign exported successfully', 'success');
    } catch (err) {
      showToast(apiErrorMessage(err) ?? 'Failed to export campaign', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Nobody the server refuses to remove: yourself, the DM, and the
  // campaign's owner, who keeps their place at the table whoever runs it.
  const mayRemove = (membership: CampaignMembership) =>
    membership.userId !== user?.id && membership.role !== 'DM' && membership.userId !== campaign.ownerId;

  const deleteNameMatches = deleteConfirmName.trim() === campaign.name;

  // ── Render ───────────────────────────────────

  return (
    <>
      <SlideOver
        open={isOpen}
        onClose={onClose}
        className="max-w-xl bg-paper-white shadow-2xl flex flex-col"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-moss-green/10 backdrop-blur-xs border-b border-moss-green/20 px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-6 h-6 text-brand-ink" />
              <div>
                <SlideOverTitle className="text-xl font-bold text-brand-ink">Campaign Settings</SlideOverTitle>
                <p className="text-xs text-stone-gray truncate max-w-[220px]">{campaign.name}</p>
              </div>
            </div>
            <SlideOverClose
              className="p-2 hover:bg-moss-green/10 rounded-lg transition-colors"
              iconClassName="w-5 h-5 text-stone-gray"
            />
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 mt-4">
            {(
              [
                ...(isDmViewer
                  ? [
                      { id: 'general', label: 'General' },
                      { id: 'chat', label: 'Chat' },
                    ]
                  : []),
                { id: 'members', label: 'Members' },
                // Only Delete Campaign is here, which the server leaves
                // to the owner or an administrator, whatever their role.
                ...(mayDelete ? [{ id: 'danger', label: 'Danger Zone' }] : []),
              ] as { id: SettingsTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`touch-target px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? tab.id === 'danger'
                      ? 'bg-danger/10 text-danger-ink border border-danger/20'
                      : 'bg-moss-green/15 text-brand-ink border border-moss-green/20'
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
                  Campaign Name <span className="text-danger-ink">*</span>
                </label>
                <input
                  id="cs-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={CAMPAIGN_LIMITS.maxNameLength}
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
                  maxLength={CAMPAIGN_LIMITS.maxDescriptionLength}
                  className="input-cozy w-full resize-none"
                  placeholder="Describe your campaign…"
                />
                <p className="mt-1 text-xs text-warm-gray text-right">
                  {description.length}/{CAMPAIGN_LIMITS.maxDescriptionLength}
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSaveGeneral}
                  disabled={savingGeneral || !name.trim()}
                  className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </Button>
              </div>

              {/* ── Players may draw ── */}
              <div className="pt-4 mt-4 border-t border-moss-green/15 flex items-center justify-between gap-4">
                <div>
                  <p id="cs-players-may-draw" className="text-sm font-semibold text-stone-gray">Players may draw</p>
                  <p className="text-xs text-warm-gray mt-0.5">
                    Players can draw on the map and point the laser, except while the session is paused or has ended. You can always draw. Saved at once.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={playersMayDrawShown ?? campaign.playersMayDraw ?? true}
                  aria-labelledby="cs-players-may-draw"
                  onClick={() => void handlePlayersMayDraw(!(playersMayDrawShown ?? campaign.playersMayDraw ?? true))}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${SWITCH_PRESS} ${
                    (playersMayDrawShown ?? campaign.playersMayDraw ?? true) ? 'bg-moss-green' : 'bg-warm-gray/30'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      (playersMayDrawShown ?? campaign.playersMayDraw ?? true) ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* ── Export ── */}
              <div className="pt-4 mt-4 border-t border-moss-green/15 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-stone-gray">
                  <Download className="w-4 h-4 text-brand-ink" />
                  Export Campaign
                </div>
                <p className="text-xs text-warm-gray">
                  Download a <span className="font-mono">.cozyvtt</span> archive containing maps, creatures,
                  token templates, and all associated assets. Character data is not included for privacy.
                </p>

                <div className="flex items-center justify-between">
                  <div>
                    <p id="cs-export-audio" className="text-sm text-stone-gray">Include audio assets</p>
                    <p className="text-xs text-warm-gray">The tracks your atmosphere plays</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={exportIncludeAudio}
                    aria-labelledby="cs-export-audio"
                    onClick={() => setExportIncludeAudio((v) => !v)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${SWITCH_PRESS} ${
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

                <Button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  variant="secondary" className="w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </Button>
              </div>
            </div>
          )}

          {/* ════ CHAT TAB ════ */}
          {activeTab === 'chat' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-moss-green/5 border border-moss-green/15">
                <MessageCircle className="w-5 h-5 text-brand-ink shrink-0 mt-0.5" />
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-hidden focus:ring-2 focus:ring-moss-green/50 ${
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
                <Button
                  type="button"
                  onClick={handleSaveChat}
                  disabled={savingChat}
                  className="flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </Button>
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
                {isDmViewer && (
                <Button
                  type="button"
                  onClick={() => { setInviteKey((k) => k + 1); setShowInviteModal(true); }}
                  variant="secondary" className="flex items-center gap-2 text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite Player
                </Button>
                )}
              </div>

              {/* Member list */}
              <div className="space-y-2">
                {memberships.map((membership) => {
                  const isSelf = membership.userId === user?.id;
                  const isDm = membership.role === 'DM';
                  const isRemoving = removingMemberId === membership.userId;
                  const pendingRole = pendingRoles[membership.userId];
                  const memberName = membership.user?.displayName ?? 'this member';

                  // The controls go under the name when they do not fit beside it.
                  return (
                    <div
                      key={membership.userId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 rounded-lg bg-parchment/50 border border-moss-green/10"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 basis-40">
                        <div className="w-8 h-8 rounded-full bg-moss-green/15 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-brand-ink uppercase">
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
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-auto">
                        {/* Role: a picker for the DM beside everyone but
                            themselves, the campaign's owner included; a
                            badge otherwise */}
                        {isDmViewer && !isDm ? (
                          <select
                            aria-label={`Role of ${memberName}`}
                            value={pendingRole ?? membership.role}
                            disabled={pendingRole !== undefined || isRemoving}
                            onChange={(e) => {
                              const role = roleChoice(e.target.value);
                              if (role) void handleChangeRole(membership, role);
                            }}
                            className="touch-target rounded-cozy border border-ink-muted/30 bg-paper/80 px-2 py-1 text-xs font-medium text-ink focus:outline-hidden focus:ring-2 focus:ring-brand disabled:opacity-60"
                          >
                            {ROLE_CHOICES.map((role) => (
                              <option key={role} value={role}>{CAMPAIGN_ROLE_LABEL[role]}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                              isDm
                                ? 'bg-spirit-purple/10 text-spirit-ink border-spirit-purple/20'
                                : membership.role === 'SPECTATOR'
                                ? 'bg-stone-gray/10 text-stone-gray border-stone-gray/20'
                                : 'bg-moss-green/10 text-brand-ink border-moss-green/20'
                            }`}
                          >
                            {isDm ? (
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                {CAMPAIGN_ROLE_LABEL[membership.role]}
                              </span>
                            ) : (
                              CAMPAIGN_ROLE_LABEL[membership.role]
                            )}
                          </span>
                        )}

                        {/* Hand over the game. Offered on anyone who is
                            not already the DM, including a spectator. */}
                        {!isDm && (
                          <button
                            type="button"
                            onClick={() => setMemberToPromote(membership)}
                            disabled={promotingMemberId === membership.userId}
                            title={`Make ${membership.user?.displayName ?? 'this player'} the DM`}
                            className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-spirit-ink hover:bg-spirit-purple/10 transition-colors disabled:opacity-40"
                            aria-label={`Make ${membership.user?.displayName} the Dungeon Master`}
                          >
                            {promotingMemberId === membership.userId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Crown className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        {/* Remove button: not for yourself, the DM or the owner */}
                        {isDmViewer && mayRemove(membership) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMemberClick(membership)}
                            disabled={isRemoving}
                            className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-danger-ink hover:text-danger-ink hover:bg-danger/10 transition-colors disabled:opacity-40"
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

              {/* Invitations that still stand: who has been asked, until when */}
              {isDmViewer && invitations.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-stone-gray uppercase tracking-wide">Invited</h3>
                  {invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-parchment/30 border border-dashed border-moss-green/20"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-black truncate">{invitation.user.displayName}</p>
                        <p className="text-xs text-stone-gray">
                          {invitation.expiresAt
                            ? `Invited, until ${new Date(invitation.expiresAt).toLocaleDateString()}`
                            : 'Invited'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleWithdrawInvitation(invitation)}
                        disabled={withdrawingId === invitation.id}
                        className="touch-target inline-flex items-center justify-center p-1.5 rounded-lg text-danger-ink hover:bg-danger/10 transition-colors disabled:opacity-40"
                        aria-label={`Withdraw the invitation to ${invitation.user.displayName}`}
                        title="Withdraw the invitation"
                      >
                        {withdrawingId === invitation.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════ DANGER ZONE TAB ════ */}
          {activeTab === 'danger' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-danger/10 border border-danger/30">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-danger-ink mb-1">Delete Campaign</h3>
                    <p className="text-sm text-danger-ink">
                      Permanently deletes this campaign and all associated maps, tokens, chat
                      history, and session records. Characters and uploaded assets are{' '}
                      <strong>not</strong> deleted: characters stay with their owners, and each
                      uploaded file moves to the personal library of whoever uploaded it.
                    </p>
                    <p className="text-sm text-danger-ink mt-2">
                      This action <strong>cannot be undone</strong>.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="cs-delete-confirm"
                      className="block text-sm font-semibold text-danger-ink mb-1.5"
                    >
                      Type <span className="font-mono bg-danger/10 px-1 rounded-sm">{campaign.name}</span> to confirm:
                    </label>
                    <input
                      id="cs-delete-confirm"
                      type="text"
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      className="input-cozy w-full border-danger/30 focus:border-danger/60 focus:ring-danger/20"
                      placeholder={campaign.name}
                      autoComplete="off"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!deleteNameMatches || deletingCampaign}
                    variant="danger" className="w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlideOver>

      {/* Remove member confirm dialog, named for the member's role */}
      <ConfirmDialog
        isOpen={!!memberToRemove}
        title={`Remove ${removingRole}`}
        message={`Remove ${memberToRemove?.user?.displayName ?? `this ${removingRole.toLowerCase()}`} from "${campaign.name}"? They will lose access to the campaign immediately.`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmRemoveMember}
        onCancel={() => setMemberToRemove(null)}
      />

      {/* Transfer DM confirm dialog */}
      <ConfirmDialog
        isOpen={!!memberToPromote}
        title="Hand over the DM role"
        message={`Make ${memberToPromote?.user?.displayName ?? 'this player'} the DM of "${campaign.name}"? They get the DM's controls and you become a player. You stay in the campaign, and this does not change who owns it — you can be made DM again later.`}
        confirmLabel="Make them DM"
        cancelLabel="Cancel"
        onConfirm={handleConfirmMakeDm}
        onCancel={() => setMemberToPromote(null)}
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
      {/* Mounted from its first opening on, so it fades out on close. */}
      {inviteKey > 0 && (
        <InvitePlayerModal
          key={inviteKey}
          open={showInviteModal}
          campaignId={campaign.id}
          onClose={() => setShowInviteModal(false)}
          // The invite dialog says it was sent. Nothing on the campaign
          // changes until it is accepted, which the roster hears about; the
          // new invitation joins the Invited list.
          onSuccess={() => { setShowInviteModal(false); void loadInvitations(); }}
        />
      )}
    </>
  );
}
