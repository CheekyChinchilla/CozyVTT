/**
 * The credits for the game rules CozyVTT uses, as About CozyVTT and the
 * Creature Library show them. GAME_CONTENT_NOTICES.md has the full notices;
 * every line here is a line of it, and of Section 2 of
 * THIRD_PARTY_NOTICES.txt, word for word. The backend's documentedFacts test
 * holds the three together and reads this file as text, so each line is a
 * template literal on a line of its own.
 *
 * A line that names a licensor is the credit its licence asks for, kept
 * exactly as the licensor gives it.
 */

import { GameSystem } from '@/types/gameSystem';
import { GAME_SYSTEM_LABELS } from './game-systems';

/** The sentence the SRD 5.1 asks every work that uses it to carry, as the SRD writes it. */
export const SRD_ATTRIBUTION =
  `This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.`;

/**
 * Said beside the SRD 5.1's sentence, apart from it: CC BY 4.0 asks a work to
 * say whether it changed the material, and the SRD asks that its sentence be
 * given as it writes it.
 */
export const SRD_MODIFIED =
  `CozyVTT has reformatted this material and, in places, reworded it.`;

/** The ORC licence's own lead-in to the material a product is based on. */
const BASED_ON =
  `This product is based on the following Licensed Material:`;

/** Each game system's credits, in the order the systems are offered. */
export const GAME_CONTENT_NOTICES: readonly { system: string; lines: readonly string[] }[] = [
  {
    system: GAME_SYSTEM_LABELS[GameSystem.FIFTH_EDITION],
    lines: [
      SRD_ATTRIBUTION,
      SRD_MODIFIED,
      `The creatures an administrator imports reach CozyVTT through Open5e (https://open5e.com), a community project that serves the SRD 5.1 in a structured form. Our thanks to the people who maintain it.`,
    ],
  },
  {
    system: GAME_SYSTEM_LABELS[GameSystem.FANTASY_D20],
    lines: [
      `This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including https://paizo.com/orclicense, https://azoralaw.com/orclicense and others. All warranties are disclaimed as set forth therein.`,
      BASED_ON,
      `Pathfinder Player Core © 2023 Paizo Inc., Designed by Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter. Authors: Alexander Augunas, Kate Baker, Logan Bonner, Jason Bulmahn, Carlos Cabrera, Calder CaDavid, James Case, Eleanor Ferron, Steven Hammond, Joan Hong, Vanessa Hoskins, James Jacobs, Jenny Jarzabski, Erik Keith, Dustin Knight, Lyz Liddell, Luis Loza, Patchen Mortimer, Dennis Muldoon, Stephen Radney-MacFarland, Mikhail Rekun, David N. Ross, Michael Sayre, Mark Seifter, Kendra Leigh Speedling, Mark Thompson, Clark Valentine, Andrew White, Landon Winkler, and Linda Zayas-Palmer`,
      `Pathfinder GM Core © 2023 Paizo Inc., Designed by Logan Bonner and Mark Seifter. Authors: Amirali Attar Olyaee, Logan Bonner, Creighton Broadhurst, Jason Bulmahn, James Case, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Jaym Gates, Matthew Goetz, James Jacobs, Brian R. James, Jenny Jarzabski, Dustin Knight, Jason LeMaitre, Lyz Liddell, Luis Loza, Ron Lundeen, Stephen Radney-MacFarland, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Amber Stewart, Clark Valentine, Landon Winkler, and Linda Zayas-Palmer`,
    ],
  },
  {
    system: GAME_SYSTEM_LABELS[GameSystem.HORROR_D100],
    lines: [
      `This product is licensed under the ORC License held in the Library of Congress at TX 9-307-067 and available online at various locations including www.chaosium.com/orclicense, www.azoralaw.com/orclicense, www.gencon.com/orclicense and others. All warranties are disclaimed as set forth therein.`,
      BASED_ON,
      `"Basic Roleplaying: Universal Game Engine," copyright © 2024 Chaosium Inc., by Jason Durall and Steve Perrin.`,
      `CozyVTT's Horror d100 sheet follows this document's rules for a character, in CozyVTT's own words.`,
    ],
  },
];

/** What the ORC licence asks CozyVTT to say of its own material, beside the two ORC notices. */
export const COZYVTT_ORC_STATEMENTS: readonly string[] = [
  `Reserved Material elements in this product include, but may not be limited to: CozyVTT's name, logo, mascot, artwork and visual themes, and all elements designated as Reserved Material under the ORC License.`,
  `This product contains no Expressly Designated Licensed Material.`,
  `CozyVTT's code is under the AGPL-3.0. The rules it expresses in the files listed in docs/GAME_SYSTEMS.md are Adapted Licensed Material, which CozyVTT offers under the ORC License.`,
  `If you use our Licensed Material in your own published works, please credit us as follows: CozyVTT, © 2026 CozyVTT Development Team, https://github.com/CheekyChinchilla/CozyVTT.`,
];

/** Said once, above the credits. */
export const INDEPENDENT_PRODUCT =
  `CozyVTT is an independent product. It is not affiliated with, endorsed, sponsored or approved by any game publisher.`;
