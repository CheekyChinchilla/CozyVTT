# Game content notices

The game rules CozyVTT uses, the licences they are under, and the credits those licences ask for. The app shows the same credits in **About CozyVTT**, which opens from the dashboard, the profile page, the sign-in page and a campaign's **Campaign Info** panel (see [Credits](docs/USER_GUIDE.md#credits)).

## What game content CozyVTT contains

- **Sheet layouts and arithmetic for three game systems:** 5E (SRD 5.1), Fantasy d20 (ORC) and Horror d100. What each one takes from its open rules is set out under its name below.
- **Example characters** for each system: the ready-made characters the app offers and the files in `Examples/`. Their rules names come from the open rules, and their descriptions are in CozyVTT's own words.
- **Creatures an administrator imports** into the Creature Library. The server fetches them from the [Open5e API](https://open5e.com), asking for the SRD 5.1 only, and stores them in that instance's own database. CozyVTT's code holds none of them.

Everything else in CozyVTT is the project's own work. Third-party software and fonts are credited in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

## 5E (SRD 5.1)

This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.

CozyVTT has reformatted this material and, in places, reworded it.

CozyVTT's 5E sheet is compatible with fifth edition.

The creatures an administrator imports reach CozyVTT through Open5e (https://open5e.com), a community project that serves the SRD 5.1 in a structured form. Our thanks to the people who maintain it.

## Fantasy d20 (ORC)

**ORC Notice**

This product is licensed under the ORC License located at the Library of Congress at TX 9-307-067 and available online at various locations including https://paizo.com/orclicense, https://azoralaw.com/orclicense and others. All warranties are disclaimed as set forth therein.

**Attribution**

This product is based on the following Licensed Material:

Pathfinder Player Core © 2023 Paizo Inc., Designed by Logan Bonner, Jason Bulmahn, Stephen Radney-MacFarland, and Mark Seifter. Authors: Alexander Augunas, Kate Baker, Logan Bonner, Jason Bulmahn, Carlos Cabrera, Calder CaDavid, James Case, Eleanor Ferron, Steven Hammond, Joan Hong, Vanessa Hoskins, James Jacobs, Jenny Jarzabski, Erik Keith, Dustin Knight, Lyz Liddell, Luis Loza, Patchen Mortimer, Dennis Muldoon, Stephen Radney-MacFarland, Mikhail Rekun, David N. Ross, Michael Sayre, Mark Seifter, Kendra Leigh Speedling, Mark Thompson, Clark Valentine, Andrew White, Landon Winkler, and Linda Zayas-Palmer

Pathfinder GM Core © 2023 Paizo Inc., Designed by Logan Bonner and Mark Seifter. Authors: Amirali Attar Olyaee, Logan Bonner, Creighton Broadhurst, Jason Bulmahn, James Case, Jesse Decker, Eleanor Ferron, Fabby Garza Marroquín, Jaym Gates, Matthew Goetz, James Jacobs, Brian R. James, Jenny Jarzabski, Dustin Knight, Jason LeMaitre, Lyz Liddell, Luis Loza, Ron Lundeen, Stephen Radney-MacFarland, David N. Ross, Michael Sayre, Mark Seifter, Owen K.C. Stephens, Amber Stewart, Clark Valentine, Landon Winkler, and Linda Zayas-Palmer

These two lines are the credits the publisher gives for these books, copied on 2026-11-11 as reproduced on the publisher's licensed rules reference. CozyVTT's Fantasy d20 sheet records the character the first book's rules build, and its creature stat blocks follow the second book's guidance for building creatures. The sheet also keeps an ability score for each attribute and an alignment field, which those rules do not use.

## Horror d100

**ORC Notice**

This product is licensed under the ORC License held in the Library of Congress at TX 9-307-067 and available online at various locations including www.chaosium.com/orclicense, www.azoralaw.com/orclicense, www.gencon.com/orclicense and others. All warranties are disclaimed as set forth therein.

**Attribution**

This product is based on the following Licensed Material:

"Basic Roleplaying: Universal Game Engine," copyright © 2024 Chaosium Inc., by Jason Durall and Steve Perrin.

Copied on 2026-11-11 from the publisher's ORC page, the first address in the notice above. The publisher also offers a logo for this credit; CozyVTT gives the credit as text.

CozyVTT's Horror d100 sheet follows this document's rules for a character, in CozyVTT's own words.

The sheet takes from that document:

- its characteristics and the rolls they give;
- its derived attributes: hit points, the major wound level, power points, the damage modifier, the experience bonus, MOV, and Sanity with its maximum;
- its skills with their categories, specialties and base chances, among them the weapon classes it offers as Melee Weapon and Firearm specialties, and its experience checks;
- the columns of its weapons table, the way a weapon's damage writes the damage modifier (`+dm` and `+½dm`), the fist a new weapon starts as, and armor values;
- distinctive features, and the wealth levels its wealth box suggests;
- three of the four conditions a character can be under: Major Wound, Unconscious and Temporary Insanity. The fourth, Dying, is CozyVTT's name for the state the document describes for a character at 0 hit points;
- at the table, acting in DEX order.

Its example characters also take the document's professions, wealth levels, two weapons with their numbers (the medium revolver and the fist) and the names of the equipment they carry.

The arrangement of the sheet, its titled story notes, its era, residence and birthplace fields, the boxes that hold possessions, contacts and wealth (the names the examples put in them are the document's), and the Original values it keeps for a character made before version 1.7.0 are not taken from that document, and the ORC License does not cover them. The code that holds them is CozyVTT's, under the AGPL-3.0.

## CozyVTT's own material

These statements complete the two ORC notices above, as the ORC License asks.

**Reserved Material**

Reserved Material elements in this product include, but may not be limited to: CozyVTT's name, logo, mascot, artwork and visual themes, and all elements designated as Reserved Material under the ORC License.

**Expressly Designated Licensed Material**

This product contains no Expressly Designated Licensed Material.

**Adapted Licensed Material**

CozyVTT's code is under the AGPL-3.0. The rules it expresses in the files listed in docs/GAME_SYSTEMS.md are Adapted Licensed Material, which CozyVTT offers under the ORC License.

**Crediting CozyVTT**

If you use our Licensed Material in your own published works, please credit us as follows: CozyVTT, © 2026 CozyVTT Development Team, https://github.com/CheekyChinchilla/CozyVTT.

## Scope

The game content named here is not offered under the AGPL-3.0: SRD material stays under CC-BY-4.0, and ORC Licensed Material under the ORC License. CozyVTT's own code is under the AGPL-3.0. The files that hold material under the ORC License are listed in [Files that hold ORC material](docs/GAME_SYSTEMS.md#files-that-hold-orc-material), and each that can hold a comment says so at its top.

## No affiliation

CozyVTT is an independent product. It is not affiliated with, endorsed, sponsored or approved by any game publisher.
