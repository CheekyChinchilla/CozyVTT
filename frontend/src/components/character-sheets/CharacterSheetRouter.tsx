/**
 * Character Sheet Router
 * Routes to appropriate character sheet component based on game system
 * Uses lazy loading for code splitting and performance
 */

import React, { Suspense, lazy } from 'react';
import { GameSystem } from '../../types';
import { CharacterSheetProps } from './types';
import { FlexibleCharacterSheet } from './FlexibleCharacterSheet';
import { UnsupportedSystemSheet } from './UnsupportedSystemSheet';
import { CharacterSheetLoadingSpinner } from './LoadingSpinner';
import { CharacterSheetErrorBoundary } from './ErrorBoundary';

// Lazy-loaded game system character sheets
const FifthEditionSheet = lazy(() => import('./fifth-edition/FifthEditionCharacterSheet'));
const FantasyD20Sheet = lazy(() => import('./fantasy-d20/FantasyD20CharacterSheet'));
const HorrorD100Sheet = lazy(() => import('./horror-d100/HorrorD100CharacterSheet'));

export interface CharacterSheetRouterProps extends CharacterSheetProps {
  /**
   * Whether the sheet is a template's. Only the sheet of a system this build
   * does not know reads it, to name a template in its line.
   */
  isTemplate?: boolean;
}

/**
 * CharacterSheetRouter Component
 *
 * Routes to the appropriate character sheet based on character.gameSystem.
 * - 5E → FifthEditionCharacterSheet
 * - Fantasy d20 → FantasyD20CharacterSheet
 * - Horror d100 → HorrorD100CharacterSheet
 * - null/undefined → FlexibleCharacterSheet (system-agnostic JSON editor)
 * - a code this build does not know → UnsupportedSystemSheet (read-only)
 *
 * Uses React.lazy() for code splitting - each game system's sheet is loaded
 * only when needed, reducing initial bundle size.
 */
export const CharacterSheetRouter: React.FC<CharacterSheetRouterProps> = ({
  isTemplate = false,
  ...props
}) => {
  const { character } = props;

  // Render appropriate sheet based on game system
  const renderSheet = () => {
    switch (character.gameSystem) {
      case GameSystem.FIFTH_EDITION:
        return <FifthEditionSheet {...props} />;

      case GameSystem.FANTASY_D20:
        return <FantasyD20Sheet {...props} />;

      case GameSystem.HORROR_D100:
        return <HorrorD100Sheet {...props} />;

      case null:
      case undefined:
        // No game system - use flexible JSON-based sheet
        return <FlexibleCharacterSheet {...props} />;

      default:
        // A system CozyVTT no longer supports: its data, read-only.
        return <UnsupportedSystemSheet character={character} isTemplate={isTemplate} />;
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
