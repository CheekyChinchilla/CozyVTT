/**
 * CharacterTemplatesPage
 * Browse, publish and copy shareable starter sheets.
 *
 * Every template on the instance is visible to every user — that is the point
 * of the feature. What varies is who may *edit* one: its author, an admin, or
 * a user holding the templateEditor permission.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Plus, Search, X, Loader2, Pencil, Trash2, Copy, Upload, User as UserIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useCharacterTemplatesQuery, storeCharacterInList } from '@/hooks/queries';
import { useToast } from '@/contexts/ToastContext';
import api from '@/services/api';
import { GameSystem, type CharacterTemplate } from '@/types';
import { canModifyTemplate } from '@/utils/templatePermissions';
import { GAME_SYSTEM_OPTIONS, GAME_SYSTEM_SHORT_LABELS } from '@/constants/game-systems';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import NewCharacterTemplateModal from '@/components/character/NewCharacterTemplateModal';
import CharacterTemplateEditorModal from '@/components/character/CharacterTemplateEditorModal';
import ImportCharacterModal from '@/components/character/ImportCharacterModal';

export default function CharacterTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<CharacterTemplate | null>(null);
  const [deleting, setDeleting] = useState<CharacterTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [usingId, setUsingId] = useState<string | null>(null);

  const templatesQuery = useCharacterTemplatesQuery({
    search: search || undefined,
    gameSystem: systemFilter || undefined,
    mine: mineOnly || undefined,
  });

  const templates = templatesQuery.data?.templates ?? [];

  /** Mirrors the server rule — see utils/templatePermissions. */
  const canModify = (template: CharacterTemplate) => canModifyTemplate(user, template);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['character-templates'] });

  /** Copy a template into a character owned by the current user. */
  const handleUse = async (template: CharacterTemplate) => {
    setUsingId(template.id);
    try {
      const created = await api.createCharacter({
        name: template.name,
        gameSystem: template.gameSystem ?? undefined,
        data: template.data as never,
        tokenImageUrl: template.tokenImageUrl ?? undefined,
      });
      storeCharacterInList(queryClient, created.character);
      showToast(`Created "${created.character.name}" from this template`, 'success');
      navigate(`/characters/${created.character.id}/edit`);
    } catch {
      showToast('Failed to create a character from this template', 'error');
    } finally {
      setUsingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await api.deleteCharacterTemplate(deleting.id);
      showToast('Template deleted', 'success');
      setDeleting(null);
      refresh();
    } catch {
      showToast('Failed to delete the template', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      <div className="bg-moss-green/10 border-b border-moss-green/20">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                onClick={() => navigate('/dashboard')}
                variant="secondary"
                className="flex items-center gap-2"
                title="Back to Dashboard"
              >
                <Home className="w-5 h-5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-brand-ink mb-2">Character Templates</h1>
                <p className="text-stone-gray">
                  Starter sheets shared across this instance — copy one, or publish your own
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* A character export is a sheet plus a game system, which is
                  exactly what a template holds — including one exported from a
                  different instance. */}
              <Button
                onClick={() => setShowImport(true)}
                variant="secondary"
                className="flex items-center gap-2"
                title="Publish a character JSON as a template"
              >
                <Upload className="w-5 h-5" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">New Template</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="bg-parchment/50 border border-moss-green/20 rounded-xl p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-gray/60" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                aria-label="Search templates"
                className="input-cozy w-full pl-9 pr-9"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-gray/60 hover:text-brand-ink"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              aria-label="Filter by game system"
              className="input-cozy lg:w-64"
            >
              <option value="">All game systems</option>
              {GAME_SYSTEM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              <option value="flexible">Flexible (No System)</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-stone-gray cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={mineOnly}
                onChange={(e) => setMineOnly(e.target.checked)}
                className="accent-moss-green"
              />
              Only mine
            </label>
          </div>
        </div>

        {templatesQuery.isPending ? (
          <div className="flex items-center justify-center py-16 text-stone-gray">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading templates...
          </div>
        ) : templatesQuery.error ? (
          <EmptyState
            title="Failed to load templates"
            description="Check your connection and try again."
            action={<Button onClick={() => templatesQuery.refetch()}>Try Again</Button>}
          />
        ) : templates.length === 0 ? (
          <EmptyState
            title={search || systemFilter || mineOnly ? 'No templates match your filters' : 'No templates yet'}
            description={
              search || systemFilter || mineOnly
                ? 'Try clearing the search or filters.'
                : 'Publish a starter sheet so others can build a character from it — useful for players who are new to the system, or who have not joined your campaign yet.'
            }
            action={
              !(search || systemFilter || mineOnly) && (
                <Button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Template
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <article
                key={template.id}
                className="bg-parchment/50 border border-moss-green/20 rounded-xl p-4 shadow-md hover:shadow-xl transition-shadow flex flex-col"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-moss-green/10 border border-moss-green/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {template.tokenImageUrl ? (
                      <img
                        src={template.tokenImageUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-5 h-5 text-brand-ink/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-brand-ink truncate">{template.name}</h2>
                    <p className="text-xs text-warm-gray truncate">
                      {template.gameSystem
                        ? GAME_SYSTEM_SHORT_LABELS[template.gameSystem as GameSystem]
                        : 'Flexible'}
                      {' · '}
                      {template.createdBy?.displayName ?? 'Unknown author'}
                    </p>
                  </div>
                </div>

                {template.description && (
                  <p className="text-sm text-stone-gray mb-4 line-clamp-3">{template.description}</p>
                )}

                <div className="flex items-center gap-2 mt-auto pt-2">
                  <Button
                    onClick={() => handleUse(template)}
                    loading={usingId === template.id}
                    className="flex items-center gap-1.5 flex-1"
                  >
                    <Copy className="w-4 h-4" />
                    Use
                  </Button>

                  {canModify(template) && (
                    <>
                      <Button
                        onClick={() => setEditing(template)}
                        variant="secondary"
                        iconOnly
                        aria-label={`Edit ${template.name}`}
                        title="Edit this template"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => setDeleting(template)}
                        variant="secondary"
                        iconOnly
                        aria-label={`Delete ${template.name}`}
                        title="Delete this template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <NewCharacterTemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {showImport && (
        <ImportCharacterModal
          mode="template"
          existingCharacterNames={templates.map((t) => t.name)}
          onClose={() => setShowImport(false)}
          onImport={async ({ name, gameSystem, data, description }) => {
            await api.createCharacterTemplate({ name, gameSystem, data, description });
            showToast('Template published from the imported file', 'success');
            refresh();
          }}
        />
      )}

      {editing && (
        <CharacterTemplateEditorModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete this template?"
        message={
          deleting
            ? `"${deleting.name}" will be removed for everyone. Characters already created from it are unaffected.`
            : ''
        }
        confirmLabel="Delete"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
