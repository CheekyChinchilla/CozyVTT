/**
 * Import Character Modal
 *
 * Allows users to import characters from JSON files
 * with validation, preview, and name conflict handling.
 */

import { useState, useCallback } from 'react';
import { Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { readJSONFile, validateImportedCharacter } from '@/utils/character-export';
import GameSystemBadge from '@/components/common/GameSystemBadge';
import type { GameSystem } from '@/types';
import { Button, Modal } from '@/components/ui';
import { apiErrorMessage, errorMessage } from '@/utils/errors';
import type { CharacterData } from '@/types';

interface ImportCharacterModalProps {
  onClose: () => void;
  onImport: (data: {
    name: string;
    gameSystem: string | null;
    data: CharacterData;
    description?: string;
  }) => Promise<void>;
  existingCharacterNames: string[];
  /**
   * What the JSON is being imported as.
   *
   * The file format is identical either way — a character export *is* a sheet
   * plus a game system, which is exactly what a template holds. This only
   * changes the wording and, for templates, offers a description field. It
   * means a sheet exported from one instance can be published as a template on
   * another.
   */
  mode?: 'character' | 'template';
}

export default function ImportCharacterModal({
  onClose,
  onImport,
  existingCharacterNames,
  mode = 'character',
}: ImportCharacterModalProps) {
  const isTemplate = mode === 'template';
  const noun = isTemplate ? 'Template' : 'Character';

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    name: string;
    gameSystem: string | null;
    data: CharacterData;
  } | null>(null);
  const [nameConflict, setNameConflict] = useState(false);
  const [importName, setImportName] = useState('');
  const [importDescription, setImportDescription] = useState('');

  // Handle file selection
  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setPreviewData(null);
    setNameConflict(false);

    try {
      setIsLoading(true);
      const jsonData = await readJSONFile(selectedFile);
      const validation = validateImportedCharacter(jsonData);

      if (!validation.valid) {
        setError(validation.error || 'Invalid character data');
        return;
      }

      if (validation.character) {
        setPreviewData(validation.character);

        // Check for name conflict
        const characterName = validation.character.name;
        if (existingCharacterNames.includes(characterName)) {
          setNameConflict(true);
          setImportName(`${characterName} (Imported)`);
        } else {
          setImportName(characterName);
        }
      }
    } catch (err: unknown) {
      setError(errorMessage(err) || 'Failed to read file');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

  // Handle import
  const handleImport = async () => {
    if (!previewData) return;

    try {
      setIsLoading(true);
      setError(null);

      await onImport({
        name: importName,
        gameSystem: previewData.gameSystem,
        data: previewData.data,
        ...(isTemplate && importDescription.trim()
          ? { description: importDescription.trim() }
          : {}),
      });

      onClose();
    } catch (err: unknown) {
      setError(
        apiErrorMessage(err) ||
          errorMessage(err) ||
          `Failed to import ${noun.toLowerCase()}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isTemplate ? 'Import Template' : 'Import Character'}
      icon={Upload}
      size="lg"
      closeDisabled={isLoading}
    >
        {isTemplate && !previewData && (
          <p className="text-sm text-ink-secondary mb-4">
            Any character JSON works here, including one exported from another CozyVTT
            instance. Publishing it as a template makes it available for everyone here to
            copy — the original character is not affected.
          </p>
        )}
        {/* File Upload Area */}
        {!previewData && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-all
              ${isDragging ? 'border-moss-green bg-moss-green/10' : 'border-moss-green/30 hover:border-moss-green/50'}
            `}
          >
            <Upload className="w-16 h-16 text-brand-ink mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-ink mb-2">
              {isDragging ? 'Drop file here' : 'Upload Character JSON'}
            </h3>
            <p className="sr-only">
              {isTemplate ? 'The file will be published as a template.' : ''}
            </p>
            <p className="text-sm text-ink mb-4">
              Drag and drop a JSON file, or click to browse
            </p>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileInputChange}
              className="hidden"
              id="character-file-input"
            />
            <label
              htmlFor="character-file-input"
              className="btn-primary inline-block cursor-pointer"
            >
              Choose File
            </label>
            <p className="text-xs text-ink-muted mt-4">
              Maximum file size: 5MB
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !previewData && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-moss-green mb-4"></div>
            <p className="text-ink">Reading file...</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-spirit-red flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-spirit-red mb-1">Import Error</h4>
              <p className="text-sm text-ink">{error}</p>
            </div>
          </div>
        )}

        {/* Preview */}
        {previewData && (
          <div className="space-y-6">
            <div className="bg-moss-green/10 border border-moss-green/30 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-5 h-5 text-brand-ink flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-brand-ink mb-1">
                    {isTemplate ? 'Sheet Loaded Successfully' : 'Character Loaded Successfully'}
                  </h4>
                  <p className="text-sm text-ink">
                    {isTemplate
                      ? 'Review the details below, then publish it as a template.'
                      : 'Review the character details below before importing.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Name Conflict Warning */}
            {nameConflict && (
              <div className="bg-sunset-orange/10 border border-sunset-orange/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-sunset-orange flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sunset-orange mb-1">Name Conflict</h4>
                    <p className="text-sm text-ink">
                      {isTemplate
                        ? `A template named "${previewData.name}" already exists. This one will be named "${importName}" — edit it below if you'd rather use something else.`
                        : `A character named "${previewData.name}" already exists. The imported character will be renamed to "${importName}".`}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Character Preview */}
            <div className="bg-parchment rounded-lg border border-moss-green/20 p-6">
              <h3 className="text-lg font-semibold text-brand-ink mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {isTemplate ? 'Template Preview' : 'Character Preview'}
              </h3>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="import-name" className="block text-sm font-medium text-ink mb-1">
                    {isTemplate ? 'Template Name' : 'Character Name'}
                  </label>
                  <input
                    id="import-name"
                    type="text"
                    value={importName}
                    onChange={(e) => setImportName(e.target.value)}
                    maxLength={200}
                    className="w-full px-3 py-2 rounded-lg border border-moss-green/30 bg-paper text-ink
                             focus:outline-none focus:ring-2 focus:ring-moss-green/50"
                  />
                </div>

                {/* Description — templates only; characters have no such field */}
                {isTemplate && (
                  <div>
                    <label htmlFor="import-description" className="block text-sm font-medium text-ink mb-1">
                      Description <span className="text-ink-muted font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="import-description"
                      value={importDescription}
                      onChange={(e) => setImportDescription(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="What this template is for, and who it suits."
                      className="w-full px-3 py-2 rounded-lg border border-moss-green/30 bg-paper text-ink
                               focus:outline-none focus:ring-2 focus:ring-moss-green/50 resize-none"
                    />
                  </div>
                )}

                {/* Game System */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    Game System
                  </label>
                  {previewData.gameSystem ? (
                    <GameSystemBadge gameSystem={previewData.gameSystem as GameSystem} size="lg" />
                  ) : (
                    <span className="text-sm text-ink-muted italic">Flexible (No specific system)</span>
                  )}
                </div>

                {/* Data Preview */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-2">
                    {isTemplate ? 'Sheet Data' : 'Character Data'}
                  </label>
                  <div className="bg-paper rounded border border-moss-green/20 p-3 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-ink-muted whitespace-pre-wrap">
                      {JSON.stringify(previewData.data, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                onClick={onClose}
                disabled={isLoading}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isLoading || !importName.trim()}
                className="flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {isTemplate ? 'Publish as Template' : 'Import Character'}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* File Info */}
        {file && !previewData && !error && !isLoading && (
          <div className="mt-4 text-sm text-ink">
            Selected file: <span className="font-medium text-ink">{file.name}</span>
          </div>
        )}
    </Modal>
  );
}
