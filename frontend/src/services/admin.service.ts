// ============================================
// Admin Service
//
// Thin domain wrapper over the api client for admin operations.
// All methods require ADMIN platform role (enforced server-side).
// ============================================

import api from './api';
import type {
  User,
  SystemStats,
  AdminSystemSettings,
  AdminActivityData,
  AdminServerConfig,
  AdminBackup,
} from '@/types';

class AdminService {
  async getStats(): Promise<SystemStats> {
    return api.getAdminStats();
  }

  async getSettings(): Promise<AdminSystemSettings> {
    return api.getAdminSettings();
  }

  async updateSettings(
    data: Partial<Omit<AdminSystemSettings, 'id'>>
  ): Promise<AdminSystemSettings> {
    return api.updateAdminSettings(data);
  }

  async getUsers(): Promise<User[]> {
    const { users } = await api.listUsers();
    return users;
  }

  async updateUser(
    userId: string,
    data: { platformRole?: string; globalAssetManager?: boolean }
  ): Promise<User> {
    const { user } = await api.updateUser(userId, data as Partial<User>);
    return user;
  }

  async resetUserPassword(userId: string): Promise<string> {
    const { temporaryPassword } = await api.adminResetUserPassword(userId);
    return temporaryPassword;
  }

  async sendPasswordResetLink(userId: string): Promise<void> {
    await api.adminSendPasswordResetLink(userId);
  }

  async deleteUser(userId: string): Promise<void> {
    await api.deleteUser(userId);
  }

  async createUser(data: {
    email: string;
    displayName?: string;
    platformRole?: string;
  }): Promise<{ user: User; emailSent: boolean; temporaryPassword?: string }> {
    const result = await api.createAdminUser(data);
    return {
      user: result.user,
      emailSent: result.emailSent,
      temporaryPassword: result.temporaryPassword,
    };
  }

  async inviteUser(data: {
    email: string;
    displayName?: string;
    platformRole?: string;
  }): Promise<{ user: User; expiresInDays: number }> {
    const result = await api.inviteAdminUser(data);
    return { user: result.user, expiresInDays: result.expiresInDays };
  }

  async resendInvite(userId: string): Promise<{ message: string; expiresInDays: number }> {
    return await api.resendAdminUserInvite(userId);
  }

  async resetMfa(userId: string): Promise<void> {
    await api.resetAdminUserMfa(userId);
  }

  async approveUser(userId: string): Promise<void> {
    await api.approveAdminUser(userId);
  }

  async getActivity(): Promise<AdminActivityData> {
    return api.getAdminActivity();
  }

  async getConfig(): Promise<AdminServerConfig> {
    return api.getAdminConfig();
  }

  async testSmtp(): Promise<string> {
    const { message } = await api.testAdminSmtp();
    return message;
  }

  async createBackup(): Promise<AdminBackup> {
    return api.createAdminBackup();
  }

  async listBackups(): Promise<AdminBackup[]> {
    return api.listAdminBackups();
  }

  getBackupDownloadUrl(filename: string): string {
    return api.getAdminBackupDownloadUrl(filename);
  }

  async deleteBackup(filename: string): Promise<void> {
    await api.deleteAdminBackup(filename);
  }

  async restoreBackup(file: File): Promise<{ message: string }> {
    return api.restoreAdminBackup(file);
  }
}

export const adminService = new AdminService();
