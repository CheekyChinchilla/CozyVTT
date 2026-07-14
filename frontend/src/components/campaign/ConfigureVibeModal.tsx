/**
 * Configure Vibe Modal
 * Vibe Tracker Details
 *
 * DM-only modal for adding, editing, and removing time-of-day periods.
 * Each period has a name, hue color, CSS filter (built via sliders), and audio track (stub).
 * Saves to PUT /api/campaigns/:id/vibe — backend validates and persists.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, RotateCcw, Music } from 'lucide-react';
import { useCampaign } from '@/contexts/CampaignContext';
import Toast, { useToast } from '@/components/Toast';
import api from '@/services/api';
import type { VibePeriod, VibeSettings } from '@/types';
import { Button, Modal } from '@/components/ui';

// ============================================
// Default presets (mirrors backend vibe-presets.ts)
// ============================================

const DEFAULT_PERIODS: VibePeriod[] = [
  { name: 'dawn', hue: '#FFB88C', filter: 'brightness(0.9) saturate(1.1)', audio: 'birds_chirping.mp3' },
  { name: 'day',  hue: '#FFFACD', filter: 'brightness(1.0) saturate(1.0)', audio: null },
  { name: 'dusk', hue: '#FF9966', filter: 'brightness(0.85) saturate(1.3) hue-rotate(10deg)', audio: 'evening_breeze.mp3' },
  { name: 'night', hue: '#1A1A2E', filter: 'brightness(0.6) saturate(0.7) contrast(1.1)', audio: 'night_crickets.mp3' },
];

// ============================================
// Filter string helpers
// ============================================

interface FilterValues {
  brightness: number;  // 0.3 – 1.5
  saturate: number;    // 0.0 – 2.0
  contrast: number;    // 0.5 – 1.5
  hueRotate: number;   // -90 – 90 (degrees)
}

function parseFilter(filterStr: string): FilterValues {
  const get = (name: string, defaultVal: number) => {
    const m = filterStr.match(new RegExp(`${name}\\(([\\d.-]+)(?:deg)?\\)`));
    return m ? parseFloat(m[1]) : defaultVal;
  };
  return {
    brightness: get('brightness', 1.0),
    saturate:   get('saturate',   1.0),
    contrast:   get('contrast',   1.0),
    hueRotate:  get('hue-rotate', 0),
  };
}

function buildFilter(v: FilterValues): string {
  const parts: string[] = [];
  if (Math.abs(v.brightness - 1.0) > 0.001) parts.push(`brightness(${v.brightness.toFixed(2)})`);
  if (Math.abs(v.saturate - 1.0) > 0.001)   parts.push(`saturate(${v.saturate.toFixed(2)})`);
  if (Math.abs(v.contrast - 1.0) > 0.001)   parts.push(`contrast(${v.contrast.toFixed(2)})`);
  if (Math.abs(v.hueRotate) > 0.5)           parts.push(`hue-rotate(${Math.round(v.hueRotate)}deg)`);
  return parts.length ? parts.join(' ') : 'brightness(1.0) saturate(1.0)';
}

// ============================================
// Period editor sub-component
// ============================================

interface PeriodEditorProps {
  period: VibePeriod;
  index: number;
  canDelete: boolean;
  onChange: (index: number, updated: VibePeriod) => void;
  onDelete: (index: number) => void;
}

function PeriodEditor({ period, index, canDelete, onChange, onDelete }: PeriodEditorProps) {
  const filterVals = parseFilter(period.filter ?? '');

  const updateFilterVal = (key: keyof FilterValues, val: number) => {
    const updated = { ...filterVals, [key]: val };
    onChange(index, { ...period, filter: buildFilter(updated) });
  };

  return (
    <div className="p-4 rounded-lg bg-parchment border border-moss-green/20 space-y-4">
      {/* Period name + delete */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-stone-gray mb-1">Period Name</label>
          <input
            type="text"
            value={period.name}
            maxLength={50}
            onChange={(e) => onChange(index, { ...period, name: e.target.value })}
            className="input-cozy w-full"
            placeholder="e.g. dawn, midday, twilight..."
          />
        </div>
        <button
          onClick={() => onDelete(index)}
          disabled={!canDelete}
          title={canDelete ? 'Remove this period' : 'Cannot remove the only period'}
          className="mt-5 p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Hue color + preview */}
      <div>
        <label className="block text-xs font-medium text-stone-gray mb-2">Hue Color</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={period.hue}
            onChange={(e) => onChange(index, { ...period, hue: e.target.value })}
            className="w-10 h-10 rounded-lg border border-moss-green/20 cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={period.hue}
            maxLength={7}
            pattern="^#[0-9A-Fa-f]{6}$"
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                onChange(index, { ...period, hue: v });
              }
            }}
            className="input-cozy w-32 font-mono text-sm"
            placeholder="#FF9966"
          />
          {/* Preview swatch */}
          <div className="flex-1 h-8 rounded-lg ring-1 ring-black/10" style={{ backgroundColor: period.hue }} />
        </div>
      </div>

      {/* Filter sliders */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-stone-gray">Visual Filter</p>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {/* Brightness */}
          <div>
            <div className="flex justify-between text-xs text-warm-gray mb-1">
              <span>Brightness</span>
              <span>{filterVals.brightness.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.3} max={1.5} step={0.05}
              value={filterVals.brightness}
              onChange={(e) => updateFilterVal('brightness', parseFloat(e.target.value))}
              className="w-full accent-moss-green"
            />
          </div>

          {/* Saturation */}
          <div>
            <div className="flex justify-between text-xs text-warm-gray mb-1">
              <span>Saturation</span>
              <span>{filterVals.saturate.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0} max={2} step={0.05}
              value={filterVals.saturate}
              onChange={(e) => updateFilterVal('saturate', parseFloat(e.target.value))}
              className="w-full accent-moss-green"
            />
          </div>

          {/* Contrast */}
          <div>
            <div className="flex justify-between text-xs text-warm-gray mb-1">
              <span>Contrast</span>
              <span>{filterVals.contrast.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.5} max={1.5} step={0.05}
              value={filterVals.contrast}
              onChange={(e) => updateFilterVal('contrast', parseFloat(e.target.value))}
              className="w-full accent-moss-green"
            />
          </div>

          {/* Hue rotate */}
          <div>
            <div className="flex justify-between text-xs text-warm-gray mb-1">
              <span>Hue Shift</span>
              <span>{Math.round(filterVals.hueRotate)}°</span>
            </div>
            <input
              type="range"
              min={-90} max={90} step={5}
              value={filterVals.hueRotate}
              onChange={(e) => updateFilterVal('hueRotate', parseFloat(e.target.value))}
              className="w-full accent-moss-green"
            />
          </div>
        </div>

        {/* Computed filter string */}
        <p className="text-xs font-mono text-stone-gray bg-parchment px-2 py-1 rounded border border-moss-green/20 truncate">
          {period.filter || 'brightness(1.0) saturate(1.0)'}
        </p>
      </div>

      {/* Filter preview */}
      <div>
        <p className="text-xs font-medium text-stone-gray mb-2">Preview</p>
        <div className="relative h-16 rounded-lg overflow-hidden ring-1 ring-moss-green/20">
          {/* Simulated map background */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-green-800 via-green-600 to-yellow-700"
            style={{ filter: period.filter || undefined }}
          />
          {/* Hue overlay */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: period.hue, opacity: 0.15, mixBlendMode: 'multiply' }}
          />
          <span className="absolute bottom-1 right-2 text-xs text-white/80 drop-shadow capitalize">
            {period.name}
          </span>
        </div>
      </div>

      {/* Audio note */}
      <div>
        <label className="block text-xs font-medium text-stone-gray mb-1">
          <Music className="w-3 h-3 inline mr-1" />
          Audio Note (optional)
        </label>
        <input
          type="text"
          value={period.audio ?? ''}
          onChange={(e) => onChange(index, { ...period, audio: e.target.value || null })}
          className="input-cozy w-full"
          placeholder="e.g. birds_chirping.mp3"
        />
        <p className="text-xs text-warm-gray mt-1">
          Use the Atmosphere panel during a session to sync ambient audio in real time for all players.
        </p>
      </div>
    </div>
  );
}

// ============================================
// Main Modal
// ============================================

interface ConfigureVibeModalProps {
  onClose: () => void;
}

export default function ConfigureVibeModal({ onClose }: ConfigureVibeModalProps) {
  const { campaign, updateVibeSettings } = useCampaign();
  const { toast, showToast, hideToast } = useToast();

  // Initialize local state from campaign's current vibeSettings
  const [periods, setPeriods] = useState<VibePeriod[]>(
    () => (campaign?.vibeSettings?.periods ?? DEFAULT_PERIODS).map((p) => ({ ...p }))
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // ============================================
  // Period CRUD
  // ============================================

  const handlePeriodChange = useCallback((index: number, updated: VibePeriod) => {
    setPeriods((prev) => prev.map((p, i) => (i === index ? updated : p)));
  }, []);

  const handleAddPeriod = () => {
    setPeriods((prev) => [
      ...prev,
      { name: `Period ${prev.length + 1}`, hue: '#AABBCC', filter: 'brightness(1.0) saturate(1.0)', audio: null },
    ]);
  };

  const handleDeletePeriod = (index: number) => {
    setPeriods((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRestoreDefaults = () => {
    setPeriods(DEFAULT_PERIODS.map((p) => ({ ...p })));
  };

  // ============================================
  // Validation
  // ============================================

  const validate = (): string | null => {
    if (periods.length === 0) return 'At least one period is required.';
    if (periods.length > 20) return 'Maximum 20 periods allowed.';
    const names = periods.map((p) => p.name.trim().toLowerCase());
    for (const name of names) {
      if (!name) return 'All period names must be non-empty.';
      if (name.length > 50) return 'Period names must be 50 characters or fewer.';
    }
    const unique = new Set(names);
    if (unique.size !== names.length) return 'Period names must be unique.';
    for (const p of periods) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(p.hue)) {
        return `"${p.name}" has an invalid hue color. Use format #RRGGBB.`;
      }
    }
    return null;
  };

  // ============================================
  // Save
  // ============================================

  const handleSave = async () => {
    const error = validate();
    if (error) {
      showToast(error, 'error');
      return;
    }

    if (!campaign) return;

    const newSettings: VibeSettings = {
      ...(campaign.vibeSettings ?? {}),
      enabled: true, // always keep enabled when DM is actively managing it
      periods: periods.map((p) => ({
        ...p,
        name: p.name.trim(),
        filter: p.filter || 'brightness(1.0) saturate(1.0)',
        audio: p.audio ?? null, // backend requires null, not undefined
      })),
    };

    setIsSaving(true);
    try {
      const result = await api.updateVibeSettings(campaign.id, newSettings);
      // Patch local context so VibeTracker reflects new periods immediately
      updateVibeSettings(result.vibeSettings);
      showToast('Vibe periods saved!', 'success');
      setTimeout(onClose, 900);
    } catch (err: any) {
      console.error('Failed to save vibe settings:', err);
      showToast(err.response?.data?.message || 'Failed to save vibe settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <>
      <Modal open onClose={handleClose} title="Configure Vibe Periods" icon={Music} size="lg" closeDisabled={isSaving}>
          <p className="text-sm text-ink-muted -mt-4 mb-6">
            Define the time-of-day periods and their visual effects.
          </p>

          {/* Period Editors */}
          <div className="space-y-4 mb-6">
            {periods.map((period, index) => (
              <PeriodEditor
                key={index}
                period={period}
                index={index}
                canDelete={periods.length > 1}
                onChange={handlePeriodChange}
                onDelete={handleDeletePeriod}
              />
            ))}
          </div>

          {/* Add Period */}
          {periods.length < 20 && (
            <button
              onClick={handleAddPeriod}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-moss-green/30 text-moss-green hover:border-moss-green/60 hover:bg-moss-green/5 transition-colors mb-6"
            >
              <Plus className="w-4 h-4" />
              Add Period
            </button>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-moss-green/20">
            <button
              onClick={handleRestoreDefaults}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-gray hover:bg-parchment transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restore Defaults
            </button>

            <div className="flex items-center gap-3">
              <Button
                onClick={onClose}
                disabled={isSaving}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || periods.length === 0}
                
              >
                {isSaving ? 'Saving...' : 'Save Periods'}
              </Button>
            </div>
          </div>
      </Modal>

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={hideToast} />
    </>
  );
}
