/**
 * New Character Modal
 * Modal dialog for creating a new character with game system templates
 */

import { useState, FormEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { X, Loader2, User, Sparkles } from 'lucide-react';
import { Character, GameSystem, Campaign } from '@/types';
import { GAME_SYSTEM_OPTIONS } from '@/constants/game-systems';
import api from '@/services/api';

interface NewCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (character: Character) => void;
  /** If provided, character will be assigned to this campaign */
  campaign?: Campaign;
  /** If provided, this game system will be pre-selected and locked */
  preselectedGameSystem?: GameSystem | null;
}

interface TemplateOption {
  value: string;
  label: string;
  description: string;
}

const TEMPLATE_OPTIONS_BY_SYSTEM: Record<string, TemplateOption[]> = {
  [GameSystem.DND_5E]: [
    {
      value: 'blank',
      label: 'Blank Character Sheet',
      description: 'Start with an empty Level 1 character',
    },
    {
      value: 'fighter',
      label: 'Level 1 Fighter (Example)',
      description: 'A pre-built Fighter with standard array stats',
    },
  ],
  [GameSystem.PATHFINDER_2E]: [
    {
      value: 'blank',
      label: 'Blank Character Sheet',
      description: 'Start with an empty Level 1 character',
    },
    {
      value: 'fighter',
      label: 'Level 1 Fighter (Example)',
      description: 'A pre-built Dwarf Fighter',
    },
  ],
  [GameSystem.SHADOWRUN_6E]: [
    {
      value: 'blank',
      label: 'Blank Character Sheet',
      description: 'Start with an empty character',
    },
    {
      value: 'streetsamurai',
      label: 'Street Samurai (Example)',
      description: 'A combat-focused runner with cyberware',
    },
  ],
  [GameSystem.CALL_OF_CTHULHU_7E]: [
    {
      value: 'blank',
      label: 'Blank Investigator Sheet',
      description: 'Start with an empty investigator',
    },
    {
      value: 'privateinvestigator',
      label: 'Private Investigator (Example)',
      description: 'A gritty private eye ready for mysteries',
    },
  ],
};

export default function NewCharacterModal({
  isOpen,
  onClose,
  onSuccess,
  campaign,
  preselectedGameSystem,
}: NewCharacterModalProps) {
  const [name, setName] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    campaign?.id || null
  );
  const [gameSystem, setGameSystem] = useState<GameSystem | null>(
    preselectedGameSystem || campaign?.gameSystem || null
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [error, setError] = useState('');

  // Fetch user's campaigns when modal opens
  useEffect(() => {
    if (isOpen && !campaign) {
      fetchUserCampaigns();
    }
  }, [isOpen, campaign]);

  // Update game system when campaign selection changes
  useEffect(() => {
    if (selectedCampaignId && availableCampaigns.length > 0) {
      const selectedCampaign = availableCampaigns.find(
        (c) => c.id === selectedCampaignId
      );
      if (selectedCampaign?.gameSystem) {
        setGameSystem(selectedCampaign.gameSystem);
      }
    }
  }, [selectedCampaignId, availableCampaigns]);

  const fetchUserCampaigns = async () => {
    setLoadingCampaigns(true);
    try {
      const response = await api.listCampaigns();
      setAvailableCampaigns(response.campaigns);
    } catch (err: any) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const isGameSystemLocked = (): boolean => {
    // If preselected (from campaign context), lock it
    if (preselectedGameSystem !== undefined) {
      return true;
    }

    // If campaign is selected and has a game system, lock it
    if (selectedCampaignId && availableCampaigns.length > 0) {
      const selectedCampaign = availableCampaigns.find(
        (c) => c.id === selectedCampaignId
      );
      return selectedCampaign?.gameSystem !== null && selectedCampaign?.gameSystem !== undefined;
    }

    return false;
  };

  const getTemplateOptions = (): TemplateOption[] => {
    if (!gameSystem) {
      return [
        {
          value: 'blank',
          label: 'Blank Character',
          description: 'Start with an empty flexible character sheet',
        },
        {
          value: 'basic',
          label: 'Basic Template',
          description: 'Attributes, Skills, Inventory, and Background sections',
        },
      ];
    }

    return TEMPLATE_OPTIONS_BY_SYSTEM[gameSystem] || [];
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Validation
    if (name.trim().length < 2) {
      setError('Character name must be at least 2 characters');
      return;
    }

    if (name.trim().length > 100) {
      setError('Character name must be less than 100 characters');
      return;
    }

    setLoading(true);

    try {
      // Always fetch the template from the backend (even for 'blank') so that
      // the character is created with all required schema fields populated.
      let templateData: Record<string, unknown> = {};
      if (selectedTemplate) {
        const systemParam = gameSystem || 'null';
        const templateResponse = await fetch(
          `/api/characters/templates/${systemParam}/${selectedTemplate}`,
          { credentials: 'include' }
        );

        if (!templateResponse.ok) {
          const errorText = await templateResponse.text();
          console.error('Template fetch failed:', errorText);
          throw new Error(`Failed to fetch character template: ${templateResponse.status} ${templateResponse.statusText}`);
        }

        const templateJson = await templateResponse.json();
        templateData = templateJson.data || {};
      }

      // Create character using the api client
      const response = await api.createCharacter({
        name: name.trim(),
        campaignId: selectedCampaignId || undefined,
        gameSystem: gameSystem || undefined,
        data: templateData as unknown as import('@/types').CharacterData,
      });

      // Reset form
      setName('');
      setSelectedCampaignId(campaign?.id || null);
      setGameSystem(preselectedGameSystem || campaign?.gameSystem || null);
      setSelectedTemplate('blank');

      // Notify parent
      onSuccess(response.character);

      // Close modal
      onClose();
    } catch (err: any) {
      // Show detailed validation errors if available
      const errorData = err.response?.data;
      if (errorData?.validationErrors && Array.isArray(errorData.validationErrors)) {
        const errorList = errorData.validationErrors
          .map((e: any) => `• ${e.path}: ${e.message}`)
          .join('\n');
        setError(`${errorData.message}\n\n${errorList}`);
        console.error('Validation errors:', errorData.validationErrors);
      } else {
        setError(errorData?.message || err.message || 'Failed to create character');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setSelectedCampaignId(campaign?.id || null);
      setGameSystem(preselectedGameSystem || campaign?.gameSystem || null);
      setSelectedTemplate('blank');
      setError('');
      onClose();
    }
  };

  const modalRef = useFocusTrap(isOpen, handleClose);

  const isFormValid = name.trim().length >= 2;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-character-title"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl p-6 relative rounded-lg border border-moss-green/20 shadow-2xl"
              style={{
                background: 'rgba(254, 243, 199, 0.98)',
                backdropFilter: 'blur(10px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-moss-green/10">
                    <User className="w-6 h-6 text-moss-green" />
                  </div>
                  <h2 id="new-character-title" className="text-2xl font-semibold text-moss-green font-heading">
                    Create New Character
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  disabled={loading}
                  className="p-2 rounded-lg hover:bg-warm-gray/10 transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close dialog"
                >
                  <X className="w-5 h-5 text-stone-gray" />
                </button>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 bg-spirit-red/10 border border-spirit-red/30 rounded-lg p-4 max-h-60 overflow-y-auto">
                  <p className="text-sm text-spirit-red font-medium whitespace-pre-wrap font-mono">
                    {error}
                  </p>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Character Name */}
                <div>
                  <label
                    htmlFor="characterName"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Character Name <span className="text-spirit-red">*</span>
                  </label>
                  <input
                    type="text"
                    id="characterName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Aria Moonshadow"
                    disabled={loading}
                    className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    autoFocus
                    required
                  />
                  <p className="mt-1 text-xs text-gray-600">
                    Give your character a memorable name (2-100 characters)
                  </p>
                </div>

                {/* Campaign Selection (if not from campaign context) */}
                {!campaign && (
                  <div>
                    <label
                      htmlFor="campaign"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      Campaign <span className="text-gray-500">(optional)</span>
                    </label>
                    <select
                      id="campaign"
                      value={selectedCampaignId || ''}
                      onChange={(e) =>
                        setSelectedCampaignId(e.target.value || null)
                      }
                      disabled={loading || loadingCampaigns}
                      className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="">Unassigned Character</option>
                      {availableCampaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.gameSystem && ` (${c.gameSystem})`}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-600">
                      Assign to a campaign now, or leave unassigned for later
                    </p>
                  </div>
                )}

                {/* Game System Selection */}
                <div>
                  <label
                    htmlFor="gameSystem"
                    className="block text-sm font-semibold text-gray-700 mb-2"
                  >
                    Game System{' '}
                    {isGameSystemLocked() ? (
                      <span className="text-gray-500">(from campaign)</span>
                    ) : (
                      <span className="text-gray-500">(optional)</span>
                    )}
                  </label>
                  <select
                    id="gameSystem"
                    value={gameSystem || ''}
                    onChange={(e) => {
                      setGameSystem((e.target.value as GameSystem) || null);
                      setSelectedTemplate('blank'); // Reset template when game system changes
                    }}
                    disabled={loading || isGameSystemLocked()}
                    className="input-cozy w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Flexible (No System)</option>
                    {GAME_SYSTEM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-600">
                    {isGameSystemLocked()
                      ? 'Game system is inherited from the selected campaign'
                      : 'Select a game system to use pre-built templates'}
                  </p>
                </div>

                {/* Template Selection (only if game system is selected) */}
                {gameSystem && (
                  <div>
                    <label
                      htmlFor="template"
                      className="block text-sm font-semibold text-gray-700 mb-2"
                    >
                      Character Template
                    </label>
                    <div className="space-y-3">
                      {getTemplateOptions().map((template) => (
                        <label
                          key={template.value}
                          className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all ${
                            selectedTemplate === template.value
                              ? 'border-moss-green bg-moss-green/5'
                              : 'border-gray-200 hover:border-moss-green/50'
                          } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="radio"
                            name="template"
                            value={template.value}
                            checked={selectedTemplate === template.value}
                            onChange={(e) => setSelectedTemplate(e.target.value)}
                            disabled={loading}
                            className="mt-1 mr-3"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800">
                                {template.label}
                              </span>
                              {template.value !== 'blank' && (
                                <Sparkles className="w-4 h-4 text-warm-amber" />
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">
                              {template.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      Templates pre-fill the character sheet with example data
                    </p>
                  </div>
                )}

                {/* Info Box */}
                <div className="rounded-lg p-4 bg-moss-green/10 border border-moss-green/30">
                  <p className="text-sm text-gray-700">
                    <strong className="text-moss-green">Note:</strong> After
                    creation, you'll be redirected to the character editor where
                    you can customize all details and save when ready.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !isFormValid}
                    className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 inline-block mr-2" />
                        Create Character
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
