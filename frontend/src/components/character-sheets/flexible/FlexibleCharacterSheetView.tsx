/**
 * Flexible Character Sheet View
 */

import React, { useState } from 'react';
import { Edit, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Character } from '../../../types';
import type { FlexibleSection } from '../../../types/flexible-character-sheet';
import { initializeFlexibleData } from './utils/section-helpers';
import { SectionHeader } from './components/SectionHeader';
import { StatsDisplay } from './components/sections/StatsDisplay';
import { ListDisplay } from './components/sections/ListDisplay';
import { TextDisplay } from './components/sections/TextDisplay';
import { TableDisplay } from './components/sections/TableDisplay';

interface FlexibleCharacterSheetViewProps {
  character: Character;
  onEdit?: () => void;
}

export const FlexibleCharacterSheetView: React.FC<FlexibleCharacterSheetViewProps> = ({
  character,
  onEdit,
}) => {
  const data = initializeFlexibleData(character.data);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionId)) {
      newCollapsed.delete(sectionId);
    } else {
      newCollapsed.add(sectionId);
    }
    setCollapsedSections(newCollapsed);
  };

  const renderSection = (section: FlexibleSection) => {
    const isCollapsed = collapsedSections.has(section.id);

    return (
      <div key={section.id} className="glass-panel overflow-hidden">
        <SectionHeader
          title={section.title}
          isCollapsed={isCollapsed}
          onToggle={() => toggleSection(section.id)}
        />
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {section.type === 'stats' && <StatsDisplay section={section} />}
              {section.type === 'list' && <ListDisplay section={section} />}
              {section.type === 'text' && <TextDisplay section={section} />}
              {section.type === 'table' && <TableDisplay section={section} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="glass-panel p-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-moss-green/20 mb-6">
        <div className="flex items-center gap-3">
          {character.tokenImageUrl ? (
            <img
              src={character.tokenImageUrl}
              alt={character.name}
              className="w-12 h-12 rounded-full border-2 border-moss-green/30 object-cover"
            />
          ) : (
            <div className="p-2 rounded-lg bg-moss-green/10">
              <User className="w-6 h-6 text-brand-ink" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-bold text-brand-ink">{character.name}</h2>
            <p className="text-sm text-stone-gray">Flexible Character Sheet</p>
          </div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-2 px-4 py-2 bg-moss-green text-white rounded-lg hover:bg-moss-green/90 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        )}
      </div>

      {/* Sections */}
      {data.sections.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-stone-gray mb-4">
            This character sheet has no sections yet.
          </p>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-moss-green text-white rounded-lg hover:bg-moss-green/90 transition-colors"
            >
              Add Sections
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {data.sections.map(renderSection)}
        </div>
      )}
    </div>
  );
};
