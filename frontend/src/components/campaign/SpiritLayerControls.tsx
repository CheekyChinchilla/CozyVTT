// ============================================
// SpiritLayerControls
// DM slide-over panel for spirit layer management
// Spirit Layer Implementation
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, Ghost, Layers, X, Loader2 } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useTokenListIgnoringMovement } from '@/stores/gameStore';
import { useWebSocket } from '@/contexts/WebSocketContext';
import campaignService from '@/services/campaign.service';
import type { Token } from '@/types';
import Button from '@/components/ui/Button';

// ============================================
// Spirit Layer Style Options
// ============================================

const SPIRIT_STYLES = [
  {
    id: 'wispy',
    label: 'Wispy',
    description: 'Drifting mist — default ethereal look',
    previewColor: 'rgba(180, 210, 230, 0.5)',
    overlayClass: 'spirit-overlay-wispy',
  },
  {
    id: 'ethereal',
    label: 'Ethereal',
    description: 'Shimmering silver-teal glow',
    previewColor: 'rgba(100, 220, 200, 0.5)',
    overlayClass: 'spirit-overlay-ethereal',
  },
  {
    id: 'shadow',
    label: 'Shadow',
    description: 'Dark and ominous — spirit of death',
    previewColor: 'rgba(30, 10, 60, 0.6)',
    overlayClass: 'spirit-overlay-shadow',
  },
  {
    id: 'dream',
    label: 'Dream',
    description: 'Shifting violet — fey or psychic realm',
    previewColor: 'rgba(140, 80, 220, 0.5)',
    overlayClass: 'spirit-overlay-dream',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Your own hue for a unique realm',
    previewColor: '',
    overlayClass: 'spirit-overlay-custom',
  },
] as const;

type SpiritStyleId = (typeof SPIRIT_STYLES)[number]['id'];

/** Effect animation types available for the Custom style */
type CustomEffectId = 'wispy' | 'ethereal' | 'shadow' | 'dream';

const CUSTOM_EFFECTS: { id: CustomEffectId; label: string; description: string }[] = [
  { id: 'wispy',    label: 'Particles', description: 'Rising motes' },
  { id: 'ethereal', label: 'Shimmer',   description: 'Bright sweep' },
  { id: 'shadow',   label: 'Shadow',    description: 'Dark fog'     },
  { id: 'dream',    label: 'Rainbow',   description: 'Colour shift' },
];

const VALID_CUSTOM_EFFECTS: CustomEffectId[] = ['wispy', 'ethereal', 'shadow', 'dream'];

// ============================================
// Helpers
// ============================================

/**
 * Parse style string.
 * Named style:  "wispy" | "ethereal" | "shadow" | "dream"
 * Custom style: "custom:#hexcolor" (legacy) or "custom:#hexcolor:effectId"
 */
function parseStyle(raw: string): { styleId: SpiritStyleId; customColor: string; customEffect: CustomEffectId } {
  if (raw.startsWith('custom:')) {
    const rest = raw.slice(7); // e.g. "#7c3aed" or "#7c3aed:wispy"
    const lastColon = rest.lastIndexOf(':');
    if (lastColon !== -1) {
      const color  = rest.slice(0, lastColon);
      const effect = rest.slice(lastColon + 1) as CustomEffectId;
      return {
        styleId: 'custom',
        customColor: color,
        customEffect: VALID_CUSTOM_EFFECTS.includes(effect) ? effect : 'wispy',
      };
    }
    return { styleId: 'custom', customColor: rest, customEffect: 'wispy' };
  }
  const known = SPIRIT_STYLES.map((s) => s.id) as string[];
  return {
    styleId: known.includes(raw) ? (raw as SpiritStyleId) : 'wispy',
    customColor: '#9370DB',
    customEffect: 'wispy',
  };
}

function encodeStyle(styleId: SpiritStyleId, customColor: string, customEffect: CustomEffectId = 'wispy'): string {
  return styleId === 'custom' ? `custom:${customColor}:${customEffect}` : styleId;
}

// ============================================
// Component
// ============================================

interface SpiritLayerControlsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SpiritLayerControls({ isOpen, onClose }: SpiritLayerControlsProps) {
  const { campaign, currentMap, updateCampaignSpiritLayer, dmViewBothPlanes, setDmViewBothPlanes } = useCampaign();
  // Lists spirit tokens by name — no need to re-render on token movement.
  const tokens = useTokenListIgnoringMovement();
  const { socket } = useWebSocket();

  // Derived state from campaign
  const enabled = campaign?.spiritLayerEnabled ?? false;
  const { styleId: initialStyleId, customColor: initialColor, customEffect: initialEffect } = parseStyle(
    campaign?.spiritLayerStyle ?? 'wispy'
  );

  // Local UI state
  const [selectedStyle, setSelectedStyle] = useState<SpiritStyleId>(initialStyleId);
  const [customColor, setCustomColor] = useState(initialColor);
  const [customEffect, setCustomEffect] = useState<CustomEffectId>(initialEffect);
  const [isSavingStyle, setIsSavingStyle] = useState(false);
  const [isTogglingLayer, setIsTogglingLayer] = useState(false);
  const [tokenTogglingIds, setTokenTogglingIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync style state when campaign changes (including real-time WS updates)
  useEffect(() => {
    if (!campaign) return;
    const { styleId, customColor: color, customEffect: effect } = parseStyle(campaign.spiritLayerStyle);
    setSelectedStyle(styleId);
    setCustomColor(color);
    setCustomEffect(effect);
  }, [campaign?.spiritLayerStyle]);

  // Spirit layer tokens from current map
  const spiritTokens: Token[] = tokens.filter((t) => t.layer === 'spirit');

  // ============================================
  // Spirit Layer Toggle
  // ============================================

  const handleToggleLayer = useCallback(async () => {
    if (!socket || !campaign) return;
    setIsTogglingLayer(true);
    setErrorMsg(null);

    const newVisible = !enabled;

    try {
      socket.emitSpiritLayerToggle({ visible: newVisible });
      // Optimistic update — the WS broadcast will also arrive and confirm
      updateCampaignSpiritLayer(newVisible);
    } catch {
      setErrorMsg('Failed to toggle spirit layer');
    } finally {
      setIsTogglingLayer(false);
    }
  }, [socket, campaign, enabled, updateCampaignSpiritLayer]);

  // ============================================
  // Style Selector
  // ============================================

  const handleStyleSelect = async (styleId: SpiritStyleId) => {
    if (!campaign) return;
    setSelectedStyle(styleId);

    const encoded = encodeStyle(styleId, customColor, customEffect);
    setIsSavingStyle(true);
    setErrorMsg(null);
    try {
      await campaignService.updateCampaign(campaign.id, { spiritLayerStyle: encoded });
      updateCampaignSpiritLayer(enabled, encoded);
      socket?.emitSpiritLayerStyleChange(encoded);
    } catch {
      setErrorMsg('Failed to save style');
    } finally {
      setIsSavingStyle(false);
    }
  };

  const handleCustomColorChange = async (color: string) => {
    if (!campaign) return;
    setCustomColor(color);

    const encoded = encodeStyle('custom', color, customEffect);
    setIsSavingStyle(true);
    setErrorMsg(null);
    try {
      await campaignService.updateCampaign(campaign.id, { spiritLayerStyle: encoded });
      updateCampaignSpiritLayer(enabled, encoded);
      socket?.emitSpiritLayerStyleChange(encoded);
    } catch {
      setErrorMsg('Failed to save colour');
    } finally {
      setIsSavingStyle(false);
    }
  };

  const handleCustomEffectChange = async (effect: CustomEffectId) => {
    if (!campaign) return;
    setCustomEffect(effect);

    const encoded = encodeStyle('custom', customColor, effect);
    setIsSavingStyle(true);
    setErrorMsg(null);
    try {
      await campaignService.updateCampaign(campaign.id, { spiritLayerStyle: encoded });
      updateCampaignSpiritLayer(enabled, encoded);
      socket?.emitSpiritLayerStyleChange(encoded);
    } catch {
      setErrorMsg('Failed to save effect');
    } finally {
      setIsSavingStyle(false);
    }
  };

  // ============================================
  // Per-Token Visibility Toggle
  // ============================================

  const handleTokenVisibilityToggle = useCallback(
    async (token: Token) => {
      if (!socket || !currentMap) return;
      setTokenTogglingIds((prev) => new Set(prev).add(token.id));
      setErrorMsg(null);

      try {
        socket.emitSpiritLayerTokenToggle(currentMap.id, token.id, !token.visible);
      } catch {
        setErrorMsg('Failed to toggle token visibility');
      } finally {
        setTokenTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(token.id);
          return next;
        });
      }
    },
    [socket, currentMap]
  );

  // ============================================
  // Render
  // ============================================

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="spirit-backdrop"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="spirit-panel"
            className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-paper-white shadow-2xl overflow-y-auto flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-moss-green/20 bg-parchment/60 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <Ghost className="w-5 h-5 text-spirit-purple" />
                <h2 className="text-lg font-bold text-brand-ink">Spirit Layer</h2>
              </div>
              <Button
                onClick={onClose}
                variant="secondary" className="p-1.5"
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Error */}
              {errorMsg && (
                <div className="px-4 py-3 bg-danger/10 border border-danger/20 text-danger-ink text-sm rounded-cozy">
                  {errorMsg}
                </div>
              )}

              {/* Section 1: Spirit Realm Access Toggle */}
              <section>
                <h3 className="text-sm font-semibold text-stone-gray uppercase tracking-wide mb-3">
                  Spirit Realm Access
                </h3>
                <div className="glass-panel p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-charcoal">
                      {enabled
                        ? 'Spirit realm revealed to all players'
                        : 'Spirit realm hidden from players'}
                    </p>
                    <p className="text-xs text-stone-gray mt-0.5">
                      As DM you always see into the spirit realm.
                      Enable to let players cross into the ethereal plane.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleLayer}
                    disabled={isTogglingLayer}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-cozy font-medium text-sm transition-colors ${
                      enabled
                        ? 'bg-spirit-purple text-white hover:bg-spirit-purple/80'
                        : 'bg-transparent border border-brand text-brand-ink hover:bg-brand hover:text-white focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2'
                    }`}
                    title={enabled ? 'Close the veil' : 'Open the veil'}
                  >
                    {isTogglingLayer ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : enabled ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                    {enabled ? 'Open' : 'Closed'}
                  </button>
                </div>

                {/* DM View Mode toggle */}
                <div className="glass-panel p-4 flex items-center justify-between mt-3">
                  <div>
                    <p className="text-sm font-medium text-charcoal">DM View Mode</p>
                    <p className="text-xs text-stone-gray mt-0.5">
                      {dmViewBothPlanes
                        ? 'Seeing both planes at once (may be confusing)'
                        : 'Seeing only the active plane (cleaner view)'}
                    </p>
                  </div>
                  <button
                    onClick={() => setDmViewBothPlanes(!dmViewBothPlanes)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-cozy font-medium text-sm transition-colors ${
                      dmViewBothPlanes
                        ? 'bg-spirit-purple/20 text-spirit-purple hover:bg-spirit-purple/30'
                        : 'bg-transparent border border-brand text-brand-ink hover:bg-brand hover:text-white focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2'
                    }`}
                    title={dmViewBothPlanes ? 'Switch to single-plane view' : 'Switch to dual-plane view'}
                  >
                    <Layers className="w-4 h-4" />
                    {dmViewBothPlanes ? 'Dual Plane' : 'Single Plane'}
                  </button>
                </div>
              </section>

              {/* Section 2: Style Selector — the atmosphere of the spirit realm */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-stone-gray uppercase tracking-wide">
                    Realm Atmosphere
                  </h3>
                  {isSavingStyle && (
                    <Loader2 className="w-4 h-4 text-stone-gray animate-spin" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SPIRIT_STYLES.map((style) => {
                    const isSelected = selectedStyle === style.id;
                    return (
                      <button
                        key={style.id}
                        onClick={() => handleStyleSelect(style.id as SpiritStyleId)}
                        className={`text-left p-3 rounded-cozy border-2 transition-all ${
                          isSelected
                            ? 'border-spirit-purple bg-spirit-purple/10'
                            : 'border-moss-green/20 hover:border-moss-green/40 bg-parchment/40'
                        }`}
                      >
                        {/* Colour preview swatch */}
                        <div
                          className="w-full h-8 rounded mb-2"
                          style={{
                            background:
                              style.id === 'custom'
                                ? customColor
                                : style.previewColor,
                          }}
                        />
                        <p className="text-xs font-semibold text-charcoal">{style.label}</p>
                        <p className="text-[10px] text-stone-gray leading-tight mt-0.5">
                          {style.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Custom colour + effect pickers */}
                {selectedStyle === 'custom' && (
                  <div className="mt-3 space-y-2">
                    {/* Colour picker */}
                    <div className="glass-panel p-3 flex items-center gap-3">
                      <label className="text-sm text-stone-gray font-medium" htmlFor="spirit-hue">
                        Hue
                      </label>
                      <input
                        id="spirit-hue"
                        type="color"
                        value={customColor}
                        onChange={(e) => setCustomColor(e.target.value)}
                        onBlur={(e) => handleCustomColorChange(e.target.value)}
                        className="w-10 h-8 rounded cursor-pointer border-none bg-transparent"
                      />
                      <span className="text-xs text-stone-gray font-mono">{customColor}</span>
                    </div>

                    {/* Effect type picker */}
                    <div className="glass-panel p-3 space-y-2">
                      <p className="text-xs font-semibold text-stone-gray uppercase tracking-wide">
                        Effect
                      </p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CUSTOM_EFFECTS.map((eff) => (
                          <button
                            key={eff.id}
                            onClick={() => handleCustomEffectChange(eff.id)}
                            className={`p-2 rounded-cozy border transition-all text-center ${
                              customEffect === eff.id
                                ? 'border-spirit-purple bg-spirit-purple/10 text-spirit-purple'
                                : 'border-moss-green/20 hover:border-moss-green/40 bg-parchment/40 text-stone-gray'
                            }`}
                          >
                            <p className="text-[11px] font-semibold">{eff.label}</p>
                            <p className="text-[9px] leading-tight mt-0.5 opacity-70">{eff.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Section 3: Entities in the Spirit Realm */}
              <section>
                <h3 className="text-sm font-semibold text-stone-gray uppercase tracking-wide mb-1">
                  Spirits in the Realm
                  {spiritTokens.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-stone-gray/70 normal-case">
                      ({spiritTokens.length} present)
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-stone-gray/70 mb-3">
                  Tokens on the spirit layer. Right-click any token on the map
                  to send it to the spirit realm or return it to the material plane.
                </p>

                {!currentMap ? (
                  <p className="text-sm text-stone-gray/70 italic">No map loaded.</p>
                ) : spiritTokens.length === 0 ? (
                  <p className="text-sm text-stone-gray/70 italic">
                    No tokens are in the spirit realm on this map.
                    Right-click a token and choose "Send to Spirit Realm" to move one here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {spiritTokens.map((token) => {
                      const isToggling = tokenTogglingIds.has(token.id);
                      return (
                        <div
                          key={token.id}
                          className="glass-panel flex items-center justify-between p-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Token avatar */}
                            {token.imageUrl ? (
                              <img
                                src={token.imageUrl}
                                alt={token.name}
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-spirit-purple/30"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-spirit-purple/20 flex items-center justify-center flex-shrink-0">
                                <Ghost className="w-4 h-4 text-spirit-purple" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-charcoal truncate">
                                {token.name}
                              </p>
                              <p className="text-[10px] text-stone-gray">
                                ({token.position.x}, {token.position.y})
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleTokenVisibilityToggle(token)}
                            disabled={isToggling}
                            className={`flex-shrink-0 p-2 rounded-cozy transition-colors ${
                              token.visible
                                ? 'text-brand-ink hover:bg-moss-green/10'
                                : 'text-stone-gray/50 hover:bg-stone-gray/10'
                            }`}
                            title={token.visible ? 'Hide token' : 'Show token'}
                          >
                            {isToggling ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : token.visible ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <EyeOff className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Info note */}
              <div className="glass-panel px-4 py-3 bg-spirit-purple/5 border-spirit-purple/20 rounded-cozy">
                <p className="text-xs text-stone-gray leading-relaxed">
                  The spirit realm image overlay is set per map in the Map Library.
                  Move tokens between the spirit realm and material plane by right-clicking
                  them on the canvas. Tokens in the spirit realm are invisible to players
                  who cannot see the spirit realm.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
