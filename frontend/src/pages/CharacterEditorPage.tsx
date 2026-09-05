// ============================================
// Character Editor Page
// Allows editing characters for any game system
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Loader2, Lock, Download, FileText } from 'lucide-react';
import NewCharacterTemplateModal from '@/components/character/NewCharacterTemplateModal';
import CharacterSheetSkeleton from '@/components/skeletons/CharacterSheetSkeleton';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import characterService from '@/services/character.service';
import campaignService from '@/services/campaign.service';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import type { Character, Campaign } from '@/types';
import Button from '@/components/ui/Button';
import { apiErrorMessage, apiValidationIssues, errorMessage } from '@/utils/errors';
import type { CharacterData } from '@/types';

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
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Whether the sheet currently holds edits that have not been saved. Reported
  // by the sheet itself, which is the only thing that knows: it owns the form
  // state. Reset on save and whenever the sheet returns to view mode.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);


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
      } catch (err: unknown) {
        console.error('Failed to fetch character:', err);
        setError(errorMessage(err) || 'Failed to load character');
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
    async (data: CharacterData, doShowToast = true, tokenImageUrl?: string) => {
      if (!character) return;

      try {
        setSaving(true);

        // Update character via API
        //
        // `name` is deliberately not sent. The sheet carries its own name field,
        // and the server derives the `name` column from it — but only when the
        // request doesn't name it explicitly. Passing `character.name` here sent
        // the *old* column value on every save, which counted as an explicit
        // name and suppressed the sync, so renaming on the sheet never reached
        // the gallery or the title bar from this page.
        // Use the new tokenImageUrl if provided, otherwise keep the existing one
        const updated = await characterService.updateCharacter(character.id, {
          data,
          tokenImageUrl: tokenImageUrl !== undefined ? tokenImageUrl : (character.tokenImageUrl || undefined),
        });

        // Update local state
        setCharacter(updated);
        setLastSaved(new Date());

        if (doShowToast) {
          showToast('Character saved!', 'success');
        }
      } catch (err: unknown) {
        console.error('Failed to save character:', err);

        // Show detailed validation errors if available
        const validationErrors = apiValidationIssues(err);
        if (validationErrors) {
          const errorMessages = validationErrors.map((e) => `${e.path}: ${e.message}`).join('\n');
          setError(`Validation errors:\n${errorMessages}`);
          console.error('Validation errors:', validationErrors);
        } else {
          setError(apiErrorMessage(err) || errorMessage(err) || 'Failed to save character');
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
    async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
      // Log the data being saved for debugging
      console.log('Saving character data:', data);

      // Save immediately when user clicks save in character sheet
      // Pass tokenImageUrl through so token images are persisted
      await handleSave(data, showToast ?? true, tokenImageUrl);
    },
    [handleSave]
  );

  // ============================================
  // Unsaved Changes Warning
  // ============================================

  // Warn before closing or refreshing the tab. This was previously removed
  // because `hasUnsavedChanges` was never set, making it dead code that could
  // only ever be a no-op. Now that the sheet reports its dirty state the guard
  // is meaningful again — and it covers the one exit route the in-app
  // confirmation cannot: the browser's own close and reload.
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Both lines are deliberate: `preventDefault()` is what current browsers
      // act on, and `returnValue` — deprecated but not removed — is what older
      // ones still require. Setting only one leaves a gap somewhere.
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ============================================
  // Navigation Handlers
  // ============================================

  /**
   * Confirm before leaving, but only with unsaved work.
   *
   * The flag comes from the sheet via `onDirtyChange`, because the sheet owns
   * the form state and is the only thing that knows. It went through two wrong
   * shapes first: originally nothing ever set it, so the guard could never fire
   * and the back arrow discarded edits silently; then it warned unconditionally,
   * which asked even straight after a save — the sheet drops back to view mode
   * once saved, so people were being warned about losing nothing.
   */
  const handleBack = () => {
    // Only ask when there is genuinely something to lose. Warning
    // unconditionally meant the prompt appeared after a successful save, and
    // even when merely viewing — which teaches people to click through it.
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
          <h2 className="text-2xl font-bold text-brand-ink mb-2">
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
          <h2 className="text-2xl font-bold text-brand-ink mb-2">
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
              <ArrowLeft className="w-5 h-5 text-brand-ink" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-brand-ink">
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
            {/* Save Status. The sheet reports its dirty state via
                `onDirtyChange`, but that is used only to gate the leave
                confirmation — there is deliberately no persistent "unsaved
                changes" badge here, since the sheet's own Save button is
                already the thing you would reach for. */}
            {saving && (
              <span className="text-sm text-brand-ink flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </span>
            )}
            {lastSaved && !hasUnsavedChanges && (
              <span className="text-sm text-stone-gray">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}

            {/* No Save button here on purpose. The sheet renders its own, and a
                second one in this header was both a duplicate and permanently
                disabled. Whatever hosts a sheet leaves Save, Cancel and Edit to
                the sheet itself. */}

            {/* Save as Template — publishes this sheet for everyone to copy */}
            <Button
              onClick={() => setShowSaveAsTemplate(true)}
              variant="secondary" className="flex items-center gap-2"
              title="Publish this sheet as a template others can copy"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Save as Template</span>
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
          onDirtyChange={setHasUnsavedChanges}
          character={character}
          mode="edit"
          onSave={handleSheetSave}
          onCancel={handleCancel}
        />
      </div>
    </div>

    {showSaveAsTemplate && character && (
      <NewCharacterTemplateModal
        initial={{
          name: character.name,
          gameSystem: character.gameSystem,
          data: character.data,
          tokenImageUrl: character.tokenImageUrl,
        }}
        onClose={() => setShowSaveAsTemplate(false)}
        onCreated={() => setShowSaveAsTemplate(false)}
      />
    )}
    </>
  );
}
