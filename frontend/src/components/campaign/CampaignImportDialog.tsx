// ============================================
// CampaignImportDialog
// Multi-step modal: Upload → Preview → Options → Importing → Done
// ============================================

import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Upload,
  FileArchive,
  Map as MapIcon,
  Swords,
  Package,
  Music,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import type { CampaignImportPreview, CampaignImportResult } from '@/types';
import Button from '@/components/ui/Button';

interface CampaignImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'importing' | 'done' | 'error';

export default function CampaignImportDialog({
  isOpen,
  onClose,
  onSuccess,
}: CampaignImportDialogProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CampaignImportPreview | null>(null);
  const [result, setResult] = useState<CampaignImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Options
  const [campaignName, setCampaignName] = useState('');
  const [importTokens, setImportTokens] = useState(true);

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setResult(null);
    setErrorMessage('');
    setLoading(false);
    setCampaignName('');
    setImportTokens(true);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const previewData = await api.previewCampaignImport(formData);
      setPreview(previewData);
      setCampaignName(previewData.campaignName);
      setStep('preview');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to read archive.';
      setErrorMessage(msg);
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleImport = async () => {
    if (!file) return;

    setStep('importing');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (campaignName.trim()) {
        formData.append('campaignName', campaignName.trim());
      }
      formData.append('importTokens', String(importTokens));

      const importResult = await api.importCampaign(formData);
      setResult(importResult);
      setStep('done');
      onSuccess?.();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Import failed.';
      setErrorMessage(msg);
      setStep('error');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-paper-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-moss-green/10 border-b border-moss-green/20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileArchive className="w-5 h-5 text-brand-ink" />
              <h2 className="text-lg font-bold text-brand-ink">Import Campaign</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-moss-green/10 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-stone-gray" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* ── UPLOAD STEP ── */}
            {step === 'upload' && (
              <div>
                <div
                  className="border-2 border-dashed border-moss-green/30 rounded-xl p-8 text-center
                             hover:border-moss-green/50 hover:bg-moss-green/5 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-10 h-10 text-brand-ink animate-spin" />
                      <p className="text-sm text-stone-gray">Reading archive...</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-brand-ink/50 mx-auto mb-3" />
                      <p className="text-sm font-medium text-stone-gray mb-1">
                        Drop a <span className="font-mono text-brand-ink">.cozyvtt</span> file here
                      </p>
                      <p className="text-xs text-warm-gray">or click to browse</p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".cozyvtt,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />
              </div>
            )}

            {/* ── PREVIEW STEP ── */}
            {step === 'preview' && preview && (
              <div className="space-y-5">
                {/* Archive summary */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard icon={<MapIcon className="w-4 h-4" />} label="Maps" value={preview.mapCount} />
                  <StatCard icon={<Swords className="w-4 h-4" />} label="Creatures" value={preview.creatureCount} />
                  <StatCard icon={<Package className="w-4 h-4" />} label="Token Templates" value={preview.tokenTemplateCount} />
                  <StatCard icon={<Music className="w-4 h-4" />} label="Audio" value={preview.includesAudio ? 'Yes' : 'No'} />
                </div>

                <div className="text-xs text-warm-gray flex items-center justify-between">
                  <span>Total tokens: {preview.tokenCount} | Assets: {preview.assetCount}</span>
                  <span>{formatBytes(preview.totalSizeBytes)}</span>
                </div>

                <div className="text-xs text-warm-gray">
                  Exported from {preview.exportedFrom} on{' '}
                  {new Date(preview.exportedAt).toLocaleDateString()}
                </div>

                {/* Options */}
                <div className="space-y-3 pt-2 border-t border-moss-green/10">
                  <div>
                    <label htmlFor="import-name" className="block text-sm font-semibold text-stone-gray mb-1">
                      Campaign Name
                    </label>
                    <input
                      id="import-name"
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      maxLength={200}
                      className="input-cozy w-full"
                      placeholder={preview.campaignName}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-stone-gray">Import tokens</p>
                      <p className="text-xs text-warm-gray">Include tokens placed on maps</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={importTokens}
                      onClick={() => setImportTokens((v) => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-moss-green/50 ${
                        importTokens ? 'bg-moss-green' : 'bg-warm-gray/30'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          importTokens ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleClose}
                    variant="secondary" className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={!campaignName.trim()}
                    className="flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-4 h-4" />
                    Import Campaign
                  </Button>
                </div>
              </div>
            )}

            {/* ── IMPORTING STEP ── */}
            {step === 'importing' && (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 text-brand-ink animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-stone-gray mb-1">Importing campaign...</p>
                <p className="text-xs text-warm-gray">This may take a moment for large archives.</p>
              </div>
            )}

            {/* ── DONE STEP ── */}
            {step === 'done' && result && (
              <div className="text-center py-6 space-y-4">
                <CheckCircle2 className="w-12 h-12 text-brand-ink mx-auto" />
                <div>
                  <p className="text-lg font-bold text-brand-ink mb-1">Import Complete!</p>
                  <p className="text-sm text-stone-gray">
                    <span className="font-semibold">{result.campaignName}</span> is ready.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm max-w-xs mx-auto">
                  <div className="text-warm-gray text-right">Maps:</div>
                  <div className="text-stone-gray font-medium text-left">{result.mapCount}</div>
                  <div className="text-warm-gray text-right">Tokens:</div>
                  <div className="text-stone-gray font-medium text-left">{result.tokenCount}</div>
                  <div className="text-warm-gray text-right">Creatures:</div>
                  <div className="text-stone-gray font-medium text-left">{result.creatureCount}</div>
                  <div className="text-warm-gray text-right">Templates:</div>
                  <div className="text-stone-gray font-medium text-left">{result.tokenTemplateCount}</div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleClose} variant="secondary" className="flex-1">
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                    handleClose();
                    navigate(`/campaign/${result.campaignId}`);
                    }}
                    className="flex-1"
                  >
                    Open Campaign
                  </Button>
                </div>
              </div>
            )}

            {/* ── ERROR STEP ── */}
            {step === 'error' && (
              <div className="text-center py-6 space-y-4">
                <AlertCircle className="w-12 h-12 text-danger-ink mx-auto" />
                <div>
                  <p className="text-lg font-bold text-danger-ink mb-1">Import Failed</p>
                  <p className="text-sm text-stone-gray">{errorMessage}</p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={handleClose} variant="secondary" className="flex-1">
                    Close
                  </Button>
                  <Button onClick={resetState} className="flex-1">
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Small stat card for preview ────────────────
function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-parchment/50 border border-moss-green/10">
      <span className="text-brand-ink">{icon}</span>
      <div>
        <p className="text-xs text-warm-gray">{label}</p>
        <p className="text-sm font-semibold text-stone-gray">{value}</p>
      </div>
    </div>
  );
}
