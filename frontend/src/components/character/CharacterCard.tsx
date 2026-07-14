// ============================================
// Character Card Component
// Displays character info with glassmorphism style
// ============================================

import { memo, useState } from 'react';
import type { Character, Campaign } from '@/types';
import { User, Calendar, Link2, MoreVertical, Edit, Copy, Trash2, FileDown, Link as LinkIcon } from 'lucide-react';
import GameSystemBadge from '@/components/common/GameSystemBadge';
import { motion, AnimatePresence } from 'framer-motion';

interface CharacterCardProps {
  character: Character;
  campaign?: Campaign | null;
  onEdit: (character: Character) => void;
  onCopy: (character: Character) => void;
  onDelete: (character: Character) => void;
  onAssign: (character: Character) => void;
  onExport: (character: Character) => void;
}

function CharacterCardInner({
  character,
  campaign,
  onEdit,
  onCopy,
  onDelete,
  onAssign,
  onExport,
}: CharacterCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  // Handle card click (open character editor)
  const handleCardClick = () => {
    onEdit(character);
  };

  // Handle menu item click (prevent card click propagation)
  const handleMenuItemClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    setShowMenu(false);
    action();
  };

  // Toggle menu (prevent card click)
  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  // Close menu when clicking outside
  const handleClickOutside = () => {
    if (showMenu) {
      setShowMenu(false);
    }
  };

  return (
    <>
      {/* Backdrop to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={handleClickOutside}
        />
      )}

      <div
        onClick={handleCardClick}
        className={`group relative glass-panel p-6 text-left transition-all duration-300
                   hover:scale-105 hover:shadow-xl hover:shadow-moss-green/20
                   focus:outline-none focus:ring-2 focus:ring-moss-green/50 focus:scale-105
                   active:scale-100 w-full cursor-pointer ${showMenu ? 'z-50' : 'z-0'}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
        style={{
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Actions Menu Button (Top Right) */}
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={handleMenuToggle}
            className="p-2 rounded-lg hover:bg-warm-gray/20 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-moss-green/50"
            aria-label="Character actions"
            type="button"
          >
            <MoreVertical className="w-5 h-5 text-stone-gray" />
          </button>

          {/* Dropdown Menu */}
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50
                           bg-surface-light/95 backdrop-blur-cozy border border-brand/20"
              >
                <div className="py-1">
                  <button
                    onClick={(e) => handleMenuItemClick(e, () => onEdit(character))}
                    className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10
                             flex items-center gap-2 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Character
                  </button>

                  <button
                    onClick={(e) => handleMenuItemClick(e, () => onCopy(character))}
                    className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10
                             flex items-center gap-2 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copy/Duplicate
                  </button>

                  <button
                    onClick={(e) => handleMenuItemClick(e, () => onAssign(character))}
                    className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10
                             flex items-center gap-2 transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {campaign ? 'Reassign Campaign' : 'Assign to Campaign'}
                  </button>

                  <button
                    onClick={(e) => handleMenuItemClick(e, () => onExport(character))}
                    className="w-full px-4 py-2 text-left text-sm text-stone-gray hover:bg-moss-green/10
                             flex items-center gap-2 transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    Export as JSON
                  </button>

                  <div className="border-t border-moss-green/20 my-1" />

                  <button
                    onClick={(e) => handleMenuItemClick(e, () => onDelete(character))}
                    className="w-full px-4 py-2 text-left text-sm text-spirit-red hover:bg-spirit-red/10
                             flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Character
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Character Avatar/Token */}
        <div className="mb-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg bg-moss-green/10 border-2 border-moss-green/30
                        flex items-center justify-center overflow-hidden">
            {character.tokenImageUrl ? (
              <img
                src={character.tokenImageUrl}
                alt={character.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-moss-green" />
            )}
          </div>

          <div className="flex-1 min-w-0 pr-8">
            {/* Character Name */}
            <h3 className="text-xl font-semibold text-moss-green mb-1 truncate
                         group-hover:text-spirit-purple transition-colors">
              {character.name}
            </h3>

            {/* Game System Badge */}
            <GameSystemBadge gameSystem={character.gameSystem} size="md" />
          </div>
        </div>

        {/* Campaign Assignment Status */}
        {campaign && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-spirit-purple/10 border border-spirit-purple/30">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-spirit-purple" />
              <span className="text-sm font-medium text-spirit-purple">
                Assigned to:
              </span>
              <span className="text-sm text-stone-gray truncate">
                {campaign.name}
              </span>
            </div>
          </div>
        )}

        {!campaign && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-warm-gray/10 border border-warm-gray/30">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-warm-gray" />
              <span className="text-sm text-warm-gray">
                Not assigned to any campaign
              </span>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div className="space-y-2 text-sm">
          {/* Last Updated */}
          <div className="flex items-center gap-2 text-stone-gray">
            <Calendar className="w-4 h-4 text-warm-amber" />
            <span className="text-warm-gray">Updated:</span>
            <span className="text-stone-gray font-medium">{formatDate(character.updatedAt)}</span>
          </div>
        </div>

        {/* Hover Overlay Effect */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-moss-green/5 to-spirit-purple/5
                        opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
             style={{ transform: 'translateZ(-1px)' }} />
      </div>
    </>
  );
}

// Memoised so the character grid only re-renders a card when its own props change
// (e.g. the character was edited or the menu toggled), not on every sibling update.
const CharacterCard = memo(CharacterCardInner);
export default CharacterCard;
