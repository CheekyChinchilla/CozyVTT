import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/rbac';
import { authenticated } from '../middleware/compose';
import { prisma } from '../config/database';
import type { Prisma } from '@prisma/client';
import { normalizeAssetUrl } from '../utils/asset-urls';
import { GameSystem } from '../game-systems';
import { validateCharacterData, applyIdentityToSheet, sheetNameFor } from '../validators/game-systems';
import { CreateCharacterSchema, UpdateCharacterSchema } from '../validators/characters';
import { broadcastToCampaign } from '../websocket/utils';
import logger from '../utils/logger';
import { errorMessage } from '../utils/errors';
import { readTokens, toJson, readJsonObject } from '../utils/prisma-json';
import { extractCharacterHp, sameCharacterHp } from '../utils/characterHp';

/**
 * The `issues` array off a thrown Zod-shaped error.
 *
 * Duck-typed rather than `instanceof z.ZodError` because that is what the code
 * this replaces checked, and the two differ for an error that merely looks
 * like one.
 */
interface ZodLikeIssue {
  path: Array<string | number>;
  message: string;
  code?: string;
}
function zodLikeIssues(error: unknown): ZodLikeIssue[] | undefined {
  if (error && typeof error === 'object' && 'errors' in error) {
    const { errors } = error as { errors: unknown };
    if (Array.isArray(errors)) return errors as ZodLikeIssue[];
  }
  return undefined;
}


const router = Router();

/**
 * Character Management Routes
 * Character Management
 */

/**
 * POST /api/characters
 * Create a new character
 * Requires: Authentication
 */
router.post('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const parsed = CreateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid character data',
      });
    }
    const { name, data, tokenImageUrl, gameSystem, campaignId } = parsed.data;

    // Determine final gameSystem value
    let finalGameSystem = gameSystem;

    // Creating straight into a campaign. The membership has to be checked here
    // and updated below, because campaign membership is recorded in two places:
    // `Character.campaignId`, and the `characterIds` array on the member's
    // `CampaignMembership`. Nearly everything a player sees reads the second —
    // the roster is built from it, and services/permissions.ts asks it whether
    // a player may move a token. Writing only the column left a character that
    // was in the campaign but invisible in it, and whose own owner could not
    // move its token. POST /:id/assign has always written both; this mirrors it.
    let membershipToJoin: { characterIds: string[] } | null = null;

    if (campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { gameSystem: true },
      });

      if (!campaign) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Campaign not found',
        });
      }

      membershipToJoin = await prisma.campaignMembership.findUnique({
        where: { userId_campaignId: { userId, campaignId } },
        select: { characterIds: true },
      });

      if (!membershipToJoin) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You must be a member of the campaign to create a character in it',
        });
      }

      if (!gameSystem) {
        // Prisma's GameSystem is a string-literal union; cast to the local enum
        // type finalGameSystem was inferred from (identical string values).
        finalGameSystem = campaign.gameSystem as GameSystem | null;
      }
    }

    // Put the name the user typed, and their display name, into the sheet
    // itself. The sheet blob carries its own name field separate from the
    // `name` column, and nothing joined the two — so a character created as
    // "Aldra" opened showing the factory placeholder "New Character" with an
    // empty player name. Done here rather than in the modal so it also covers
    // copying a template and any API client.
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    const dataWithIdentity = applyIdentityToSheet(
      finalGameSystem as GameSystem | null,
      data as Record<string, unknown> | undefined,
      name,
      owner?.displayName ?? ''
    );

    // Validate gameSystem if provided
    if (finalGameSystem !== undefined && finalGameSystem !== null) {
      const validSystems: string[] = [
        GameSystem.DND_5E,
        GameSystem.PATHFINDER_2E,
        GameSystem.SHADOWRUN_6E,
        GameSystem.CALL_OF_CTHULHU_7E,
      ];
      if (!validSystems.includes(finalGameSystem as string)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid game system. Must be one of: ${validSystems.join(', ')}`,
        });
      }

      // Validate character data against schema if gameSystem is specified
      const validationResult = validateCharacterData(finalGameSystem as GameSystem, dataWithIdentity);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Character data does not match game system schema',
          validationErrors: validationResult.errors.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
    }

    // Create character with flexible JSON data field
    // Normalize tokenImageUrl to full path if provided
    const normalizedTokenImageUrl = tokenImageUrl ? normalizeAssetUrl(tokenImageUrl, 'tokens') : null;

    // Both halves in one transaction. Written separately, a failure between
    // them would produce exactly the state this fixes: a character carrying a
    // campaignId that the campaign itself does not know about.
    const character = await prisma.$transaction(async (tx) => {
      const created = await tx.character.create({
        data: {
          userId,
          name,
          data: dataWithIdentity as Prisma.InputJsonValue,
          tokenImageUrl: normalizedTokenImageUrl,
          campaignId: campaignId || null,
          gameSystem: finalGameSystem || null,
        },
      });

      if (campaignId && membershipToJoin && !membershipToJoin.characterIds.includes(created.id)) {
        await tx.campaignMembership.update({
          where: { userId_campaignId: { userId, campaignId } },
          data: { characterIds: [...membershipToJoin.characterIds, created.id] },
        });
      }

      return created;
    });

    return res.status(201).json({
      message: 'Character created successfully',
      character,
    });
  } catch (error) {
    logger.error('Error creating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create character',
    });
  }
});

/**
 * GET /api/characters
 * List all characters owned by the authenticated user
 * Requires: Authentication
 */
router.get('/', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;

    const characters = await prisma.character.findMany({
      where: { userId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.status(200).json({ characters });
  } catch (error) {
    logger.error('Error fetching characters', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch characters',
    });
  }
});

/**
 * GET /api/characters/templates/:gameSystem/:templateName
 * Get a specific character template for a game system
 * Requires: Authentication
 * NOTE: This route MUST come before GET /:id to avoid route conflicts
 */
router.get(
  '/templates/:gameSystem/:templateName',
  authenticated,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { gameSystem, templateName } = req.params;

      // Handle flexible templates (no game system)
      if (!gameSystem || gameSystem === 'null' || gameSystem === 'undefined') {
        const { FLEXIBLE_TEMPLATES } = await import(
          '../utils/character-templates/flexible-templates'
        );
        const template = FLEXIBLE_TEMPLATES[templateName];

        if (!template) {
          return res.status(404).json({
            error: 'Template Not Found',
            message: `Template '${templateName}' not found for flexible characters`,
          });
        }

        return res.status(200).json({
          message: 'Template retrieved successfully',
          ...template,
        });
      }

      // Validate game system
      if (!Object.values(GameSystem).includes(gameSystem as GameSystem)) {
        return res.status(400).json({
          error: 'Validation Error',
          message: `Invalid game system: ${gameSystem}`,
        });
      }

      // Import template functions
      const { getCharacterTemplate } = await import('../utils/character-templates');

      // Get the template
      const template = getCharacterTemplate(gameSystem as GameSystem, templateName);

      return res.status(200).json({
        message: 'Template retrieved successfully',
        ...template,
      });
    } catch (error) {
      logger.error('Error fetching character template', { err: error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch character template',
      });
    }
  }
);

/**
 * GET /api/characters/:id
 * Get a specific character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.get('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const character = await prisma.character.findUnique({
      where: { id },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            // SECURITY: never embed `email` — this endpoint can be hit by
            // any campaign member viewing another player's character.
          },
        },
      },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Check authorization: owner can always view
    if (character.userId === userId) {
      return res.status(200).json({ character });
    }

    // If character is in a campaign, check if requester is a campaign member
    // All campaign members can VIEW characters, but only owner/DM can EDIT
    if (character.campaignId) {
      const membership = await prisma.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId,
            campaignId: character.campaignId,
          },
        },
      });

      // Any campaign member (DM, PLAYER, SPECTATOR) can view characters in the campaign
      if (membership) {
        return res.status(200).json({ character });
      }
    }

    // Not authorized
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to view this character',
    });
  } catch (error) {
    logger.error('Error fetching character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch character',
    });
  }
});

/**
 * GET /api/characters/:id/validate
 * Validate character data against game system schema
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.get('/:id/validate', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const character = await prisma.character.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        gameSystem: true,
        data: true,
      },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Only character owner can validate (prevent info leakage)
    if (character.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to validate this character',
      });
    }

    // Cannot validate without a game system
    if (!character.gameSystem) {
      return res.status(400).json({
        isValid: false,
        errors: [{
          path: 'gameSystem',
          message: 'Character has no game system assigned',
          code: 'no_game_system',
        }],
      });
    }

    // Validate character data
    try {
      validateCharacterData(character.gameSystem as GameSystem, character.data);

      return res.status(200).json({
        isValid: true,
      });
    } catch (error: unknown) {
      // TODO(typing): this catch cannot fire on a validation failure.
      // `validateCharacterData` *returns* `{ success: false, errors }` rather
      // than throwing, and the call above discards its return value — so this
      // endpoint answers `isValid: true` for every character, valid or not.
      // Left exactly as it was: a typing pass must not change what an endpoint
      // returns. Logged separately to be fixed with a test that fails first.
      const issues = zodLikeIssues(error);
      if (issues) {
        const formattedErrors = issues.map((err) => ({
          path: err.path.join('.') || 'root',
          message: err.message,
          code: err.code,
        }));

        return res.status(200).json({
          isValid: false,
          errors: formattedErrors,
        });
      }

      // Unknown validation error
      return res.status(200).json({
        isValid: false,
        errors: [{
          path: 'unknown',
          message: errorMessage(error) || 'Unknown validation error',
          code: 'unknown',
        }],
      });
    }
  } catch (error) {
    logger.error('Error validating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate character',
    });
  }
});

/**
 * PUT /api/characters/:id
 * Update a character
 * Requires: Authentication
 * Authorization: Character owner OR campaign DM (if character is in a campaign)
 */
router.put('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const parsed = UpdateCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: parsed.error.issues[0]?.message ?? 'Invalid character data',
      });
    }
    const { name, data, tokenImageUrl, gameSystem } = parsed.data;

    // Find character first to check authorization
    const character = await prisma.character.findUnique({
      where: { id },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Prevent changing gameSystem after creation
    if (gameSystem !== undefined && gameSystem !== character.gameSystem) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot change game system after character creation. Create a new character instead.',
      });
    }

    // Check authorization
    let isAuthorized = false;

    // Owner can always edit
    if (character.userId === userId) {
      isAuthorized = true;
    }

    // If character is in a campaign, check if requester is the DM
    if (!isAuthorized && character.campaignId) {
      const membership = await prisma.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId,
            campaignId: character.campaignId,
          },
        },
      });

      if (membership && membership.role === 'DM') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to edit this character',
      });
    }

    // Validate data update if character has gameSystem
    if (character.gameSystem && data !== undefined) {
      const validationResult = validateCharacterData(character.gameSystem as GameSystem, data);
      if (!validationResult.success) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Character data does not match game system schema',
          validationErrors: validationResult.errors.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
    }

    // Build update data
    const updateData: {
      name?: string;
      data?: Prisma.InputJsonValue;
      tokenImageUrl?: string | null;
    } = {};
    if (name !== undefined) updateData.name = name;
    if (data !== undefined) updateData.data = toJson(data);

    // Keep the `name` column in step with the name typed on the sheet.
    //
    // A character carries its name twice — the column, which the gallery, the
    // roster and the editor's title bar read, and a field inside the sheet blob,
    // which is what the sheet's own input edits. Renaming on the sheet updated
    // only the blob, so everything outside the sheet went on showing the name
    // the character was created with. The sheet is the thing the user typed
    // into, so it wins; an explicit `name` in the request still takes priority.
    if (name === undefined && data !== undefined && character.gameSystem) {
      const sheetName = sheetNameFor(character.gameSystem as GameSystem, data as Record<string, unknown>);
      if (sheetName && sheetName !== character.name) {
        updateData.name = sheetName;
      }
    }
    if (tokenImageUrl !== undefined) {
      // Normalize tokenImageUrl to full path (or null)
      updateData.tokenImageUrl = tokenImageUrl ? normalizeAssetUrl(tokenImageUrl, 'tokens') : null;
    }

    const updatedCharacter = await prisma.character.update({
      where: { id },
      data: updateData,
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // A map token stores its own COPY of the character's image, taken when it
    // was placed — there is no Token table, tokens live as JSON on the map. So
    // changing the sheet's token image left every placed token showing the old
    // picture until the DM removed and re-added it.
    //
    // This has to happen here rather than from the client: `imageUrl` is a
    // DM-only field on PUT /maps/:id/tokens/:tokenId, so a player editing their
    // own character would be refused.
    //
    // Only the image is synced. A token's NAME is deliberately left alone: the
    // DM may have renamed it ("Aldra (charmed)", or A/B for duplicates) and
    // silently overwriting that on the player's next save would be its own bug.
    let tokensChanged = false;
    const campaignsWithChangedTokens = new Set<string>();
    if (
      updateData.tokenImageUrl !== undefined &&
      updateData.tokenImageUrl !== character.tokenImageUrl
    ) {
      try {
        // Maps are found by the binding itself — a token carrying this
        // `characterId` — rather than by the character's own `campaignId`.
        //
        // Scoping by campaignId silently missed most of the cases it needed to
        // cover, because a character reaches a mismatched state easily:
        // unassigning it nulls `campaignId` and leaves its tokens where they
        // were, a character with tokens in two campaigns can only point at one
        // of them, and a DM placing a player's character writes the token's
        // `characterId` without touching the character. In every one of those
        // the player saw their new picture on the sheet while the token kept the
        // old one, and only removing and re-adding the token helped.
        //
        // `@>` is jsonb containment, so this is one indexable query rather than
        // reading every map in the campaign.
        const boundMaps = await prisma.$queryRaw<
          Array<{ id: string; campaignId: string; tokens: Prisma.JsonValue }>
        >`
          SELECT id, "campaignId", tokens
          FROM "Map"
          WHERE tokens @> ${JSON.stringify([{ characterId: updatedCharacter.id }])}::jsonb
        `;

        for (const map of boundMaps) {
          const tokens = readTokens(map.tokens);
          let mapChanged = false;

          const nextTokens = tokens.map((token) => {
            if (token?.characterId !== updatedCharacter.id) return token;
            mapChanged = true;
            return { ...token, imageUrl: updateData.tokenImageUrl ?? '' };
          });

          if (mapChanged) {
            await prisma.map.update({ where: { id: map.id }, data: { tokens: toJson(nextTokens) } });
            tokensChanged = true;
            campaignsWithChangedTokens.add(map.campaignId);
          }
        }
      } catch (error) {
        // The character update itself already succeeded and is what the user
        // asked for; a failure to repaint tokens must not fail the request.
        logger.error('Failed to sync token images after character update', { err: error });
      }
    }

    // Broadcast character update to campaign if character is in a campaign
    if (updatedCharacter.campaignId) {
      try {
        broadcastToCampaign(updatedCharacter.campaignId, 'character.updated', {
          characterId: updatedCharacter.id,
          character: updatedCharacter,
          userId,
          // Lets the map refetch only when a token actually changed, rather
          // than on every sheet save — HP edits broadcast through here too.
          tokensChanged,
        });

        // Hit points additionally go out as `character.hp.updated`, the narrow
        // event the campaign screen's HP cache is built on — it feeds both the
        // roster cards and the HP bars drawn on map tokens.
        //
        // Until this was added, only the roster's own +/- control emitted it,
        // from a WebSocket handler. Editing HP on the sheet took this route
        // instead, so the new value reached the database and the broadcast above
        // but never the cache, and the campaign screen went on showing the old
        // number until the page was refreshed and the roster refetched.
        //
        // Sent only when the value really moved: every roster card and token bar
        // re-renders on this, and most sheet saves do not touch hit points.
        const previousHp = extractCharacterHp(
          updatedCharacter.gameSystem,
          readJsonObject(character.data)
        );
        const currentHp = extractCharacterHp(
          updatedCharacter.gameSystem,
          readJsonObject(updatedCharacter.data)
        );
        if (currentHp && !sameCharacterHp(previousHp, currentHp)) {
          broadcastToCampaign(updatedCharacter.campaignId, 'character.hp.updated', {
            characterId: updatedCharacter.id,
            hp: currentHp,
          });
        }
      } catch (error) {
        logger.error('Failed to broadcast character update', { err: error });
        // Don't fail the request if broadcast fails
      }
    }

    // A campaign whose map holds a token for this character still needs to
    // repaint it, even when the character does not belong to that campaign —
    // which is the ordinary case once `campaignId` is null, and the reason the
    // token used to sit on the old picture until it was removed and re-added.
    //
    // The sheet itself is deliberately NOT sent here. Membership of the
    // character's campaign is what entitles someone to read it, and these
    // campaigns are by definition not that one; they get the id and the fact
    // that a token moved on, which is all a repaint needs.
    try {
      for (const affectedCampaignId of campaignsWithChangedTokens) {
        if (affectedCampaignId === updatedCharacter.campaignId) continue;
        broadcastToCampaign(affectedCampaignId, 'character.updated', {
          characterId: updatedCharacter.id,
          tokensChanged: true,
        });
      }
    } catch (error) {
      logger.error('Failed to broadcast token repaint', { err: error });
    }

    return res.status(200).json({
      message: 'Character updated successfully',
      character: updatedCharacter,
    });
  } catch (error) {
    logger.error('Error updating character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update character',
    });
  }
});

/**
 * DELETE /api/characters/:id
 * Delete a character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.delete('/:id', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    const character = await prisma.character.findUnique({
      where: { id },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Only owner can delete
    if (character.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the character owner can delete this character',
      });
    }

    await prisma.character.delete({
      where: { id },
    });

    return res.status(200).json({
      message: 'Character deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete character',
    });
  }
});

/**
 * POST /api/characters/:id/assign
 * Assign a character to a campaign (or unassign if campaignId is null/empty)
 * Requires: Authentication
 * Authorization: Character owner only
 * Validation: User must be a member of the target campaign (if assigning)
 */
router.post('/:id/assign', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const { campaignId } = req.body;

    const character = await prisma.character.findUnique({
      where: { id },
    });

    if (!character) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Only owner can assign/unassign character
    if (character.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the character owner can assign this character to a campaign',
      });
    }

    // Handle unassignment (campaignId is null, empty string, or undefined)
    if (!campaignId || campaignId === '') {
      // Remove from previous campaign's membership characterIds if assigned
      if (character.campaignId) {
        const previousMembership = await prisma.campaignMembership.findUnique({
          where: {
            userId_campaignId: {
              userId,
              campaignId: character.campaignId,
            },
          },
        });

        if (previousMembership) {
          await prisma.campaignMembership.update({
            where: {
              userId_campaignId: {
                userId,
                campaignId: character.campaignId,
              },
            },
            data: {
              characterIds: previousMembership.characterIds.filter((cId) => cId !== id),
            },
          });
        }
      }

      const updatedCharacter = await prisma.character.update({
        where: { id },
        data: { campaignId: null },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              gameSystem: true,
            },
          },
        },
      });

      // Broadcast roster.updated WebSocket event
      if (character.campaignId) {
        try {
          broadcastToCampaign(character.campaignId, 'roster.updated', {
            action: 'character.unassigned',
            characterId: id,
            userId,
          });
        } catch (error) {
          logger.error('Failed to broadcast roster update', { err: error });
          // Don't fail the request if broadcast fails
        }
      }

      return res.status(200).json({
        message: 'Character unassigned from campaign successfully',
        character: updatedCharacter,
      });
    }

    // Handle assignment - validate campaign exists and user is a member
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        gameSystem: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found',
      });
    }

    // Check if user is a member of the campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId,
          campaignId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You must be a member of the campaign to assign a character to it',
      });
    }

    // Enforce game system compatibility:
    // flexible character (null) only goes to flexible campaigns (null), and vice versa.
    // typed characters must match the campaign's game system exactly.
    const charSystem = character.gameSystem;
    const campSystem = campaign.gameSystem;
    const systemsCompatible =
      (!charSystem && !campSystem) ||
      (charSystem && campSystem && charSystem === campSystem);

    if (!systemsCompatible) {
      const charLabel = charSystem ?? 'flexible';
      const campLabel = campSystem ?? 'flexible';
      return res.status(400).json({
        error: 'Game System Mismatch',
        message: `Cannot assign a ${charLabel} character to a ${campLabel} campaign. Character and campaign game systems must match.`,
      });
    }

    // Remove from previous campaign's membership if changing campaigns
    if (character.campaignId && character.campaignId !== campaignId) {
      const previousMembership = await prisma.campaignMembership.findUnique({
        where: {
          userId_campaignId: {
            userId,
            campaignId: character.campaignId,
          },
        },
      });

      if (previousMembership) {
        await prisma.campaignMembership.update({
          where: {
            userId_campaignId: {
              userId,
              campaignId: character.campaignId,
            },
          },
          data: {
            characterIds: previousMembership.characterIds.filter((cId) => cId !== id),
          },
        });
      }
    }

    // Add to new campaign's membership characterIds
    if (!membership.characterIds.includes(id)) {
      await prisma.campaignMembership.update({
        where: {
          userId_campaignId: {
            userId,
            campaignId,
          },
        },
        data: {
          characterIds: [...membership.characterIds, id],
        },
      });
    }

    // Assign character to campaign
    const updatedCharacter = await prisma.character.update({
      where: { id },
      data: { campaignId },
      include: {
        campaign: {
          select: {
            id: true,
            name: true,
            gameSystem: true,
          },
        },
      },
    });

    // Broadcast roster.updated WebSocket event
    try {
      broadcastToCampaign(campaignId, 'roster.updated', {
        action: 'character.assigned',
        characterId: id,
        userId,
        campaignId,
      });
    } catch (error) {
      logger.error('Failed to broadcast roster update', { err: error });
      // Don't fail the request if broadcast fails
    }

    return res.status(200).json({
      message: 'Character assigned to campaign successfully',
      character: updatedCharacter,
    });
  } catch (error) {
    logger.error('Error assigning character to campaign', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to assign character to campaign',
    });
  }
});

/**
 * POST /api/characters/:id/copy
 * Create a copy of an existing character
 * Requires: Authentication
 * Authorization: Character owner only
 */
router.post('/:id/copy', authenticated, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;

    // Fetch the original character
    const originalCharacter = await prisma.character.findUnique({
      where: { id },
    });

    if (!originalCharacter) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Character not found',
      });
    }

    // Check ownership
    if (originalCharacter.userId !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to copy this character',
      });
    }

    // Create a copy with modified name
    const copiedCharacter = await prisma.character.create({
      data: {
        userId,
        name: `${originalCharacter.name} (Copy)`,
        data: toJson(originalCharacter.data),
        tokenImageUrl: originalCharacter.tokenImageUrl,
        gameSystem: originalCharacter.gameSystem,
        campaignId: null, // Copies are unassigned by default
      },
    });

    return res.status(201).json({
      message: 'Character copied successfully',
      character: copiedCharacter,
    });
  } catch (error) {
    logger.error('Error copying character', { err: error });
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to copy character',
    });
  }
});

export default router;
