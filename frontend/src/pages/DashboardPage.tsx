// ============================================
// Dashboard Page
// Campaign list and main navigation hub
// Protected route - requires authentication
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, LogOut, RefreshCw, User, ArrowRight, Mail, FolderOpen, Shield, AlertCircle, Upload } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useCampaignsQuery, useCharactersQuery, usePendingInvitationsQuery, queryKeys } from '@/hooks/queries';
import CampaignCard from '@/components/CampaignCard';
import CreateCampaignModal from '@/components/CreateCampaignModal';
import CampaignImportDialog from '@/components/campaign/CampaignImportDialog';
import InvitationModal from '@/components/campaign/InvitationModal';
import CampaignCardSkeleton from '@/components/skeletons/CampaignCardSkeleton';
import type { Campaign, CampaignInvitation } from '@/types';
import { CampaignRole, PlatformRole } from '@/types';
import Button from '@/components/ui/Button';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mascotUrl } = useTheme();

  const [selectedInvitation, setSelectedInvitation] = useState<CampaignInvitation | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Server resources via react-query — cached, deduped, refetched on
  // network reconnect (client defaults in lib/queryClient.ts).
  const queryClient = useQueryClient();
  const campaignsQuery = useCampaignsQuery();
  const charactersQuery = useCharactersQuery();
  const invitationsQuery = usePendingInvitationsQuery();

  const campaigns = campaignsQuery.data ?? [];
  const characters = charactersQuery.data ?? [];
  const invitations = invitationsQuery.data ?? [];
  const loading = campaignsQuery.isPending || charactersQuery.isPending || invitationsQuery.isPending;
  const queryError = campaignsQuery.error || charactersQuery.error || invitationsQuery.error;
  const error = queryError
    ? ((queryError as any).response?.data?.message || 'Failed to load data')
    : '';

  // Refresh button + post-invitation-response resync
  const loadData = () => {
    campaignsQuery.refetch();
    charactersQuery.refetch();
    invitationsQuery.refetch();
  };

  const handleCampaignCreated = (newCampaign: Campaign) => {
    queryClient.setQueryData<Campaign[]>(queryKeys.campaigns, (prev) => [newCampaign, ...(prev ?? [])]);
    showToast(`Campaign "${newCampaign.name}" created!`, 'success');
  };

  const handleLogout = async () => {
    await logout();
  };

  // Get user's role in a campaign
  const getUserRole = (campaign: Campaign): CampaignRole => {
    const membership = campaign.memberships?.find(m => m.userId === user?.id);
    return membership?.role || CampaignRole.PLAYER;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <header className="bg-moss-green/10 border-b border-moss-green/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-4">
              <div className="p-1 rounded-lg bg-moss-green/10" aria-hidden="true">
                <img src={mascotUrl} alt="" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-brand-ink font-heading">
                  CozyVTT
                </h1>
                <p className="text-sm text-warm-gray">
                  Welcome back, {user?.displayName}
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={loadData}
                disabled={loading}
                variant="secondary" className="flex items-center gap-2"
                aria-label={loading ? 'Refreshing data' : 'Refresh data'}
                aria-busy={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>

              {user?.platformRole === PlatformRole.ADMIN && (
                <Button
                  onClick={() => navigate('/admin')}
                  variant="secondary" className="flex items-center gap-2"
                  aria-label="Go to Admin Panel"
                >
                  <Shield className="w-4 h-4 text-brand-ink" aria-hidden="true" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              )}

              <Button
                onClick={handleLogout}
                variant="danger" className="flex items-center gap-2"
                aria-label="Log out of CozyVTT"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Logout</span>
              </Button>

              {/* Profile Avatar Button */}
              <button
                onClick={() => navigate('/profile')}
                aria-label={`View profile for ${user?.displayName ?? 'your account'}`}
                className="w-12 h-12 rounded-full border-2 border-moss-green/30 hover:border-moss-green/60 transition-colors overflow-hidden flex items-center justify-center bg-moss-green/10 flex-shrink-0"
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-6 h-6 text-brand-ink" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Quick Links Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Characters Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-spirit-purple/10">
                    <User className="w-6 h-6 text-spirit-purple" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      Your Characters
                    </h2>
                    <p className="text-sm text-warm-gray">
                      {loading ? 'Loading...' : `${characters.length} character${characters.length !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/characters')}
                  className="flex items-center gap-2"
                >
                  <span className="hidden sm:inline">Manage</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Characters loading skeleton */}
              {loading && (
                <div className="mt-4 space-y-3 animate-pulse">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="p-3 rounded-lg bg-parchment/50 border border-moss-green/10 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-moss-green/10 flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-4 w-2/3 bg-moss-green/15 rounded" />
                        <div className="h-3 w-1/3 bg-stone-gray/10 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent Characters Preview */}
              {!loading && characters.length > 0 && (
                <div className="mt-4">
                  <div className="grid grid-cols-1 gap-3">
                    {characters.slice(0, 2).map((character) => (
                      <div
                        key={character.id}
                        className="p-3 rounded-lg bg-parchment/50 border border-moss-green/20
                                 hover:border-moss-green/40 transition-colors cursor-pointer"
                        onClick={() => navigate('/characters')}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-moss-green/10 border border-moss-green/30
                                        flex items-center justify-center overflow-hidden flex-shrink-0">
                            {character.tokenImageUrl ? (
                              <img
                                src={character.tokenImageUrl}
                                alt={character.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-5 h-5 text-brand-ink" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-stone-gray truncate text-sm">
                              {character.name}
                            </p>
                            <p className="text-xs text-warm-gray truncate">
                              {character.gameSystem || 'Flexible'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {characters.length > 2 && (
                    <p className="text-sm text-warm-gray mt-3 text-center">
                      And {characters.length - 2} more...
                    </p>
                  )}
                </div>
              )}

              {!loading && characters.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-warm-gray mb-3 text-sm">No characters yet</p>
                  <Button
                    onClick={() => navigate('/characters')}
                    variant="secondary" className="inline-flex items-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Create Character
                  </Button>
                </div>
              )}
            </section>

            {/* Assets Library Section */}
            <section className="glass-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-warm-amber/10">
                    <FolderOpen className="w-6 h-6 text-warm-amber" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-brand-ink font-heading">
                      Asset Library
                    </h2>
                    <p className="text-sm text-warm-gray">
                      Maps, tokens, and more
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/assets')}
                  className="flex items-center gap-2"
                >
                  <span className="hidden sm:inline">View Library</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 mt-4">
                <div
                  className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20
                           hover:border-moss-green/40 transition-colors cursor-pointer text-center"
                  onClick={() => navigate('/assets')}
                >
                  <FolderOpen className="w-8 h-8 mx-auto mb-2 text-warm-amber/60" />
                  <p className="text-sm font-medium text-brand-ink mb-1">
                    Manage Your Assets
                  </p>
                  <p className="text-xs text-warm-gray">
                    Upload and organize maps, tokens, audio, and avatar images
                  </p>
                </div>
              </div>
            </section>
          </div>

          {/* Pending Invitations Section */}
          {!loading && invitations.length > 0 && (
            <section className="glass-panel p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-moss-green/10">
                  <Mail className="w-6 h-6 text-brand-ink" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-brand-ink font-heading">
                    Pending Invitations
                  </h2>
                  <p className="text-sm text-warm-gray">
                    You have {invitations.length} pending campaign invitation{invitations.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="p-4 rounded-lg bg-parchment/50 border border-moss-green/20 hover:border-moss-green/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedInvitation(invitation)}
                  >
                    <h3 className="font-semibold text-brand-ink mb-1">
                      {invitation.campaign?.name}
                    </h3>
                    {invitation.campaign?.description && (
                      <p className="text-sm text-warm-gray mb-2 line-clamp-2">
                        {invitation.campaign.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-warm-gray">
                      <span>
                        DM: {invitation.campaign?.owner?.displayName}
                      </span>
                      <button className="text-brand-ink hover:underline font-medium">
                        View Invitation →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Campaigns Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-brand-ink font-heading">
                Your Campaigns
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowImportDialog(true)}
                  variant="secondary" className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Import</span>
                </Button>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Campaign
                </Button>
              </div>
            </div>

            {/* Error Message */}
            {error && !loading && (
              <div className="mb-6 bg-danger/10 border border-danger/20 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-danger-ink flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-danger-ink font-medium">{error}</p>
                </div>
                <Button
                  onClick={loadData}
                  variant="secondary" className="text-xs py-1 px-3 flex-shrink-0"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Loading State — skeleton cards */}
            {loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <CampaignCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && campaigns.length === 0 && (
              <div className="glass-panel p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="mb-4 inline-block p-4 rounded-full bg-moss-green/10">
                    <img src={mascotUrl} alt="" className="w-12 h-12 object-contain" />
                  </div>
                  <h3 className="text-xl font-semibold text-brand-ink mb-2">
                    No campaigns yet
                  </h3>
                  <p className="text-warm-gray mb-6">
                    Create your first campaign to begin your adventure! As a DM, you'll be able
                    to invite players, create maps, and manage game sessions.
                  </p>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Campaign
                  </Button>
                </div>
              </div>
            )}

            {/* Campaign Grid */}
            {!loading && campaigns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    userRole={getUserRole(campaign)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Campaign Stats (if campaigns exist) */}
          {!loading && campaigns.length > 0 && (
            <section className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-brand-ink mb-4">
                Quick Stats
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-moss-green/5">
                  <p className="text-3xl font-bold text-brand-ink">
                    {campaigns.filter(c => getUserRole(c) === CampaignRole.DM).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">Campaigns as DM</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-spirit-purple/5">
                  <p className="text-3xl font-bold text-spirit-purple">
                    {campaigns.filter(c => getUserRole(c) === CampaignRole.PLAYER).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">Campaigns as Player</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-warm-amber/5">
                  <p className="text-3xl font-bold text-warm-amber">
                    {campaigns.filter(c => c.status === 'ACTIVE').length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">Active Campaigns</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCampaignCreated}
      />

      {/* Import Campaign Dialog */}
      <CampaignImportDialog
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={loadData}
      />

      {/* Invitation Modal */}
      {selectedInvitation && (
        <InvitationModal
          invitation={selectedInvitation}
          onClose={() => setSelectedInvitation(null)}
          onAccept={() => {
            setSelectedInvitation(null);
            loadData(); // Refresh data to show new campaign membership
          }}
          onDecline={() => {
            setSelectedInvitation(null);
            loadData(); // Refresh data to remove invitation
          }}
        />
      )}
    </div>
  );
}
