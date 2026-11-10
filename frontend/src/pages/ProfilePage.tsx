// ============================================
// Profile Page
// Protected route - requires authentication
// ============================================

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { profileService } from '@/services/profile.service';
import { api } from '@/services/api';
import MFASection from '@/components/profile/MFASection';
import ChangeEmailForm from '@/components/profile/ChangeEmailForm';
import ThemePicker, { DEFAULT_CUSTOM_COLORS, type ThemePickerColors } from '@/components/appearance/ThemePicker';
import { AssetType } from '@/types';
import type { UserPreferences } from '@/types';
import { useServerConfigQuery } from '@/hooks/queries';
import { getUploadLimit, formatUploadLimit } from '@/utils/uploadLimits';
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
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SIDEWAYS_QUERY } from '@/constants/layout';
import { apiErrorMessage } from '@/utils/errors';
import { isStrongPassword } from '@/utils/validation';
import { DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH } from '@/constants/accountLimits';

// Legacy localStorage key — superseded by backend-persisted preferences.
// We delete it on first authenticated load so it doesn't linger on devices.
const LEGACY_PREFS_KEY = 'cozyvtt_prefs';

function clearLegacyPrefs() {
  try { localStorage.removeItem(LEGACY_PREFS_KEY); } catch { /* noop */ }
}

/** How long a dragged custom colour has to stay put before it is saved. */
const PREFS_SAVE_DELAY_MS = 400;

// ============================================
// Avatar Crop Modal
// Canvas-based square crop with pan + zoom
// ============================================

interface AvatarCropModalProps {
  imageSrc: string;
  onConfirm: (croppedBlob: Blob) => void;
  onClose: () => void;
}

/** The preview canvas's own pixels; it is drawn smaller where the screen is. */
const CANVAS_SIZE = 300;
/** How far one arrow key moves the picture, in screen pixels; with Shift, five times as far. */
const NUDGE_PX = 10;
const NUDGES = new Map<string, { x: number; y: number }>([
  ['ArrowLeft', { x: -1, y: 0 }],
  ['ArrowRight', { x: 1, y: 0 }],
  ['ArrowUp', { x: 0, y: -1 }],
  ['ArrowDown', { x: 0, y: 1 }],
]);

function AvatarCropModal({ imageSrc, onConfirm, onClose }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // On a phone on its side the picture and its controls sit side by side.
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const hintId = useId();

  // Crop state: offset = top-left of the visible area in image coords, zoom = scale
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  /** The pointer moving the picture, where it went down and where the picture was then. */
  const drag = useRef<{ pointerId: number; x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

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

  /**
   * How many of the picture's pixels one screen pixel over the crop area is.
   * The canvas is drawn at the size the screen leaves it, so this is read
   * from the canvas as drawn.
   */
  const picturePerScreenPixel = (): number => {
    const img = imageRef.current;
    if (!img) return 0;
    const visibleSize = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
    const shown = canvasRef.current?.getBoundingClientRect().width || CANVAS_SIZE;
    return visibleSize / shown;
  };

  // Pointer events, so a finger and a pen move the picture as a mouse does.
  // The crop area takes no touch gestures of its own (touch-none), so a drag
  // there never scrolls the page; pointer capture keeps the drag going when
  // the pointer leaves it.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imgLoaded || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, offset: { ...offset } };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== e.pointerId) return;
    const scale = picturePerScreenPixel();
    const dx = (e.clientX - start.x) * scale;
    const dy = (e.clientY - start.y) * scale;
    setOffset(clampOffset(start.offset.x - dx, start.offset.y - dy));
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  // The arrow keys move the picture as a drag that way does.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const way = NUDGES.get(e.key);
    if (!way || !imgLoaded) return;
    e.preventDefault();
    const step = NUDGE_PX * (e.shiftKey ? 5 : 1) * picturePerScreenPixel();
    setOffset(clampOffset(offset.x - way.x * step, offset.y - way.y * step));
  };

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

  // The window fits a phone 360 px tall on its side, with a finger as the
  // pointer. Modal is at most 90dvh (324 px there); its padding (24 px from
  // 640 px wide), border and header (the 44 px close button and 24 px below
  // it) take 118, leaving 206 for the picture beside its controls. The
  // picture takes 90dvh less 7.5rem, 204; the controls are the 44 px slider,
  // the hint and the buttons in one 44 px row, 12 px apart, so they stay
  // shorter. Held upright the controls go under the picture: the padding,
  // border and header take 102 on a phone, and the controls with the gap
  // above them at most 176, so the picture takes 90dvh less 18rem (288), and
  // at most the width there is. The test of this window holds the classes.
  return (
    <Modal open onClose={onClose} title="Crop Avatar" size={sideways ? 'lg' : 'sm'}>
      <div className={sideways ? 'flex items-center gap-4' : 'space-y-4'}>
        <div className={sideways ? 'shrink-0' : 'flex justify-center'}>
          {/* A surface of its own for the arrow keys, as the map is: a screen
              reader names it and passes the keys to it. */}
          <div
            tabIndex={0}
            data-autofocus
            role="application"
            aria-label="Picture to crop"
            aria-describedby={hintId}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onLostPointerCapture={handlePointerEnd}
            onKeyDown={handleKeyDown}
            className={cn(
              'relative aspect-square rounded-full overflow-hidden border-2 border-moss-green/30',
              'touch-none cursor-grab active:cursor-grabbing focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand',
              sideways ? 'w-[min(300px,calc(90dvh-7.5rem))]' : 'w-[min(300px,100%,calc(90dvh-18rem))]'
            )}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="block size-full"
            />
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-moss-green/10">
                <Loader2 className="w-8 h-8 text-brand-ink animate-spin" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-stone-gray shrink-0" aria-hidden="true" />
            <label htmlFor="avatar-zoom" className="sr-only">Zoom</label>
            <input
              id="avatar-zoom"
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="flex-1 min-w-0 accent-moss-green touch-target"
            />
            <ZoomIn className="w-4 h-4 text-stone-gray shrink-0" aria-hidden="true" />
          </div>
          <p id={hintId} className="text-xs text-warm-gray text-center flex items-center justify-center gap-1">
            <Move className="w-3 h-3 shrink-0" aria-hidden="true" />
            Saved as 512×512 JPEG. Drag the picture or use the arrow keys to move it; slide to zoom.
          </p>
          <div className="flex gap-3">
            <Button onClick={onClose} variant="secondary" className="flex-1 touch-target">Cancel</Button>
            <Button onClick={handleConfirm} disabled={!imgLoaded} className="flex-1 touch-target">
              Apply & Upload
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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
      {error && <p className="text-xs text-danger-ink flex-1">{error}</p>}
      {success && (
        <p className="text-xs text-brand-ink flex items-center gap-1 flex-1">
          <CheckCircle className="w-3.5 h-3.5" /> {success}
        </p>
      )}
      {!error && !success && <span className="flex-1" />}
      <Button type="button" onClick={onCancel} disabled={saving} variant="secondary" className="text-sm py-1.5 px-3">
        Cancel
      </Button>
      <Button type="button" onClick={onSave} disabled={saving} className="text-sm py-1.5 px-3 flex items-center gap-2">
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Save Changes
      </Button>
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function ProfilePage() {
  const { user, logout, refreshUser, changePassword } = useAuth();
  const { data: serverConfig } = useServerConfigQuery();
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
  // The preferences as last set here, for a save made before React re-renders.
  const prefsRef = useRef<UserPreferences>({});
  // Changes not yet sent, and the timer that sends them (see savePref).
  const unsentPrefsRef = useRef<Partial<UserPreferences>>({});
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which save is the latest: an answer to an older one is ignored.
  const saveCountRef = useRef(0);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fills the fields once per signed-in user; a refreshed user object must keep what is being typed
  }, [user?.id]);

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
    if (trimmedName.length < DISPLAY_NAME_MIN_LENGTH) {
      setProfileError('Display name is required');
      return;
    }
    if (trimmedName.length > DISPLAY_NAME_MAX_LENGTH) {
      setProfileError(`Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`);
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
    } catch (err) {
      setProfileError(apiErrorMessage(err) || 'Failed to update profile');
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
    // Generous bound on the source image — it is cropped and re-encoded below,
    // and the result is checked against the server's AVATAR limit before upload.
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Image must be smaller than 10MB');
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

    // The server enforces MAX_AVATAR_SIZE_MB — catch it here so the user gets a
    // clear message instead of a rejected upload.
    const avatarLimit = getUploadLimit(serverConfig, AssetType.AVATAR);
    if (blob.size > avatarLimit) {
      setAvatarError(
        `Cropped avatar is ${formatUploadLimit(blob.size)}, above the ${formatUploadLimit(avatarLimit)} limit. Try a smaller crop or a lower-resolution image.`
      );
      return;
    }

    setAvatarUploading(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      // Show preview immediately
      setAvatarPreview(URL.createObjectURL(blob));
      await profileService.uploadAvatar(user!.id, user!.displayName, file);
      await refreshUser();
      setAvatarSuccess('Avatar updated!');
      setTimeout(() => setAvatarSuccess(''), 3000);
    } catch (err) {
      setAvatarError(apiErrorMessage(err) || 'Failed to upload avatar');
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError('');
    setAvatarSuccess('');
    setAvatarUploading(true);
    try {
      await profileService.removeAvatar(user!.id);
      setAvatarPreview(null);
      await refreshUser();
      setAvatarSuccess('Avatar removed');
      setTimeout(() => setAvatarSuccess(''), 3000);
    } catch (err) {
      setAvatarError(apiErrorMessage(err) || 'Failed to remove avatar');
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
    if (!isStrongPassword(pwNew)) { setPwError('New password must be at least 12 characters with uppercase, lowercase, number, and special character'); return; }
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
    } catch (err) {
      setPwError(apiErrorMessage(err) || 'Failed to change password');
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
        prefsRef.current = fetched ?? {};
        setPrefs(prefsRef.current);
      } catch (err) {
        if (!cancelled) setPrefsError(apiErrorMessage(err) || 'Failed to load preferences');
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  /**
   * Send preferences to the server. Only the latest save's answer is used:
   * one that comes back after a newer save was sent would put an older value
   * back on screen.
   */
  const sendPrefs = useCallback(
    async (updates: Partial<UserPreferences>) => {
      if (!user?.id) return;
      const count = ++saveCountRef.current;
      setPrefsSaving(true);
      try {
        const persisted = await api.updateUserPreferences(user.id, updates);
        if (count !== saveCountRef.current) return;
        prefsRef.current = persisted;
        setPrefs(persisted);
        // Refresh AuthContext so user.preferences in /auth/me stays in sync —
        // ThemeSyncBridge will see the new value but treat it as a no-op
        // since applyUserPreferences was already called when it changed.
        await refreshUser();

        setPrefsSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setPrefsSaved(false), 2000);
      } catch (err) {
        if (count === saveCountRef.current) setPrefsError(apiErrorMessage(err) || 'Failed to save preferences');
      } finally {
        if (count === saveCountRef.current) setPrefsSaving(false);
      }
    },
    [user?.id, refreshUser]
  );

  /** Send the changes waiting on the timer now, if there are any. */
  const sendUnsentPrefs = useCallback(() => {
    if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
    sendTimerRef.current = null;
    const unsent = unsentPrefsRef.current;
    unsentPrefsRef.current = {};
    if (Object.keys(unsent).length > 0) void sendPrefs(unsent);
  }, [sendPrefs]);

  /**
   * Apply a partial preferences update at once (the UI and the theme repaint
   * immediately, and applyUserPreferences updates the localStorage cache so
   * reloads paint without flash), then save it. A colour being dragged in
   * the colour picker changes many times a second, so `wait` holds the save
   * until the changes stop for PREFS_SAVE_DELAY_MS, and sends them as one.
   * On failure the error is shown and the value kept; reloading the page
   * reconciles.
   */
  const savePref = useCallback(
    (updates: Partial<UserPreferences>, { wait = false }: { wait?: boolean } = {}) => {
      if (!user?.id) return;
      setPrefsError('');
      const merged: UserPreferences = { ...prefsRef.current, ...updates };
      prefsRef.current = merged;
      setPrefs(merged);
      applyUserPreferences(merged);

      unsentPrefsRef.current = { ...unsentPrefsRef.current, ...updates };
      if (sendTimerRef.current) clearTimeout(sendTimerRef.current);
      if (wait) {
        sendTimerRef.current = setTimeout(sendUnsentPrefs, PREFS_SAVE_DELAY_MS);
      } else {
        sendUnsentPrefs();
      }
    },
    [user?.id, applyUserPreferences, sendUnsentPrefs]
  );

  // Leaving the page sends a change still waiting on the timer.
  const sendUnsentPrefsRef = useRef(sendUnsentPrefs);
  sendUnsentPrefsRef.current = sendUnsentPrefs;
  useEffect(() => () => sendUnsentPrefsRef.current(), []);

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
    } catch (err) {
      setDeleteError(apiErrorMessage(err) || 'Failed to delete account');
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
    <div className="min-h-page bg-linear-to-br/srgb from-soft-cream via-parchment to-warm-amber/20">
      {/* Header */}
      <header className="bg-moss-green/10 border-b border-moss-green/20">
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg hover:bg-moss-green/10 transition-colors text-brand-ink"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-brand-ink font-heading">Profile & Settings</h1>
            <p className="text-sm text-warm-gray">Manage your account and preferences</p>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ── Profile Information ── */}
        <section className="glass-panel p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-brand-ink">Profile Information</h2>
            {!editingProfile && (
              <Button onClick={startEditProfile} variant="secondary" className="text-sm py-1.5 px-3">
                Edit
              </Button>
            )}
          </div>

          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="shrink-0">
              {/* A button, so Tab reaches it and the focus comes back to it
                  when Crop Avatar closes; the file box itself is hidden. */}
              <button
                type="button"
                aria-label={avatarDisplayUrl ? 'Change avatar' : 'Choose avatar'}
                className="relative group block cursor-pointer rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarDisplayUrl ? (
                  <img
                    src={avatarDisplayUrl}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover border-2 border-moss-green/30"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-moss-green/20 flex items-center justify-center border-2 border-moss-green/30">
                    <User className="w-9 h-9 text-brand-ink/60" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center">
                  {avatarUploading ? (
                    <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden="true" />
                  ) : (
                    <Upload className="w-6 h-6 text-white" aria-hidden="true" />
                  )}
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              {avatarDisplayUrl && !avatarPreview && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarUploading}
                  className="mt-2 block w-20 text-center text-xs text-stone-gray hover:text-danger-ink underline disabled:opacity-50"
                >
                  Remove Avatar
                </button>
              )}
              {avatarError && <p className="mt-1 text-xs text-danger-ink max-w-20">{avatarError}</p>}
              {avatarSuccess && (
                <p className="mt-1 text-xs text-brand-ink flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {avatarSuccess}
                </p>
              )}
            </div>

            {/* Fields */}
            <div className="flex-1 space-y-4">
              {/* Display name */}
              <div>
                <label htmlFor="profile-display-name" className="block text-xs font-medium text-stone-gray mb-1">Display Name</label>
                {editingProfile ? (
                  <>
                    <input
                      id="profile-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={DISPLAY_NAME_MAX_LENGTH}
                      className="input-cozy w-full"
                      autoFocus
                    />
                    <p className="text-xs text-warm-gray/70 mt-0.5 text-right">{displayName.length}/{DISPLAY_NAME_MAX_LENGTH}</p>
                  </>
                ) : (
                  <p className="text-brand-ink font-medium">{user?.displayName}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Email</label>
                <p className="text-brand-ink break-all">{user?.email}</p>
                {user && (
                  <ChangeEmailForm
                    userId={user.id}
                    currentEmail={user.email}
                    sendsEmail={serverConfig?.smtp?.configured}
                    onChanged={refreshUser}
                  />
                )}
              </div>

              {/* Role (read-only) */}
              <div>
                <label className="block text-xs font-medium text-stone-gray mb-1">Platform Role</label>
                <span className="inline-block px-2 py-0.5 rounded-sm text-xs font-medium bg-moss-green/10 text-brand-ink border border-moss-green/20">
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
          <h2 className="text-xl font-semibold text-brand-ink">Security</h2>

          {/* MFA */}
          <div>
            <MFASection />
          </div>

          <div className="border-t border-moss-green/10 pt-6">
            <h3 className="text-sm font-semibold text-brand-ink mb-4">Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
              {pwError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger-ink">{pwError}</div>
              )}
              {pwSuccess && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-sm text-success-ink flex items-center gap-2">
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
                    placeholder="At least 12 characters"
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
                  className={`input-cozy w-full ${pwConfirm && pwNew !== pwConfirm ? 'border-danger/60' : ''}`}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
                {pwConfirm && pwNew !== pwConfirm && (
                  <p className="text-xs text-danger-ink mt-0.5">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
                className="text-sm py-2 px-4 flex items-center gap-2"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {pwSaving ? 'Changing...' : 'Change Password'}
              </Button>
            </form>
          </div>
        </section>

        {/* ── Appearance + Preferences ── */}
        <section className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-brand-ink">Appearance</h2>
              <p className="text-xs text-warm-gray mt-0.5">
                Pick your theme and font — saved automatically to your account.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {prefsSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-warm-gray" />}
              {prefsSaved && !prefsSaving && (
                <p className="text-xs text-brand-ink flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </p>
              )}
            </div>
          </div>

          {prefsError && (
            <div className="bg-danger/10 border border-danger/30 text-danger-ink rounded-lg p-3 text-sm">
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
                // A custom colour changing while the theme and font stay is
                // the colour picker being dragged: saved once it stops.
                const colourOnly = next.themeId === 'custom' && prefs.themeId === 'custom' && next.fontId === (prefs.fontId ?? next.fontId);
                savePref(updates, { wait: colourOnly });
              }}
            />
          )}
        </section>

        {/* ── Danger Zone ── */}
        <section className="glass-panel p-6 border-2 border-danger/60">
          <h2 className="text-xl font-semibold text-danger-ink mb-5">Danger Zone</h2>
          <div className="space-y-4">
            {/* Logout */}
            <div className="flex items-center justify-between py-3 border-b border-danger/30">
              <div>
                <h3 className="text-sm font-medium text-brand-ink">Sign Out</h3>
                <p className="text-xs text-warm-gray">End your current session.</p>
              </div>
              <Button onClick={handleLogout} variant="secondary" className="text-sm py-1.5 px-3">
                Sign Out
              </Button>
            </div>

            {/* Delete account */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-medium text-danger-ink">Delete Account</h3>
                <p className="text-xs text-warm-gray">
                  Permanently delete your account, characters, personal notes and personal files. This cannot be undone.
                </p>
              </div>
              {!deleteConfirmOpen && (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="ml-4 shrink-0 text-sm py-1.5 px-3 rounded-lg border border-danger/30 text-danger-ink hover:bg-danger/10 transition-colors font-medium"
                >
                  Delete Account
                </button>
              )}
            </div>

            {deleteConfirmOpen && (
              <form onSubmit={handleDeleteAccount} className="space-y-3 p-4 rounded-lg bg-danger/10 border border-danger/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-danger-ink shrink-0 mt-0.5" />
                  <div className="text-sm text-danger-ink space-y-1">
                    <p className="font-semibold">This will permanently delete:</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>Your account and profile</li>
                      <li>Your characters, personal notes and saved rolls</li>
                      <li>Your avatar, and the personal files you uploaded that nothing uses</li>
                    </ul>
                    <p className="text-xs">
                      Your chat messages and dice rolls stay where they are, a whisper still read by the other person in
                      it, and the files you uploaded into a campaign
                      and documents you shared into one stay there, no longer linked to you. A personal file a campaign
                      still uses stays on the server with no owner, and the campaign cannot show it again until an
                      administrator moves it there.
                      Character templates you published stay in the shared library, and token templates and creatures
                      you made stay in their campaigns, no longer linked to you; delete any you want gone first.
                      A campaign you own passes to whoever is running it as DM; one you run yourself has to be handed
                      to another DM, or deleted, first.
                    </p>
                  </div>
                </div>

                {deleteError && (
                  <p className="text-sm text-danger-ink bg-danger/10 border border-danger/30 rounded-sm p-2">{deleteError}</p>
                )}

                <div>
                  <label className="block text-xs font-medium text-danger-ink mb-1">
                    Type <strong>DELETE</strong> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    className="input-cozy w-full border-danger/30 focus:ring-danger"
                    placeholder="DELETE"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-danger-ink mb-1">Your Password</label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    className="input-cozy w-full border-danger/30 focus:ring-danger"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <Button
                    type="button"
                    onClick={() => { setDeleteConfirmOpen(false); setDeletePassword(''); setDeleteConfirmText(''); setDeleteError(''); }}
                    disabled={deleting}
                    variant="secondary" className="flex-1 text-sm"
                  >
                    Cancel
                  </Button>
                  <button
                    type="submit"
                    disabled={deleting || deleteConfirmText !== 'DELETE' || !deletePassword}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-danger-fill hover:bg-danger-fill text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
