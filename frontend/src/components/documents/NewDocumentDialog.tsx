/**
 * Write a text or Markdown document without uploading a file.
 *
 * For the things a DM makes on the fly: session notes, a handout, a house rule
 * decided at the table. Opened from the Documents page, where the scope is
 * chosen like an upload's; opened from inside a campaign, the scope is locked
 * to that campaign so members can read it as soon as it exists.
 *
 * What is typed is stored as typed. The server checks it is text and bounds
 * its size, and never interprets it. Making it harmless is the reader's job,
 * which renders Markdown with raw HTML off, and the serving route's, which
 * sends it as plain text.
 */

import { useEffect, useState } from 'react';
import { FilePlus, Loader2 } from 'lucide-react';
import { Modal, Button, Input, Textarea } from '@/components/ui';
import api from '@/services/api';
import { apiErrorMessage } from '@/utils/errors';
import { useAuth } from '@/contexts/AuthContext';
import { PlatformRole, AssetScope, type Asset } from '@/types';
import { assetScopeLabel } from '@/utils/assetUrl';
import { MAX_DOCUMENT_NAME_LENGTH, MAX_TYPED_DOCUMENT_BYTES } from '@/utils/documentLimits';

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (asset: Asset) => void;
  /** Fix the scope, and hide the picker. Used from inside a campaign. */
  lockedScope?: AssetScope;
  campaignId?: string;
}

export default function NewDocumentDialog({
  isOpen,
  onClose,
  onCreated,
  lockedScope,
  campaignId,
}: NewDocumentDialogProps) {
  const { user } = useAuth();
  const canUploadGlobal = user?.platformRole === PlatformRole.ADMIN || user?.globalAssetManager === true;

  const [name, setName] = useState('');
  const [format, setFormat] = useState<'md' | 'txt'>('md');
  const [content, setContent] = useState('');
  const [scope, setScope] = useState<AssetScope>(lockedScope ?? AssetScope.USER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setFormat('md');
    setContent('');
    setScope(lockedScope ?? AssetScope.USER);
    setError(null);
  }, [isOpen, lockedScope]);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { asset } = await api.createDocument({
        name: name.trim(),
        format,
        content,
        scope,
        campaignId: scope === 'CAMPAIGN' ? campaignId : undefined,
      });
      onCreated(asset);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err) ?? 'Could not create the document.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="New document"
      icon={FilePlus}
      size="lg"
      closeDisabled={saving}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave} className="flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FilePlus className="w-4 h-4" />}
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="text-xs text-danger-ink" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name, e.g. Session 3 notes"
            aria-label="Document name"
            className="flex-1"
            maxLength={MAX_DOCUMENT_NAME_LENGTH}
          />
          <div className="flex rounded-lg border border-moss-green/30 overflow-hidden flex-shrink-0" role="radiogroup" aria-label="Format">
            {(['md', 'txt'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={`px-3 py-2 text-sm ${format === f ? 'bg-moss-green/20 text-brand-ink font-medium' : 'text-ink-secondary hover:bg-surface'}`}
              >
                {f === 'md' ? 'Markdown' : 'Plain text'}
              </button>
            ))}
          </div>
        </div>

        {!lockedScope && (
          <div className="space-y-1">
            <span className="text-xs text-ink-secondary">Who can read it</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Scope">
              {(
                [
                  { value: AssetScope.USER, label: assetScopeLabel(AssetScope.USER), help: 'Yours alone until a DM shares it' },
                  ...(campaignId ? [{ value: AssetScope.CAMPAIGN, label: assetScopeLabel(AssetScope.CAMPAIGN), help: 'Members of this campaign' }] : []),
                  ...(canUploadGlobal ? [{ value: AssetScope.GLOBAL, label: assetScopeLabel(AssetScope.GLOBAL), help: 'Everyone on this instance' }] : []),
                ]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={scope === opt.value}
                  onClick={() => setScope(opt.value)}
                  title={opt.help}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${
                    scope === opt.value
                      ? 'border-moss-green bg-moss-green/10 text-brand-ink font-medium'
                      : 'border-moss-green/30 text-ink-secondary hover:bg-surface'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={format === 'md' ? '# Heading\n\nWrite in Markdown…' : 'Write here…'}
          aria-label="Document content"
          rows={14}
          className="w-full font-mono text-sm"
        />
        <p className="text-[11px] text-ink-secondary">
          Up to about {Math.round(MAX_TYPED_DOCUMENT_BYTES / 1024)} KB of text. Anything larger is a file to upload instead.
        </p>
      </div>
    </Modal>
  );
}
