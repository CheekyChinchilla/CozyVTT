// ============================================
// Character Editor Page
// Allows editing characters for any game system
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, AlertCircle, Loader2, Lock, Download } from 'lucide-react';
import CharacterSheetSkeleton from '@/components/skeletons/CharacterSheetSkeleton';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import characterService from '@/services/character.service';
import campaignService from '@/services/campaign.service';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import type { Character, Campaign } from '@/types';
import Button from '@/components/ui/Button';

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // State
  const [character, setCharacter] = useState<Character | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingDataRef = useRef<any>(null);

  // ============================================
  // Fetch Character & Check Permissions
  // ============================================

  useEffect(() => {
    if (!id || !user) return;

    const fetchCharacter = async () => {
      try {
        setLoading(true);
        setError(null);
        setPermissionError(null);

        // Fetch character
        const fetchedCharacter = await characterService.getCharacter(id);
        setCharacter(fetchedCharacter);

        // Check permissions
        const canEdit = await checkEditPermission(fetchedCharacter);
        if (!canEdit) {
          setPermissionError(
            'You do not have permission to edit this character. Only the owner or the DM of the assigned campaign can edit characters.'
          );
          return;
        }

        // Fetch campaign if character is assigned
        if (fetchedCharacter.campaignId) {
          try {
            const fetchedCampaign = await campaignService.getCampaign(
              fetchedCharacter.campaignId
            );
            setCampaign(fetchedCampaign);
          } catch (err) {
            console.warn('Failed to fetch campaign:', err);
            // Not critical - continue without campaign data
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch character:', err);
        setError(err.message || 'Failed to load character');
      } finally {
        setLoading(false);
      }
    };

    fetchCharacter();
  }, [id, user]);

  // ============================================
  // Permission Check
  // ============================================

  const checkEditPermission = async (char: Character): Promise<boolean> => {
    if (!user) return false;

    // User owns the character
    if (char.userId === user.id) {
      return true;
    }

    // Character is assigned to a campaign - check if user is the DM
    if (char.campaignId) {
      try {
        const camp = await campaignService.getCampaign(char.campaignId);
        if (camp.ownerId === user.id) {
          return true;
        }
      } catch (err) {
        console.error('Failed to check campaign permission:', err);
      }
    }

    return false;
  };

  // ============================================
  // Save Handler
  // ============================================

  const handleSave = useCallback(
    async (data: any, doShowToast = true, tokenImageUrl?: string) => {
      if (!character) return;

      try {
        setSaving(true);

        // Update character via API
        // Use the new tokenImageUrl if provided, otherwise keep the existing one
        const updated = await characterService.updateCharacter(character.id, {
          name: character.name,
          data,
          tokenImageUrl: tokenImageUrl !== undefined ? tokenImageUrl : (character.tokenImageUrl || undefined),
        });

        // Update local state
        setCharacter(updated);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        pendingDataRef.current = null;

        if (doShowToast) {
          showToast('Character saved!', 'success');
        }
      } catch (err: any) {
        console.error('Failed to save character:', err);
        console.error('Error response:', err.response?.data);

        // Show detailed validation errors if available
        if (err.response?.data?.validationErrors) {
          const validationErrors = err.response.data.validationErrors;
          const errorMessages = validationErrors.map((e: any) => `${e.path}: ${e.message}`).join('\n');
          setError(`Validation errors:\n${errorMessages}`);
          console.error('Validation errors:', validationErrors);
        } else {
          setError(err.response?.data?.message || err.message || 'Failed to save character');
        }
      } finally {
        setSaving(false);
      }
    },
    [character]
  );

  // ============================================
  // Character Sheet Save Handler (called by bottom save button)
  // ============================================

  const handleSheetSave = useCallback(
    async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
      // Log the data being saved for debugging
      console.log('Saving character data:', data);

      // Save immediately when user clicks save in character sheet
      // Pass tokenImageUrl through so token images are persisted
      await handleSave(data, showToast ?? true, tokenImageUrl);

      // Store for top save button reference
      pendingDataRef.current = data;
    },
    [handleSave]
  );

  // ============================================
  // Cleanup Auto-save Timer
  // ============================================

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // ============================================
  // Unsaved Changes Warning
  // ============================================

  // Warn user before closing/refreshing page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ============================================
  // Navigation Handlers
  // ============================================

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setConfirmLeave(true);
      return;
    }
    navigate('/characters');
  };

  const handleCancel = () => {
    handleBack();
  };

  // ============================================
  // Manual Save Handler
  // ============================================

  const handleManualSave = async () => {
    if (pendingDataRef.current) {
      await handleSave(pendingDataRef.current, true);
    }
  };

  // ============================================
  // Render
  // ============================================

  // Loading state — full-page skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
        <CharacterSheetSkeleton />
      </div>
    );
  }

  // Error state
  if (error || !character) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 p-4">
        <div className="glass-panel p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-spirit-red mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-moss-green mb-2">
            Failed to Load Character
          </h2>
          <p className="text-stone-gray mb-6">{error || 'Character not found'}</p>
          <Button onClick={() => navigate('/characters')}>
            Back to Characters
          </Button>
        </div>
      </div>
    );
  }

  // Permission denied state
  if (permissionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20 p-4">
        <div className="glass-panel p-8 max-w-md w-full text-center">
          <Lock className="w-12 h-12 text-sunset-orange mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-moss-green mb-2">
            Permission Denied
          </h2>
          <p className="text-stone-gray mb-6">{permissionError}</p>
          <Button onClick={() => navigate('/characters')}>
            Back to Characters
          </Button>
        </div>
      </div>
    );
  }

  // Main editor
  return (
    <>
    <ConfirmDialog
      isOpen={confirmLeave}
      title="Unsaved Changes"
      message="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
      confirmLabel="Leave"
      cancelLabel="Stay"
      variant="warning"
      onConfirm={() => navigate('/characters')}
      onCancel={() => setConfirmLeave(false)}
    />
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <div className="glass-panel m-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-lg hover:bg-moss-green/10 transition-colors"
              aria-label="Back to characters"
            >
              <ArrowLeft className="w-5 h-5 text-moss-green" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-moss-green">
                Editing: {character.name}
              </h1>
              {campaign && (
                <p className="text-sm text-stone-gray">
                  Campaign: {campaign.name}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Save Status */}
            {hasUnsavedChanges && (
              <span className="text-sm text-sunset-orange">Unsaved changes</span>
            )}
            {saving && (
              <span className="text-sm text-moss-green flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            )}
            {lastSaved && !hasUnsavedChanges && (
              <span className="text-sm text-stone-gray">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}

            {/* Manual Save Button */}
            <Button
              onClick={handleManualSave}
              disabled={!hasUnsavedChanges || saving}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>

            {/* Export Button */}
            <Button
              onClick={() => characterService.exportCharacterJSON(character)}
              variant="secondary" className="flex items-center gap-2"
              title="Export character as JSON"
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Character Sheet Editor */}
      <div className="p-4">
        <CharacterSheetRouter
          character={character}
          mode="edit"
          onSave={handleSheetSave}
          onCancel={handleCancel}
        />
      </div>
    </div>
    </>
  );
}
