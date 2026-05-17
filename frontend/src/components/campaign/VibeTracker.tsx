/**
 * Vibe Tracker
 * Per SOW Section 18.3: Vibe Tracker Details
 *
 * Displays the current time-of-day period and lets the DM switch between periods.
 * All users see the current period indicator; only the DM can change it or configure periods.
 * Visual effects (CSS filter + hue overlay) are applied to the MapCanvas separately.
 */

import { useState } from 'react';
import { Settings, Sun, Moon, Sunset, Sunrise, Clock } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import ConfigureVibeModal from '@/components/campaign/ConfigureVibeModal';

// ============================================
// Period icon helper
// ============================================

function getPeriodIcon(periodName: string) {
  const name = periodName.toLowerCase();
  if (name === 'dawn') return <Sunrise className="w-4 h-4" />;
  if (name === 'day') return <Sun className="w-4 h-4" />;
  if (name === 'dusk') return <Sunset className="w-4 h-4" />;
  if (name === 'night') return <Moon className="w-4 h-4" />;
  return <Clock className="w-4 h-4" />;
}

// ============================================
// Main Component
// ============================================

export default function VibeTracker() {
  const { campaign, userRole, currentVibe } = useCampaign();
  const { socket } = useWebSocket();
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const periods = campaign?.vibeSettings?.periods ?? [];
  const activePeriod = periods.find((p) => p.name === currentVibe);

  // ============================================
  // Period Change (DM only)
  // ============================================

  const handleChangePeriod = async (periodName: string) => {
    if (isSwitching || periodName === currentVibe || !socket) return;
    setIsSwitching(true);
    try {
      // Emit via WebSocket — backend validates, broadcasts vibe.updated to all clients
      // MapCanvas listens for vibe.updated and calls updateVibe() in CampaignContext
      socket.emitVibeUpdate({ period: periodName });
    } finally {
      // Allow another switch after a brief debounce
      setTimeout(() => setIsSwitching(false), 500);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <>
      <div className="glass-panel p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-warm-amber" />
            <h3 className="text-sm font-semibold text-moss-green">Vibe Tracker</h3>
          </div>

          {userRole === 'DM' && (
            <button
              onClick={() => setIsConfigureOpen(true)}
              className="p-1.5 rounded-lg hover:bg-moss-green/10 transition-colors text-stone-gray hover:text-moss-green"
              title="Configure periods"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Current Period Indicator — visible to all users */}
        <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-parchment/60 border border-moss-green/15">
          {activePeriod ? (
            <>
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 ring-1 ring-black/10"
                style={{ backgroundColor: activePeriod.hue }}
              />
              <div className="flex items-center gap-1.5 text-stone-gray">
                {getPeriodIcon(activePeriod.name)}
                <span className="text-sm font-medium capitalize">{activePeriod.name}</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-warm-gray">
              <Clock className="w-4 h-4" />
              <span className="text-sm italic">No vibe set</span>
            </div>
          )}
        </div>

        {/* Period Selection Grid — DM only */}
        {userRole === 'DM' && periods.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {periods.map((period) => {
              const isActive = currentVibe === period.name;
              return (
                <button
                  key={period.name}
                  onClick={() => handleChangePeriod(period.name)}
                  disabled={isSwitching}
                  title={`Set vibe to ${period.name}`}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border text-left
                    transition-all duration-200 text-sm
                    ${isActive
                      ? 'border-moss-green bg-moss-green/10 text-moss-green font-semibold ring-1 ring-moss-green/30'
                      : 'border-moss-green/20 bg-parchment/40 text-stone-gray hover:bg-parchment/80 hover:border-moss-green/40'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-black/10"
                    style={{ backgroundColor: period.hue }}
                  />
                  <span className="capitalize truncate">{period.name}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-moss-green flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Player-only hint when no vibe is set */}
        {userRole !== 'DM' && !currentVibe && (
          <p className="text-xs text-warm-gray text-center italic">
            Waiting for the DM to set the scene...
          </p>
        )}
      </div>

      {/* Configure Modal */}
      {isConfigureOpen && (
        <ConfigureVibeModal onClose={() => setIsConfigureOpen(false)} />
      )}
    </>
  );
}
