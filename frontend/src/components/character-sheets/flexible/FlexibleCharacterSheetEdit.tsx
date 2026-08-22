/**
 * Flexible Character Sheet Edit
 */

import React, { useState } from 'react';
import { Save, X, Plus, User, Upload } from 'lucide-react';
import { Reorder } from 'framer-motion';
import type { Character } from '../../../types';
import type { FlexibleSection, SectionTemplate } from '../../../types/flexible-character-sheet';
import { initializeFlexibleData } from './utils/section-helpers';
import { SectionEditor } from './components/SectionEditor';
import { AddSectionMenu } from './components/AddSectionMenu';
import { StatsEditor } from './components/sections/StatsEditor';
import { ListEditor } from './components/sections/ListEditor';
import { TextEditor } from './components/sections/TextEditor';
import { TableEditor } from './components/sections/TableEditor';
import { api } from '../../../services/api';
import { AssetType } from '../../../types';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';

interface FlexibleCharacterSheetEditProps {
  character: Character;
  onSave: (data: any, showToast?: boolean, tokenImageUrl?: string) => Promise<void>;
  onCancel: () => void;
}

export const FlexibleCharacterSheetEdit: React.FC<FlexibleCharacterSheetEditProps> = ({
  character,
  onSave,
  onCancel,
}) => {
  const initialData = initializeFlexibleData(character.data);
  const [sections, setSections] = useState<FlexibleSection[]>(initialData.sections || []);
  const [isSaving, setIsSaving] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [tokenImageFile, setTokenImageFile] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(
    character.tokenImageUrl
  );
  const [tokenError, setTokenError] = useState<string>('');
  const { data: serverConfig } = useServerConfigQuery();

  // Handle token image upload
  const handleTokenImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setTokenError('Please select an image file');
        return;
      }
      const tokenLimit = getUploadLimit(serverConfig, AssetType.TOKEN);
      if (file.size > tokenLimit) {
        setTokenError(`Image must be smaller than ${formatUploadLimit(tokenLimit)}`);
        return;
      }
      setTokenImageFile(file);
      setTokenError('');
      const reader = new FileReader();
      reader.onloadend = () => {
        setTokenImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Upload token image if a new one was selected
      let newTokenImageUrl: string | undefined = undefined;
      if (tokenImageFile) {
        try {
          const assetFormData = new FormData();
          // File last so the server can name the type if it rejects the upload
          assetFormData.append('type', 'TOKEN');
          if (character.campaignId) {
            assetFormData.append('scope', 'CAMPAIGN');
            assetFormData.append('campaignId', character.campaignId);
          } else {
            assetFormData.append('scope', 'USER');
          }
          assetFormData.append('name', `${character.name} Token`);
          assetFormData.append('file', tokenImageFile);

          const uploadResponse = await api.uploadAsset(assetFormData);
          const assetId = uploadResponse.asset.id;
          newTokenImageUrl = `/api/assets/tokens/${assetId}`;
        } catch (uploadError: any) {
          console.error('Error uploading token image:', uploadError);
          setTokenError(uploadError.response?.data?.message || 'Failed to upload token image');
          setIsSaving(false);
          return;
        }
      }

      await onSave({ sections }, true, newTokenImageUrl);
    } finally {
      setIsSaving(false);
    }
  };

  const addSection = (template: SectionTemplate) => {
    const newSection = template.create();
    setSections([...sections, newSection]);
    setShowAddMenu(false);
  };

  const removeSection = (sectionId: string) => {
    setSections(sections.filter((s) => s.id !== sectionId));
  };

  const updateSection = (sectionId: string, updates: Partial<FlexibleSection>) => {
    setSections(
      sections.map((s) => (s.id === sectionId ? { ...s, ...updates } as FlexibleSection : s))
    );
  };

  const renderSectionEditor = (section: FlexibleSection) => {
    let editor: React.ReactNode;

    switch (section.type) {
      case 'stats':
        editor = <StatsEditor section={section} onUpdate={(updates) => updateSection(section.id, updates)} />;
        break;
      case 'list':
        editor = <ListEditor section={section} onUpdate={(updates) => updateSection(section.id, updates)} />;
        break;
      case 'text':
        editor = <TextEditor section={section} onUpdate={(updates) => updateSection(section.id, updates)} />;
        break;
      case 'table':
        editor = <TableEditor section={section} onUpdate={(updates) => updateSection(section.id, updates)} />;
        break;
    }

    return (
      <SectionEditor
        key={section.id}
        section={section}
        onUpdate={(updates) => updateSection(section.id, updates)}
        onRemove={() => removeSection(section.id)}
      >
        {editor}
      </SectionEditor>
    );
  };

  return (
    <div className="glass-panel p-6">
      {/* Header with Save/Cancel */}
      <div className="flex items-center justify-between pb-4 border-b border-moss-green/20 mb-6">
        <div className="flex items-center gap-4">
          {/* Token Image Upload */}
          <div className="relative group">
            <input
              type="file"
              id="token-upload-flexible"
              accept="image/*"
              onChange={handleTokenImageChange}
              className="hidden"
            />
            <label
              htmlFor="token-upload-flexible"
              className="cursor-pointer block relative"
            >
              {tokenImagePreview ? (
                <img
                  src={tokenImagePreview}
                  alt={character.name}
                  className="w-16 h-16 rounded-full border-2 border-moss-green/30 object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full border-2 border-moss-green/30 bg-moss-green/10 flex items-center justify-center">
                  <User className="w-8 h-8 text-brand-ink/40" />
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Upload className="w-6 h-6 text-white" />
              </div>
            </label>
            {tokenError && (
              <div className="absolute top-full mt-1 text-xs text-red-500 whitespace-nowrap">
                {tokenError}
              </div>
            )}
            {!character.campaignId && (
              <div className="absolute top-full mt-1 text-xs text-amber-600 whitespace-nowrap">
                Saves as personal token
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold text-brand-ink">
              Editing: {character.name}
            </h2>
            <p className="text-sm text-stone-gray">
              Drag sections to reorder • Add, edit, or remove sections
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-moss-green text-white rounded-lg hover:bg-moss-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 bg-stone-gray/10 text-stone-gray rounded-lg hover:bg-stone-gray/20 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>

      {/* Reorderable Sections */}
      {sections.length > 0 ? (
        <Reorder.Group axis="y" values={sections} onReorder={setSections} className="space-y-4 mb-4">
          {sections.map((section) => (
            <Reorder.Item key={section.id} value={section}>
              {renderSectionEditor(section)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <div className="text-center py-12 mb-4">
          <p className="text-stone-gray mb-2">No sections yet.</p>
          <p className="text-sm text-stone-gray">Click "Add Section" below to get started.</p>
        </div>
      )}

      {/* Add Section Button */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex items-center gap-2 px-4 py-2 bg-moss-green/10 text-brand-ink rounded-lg hover:bg-moss-green/20 transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" />
          Add Section
        </button>
        {showAddMenu && <AddSectionMenu onSelect={addSection} onClose={() => setShowAddMenu(false)} />}
      </div>
    </div>
  );
};
