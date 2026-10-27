import type { CharacterHpInfo } from '@/utils/characterHp';
// ============================================
// CozyVTT Frontend Type Definitions
// Mirrors backend API models (Prisma schema)
// ============================================

// ============================================
// Enums
// ============================================

import { GameSystem } from './gameSystem';

export { GameSystem };

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
  WHISPER = 'WHISPER',
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
/**
 * How proficient a creature is in a save or skill.
 * 'custom' marks a bonus set explicitly rather than derived — used for homebrew
 * and for published creatures whose printed value does not decompose into
 * ability modifier plus a whole number of proficiency bonuses.
 */
export type ProficiencyLevel = 'none' | 'proficient' | 'expertise' | 'custom';

/** Proficiency metadata backing a creature's derived save and skill bonuses. */
export interface NpcProficiencies {
  /**
   * Overrides the proficiency bonus derived from challenge rating, for the rare
   * published monster whose printed values do not match the CR table.
   */
  bonusOverride?: number;
  saves?: Record<string, ProficiencyLevel>;
  skills?: Record<string, ProficiencyLevel>;
}

export interface NpcStatBlock {
  /** Armor Class / Defense rating */
  ac: number;
  /**
   * Maximum hit points. Optional: stat blocks saved before HP was tracked have
   * none, and callers fall back to a default (see CreatureLibrary placement).
   */
  hpMax?: number;
  /** Hit dice expression, e.g. "7d8+14" (informational) */
  hitDice?: string;
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
  /**
   * Saving throw bonuses as totals, e.g. { "dex": 5, "wis": 3 }.
   * These stay the value that is displayed and rolled. Where `proficiencies`
   * has a matching entry the total is derived and rewritten on save; where it
   * does not, the stored value is preserved verbatim (which is how every stat
   * block created before proficiency tracking keeps working unchanged).
   */
  savingThrows?: Record<string, number>;
  /** Skill bonuses as totals, e.g. { "perception": 5, "stealth": 7 }. See savingThrows. */
  skills?: Record<string, number>;
  /**
   * How each bonus above is arrived at. Optional throughout — absent means
   * "legacy data, take the totals as given".
   */
  proficiencies?: NpcProficiencies;
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
  /**
   * Attribute modifiers, used by systems that print modifiers rather than
   * scores. Pathfinder 2e stat blocks give "Str +4" directly and have no
   * underlying score, so deriving one from `abilities` would be an invention.
   * Absent for D&D 5e, where `abilities` holds scores and the modifier is
   * derived.
   */
  attributeModifiers?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  /** Challenge rating, e.g. "1/4", "5" */
  challengeRating?: string;
  /**
   * Creature level, for systems that rate creatures by level rather than
   * challenge rating (Pathfinder 2e). Kept separate from challengeRating so
   * neither system has to pretend to use the other's scale.
   */
  level?: number;
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
  disposition: TokenDisposition;
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
  /** May edit or delete anyone's character template, not just their own. */
  templateEditor: boolean;
  mfaEnabled: boolean;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
  isApproved?: boolean;
  preferences?: UserPreferences | null;
  /**
   * For an administrator without two-factor authentication: when it becomes
   * required, after which the server refuses everything but enrolment. Null
   * or absent for everyone else.
   */
  adminMfaDeadline?: string | null;
  /** How many MFA backup codes are left; null with MFA off. */
  mfaBackupCodesRemaining?: number | null;
}

/** A campaign member's user, as the campaign routes send it. */
export type MemberUser = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;

/** A chat message's author, as the message routes send it. */
export type MessageUser = Pick<User, 'id' | 'displayName'>;

/** One of the newest accounts on the Admin Panel's activity tab (GET /api/admin/activity). */
export type AdminRecentUser = Pick<
  User,
  'id' | 'email' | 'displayName' | 'platformRole' | 'mfaEnabled' | 'createdAt' | 'lastLoginAt'
>;

/**
 * A user as the Admin Panel's user list has them (GET /api/users, admins
 * only): when the account's sign-in lock ends, or null when it is not locked.
 * Absent on a user from any other route.
 */
export interface AdminListedUser extends User {
  signInLockedUntil?: string | null;
}

/** One match from the invite picker's search: never an email address. */
export type InvitableUser = Pick<User, 'id' | 'displayName' | 'avatarUrl'>;

/** GET /api/campaigns/:campaignId/invitable-users: at most 20 matches, and whether there were more. */
export interface InvitableUserSearch {
  users: InvitableUser[];
  hasMore: boolean;
}

/**
 * A shareable starter sheet. Visible to everyone; editable by its author, an
 * admin, or a user with `templateEditor`.
 *
 * Distinct from the hardcoded starter presets served by
 * `/api/characters/templates/:system/:name`, which are compiled into the
 * backend rather than stored as rows.
 */
export interface CharacterTemplate {
  id: string;
  name: string;
  description: string | null;
  gameSystem: GameSystem | null;
  /** Always a GLOBAL asset — a template is readable by everyone, so its image must be too. */
  tokenImageUrl: string | null;
  data: unknown;
  createdById: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A template as the list sends it: everything but the sheet, which
 * GET /api/character-templates/:id serves.
 */
export type CharacterTemplateSummary = Omit<CharacterTemplate, 'data'>;

// ============================================
// Admin Types
// ============================================

export interface AssetTypeStat {
  type: string;
  count: number;
  sizeBytes: number;
}

/** GET /api/admin/health: whether each part of the server is working. */
export interface AdminHealth {
  status: 'healthy' | 'degraded';
  services: { api: 'ok'; database: 'ok' | 'error'; websocket: 'ok' | 'error' };
  /** Live connections open now. */
  connections: number;
}

/** How full the disk holding the uploads folder is (GET /api/admin/stats). */
export interface UploadsDisk {
  totalBytes: number;
  /** What the server can still write. */
  freeBytes: number;
  /** Whole percent used, as `df` counts it. */
  usedPercent: number;
  /** More than 80% full. */
  warning: boolean;
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
  /** Null when the server could not read the disk. */
  uploadsDisk?: UploadsDisk | null;
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
  /** The instance's name, which the browser tab shows. */
  instanceName: string;
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
  /** The administrator who acted; null for the instance's own lines. */
  userId: string | null;
  /** That administrator's account as it is now; null when there is none, or it has been deleted. */
  actor: { id: string; email: string; displayName: string } | null;
  context: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminActivityData {
  recentUsers: AdminRecentUser[];
  recentSessions: AdminActivitySession[];
  onlineUsers: AdminOnlineUser[];
  recentLogs: AdminSystemLog[];
}

// ============================================
// Public Server Config
// ============================================

/** Upload limits in bytes, keyed by asset type — served by GET /api/config. */
/**
 * The limits a self-hoster can set, one per MAX_<TYPE>_SIZE_MB variable. The
 * same shape comes back from GET /api/config and GET /api/admin/config, so it
 * is declared once here. OTHER is not uploadable and is never reported.
 */
export interface ServerUploadLimits {
  MAP: number;
  TOKEN: number;
  AUDIO: number;
  AVATAR: number;
  DOCUMENT: number;
}

export interface ServerConfig {
  uploadLimits: ServerUploadLimits;
  maxUploadBytes: number;
  /**
   * Whether this instance can send email at all. A bare boolean — the SMTP
   * host, port and credentials stay on the admin-only config endpoint. Used to
   * disable the "also email them" option on a campaign invitation rather than
   * offering something that would silently do nothing.
   */
  smtp?: { configured: boolean };
}

// ============================================
// Admin Types (extended)
// ============================================

export interface AdminServerConfig {
  uploadLimits: ServerUploadLimits;
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

/** A file in the uploads folder that no asset names (GET /api/admin/orphaned-files). */
export interface OrphanedFile {
  /** Relative to the uploads folder. */
  path: string;
  size: number;
  modifiedAt: string;
}

export interface OrphanedFilesReport {
  /** At most 5,000, sorted by path; `total` counts them all. */
  files: OrphanedFile[];
  total: number;
  totalBytes: number;
  /** Files no asset names that changed too recently to judge, and are not listed. */
  recent: number;
  minimumAgeMinutes: number;
}

export interface OrphanedFilesDeletion {
  deleted: string[];
  /** Named, but not a leftover file by the time of the delete. */
  skipped: string[];
  failed: string[];
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
   * The requesting user's role in this campaign.
   *
   * Sent by `GET /campaigns` and `GET /campaigns/:id` (see `userRole: m.role`
   * in backend/src/routes/campaigns.ts), but it was missing from this interface
   * — code that needed it annotated the value as `any` to get at it, which is
   * how the omission survived.
   */
  userRole?: CampaignRole;
  /**
   * NOTE: from `GET /campaigns/:id` these are METADATA ONLY — the
   * `tokens`/`wallSegments`/`fogData`/`lights`/`annotations` map blobs and the
   * character `data` sheet are NOT included. Fetch the active map via
   * `GET /maps/:id` and a full sheet via `GET /characters/:id`. The types stay
   * full because those endpoints return full objects; do not read the omitted
   * fields off these embedded arrays.
   */
  maps?: CampaignMap[];
  characters?: Character[];
  /** Most recent open (non-ended) session, if any — populated by GET /campaigns/:id */
  activeSession?: { id: string; sessionNumber: number; startedAt: string } | null;
}

export interface VibeSettings {
  /** The server treats a missing flag as on, for settings saved before it existed. */
  enabled?: boolean;
  periods: VibePeriod[];
  [key: string]: unknown;
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
  user?: MemberUser;
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
    /** The member who runs the game, which is not the owner once it is handed over. */
    dm?: {
      displayName: string;
    } | null;
  };
}

/** An invitation as the campaign's DM lists them. */
export interface CampaignInvitationSummary {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string | null;
  user: { displayName: string };
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

/**
 * One of the caller's own notes, as the list returns it.
 *
 * No `content`: a note runs to tens of thousands of characters and the list
 * would otherwise move megabytes every time the panel opened. The body arrives
 * from `getNote`, one note at a time.
 */
export interface PersonalNoteSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A document as it appears in a campaign's shared list.
 *
 * `id` is the asset id, used with the document serving route. A document is
 * private to whoever uploaded it until a DM shares it with a campaign; this is
 * the shape the list of shared documents comes back in.
 */
export interface CampaignDocument {
  id: string;
  name: string;
  description: string | null;
  /** The stored file's name, whose extension the document is served by. */
  filename: string;
  originalName: string;
  /** As declared at upload. Not what the file is served as. */
  mimeType: string;
  fileSize: number;
  createdAt: string;
  /** Null once the uploader's account is deleted. */
  uploadedBy: { id: string; displayName: string } | null;
  linkedAt: string;
  /**
   * Who shared it. For the campaign's own document this is its uploader, so it
   * is null once that account is deleted, as uploadedBy is.
   */
  linkedBy: { id: string; displayName: string } | null;
  /**
   * True when shared into the campaign by link, which the DM can undo. False
   * when it is the campaign's own document, created or uploaded at CAMPAIGN
   * scope, where there is no link to remove.
   */
  shared: boolean;
  /**
   * Whether the server will take an edit of its text from the signed-in
   * user, by the rule for deleting it. Offer Edit on this alone.
   */
  canEdit: boolean;
}

/**
 * A saved dice roll, shown as a button in the dice panel.
 *
 * Private to whoever saved it and scoped to one campaign, so a table's homebrew
 * rolls do not follow you into an unrelated game. The expression is checked when
 * it is saved against the code that rolls it, so a stored macro can always be
 * rolled.
 */
export interface DiceMacro {
  id: string;
  userId: string;
  campaignId: string;
  name: string;
  expression: string;
  createdAt: string;
  updatedAt: string;
}

/** A note with its Markdown source. */
export interface PersonalNote extends PersonalNoteSummary {
  content: string;
}

/**
 * A campaign the caller is no longer in and still has notes or dice macros
 * in (GET /api/campaigns/left). Notes are titles only, newest edit first.
 */
export interface LeftCampaignSummary {
  id: string;
  name: string;
  notes: PersonalNoteSummary[];
  macros: DiceMacro[];
}

/**
 * One campaign the caller has left (GET /api/campaigns/left/:campaignId):
 * note titles, newest edit first, and macros. A note's text comes from
 * GET /api/campaigns/left/:campaignId/notes/:noteId, one note at a time, or
 * from GET /api/campaigns/left/:campaignId/notes, all of them in one answer.
 */
export interface LeftCampaignDetail {
  campaign: { id: string; name: string };
  notes: PersonalNoteSummary[];
  macros: DiceMacro[];
}

/**
 * A past session as the history list returns it.
 *
 * Deliberately without `savedState`: that is a large blob of token positions
 * kept for resuming a session, and the server does not send it here.
 */
export interface SessionSummary {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string | null;
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
  /**
   * The owner, as GET /api/characters/:id gives it to anyone who may read the
   * character. Absent from every other response, live updates included.
   */
  user?: { id: string; displayName: string; avatarUrl: string | null };
}

/**
 * A character as GET /api/characters lists it: everything but the sheet,
 * which GET /api/characters/:id serves, plus the campaign it is in.
 */
export type CharacterSummary = Omit<Character, 'data'> & {
  campaign?: { id: string; name: string } | null;
};

/**
 * Character data union type - supports all game systems
 * Import specific types from './game-systems' for type-safe access
 */
export type CharacterData =
  | import('./game-systems').DnD5eCharacterData
  | import('./game-systems').PF2eCharacterData
  | import('./game-systems').SR6CharacterData
  | import('./game-systems').CoC7eCharacterData
  // A character with no game system stores a flexible sheet here. The union
  // omitted it, so `Character.data` never admitted a shape it demonstrably
  // holds — invisible while the flexible editor's props were `any`.
  | import('./flexible-character-sheet').FlexibleCharacterData;

// ============================================
// Map & Tokens
// ============================================

export interface CampaignMap {
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
  /** Manual fog of war on this map. Absent on older payloads means on. */
  fogEnabled?: boolean;
  /** Everything in line of sight is lit. Absent on older payloads means on. */
  globalIllumination?: boolean;
  /** Explored areas are remembered per player. Absent on older payloads means on. */
  explorationEnabled?: boolean;
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
  metadata: Record<string, unknown>;
  // Token type system
  type:        TokenType;
  disposition: TokenDisposition | null;
  hp:          TokenHp | null;
  showHpBar:   boolean;
  /** The DM's notes. Never sent to players (tokenSentTo), so absent for them. */
  notes?:      string | null;
  initiative:  number | null;
  /**
   * Darkvision, in grid squares: how far the token makes things out with no
   * light (0 = none; 12 = 60 ft at 5 ft a square). It never limits how far a lit thing can be
   * noticed. Decides what the server sends, so only the DM may change it.
   */
  sightRadius?: number;
  /** Display mode: pog (circular + border), top-down (circular, no border), full-art (rectangular, alpha). Default: pog */
  displayMode?: TokenDisplayMode;
  /** NPC stat block — populated when placing from creature library or entered manually. */
  statBlock?: NpcStatBlock | null;
  /** ID of the creature template this token was created from (if any). */
  creatureTemplateId?: string | null;
  /**
   * The DM has hidden what this token is. Players who do not control it are
   * sent it with its identity masked (utils/tokenMask.ts); only the DM may set it.
   */
  obscured?: boolean;
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
  [key: string]: unknown;
}

/**
 * One member of a campaign roster, from `GET /campaigns/:id/characters`.
 *
 * The characters here are deliberately not `Character`: the endpoint strips the
 * `data` sheet and returns a derived `hp` in its place, so that no campaign
 * member can read another player's sheet off the roster.
 */
export interface RosterMember {
  userId: string;
  userName: string;
  userAvatar: string | null;
  role: CampaignRole;
  joinedAt: string;
  characters: {
    id: string;
    name: string;
    tokenImageUrl: string | null;
    gameSystem: GameSystem | null;
    userId: string;
    hp: CharacterHpInfo | null;
  }[];
}

// ============================================
// Asset
// ============================================

/**
 * A campaign that stops an account being deleted: its owner is its DM. An
 * admin clears it by handing the DM seat to one of `members`, or deleting it.
 */
export interface DeletionBlocker {
  id: string;
  name: string;
  members: { userId: string; displayName: string; role: string }[];
}

export interface Asset {
  id: string;
  type: AssetType;
  scope: AssetScope;
  /**
   * Null once the uploader's account is deleted, on the files that outlive it:
   * campaign and global uploads, and personal files something still uses. The
   * avatar and the personal files nothing uses are deleted with the account.
   */
  uploadedById: string | null;
  campaignId: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  name: string;
  description: string | null;
  tags: string[];
  createdAt: string;
  /** Populated by backend include — available in list responses */
  uploadedBy?: { id: string; displayName: string } | null;
  campaign?: { id: string; name: string } | null;
  /**
   * In the asset list only: whether the server will let this user delete the
   * asset, move it out of its scope, or rewrite it if it is a text document,
   * by the rule those routes apply.
   */
  canChange?: boolean;
}

/** What kind of record uses an asset. */
export type AssetUseKind =
  | 'map'
  | 'token'
  | 'character'
  | 'characterTemplate'
  | 'creature'
  | 'tokenTemplate'
  | 'campaignSetting'
  | 'vibePeriod';

/**
 * One place an asset is used, from the server's refusal to delete it. `name`
 * and the campaign are null where the viewer may not see the record, and then
 * `count` is how many of that kind are folded into the entry. For a map's
 * tokens `count` is how many tokens carry the picture.
 */
export interface AssetUse {
  kind: AssetUseKind;
  name: string | null;
  campaignId: string | null;
  campaignName: string | null;
  count: number;
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
  user?: MessageUser;
  type: MessageType;
  content: string;
  metadata: MessageMetadata | null;
  createdAt: string;
}

export interface MessageMetadata {
  /**
   * Free-form per-message payload — a dice breakdown, a `user.joined` action,
   * whatever the sender attached. `unknown` rather than `any` so a reader has to
   * check what it found before using it; the shape genuinely varies by message
   * type and is not worth a discriminated union while only a few types set it.
   */
  [key: string]: unknown;
}

// ============================================
// Dice Roll
// ============================================

export interface DiceRoll {
  id: string;
  campaignId: string;
  /** Null once the roller's account is deleted. */
  userId: string | null;
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

/** Something a campaign import left out, and why. */
export interface CampaignImportSkipped {
  kind: 'map' | 'token' | 'creature' | 'tokenTemplate' | 'asset';
  name: string;
  reason: string;
}

export interface CampaignImportResult {
  campaignId: string;
  campaignName: string;
  /** What was created, which may be fewer than the archive held. */
  mapCount: number;
  tokenCount: number;
  creatureCount: number;
  tokenTemplateCount: number;
  /** What was imported in a changed form, in words. */
  warnings: string[];
  /** What was left out, and why. */
  skipped: CampaignImportSkipped[];
}

// ============================================
// API Request/Response Types
// ============================================

export interface ApiError {
  error: string;
  message: string;
}

export interface ApiResponse<T = unknown> {
  message?: string;
  data?: T;
  [key: string]: unknown;
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
  /** null clears it. */
  description?: string | null;
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
  /**
   * The character's `updatedAt` as the sheet was loaded. The server refuses the
   * save with 409 if the character has changed since.
   */
  updatedAt?: string;
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
  fogEnabled?: boolean;
  globalIllumination?: boolean;
  explorationEnabled?: boolean;
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
  metadata?: Record<string, unknown>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string | null;
  initiative?: number | null;
  /** Darkvision in grid squares; 0 = none. DM only on update. */
  sightRadius?: number | null;
  /** Display mode: pog, top-down or full-art. Default: pog */
  displayMode?: TokenDisplayMode;
  /** NPC stat block, when placing from the creature library or moving a token that has one. */
  statBlock?: NpcStatBlock | null;
  /** The creature template this token came from, if any. */
  creatureTemplateId?: string | null;
  /** DM only: hide what the token is from players who do not control it. */
  obscured?: boolean;
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
  metadata?: Record<string, unknown>;
  // Token type system
  type?: TokenType;
  disposition?: TokenDisposition | null;
  hp?: TokenHp | null;
  showHpBar?: boolean;
  notes?: string;
  initiative?: number | null;
  /** Darkvision in grid squares; 0 = none. DM only on update. */
  sightRadius?: number | null;
  displayMode?: TokenDisplayMode;
  statBlock?: NpcStatBlock | null;
  creatureTemplateId?: string | null;
  /** DM only: hide what the token is from players who do not control it. */
  obscured?: boolean;
}

// ============================================
// WebSocket Event Types
// ============================================

export interface WebSocketEvent<T = unknown> {
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
  /** Null for anyone but the DM and the mover while the token is obscured. */
  movedBy: string | null;
  /**
   * Set on a frame of a drag still in progress; absent on the drop. A frame is
   * where the token is being carried, not where it stands.
   */
  dragging?: true;
}

// Dice Roll Events
export interface DiceRollEvent {
  expression: string;
  characterName?: string;
  purpose?: string;
  secret?: boolean;
}

/** The server's answer to a `dice.roll` sent with an acknowledgement: the stored roll's id, or why not. */
export type DiceRollAck = { ok: true; id: string } | { ok: false; error: string };

/** The server's answer to a request that returns nothing but whether it was done. */
export type DoneAck = { ok: true } | { ok: false; error: string };

export interface DiceRolledEvent {
  /**
   * The stored roll's id. Optional because a roll made while the session is
   * paused is evaluated in the browser and never reaches the server, so it has
   * no database row — see DiceRoller's local-roll path. Everything else, live
   * or replayed from history, carries one and dedupes on it.
   */
  id?: string;
  /** Null for a roll whose roller has since deleted their account. */
  userId: string | null;
  userName: string | null;
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
  /**
   * The sender's own name for the message, 1 to 64 letters, digits, hyphens
   * or underscores. It comes back on the sender's copy of the broadcast, and
   * a message resent with it is stored and sent once.
   */
  clientId?: string;
}

/** The server's answer to a `chat.message` sent with an acknowledgement. */
export type ChatMessageAck = { ok: true; id: string } | { ok: false; error: string };

/**
 * A system notice. The server sends the row's real id, which is what lets a
 * notice received live be recognised as the same message when history replays
 * it — see ChatPanel's merge.
 */
export interface ChatSystemBroadcast {
  id: string;
  content: string;
  metadata?: MessageMetadata;
  timestamp: string;
}

/** The `chat.message` the server sends; its fields are held to the server's by keepInStep.test.ts. */
export interface ChatMessageBroadcast {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: MessageType;
  timestamp: string;
  /** On a whisper: the one member it is for, beside its sender, and their name. */
  recipientId?: string;
  recipientName?: string;
  /** On the sender's own copy only: the `clientId` it was sent with. */
  clientId?: string;
}

// Session Events
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

/** The DM saved the vibe periods: the periods as saved, and the vibe they leave in force. */
export interface VibeSettingsUpdatedBroadcast {
  campaignId: string;
  vibeSettings: VibeSettings;
  currentVibe: string | null;
  updatedBy: string;
  timestamp: string;
}

/** The DM saved Campaign Settings (`campaign.settings.updated`): the fields every member's page shows. */
export interface CampaignSettingsUpdatedBroadcast {
  campaignId: string;
  name: string;
  description: string | null;
  gameSystem: GameSystem | null;
  chatCooldownEnabled: boolean;
  chatCooldownSeconds: number;
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

/** Where a page of chat history stopped, and whether there is more behind it. */
export interface MessagePageInfo {
  limit: number;
  hasMore: boolean;
  /** Send back as `cursor` for the page before this one. Opaque — do not build one. */
  nextCursor: string | null;
}

export interface MessageHistoryPage {
  messages: Message[];
  pagination: MessagePageInfo;
}

export interface HitDiceSpendEvent {
  characterId: string;
  /** Which pool it comes out of — a multiclass character has several. */
  index: number;
}

export interface CharacterHpUpdateEvent {
  characterId: string;
  delta: number;
}

export interface CharacterHpUpdatedBroadcast {
  characterId: string;
  hp: { current: number; max: number; temp: number };
}

/**
 * The DM seat moved to another member. Campaign ownership is a separate thing
 * and does not move with it.
 */
/** Why a connection lost its campaign, as `campaign.access.revoked` says. */
export type AccessRevokedReason = 'removed' | 'campaign-deleted' | 'signed-out';

/**
 * `campaign.access.revoked`: this connection may no longer use its campaign.
 * Declared on the server too (websocket/utils.ts); keepInStep.test.ts there
 * fails if the two differ.
 */
export interface AccessRevoked {
  /** The campaign the connection was in, or null when it had not joined one. */
  campaignId: string | null;
  reason: AccessRevokedReason;
  /** A sentence for the person, shown as it is. */
  message: string;
}

/** A member's role in a campaign changed (`campaign.role.changed`). */
export interface MemberRoleChangedBroadcast {
  campaignId: string;
  userId: string;
  role: CampaignRole;
}

export interface DmTransferredBroadcast {
  campaignId: string;
  /** Null only if the campaign somehow had no DM to demote. */
  previousDmId: string | null;
  newDmId: string;
}

// ============================================
// Initiative Tracker Types
// ============================================

export interface CombatantEntry {
  tokenId: string;
  /** The map the token is on; the server always sends it. */
  mapId: string;
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
/**
 * `expression` is only a fallback. The server derives initiative from the
 * token's character sheet or stat block, because it is the only side holding
 * either and because some systems (Call of Cthulhu) do not roll for initiative
 * at all. Send one only for a combatant nothing can be derived for.
 */
export interface InitiativeRollEvent   { tokenId: string; mapId: string; expression?: string; characterName?: string; }
export interface InitiativeReorderEvent { orderedTokenIds: string[]; }

// ============================================
// Map Pings — transient "look here" marks
// ============================================

/** Client → server. Coordinates are map pixels, not grid cells. */
export interface MapPingEvent {
  mapId: string;
  x: number;
  y: number;
}

/**
 * Server → all campaign members. Carries only the sender's id — the display
 * name and identity colour are resolved client-side from the roster.
 */
export interface MapPingedBroadcast {
  mapId: string;
  x: number;
  y: number;
  userId: string;
}

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
