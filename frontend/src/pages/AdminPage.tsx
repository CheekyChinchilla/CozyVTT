// ============================================
// AdminPage
//
// Platform administration — Admin role only.
// Protected by ProtectedRoute requireRole={PlatformRole.ADMIN} in App.tsx.
//
// Tabs: Dashboard | Users | Settings | Activity
// ============================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Settings,
  Activity,
  BarChart3,
  ChevronLeft,
  Copy,
  Check,
  Loader2,
  Trash2,
  RefreshCw,
  Search,
  Shield,
  Database,
  FolderOpen,
  CalendarDays,
  UserPlus,
  Wifi,
  Clock,
  X,
  BookUser,
  Download,
  HardDrive,
  Mail,
  AlertCircle,
  Layers,
  Globe,
  User as UserIcon,
  MapPin,
  FileAudio,
  Image as ImageIcon,
  ArrowRightLeft,
  ChevronRight,
  Upload,
  RotateCcw,
  Palette,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { adminService } from '@/services/admin.service';
import type {
  User,
  SystemStats,
  AdminSystemSettings,
  AdminActivityData,
  AdminOnlineUser,
  AdminSystemLog,
  AdminServerConfig,
  AdminBackup,
  Asset,
  Campaign,
} from '@/types';
import { PlatformRole, AssetType, AssetScope } from '@/types';
import { api } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import {
  PRESET_THEMES,
  FONT_OPTIONS,
  applyThemeColors,
  applyFont,
} from '@/themes';
import ThemePicker from '@/components/appearance/ThemePicker';
import TableSkeleton from '@/components/skeletons/TableSkeleton';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import Button from '@/components/ui/Button';

// ============================================
// Helpers
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'expired';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `in ${hours}h ${minutes % 60}m`;
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  INFO: 'bg-blue-100 text-blue-700',
  WARNING: 'bg-amber-100 text-amber-700',
  ERROR: 'bg-red-100 text-red-700',
  CRITICAL: 'bg-red-200 text-red-900 font-bold',
};

type Tab = 'dashboard' | 'users' | 'settings' | 'appearance' | 'activity' | 'backups' | 'assets';

// ============================================
// AdminPage
// ============================================

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // ---- Dashboard ----
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  // ---- Users ----
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const debouncedUserSearch = useDebounce(userSearch, 250);

  // Delete flow
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset password flow
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [isSendingResetLink, setIsSendingResetLink] = useState(false);
  const [resetLinkSent, setResetLinkSent] = useState(false);
  const [resetLinkError, setResetLinkError] = useState('');
  const [copied, setCopied] = useState(false);

  // Role change
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);

  // Create user modal
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserForm, setCreateUserForm] = useState({ email: '', displayName: '', platformRole: 'USER' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPasswordCopied, setNewUserPasswordCopied] = useState(false);

  // MFA reset per-row (inline confirm)
  const [resetMfaConfirmId, setResetMfaConfirmId] = useState<string | null>(null);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const [resetMfaError, setResetMfaError] = useState('');

  // User approval
  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);

  // ---- Settings ----
  const [settings, setSettings] = useState<AdminSystemSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    instanceName: '',
    timezone: 'UTC',
    allowRegistration: false,
    requireAdminApproval: true,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  // ---- Appearance ----
  const { refreshAppearance } = useTheme();
  const [appearanceForm, setAppearanceForm] = useState({
    themeId: 'cozy-default',
    fontId: 'default',
    customColors: {
      primary: '#4A5D4E',
      accent: '#D4A574',
      background: '#FFF9E6',
      text: '#1F2937',
    },
  });
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceError, setAppearanceError] = useState('');

  // ---- Server Config (read-only) ----
  const [serverConfig, setServerConfig] = useState<AdminServerConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ---- Backups ----
  const [backups, setBackups] = useState<AdminBackup[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState('');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupCreateError, setBackupCreateError] = useState('');
  const [deletingBackupFile, setDeletingBackupFile] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // ---- Activity ----
  const [activity, setActivity] = useState<AdminActivityData | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');

  // ---- Admin Assets ----
  const [adminAssets, setAdminAssets] = useState<Asset[]>([]);
  const [adminAssetsLoading, setAdminAssetsLoading] = useState(false);
  const [adminAssetsError, setAdminAssetsError] = useState('');
  const [adminAssetsTotal, setAdminAssetsTotal] = useState(0);
  const [adminAssetsTotalPages, setAdminAssetsTotalPages] = useState(0);
  const [adminAssetsPage, setAdminAssetsPage] = useState(1);
  const [adminAssetsScope, setAdminAssetsScope] = useState('');
  const [adminAssetsType, setAdminAssetsType] = useState('');
  const [adminAssetsSearch, setAdminAssetsSearch] = useState('');
  const debouncedAdminAssetsSearch = useDebounce(adminAssetsSearch, 300);
  const [adminCampaigns, setAdminCampaigns] = useState<Campaign[]>([]);
  // Per-row scope change: if set, this asset's row shows the campaign picker
  const [assetScopePicker, setAssetScopePicker] = useState<{ assetId: string; campaignId: string } | null>(null);
  const [assetScopeChanging, setAssetScopeChanging] = useState<string | null>(null);
  const [assetDeleting, setAssetDeleting] = useState<string | null>(null);

  // ---- Global Asset Manager toggle ----
  const [togglingGlobalAssets, setTogglingGlobalAssets] = useState<string | null>(null);

  // ---- Delete user — asset warning ----
  const [deletingUserAssetCount, setDeletingUserAssetCount] = useState<number>(0);
  const [loadingDeleteWarning, setLoadingDeleteWarning] = useState<string | null>(null);

  // ============================================
  // Data loaders
  // ============================================

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      setStats(await adminService.getStats());
    } catch (err: unknown) {
      setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      setUsers(await adminService.getUsers());
    } catch (err: unknown) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      setSettings(await adminService.getSettings());
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadServerConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      setServerConfig(await adminService.getConfig());
    } catch {
      // non-fatal — config panel just won't show
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupsError('');
    try {
      setBackups(await adminService.listBackups());
    } catch (err: unknown) {
      setBackupsError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError('');
    try {
      setActivity(await adminService.getActivity());
    } catch (err: unknown) {
      setActivityError(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadAdminAssets = useCallback(async (
    page: number,
    scope: string,
    type: string,
    search: string,
  ) => {
    setAdminAssetsLoading(true);
    setAdminAssetsError('');
    try {
      const resp = await api.listAssets({
        page,
        limit: 25,
        scope: scope || undefined,
        type: type || undefined,
        search: search || undefined,
      });
      setAdminAssets(resp.assets);
      setAdminAssetsTotal(resp.pagination.total);
      setAdminAssetsTotalPages(resp.pagination.totalPages);
    } catch (err: unknown) {
      setAdminAssetsError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setAdminAssetsLoading(false);
    }
  }, []);

  const loadAdminCampaigns = useCallback(async () => {
    try {
      const { campaigns } = await api.adminListAllCampaigns();
      setAdminCampaigns(campaigns);
    } catch {
      // non-fatal
    }
  }, []);

  // Populate forms when settings load
  useEffect(() => {
    if (settings) {
      setSettingsForm({
        instanceName: settings.instanceName,
        timezone: settings.timezone,
        allowRegistration: settings.allowRegistration,
        requireAdminApproval: settings.requireAdminApproval,
      });
      setAppearanceForm({
        themeId: settings.themeId || 'cozy-default',
        fontId: settings.fontId || 'default',
        customColors: settings.customThemeColors as any || {
          primary: '#4A5D4E',
          accent: '#D4A574',
          background: '#FFF9E6',
          text: '#1F2937',
        },
      });
    }
  }, [settings]);

  // Lazy-load per tab
  useEffect(() => {
    if (activeTab === 'dashboard' && !stats && !statsLoading) loadStats();
    if (activeTab === 'users' && users.length === 0 && !usersLoading) loadUsers();
    if (activeTab === 'settings' || activeTab === 'appearance') {
      if (!settings && !settingsLoading) loadSettings();
      if (activeTab === 'settings' && !serverConfig && !configLoading) loadServerConfig();
    }
    if (activeTab === 'activity' && !activity && !activityLoading) loadActivity();
    if (activeTab === 'backups' && backups.length === 0 && !backupsLoading) loadBackups();
    if (activeTab === 'assets') {
      loadAdminAssets(1, '', '', '');
      if (adminCampaigns.length === 0) loadAdminCampaigns();
    }
  }, [activeTab]);  

  // Reload assets when filters/page change
  useEffect(() => {
    if (activeTab !== 'assets') return;
    loadAdminAssets(adminAssetsPage, adminAssetsScope, adminAssetsType, debouncedAdminAssetsSearch);
  }, [adminAssetsPage, adminAssetsScope, adminAssetsType, debouncedAdminAssetsSearch]);  

  // Reset page when filters change
  useEffect(() => {
    setAdminAssetsPage(1);
  }, [adminAssetsScope, adminAssetsType, debouncedAdminAssetsSearch]);

  // ============================================
  // User management actions
  // ============================================

  const handleToggleGlobalAssets = async (u: User) => {
    setTogglingGlobalAssets(u.id);
    const next = !u.globalAssetManager;
    // Optimistic update
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, globalAssetManager: next } : x));
    try {
      const updated = await adminService.updateUser(u.id, { globalAssetManager: next });
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x));
      showToast(`Global Assets ${next ? 'enabled' : 'disabled'} for ${u.displayName}`, 'success');
    } catch (err: unknown) {
      // Revert on error
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, globalAssetManager: !next } : x));
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e.response?.data?.message ?? 'Failed to update permission', 'error');
    } finally {
      setTogglingGlobalAssets(null);
    }
  };

  const handleRoleChange = async (u: User) => {
    setRoleChangingId(u.id);
    try {
      const newRole = u.platformRole === PlatformRole.ADMIN
        ? PlatformRole.USER
        : PlatformRole.ADMIN;
      const updated = await adminService.updateUser(u.id, { platformRole: newRole });
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x));
      showToast(`Role updated to ${newRole}`, 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e.response?.data?.message ?? 'Failed to change role', 'error');
    } finally {
      setRoleChangingId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setIsResetting(true);
    setResetError('');
    try {
      const pwd = await adminService.resetUserPassword(resetTarget.id);
      setTempPassword(pwd);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setResetError(e.response?.data?.message ?? 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendPasswordResetLink = async () => {
    if (!resetTarget) return;
    setIsSendingResetLink(true);
    setResetLinkError('');
    try {
      await adminService.sendPasswordResetLink(resetTarget.id);
      setResetLinkSent(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setResetLinkError(e.response?.data?.message ?? 'Failed to send reset link');
    } finally {
      setIsSendingResetLink(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const deletedName = deletingUser.displayName;
      await adminService.deleteUser(deletingUser.id);
      setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
      setDeletingUser(null);
      setDeleteEmail('');
      showToast(`User "${deletedName}" deleted`, 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setDeleteError(e.response?.data?.message ?? 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyToClipboard = async (text: string, setCopiedFn: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFn(true);
      setTimeout(() => setCopiedFn(false), 2000);
    } catch {
      // clipboard unavailable — user can select manually
    }
  };

  const closeResetModal = () => {
    setResetTarget(null);
    setTempPassword('');
    setResetError('');
    setCopied(false);
    setResetLinkSent(false);
    setResetLinkError('');
  };

  const closeDeleteModal = () => {
    setDeletingUser(null);
    setDeleteEmail('');
    setDeleteError('');
    setDeletingUserAssetCount(0);
  };

  const openDeleteModal = async (u: User) => {
    closeResetModal();
    setResetMfaConfirmId(null);
    setDeleteEmail('');
    setDeleteError('');
    setDeletingUserAssetCount(0);
    setLoadingDeleteWarning(u.id);
    try {
      const resp = await api.listAssets({ uploadedBy: u.id, scope: 'USER', limit: 1 });
      setDeletingUserAssetCount(resp.pagination.total);
    } catch {
      // non-fatal — just proceed without warning
    } finally {
      setLoadingDeleteWarning(null);
    }
    setDeletingUser(u);
  };

  const handleCreateUser = async () => {
    setCreatingUser(true);
    setCreateUserError('');
    try {
      const { user: newUser, temporaryPassword } = await adminService.createUser({
        email: createUserForm.email.trim(),
        displayName: createUserForm.displayName.trim() || undefined,
        platformRole: createUserForm.platformRole,
      });
      setNewUserPassword(temporaryPassword);
      setUsers(prev => [newUser, ...prev]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setCreateUserError(e.response?.data?.message ?? 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const closeCreateUserModal = () => {
    setCreateUserOpen(false);
    setCreateUserForm({ email: '', displayName: '', platformRole: 'USER' });
    setCreateUserError('');
    setNewUserPassword('');
    setNewUserPasswordCopied(false);
  };

  const handleResetMfa = async (userId: string) => {
    setIsResettingMfa(true);
    setResetMfaError('');
    try {
      await adminService.resetMfa(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, mfaEnabled: false } : u));
      setResetMfaConfirmId(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setResetMfaError(e.response?.data?.message ?? 'Failed to reset MFA');
    } finally {
      setIsResettingMfa(false);
    }
  };

  const handleApproveUser = async (userId: string) => {
    setApprovingUserId(userId);
    try {
      await adminService.approveUser(userId);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, isApproved: true } : u));
      showToast('User approved!', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e.response?.data?.message ?? 'Failed to approve user', 'error');
    } finally {
      setApprovingUserId(null);
    }
  };

  // ============================================
  // Admin asset management
  // ============================================

  const handleAdminAssetScopeChange = async (asset: Asset, newScope: string, campaignId?: string) => {
    if (newScope === AssetScope.CAMPAIGN && !campaignId) return;
    setAssetScopeChanging(asset.id);
    try {
      const result = await api.patchAssetScope(asset.id, newScope, campaignId);
      setAdminAssets(prev => prev.map(a => a.id === asset.id ? result.asset : a));
      setAssetScopePicker(null);
      showToast('Asset scope updated', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      showToast(e.response?.data?.error ?? 'Failed to update scope', 'error');
    } finally {
      setAssetScopeChanging(null);
    }
  };

  const handleAdminDeleteAsset = async (assetId: string) => {
    setAssetDeleting(assetId);
    try {
      await api.deleteAsset(assetId);
      setAdminAssets(prev => prev.filter(a => a.id !== assetId));
      setAdminAssetsTotal(prev => prev - 1);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e.response?.data?.message ?? 'Failed to delete asset', 'error');
    } finally {
      setAssetDeleting(null);
    }
  };

  // ============================================
  // SMTP test
  // ============================================

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const message = await adminService.testSmtp();
      setSmtpTestResult({ ok: true, message });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setSmtpTestResult({ ok: false, message: e.response?.data?.message ?? 'Test failed' });
    } finally {
      setSmtpTesting(false);
    }
  };

  // ============================================
  // Backup actions
  // ============================================

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupCreateError('');
    try {
      const backup = await adminService.createBackup();
      setBackups(prev => [backup, ...prev]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setBackupCreateError(e.response?.data?.message ?? 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    setDeletingBackupFile(filename);
    try {
      await adminService.deleteBackup(filename);
      setBackups(prev => prev.filter(b => b.filename !== filename));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast(e.response?.data?.message ?? 'Failed to delete backup', 'error');
    } finally {
      setDeletingBackupFile(null);
    }
  };

  const handleRestoreBackup = () => {
    if (!restoreFile) return;
    setShowRestoreConfirm(true);
  };

  const handleRestoreBackupConfirmed = async () => {
    setShowRestoreConfirm(false);
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreError('');
    try {
      await adminService.restoreBackup(restoreFile);
      setRestoreSuccess(true);
      setRestoreFile(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setRestoreError(e.response?.data?.message ?? 'Restore failed. Check server logs for details.');
    } finally {
      setRestoring(false);
    }
  };

  // ============================================
  // Settings actions
  // ============================================

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError('');
    try {
      const updated = await adminService.updateSettings(settingsForm);
      setSettings(updated);
      showToast('Settings saved!', 'success');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setSettingsError(e.response?.data?.message ?? 'Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ============================================
  // Filtered users (client-side search)
  // ============================================

  const filteredUsers = useMemo(() => {
    const q = debouncedUserSearch.toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.displayName.toLowerCase().includes(q)
    );
  }, [users, debouncedUserSearch]);

  // ============================================
  // Tab bar config
  // ============================================

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'users',     label: 'Users',     icon: <Users className="w-4 h-4" /> },
    { id: 'assets',    label: 'Assets',    icon: <Layers className="w-4 h-4" /> },
    { id: 'settings',  label: 'Settings',  icon: <Settings className="w-4 h-4" /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette className="w-4 h-4" /> },
    { id: 'backups',   label: 'Backups',   icon: <HardDrive className="w-4 h-4" /> },
    { id: 'activity',  label: 'Activity',  icon: <Activity className="w-4 h-4" /> },
  ];

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-cream via-parchment to-warm-amber/20">

      {/* ---- Header ---- */}
      <header className="bg-moss-green/10 border-b border-moss-green/20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                aria-label="Back to Dashboard"
                className="flex items-center gap-1 text-sm text-warm-gray hover:text-moss-green transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                Dashboard
              </button>
              <div>
                <h1 className="text-2xl font-bold text-moss-green font-heading flex items-center gap-2">
                  <Shield className="w-6 h-6" aria-hidden="true" />
                  Admin Panel
                </h1>
                <p className="text-xs text-warm-gray mt-0.5">Platform administration</p>
              </div>
            </div>
            <span className="text-sm text-warm-gray">
              Signed in as{' '}
              <span className="font-medium text-moss-green">{user?.displayName}</span>
            </span>
          </div>

          {/* Tab Navigation */}
          <nav aria-label="Admin panel sections">
            <div role="tablist" aria-label="Admin tabs" className="flex gap-1 mt-4">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-paper text-moss-green border border-b-paper border-moss-green/20 -mb-px'
                      : 'text-warm-gray hover:text-moss-green hover:bg-paper/50'
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </header>

      {/* ---- Main ---- */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 py-8">

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === 'dashboard' && (
          <div role="tabpanel" id="tabpanel-dashboard" aria-labelledby="tab-dashboard">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-moss-green">System Overview</h2>
              <Button
                onClick={loadStats}
                disabled={statsLoading}
                variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {statsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
                {statsError}
              </div>
            )}

            {statsLoading && !stats ? (
              <div className="glass-panel overflow-hidden">
                {/* Stat card skeletons */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 animate-pulse">
                  {[...Array(7)].map((_, i) => (
                    <div key={i} className="flex flex-col items-center p-4 space-y-2">
                      <div className="w-7 h-7 bg-moss-green/10 rounded-full" />
                      <div className="h-8 w-10 bg-moss-green/15 rounded" />
                      <div className="h-3 w-14 bg-stone-gray/10 rounded" />
                    </div>
                  ))}
                </div>
                <TableSkeleton rows={6} columns={3} />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Stat Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <Users className="w-7 h-7 text-moss-green mb-2" />
                    <p className="text-3xl font-bold text-moss-green">{stats?.userCount ?? '\u2014'}</p>
                    <p className="text-xs text-warm-gray mt-1">Users</p>
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <FolderOpen className="w-7 h-7 text-warm-amber mb-2" />
                    <p className="text-3xl font-bold text-moss-green">{stats?.campaignCount ?? '\u2014'}</p>
                    <p className="text-xs text-warm-gray mt-1">Campaigns</p>
                    {stats && (
                      <p className="text-xs text-green-600 mt-0.5">{stats.activeCampaignCount} active</p>
                    )}
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <CalendarDays className="w-7 h-7 text-blue-500 mb-2" />
                    <p className="text-3xl font-bold text-moss-green">{stats?.sessionCount ?? '\u2014'}</p>
                    <p className="text-xs text-warm-gray mt-1">Sessions</p>
                    {stats && (
                      <p className="text-xs text-green-600 mt-0.5">{stats.activeSessionCount} live</p>
                    )}
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <BookUser className="w-7 h-7 text-indigo-500 mb-2" />
                    <p className="text-3xl font-bold text-moss-green">{stats?.characterCount ?? '\u2014'}</p>
                    <p className="text-xs text-warm-gray mt-1">Characters</p>
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <Database className="w-7 h-7 text-teal-500 mb-2" />
                    <p className="text-3xl font-bold text-moss-green">{stats?.mapCount ?? '\u2014'}</p>
                    <p className="text-xs text-warm-gray mt-1">Maps</p>
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <Database className="w-7 h-7 text-purple-500 mb-2" />
                    <p className="text-2xl font-bold text-moss-green break-all">
                      {stats ? formatBytes(stats.totalStorageBytes) : '\u2014'}
                    </p>
                    <p className="text-xs text-warm-gray mt-1">Storage</p>
                  </div>

                  <div className="glass-panel p-5 flex flex-col items-center text-center">
                    <Shield className="w-7 h-7 text-green-500 mb-2" />
                    <p className="text-sm font-bold text-green-600">Healthy</p>
                    <p className="text-xs text-warm-gray mt-1">Status</p>
                    <div className="mt-2 space-y-1 text-left w-full">
                      {[['API', true], ['DB', true], ['WS', true]].map(([label, ok]) => (
                        <div key={String(label)} className="flex items-center justify-between text-xs">
                          <span className="text-stone-gray">{label}</span>
                          <span className={ok ? 'text-green-600' : 'text-red-500'}>&#9679;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Asset Breakdown Table */}
                {stats && stats.assetBreakdown.length > 0 && (
                  <section className="glass-panel overflow-hidden">
                    <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-warm-amber" />
                      <h3 className="font-semibold text-moss-green text-sm">Asset Breakdown</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Type</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Count</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Storage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.assetBreakdown.map(row => (
                            <tr key={row.type} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                              <td className="px-4 py-2 font-medium text-stone-gray">{row.type}</td>
                              <td className="px-4 py-2 text-right text-warm-gray">{row.count}</td>
                              <td className="px-4 py-2 text-right text-warm-gray">{formatBytes(row.sizeBytes)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-moss-green/5 font-medium">
                            <td className="px-4 py-2 text-stone-gray">Total</td>
                            <td className="px-4 py-2 text-right text-stone-gray">
                              {stats.assetBreakdown.reduce((s, r) => s + r.count, 0)}
                            </td>
                            <td className="px-4 py-2 text-right text-stone-gray">
                              {formatBytes(stats.totalStorageBytes)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== USERS TAB ===== */}
        {activeTab === 'users' && (
          <div role="tabpanel" id="tabpanel-users" aria-labelledby="tab-users">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-moss-green">User Management</h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setCreateUserOpen(true)}
                  className="flex items-center gap-2 text-sm py-1.5 px-3"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Create User
                </Button>
                <Button
                  onClick={loadUsers}
                  disabled={usersLoading}
                  variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {usersError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
                {usersError}
              </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="input-cozy pl-9 w-full max-w-sm"
              />
            </div>

            {usersLoading && users.length === 0 ? (
              <div className="glass-panel overflow-hidden">
                <TableSkeleton rows={8} columns={6} />
              </div>
            ) : (
              <div className="glass-panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-gray/20 bg-moss-green/5">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">User</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Email</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Role</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">MFA</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Joined</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Last Login</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-10 text-warm-gray">
                            {userSearch ? 'No users match your search.' : 'No users found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map(u => {
                          const isSelf = u.id === user?.id;
                          const isRoleChanging = roleChangingId === u.id;
                          const isDeleteExpanded = deletingUser?.id === u.id;
                          const isResetExpanded = resetTarget?.id === u.id;
                          const isMfaConfirm = resetMfaConfirmId === u.id;
                          const isPending = u.isApproved === false;
                          const isApproving = approvingUserId === u.id;

                          return (
                            <React.Fragment key={u.id}>
                              <tr className="border-b border-warm-gray/10 hover:bg-moss-green/5 transition-colors">
                                {/* User */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-moss-green/20 flex items-center justify-center text-moss-green font-medium text-xs flex-shrink-0">
                                      {u.displayName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-stone-gray">{u.displayName}</span>
                                    {isSelf && (
                                      <span className="text-xs text-warm-gray">(you)</span>
                                    )}
                                    {isPending && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Pending</span>
                                    )}
                                  </div>
                                </td>
                                {/* Email */}
                                <td className="px-4 py-3 text-warm-gray">{u.email}</td>
                                {/* Role */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      onClick={() => !isSelf && !isRoleChanging && handleRoleChange(u)}
                                      disabled={isSelf || isRoleChanging}
                                      title={isSelf ? 'Cannot change your own role' : 'Click to toggle role'}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                        u.platformRole === PlatformRole.ADMIN
                                          ? 'bg-moss-green/20 text-moss-green hover:bg-moss-green/30'
                                          : 'bg-warm-gray/20 text-warm-gray hover:bg-warm-gray/30'
                                      } ${isSelf ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                                    >
                                      {isRoleChanging && <Loader2 className="w-3 h-3 animate-spin" />}
                                      {u.platformRole}
                                    </button>
                                    {/* Global Assets toggle — only for non-admin users */}
                                    {u.platformRole !== PlatformRole.ADMIN && (
                                      <button
                                        onClick={() => !isSelf && togglingGlobalAssets !== u.id && handleToggleGlobalAssets(u)}
                                        disabled={isSelf || togglingGlobalAssets === u.id}
                                        title="Can upload and delete global assets"
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                          u.globalAssetManager
                                            ? 'bg-warm-amber/20 text-warm-amber hover:bg-warm-amber/30'
                                            : 'bg-warm-gray/10 text-warm-gray/60 hover:bg-warm-gray/20'
                                        } ${isSelf ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                                      >
                                        {togglingGlobalAssets === u.id
                                          ? <Loader2 className="w-3 h-3 animate-spin" />
                                          : <Globe className="w-3 h-3" />
                                        }
                                        Global Assets
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {/* MFA */}
                                <td className="px-4 py-3">
                                  <span className={`text-xs font-medium ${u.mfaEnabled ? 'text-green-600' : 'text-warm-gray'}`}>
                                    {u.mfaEnabled ? 'Enabled' : 'Off'}
                                  </span>
                                </td>
                                {/* Joined */}
                                <td className="px-4 py-3 text-warm-gray text-xs">{formatDate(u.createdAt)}</td>
                                {/* Last Login */}
                                <td className="px-4 py-3 text-warm-gray text-xs">{formatDate(u.lastLoginAt)}</td>
                                {/* Actions */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {/* Approve — only when pending */}
                                    {isPending && (
                                      <button
                                        onClick={() => handleApproveUser(u.id)}
                                        disabled={isApproving}
                                        title="Approve this account"
                                        className="text-xs py-1 px-2 flex items-center gap-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                                      >
                                        {isApproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                        Approve
                                      </button>
                                    )}
                                    {/* Reset MFA — only when MFA enabled */}
                                    {u.mfaEnabled && (
                                      <button
                                        onClick={() => {
                                          if (isMfaConfirm) {
                                            setResetMfaConfirmId(null);
                                            setResetMfaError('');
                                          } else {
                                            closeResetModal();
                                            closeDeleteModal();
                                            setResetMfaConfirmId(u.id);
                                            setResetMfaError('');
                                          }
                                        }}
                                        disabled={isSelf}
                                        title={isSelf ? 'Cannot reset your own MFA here' : 'Reset MFA — forces re-enrollment'}
                                        className={`text-xs py-1 px-2 flex items-center gap-1 rounded border transition-colors ${
                                          isSelf
                                            ? 'opacity-40 cursor-not-allowed border-warm-gray/20 text-warm-gray'
                                            : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                                        }`}
                                      >
                                        <Shield className="w-3 h-3" />
                                        MFA
                                      </button>
                                    )}
                                    {/* Reset Password */}
                                    <Button
                                      onClick={() => {
                                      if (isResetExpanded) {
                                      closeResetModal();
                                      } else {
                                      closeDeleteModal();
                                      setResetMfaConfirmId(null);
                                      setResetTarget(u);
                                      setTempPassword('');
                                      setResetError('');
                                      }
                                      }}
                                      disabled={isSelf}
                                      title={isSelf ? 'Cannot reset your own password here' : 'Reset password'}
                                      variant="secondary" className={`text-xs py-1 px-2 flex items-center gap-1 ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      Pwd
                                    </Button>
                                    {/* Delete */}
                                    <button
                                      onClick={() => {
                                        if (isDeleteExpanded) {
                                          closeDeleteModal();
                                        } else {
                                          openDeleteModal(u);
                                        }
                                      }}
                                      disabled={isSelf || loadingDeleteWarning === u.id}
                                      title={isSelf ? 'Cannot delete your own account' : 'Delete user'}
                                      className={`text-xs py-1 px-2 flex items-center gap-1 rounded border transition-colors ${
                                        isSelf
                                          ? 'opacity-40 cursor-not-allowed border-warm-gray/20 text-warm-gray'
                                          : 'border-red-200 text-red-600 hover:bg-red-50'
                                      }`}
                                    >
                                      {loadingDeleteWarning === u.id
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <Trash2 className="w-3 h-3" />
                                      }
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* MFA Reset Inline Confirm */}
                              {isMfaConfirm && (
                                <tr className="bg-amber-50/60 border-b border-warm-gray/10">
                                  <td colSpan={7} className="px-6 py-4">
                                    <div className="max-w-md">
                                      <p className="text-sm font-medium text-amber-800 mb-1">
                                        Reset MFA for <strong>{u.displayName}</strong>?
                                      </p>
                                      <p className="text-xs text-amber-700 mb-3">
                                        This clears their authenticator app enrollment. They will need to re-enroll on next login.
                                      </p>
                                      {resetMfaError && (
                                        <p className="text-xs text-red-600 mb-2">{resetMfaError}</p>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleResetMfa(u.id)}
                                          disabled={isResettingMfa}
                                          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                        >
                                          {isResettingMfa && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                          Confirm Reset
                                        </button>
                                        <Button
                                          onClick={() => { setResetMfaConfirmId(null); setResetMfaError(''); }}
                                          variant="secondary" className="text-sm py-1.5 px-4"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Reset Password Inline Panel */}
                              {isResetExpanded && (
                                <tr className="bg-blue-50/50 border-b border-warm-gray/10">
                                  <td colSpan={7} className="px-6 py-4">
                                    <div className="max-w-md">
                                      <p className="text-sm font-medium text-stone-gray mb-3">
                                        Reset password for <strong>{u.displayName}</strong>
                                      </p>
                                      {tempPassword ? (
                                        <div>
                                          <p className="text-xs text-warm-gray mb-2">
                                            Temporary password generated. Share it securely — the user must change it on next login.
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <code className="flex-1 bg-paper border border-warm-gray/30 rounded px-3 py-2 text-sm font-mono text-ink-secondary select-all">
                                              {tempPassword}
                                            </code>
                                            <Button
                                              onClick={() => handleCopyToClipboard(tempPassword, setCopied)}
                                              variant="secondary" className="flex items-center gap-1 text-xs py-2 px-3"
                                            >
                                              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                              {copied ? 'Copied' : 'Copy'}
                                            </Button>
                                          </div>
                                          <button
                                            onClick={closeResetModal}
                                            className="mt-3 text-xs text-warm-gray hover:text-stone-gray"
                                          >
                                            Close
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          {/* Option 1: Generate temporary password */}
                                          <div>
                                            <p className="text-xs text-warm-gray mb-1.5">Generate a temporary password to share with the user directly:</p>
                                            {resetError && (
                                              <p className="text-xs text-red-600 mb-1.5">{resetError}</p>
                                            )}
                                            <Button
                                              onClick={handleResetPassword}
                                              disabled={isResetting || isSendingResetLink}
                                              className="flex items-center gap-2 text-sm py-1.5 px-4"
                                            >
                                              {isResetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                              Generate Temporary Password
                                            </Button>
                                          </div>

                                          {/* Option 2: Send reset link via email */}
                                          <div>
                                            <p className="text-xs text-warm-gray mb-1.5">Or send a password reset link to their email address:</p>
                                            {resetLinkSent ? (
                                              <p className="text-xs text-green-700 flex items-center gap-1">
                                                <Check className="w-3.5 h-3.5" /> Reset link sent to {resetTarget?.email}
                                              </p>
                                            ) : (
                                              <>
                                                {resetLinkError && (
                                                  <p className="text-xs text-red-600 mb-1.5">{resetLinkError}</p>
                                                )}
                                                <Button
                                                  onClick={handleSendPasswordResetLink}
                                                  disabled={isSendingResetLink || isResetting}
                                                  variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-4"
                                                >
                                                  {isSendingResetLink ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                                                  Send Reset Link
                                                </Button>
                                              </>
                                            )}
                                          </div>

                                          <button
                                            onClick={closeResetModal}
                                            className="text-xs text-warm-gray hover:text-stone-gray"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Delete Inline Panel */}
                              {isDeleteExpanded && (
                                <tr className="bg-red-50/50 border-b border-warm-gray/10">
                                  <td colSpan={7} className="px-6 py-4">
                                    <div className="max-w-md">
                                      <p className="text-sm font-medium text-red-700 mb-1">
                                        Delete <strong>{u.displayName}</strong>?
                                      </p>
                                      <p className="text-xs text-warm-gray mb-3">
                                        This action is permanent. Type their email address to confirm.
                                      </p>
                                      {deletingUserAssetCount > 0 && (
                                        <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-600" />
                                          <span>
                                            This user has <strong>{deletingUserAssetCount}</strong> personal asset{deletingUserAssetCount !== 1 ? 's' : ''} that will be deleted with their account.
                                            To preserve them, promote them to Global scope from the <button onClick={() => { closeDeleteModal(); setActiveTab('assets'); }} className="underline hover:no-underline">Assets tab</button> first.
                                          </span>
                                        </div>
                                      )}
                                      {deleteError && (
                                        <p className="text-xs text-red-600 mb-2">{deleteError}</p>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="email"
                                          placeholder={u.email}
                                          value={deleteEmail}
                                          onChange={e => setDeleteEmail(e.target.value)}
                                          className="input-cozy text-sm flex-1"
                                        />
                                        <button
                                          onClick={handleDeleteUser}
                                          disabled={deleteEmail !== u.email || isDeleting}
                                          className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                          Delete
                                        </button>
                                        <Button
                                          onClick={closeDeleteModal}
                                          variant="secondary" className="text-sm py-2 px-4"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {users.length > 0 && (
                  <div className="px-4 py-2 border-t border-warm-gray/10 text-xs text-warm-gray">
                    {filteredUsers.length} of {users.length} users
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== ASSETS TAB ===== */}
        {activeTab === 'assets' && (
          <div role="tabpanel" id="tabpanel-assets" aria-labelledby="tab-assets">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-moss-green">Asset Management</h2>
              <Button
                onClick={() => loadAdminAssets(adminAssetsPage, adminAssetsScope, adminAssetsType, debouncedAdminAssetsSearch)}
                disabled={adminAssetsLoading}
                variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adminAssetsLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* Search */}
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={adminAssetsSearch}
                  onChange={e => setAdminAssetsSearch(e.target.value)}
                  className="input-cozy pl-9 w-full"
                />
                {adminAssetsSearch && (
                  <button
                    onClick={() => setAdminAssetsSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-gray hover:text-stone-gray"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Scope filter */}
              <select
                value={adminAssetsScope}
                onChange={e => setAdminAssetsScope(e.target.value)}
                className="input-cozy text-sm"
              >
                <option value="">All Scopes</option>
                <option value="GLOBAL">Global</option>
                <option value="USER">Personal</option>
                <option value="CAMPAIGN">Campaign</option>
              </select>

              {/* Type filter */}
              <select
                value={adminAssetsType}
                onChange={e => setAdminAssetsType(e.target.value)}
                className="input-cozy text-sm"
              >
                <option value="">All Types</option>
                <option value="MAP">Map</option>
                <option value="TOKEN">Token</option>
                <option value="AUDIO">Audio</option>
                <option value="AVATAR">Avatar</option>
              </select>
            </div>

            {adminAssetsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">
                {adminAssetsError}
              </div>
            )}

            <div className="glass-panel overflow-hidden">
              {adminAssetsLoading && adminAssets.length === 0 ? (
                <TableSkeleton rows={8} columns={7} />
              ) : adminAssets.length === 0 ? (
                <div className="text-center py-12 text-warm-gray">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No assets found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-gray/20 bg-moss-green/5">
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide w-14">Preview</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Name</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Type</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Scope</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Uploader</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Campaign</th>
                        <th className="text-left px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Size</th>
                        <th className="text-right px-3 py-3 text-xs font-semibold text-warm-gray uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminAssets.map(asset => {
                        const isScopePickerOpen = assetScopePicker?.assetId === asset.id;
                        const isChangingScope = assetScopeChanging === asset.id;
                        const isDeleting = assetDeleting === asset.id;

                        // Thumb URL
                        const thumbUrl = asset.type === AssetType.AVATAR
                          ? api.getAssetUrl(asset.uploadedById, 'avatars')
                          : asset.type === AssetType.MAP
                            ? api.getAssetUrl(asset.id, 'maps')
                            : asset.type === AssetType.TOKEN
                              ? api.getAssetUrl(asset.id, 'tokens')
                              : null;

                        return (
                          <React.Fragment key={asset.id}>
                            <tr className={`border-b border-warm-gray/10 hover:bg-moss-green/5 transition-colors ${isDeleting ? 'opacity-50' : ''}`}>
                              {/* Thumb */}
                              <td className="px-3 py-2">
                                <div className="w-10 h-10 rounded bg-moss-green/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                                  {thumbUrl ? (
                                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  ) : asset.type === AssetType.AUDIO ? (
                                    <FileAudio className="w-5 h-5 text-spirit-purple" />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-stone-gray/40" />
                                  )}
                                </div>
                              </td>
                              {/* Name */}
                              <td className="px-3 py-2 max-w-[180px]">
                                <p className="font-medium text-stone-gray truncate" title={asset.description ?? asset.name}>
                                  {asset.name}
                                </p>
                                {asset.description && (
                                  <p className="text-xs text-warm-gray truncate">{asset.description}</p>
                                )}
                              </td>
                              {/* Type */}
                              <td className="px-3 py-2">
                                <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-parchment border border-moss-green/20 text-stone-gray">
                                  {asset.type === AssetType.MAP && <MapPin className="w-3 h-3 text-warm-amber" />}
                                  {asset.type === AssetType.TOKEN && <UserIcon className="w-3 h-3 text-moss-green" />}
                                  {asset.type === AssetType.AUDIO && <FileAudio className="w-3 h-3 text-spirit-purple" />}
                                  {asset.type === AssetType.AVATAR && <UserIcon className="w-3 h-3 text-sunset-orange" />}
                                  {asset.type}
                                </span>
                              </td>
                              {/* Scope */}
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  asset.scope === AssetScope.GLOBAL
                                    ? 'bg-purple-100 text-purple-700'
                                    : asset.scope === AssetScope.USER
                                      ? 'bg-moss-green/15 text-moss-green'
                                      : 'bg-warm-amber/15 text-warm-amber'
                                }`}>
                                  {asset.scope === AssetScope.GLOBAL && <Globe className="w-3 h-3" />}
                                  {asset.scope === AssetScope.USER && <UserIcon className="w-3 h-3" />}
                                  {asset.scope === AssetScope.CAMPAIGN && <Users className="w-3 h-3" />}
                                  {asset.scope === AssetScope.GLOBAL ? 'Global' : asset.scope === AssetScope.USER ? 'Personal' : 'Campaign'}
                                </span>
                              </td>
                              {/* Uploader */}
                              <td className="px-3 py-2 text-warm-gray text-xs">
                                {asset.uploadedBy?.displayName ?? '—'}
                              </td>
                              {/* Campaign */}
                              <td className="px-3 py-2 text-warm-gray text-xs">
                                {asset.campaign?.name ?? '—'}
                              </td>
                              {/* Size */}
                              <td className="px-3 py-2 text-warm-gray text-xs whitespace-nowrap">
                                {formatBytes(asset.fileSize)}
                              </td>
                              {/* Actions */}
                              <td className="px-3 py-2">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Scope change dropdown */}
                                  <div className="relative">
                                    <select
                                      value={asset.scope}
                                      disabled={isChangingScope || isDeleting}
                                      onChange={e => {
                                        const newScope = e.target.value;
                                        if (newScope === AssetScope.CAMPAIGN) {
                                          setAssetScopePicker({ assetId: asset.id, campaignId: '' });
                                        } else if (newScope !== asset.scope) {
                                          handleAdminAssetScopeChange(asset, newScope);
                                        }
                                      }}
                                      className="text-xs py-1 px-2 pr-6 rounded border border-moss-green/30 text-stone-gray bg-paper-white hover:border-moss-green/60 cursor-pointer disabled:opacity-50 appearance-none"
                                      title="Change scope"
                                    >
                                      <option value={AssetScope.GLOBAL}>Global</option>
                                      <option value={AssetScope.USER}>Personal</option>
                                      <option value={AssetScope.CAMPAIGN}>Campaign…</option>
                                    </select>
                                    {isChangingScope && (
                                      <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-moss-green pointer-events-none" />
                                    )}
                                    {!isChangingScope && (
                                      <ArrowRightLeft className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-warm-gray/60 pointer-events-none" />
                                    )}
                                  </div>
                                  {/* Delete */}
                                  <button
                                    onClick={() => handleAdminDeleteAsset(asset.id)}
                                    disabled={isDeleting || isChangingScope}
                                    className="text-xs py-1 px-2 flex items-center gap-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                                    title="Delete asset"
                                  >
                                    {isDeleting
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <Trash2 className="w-3 h-3" />
                                    }
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Campaign picker row */}
                            {isScopePickerOpen && (
                              <tr className="bg-warm-amber/5 border-b border-warm-gray/10">
                                <td colSpan={8} className="px-6 py-3">
                                  <div className="flex items-center gap-3 max-w-lg">
                                    <Users className="w-4 h-4 text-warm-amber flex-shrink-0" />
                                    <p className="text-xs text-stone-gray font-medium whitespace-nowrap">Move to campaign:</p>
                                    <select
                                      value={assetScopePicker?.campaignId ?? ''}
                                      onChange={e => setAssetScopePicker(p => p ? { ...p, campaignId: e.target.value } : null)}
                                      className="input-cozy text-xs flex-1"
                                      autoFocus
                                    >
                                      <option value="">— select campaign —</option>
                                      {adminCampaigns.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                      ))}
                                    </select>
                                    <Button
                                      onClick={() => {
                                      if (assetScopePicker?.campaignId) {
                                      handleAdminAssetScopeChange(asset, AssetScope.CAMPAIGN, assetScopePicker.campaignId);
                                      }
                                      }}
                                      disabled={!assetScopePicker?.campaignId || isChangingScope}
                                      className="text-xs py-1 px-3 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isChangingScope && <Loader2 className="w-3 h-3 animate-spin" />}
                                      Move
                                    </Button>
                                    <Button
                                      onClick={() => setAssetScopePicker(null)}
                                      variant="secondary" className="text-xs py-1 px-3"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer: count + pagination */}
              {adminAssetsTotal > 0 && (
                <div className="px-4 py-3 border-t border-warm-gray/10 flex items-center justify-between text-xs text-warm-gray">
                  <span>
                    {adminAssetsTotal} asset{adminAssetsTotal !== 1 ? 's' : ''} total
                    {(adminAssetsScope || adminAssetsType || adminAssetsSearch) ? ' (filtered)' : ''}
                  </span>
                  {adminAssetsTotalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAdminAssetsPage(p => Math.max(1, p - 1))}
                        disabled={adminAssetsPage <= 1 || adminAssetsLoading}
                        className="p-1 rounded hover:bg-moss-green/10 disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span>Page {adminAssetsPage} of {adminAssetsTotalPages}</span>
                      <button
                        onClick={() => setAdminAssetsPage(p => Math.min(adminAssetsTotalPages, p + 1))}
                        disabled={adminAssetsPage >= adminAssetsTotalPages || adminAssetsLoading}
                        className="p-1 rounded hover:bg-moss-green/10 disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings" className="max-w-2xl space-y-6">
            <h2 className="text-xl font-semibold text-moss-green">System Settings</h2>

            {settingsLoading && !settings ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-moss-green animate-spin" />
              </div>
            ) : (
              <section className="glass-panel p-6 space-y-6">
                {/* Instance Name */}
                <div>
                  <label className="block text-sm font-medium text-stone-gray mb-1">
                    Instance Name
                  </label>
                  <input
                    type="text"
                    value={settingsForm.instanceName}
                    maxLength={100}
                    onChange={e => setSettingsForm(f => ({ ...f, instanceName: e.target.value }))}
                    className="input-cozy w-full"
                    placeholder="CozyVTT"
                  />
                  <p className="text-xs text-warm-gray mt-1">
                    The name displayed on your platform instance.
                  </p>
                </div>

                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium text-stone-gray mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={settingsForm.timezone}
                    maxLength={50}
                    onChange={e => setSettingsForm(f => ({ ...f, timezone: e.target.value }))}
                    className="input-cozy w-full"
                    placeholder="UTC"
                  />
                  <p className="text-xs text-warm-gray mt-1">
                    IANA timezone identifier (e.g. UTC, America/New_York).
                  </p>
                </div>

                {/* Allow Registration */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-gray">Allow Public Registration</p>
                    <p className="text-xs text-warm-gray mt-0.5">
                      When enabled, anyone can create an account via the registration page.
                    </p>
                  </div>
                  <button
                    onClick={() => setSettingsForm(f => ({ ...f, allowRegistration: !f.allowRegistration }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settingsForm.allowRegistration ? 'bg-moss-green' : 'bg-warm-gray/40'
                    }`}
                    role="switch"
                    aria-checked={settingsForm.allowRegistration}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settingsForm.allowRegistration ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Require Admin Approval */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-stone-gray">Require Admin Approval</p>
                    <p className="text-xs text-warm-gray mt-0.5">
                      New accounts must be approved by an admin before they can log in.
                    </p>
                  </div>
                  <button
                    onClick={() => setSettingsForm(f => ({ ...f, requireAdminApproval: !f.requireAdminApproval }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settingsForm.requireAdminApproval ? 'bg-moss-green' : 'bg-warm-gray/40'
                    }`}
                    role="switch"
                    aria-checked={settingsForm.requireAdminApproval}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settingsForm.requireAdminApproval ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-warm-gray/20 flex items-center gap-3">
                  {settingsError && (
                    <p className="text-sm text-red-600 flex-1">{settingsError}</p>
                  )}
                  <Button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving}
                    className="flex items-center gap-2 ml-auto"
                  >
                    {settingsSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Settings
                  </Button>
                </div>

              </section>
            )}

            {/* ---- SMTP Configuration (read-only) ---- */}
            <section className="glass-panel p-6 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-warm-gray/20">
                <Mail className="w-4 h-4 text-warm-amber" />
                <h3 className="font-semibold text-moss-green text-sm">SMTP Configuration</h3>
                <span className="ml-auto text-xs text-warm-gray">Read-only — set via environment variables</span>
              </div>

              {configLoading ? (
                <div className="flex items-center gap-2 text-sm text-warm-gray">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : serverConfig ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      serverConfig.smtp.configured
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${serverConfig.smtp.configured ? 'bg-green-500' : 'bg-amber-500'}`} />
                      {serverConfig.smtp.configured ? 'Configured' : 'Not configured'}
                    </span>
                    {serverConfig.smtp.configured && (
                      <span className="text-xs text-warm-gray">
                        {serverConfig.smtp.host}:{serverConfig.smtp.port}
                        {serverConfig.smtp.secure ? ' (TLS)' : ' (STARTTLS)'}
                        {serverConfig.smtp.user ? ` · ${serverConfig.smtp.user}` : ''}
                      </span>
                    )}
                  </div>

                  {serverConfig.smtp.configured && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSmtpTest}
                        disabled={smtpTesting}
                        className="flex items-center gap-2 text-sm py-1.5 px-3 rounded-lg border border-moss-green/30 text-moss-green hover:bg-moss-green/10 transition-colors disabled:opacity-50"
                      >
                        {smtpTesting
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Mail className="w-3.5 h-3.5" />
                        }
                        Send Test Email
                      </button>
                      {smtpTestResult && (
                        <span className={`text-xs ${smtpTestResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {smtpTestResult.ok ? '✓' : '✗'} {smtpTestResult.message}
                        </span>
                      )}
                    </div>
                  )}

                  {!serverConfig.smtp.configured && (
                    <p className="text-xs text-warm-gray">
                      Set <code className="font-mono bg-warm-gray/10 px-1 rounded">SMTP_HOST</code>,{' '}
                      <code className="font-mono bg-warm-gray/10 px-1 rounded">SMTP_USER</code>, and{' '}
                      <code className="font-mono bg-warm-gray/10 px-1 rounded">SMTP_PASS</code>{' '}
                      in your <code className="font-mono bg-warm-gray/10 px-1 rounded">.env</code> to enable email delivery.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-warm-gray">Could not load SMTP configuration.</p>
              )}
            </section>

            {/* ---- Upload Size Limits (read-only) ---- */}
            <section className="glass-panel p-6 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-warm-gray/20">
                <FolderOpen className="w-4 h-4 text-warm-amber" />
                <h3 className="font-semibold text-moss-green text-sm">Upload Size Limits</h3>
                <span className="ml-auto text-xs text-warm-gray">Read-only — set via environment variables</span>
              </div>

              {configLoading ? (
                <div className="flex items-center gap-2 text-sm text-warm-gray">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : serverConfig ? (
                <div>
                  <table className="w-full text-sm">
                    <tbody>
                      {(Object.entries(serverConfig.uploadLimits) as [string, number][]).map(([type, bytes]) => (
                        <tr key={type} className="border-b border-warm-gray/10 last:border-0">
                          <td className="py-1.5 text-stone-gray font-medium w-24">{type}</td>
                          <td className="py-1.5 text-warm-gray">{formatBytes(bytes)}</td>
                          <td className="py-1.5 text-right text-xs text-warm-gray/60">
                            <code className="font-mono">MAX_{type}_SIZE_MB</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-warm-gray">Could not load upload limits.</p>
              )}
            </section>

            {/* ---- Session Timeouts (read-only) ---- */}
            <section className="glass-panel p-6 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-warm-gray/20">
                <Clock className="w-4 h-4 text-warm-amber" />
                <h3 className="font-semibold text-moss-green text-sm">Session Timeouts</h3>
                <span className="ml-auto text-xs text-warm-gray">Read-only — set via environment variables</span>
              </div>

              {configLoading ? (
                <div className="flex items-center gap-2 text-sm text-warm-gray">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : serverConfig ? (
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-warm-gray/10">
                      <td className="py-1.5 text-stone-gray font-medium">Session timeout</td>
                      <td className="py-1.5 text-warm-gray">
                        {formatDuration(serverConfig.sessionTimeoutMs)}
                      </td>
                      <td className="py-1.5 text-right text-xs text-warm-gray/60">
                        <code className="font-mono">SESSION_MAX_AGE</code>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-stone-gray font-medium">Remember me</td>
                      <td className="py-1.5 text-warm-gray">
                        {formatDuration(serverConfig.rememberMeTimeoutMs)}
                      </td>
                      <td className="py-1.5 text-right text-xs text-warm-gray/60">
                        <code className="font-mono">REMEMBER_ME_MAX_AGE</code>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-warm-gray">Could not load session configuration.</p>
              )}
            </section>
          </div>
        )}

        {/* ===== APPEARANCE TAB ===== */}
        {activeTab === 'appearance' && (
          <div role="tabpanel" id="tabpanel-appearance" aria-labelledby="tab-appearance" className="max-w-3xl space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-moss-green">Default Theme &amp; Branding</h2>
              <p className="text-sm text-warm-gray mt-1">
                The default theme is shown on the login page and applied to brand-new users.
                Each user can pick their own theme from their <span className="font-medium">Profile</span>.
                Logo, favicon, and mascot remain instance-wide.
              </p>
            </div>

            {settingsLoading && !settings ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-moss-green animate-spin" />
              </div>
            ) : (
              <>
                <ThemePicker
                  themeId={appearanceForm.themeId}
                  fontId={appearanceForm.fontId}
                  customColors={appearanceForm.customColors}
                  onChange={(next) => {
                    setAppearanceForm(f => ({
                      ...f,
                      themeId: next.themeId,
                      fontId: next.fontId,
                      customColors: next.customColors,
                    }));
                  }}
                />
                {/* Save Appearance */}
                <div className="flex items-center gap-3">
                  {appearanceError && (
                    <p className="text-sm text-red-600 flex-1">{appearanceError}</p>
                  )}
                  <Button
                    onClick={async () => {
                    setAppearanceSaving(true);
                    setAppearanceError('');
                    try {
                    const updateData: Record<string, any> = {
                    themeId: appearanceForm.themeId,
                    fontId: appearanceForm.fontId,
                    };
                    if (appearanceForm.themeId === 'custom') {
                    updateData.customThemeColors = appearanceForm.customColors;
                    }
                    await adminService.updateSettings(updateData);
                    await refreshAppearance();
                    showToast('Appearance saved!', 'success');
                    } catch (err: any) {
                    setAppearanceError(err.response?.data?.message || 'Failed to save appearance');
                    } finally {
                    setAppearanceSaving(false);
                    }
                    }}
                    disabled={appearanceSaving}
                    className="flex items-center gap-2 ml-auto"
                  >
                    {appearanceSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Default Theme
                  </Button>
                  <Button
                    onClick={() => {
                    const defaultTheme = PRESET_THEMES[0];
                    setAppearanceForm(f => ({ ...f, themeId: 'cozy-default', fontId: 'default' }));
                    applyThemeColors(defaultTheme.colors);
                    applyFont(FONT_OPTIONS[0]);
                    }}
                    variant="secondary" className="text-sm"
                  >
                    Reset to Default
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== BACKUPS TAB ===== */}
        {activeTab === 'backups' && (
          <div role="tabpanel" id="tabpanel-backups" aria-labelledby="tab-backups" className="max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-moss-green">Instance Backups</h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCreateBackup}
                  disabled={creatingBackup}
                  className="flex items-center gap-2 text-sm py-1.5 px-3"
                >
                  {creatingBackup
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <HardDrive className="w-3.5 h-3.5" />
                  }
                  Create Backup
                </Button>
                <Button
                  onClick={loadBackups}
                  disabled={backupsLoading}
                  variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${backupsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {backupCreateError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{backupCreateError}</span>
              </div>
            )}

            {backupsError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
                {backupsError}
              </div>
            )}

            <section className="glass-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                <Database className="w-4 h-4 text-moss-green" />
                <h3 className="font-semibold text-moss-green text-sm">Available Backups</h3>
                {backups.length > 0 && (
                  <span className="ml-auto text-xs text-warm-gray">{backups.length} backup{backups.length !== 1 ? 's' : ''}</span>
                )}
              </div>

              {backupsLoading && backups.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-moss-green animate-spin" />
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-10 text-warm-gray">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No backups yet.</p>
                  <p className="text-xs mt-1">Click <strong>Create Backup</strong> to generate your first backup.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Filename</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Size</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Created</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map(b => (
                        <tr key={b.filename} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                          <td className="px-4 py-2.5 font-mono text-xs text-stone-gray">{b.filename}</td>
                          <td className="px-4 py-2.5 text-warm-gray text-xs">{formatBytes(b.sizeBytes)}</td>
                          <td className="px-4 py-2.5 text-warm-gray text-xs">{formatRelativeTime(b.createdAt)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <a
                                href={adminService.getBackupDownloadUrl(b.filename)}
                                download={b.filename}
                                className="text-xs py-1 px-2 flex items-center gap-1 rounded border border-moss-green/30 text-moss-green hover:bg-moss-green/10 transition-colors"
                              >
                                <Download className="w-3 h-3" />
                                Download
                              </a>
                              <button
                                onClick={() => handleDeleteBackup(b.filename)}
                                disabled={deletingBackupFile === b.filename}
                                className="text-xs py-1 px-2 flex items-center gap-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {deletingBackupFile === b.filename
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Trash2 className="w-3 h-3" />
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="glass-panel overflow-hidden border border-red-200/40">
              <div className="px-4 py-3 border-b border-red-200/30 flex items-center gap-2 bg-red-50/30">
                <RotateCcw className="w-4 h-4 text-red-600" />
                <h3 className="font-semibold text-red-700 text-sm">Restore from Backup</h3>
              </div>
              <div className="p-5 space-y-4">
                {restoreSuccess ? (
                  <div className="bg-moss-green/10 border border-moss-green/30 rounded-lg p-4 text-center space-y-2">
                    <p className="text-sm font-semibold text-moss-green">Restore complete!</p>
                    <p className="text-xs text-warm-gray">
                      The database and files have been restored. Your current session is no longer valid.
                    </p>
                    <Button
                      onClick={() => window.location.href = '/login'}
                      className="text-xs py-1.5 px-4 mt-1"
                    >
                      Go to Login
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="bg-red-50 border border-red-200/60 rounded-lg p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-red-700">
                        Restoring will <strong>permanently overwrite</strong> the current database and all uploaded files.
                        This cannot be undone. Make sure you have a recent backup before proceeding.
                      </p>
                    </div>

                    <div>
                      <input
                        ref={restoreInputRef}
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={(e) => {
                          setRestoreFile(e.target.files?.[0] ?? null);
                          setRestoreError('');
                        }}
                      />
                      <Button
                        onClick={() => restoreInputRef.current?.click()}
                        variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {restoreFile ? 'Change file' : 'Select backup file (.zip)'}
                      </Button>
                      {restoreFile && (
                        <p className="text-xs text-warm-gray mt-1.5 font-mono">
                          {restoreFile.name} ({formatBytes(restoreFile.size)})
                        </p>
                      )}
                    </div>

                    {restoreError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-start gap-2">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        {restoreError}
                      </div>
                    )}

                    {restoreFile && (
                      <button
                        onClick={handleRestoreBackup}
                        disabled={restoring}
                        className="flex items-center gap-2 text-sm py-1.5 px-4 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                      >
                        {restoring
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Restoring…</>
                          : <><RotateCcw className="w-3.5 h-3.5" /> Restore Instance</>
                        }
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ===== ACTIVITY TAB ===== */}
        {activeTab === 'activity' && (
          <div role="tabpanel" id="tabpanel-activity" aria-labelledby="tab-activity">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-moss-green">Platform Activity</h2>
              <Button
                onClick={loadActivity}
                disabled={activityLoading}
                variant="secondary" className="flex items-center gap-2 text-sm py-1.5 px-3"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${activityLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {activityError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6 text-sm">
                {activityError}
              </div>
            )}

            {activityLoading && !activity ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="glass-panel overflow-hidden">
                    <TableSkeleton rows={4} columns={4} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-8">

                {/* Currently Online */}
                <section className="glass-panel overflow-hidden">
                  <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-green-500" />
                    <h3 className="font-semibold text-moss-green text-sm">Currently Online</h3>
                    {activity?.onlineUsers && (
                      <span className="ml-auto text-xs font-medium text-green-600">
                        {activity.onlineUsers.length} active {activity.onlineUsers.length === 1 ? 'session' : 'sessions'}
                      </span>
                    )}
                  </div>
                  {!activity?.onlineUsers?.length ? (
                    <p className="text-sm text-warm-gray text-center py-6">No active sessions right now.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">User</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Email</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Role</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Last Login</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Session Expires</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activity.onlineUsers.map((u: AdminOnlineUser) => (
                            <tr key={u.id} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                                  <span className="font-medium text-stone-gray">{u.displayName}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-warm-gray">{u.email}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  u.platformRole === PlatformRole.ADMIN
                                    ? 'bg-moss-green/20 text-moss-green'
                                    : 'bg-warm-gray/20 text-warm-gray'
                                }`}>
                                  {u.platformRole}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-warm-gray text-xs">{formatRelativeTime(u.lastLoginAt)}</td>
                              <td className="px-4 py-2 text-xs text-warm-gray">{formatExpiry(u.sessionExpiry)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Recent Admin Actions */}
                <section className="glass-panel overflow-hidden">
                  <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warm-amber" />
                    <h3 className="font-semibold text-moss-green text-sm">Recent Admin Actions</h3>
                    <span className="text-xs text-warm-gray ml-auto">last 100</span>
                  </div>
                  {!activity?.recentLogs?.length ? (
                    <p className="text-sm text-warm-gray text-center py-6">No admin actions logged yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Time</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Level</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activity.recentLogs.map((log: AdminSystemLog) => (
                            <tr key={log.id} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                              <td className="px-4 py-2 text-warm-gray text-xs whitespace-nowrap">{formatRelativeTime(log.createdAt)}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${LOG_LEVEL_COLORS[log.level] ?? 'bg-warm-gray/20 text-warm-gray'}`}>
                                  {log.level}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-stone-gray">{log.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {/* Recent Registrations */}
                <section className="glass-panel overflow-hidden">
                  <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                    <Users className="w-4 h-4 text-moss-green" />
                    <h3 className="font-semibold text-moss-green text-sm">Recent Registrations</h3>
                    <span className="text-xs text-warm-gray ml-auto">50 most recent</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">User</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Email</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Role</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">MFA</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Joined</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Last Login</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!activity?.recentUsers.length ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-warm-gray">No users yet.</td>
                          </tr>
                        ) : (
                          activity.recentUsers.map(u => (
                            <tr key={u.id} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                              <td className="px-4 py-2 font-medium text-stone-gray">{u.displayName}</td>
                              <td className="px-4 py-2 text-warm-gray">{u.email}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  u.platformRole === PlatformRole.ADMIN
                                    ? 'bg-moss-green/20 text-moss-green'
                                    : 'bg-warm-gray/20 text-warm-gray'
                                }`}>
                                  {u.platformRole}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`text-xs ${u.mfaEnabled ? 'text-green-600' : 'text-warm-gray'}`}>
                                  {u.mfaEnabled ? 'On' : 'Off'}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-warm-gray text-xs">{formatDate(u.createdAt)}</td>
                              <td className="px-4 py-2 text-warm-gray text-xs">{formatDate(u.lastLoginAt)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Recent Game Sessions */}
                <section className="glass-panel overflow-hidden">
                  <div className="px-4 py-3 border-b border-warm-gray/20 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold text-moss-green text-sm">Recent Game Sessions</h3>
                    <span className="text-xs text-warm-gray ml-auto">20 most recent</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-warm-gray/10 bg-moss-green/5">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Campaign</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide"># Session</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Started</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-warm-gray uppercase tracking-wide">Ended</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!activity?.recentSessions.length ? (
                          <tr>
                            <td colSpan={4} className="text-center py-8 text-warm-gray">No sessions played yet.</td>
                          </tr>
                        ) : (
                          activity.recentSessions.map(s => (
                            <tr key={s.id} className="border-b border-warm-gray/10 hover:bg-moss-green/5">
                              <td className="px-4 py-2 font-medium text-stone-gray">{s.campaign.name}</td>
                              <td className="px-4 py-2 text-warm-gray">#{s.sessionNumber}</td>
                              <td className="px-4 py-2 text-warm-gray text-xs">{formatDate(s.startedAt)}</td>
                              <td className="px-4 py-2 text-xs">
                                {s.endedAt
                                  ? <span className="text-warm-gray">{formatDate(s.endedAt)}</span>
                                  : <span className="text-green-600 font-medium">In progress</span>
                                }
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

              </div>
            )}
          </div>
        )}

      </main>

      {/* ===== CREATE USER MODAL ===== */}
      {createUserOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget && !newUserPassword) closeCreateUserModal(); }}
        >
          <div className="bg-paper rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-warm-gray/20">
              <h2 className="text-lg font-semibold text-moss-green flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Create User
              </h2>
              {!newUserPassword && (
                <button onClick={closeCreateUserModal} className="text-warm-gray hover:text-stone-gray transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-5">
              {newUserPassword ? (
                /* Success — show temp password */
                <div>
                  <p className="text-sm text-green-700 font-medium mb-1">User created successfully!</p>
                  <p className="text-xs text-warm-gray mb-4">
                    Share this temporary password securely. The user must change it on first login.
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <code className="flex-1 bg-warm-amber/10 border border-warm-amber/30 rounded px-3 py-2 text-sm font-mono text-stone-gray select-all">
                      {newUserPassword}
                    </code>
                    <Button
                      onClick={() => handleCopyToClipboard(newUserPassword, setNewUserPasswordCopied)}
                      variant="secondary" className="flex items-center gap-1 text-xs py-2 px-3"
                    >
                      {newUserPasswordCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {newUserPasswordCopied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <Button onClick={closeCreateUserModal} className="w-full">
                    Done
                  </Button>
                </div>
              ) : (
                /* Form */
                <div className="space-y-4">
                  {createUserError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                      {createUserError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-stone-gray mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={createUserForm.email}
                      onChange={e => setCreateUserForm(f => ({ ...f, email: e.target.value }))}
                      className="input-cozy w-full"
                      placeholder="user@example.com"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-gray mb-1">
                      Display Name <span className="text-warm-gray text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={createUserForm.displayName}
                      onChange={e => setCreateUserForm(f => ({ ...f, displayName: e.target.value }))}
                      className="input-cozy w-full"
                      placeholder="Defaults to email username"
                      maxLength={50}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-gray mb-2">Platform Role</label>
                    <div className="flex gap-2">
                      {(['USER', 'ADMIN'] as const).map(role => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setCreateUserForm(f => ({ ...f, platformRole: role }))}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            createUserForm.platformRole === role
                              ? role === 'ADMIN'
                                ? 'bg-moss-green text-white border-moss-green'
                                : 'bg-stone-gray/20 text-stone-gray border-stone-gray/40'
                              : 'border-warm-gray/30 text-warm-gray hover:border-warm-gray/60'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <Button
                      onClick={handleCreateUser}
                      disabled={creatingUser || !createUserForm.email.trim()}
                      className="flex-1 flex items-center justify-center gap-2"
                    >
                      {creatingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create User
                    </Button>
                    <Button
                      onClick={closeCreateUserModal}
                      disabled={creatingUser}
                      variant="secondary" className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Restore backup confirmation */}
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="Restore Backup"
        message="WARNING: This will permanently overwrite the entire database and all uploaded files with the contents of the backup. This cannot be undone. Are you sure you want to continue?"
        confirmLabel="Restore Backup"
        variant="danger"
        isLoading={restoring}
        onConfirm={handleRestoreBackupConfirmed}
        onCancel={() => setShowRestoreConfirm(false)}
      />
    </div>
  );
}
