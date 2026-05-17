// ============================================
// Profile Service
// Thin wrapper for profile-related API calls
// ============================================

import { api } from './api';
import type { User } from '@/types/user.types';

export interface UpdateProfileData {
  displayName?: string;
  bio?: string | null;
}

class ProfileService {
  /** Update display name and/or bio */
  async updateProfile(userId: string, data: UpdateProfileData): Promise<User> {
    const response = await api.updateUser(userId, data as any);
    return response.user;
  }

  /** Upload avatar file and update user's avatarUrl */
  async uploadAvatar(userId: string, displayName: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'AVATAR');
    formData.append('scope', 'USER');
    formData.append('name', `${displayName}'s Avatar`);
    await api.uploadAsset(formData);
    await api.updateUser(userId, { avatarUrl: `/api/assets/avatars/${userId}` } as any);
  }

  /** Change the current user's password */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.changePassword({ currentPassword, newPassword });
  }

  /** Delete the current user's account (requires password confirmation) */
  async deleteAccount(password: string): Promise<void> {
    await api.deleteAccount(password);
  }
}

export const profileService = new ProfileService();
export default profileService;
