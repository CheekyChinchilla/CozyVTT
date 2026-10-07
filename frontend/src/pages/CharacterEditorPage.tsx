// ============================================
// Character Editor Page
// Allows editing characters for any game system
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { canEditCharacterIn, characterEditRefusal } from '@/services/permissions';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle, Loader2, Lock, Download, FileText } from 'lucide-react';
import NewCharacterTemplateModal from '@/components/character/NewCharacterTemplateModal';
import CharacterSheetSkeleton from '@/components/skeletons/CharacterSheetSkeleton';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import SignedOutNotice from '@/components/common/SignedOutNotice';
import { useUnsavedWorkGuard } from '@/hooks/useUnsavedWorkGuard';
import { reportSignedIn, reportSignedOut } from '@/services/unsavedWork';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import characterService from '@/services/character.service';
import { storeCharacterInList } from '@/hooks/queries';
import campaignService from '@/services/campaign.service';
import { CharacterSheetRouter } from '@/components/character-sheets/CharacterSheetRouter';
import type { Character, Campaign } from '@/types';
import Button from '@/components/ui/Button';
import { apiErrorMessage, apiValidationIssues, errorMessage } from '@/utils/errors';
import { isStaleCharacterSave } from '@/utils/staleCharacter';
import { useStaleSaveReapply } from '@/components/character/StaleSaveDialog';
import { isSignedOutSave, SIGNED_OUT_NOT_SAVED } from '@/utils/signedOut';
import type { CharacterData } from '@/types';

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

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
  const signedOut = useUnsavedWorkGuard(hasUnsavedChanges);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showSaveAsTemplate, setShowSaveAsTemplate] = useState(false);
  // The version the open editor's form was made from. `character` is the
  // newest version this page knows of, which is what the read-only sheet,
  // Export and Save as Template show; the two part company when a refused
  // save's changes are carried onto a newer version, until the editor closes.
  const editingFromRef = useRef<Character | null>(null);
  const characterRef = useRef(character);
  characterRef.current = character;
  const staleSave = useStaleSaveReapply();


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
          setPermissionError(characterEditRefusal(user, fetchedCharacter));
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
    if (!char.campaignId) return char.userId === user.id;

    // In a campaign, the rule is the campaign's: its DM may edit (the person
    // running the game now, not whoever created it), and an owner who is a
    // spectator there may not, as the server refuses the save. Should the
    // campaign not load, ownership alone decides and the server has the last
    // word.
    try {
      const camp = await campaignService.getCampaign(char.campaignId);
      return canEditCharacterIn(user, char, camp);
    } catch (err) {
      console.error('Failed to check campaign permission:', err);
      return char.userId === user.id;
    }
  };

  // ============================================
  // Save Handler
  // ============================================

  const handleSave = useCallback(
    async (data: CharacterData, doShowToast = true, tokenImageUrl?: string) => {
      if (!character) return;
      const editingFrom = editingFromRef.current ?? character;
      // Only a newly uploaded picture. Sending back the one this page loaded
      // would put it back if it had been changed since.
      const picture = tokenImageUrl !== undefined ? { tokenImageUrl } : {};

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
        let updated: Character;
        let carriedOver = false;
        try {
          updated = await characterService.updateCharacter(character.id, {
            data,
            // The version the sheet was opened on, so a save made after the
            // character changed elsewhere is refused and cannot undo that change.
            updatedAt: editingFrom.updatedAt,
            ...picture,
          });
        } catch (err: unknown) {
          // This page has no live connection, so hit points changed at the
          // table since it opened make its save stale. The editor stays as it
          // is, the user's changes are carried onto the newest version, and
          // that is saved once they say so.
          if (!isStaleCharacterSave(err)) throw err;
          const stored = await staleSave.reapply({
            opened: editingFrom.data,
            edited: data,
            withNewPicture: tokenImageUrl !== undefined,
            fetchLatest: () => characterService.getCharacter(character.id),
            onLatest: (latest) => {
              setCharacter(latest);
              storeCharacterInList(queryClient, latest);
            },
            save: (merged, updatedAt) =>
              characterService.updateCharacter(character.id, { data: merged, updatedAt, ...picture }),
          });
          if (!stored) throw err;
          updated = stored;
          carriedOver = true;
        }

        reportSignedIn();

        // Update local state, and the Characters page's list, which would
        // otherwise go on handing out the version from before this save.
        setCharacter(updated);
        storeCharacterInList(queryClient, updated);
        // An editor left open by typing during the save holds this version
        // plus that typing. After changes were carried over, its form is still
        // the older version's, so it keeps that one: another save is refused
        // and carried over in turn, and cannot put the older values back.
        if (!carriedOver) editingFromRef.current = updated;
        setLastSaved(new Date());

        if (doShowToast) {
          showToast('Character saved!', 'success');
        }
      } catch (err: unknown) {
        console.error('Failed to save character:', err);

        // Signed out meanwhile: the page has stayed put with the edits, and
        // the notice says how to save them.
        if (isSignedOutSave(err)) {
          reportSignedOut();
          showToast(SIGNED_OUT_NOT_SAVED, 'error');
          throw err;
        }

        // The user chose to keep editing; the dialog has said why.
        if (isStaleCharacterSave(err)) throw err;

        // Said in a toast, and thrown on so the sheet stays in edit mode with
        // everything typed into it. This used to set the page's load error,
        // which replaced the editor with "Failed to Load Character" and threw
        // the unsaved edits away.
        const validationErrors = apiValidationIssues(err);
        if (validationErrors) {
          const errorMessages = validationErrors.map((e) => `${e.path}: ${e.message}`).join('; ');
          showToast(`Not saved. ${errorMessages}`, 'error');
          console.error('Validation errors:', validationErrors);
        } else {
          showToast(apiErrorMessage(err) || errorMessage(err) || 'Failed to save character', 'error');
        }
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [character, showToast, queryClient, staleSave.reapply]
  );

  // ============================================
  // Character Sheet Save Handler (called by bottom save button)
  // ============================================

  const handleSheetSave = useCallback(
    async (data: CharacterData, showToast?: boolean, tokenImageUrl?: string) => {
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
        {signedOut && <SignedOutNotice />}
        <CharacterSheetRouter
          onDirtyChange={setHasUnsavedChanges}
          onEditStart={() => { editingFromRef.current = characterRef.current; }}
          character={character}
          mode="edit"
          onSave={handleSheetSave}
          onCancel={handleCancel}
        />
      </div>
    </div>

    {staleSave.dialog}

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
