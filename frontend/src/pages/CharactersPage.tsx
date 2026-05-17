// ============================================
// Characters Page
// Character library management for players
// ============================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Plus, LogOut, Loader2, RefreshCw, User as UserIcon, Upload } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import characterService from '@/services/character.service';
import campaignService from '@/services/campaign.service';
import CharacterCard from '@/components/character/CharacterCard';
import NewCharacterModal from '@/components/character/NewCharacterModal';
import DeleteCharacterModal from '@/components/character/DeleteCharacterModal';
import AssignCharacterModal from '@/components/character/AssignCharacterModal';
import ImportCharacterModal from '@/components/character/ImportCharacterModal';
import type { Character, Campaign } from '@/types';

export default function CharactersPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mascotUrl } = useTheme();

  const [characters, setCharacters] = useState<Character[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);

  // Load characters and campaigns on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const [charactersData, campaignsData] = await Promise.all([
        characterService.getCharacters(),
        campaignService.getCampaigns(),
      ]);

      setCharacters(charactersData);
      setCampaigns(campaignsData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load characters');
    } finally {
      setLoading(false);
    }
  };

  const handleCharacterCreated = (newCharacter: Character) => {
    setCharacters([newCharacter, ...characters]);
    showSuccess('Character created successfully!');
    // Note: For now we just close the modal.
  };

  const handleEdit = (character: Character) => {
    navigate(`/characters/${character.id}/edit`);
  };

  const handleCopy = async (character: Character) => {
    try {
      const copiedCharacter = await characterService.copyCharacter(character.id);
      setCharacters([copiedCharacter, ...characters]);
      showSuccess(`${character.name} copied successfully`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to copy character');
    }
  };

  const handleDeleteClick = (character: Character) => {
    setSelectedCharacter(character);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async (characterId: string) => {
    try {
      await characterService.deleteCharacter(characterId);
      setCharacters(characters.filter((c) => c.id !== characterId));
      showSuccess('Character deleted successfully');
      setShowDeleteModal(false);
      setSelectedCharacter(null);
    } catch (err: any) {
      throw err; // Let modal handle the error display
    }
  };

  const handleAssignClick = (character: Character) => {
    setSelectedCharacter(character);
    setShowAssignModal(true);
  };

  const handleAssignConfirm = async (characterId: string, campaignId: string | null) => {
    try {
      let updatedCharacter: Character;

      if (campaignId) {
        updatedCharacter = await characterService.assignCharacter(characterId, campaignId);
        const campaign = campaigns.find((c) => c.id === campaignId);
        showSuccess(`Assigned to ${campaign?.name || 'campaign'}`);
      } else {
        updatedCharacter = await characterService.unassignCharacter(characterId);
        showSuccess('Character unassigned');
      }

      // Update character in list
      setCharacters(
        characters.map((c) => (c.id === characterId ? updatedCharacter : c))
      );

      setShowAssignModal(false);
      setSelectedCharacter(null);
    } catch (err: any) {
      throw err; // Let modal handle the error display
    }
  };

  const handleExport = (character: Character) => {
    characterService.exportCharacterJSON(character);
    showSuccess(`Exported ${character.name}`);
  };

  const handleImport = async (data: { name: string; gameSystem: string | null; data: any }) => {
    try {
      const importedCharacter = await characterService.createCharacter({
        name: data.name,
        data: data.data,
        gameSystem: data.gameSystem as import('@/types').GameSystem | null,
      });

      setCharacters([importedCharacter, ...characters]);
      showSuccess(`${data.name} imported successfully`);
    } catch (err: any) {
      throw err; // Let modal handle the error display
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const showSuccess = (message: string) => {
    showToast(message, 'success');
  };

  // Get campaign for a character
  const getCharacterCampaign = (character: Character): Campaign | null => {
    if (!character.campaignId) return null;
    return campaigns.find((c) => c.id === character.campaignId) || null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <header className="bg-moss-green/10 border-b border-moss-green/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            {/* Left: Logo + Title */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-lg bg-moss-green/10 hover:bg-moss-green/20 transition-colors"
              >
                <img src={mascotUrl} alt="CozyVTT" className="w-10 h-10 object-contain" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-moss-green font-heading">
                  My Characters
                </h1>
                <p className="text-sm text-warm-gray">
                  Manage your character library
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-secondary flex items-center gap-2"
              >
                <span className="hidden sm:inline">Back to Dashboard</span>
                <span className="sm:hidden">Dashboard</span>
              </button>

              <button
                onClick={loadData}
                disabled={loading}
                className="btn-secondary flex items-center gap-2"
                aria-label={loading ? 'Refreshing characters' : 'Refresh characters'}
                aria-busy={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleLogout}
                className="btn-danger flex items-center gap-2"
                aria-label="Log out of CozyVTT"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">


          {/* Create Character Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-moss-green font-heading">
                Your Characters
                {!loading && (
                  <span className="text-lg text-warm-gray ml-2">
                    ({characters.length})
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Import
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create Character
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4">
                <p className="text-sm text-spirit-red font-medium">{error}</p>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-12 h-12 text-moss-green animate-spin mb-4" />
                <p className="text-stone-gray">Loading your characters...</p>
              </div>
            )}

            {/* Empty State */}
            {!loading && characters.length === 0 && (
              <div className="glass-panel p-12 text-center">
                <div className="max-w-md mx-auto">
                  <div className="mb-4 inline-block p-4 rounded-full bg-moss-green/10">
                    <UserIcon className="w-12 h-12 text-moss-green" />
                  </div>
                  <h3 className="text-xl font-semibold text-moss-green mb-2">
                    No characters yet
                  </h3>
                  <p className="text-warm-gray mb-6">
                    Create your first character to get started! You can create characters
                    for any of your campaigns or prepare them for future adventures.
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn-primary inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Create Your First Character
                  </button>
                </div>
              </div>
            )}

            {/* Character Grid */}
            {!loading && characters.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {characters.map((character) => (
                  <CharacterCard
                    key={character.id}
                    character={character}
                    campaign={getCharacterCampaign(character)}
                    onEdit={handleEdit}
                    onCopy={handleCopy}
                    onDelete={handleDeleteClick}
                    onAssign={handleAssignClick}
                    onExport={handleExport}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Character Stats (if characters exist) */}
          {!loading && characters.length > 0 && (
            <section className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-moss-green mb-4">
                Quick Stats
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center p-4 rounded-lg bg-moss-green/5">
                  <p className="text-3xl font-bold text-moss-green">
                    {characters.filter((c) => c.campaignId).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">Assigned to Campaigns</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-spirit-purple/5">
                  <p className="text-3xl font-bold text-spirit-purple">
                    {characters.filter((c) => !c.campaignId).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">Unassigned</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-warm-amber/5">
                  <p className="text-3xl font-bold text-warm-amber">
                    {characters.filter((c) => c.gameSystem).length}
                  </p>
                  <p className="text-sm text-warm-gray mt-1">With Game System</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Modals */}
      <NewCharacterModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCharacterCreated}
      />

      <DeleteCharacterModal
        isOpen={showDeleteModal}
        character={selectedCharacter}
        campaign={selectedCharacter ? getCharacterCampaign(selectedCharacter) : null}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedCharacter(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <AssignCharacterModal
        isOpen={showAssignModal}
        character={selectedCharacter}
        currentCampaign={selectedCharacter ? getCharacterCampaign(selectedCharacter) : null}
        onClose={() => {
          setShowAssignModal(false);
          setSelectedCharacter(null);
        }}
        onConfirm={handleAssignConfirm}
      />

      {showImportModal && (
        <ImportCharacterModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          existingCharacterNames={characters.map((c) => c.name)}
        />
      )}
    </div>
  );
}
