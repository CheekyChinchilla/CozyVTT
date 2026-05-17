import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  User,
  AuthResponse,
  MFARequiredResponse,
  MFASetupResponse,
  MFAVerifyResponse,
  MFALoginResponse,
  LoginRequest,
  RegisterRequest,
  MFAVerifyRequest,
  MFALoginVerifyRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  Campaign,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  Character,
  CreateCharacterRequest,
  UpdateCharacterRequest,
  Asset,
  AssetListResponse,
  Map,
  CreateMapRequest,
  UpdateMapRequest,
  CreateTokenRequest,
  UpdateTokenRequest,
  Token,
  CreatureTemplate,
  TokenTemplate,
  CampaignImportPreview,
  CampaignImportResult,
  Message,
  Session,
  CampaignInvitation,
  ApiError,
  SystemStats,
  AdminSystemSettings,
  AdminActivityData,
  AdminServerConfig,
  AdminBackup,
  AppearanceSettings,
  UserPreferences,
} from '@/types';

// ============================================
// API Client Configuration
// ============================================

// Use relative URL in development to leverage Vite's proxy (Docker support)
// Use absolute URL in production
// Empty string = relative URLs (Nginx proxies /api/* to backend in production,
// Vite dev server proxies in development)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      withCredentials: true, // Important: sends cookies with requests
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Add any request modifications here (e.g., auth tokens if needed)
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        // Handle common errors
        if (error.response) {
          const { status, data } = error.response;

          // Unauthorized - redirect to login, but only from protected pages.
          // Public pages (auth flows, reset password, setup, welcome) should
          // not redirect — their 401s are expected (user is not yet logged in).
          if (status === 401) {
            const pathname = window.location.pathname;
            const isPublicPage =
              pathname.startsWith('/auth') ||
              pathname === '/reset-password' ||
              pathname === '/setup' ||
              pathname === '/';
            if (!isPublicPage) {
              window.location.href = '/auth/login';
            }
          }

          // Forbidden
          if (status === 403) {
            console.error('Permission denied:', data.message);
          }

          // Rate limited
          if (status === 429) {
            console.error('Rate limit exceeded:', data.message);
          }
        } else if (error.request) {
          // Network error
          console.error('Network error:', error.message);
        }

        return Promise.reject(error);
      }
    );
  }

  // ============================================
  // Authentication
  // ============================================

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/api/auth/register', data);
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse | MFARequiredResponse> {
    const response = await this.client.post<AuthResponse | MFARequiredResponse>('/api/auth/login', data);
    return response.data;
  }

  async logout(): Promise<{ message: string }> {
    const response = await this.client.post('/api/auth/logout');
    return response.data;
  }

  async getCurrentUser(): Promise<{ user: User }> {
    const response = await this.client.get<{ user: User }>('/api/auth/me');
    return response.data;
  }

  async pingSession(): Promise<void> {
    await this.client.get('/api/auth/ping');
  }

  async getRegistrationStatus(): Promise<{ allowRegistration: boolean }> {
    const response = await this.client.get<{ allowRegistration: boolean }>('/api/auth/registration-status');
    return response.data;
  }

  async getAppearance(): Promise<AppearanceSettings> {
    const response = await this.client.get<AppearanceSettings>('/api/auth/appearance');
    return response.data;
  }

  async forgotPassword(data: ForgotPasswordRequest): Promise<{ message: string }> {
    const response = await this.client.post('/api/auth/forgot-password', data);
    return response.data;
  }

  async resetPassword(data: ResetPasswordRequest): Promise<{ message: string }> {
    const response = await this.client.post('/api/auth/reset-password', data);
    return response.data;
  }

  async changePassword(data: ChangePasswordRequest): Promise<{ message: string }> {
    const response = await this.client.post('/api/auth/change-password', data);
    return response.data;
  }

  async deleteAccount(password: string): Promise<{ message: string }> {
    const response = await this.client.delete('/api/auth/account', { data: { password } });
    return response.data;
  }

  // ============================================
  // Setup
  // ============================================

  async checkSetupStatus(): Promise<{ setupCompleted: boolean; hasUsers: boolean; needsSetup: boolean }> {
    const response = await this.client.get('/api/setup/status');
    return response.data;
  }

  async initializeSetup(data: { email: string; password: string; displayName: string }): Promise<{ message: string; user: User }> {
    const response = await this.client.post('/api/setup/init', data);
    return response.data;
  }

  // ============================================
  // MFA
  // ============================================

  async mfaSetup(): Promise<MFASetupResponse> {
    const response = await this.client.post<MFASetupResponse>('/api/auth/mfa/setup');
    return response.data;
  }

  async mfaVerifySetup(data: MFAVerifyRequest): Promise<MFAVerifyResponse> {
    const response = await this.client.post<MFAVerifyResponse>('/api/auth/mfa/verify', data);
    return response.data;
  }

  async mfaVerifyLogin(data: MFALoginVerifyRequest): Promise<MFALoginResponse> {
    const response = await this.client.post<MFALoginResponse>('/api/auth/mfa/verify-login', data);
    return response.data;
  }

  async mfaDisable(password: string, token: string): Promise<{ message: string }> {
    const response = await this.client.post('/api/auth/mfa/disable', { password, token });
    return response.data;
  }

  async mfaRegenerateBackupCodes(password: string): Promise<MFAVerifyResponse> {
    const response = await this.client.post<MFAVerifyResponse>('/api/auth/mfa/backup-codes', { password });
    return response.data;
  }

  // ============================================
  // Users
  // ============================================

  async listUsers(): Promise<{ users: User[] }> {
    const response = await this.client.get<{ users: User[] }>('/api/users');
    return response.data;
  }

  async getUser(id: string): Promise<{ user: User }> {
    const response = await this.client.get<{ user: User }>(`/api/users/${id}`);
    return response.data;
  }

  async updateUser(id: string, data: Partial<User>): Promise<{ message: string; user: User }> {
    const response = await this.client.put(`/api/users/${id}`, data);
    return response.data;
  }

  async deleteUser(id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/users/${id}`);
    return response.data;
  }

  async adminResetUserPassword(id: string): Promise<{ message: string; temporaryPassword: string }> {
    const response = await this.client.post(`/api/users/${id}/reset-password`);
    return response.data;
  }

  async adminSendPasswordResetLink(id: string): Promise<{ message: string }> {
    const response = await this.client.post(`/api/users/${id}/send-reset-link`);
    return response.data;
  }

  // ============================================
  // User Preferences (per-user theme/font/dice/etc.)
  // ============================================

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const response = await this.client.get<{ preferences: UserPreferences }>(
      `/api/users/${userId}/preferences`
    );
    return response.data.preferences ?? {};
  }

  async updateUserPreferences(
    userId: string,
    prefs: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    const response = await this.client.put<{ preferences: UserPreferences }>(
      `/api/users/${userId}/preferences`,
      prefs
    );
    return response.data.preferences ?? {};
  }

  // ============================================
  // Admin
  // ============================================

  async getAdminStats(): Promise<SystemStats> {
    const response = await this.client.get<SystemStats>('/api/admin/stats');
    return response.data;
  }

  async getAdminSettings(): Promise<AdminSystemSettings> {
    const response = await this.client.get<{ settings: AdminSystemSettings }>('/api/admin/settings');
    return response.data.settings;
  }

  async updateAdminSettings(data: Partial<Omit<AdminSystemSettings, 'id'>>): Promise<AdminSystemSettings> {
    const response = await this.client.put<{ message: string; settings: AdminSystemSettings }>(
      '/api/admin/settings',
      data
    );
    return response.data.settings;
  }

  async getAdminActivity(): Promise<AdminActivityData> {
    const response = await this.client.get<AdminActivityData>('/api/admin/activity');
    return response.data;
  }

  async createAdminUser(data: {
    email: string;
    displayName?: string;
    platformRole?: string;
  }): Promise<{ message: string; user: User; temporaryPassword: string }> {
    const response = await this.client.post('/api/admin/users', data);
    return response.data;
  }

  async resetAdminUserMfa(userId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/api/admin/users/${userId}/reset-mfa`);
    return response.data;
  }

  async approveAdminUser(userId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/api/admin/users/${userId}/approve`);
    return response.data;
  }

  async getAdminConfig(): Promise<AdminServerConfig> {
    const response = await this.client.get<AdminServerConfig>('/api/admin/config');
    return response.data;
  }

  async testAdminSmtp(): Promise<{ message: string }> {
    const response = await this.client.post('/api/admin/smtp/test');
    return response.data;
  }

  async createAdminBackup(): Promise<AdminBackup> {
    const response = await this.client.post<AdminBackup>('/api/admin/backups');
    return response.data;
  }

  async listAdminBackups(): Promise<AdminBackup[]> {
    const response = await this.client.get<{ backups: AdminBackup[] }>('/api/admin/backups');
    return response.data.backups;
  }

  getAdminBackupDownloadUrl(filename: string): string {
    return `${API_BASE_URL}/api/admin/backups/${encodeURIComponent(filename)}/download`;
  }

  async deleteAdminBackup(filename: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/admin/backups/${encodeURIComponent(filename)}`);
    return response.data;
  }

  async restoreAdminBackup(file: File): Promise<{ message: string }> {
    const formData = new FormData();
    formData.append('backup', file);
    const response = await this.client.post<{ message: string }>('/api/admin/backups/restore', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // ============================================
  // Campaigns
  // ============================================

  async listCampaigns(): Promise<{ campaigns: Campaign[] }> {
    const response = await this.client.get<{ campaigns: Campaign[] }>('/api/campaigns');
    return response.data;
  }

  async adminListAllCampaigns(): Promise<{ campaigns: Campaign[] }> {
    const response = await this.client.get<{ campaigns: Campaign[] }>('/api/campaigns/admin/all');
    return response.data;
  }

  async createCampaign(data: CreateCampaignRequest): Promise<{ message: string; campaign: Campaign }> {
    const response = await this.client.post('/api/campaigns', data);
    return response.data;
  }

  async getCampaign(id: string): Promise<{ campaign: Campaign }> {
    const response = await this.client.get<{ campaign: Campaign }>(`/api/campaigns/${id}`);
    return response.data;
  }

  async updateCampaign(id: string, data: UpdateCampaignRequest): Promise<{ message: string; campaign: Campaign }> {
    const response = await this.client.put(`/api/campaigns/${id}`, data);
    return response.data;
  }

  async deleteCampaign(id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${id}`);
    return response.data;
  }

  async listInvitableUsers(campaignId: string): Promise<{ users: User[] }> {
    const response = await this.client.get<{ users: User[] }>(`/api/campaigns/${campaignId}/invitable-users`);
    return response.data;
  }

  async inviteUserToCampaign(campaignId: string, userId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/invite`, { userId });
    return response.data;
  }

  async removeCampaignMember(campaignId: string, userId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${campaignId}/members/${userId}`);
    return response.data;
  }

  async changeCampaignMemberRole(campaignId: string, userId: string, role: string): Promise<{ message: string }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/members/${userId}/role`, { role });
    return response.data;
  }

  async updateVibeSettings(
    campaignId: string,
    vibeSettings: import('@/types').VibeSettings,
  ): Promise<{ message: string; vibeSettings: import('@/types').VibeSettings; currentVibe: string | null }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/vibe`, { vibeSettings });
    return response.data;
  }

  async getCampaignCharacters(campaignId: string): Promise<{ roster: any[] }> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/characters`);
    return response.data;
  }

  // ============================================
  // Campaign Invitations
  // ============================================

  async getPendingInvitations(): Promise<CampaignInvitation[]> {
    const response = await this.client.get('/api/invitations');
    return response.data;
  }

  async acceptInvitation(invitationId: string, characterIds: string[]): Promise<{ message: string; membership: any }> {
    const response = await this.client.post(`/api/invitations/${invitationId}/accept`, { characterIds });
    return response.data;
  }

  async declineInvitation(invitationId: string): Promise<{ message: string }> {
    const response = await this.client.post(`/api/invitations/${invitationId}/decline`);
    return response.data;
  }

  // ============================================
  // Sessions
  // ============================================

  async startSession(campaignId: string): Promise<{ message: string; session: Session }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/sessions`);
    return response.data;
  }

  async pauseSession(campaignId: string, sessionId: string): Promise<{ message: string }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/sessions/${sessionId}/pause`);
    return response.data;
  }

  async endSession(
    campaignId: string,
    sessionId: string,
    saveState: boolean = true,
    notes?: string,
  ): Promise<{ message: string; stateSaved: boolean }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/sessions/${sessionId}/end`, {
      saveState,
      notes,
    });
    return response.data;
  }

  async resumeSession(campaignId: string): Promise<{ message: string; session: Session }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/resume`);
    return response.data;
  }

  // ============================================
  // Characters
  // ============================================

  async listCharacters(): Promise<{ characters: Character[] }> {
    const response = await this.client.get<{ characters: Character[] }>('/api/characters');
    return response.data;
  }

  async createCharacter(data: CreateCharacterRequest): Promise<{ message: string; character: Character }> {
    const response = await this.client.post('/api/characters', data);
    return response.data;
  }

  async getCharacter(id: string): Promise<{ character: Character }> {
    const response = await this.client.get<{ character: Character }>(`/api/characters/${id}`);
    return response.data;
  }

  async updateCharacter(id: string, data: UpdateCharacterRequest): Promise<{ message: string; character: Character }> {
    const response = await this.client.put(`/api/characters/${id}`, data);
    return response.data;
  }

  async deleteCharacter(id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/characters/${id}`);
    return response.data;
  }

  async assignCharacterToCampaign(id: string, campaignId: string | null): Promise<{ message: string; character: Character }> {
    const response = await this.client.post(`/api/characters/${id}/assign`, { campaignId });
    return response.data;
  }

  async copyCharacter(id: string): Promise<{ message: string; character: Character }> {
    const response = await this.client.post(`/api/characters/${id}/copy`);
    return response.data;
  }

  async validateCharacter(id: string): Promise<{ isValid: boolean; errors?: Array<{ path: string; message: string; code: string }> }> {
    const response = await this.client.get(`/api/characters/${id}/validate`);
    return response.data;
  }

  // ============================================
  // Assets
  // ============================================

  async listAssets(params?: {
    type?: string;
    scope?: string;
    campaignId?: string;
    page?: number;
    limit?: number;
    search?: string;
    uploadedBy?: string;
  }): Promise<AssetListResponse> {
    const response = await this.client.get<AssetListResponse>('/api/assets', { params });
    return response.data;
  }

  async uploadAsset(formData: FormData): Promise<{ message: string; asset: Asset }> {
    const response = await this.client.post('/api/assets/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  async getAsset(id: string): Promise<{ asset: Asset }> {
    const response = await this.client.get<{ asset: Asset }>(`/api/assets/${id}`);
    return response.data;
  }

  async deleteAsset(id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/assets/${id}`);
    return response.data;
  }

  async patchAssetScope(id: string, scope: string, campaignId?: string): Promise<{ message: string; asset: Asset }> {
    const response = await this.client.patch(`/api/assets/${id}/scope`, { scope, campaignId });
    return response.data;
  }

  getAssetUrl(id: string, type: 'maps' | 'tokens' | 'audio' | 'avatars'): string {
    return `${API_BASE_URL}/api/assets/${type}/${id}`;
  }

  // ============================================
  // Maps & Tokens
  // ============================================

  async listMaps(campaignId: string): Promise<{ maps: Map[] }> {
    const response = await this.client.get<{ maps: Map[] }>(`/api/campaigns/${campaignId}/maps`);
    return response.data;
  }

  async createMap(campaignId: string, data: CreateMapRequest): Promise<{ map: Map }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/maps`, data);
    return response.data;
  }

  async getMap(campaignId: string, mapId: string): Promise<{ map: Map; spiritVisible?: boolean }> {
    const response = await this.client.get<{ map: Map; spiritVisible?: boolean }>(`/api/campaigns/${campaignId}/maps/${mapId}`);
    return response.data;
  }

  async updateMap(campaignId: string, mapId: string, data: UpdateMapRequest): Promise<{ map: Map }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/maps/${mapId}`, data);
    return response.data;
  }

  /**
   * Get the URL for downloading a UVTT export of a map.
   * Uses the base URL so the browser can handle the file download with auth cookies.
   */
  getExportUVTTUrl(campaignId: string, mapId: string): string {
    return `/api/campaigns/${campaignId}/maps/${mapId}/export-uvtt`;
  }

  async importUVTT(
    campaignId: string,
    file: File,
    name?: string,
    gridSize?: number,
  ): Promise<{ map: Map; wallCount: number; portalCount: number; totalSegments: number }> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    if (gridSize) formData.append('gridSize', String(gridSize));
    const response = await this.client.post(
      `/api/campaigns/${campaignId}/maps/import-uvtt`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  }

  async deleteMap(campaignId: string, mapId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${campaignId}/maps/${mapId}`);
    return response.data;
  }

  async setCurrentMap(campaignId: string, mapId: string): Promise<{ message: string }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/maps/${mapId}/set-current`);
    return response.data;
  }

  async addToken(campaignId: string, mapId: string, data: CreateTokenRequest): Promise<{ message: string; token: Token }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`, data);
    return response.data;
  }

  async updateToken(campaignId: string, mapId: string, tokenId: string, data: UpdateTokenRequest): Promise<{ message: string; token: Token }> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`, data);
    return response.data;
  }

  async deleteToken(campaignId: string, mapId: string, tokenId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${tokenId}`);
    return response.data;
  }

  // ============================================
  // Creature Library
  // ============================================

  async listCreatures(
    campaignId: string,
    params?: { search?: string; source?: string; cr?: string; gameSystem?: string; limit?: number; offset?: number }
  ): Promise<{ creatures: CreatureTemplate[]; total: number; limit: number; offset: number }> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/creatures`, { params });
    return response.data;
  }

  async getCreature(campaignId: string, creatureId: string): Promise<CreatureTemplate> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/creatures/${creatureId}`);
    return response.data;
  }

  async createCreature(campaignId: string, data: Partial<CreatureTemplate>): Promise<CreatureTemplate> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/creatures`, data);
    return response.data;
  }

  async updateCreature(campaignId: string, creatureId: string, data: Partial<CreatureTemplate>): Promise<CreatureTemplate> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/creatures/${creatureId}`, data);
    return response.data;
  }

  async deleteCreature(campaignId: string, creatureId: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${campaignId}/creatures/${creatureId}`);
    return response.data;
  }

  async getSeedStatus(campaignId: string): Promise<{ srdCount: number; customCount: number; seedInProgress: boolean }> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/creatures/seed/status`);
    return response.data;
  }

  async seedSrdCreatures(campaignId: string): Promise<{ message: string; fetched: number; created: number; skipped: number; alreadyExisted: number }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/creatures/seed`);
    return response.data;
  }

  async duplicateCreature(campaignId: string, creatureId: string): Promise<CreatureTemplate> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/creatures/${creatureId}/duplicate`);
    return response.data;
  }

  async listCreatureFavorites(campaignId: string): Promise<{ favoriteIds: string[]; creatures: CreatureTemplate[] }> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/creatures/favorites/list`);
    return response.data;
  }

  async toggleCreatureFavorite(campaignId: string, creatureId: string): Promise<{ favorited: boolean }> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/creatures/${creatureId}/favorite`);
    return response.data;
  }

  // ============================================
  // Token Templates
  // ============================================

  async listTokenTemplates(
    campaignId: string,
    params?: { search?: string; type?: string; limit?: number; offset?: number }
  ): Promise<{ templates: TokenTemplate[]; total: number; limit: number; offset: number }> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/token-templates`, { params });
    return response.data;
  }

  async getTokenTemplate(campaignId: string, id: string): Promise<TokenTemplate> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/token-templates/${id}`);
    return response.data;
  }

  async createTokenTemplate(campaignId: string, data: Partial<TokenTemplate>): Promise<TokenTemplate> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/token-templates`, data);
    return response.data;
  }

  async updateTokenTemplate(campaignId: string, id: string, data: Partial<TokenTemplate>): Promise<TokenTemplate> {
    const response = await this.client.put(`/api/campaigns/${campaignId}/token-templates/${id}`, data);
    return response.data;
  }

  async deleteTokenTemplate(campaignId: string, id: string): Promise<{ message: string }> {
    const response = await this.client.delete(`/api/campaigns/${campaignId}/token-templates/${id}`);
    return response.data;
  }

  async saveTokenAsTemplate(campaignId: string, tokenData: Partial<TokenTemplate>): Promise<TokenTemplate> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/token-templates/from-token`, tokenData);
    return response.data;
  }

  async copyTokenTemplateToCampaign(campaignId: string, templateId: string, targetCampaignId: string): Promise<TokenTemplate> {
    const response = await this.client.post(`/api/campaigns/${campaignId}/token-templates/${templateId}/copy-to/${targetCampaignId}`);
    return response.data;
  }

  // ============================================
  // Campaign Export/Import
  // ============================================

  async exportCampaign(campaignId: string, params?: { includeAudio?: boolean; includeTokens?: boolean }): Promise<Blob> {
    const response = await this.client.get(`/api/campaigns/${campaignId}/export`, {
      params,
      responseType: 'blob',
    });
    return response.data;
  }

  async previewCampaignImport(formData: FormData): Promise<CampaignImportPreview> {
    const response = await this.client.post('/api/campaigns/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.preview;
  }

  async importCampaign(formData: FormData): Promise<CampaignImportResult> {
    const response = await this.client.post('/api/campaigns/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min for large archives
    });
    return response.data;
  }

  // ============================================
  // Messages
  // ============================================

  async getMessages(campaignId: string, params?: { limit?: number; before?: string }): Promise<{ messages: Message[] }> {
    const response = await this.client.get<{ messages: Message[] }>(`/api/campaigns/${campaignId}/messages`, { params });
    return response.data;
  }
}

// Export singleton instance
export const api = new ApiClient();
export default api;
