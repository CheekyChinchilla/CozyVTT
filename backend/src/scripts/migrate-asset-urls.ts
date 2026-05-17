/**
 * Migration Script: Normalize Asset URLs
 *
 * This script updates all asset URL fields in the database to use the full path format:
 * - Maps: imageUrl, baseLayerUrl, spiritLayerUrl
 * - Tokens: imageUrl (in map.tokens JSON array)
 * - Characters: tokenImageUrl
 *
 * UUIDs will be converted to: /api/assets/{type}/{uuid}
 * Full paths will be left unchanged.
 *
 * Run with: npx ts-node src/scripts/migrate-asset-urls.ts
 */

import { PrismaClient } from '@prisma/client';
import { normalizeAssetUrl } from '../utils/asset-urls';

const prisma = new PrismaClient();

async function migrateAssetUrls() {
  console.log('🔄 Starting asset URL migration...\n');

  try {
    // ============================================
    // 1. Migrate Maps
    // ============================================
    console.log('📍 Migrating map asset URLs...');
    const maps = await prisma.map.findMany();

    let mapsUpdated = 0;
    for (const map of maps) {
      const needsUpdate =
        (map.imageUrl && !map.imageUrl.startsWith('/api/')) ||
        (map.baseLayerUrl && !map.baseLayerUrl.startsWith('/api/')) ||
        (map.spiritLayerUrl && !map.spiritLayerUrl.startsWith('/api/'));

      if (needsUpdate) {
        const normalizedImageUrl = normalizeAssetUrl(map.imageUrl, 'maps') || undefined;
        const normalizedBaseLayerUrl = normalizeAssetUrl(map.baseLayerUrl, 'maps') || undefined;
        const normalizedSpiritLayerUrl = map.spiritLayerUrl
          ? normalizeAssetUrl(map.spiritLayerUrl, 'maps') || undefined
          : undefined;

        await prisma.map.update({
          where: { id: map.id },
          data: {
            ...(normalizedImageUrl && { imageUrl: normalizedImageUrl }),
            ...(normalizedBaseLayerUrl && { baseLayerUrl: normalizedBaseLayerUrl }),
            ...(normalizedSpiritLayerUrl && { spiritLayerUrl: normalizedSpiritLayerUrl }),
          },
        });

        console.log(`  ✅ Updated map "${map.name}" (${map.id})`);
        console.log(`     imageUrl: ${map.imageUrl} → ${normalizedImageUrl}`);
        mapsUpdated++;
      }
    }
    console.log(`✅ Maps migrated: ${mapsUpdated}/${maps.length}\n`);

    // ============================================
    // 2. Migrate Tokens (in map.tokens JSON array)
    // ============================================
    console.log('🎭 Migrating token asset URLs...');
    const mapsWithTokens = await prisma.map.findMany({
      where: {
        tokens: {
          not: []
        }
      }
    });

    let tokensUpdated = 0;
    for (const map of mapsWithTokens) {
      const tokens = (Array.isArray(map.tokens) ? map.tokens : []) as any[];
      let mapHasUpdates = false;

      const updatedTokens = tokens.map((token: any) => {
        if (token.imageUrl && !token.imageUrl.startsWith('/api/')) {
          const normalizedUrl = normalizeAssetUrl(token.imageUrl, 'tokens');
          console.log(`  ✅ Updated token "${token.name}" on map "${map.name}"`);
          console.log(`     imageUrl: ${token.imageUrl} → ${normalizedUrl}`);
          tokensUpdated++;
          mapHasUpdates = true;
          return { ...token, imageUrl: normalizedUrl };
        }
        return token;
      });

      if (mapHasUpdates) {
        await prisma.map.update({
          where: { id: map.id },
          data: { tokens: updatedTokens as any },
        });
      }
    }
    console.log(`✅ Tokens migrated: ${tokensUpdated}\n`);

    // ============================================
    // 3. Migrate Characters
    // ============================================
    console.log('🧙 Migrating character asset URLs...');
    const characters = await prisma.character.findMany({
      where: {
        tokenImageUrl: {
          not: null
        }
      }
    });

    let charactersUpdated = 0;
    for (const character of characters) {
      if (character.tokenImageUrl && !character.tokenImageUrl.startsWith('/api/')) {
        const normalizedUrl = normalizeAssetUrl(character.tokenImageUrl, 'tokens');

        await prisma.character.update({
          where: { id: character.id },
          data: { tokenImageUrl: normalizedUrl },
        });

        console.log(`  ✅ Updated character "${character.name}" (${character.id})`);
        console.log(`     tokenImageUrl: ${character.tokenImageUrl} → ${normalizedUrl}`);
        charactersUpdated++;
      }
    }
    console.log(`✅ Characters migrated: ${charactersUpdated}/${characters.length}\n`);

    // ============================================
    // Summary
    // ============================================
    console.log('📊 Migration Summary:');
    console.log(`   Maps updated: ${mapsUpdated}`);
    console.log(`   Tokens updated: ${tokensUpdated}`);
    console.log(`   Characters updated: ${charactersUpdated}`);
    console.log('\n✅ Asset URL migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateAssetUrls()
  .then(() => {
    console.log('\n👍 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
