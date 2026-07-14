// ============================================
// CozyVTT Frontend Type Definitions
// Mirrors backend API models (Prisma schema)
// ============================================

// ============================================
// Enums
// ============================================

/**
 * Game system enum - mirrors backend GameSystem enum
 */
export enum GameSystem {
  DND_5E = 'DND_5E',
  PATHFINDER_2E = 'PATHFINDER_2E',
  SHADOWRUN_6E = 'SHADOWRUN_6E',
  CALL_OF_CTHULHU_7E = 'CALL_OF_CTHULHU_7E',
}

export enum PlatformRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum CampaignRole {
  DM = 'DM',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
}

export enum CampaignStatus {
  PREPARATION = 'PREPARATION',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  INACTIVE = 'INACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

export enum AssetType {
  MAP = 'MAP',
  TOKEN = 'TOKEN',
  AUDIO = 'AUDIO',
  AVATAR = 'AVATAR',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}

export enum AssetScope {
  GLOBAL = 'GLOBAL',
  USER = 'USER',
  CAMPAIGN = 'CAMPAIGN',
}

export enum MessageType {
  PLAYER = 'PLAYER',
  DM = 'DM',
  SYSTEM = 'SYSTEM',
  DICE_ROLL = 'DICE_ROLL',
  CHARACTER_ACTION = 'CHARACTER_ACTION',
}

export enum TokenLayer {
  TOKEN = 'token',
  SPIRIT = 'spirit',
}

export enum TokenType {
  PLAYER = 'player',
  NPC    = 'npc',
  OBJECT = 'object',
}

export enum TokenDisposition {
  FRIENDLY = 'friendly',
  NEUTRAL  = 'neutral',
  HOSTILE  = 'hostile',
}

export type TokenDisplayMode = 'pog' | 'top-down' | 'full-art';

/** NPC stat block — game-system-agnostic container for combat stats. */
export interface NpcStatBlock {
  /** Armor Class / Defense rating */
  ac: number;
  /** Speed (e.g. "30 ft." or "30 ft., fly 60 ft.") */
  speed: string;
  /** Ability scores */
  abilities: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  /** Saving throw bonuses, e.g. { "dex": 5, "wis": 3 } */
  savingThrows?: Record<string, number>;
  /** Skill bonuses, e.g. { "perception": 5, "stealth": 7 } */
  skills?: Record<string, number>;
  /** Damage vulnerabilities */
  damageVulnerabilities?: string;
  /** Damage resistances */
  damageResistances?: string;
  /** Damage immunities */
  damageImmunities?: string;
  /** Condition immunities */
  conditionImmunities?: string;
  /** Senses, e.g. "darkvision 60 ft., passive Perception 15" */
  senses?: string;
  /** Languages */
  languages?: string;
  /** Challenge rating, e.g. "1/4", "5" */
  challengeRating?: string;
  /** XP value */
  xp?: number;
  /** Special traits/abilities (name + description pairs) */
  traits?: Array<{ name: string; description: string }>;
  /** Actions (name + description pairs) */
  actions?: Array<{ name: string; description: string }>;
  /** Bonus actions */
  bonusActions?: Array<{ name: string; description: string }>;
  /** Reactions */
  reactions?: Array<{ name: string; description: string }>;
  /** Legendary actions */
  legendaryActions?: Array<{ name: string; description: string }>;
  /** Creature type, e.g. "Medium humanoid (goblinoid)" */
  creatureType?: string;
  /** Alignment, e.g. "neutral evil" */
  alignment?: string;
  /** Game system this stat block is designed for */
  gameSystem?: string;
  /** Any extra freeform notes */
  notes?: string;
}

/** Creature template from the library (DB model). */
export interface CreatureTemplate {
  id: string;
  name: string;
  gameSystem: GameSystem | null;
  source: string;
  challengeRating: string | null;
  creatureType: string | null;
  alignment: string | null;
  imageUrl: string | null;
  statBlock: NpcStatBlock;
  size: { width: number; height: number };
  disposition: string;
  displayMode: TokenDisplayMode;
  createdById: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenHp {
  current: number;
  max:     number;
  temp:    number;
}

/** Reusable token template — saved configuration for placing tokens across maps. */
export interface TokenTemplate {
  id: string;
  name: string;
  imageUrl: string | null;
  type: TokenType;
  disposition: TokenDisposition | null;
  displayMode: TokenDisplayMode;
  size: { width: number; height: number };
  notes: string | null;
  hp: TokenHp | null;
  showHpBar: boolean;
  statBlock: NpcStatBlock | null;
  sightRadius: number | null;
  campaignId: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// User & Authentication
// ============================================

export interface User {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  globalAssetManager: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
  isApproved?: boolean;
}

// ============================================
// Admin Types
// ============================================

export interface AssetTypeStat {
  type: string;
  count: number;
  sizeBytes: number;
}

export interface SystemStats {
  userCount: number;
  campaignCount: number;
  activeCampaignCount: number;
  totalStorageBytes: number;
  activeSessionCount: number;
  sessionCount: number;
  characterCount: number;
  mapCount: number;
  assetBreakdown: AssetTypeStat[];
}

export interface AdminSystemSettings {
  id: string;
  instanceName: string;
  timezone: string;
  allowRegistration: boolean;
  requireAdminApproval: boolean;
  themeId: string;
  customThemeColors: Record<string, string> | null;
  fontId: string;
  customLogoUrl: string | null;
  customFaviconUrl: string | null;
  customMascotUrl: string | null;
}

export interface AppearanceSettings {
  themeId: string;
  customThemeColors: Record<string, string> | null;
  fontId: string;
  customLogoUrl: string | null;
  customFaviconUrl: string | null;
  customMascotUrl: string | null;
}

export interface AdminActivitySession {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  campaign: { id: string; name: string };
}

export interface AdminOnlineUser {
  id: string;
  email: string;
  displayName: string;
  platformRole: PlatformRole;
  lastLoginAt: string | null;
  sessionExpiry: string | null;
}

export interface AdminSystemLog {
  id: string;
  level: string;
  message: string;
  userId: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminActivityData {
  recentUsers: User[];
  recentSessions: AdminActivitySession[];
  onlineUsers: AdminOnlineUser[];
  recentLogs: AdminSystemLog[];
}

// ============================================
// Admin Types (extended)
// ============================================

export interface AdminServerConfig {
  uploadLimits: {
    MAP: number;
    TOKEN: number;
    AUDIO: number;
    AVATAR: number;
  };
  sessionTimeoutMs: number;
  rememberMeTimeoutMs: number;
  smtp: {
    configured: boolean;
    host: string | null;
    port: number;
    user: string | null;
    secure: boolean;
  };
}

export interface AdminBackup {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AuthResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  pendingApproval?: boolean;
}

export interface MFARequiredResponse {
  mfaRequired: true;
  message: string;
}

export interface MFASetupResponse {
  message: string;
  qrCodeUrl: string;
  secret: string;
}

export interface MFAVerifyResponse {
  message: string;
  backupCodes: string[];
}

export interface MFALoginResponse {
  message: string;
  user: User;
  mustChangePassword?: boolean;
  backupCodeUsed?: boolean;
  remainingBackupCodes?: number;
  warning?: string;
}

// ============================================
// Campaign
// ============================================

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  gameSystem: GameSystem | null;
  status: CampaignStatus;
  currentMapId: string | null;
  vibeSettings: VibeSettings;
  currentVibe: string | null;
  spiritLayerEnabled: boolean;
  spiritLayerStyle: string;
  chatCooldownEnabled: boolean;
  chatCooldownSeconds: number;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
  memberships?: CampaignMembership[];
  /**
   * NOTE: from `GET /campaigns/:id` these are METADATA ONLY — the
   * `tokens`/`wallSegments`/`fogData`/`lights`/`annotations` map blobs and the
   * character `data` sheet are NOT included. Fetch the active map via
   * `GET /maps/:id` and a full sheet via `GET /characters/:id`. The types stay
   * full because those endpoints return full objects; do not read the omitted
   * fields off these embedded arrays.
   */
  maps?: Map[];
  characters?: Character[];
  /** Most recent open (non-ended) session, if any — populated by GET /campaigns/:id */
  activeSession?: { id: string; sessionNumber: number; startedAt: string } | null;
}

export interface VibeSettings {
  periods: VibePeriod[];
  [key: string]: any;
}

export interface VibePeriod {
  name: string;
  hue: string;
  filter: string;
  audio?: string | null;
}

export interface CampaignMembership {
  id: string;
  userId: string;
  campaignId: string;
  role: CampaignRole;
  characterIds: string[];
  joinedAt: string;
  user?: User;
}

export interface CampaignInvitation {
  id: string;
  campaignId: string;
  userId: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string | null;
  campaign?: {
    id: string;
    name: string;
    description: string | null;
    gameSystem: GameSystem | null;
    status: CampaignStatus;
    owner?: {
      displayName: string;
    };
  };
}

// ============================================
// Session
// ============================================

export interface Session {
  id: string;
  campaignId: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
  savedState: SessionState | null;
  notes: string | null;
}

export interface SessionState {
  sessionId: string;
  savedAt: string;
  mapId: string;
  tokens: Token[];
  spiritLayerVisible: boolean;
  currentVibe: string;
  annotations: Annotation[];
}

// ============================================
// Character
// ============================================

export interface Character {
  id: string;
  userId: string;
  campaignId: string | null;
  gameSystem: GameSystem | null;
  name: string;
  data: CharacterData;
  tokenImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Character data union type - supports all game systems
 * Import specific types from './game-systems' for type-safe access
 */
export type CharacterData =
  | import('./game-systems').DnD5eCharacterData
  | import('./game-systems').PF2eCharacterData
  | import('./game-systems').SR6CharacterData
  | import('./game-systems').CoC7eCharacterData;

// ============================================
// Map & Tokens
// ============================================

export interface Map {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string;
  baseLayerUrl: string;
  spiritLayerUrl: string | null;
  width: number;
  height: number;
  gridSize: number;
  feetPerSquare: number;
  diagonalRule: 'flat' | 'alternating';
  tokens: Token[];
  annotations: Annotation[];
  wallSegments?: import('./walls').WallSegment[];
  fogData?: import('./walls').FogState | null;
  lightingEnabled?: boolean;
  lights?: import('./walls').LightSource[];
  createdAt: string;
  updatedAt: string;
}

export interface Token {
  id: string;
  characterId: string | null;
  name: string;
  imageUrl: string;
  position: Position;
  size: Size;
  layer: TokenLayer;
  visible: boolean;
  controlledBy: string | null;
  rotation: number;
  conditions: string[];
  metadata: Record<string, any>;
  // Token type system
  type:        TokenType;
  disposition: TokenDisposition | null;
  hp:          TokenHp | null;
  showHpBar:   boolean;
  notes:       string;
  initiative:  number | null;
  /** Sight radius in grid squares (0 = unlimited). Used by dynamic lighting. */
  sightRadius?: number;
  /** Display mode: pog (circular + border), top-down (circular, no border), full-art (rectangular, alpha). Default: pog */
  displayMode?: TokenDisplayMode;
  /** NPC stat block — populated when placing from creature library or entered manually. */
  statBlock?: NpcStatBlock | null;
  /** ID of the creature template this token was created from (if any). */
  creatureTemplateId?: string | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  type: 'circle' | 'line' | 'rectangle' | 'polygon';
  position: Position;
  color: string;
  [key: string]: any;
}

// ============================================
// Asset
// ============================================

export interface Asset {
  id: string;
  type: AssetType;
  scope: AssetScope;
  uploadedById: string;
  campaignId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  thumbnailPath: string | null;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  /** Populated by backend include — available in list responses */
  uploadedBy?: { id: string; displayName: string };
  campaign?: { id: string; name: string } | null;
}

export interface AssetListResponse {
  assets: Asset[];
  pagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================
// Message & Chat
// ============================================

export interface Message {
  id: string;
  campaignId: string;
  userId: string | null;
  user?: User;
  type: MessageType;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface MessageMetadata {
  [key: string]: any;
}

// ============================================
// Dice Roll
// ============================================

export interface DiceRoll {
  id: string;
  campaignId: string;
  userId: string;
  expression: string;
  result: number;
  breakdown: DiceRollBreakdown;
  characterName: string | null;
  purpose: string | null;
  rolledAt: string;
}

export interface DiceRollBreakdown {
  expression: string;
  rolls: DiceRollDetail[];
  total: number;
  formula: string;
}

export interface DiceRollDetail {
  type: 'dice' | 'modifier';
  notation?: string;
  count?: number;
  sides?: number;
  results?: number[];
  total?: number;
  kept?: number[];
  value?: number;
}

// ============================================
// Campaign Export/Import
// ============================================

export interface CampaignImportPreview {
  formatVersion: number;
  exportedAt: string;
  exportedFrom: string;
  campaignName: string;
  gameSystem: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  assetCount: number;
  includesAudio: boolean;
  totalSizeBytes: number;
}

export interface CampaignImportResult {
  campaignId: string;
  campaignName: string;
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiError {
  error: string;
  message: string;
}

export interface ApiResponse<T = any> {
  message?: string;
  data?: T;
  [key: string]: any;
}

// Login
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

// Register
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

// MFA Verify
export interface MFAVerifyRequest {
  token: string;
}

export interface MFALoginVerifyRequest {
  token?: string;
  backupCode?: string;
}

// Password Reset
export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Campaign
export interface CreateCampaignRequest {
  name: string;
  gameSystem?: GameSystem;
  description?: string;
}

export interface UpdateCampaignRequest {
  name?: string;
  gameSystem?: GameSystem | null;
  description?: string;
  status?: CampaignStatus;
  vibeSettings?: VibeSettings;
  spiritLayerEnabled?: boolean;
  spiritLayerStyle?: string;
  chatCooldownEnabled?: boolean;
  chatCooldownSeconds?: number;
}

// Character
export interface CreateCharacterRequest {
  name: string;
  data?: CharacterData;
  tokenImageUrl?: string;
  gameSystem?: GameSystem | null;
  campaignId?: string;
}

export interface UpdateCharacterRequest {
  name?: string;
  data?: CharacterData;
  tokenImageUrl?: string;
}

// Map
export interface CreateMapRequest {
  name: string;
  imageUrl: string;
  width: number;
  height: number;
  gridSize?: number;
  feetPerSquare?: number;
  diagonalRule?: 'flat' | 'alternating';
  spiritLayerUrl?: string;
}

export interface UpdateMapRequest {
  name?: string;
  width?: number;
  height?: number;
  gridSize?: number;
  feetPerSquare?: number;
  diagonalRule?: 'flat' | 'alternating';
  imageUrl?: string;
  spiritLayerUrl?: string | null;
  lightingEnabled?: boolean;
}

// Token
export interface CreateTokenRequest {
  characterId?: string | null;
  name: string;
  imageUrl: string;
  position: Position;
  size?: Size;
  layer?: TokenLayer;
  visible?: boolean;
  controlledBy?: string | null;
  rotation?: number;
  conditions?: string[];
  metadata?: Record<string, any>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
}

export interface UpdateTokenRequest {
  name?: string;
  imageUrl?: string;
  position?: Position;
  size?: Size;
  layer?: TokenLayer;
  visible?: boolean;
  controlledBy?: string | null;
  rotation?: number;
  conditions?: string[];
  metadata?: Record<string, any>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
}

// ============================================
// WebSocket Event Types
// ============================================

export interface WebSocketEvent<T = any> {
  type: string;
  data: T;
  timestamp: string;
}

// Token Movement Events
export interface TokenMoveStartEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
}

export interface TokenMoveEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
  x: number;
  y: number;
}

export interface TokenMoveEndEvent {
  tokenId: string;
  mapId: string; // Required - server validates map belongs to authenticated campaign
  x: number;
  y: number;
}

export interface TokenMovedEvent {
  tokenId: string;
  x: number;
  y: number;
  movedBy: string;
}

// Dice Roll Events
export interface DiceRollEvent {
  expression: string;
  characterName?: string;
  purpose?: string;
  secret?: boolean;
}

export interface DiceRolledEvent {
  userId: string;
  userName: string;
  characterName: string | null;
  expression: string;
  result: number;
  breakdown: DiceRollBreakdown;
  purpose: string | null;
  timestamp: string;
  secret?: boolean;
}

export interface DiceRolledSecretEvent extends DiceRolledEvent {
  originalRoller: string;
  isAuditView: boolean;
}

// Chat Events
export interface ChatMessageEvent {
  content: string;
  type: MessageType;
}

export interface ChatMessageBroadcast {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: MessageType;
  timestamp: string;
}

// Session Events
export interface SessionStartEvent {
  // No fields needed - campaign ID comes from server-side socket.campaignId
}

export interface SessionStartedBroadcast {
  sessionId: string;
  sessionNumber: number;
  startedAt: string;
}

export interface SessionPausedBroadcast {
  sessionId: string;
  sessionNumber: number;
}

export interface SessionEndedBroadcast {
  sessionId: string;
  sessionNumber: number;
}

export interface SessionResumedBroadcast {
  sessionId: string;
  sessionNumber: number;
  startedAt: string;
}

// Vibe Events
export interface VibeUpdateEvent {
  period: string;
}

export interface VibeUpdatedBroadcast {
  period: string;
  hue: string;
  filter: string;
  audio?: string;
}

// Atmosphere Events
export interface AtmosphereEffectSetEvent {
  effect: string | null;
}

export interface AtmosphereEffectUpdatedBroadcast {
  effect: string | null;
  setBy: string;
  timestamp: string;
}

export interface AtmosphereAudioSetEvent {
  assetId: string | null;
  volume?: number;
  loop?: boolean;
}

export interface AtmosphereAudioUpdatedBroadcast {
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
  setBy: string;
  timestamp: string;
}

// Spirit Layer Events
export interface SpiritLayerToggleEvent {
  visible: boolean;
}

export interface SpiritLayerToggledBroadcast {
  visible: boolean;
  toggledBy: string;
  timestamp: string;
}

export interface SpiritLayerTokenToggledBroadcast {
  mapId: string;
  tokenId: string;
  visible: boolean;
  token?: Token; // Present when visible=true or for DM; minimal data when hidden
  toggledBy: string;
  timestamp: string;
}

// ============================================
// Character HP Events
// ============================================

export interface CharacterHpUpdateEvent {
  characterId: string;
  delta: number;
}

export interface CharacterHpUpdatedBroadcast {
  characterId: string;
  hp: { current: number; max: number; temp: number };
}

// ============================================
// Initiative Tracker Types
// ============================================

export interface CombatantEntry {
  tokenId: string;
  name: string;
  imageUrl: string;
  initiative: number | null;
  hp: { current: number; max: number; temp: number } | null;
  type: 'player' | 'npc' | 'object';
  disposition: 'friendly' | 'neutral' | 'hostile' | null;
}

export interface CombatState {
  active: boolean;
  round: number;
  currentTokenId: string | null;
  combatants: CombatantEntry[];
}

export interface InitiativeAddEvent    { tokenId: string; mapId: string; }
export interface InitiativeRemoveEvent { tokenId: string; }
export interface InitiativeSetEvent    { tokenId: string; mapId: string; value: number | null; }
export interface InitiativeRollEvent   { tokenId: string; mapId: string; expression: string; characterName?: string; }
export interface InitiativeReorderEvent { orderedTokenIds: string[]; }

// ============================================
// User Preferences (per-user theme + font)
// ============================================

export interface UserPreferences {
  themeId?: string;
  customThemeColors?: {
    primary: string;
    accent: string;
    background: string;
    text: string;
  } | null;
  fontId?: string;
}

// ============================================
// Game System Types
// ============================================

export * from './game-systems';
