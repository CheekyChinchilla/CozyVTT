# Prisma Schema Verification Checklist

> **A historical record, not a current picture.** This captures the schema
> verification done for the v1.0.0 release on 10 February 2026, against a
> statement of work that is not in this repository. The schema has grown a lot
> since: **21 models and 9 enums today**, against the 10 and 7 recorded below.
>
> Models added since and *not* in the February list: `PasswordResetToken`,
> `CampaignInvitation`, `CharacterTemplate`, `CreatureTemplate`,
> `CreatureFavorite`, `TokenTemplate`, `SystemSettings`, `PersonalNote`,
> `DiceMacro`, `CampaignDocument`, `MapExploration`. The `MapExploration`
> section and the last four `Map` fields below were added to this file in
> September 2026, for columns added after v1.0.0.
>
> Treat `backend/prisma/schema.prisma` as the source of truth. Kept because
> most of the field-level and relationship checks below still hold for the
> original models and are useful when changing them. The ones that have
> changed since say so.

---

## Models (10/10, as verified in February 2026)

- ✅ User
- ✅ Campaign
- ✅ CampaignMembership
- ✅ Session
- ✅ Character
- ✅ Map
- ✅ Asset
- ✅ Message
- ✅ DiceRoll
- ✅ SystemLog

## Enums (7/7, as verified in February 2026)

- ✅ PlatformRole (ADMIN, USER)
- ✅ CampaignStatus (PREPARATION, ACTIVE, PAUSED, COMPLETED, ARCHIVED; `INACTIVE` was added in March 2026, `20260303000000_add_inactive_campaign_status`)
- ✅ CampaignRole (DM, PLAYER, SPECTATOR)
- ✅ AssetType (MAP, TOKEN, AUDIO, AVATAR, DOCUMENT, OTHER)
- ✅ AssetScope (GLOBAL, CAMPAIGN; `USER` was added in March 2026, `20260311000000_add_user_asset_scope_and_global_asset_manager`)
- ✅ MessageType (PLAYER, DM, SYSTEM, DICE_ROLL, CHARACTER_ACTION)
- ✅ LogLevel (INFO, WARNING, ERROR, CRITICAL)

## Indexes & Constraints (18/18)

- ✅ User.email (unique)
- ✅ User.email (index)
- ✅ Campaign.ownerId (index)
- ✅ Campaign.status (index)
- ✅ CampaignMembership (userId, campaignId) unique
- ✅ CampaignMembership.campaignId (index)
- ✅ CampaignMembership.userId (index)
- ✅ Session.campaignId (index)
- ✅ Character.userId (index)
- ✅ Character.campaignId (index)
- ✅ Map.campaignId (index)
- ✅ Asset.campaignId (index)
- ✅ Asset.type (index)
- ✅ Asset.scope (index)
- ✅ Asset.uploadedById (index)
- ✅ Message (campaignId, createdAt) composite index
- ✅ DiceRoll (campaignId, rolledAt) composite index
- ✅ SystemLog (level, createdAt) composite index

## Critical Fields Verification

### User Model
- ✅ id: uuid (primary key)
- ✅ email: unique string
- ✅ passwordHash: string (NOT password)
- ✅ platformRole: PlatformRole enum
- ✅ mfaEnabled: boolean (default false)
- ✅ mfaSecret: nullable string
- ✅ mfaBackupCodes: string array
- ✅ timestamps: createdAt, updatedAt, lastLoginAt

### Campaign Model
- ✅ id: uuid (primary key)
- ✅ ownerId: foreign key to User
- ✅ currentMapId: nullable foreign key to Map
- ✅ vibeSettings: JSON
- ✅ spiritLayerEnabled: boolean (default false)
- ✅ spiritLayerStyle: string (default "wispy")
- ✅ status: CampaignStatus enum
- ✅ timestamps: createdAt, updatedAt, lastPlayedAt

### CampaignMembership Model
- ✅ id: uuid (primary key)
- ✅ userId: foreign key with cascade delete
- ✅ campaignId: foreign key with cascade delete
- ✅ role: CampaignRole enum
- ✅ characterIds: string array
- ✅ unique constraint on (userId, campaignId)

### Character Model
- ✅ id: uuid (primary key)
- ✅ userId: foreign key with cascade delete
- ✅ campaignId: nullable foreign key with SetNull
- ✅ data: JSON (flexible schema)
- ✅ tokenImageUrl: nullable string

### Map Model
- ✅ id: uuid (primary key)
- ✅ campaignId: foreign key with cascade delete
- ✅ gridSize: int (default 50)
- ✅ baseLayerUrl: string
- ✅ spiritLayerUrl: nullable string
- ✅ tokens: JSON array
- ✅ annotations: JSON array
- ✅ lightingEnabled: boolean (default false)
- ✅ fogEnabled: boolean (default true; the create route sets false for new maps)
- ✅ globalIllumination: boolean (default true; the create route sets false for new maps)
- ✅ explorationEnabled: boolean (default true; the create route sets false for new maps)

### MapExploration Model
- ✅ id: uuid (primary key)
- ✅ mapId: foreign key to Map with cascade delete
- ✅ userId: foreign key to User with cascade delete
- ✅ explored: JSON (FogState shape)
- ✅ unique (mapId, userId); index on mapId

### Asset Model
- ✅ id: uuid (primary key)
- ✅ type: AssetType enum
- ✅ scope: AssetScope enum
- ✅ uploadedById: nullable foreign key to User, set to null when the user is deleted
- ✅ campaignId: nullable foreign key; it cascaded at v1.0.0, and since `20260304100000_asset_campaign_set_null` it is set to null when the campaign is deleted
- ✅ filePath: string (relative path)
- ✅ tags: string array

## Relationship Verification

### User Relationships (6 at v1.0.0; 15 today)
- ✅ ownedCampaigns → Campaign[] (@relation "CampaignOwner")
- ✅ campaignMemberships → CampaignMembership[]
- ✅ characters → Character[]
- ✅ messages → Message[]
- ✅ diceRolls → DiceRoll[]
- ✅ uploadedAssets → Asset[]

### Campaign Relationships (9 at v1.0.0; 16 today)
- ✅ owner → User (@relation "CampaignOwner")
- ✅ currentMap → Map? (@relation "CurrentMap")
- ✅ memberships → CampaignMembership[]
- ✅ maps → Map[] (@relation "CampaignMaps")
- ✅ characters → Character[]
- ✅ messages → Message[]
- ✅ diceRolls → DiceRoll[]
- ✅ assets → Asset[]
- ✅ sessions → Session[]

### Cascade Delete Verification
- ✅ Campaign delete → cascades to memberships
- ✅ Campaign delete → cascades to maps
- ✅ Campaign delete → cascades to sessions
- ✅ Campaign delete → cascades to assets (until March 2026: the assets are now kept, turned into their uploaders' USER assets by the delete route, and `Asset.campaignId` is set to null)
- ✅ User delete → cascades to characters
- ✅ User delete → cascades to memberships
- ✅ Character.campaignId → SetNull (preserves character)
- ✅ Message.userId → SetNull (preserves message history)

## JSON Field Verification

- ✅ Campaign.vibeSettings (time period configuration)
- ✅ Map.tokens (token positions array)
- ✅ Map.annotations (drawings/markers array)
- ✅ Character.data (flexible character sheet)
- ✅ Message.metadata (additional context)
- ✅ DiceRoll.breakdown (detailed roll results)
- ✅ Session.savedState (game state snapshot)
- ✅ SystemLog.context (additional log data)

## Database Configuration

- ✅ Provider: PostgreSQL
- ✅ Client generator: prisma-client-js
- ✅ Database URL from environment variable
- ✅ All models use @db.Text for long strings
- ✅ All timestamps properly configured

## SOW Compliance

- ✅ Matches SOW Section 4.1 exactly
- ✅ All field names match specification
- ✅ All types match specification
- ✅ All defaults match specification
- ✅ All indexes match specification
- ✅ Coordinate system notes documented in SOW Section 4.2
- ✅ Token schema notes documented in SOW Section 4.2

---

## Testing Recommendations

Before proceeding to next phase:

```bash
# Verify schema syntax
npx prisma validate

# Generate Prisma Client (should complete without errors)
npx prisma generate

# Format schema
npx prisma format
```

---

**Schema status at the v1.0.0 verification (February 2026):** every item above checked. This says nothing about the schema as it is today.
