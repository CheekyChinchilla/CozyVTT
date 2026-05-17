import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated, campaignMember, campaignDM, adminOnly } from '../middleware/compose';
import { prisma } from '../config/database';
import { canDeleteCampaign } from '../services/permissions';
import { captureGameState, restoreGameState, getNextSessionNumber, getLastSession } from '../services/sessionState';
import { sendSystemMessage, broadcastToUser, broadcastToCampaign } from '../websocket/utils';
import { isSmtpConfigured, sendCampaignInvitationEmail } from '../services/email';
import { DEFAULT_VIBE_SETTINGS, validateVibeSettings, findVibePeriod, VibeSettings } from '../utils/vibe-presets';
import { GameSystem } from '../game-systems';
import { exportCampaign } from '../services/campaignExporter';
import { previewCampaignImport, importCampaign } from '../services/campaignImporter';
import logger from '../utils/logger';

const router = Router();

// ── Import file upload (memory storage — ZIP stays in buffer) ───────────────
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 524288000, files: 1 }, // 500 MB hard cap
  fileFilter: (_req, file, cb) => {
    // Accept .cozyvtt or .zip MIME types
    const allowed = [
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.cozyvtt')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .cozyvtt archives are accepted.'));
    }
  },
});


/**
 * Campaign Routes
 * Per SOW Section 5.3: Campaign Endpoints
 */

/**
 * GET /api/campaigns
 * Get all campaigns the user is a member of
 * Requires: Authentication
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    // Find all campaigns where user is a member.
    // SECURITY: Do NOT include `email` in any nested user select — these
    // payloads are returned to non-admin users who can see their fellow
    // members. Emails are PII and only the owner of an account (via
    // /auth/me) or platform admins should ever receive them. Same rule
    // applies to every other endpoint in this file that embeds users.
    const memberships = await prisma.campaignMembership.findMany({
      where: { userId },
      include: {
        campaign: {
          include: {
            owner: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
            memberships: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const campaigns = memberships.map((m) => ({
      ...m.campaign,
      userRole: m.role,
      characterIds: m.characterIds,
    }));

    return res.status(200).json({ campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns',
    });
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 * Requires: Authentication
 * Note: Creator automatically becomes campaign owner and DM
 */
router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { name, description, gameSystem } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Campaign name is required',
      });
    }

    // Validate gameSystem if provided
    if (gameSystem !== undefined && gameSystem !== null) {
      const validSystems: string[] = [
        GameSystem.DND_5E,
        GameSystem.PATHFINDER_2E,
        GameSystem.SHADOWRUN_6E,
        GameSystem.CALL_OF_CTHULHU_7E,
      ];
      if (!validSystems.includes(gameSystem as string)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid game system. Must be one of: ${validSystems.join(', ')}`,
        });
      }
    }

    // Create campaign with default vibe settings and optional gameSystem
    const campaign = await prisma.campaign.create({
      data: {
        name,
        description: description || '',
        ownerId: userId,
        vibeSettings: DEFAULT_VIBE_SETTINGS as any,
        gameSystem: gameSystem || null,
      },
    });

    // Automatically add creator as DM
    await prisma.campaignMembership.create({
      data: {
        userId,
        campaignId: campaign.id,
        role: 'DM',
        characterIds: [],
      },
    });

    // Fetch campaign with memberships to return complete data.
    // SECURITY: see note in GET /api/campaigns — never embed `email` in
    // member-facing payloads.
    const campaignWithMemberships = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: {
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({
      message: 'Campaign created successfully',
      campaign: campaignWithMemberships,
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId
 * Get campaign details
 * Requires: Campaign membership (any role)
 */
router.get('/:campaignId', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        // SECURITY: never embed `email` in member-facing payloads —
        // any campaign member can hit this endpoint.
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        memberships: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        maps: true,
        characters: true,
        // Include the most recent open session for session controls UI
        sessions: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: { id: true, sessionNumber: true, startedAt: true },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found',
      });
    }

    // Flatten sessions array → activeSession (first open session, or null)
    const { sessions: _sessions, ...campaignRest } = campaign;
    return res.status(200).json({
      campaign: {
        ...campaignRest,
        activeSession: (_sessions && _sessions.length > 0) ? _sessions[0] : null,
        userRole: req.campaignMembership!.role,
      },
    });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/characters
 * Get all characters in campaign grouped by member.
 * Includes extracted HP info per character (game-system-aware).
 * Requires: Campaign membership (any role)
 */

/** Extract { current, max, temp } from character data in a game-system-aware way */
function extractCharacterHp(
  gameSystem: string | null,
  data: unknown
): { current: number; max: number; temp: number } | null {
  if (!data || !gameSystem) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  switch (gameSystem) {
    case 'DND_5E':
    case 'PATHFINDER_2E':
    case 'FLEXIBLE': {
      if (d.hp && typeof d.hp.maximum === 'number' && d.hp.maximum > 0) {
        return {
          current: typeof d.hp.current === 'number' ? d.hp.current : d.hp.maximum,
          max: d.hp.maximum,
          temp: typeof d.hp.temporary === 'number' ? d.hp.temporary : 0,
        };
      }
      return null;
    }
    case 'CALL_OF_CTHULHU_7E': {
      const hp = d.derivedStats?.hp;
      if (hp && typeof hp.maximum === 'number' && hp.maximum > 0) {
        return {
          current: typeof hp.current === 'number' ? hp.current : hp.maximum,
          max: hp.maximum,
          temp: 0,
        };
      }
      return null;
    }
    default:
      return null;
  }
}

router.get('/:campaignId/characters', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Fetch all memberships with their character assignments
    const memberships = await prisma.campaignMembership.findMany({
      where: { campaignId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Get all character IDs from all memberships
    const allCharacterIds = memberships.flatMap((m) => m.characterIds);

    // Fetch character details including data for HP extraction
    const characters = await prisma.character.findMany({
      where: {
        id: { in: allCharacterIds },
      },
      select: {
        id: true,
        name: true,
        tokenImageUrl: true,
        gameSystem: true,
        userId: true,
        data: true,
      },
    });

    // Build response — extract HP from character data, never expose raw data
    const roster = memberships.map((membership) => {
      const memberCharacters = characters
        .filter((c) => membership.characterIds.includes(c.id))
        .map(({ data, ...char }) => ({
          ...char,
          hp: extractCharacterHp(char.gameSystem, data),
        }));

      return {
        userId: membership.userId,
        userName: membership.user.displayName,
        userAvatar: membership.user.avatarUrl,
        role: membership.role,
        joinedAt: membership.joinedAt,
        characters: memberCharacters,
      };
    });

    return res.status(200).json({ roster });
  } catch (error) {
    console.error('Error fetching campaign characters:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign characters',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId
 * Update campaign settings
 * Requires: Campaign DM role
 */
router.put('/:campaignId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { name, description, status, vibeSettings, spiritLayerEnabled, spiritLayerStyle, gameSystem, chatCooldownEnabled, chatCooldownSeconds } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (vibeSettings !== undefined) updateData.vibeSettings = vibeSettings;
    if (spiritLayerEnabled !== undefined) updateData.spiritLayerEnabled = spiritLayerEnabled;
    if (spiritLayerStyle !== undefined) updateData.spiritLayerStyle = spiritLayerStyle;
    if (chatCooldownEnabled !== undefined) updateData.chatCooldownEnabled = chatCooldownEnabled;
    if (chatCooldownSeconds !== undefined) {
      const secs = Number(chatCooldownSeconds);
      if (!Number.isInteger(secs) || secs < 1 || secs > 300) {
        return res.status(400).json({ error: 'Validation Error', message: 'chatCooldownSeconds must be an integer between 1 and 300' });
      }
      updateData.chatCooldownSeconds = secs;
    }

    // Handle gameSystem update
    if (gameSystem !== undefined) {
      // Validate gameSystem if not null
      if (gameSystem !== null) {
        const validSystems: string[] = [
          GameSystem.DND_5E,
          GameSystem.PATHFINDER_2E,
          GameSystem.SHADOWRUN_6E,
          GameSystem.CALL_OF_CTHULHU_7E,
        ];
        if (!validSystems.includes(gameSystem as string)) {
          return res.status(400).json({
            error: 'Validation Error',
            message: `Invalid game system. Must be one of: ${validSystems.join(', ')}`,
          });
        }
      }

      // Check if campaign has characters - log warning if changing gameSystem
      const characterCount = await prisma.character.count({
        where: { campaignId },
      });

      if (characterCount > 0) {
        console.warn(
          `[Campaign ${campaignId}] Changing game system with ${characterCount} existing character(s). ` +
          'Character data may become incompatible with new system.'
        );
      }

      updateData.gameSystem = gameSystem;
    }

    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update campaign',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/vibe
 * Update vibe tracker settings for a campaign
 * Requires: Campaign DM role
 * Per SOW Section 18.3: Vibe Tracker Details
 */
router.put('/:campaignId/vibe', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { vibeSettings } = req.body;

    if (!vibeSettings) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'vibeSettings is required',
      });
    }

    // Validate structure
    const validationError = validateVibeSettings(vibeSettings);
    if (validationError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationError,
      });
    }

    // If campaign has a currentVibe, verify it still exists in the new periods
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentVibe: true },
    });

    const updateData: any = { vibeSettings };

    // Reset currentVibe if current period no longer exists in new settings
    if (campaign?.currentVibe) {
      const period = findVibePeriod(vibeSettings as VibeSettings, campaign.currentVibe);
      if (!period) {
        updateData.currentVibe = null;
      }
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
      select: {
        id: true,
        vibeSettings: true,
        currentVibe: true,
      },
    });

    return res.status(200).json({
      message: 'Vibe settings updated successfully',
      vibeSettings: updatedCampaign.vibeSettings,
      currentVibe: updatedCampaign.currentVibe,
    });
  } catch (error) {
    console.error('Error updating vibe settings:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update vibe settings',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId
 * Delete a campaign
 * Requires: Campaign owner or Admin
 */
router.delete('/:campaignId', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const platformRole = req.session.platformRole!;
    const { campaignId } = req.params;

    // Check permission using helper function
    const hasPermission = await canDeleteCampaign(userId, campaignId, platformRole);

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the campaign owner or admin can delete this campaign',
      });
    }

    // Convert CAMPAIGN-scoped assets to USER scope before deleting.
    // Each asset is reassigned to its uploader's personal library.
    await prisma.asset.updateMany({
      where: { campaignId, scope: 'CAMPAIGN' },
      data: { scope: 'USER', campaignId: null },
    });

    await prisma.campaign.delete({
      where: { id: campaignId },
    });

    return res.status(200).json({
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete campaign',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/invitable-users
 * List all platform users who can be invited to this campaign.
 * Excludes: existing members and users with a pending invitation.
 * Requires: Campaign DM role
 */
router.get('/:campaignId/invitable-users', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Find existing member user IDs
    const memberships = await prisma.campaignMembership.findMany({
      where: { campaignId },
      select: { userId: true },
    });

    // Find pending invitation user IDs
    const pendingInvitations = await prisma.campaignInvitation.findMany({
      where: { campaignId, status: 'PENDING' },
      select: { userId: true },
    });

    const excludedIds = [
      ...memberships.map((m) => m.userId),
      ...pendingInvitations.map((i) => i.userId),
    ];

    // SECURITY: narrow select to displayName/avatar only. Any authenticated
    // DM can call this endpoint, and `sanitizeUser` only strips password/MFA
    // — it does NOT strip email. Returning emails here would let any DM
    // harvest every account's email address via the invite picker.
    const users = await prisma.user.findMany({
      where: { id: { notIn: excludedIds } },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error fetching invitable users:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch invitable users',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/invite
 * Invite a user to join the campaign.
 * Creates a pending invitation that the user must accept.
 * Requires: Campaign DM role
 * Per SOW Section 5.3: Campaign membership management
 */
router.post('/:campaignId/invite', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { userId, expiresInDays } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'User ID is required',
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // Check if user is already a member
    const existingMembership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (existingMembership) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User is already a member of this campaign',
      });
    }

    // Check if there's already a pending invitation
    const existingInvitation = await prisma.campaignInvitation.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (existingInvitation && existingInvitation.status === 'PENDING') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User already has a pending invitation to this campaign',
      });
    }

    // Calculate expiration date if specified
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Get campaign info and DM info for notification and email
    const [campaign, dmUser] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { name: true, description: true },
      }),
      prisma.user.findUnique({
        where: { id: req.session.userId! },
        select: { displayName: true },
      }),
    ]);

    // Create or update invitation
    const invitation = await prisma.campaignInvitation.upsert({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      create: {
        userId,
        campaignId,
        status: 'PENDING',
        expiresAt,
      },
      update: {
        status: 'PENDING',
        expiresAt,
        createdAt: new Date(), // Reset creation time
      },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Broadcast invitation.received to the invited user (WebSocket, if online)
    try {
      broadcastToUser(userId, 'invitation.received', {
        invitationId: invitation.id,
        campaignId,
        campaignName: campaign!.name,
        invitedBy: req.session.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to broadcast invitation:', error);
      // Don't fail the request if broadcast fails
    }

    // Send invitation email if SMTP is configured
    if (isSmtpConfigured()) {
      sendCampaignInvitationEmail(
        user.email,
        user.displayName,
        campaign!.name,
        dmUser?.displayName ?? 'Your Dungeon Master',
        campaign!.description ?? null
      ).catch((err) => {
        console.error(`[campaigns] Failed to send invitation email to ${user.email}:`, err);
      });
    }

    return res.status(201).json({
      message: 'Invitation sent successfully',
      invitation,
    });
  } catch (error) {
    console.error('Error inviting user to campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to invite user',
    });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/members/:userId
 * Remove a member from the campaign
 * Requires: Campaign DM role
 * Per SOW Section 5.3: Cannot remove the DM
 */
router.delete('/:campaignId/members/:userId', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, userId } = req.params;

    // Find the membership
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User is not a member of this campaign',
      });
    }

    // CRITICAL: Cannot remove the DM
    if (membership.role === 'DM') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot remove the Dungeon Master from the campaign',
      });
    }

    // Delete the membership
    await prisma.campaignMembership.delete({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    return res.status(200).json({
      message: 'Member removed successfully',
    });
  } catch (error) {
    console.error('Error removing member from campaign:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove member',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/members/:userId/role
 * Change a member's role in the campaign
 * Requires: Campaign DM role
 * Per SOW Section 3.5: Only ONE DM per campaign, cannot change DM's role
 */
router.put('/:campaignId/members/:userId/role', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, userId } = req.params;
    const { role } = req.body;

    // Validate role
    if (!role || !['DM', 'PLAYER', 'SPECTATOR'].includes(role)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Role must be DM, PLAYER, or SPECTATOR',
      });
    }

    // Find the membership
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (!membership) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User is not a member of this campaign',
      });
    }

    // CRITICAL: Cannot change the DM's role
    if (membership.role === 'DM') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot change the Dungeon Master\'s role',
      });
    }

    // CRITICAL: Cannot promote to DM (only one DM allowed per campaign)
    if (role === 'DM') {
      // Check if a DM already exists
      const existingDM = await prisma.campaignMembership.findFirst({
        where: {
          campaignId,
          role: 'DM',
        },
      });

      if (existingDM) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Campaign already has a Dungeon Master. Only one DM per campaign is allowed.',
        });
      }
    }

    // Update the role
    const updatedMembership = await prisma.campaignMembership.update({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            // SECURITY: never embed `email` — this payload is returned to
            // DM-role users who shouldn't be able to harvest member emails.
          },
        },
      },
    });

    return res.status(200).json({
      message: 'Member role updated successfully',
      membership: updatedMembership,
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update member role',
    });
  }
});

/**
 * GET /api/admin/campaigns
 * Get all campaigns in the system (Admin only)
 * Requires: Admin role
 */
router.get('/admin/all', adminOnly, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
        _count: {
          select: {
            memberships: true,
            maps: true,
            characters: true,
          },
        },
      },
    });

    return res.status(200).json({ campaigns });
  } catch (error) {
    console.error('Error fetching all campaigns:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns',
    });
  }
});

/**
 * GET /api/campaigns/:campaignId/messages
 * Get chat messages for a campaign
 * Requires: Campaign member
 * Per SOW Section 6.4: Chat Messages - Load last 50 messages with pagination
 */
router.get('/:campaignId/messages', campaignMember, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { limit = '50', offset = '0' } = req.query;

    // Parse and validate pagination parameters
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Limit must be between 1 and 100',
      });
    }

    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Offset must be a non-negative number',
      });
    }

    // Get total message count
    const totalCount = await prisma.message.count({
      where: { campaignId },
    });

    // Fetch messages with pagination (newest first)
    const messages = await prisma.message.findMany({
      where: { campaignId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc', // Newest first
      },
      take: limitNum,
      skip: offsetNum,
    });

    // Format messages for response (exclude DICE_ROLL messages from chat)
    const formattedMessages = messages
      .filter((msg) => msg.type !== 'DICE_ROLL')
      .map((msg) => ({
        id: msg.id,
        userId: msg.userId,
        userName: msg.user?.displayName || null,
        user: msg.user ? {
          id: msg.user.id,
          displayName: msg.user.displayName,
        } : null,
        content: msg.content,
        type: msg.type,
        metadata: msg.metadata || null,
        createdAt: msg.createdAt.toISOString(), // Changed from 'timestamp' to 'createdAt'
      }));

    return res.status(200).json({
      messages: formattedMessages,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch messages',
    });
  }
});

/**
 * POST /api/campaigns/:campaignId/sessions
 * Start a new session
 * Requires: Campaign DM role
 * Per SOW Section 15.2: Starting a Session
 */
router.post('/:campaignId/sessions', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Check if there's already an active session
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { status: true },
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found',
      });
    }

    if (campaign.status === 'ACTIVE') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'A session is already active. Please end or pause the current session first.',
      });
    }

    // Get next session number
    const sessionNumber = await getNextSessionNumber(campaignId);

    // Create new session
    const session = await prisma.session.create({
      data: {
        campaignId,
        sessionNumber,
      },
    });

    // Update campaign status to ACTIVE
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        lastPlayedAt: new Date(),
      },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${sessionNumber} has started!`,
      { sessionId: session.id, sessionNumber, action: 'session.started' }
    );

    // Broadcast session.started so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.started', {
      sessionId: session.id,
      sessionNumber,
      startedAt: session.startedAt.toISOString(),
    });

    return res.status(201).json({
      message: 'Session started successfully',
      session: {
        id: session.id,
        sessionNumber: session.sessionNumber,
        startedAt: session.startedAt,
      },
    });
  } catch (error) {
    console.error('Error starting session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/pause
 * Pause the current session
 * Requires: Campaign DM role
 * Per SOW Section 15.2: Pausing a Session
 */
router.put('/:campaignId/sessions/:sessionId/pause', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, sessionId } = req.params;

    // Verify session exists and belongs to campaign
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        campaignId,
      },
    });

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found',
      });
    }

    if (session.endedAt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session has already ended',
      });
    }

    // Capture and save current game state
    const gameState = await captureGameState(campaignId, sessionId);
    await prisma.session.update({
      where: { id: sessionId },
      data: { savedState: gameState as any },
    });

    // Update campaign status to PAUSED
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${session.sessionNumber} has been paused. See you next time!`,
      { sessionId: session.id, sessionNumber: session.sessionNumber, action: 'session.paused' }
    );

    // Broadcast session.paused so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.paused', {
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
    });

    return res.status(200).json({
      message: 'Session paused successfully',
      stateSaved: true,
    });
  } catch (error) {
    console.error('Error pausing session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to pause session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/sessions/:sessionId/end
 * End the current session and save state
 * Requires: Campaign DM role
 * Per SOW Section 15.2: Ending a Session
 */
router.put('/:campaignId/sessions/:sessionId/end', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId, sessionId } = req.params;
    const { saveState = true, notes } = req.body;

    // Verify session exists and belongs to campaign
    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        campaignId,
      },
    });

    if (!session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found',
      });
    }

    if (session.endedAt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Session has already ended',
      });
    }

    // Capture game state if requested
    let savedState = null;
    if (saveState) {
      const gameState = await captureGameState(campaignId, sessionId);
      savedState = gameState;
    }

    // Update session with end time, optional notes, and saved state
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        savedState: savedState as any,
        ...(notes ? { notes: String(notes).slice(0, 2000) } : {}),
      },
    });

    // Update campaign status to INACTIVE (session formally ended, not just paused)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'INACTIVE' },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${session.sessionNumber} has ended.${saveState ? ' Game state saved!' : ''}`,
      {
        sessionId: session.id,
        sessionNumber: session.sessionNumber,
        action: 'session.ended',
        stateSaved: saveState,
      }
    );

    // Broadcast session.ended so all connected clients update campaign status to INACTIVE
    broadcastToCampaign(campaignId, 'session.ended', {
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
    });

    return res.status(200).json({
      message: 'Session ended successfully',
      stateSaved: saveState,
    });
  } catch (error) {
    console.error('Error ending session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to end session',
    });
  }
});

/**
 * PUT /api/campaigns/:campaignId/resume
 * Resume the last session by restoring saved state
 * Requires: Campaign DM role
 * Per SOW Section 15.2: Resuming a Session
 */
router.put('/:campaignId/resume', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get the most recent session
    const lastSession = await getLastSession(campaignId);

    if (!lastSession) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No previous session found',
      });
    }

    // Check if session has saved state
    if (!lastSession.savedState) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No saved state available for the last session',
      });
    }

    // Restore game state
    await restoreGameState(campaignId, lastSession.savedState as any);

    // Clear endedAt to "reopen" the session
    await prisma.session.update({
      where: { id: lastSession.id },
      data: { endedAt: null },
    });

    // Update campaign status to ACTIVE
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'ACTIVE',
        lastPlayedAt: new Date(),
      },
    });

    // Send system message
    await sendSystemMessage(
      campaignId,
      `Session ${lastSession.sessionNumber} has been resumed!`,
      {
        sessionId: lastSession.id,
        sessionNumber: lastSession.sessionNumber,
        action: 'session.resumed',
      }
    );

    // Broadcast session.resumed so all connected clients update campaign status
    broadcastToCampaign(campaignId, 'session.resumed', {
      sessionId: lastSession.id,
      sessionNumber: lastSession.sessionNumber,
      startedAt: lastSession.startedAt.toISOString(),
    });

    return res.status(200).json({
      message: 'Session resumed successfully',
      session: {
        id: lastSession.id,
        sessionNumber: lastSession.sessionNumber,
      },
    });
  } catch (error) {
    console.error('Error resuming session:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resume session',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Campaign Export / Import
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/campaigns/:campaignId/export
 * Export campaign as a .cozyvtt ZIP archive.
 * Query params:
 *   includeAudio (boolean, default false)
 *   includeTokens (boolean, default true)
 * Requires: Campaign DM role
 */
router.get('/:campaignId/export', campaignDM, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const includeAudio = req.query.includeAudio === 'true';
    const includeTokens = req.query.includeTokens !== 'false'; // default true

    logger.info('Campaign export started', { campaignId, includeAudio, includeTokens, userId: req.session.userId });

    const result = await exportCampaign(campaignId, { includeAudio, includeTokens });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    return res.send(result.buffer);
  } catch (error: any) {
    logger.error('Campaign export failed', { campaignId: req.params.campaignId, error: error.message });

    if (error.message === 'Campaign not found') {
      return res.status(404).json({ error: 'Not Found', message: 'Campaign not found' });
    }

    return res.status(500).json({
      error: 'Export Failed',
      message: 'Failed to export campaign. Please try again.',
    });
  }
});

/**
 * POST /api/campaigns/import/preview
 * Upload a .cozyvtt archive and return its manifest preview.
 * Does NOT create anything — just reads manifest.json.
 * Requires: Authentication
 */
router.post('/import/preview', authenticated, (req: Request, res: Response, next: NextFunction): void => {
  importUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File Too Large', message: 'Archive exceeds 500 MB limit.' });
        return;
      }
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded.' });
    }

    const preview = await previewCampaignImport(req.file.buffer);
    return res.status(200).json({ preview });
  } catch (error: any) {
    logger.warn('Campaign import preview failed', { error: error.message });
    return res.status(400).json({
      error: 'Invalid Archive',
      message: error.message || 'Could not read archive.',
    });
  }
});

/**
 * POST /api/campaigns/import
 * Upload a .cozyvtt archive and create a new campaign from it.
 * Body (multipart): file + optional JSON fields:
 *   campaignName (string) — override campaign name
 *   importTokens (boolean, default true)
 * Requires: Authentication, rate limited
 */
router.post('/import', authenticated, (req: Request, res: Response, next: NextFunction): void => {
  importUpload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File Too Large', message: 'Archive exceeds 500 MB limit.' });
        return;
      }
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'Upload Error', message: err.message });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Validation Error', message: 'No file uploaded.' });
    }

    const userId = req.session.userId!;
    const campaignName = typeof req.body.campaignName === 'string' ? req.body.campaignName.trim() : undefined;
    const importTokens = req.body.importTokens !== 'false'; // default true

    if (campaignName !== undefined && (campaignName.length === 0 || campaignName.length > 200)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Campaign name must be between 1 and 200 characters.',
      });
    }

    logger.info('Campaign import started', { userId, importTokens, hasNameOverride: !!campaignName });

    const result = await importCampaign(req.file.buffer, userId, {
      importTokens,
      campaignName: campaignName || undefined,
    });

    return res.status(201).json({
      message: 'Campaign imported successfully',
      ...result,
    });
  } catch (error: any) {
    logger.error('Campaign import failed', { error: error.message, userId: req.session?.userId });
    return res.status(400).json({
      error: 'Import Failed',
      message: error.message || 'Failed to import campaign.',
    });
  }
});

export default router;
