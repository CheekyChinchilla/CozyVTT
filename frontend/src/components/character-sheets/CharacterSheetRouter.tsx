/**
 * Character Sheet Router
 * Routes to appropriate character sheet component based on game system
 * Uses lazy loading for code splitting and performance
 */

import React, { Suspense, lazy } from 'react';
import { GameSystem } from '../../types';
import { CharacterSheetProps } from './types';
import { FlexibleCharacterSheet } from './FlexibleCharacterSheet';
import { CharacterSheetLoadingSpinner } from './LoadingSpinner';
import { CharacterSheetErrorBoundary } from './ErrorBoundary';

// Lazy-loaded game system character sheets
const DnD5eSheet = lazy(() => import('./dnd5e/DnD5eCharacterSheet'));
const Pathfinder2eSheet = lazy(() => import('./pathfinder2e/Pathfinder2eCharacterSheet'));
const Shadowrun6eSheet = lazy(() => import('./shadowrun6e/Shadowrun6eCharacterSheet'));
const CallOfCthulhu7eSheet = lazy(() => import('./call-of-cthulhu-7e/CallOfCthulhu7eCharacterSheet'));

export interface CharacterSheetRouterProps extends CharacterSheetProps {}

/**
 * CharacterSheetRouter Component
 *
 * Routes to the appropriate character sheet based on character.gameSystem.
 * - D&D 5e → DnD5eCharacterSheet
 * - Pathfinder 2e → Pathfinder2eCharacterSheet
 * - Shadowrun 6e → Shadowrun6eCharacterSheet
 * - Call of Cthulhu 7e → CallOfCthulhu7eCharacterSheet
 * - null/undefined → FlexibleCharacterSheet (system-agnostic JSON editor)
 *
 * Uses React.lazy() for code splitting - each game system's sheet is loaded
 * only when needed, reducing initial bundle size.
 */
export const CharacterSheetRouter: React.FC<CharacterSheetRouterProps> = (
  props
) => {
  const { character } = props;

  // Render appropriate sheet based on game system
  const renderSheet = () => {
    switch (character.gameSystem) {
      case GameSystem.DND_5E:
        return <DnD5eSheet {...props} />;

      case GameSystem.PATHFINDER_2E:
        return <Pathfinder2eSheet {...props} />;

      case GameSystem.SHADOWRUN_6E:
        return <Shadowrun6eSheet {...props} />;

      case GameSystem.CALL_OF_CTHULHU_7E:
        return <CallOfCthulhu7eSheet {...props} />;

      case null:
      case undefined:
        // No game system - use flexible JSON-based sheet
        return <FlexibleCharacterSheet {...props} />;

      default:
        // Unknown game system - fall back to flexible sheet
        console.warn(
          `Unknown game system: ${character.gameSystem}. Falling back to FlexibleCharacterSheet.`
        );
        return <FlexibleCharacterSheet {...props} />;
    }
  };

  return (
    <CharacterSheetErrorBoundary>
      <Suspense fallback={<CharacterSheetLoadingSpinner />}>
        {renderSheet()}
      </Suspense>
    </CharacterSheetErrorBoundary>
  );
};
