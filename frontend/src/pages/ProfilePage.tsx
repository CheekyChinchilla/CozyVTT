// ============================================
// Profile Page
// Protected route - requires authentication
// ============================================

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { profileService } from '@/services/profile.service';
import { api } from '@/services/api';
import MFASection from '@/components/profile/MFASection';
import ThemePicker, { DEFAULT_CUSTOM_COLORS, type ThemePickerColors } from '@/components/appearance/ThemePicker';
import type { UserPreferences } from '@/types';
import {
  Upload,
  Loader2,
  CheckCircle,
  User,
  AlertTriangle,
  Eye,
  EyeOff,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Move,
} from 'lucide-react';

// Legacy localStorage key — superseded by backend-persisted preferences.
// We delete it on first authenticated load so it doesn't linger on devices.
const LEGACY_PREFS_KEY = 'cozyvtt_prefs';

function clearLegacyPrefs() {
  try { localStorage.removeItem(LEGACY_PREFS_KEY); } catch { /* noop */ }
}

// ============================================
// Avatar Crop Modal
// Canvas-based square crop with pan + zoom
// ============================================

interface AvatarCropModalProps {
  imageSrc: string;
  onConfirm: (croppedBlob: Blob) => void;
  onClose: () => void;
}

function AvatarCropModal({ imageSrc, onConfirm, onClose }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Crop state: offset = top-left of the visible area in image coords, zoom = scale
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [offsetStart, setOffsetStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);

  const CANVAS_SIZE = 300; // square preview canvas

  // Load image and initialize centering
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Center the image at zoom=1, cropping to square
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      setZoom(1);
      setOffset({
        x: (img.naturalWidth - minDim) / 2,
        y: (img.naturalHeight - minDim) / 2,
      });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Redraw canvas whenever state changes
  useEffect(() => {
    if (!imgLoaded || !imageRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    // visibleSize: how many image pixels fit in the canvas view at this zoom
    const visibleSize = minDim / zoom;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(
      img,
      offset.x,
      offset.y,
      visibleSize,
      visibleSize,
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE,
    );
  }, [imgLoaded, zoom, offset]);

  const clampOffset = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      if (!imageRef.current) return { x, y };
      const img = imageRef.current;
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const visibleSize = minDim / zoom;
      return {
        x: Math.max(0, Math.min(x, img.naturalWidth - visibleSize)),
        y: Math.max(0, Math.min(y, img.naturalHeight - visibleSize)),
      };
    },
    [zoom],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setOffsetStart({ ...offset });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !imageRef.current) return;
    const img = imageRef.current;
    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    const visibleSize = minDim / zoom;
    // pixels-per-canvas-pixel in image space
    const scale = visibleSize / CANVAS_SIZE;
    const dx = (e.clientX - dragStart.x) * scale;
    const dy = (e.clientY - dragStart.y) * scale;
    setOffset(clampOffset(offsetStart.x - dx, offsetStart.y - dy));
  };

  const handleMouseUp = () => setDragging(false);

  const handleZoomChange = (newZoom: number) => {
    if (!imageRef.current) return;
    // Keep center of view stable when zooming
    const img = imageRef.current;
    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    const oldVisible = minDim / zoom;
    const newVisible = minDim / newZoom;
    const dx = (oldVisible - newVisible) / 2;
    setZoom(newZoom);
    setOffset(clampOffset(offset.x + dx, offset.y + dx));
  };

  const handleConfirm = () => {
    if (!canvasRef.current) return;
    // Render final crop at 512×512
    const out = document.createElement('canvas');
    out.width = 512;
    out.height = 512;
    const ctx = out.getContext('2d');
    if (!ctx || !imageRef.current) return;
    const img = imageRef.current;
    const minDim = Math.min(img.naturalWidth, img.naturalHeight);
    const visibleSize = minDim / zoom;
    ctx.drawImage(img, offset.x, offset.y, visibleSize, visibleSize, 0, 0, 512, 512);
    out.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-soft-cream border border-moss-green/30 rounded-xl shadow-2xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-moss-green/15">
          <h3 className="text-base font-semibold text-moss-green">Crop Avatar</h3>
          <p className="text-xs text-warm-gray flex items-center gap-1">
            <Move className="w-3 h-3" /> Drag to reposition
          </p>
        </div>

        {/* Canvas */}
        <div className="p-5 space-y-4">
          <div className="flex justify-center">
            <div className="relative rounded-full overflow-hidden border-2 border-moss-green/30 w-[300px] h-[300px]">
              <canvas
                ref={canvasRef}
                width={CANVAS_SIZE}
                height={CANVAS_SIZE}
                className="cursor-grab active:cursor-grabbing block"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              {!imgLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-moss-green/10">
                  <Loader2 className="w-8 h-8 text-moss-green animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-stone-gray flex-shrink-0" aria-hidden="true" />
            <label htmlFor="avatar-zoom" className="sr-only">Zoom</label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="flex-1 accent-moss-green"
            />
            <ZoomIn className="w-4 h-4 text-stone-gray flex-shrink-0" aria-hidden="true" />
          </div>
          <p className="text-xs text-warm-gray text-center">
            Saved as 512×512 JPEG. Drag to reposition, slide to zoom.
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleConfirm} disabled={!imgLoaded} className="btn-primary flex-1">
            Apply & Upload
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Inline section helpers
// ============================================

function SaveBar({
  onSave,
  onCancel,
  saving,
  success,
  error,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  success: string;
  error: string;
}) {
  return (
    <div className="flex items-center gap-3 pt-4 border-t border-moss-green/10 mt-4">
      {error && <p className="text-xs text-red-600 flex-1">{error}</p>}
      {success && (
        <p className="text-xs text-moss-green flex items-center gap-1 flex-1">
          <CheckCircle className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      {!error && !success && <span className="flex-1" />}
      <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary text-sm py-1.5 px-3">
        Cancel
      </button>
      <button type="button" onClick={onSave} disabled={saving} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-2">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save Changes
      </button>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function ProfilePage() {
  const { user, logout, refreshUser, changePassword } = useAuth();
  const { appearance: systemAppearance, applyUserPreferences } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Profile info edit ──
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // ── Avatar crop ──
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [avatarSuccess, setAvatarSuccess] = useState('');

  // ── Change password ──
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  // ── Preferences (per-user, backend-persisted) ──
  const [prefs, setPrefs] = useState<UserPreferences>({});
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delete account ──
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ── Hydrate fields when user loads ──
  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
      setBio(user.bio ?? '');
    }
  }, [user?.id]); // only on user change

  // ── Logout ──
  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  // ──────────────────────────────────────────
  // Profile save
  // ──────────────────────────────────────────

  const startEditProfile = () => {
    setDisplayName(user?.displayName ?? '');
    setBio(user?.bio ?? '');
    setProfileError('');
    setProfileSuccess('');
    setEditingProfile(true);
  };

  const cancelEditProfile = () => {
    setEditingProfile(false);
    setProfileError('');
    setProfileSuccess('');
  };

  const saveProfile = async () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setProfileError('Display name must be at least 2 characters');
      return;
    }
    if (trimmedName.length > 50) {
      setProfileError('Display name must be 50 characters or less');
      return;
    }
    if (bio.length > 500) {
      setProfileError('Bio must be 500 characters or less');
      return;
    }

    setProfileSaving(true);
    setProfileError('');
    try {
      await profileService.updateProfile(user!.id, {
        displayName: trimmedName,
        bio: bio.trim() || null,
      });
      await refreshUser();
      setProfileSuccess('Profile updated!');
      setTimeout(() => { setProfileSuccess(''); setEditingProfile(false); }, 1500);
    } catch (err: any) {
      setProfileError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  // ──────────────────────────────────────────
  // Avatar upload with crop
  // ──────────────────────────────────────────

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please select an image file (JPEG, PNG, or WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('File must be smaller than 10MB');
      return;
    }
    setAvatarError('');
    setAvatarSuccess('');
    // Load into crop modal
    const reader = new FileReader();
    reader.onloadend = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropConfirm = async (blob: Blob) => {
    setCropSrc(null);
    setAvatarUploading(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      // Show preview immediately
      setAvatarPreview(URL.createObjectURL(blob));
      await profileService.uploadAvatar(user!.id, user!.displayName, file);
      await refreshUser();
      setAvatarSuccess('Avatar updated!');
      setTimeout(() => setAvatarSuccess(''), 3000);
    } catch (err: any) {
      setAvatarError(err.response?.data?.message || 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  // ──────────────────────────────────────────
  // Change password
  // ──────────────────────────────────────────

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!pwCurrent) { setPwError('Current password is required'); return; }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pwNew !== pwConfirm) { setPwError('Passwords do not match'); return; }
    if (pwNew === pwCurrent) { setPwError('New password must differ from current password'); return; }

    setPwSaving(true);
    try {
      await changePassword(pwCurrent, pwNew);
      setPwSuccess('Password changed successfully!');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      setTimeout(() => setPwSuccess(''), 4000);
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setPwSaving(false);
    }
  };

  // ──────────────────────────────────────────
  // Preferences (backend-persisted, per-user)
  // ──────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await api.getUserPreferences(user.id);
        if (cancelled) return;
        clearLegacyPrefs();
        setPrefs(fetched ?? {});
      } catch (err: any) {
        if (!cancelled) setPrefsError(err?.response?.data?.message || 'Failed to load preferences');
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  /**
   * Persist a partial preferences update. Optimistically applies the new
   * values locally (so the UI is instant + the theme repaints immediately),
   * then sends the patch to the backend. On failure we surface an error but
   * keep the optimistic value — re-loading the page will reconcile.
   */
  const savePref = useCallback(
    async (updates: Partial<UserPreferences>) => {
      if (!user?.id) return;
      setPrefsError('');
      const merged: UserPreferences = { ...prefs, ...updates };
      setPrefs(merged);
      // Theme/font changes should repaint immediately even before the API
      // call resolves — applyUserPreferences also updates the localStorage
      // cache so reloads paint without flash.
      applyUserPreferences(merged);

      setPrefsSaving(true);
      try {
        const persisted = await api.updateUserPreferences(user.id, updates);
        setPrefs(persisted);
        // Refresh AuthContext so user.preferences in /auth/me stays in sync —
        // ThemeSyncBridge will see the new value but treat it as a no-op
        // since applyUserPreferences was already called above.
        await refreshUser();

        setPrefsSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setPrefsSaved(false), 2000);
      } catch (err: any) {
        setPrefsError(err?.response?.data?.message || 'Failed to save preferences');
      } finally {
        setPrefsSaving(false);
      }
    },
    [user?.id, prefs, applyUserPreferences, refreshUser]
  );

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // ──────────────────────────────────────────
  // Delete account
  // ──────────────────────────────────────────

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Type DELETE to confirm');
      return;
    }
    if (!deletePassword) {
      setDeleteError('Password is required');
      return;
    }
    setDeleting(true);
    try {
      await profileService.deleteAccount(deletePassword);
      await logout();
      navigate('/auth/login');
    } catch (err: any) {
      setDeleteError(err.response?.data?.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  // ──────────────────────────────────────────
  // Avatar display URL
  // ──────────────────────────────────────────

  const avatarDisplayUrl = avatarPreview || user?.avatarUrl || null;

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <header className="bg-moss-green/10 border-b border-moss-green/20">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg hover:bg-moss-green/10 transition-colors text-moss-green"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-moss-green font-heading">Profile & Settings</h1>
            <p className="text-sm text-warm-gray">Manage your account and preferences</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Profile Information ── */}
        <section className="glass-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-moss-green">Profile Information</h2>
            {!editingProfile && (
              <button onClick={startEditProfile} className="btn-secondary text-sm py-1.5 px-3">
                Edit
              </button>
            )}
          </div>

          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div
                className="relative group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarDisplayUrl ? (
                  <img
                    src={avatarDisplayUrl}
                    alt={user?.displayName}
                    className="w-20 h-20 rounded-full object-cover border-2 border-moss-green/30"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-moss-green/20 flex items-center justify-center border-2 border-moss-green/30">
                    <User className="w-9 h-9 text-moss-green/60" />
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {avatarUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 text-white" />
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              {avatarError && <p className="mt-1 text-xs text-red-600 max-w-[5rem]">{avatarError}</p>}
              {avatarSuccess && (
                <p className="mt-1 text-xs text-moss-green flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {avatarSuccess}
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-4">
              {/* Display name */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Display Name</label>
                {editingProfile ? (
                  <>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={50}
                      className="input-cozy w-full"
                      autoFocus
                    />
                    <p className="text-xs text-warm-gray/70 mt-0.5 text-right">{displayName.length}/50</p>
                  </>
                ) : (
                  <p className="text-moss-green font-medium">{user?.displayName}</p>
                )}
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Email</label>
                <p className="text-moss-green">{user?.email}</p>
                <p className="text-xs text-warm-gray/70">Email cannot be changed.</p>
              </div>

              {/* Role (read-only) */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Platform Role</label>
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-moss-green/10 text-moss-green border border-moss-green/20">
                  {user?.platformRole}
                </span>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">
                  Bio <span className="font-normal text-warm-gray">(optional)</span>
                </label>
                {editingProfile ? (
                  <>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Tell the table a bit about yourself..."
                      className="input-cozy w-full resize-none text-sm"
                    />
                    <p className="text-xs text-warm-gray/70 mt-0.5 text-right">{bio.length}/500</p>
                  </>
                ) : (
                  <p className="text-sm text-warm-gray">
                    {user?.bio || <span className="italic opacity-60">No bio yet.</span>}
                  </p>
                )}
              </div>

              {/* Save bar */}
              {editingProfile && (
                <SaveBar
                  onSave={saveProfile}
                  onCancel={cancelEditProfile}
                  saving={profileSaving}
                  success={profileSuccess}
                  error={profileError}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Security ── */}
        <section className="glass-panel p-6 space-y-6">
          <h2 className="text-xl font-semibold text-moss-green">Security</h2>

          {/* MFA */}
          <div>
            <MFASection />
          </div>

          <div className="border-t border-moss-green/10 pt-6">
            <h3 className="text-sm font-semibold text-moss-green mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
              {pwError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{pwError}</div>
              )}
              {pwSuccess && (
                <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> {pwSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Current Password</label>
                <div className="relative">
                  <input
                    type={showPwCurrent ? 'text' : 'password'}
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className="input-cozy w-full pr-10"
                    placeholder="Current password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-gray/50 hover:text-stone-gray"
                    aria-label={showPwCurrent ? 'Hide current password' : 'Show current password'}
                  >
                    {showPwCurrent ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPwNew ? 'text' : 'password'}
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className="input-cozy w-full pr-10"
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-gray/50 hover:text-stone-gray"
                    aria-label={showPwNew ? 'Hide new password' : 'Show new password'}
                  >
                    {showPwNew ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className={`input-cozy w-full ${pwConfirm && pwNew !== pwConfirm ? 'border-red-400' : ''}`}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                {pwConfirm && pwNew !== pwConfirm && (
                  <p className="text-xs text-red-600 mt-0.5">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
                className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {pwSaving ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>
        </section>

        {/* ── Appearance + Preferences ── */}
        <section className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-moss-green">Appearance</h2>
              <p className="text-xs text-warm-gray mt-0.5">
                Pick your theme and font — saved automatically to your account.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {prefsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-warm-gray" />}
              {prefsSaved && !prefsSaving && (
                <p className="text-xs text-moss-green flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </p>
              )}
            </div>
          </div>

          {prefsError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              {prefsError}
            </div>
          )}

          {!prefsLoaded ? (
            <div className="flex items-center gap-2 py-6 text-sm text-warm-gray">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your preferences…
            </div>
          ) : (
            <ThemePicker
              themeId={prefs.themeId ?? systemAppearance?.themeId ?? 'cozy-default'}
              fontId={prefs.fontId ?? systemAppearance?.fontId ?? 'default'}
              customColors={
                (prefs.customThemeColors ??
                  (systemAppearance?.themeId === 'custom' && systemAppearance?.customThemeColors
                    ? (systemAppearance.customThemeColors as unknown as ThemePickerColors)
                    : DEFAULT_CUSTOM_COLORS))
              }
              onChange={(next) => {
                const updates: Partial<UserPreferences> = {
                  themeId: next.themeId,
                  fontId: next.fontId,
                };
                // Only persist customThemeColors when 'custom' is selected;
                // for preset themes, explicitly clear to keep storage tidy.
                updates.customThemeColors = next.themeId === 'custom' ? next.customColors : null;
                void savePref(updates);
              }}
            />
          )}
        </section>

        {/* ── Danger Zone ── */}
        <section className="glass-panel p-6 border-2 border-red-200/60">
          <h2 className="text-xl font-semibold text-red-600 mb-5">Danger Zone</h2>
          <div className="space-y-4">
            {/* Logout */}
            <div className="flex items-center justify-between py-3 border-b border-red-100">
              <div>
                <h3 className="text-sm font-medium text-moss-green">Sign Out</h3>
                <p className="text-xs text-warm-gray">End your current session.</p>
              </div>
              <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
                Sign Out
              </button>
            </div>

            {/* Delete account */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-medium text-red-700">Delete Account</h3>
                <p className="text-xs text-warm-gray">
                  Permanently delete your account and all data. This cannot be undone.
                </p>
              </div>
              {!deleteConfirmOpen && (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="ml-4 flex-shrink-0 text-sm py-1.5 px-3 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors font-medium"
                >
                  Delete Account
                </button>
              )}
            </div>

            {deleteConfirmOpen && (
              <form onSubmit={handleDeleteAccount} className="space-y-3 p-4 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-800 space-y-1">
                    <p className="font-semibold">This will permanently delete:</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>Your account and profile</li>
                      <li>All campaigns you own</li>
                      <li>All characters and messages</li>
                    </ul>
                  </div>
                </div>

                {deleteError && (
                  <p className="text-sm text-red-700 bg-red-100 border border-red-300 rounded p-2">{deleteError}</p>
                )}

                <div>
                  <label className="block text-xs font-medium text-red-800 mb-1">
                    Type <strong>DELETE</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="input-cozy w-full border-red-300 focus:ring-red-400"
                    placeholder="DELETE"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-red-800 mb-1">Your Password</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="input-cozy w-full border-red-300 focus:ring-red-400"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setDeleteConfirmOpen(false); setDeletePassword(''); setDeleteConfirmText(''); setDeleteError(''); }}
                    disabled={deleting}
                    className="btn-secondary flex-1 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleting || deleteConfirmText !== 'DELETE' || !deletePassword}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {deleting ? 'Deleting...' : 'Delete My Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* Avatar crop modal (portal-like rendering — outside section flow) */}
      {cropSrc && (
        <AvatarCropModal
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onClose={() => setCropSrc(null)}
        />
      )}
    </div>
  );
}
