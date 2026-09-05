# CozyVTT Dungeon Master Guide

So you're running the show. Welcome to the DM side of CozyVTT — where you get all the tools to build worlds, set the atmosphere, and guide your players through whatever story you have waiting for them.

This guide focuses on DM-specific features. For general platform features (character sheets, dice, chat, etc.), refer to the [User Guide](USER_GUIDE.md).

---

## Table of Contents

1. [Creating and Managing Campaigns](#creating-and-managing-campaigns)
2. [Preparing Your Maps](#preparing-your-maps)
3. [Setting Up Tokens](#setting-up-tokens)
4. [The Creature Library](#the-creature-library)
5. [Token Templates](#token-templates)
6. [Campaign Export & Import](#campaign-export--import)
7. [Managing Your Players](#managing-your-players)
8. [Running a Session](#running-a-session)
9. [Combat and Initiative](#combat-and-initiative)
10. [Fog of War](#fog-of-war)
11. [Walls & Dynamic Lighting](#walls--dynamic-lighting)
12. [The Spirit Layer](#the-spirit-layer)
13. [Atmosphere Controls](#atmosphere-controls)
14. [Session State and Continuity](#session-state-and-continuity)
15. [Tips and Best Practices](#tips-and-best-practices)

---

## Creating and Managing Campaigns

### Creating a Campaign

From the **Dashboard**, click **+ New Campaign**. Fill in:

- **Campaign Name** — The title your players will see
- **Description** — A brief blurb about the campaign (optional but recommended)
- **Game System** — The ruleset you're playing under

Click **Create Campaign** and you're taken directly to the campaign page.

*Screenshot pending — Campaign creation modal.*

### Campaign Settings

Once inside the campaign, click the **Settings** button (gear icon in the header) to open the Campaign Settings panel.

From here you can update:
- Campaign name and description
- Any campaign-level configuration options

*Screenshot pending — Campaign settings panel.*

### Inviting Players

To invite a player to your campaign:

1. Click **Invite Player** in the left sidebar, or open **Campaign Settings**
2. Pick them from the list — it shows everyone on your instance who isn't already a member or already invited. They must have an account first
3. Optionally tick **Also email them an invitation**
4. The player sees a **Pending Invitation** on their dashboard

*Screenshot pending — Invite player flow.*

**About that checkbox.** It's off by default, and the invitation reaches them either way — the dashboard is what they actually accept from. Tick it only when a nudge in their inbox is genuinely useful; if they're sitting across the table from you, it isn't. If your instance has no mail server set up the option is greyed out and says so, rather than pretending to send something.

The list deliberately shows display names and not email addresses, so running a campaign doesn't become a way to collect everyone's address.

When a player accepts, they'll choose which of their characters to bring. Once they've joined, their character appears in the **Campaign Roster** on the left sidebar.

> **Note:** If registration is closed on your instance, the platform administrator will need to create accounts for your players before you can invite them.

### The Campaign Roster

The left sidebar's **Campaign Roster** shows all players currently in your campaign along with their assigned characters. It is a quick reference during sessions for names, character names and party composition — and it is also how you get a player's character onto the map.

**Placing a character.** Drag any character from the roster onto the canvas, or right-click it and choose **Add to Map**, which drops it in the centre of the current map. Either works whether or not the character has a token picture: one without a picture is drawn as a coloured circle with its initial, the same as a creature with no art. The token is created as a **player** token, controlled by whoever owns the character, so they can move it themselves.

**Stacking tokens is a DM privilege.** Players are stopped from finishing a move on a square someone else is standing in — the rules say you cannot end your move in another creature's space, and the map now enforces it. You are exempt: place a rider on a mount, pile up a swarm or arrange scenery however you need to. A creature at zero hit points does not block anyone; it is drawn faded and can be stood on. And if you do stack a token on top of a player's, they can still click the square and get their own token back.

**Who's actually here.** A small dot on each person's icon shows whether they're connected right now — green for in session, grey for not. It updates as people arrive and leave, so you can tell at a glance whether the quiet player is thinking or has dropped off. Someone with the campaign open in two tabs stays green until they close the last one.

This replaced the "X has joined the campaign" messages that used to appear in chat. Those fired on every page load and every momentary disconnect, so a player with a patchy connection could bury the conversation without saying a word. If your campaign still has a backlog of them, the **eraser button** at the top of the chat panel clears them for everyone — it only removes those notices, and leaves the rest of the conversation alone. Nothing was deleted automatically when you upgraded.

---

## Preparing Your Maps

Good maps make great sessions. Here's how to get them into CozyVTT.

### Uploading Map Assets

Before you can use a map in your campaign, it needs to live in the **Asset Library**.

1. Navigate to the **Asset Library** (from the top nav or dashboard)
2. Click **Upload**
3. Choose your image file (JPEG, PNG, and WebP work great)
4. Set the type to **Map**
5. Set the scope to **Campaign** (to keep it associated with this campaign) or **Personal**
6. Give it a descriptive name — you'll thank yourself later when you have twenty maps
7. Add tags if you like (e.g., "dungeon", "outdoor", "tavern")
8. Click **Upload**

*GIF pending — Uploading a map to the asset library.*

### Adding Maps to Your Campaign

Once your map is in the asset library:

1. Inside your campaign, click the **Maps** button in the header
2. The Map Manager panel opens
3. Click **Add Map** and select your uploaded image
4. The map is now available to switch to at any time

*Screenshot pending — Map Manager panel with multiple maps.*

### Switching Maps

Click the **Maps** button and select the map you want to switch to. This immediately updates the view for all connected players — no need to coordinate.

*GIF pending — Switching maps, showing player view update.*

Plan your map order loosely in advance (forest → cave entrance → dungeon interior), but don't worry about locking anything in. You can switch maps freely during a session.

### Map Best Practices

- **Resolution matters** — Maps look best at 70–100 pixels per grid square. Going higher increases load time without visible benefit at normal zoom levels.
- **Label your maps** — Use descriptive names like "Session 3 - Goblin Cave" rather than "map_final_v3.png"
- **Prepare ahead** — Load all maps you might need before the session starts so there's no fumbling during play
- **Keep backups** — Export important maps so you can recover them if needed

---

## Setting Up Tokens

Tokens are the visual representations of everyone (and everything) on the map.

### Opening the Token Manager

Click **Tokens** in the campaign header to open the Token Manager.

*Screenshot pending — Token Manager panel.*

### Creating a Token

Click **+ New Token** and fill in:

- **Name** — Displayed on hover; use the character/NPC name
- **Image** — Choose a TOKEN-type asset from your library (or leave blank for a placeholder)
- **Type** — **PC** for player characters, **NPC** for monsters and allies, **Object** for environmental pieces
- **HP** — Starting hit points (can be updated during play)
- **Size** — How many grid squares the token covers (default: 1×1)

*Screenshot pending — Token creation form.*

### Token Roster

The **Token Roster** (visible only to you, in the left sidebar) lists all tokens on the current map. Click any token in the roster to quickly select and edit it.

### Placing Tokens on the Map

Tokens aren't automatically placed on the map. Where you drag them from depends on what they are:

- **Player characters** — from the **Campaign Roster**, or right-click a character there and choose **Add to Map**.
- **NPCs and monsters** — from the **Creature Library**, or the **Place on Map** button on a creature.
- **Anything you built yourself** — from the **Token Manager**.

*GIF pending — Dragging a token from the manager onto the map.*

### Token Display Modes

Tokens support three display modes that control how they appear on the map:

| Mode | Appearance | Best for |
|------|-----------|----------|
| **Pog** | Circular token with the image cropped to a circle | Classic tabletop token style |
| **Top-Down** | Image rendered from above, no border | Overhead dungeon art, top-down tokens |
| **Full-Art** | Full rectangular image shown at token size | Character portraits, scenic tokens |

Set the display mode when creating a token, or change it later from the Token Manager or Quick Editor.

**Colored-Letter Placeholders:** Tokens without an image show a colored circle with the first letter of the creature's name. Hostile tokens use red, friendly use green, and neutral use blue — making it easy to distinguish dispositions at a glance.

### Editing Tokens During Play

Click any token on the map to open the **Quick Editor**. From here you can:

- Update HP (current, max, and temporary)
- Rename the token
- View and edit the stat block (for NPC tokens with creature template data)
- **Change the token image** — click the token avatar in the Quick Editor header to open the image picker
- **Save the image back to the creature template** — so future placements of that creature reuse the same image
- Apply or remove conditions. All fifteen D&D 5e conditions are offered here, the same set the character sheet uses. Each one shows as a small amber badge above the token — a two-letter code, so **PA**ralyzed, **PO**isoned, **PE**trified and **PR**one stay distinguishable at a glance. Past four, the rest collapse into a grey **+N** badge so the row never grows wider than the token. Anyone can hover a token to read its conditions in full, players included — they can't act around a condition they can't identify

*Screenshot pending — NPC quick editor popup with image picker.*

#### Changing a Token's Image

1. Click the token on the map to open the Quick Editor
2. Click the token avatar (top-left of the editor) — a hover overlay with an image icon appears
3. The **Image Picker** opens, showing every token image you have access to — platform-wide assets, your own uploads, and assets from campaigns you're a member of
4. Select an image, or click **Upload New** to upload a fresh asset
5. Click **None** to remove the image and revert to a colored-letter placeholder

The map updates immediately for everyone at the table — no one needs to refresh. This changes only that one token; to change the image every future placement uses, edit the creature template instead (see [Creature Token Images](#creature-token-images)).

#### Saving an Image to a Creature Template

After setting a token's image, you can save it back to the creature template so every future placement of that creature uses the same image:

1. In the Quick Editor, find the **"Save image to creature template"** section
2. Click **Save to Template**

**SRD creatures are read-only.** If the token is based on an SRD creature (imported from Open5e), CozyVTT will automatically create a custom duplicate of that creature for your campaign:

- You'll be prompted to **name the duplicate** (e.g., "Ancient Red Dragon (Fire Variant)")
- If a duplicate of that SRD creature already exists in your campaign, a warning appears asking if you want to create another
- The new custom creature gets the image, and the token is relinked to it
- Future placements from the Creature Library use the custom version with the image

### Rolling for NPC Tokens

Right-click an NPC token on the map (DM only) and choose **Roll...** to open the NPC roll picker. It surfaces every rollable option from the token's stat block:

- **Ability checks** — STR, DEX, CON, INT, WIS, CHA (1d20 + ability modifier)
- **Saving throws** — all six saves. A proficient save is marked ●, an expert one ◆
- **Skills** — the skills the stat block records a bonus for, each labelled with the ability it uses. Anything else is covered by the ability checks above
- **Combat** — attack rolls (`+N to hit` parsed from action descriptions) and damage rolls (every `XdY+Z` expression extracted from each action)

For d20 systems (D&D 5e, PF2e) the picker also has an **Advantage / Disadvantage** selector that rewrites the dice expression before rolling (`2d20kh1` / `2d20kl1`). Pathfinder 2e shows the same selector labeled **Fortune / Misfortune**.

> **Tokens linked to a player's character** are the exception. They roll from the character sheet rather than from a stat block, so their menu offers the sheet's own **Roll...** and a **View Character Sheet** entry instead of the NPC picker. Both used to be listed at once, which put two identical-looking **Roll...** entries on the same menu.

**What each system offers.** The rolls on the menu depend on your campaign's game system, because not every system has something meaningful to compute from a stat block:

| System | Stat-block rolls |
|---|---|
| D&D 5e | Full — abilities, saves, skills and combat, with bonuses derived from ability scores and Challenge Rating |
| Pathfinder 2e | Full — using the modifiers printed on the stat block, with Fortitude/Reflex/Will saves |
| Call of Cthulhu 7e | Custom Roll only — a percentile system has no d20 rolls to offer |
| Shadowrun 6e | Custom Roll only — a dice-pool system has no d20 rolls to offer |

If a token doesn't have a stat block, or you're running one of the systems above that offers none, there's a **Custom Roll** input at the bottom of the picker — type any valid dice expression (e.g. `3d8+2`) and optional label, then roll. The result is broadcast to chat with the token name as context (e.g. *"Goblin: Scimitar Damage = 5"*).

*Screenshot pending — NPC roll picker with stat-block-derived options.*

### Roll History

The **Dice** tab keeps the rolls made in your campaign, newest first, with arrows to step back through them. It's stored on the server, so it survives a refresh, a navigation away and back, and a dropped connection — yours and your players'. Come back the next evening and last session's rolls are still there.

**What each person sees.** Players see the open rolls plus their own secret ones. You see everything, including your players' secret rolls, marked as such — the same oversight you have live. That filtering happens on the server, so a player reloading the page never picks up a roll they weren't meant to see.

**Personal notes are the exception.** The **Notes** tab gives every member their own Markdown notes for the campaign, and those you cannot see — not through the interface, and not by any request the app will answer. It is the one place a player has that you have no window into, deliberately: unlike a secret roll, nothing about a player's private planning needs settling by you. You get the same tab for your own notes, equally private from them.

Your players are told this plainly now. The secret-roll checkbox used to read "only you can see", which was not true and set an expectation you could not keep; it reads "hidden from other players" instead, and the confirmation says your DM can still see it. Nobody is going to be surprised later that you were watching.

**Clearing it.** Only you can, using the trash icon on the Dice panel. It empties the panel for everyone and stays empty when they reload. The rolls aren't destroyed — they're hidden from the panel from that point on, so a dispute about what someone rolled an hour ago is still settleable from the database. Ending a session does *not* clear history; if you want a clean slate, clear it yourself.

> **One exception.** While a session is **paused**, players' rolls are worked out in their own browser and never sent to the server — that's deliberate, so a paused table can still fiddle with dice without it counting. Those rolls aren't in the history and won't survive a refresh.

### Managing Token Visibility

Some tokens shouldn't be visible to players until the right moment. The **Spirit Layer Visibility** setting on a token controls whether it appears in the spirit layer view (see [The Spirit Layer](#the-spirit-layer)).

For standard visibility (show/hide from players entirely), token placement itself is the control — unplaced tokens are invisible to players.

---

## The Creature Library

The Creature Library is your DM-side catalog of creature templates — stat blocks, images, and metadata ready to drag onto the map as NPC tokens.

### Opening the Creature Library

Click the **Creatures** button in the campaign header to open the Creature Library panel. The library shows all available creature templates: both **SRD creatures** (imported from Open5e) and **custom creatures** you've created for this campaign.

### SRD Creature Seeding

The first time you open the Creature Library in a new campaign, it may be empty. Click **Import D&D 5e SRD** to fetch the full D&D 5e SRD bestiary from Open5e. This is a one-time operation that populates the library with hundreds of ready-to-use creatures.

- The button names the system it imports because it always seeds **D&D 5e** content, whatever system your campaign uses. It stays available in any campaign — a D&D stat block is a reasonable starting point for homebrew — but you'll be importing D&D monsters
- Seeding takes a few seconds — a progress indicator shows while it runs
- SRD creatures are **global** (shared across all campaigns on the instance) and **read-only**
- You can duplicate any SRD creature to create an editable custom version
- Running it again is safe: existing creatures are not duplicated. If your library was seeded before CozyVTT 1.1.1, re-running it fills in each SRD creature's hit points; custom creatures are never modified

### Browsing and Searching

The library supports:

- **Search** — Type in the search bar to filter by creature name
- **Source filter** — Filter by `srd` (imported) or `custom` (your creations)
- **Challenge Rating filter** — Narrow down by CR
- **Game system filter** — Defaults to your campaign's own system, so a Call of Cthulhu table isn't scrolling past 300 D&D monsters. Switch it to **All game systems** to browse everything — useful when you want to adapt a stat block from another system. Creatures saved without a system recorded always appear, whichever way this is set
- **Pagination** — Results load in pages; scroll down and click "Load More" to fetch additional creatures

> **Library looks empty in a non-D&D campaign?** Only D&D 5e ships SRD content, and the library defaults to your campaign's system. The empty state offers a one-click switch to **All game systems**.

### Favorites

Star your most-used creatures for quick access. Click the **star icon** next to any creature in the library to favorite it. Favorites are stored **per-campaign, per-user** — your favorites in one campaign don't affect another.

Favorites appear in a collapsible **"Favorites"** section at the top of the Creature Library panel, above the main creature list. Expand it to see all your starred creatures with one click.

> **Note:** Favorites are per campaign — starring a creature in Campaign A does not star it in Campaign B.

### Placing Creatures on the Map

Click any creature in the library to expand its details, then click **Place on Map** (or drag it onto the canvas). A new NPC token is created with:

- The creature's name
- Its stat block (viewable and editable in the Quick Editor)
- Its hit points, taken from the stat block's **HP Max** (creatures with no HP recorded start at 10 — adjust in the Quick Editor)
- Its image (if one has been associated)
- Default disposition from the template (hostile, friendly, or neutral)
- Display mode from the template (pog, top-down, or full-art)

### Creating Custom Creatures

Click **+ New Creature** at the top of the Creature Library to create a custom creature template. Fill in:

- **Name** — Required
- **Stat Block** — The creature's combat stats (AC, speed, ability scores, attacks, etc.)
- **HP Max** — Hit points given to tokens placed from this creature
- **Challenge Rating** — Chosen from a list. Used for filtering, and in D&D 5e it also sets the creature's proficiency bonus — see [Saving Throws and Skills](#saving-throws-and-skills) below
- **Saving Throws & Skills** — Tick which ones the creature is proficient or expert in; the bonuses are worked out for you
- **Creature Type** — Optional (e.g., beast, undead, fiend)
- **Token Image** — Optional. Click **Browse Assets** to pick from token images already in your asset library, or **Upload New** to add one. See [Creature Token Images](#creature-token-images) below
- **Size** — Grid size (default 1×1)
- **Disposition** — Hostile, friendly, or neutral
- **Display Mode** — Pog, top-down, or full-art

Custom creatures are scoped to your campaign and fully editable.

### Saving Throws and Skills

Rather than typing a number for each save and skill, you tick what the creature is
good at and CozyVTT works out the bonus. This applies everywhere a stat block is
edited: the Creature Library, the Token Template editor, and the Quick Editor on a
token already on the map.

**In D&D 5e**, each row has two checkboxes:

- **P (Proficient)** — adds the creature's proficiency bonus
- **E (Expertise)** — doubles it. Available only once Proficient is ticked

The bonus shown beside each row is the total that gets rolled, and it is the
ability modifier plus whatever proficiency you've ticked. A commoner with Wisdom
14 who is proficient in Perception shows **+4** — +2 from Wisdom, +2 from
proficiency. Make her an expert and it becomes +6.

**Where the proficiency bonus comes from.** It's derived from Challenge Rating,
on exactly the same scale a player character's comes from level — a CR 7 monster
gets the same +3 a 7th-level character does. It's shown at the top of the section
with its source ("From CR 1/4"), and changing the CR or an ability score updates
every derived bonus immediately.

| Challenge Rating | Proficiency Bonus |
|---|---|
| 0 – 4 (including 1/8, 1/4, 1/2) | +2 |
| 5 – 8 | +3 |
| 9 – 12 | +4 |
| 13 – 16 | +5 |
| 17 – 20 | +6 |
| 21 – 24 | +7 |
| 25 – 28 | +8 |
| 29 – 30 | +9 |

**Overriding a value.** Homebrew doesn't always follow the table, and a few
published creatures don't either. Click the **pencil** on any row to type a value
directly; the **↺** button puts it back to the derived one. If an override is far
outside what the creature's abilities and CR could support, it's marked with a
warning triangle — the value is still saved, it's just flagged so a typo doesn't
pass unnoticed. You can also override the proficiency bonus itself.

**Existing creatures keep their numbers.** SRD creatures and anything you made
earlier are read, not rewritten. CozyVTT works backwards from the printed bonus to
show the right checkboxes — an SRD Goblin opens already showing Stealth as
expertise, still at its printed +6. Where a printed value doesn't fit the rules
(the Night Hag is one), it's kept exactly as published and shown as an override.

**In Pathfinder 2e** this section looks different, because PF2e works
differently: creature stat blocks print final modifiers rather than deriving them
from proficiency ranks. You'll see **Fortitude, Reflex and Will** instead of six
ability saves, a **Level** instead of a Challenge Rating, and you enter each
modifier directly. CozyVTT warns if a number looks far off for the creature's
level, but never changes it.

### Editing Custom Creatures

Click the **pencil icon** next to any custom creature in the library to open it for editing. You can update any field — name, stat block, saving throws and skills, image, disposition, display mode, and all advanced stats (traits, actions, legendary actions, etc.).

SRD creatures cannot be edited directly. Duplicate them first, then edit the copy.

### Creature Token Images

The **Token Image** field in the creature editor gives you two ways to set a picture:

- **Browse Assets** — opens a grid of the token images already available to you. Use the search box to filter by name, then click one to select it. Click it again to deselect.
- **Upload New** — adds a new image. The upload dialog opens pre-set to a **token** asset scoped to **this campaign**, which is what you usually want: everyone in the campaign can then use it, and it appears in Browse Assets from then on. You can change the type or scope in the dialog if you need to.

The grid only ever shows images you have access to: platform-wide assets, your own personal uploads, and assets belonging to campaigns you're a member of. Uploads are validated by their actual file contents rather than their file extension, so renaming a document to `.png` won't get it through.

*Screenshot pending — Creature editor with the token image picker expanded.*

Whatever you choose here becomes the default image for every token placed from that creature. To change the image on a single token that's already on the map without touching the template, use the Quick Editor instead — see [Changing a Token's Image](#changing-a-tokens-image).

### Duplicating SRD Creatures

To customize an SRD creature without modifying the original:

1. Click the creature in the library to expand it
2. Click **Duplicate**
3. A new custom copy is created with "(Custom)" appended to the name
4. Edit the duplicate freely — change stats, add an image, rename it

---

## Token Templates

Token templates let you save reusable token configurations — image, stats, HP, size, disposition, and more — so you can place them on any map without re-configuring each time.

### Opening the Token Template Library

Click the **Templates** button (Package icon) in the campaign header toolbar. The panel slides open from the right, similar to the Creature Library.

### Creating a Template

There are two ways to create a template:

1. **From the library** — Click **+ New Template** and fill in the form: name, image, type (NPC/player/object), disposition, display mode, size, HP, notes, and optional stat block.
2. **From the map** — Right-click any token on the map and select **Save as Template**. This captures the token's current image, type, disposition, display mode, size, HP, notes, and stat block.

### Placing Templates on a Map

Expand a template in the library and click **Place on Map** to create a new token from the template on the current map. The token inherits all of the template's properties.

### Editing and Deleting Templates

Click **Edit** on any template to modify its properties. Click **Delete** to remove it permanently.

For **NPC-type templates**, the edit form includes the full stat block editor — AC, ability scores, saves, skills, traits, actions, bonus actions, reactions, and legendary actions — so you can build a complete monster once and reuse it across maps and campaigns. Saves and skills work exactly as they do in the Creature Library: tick what the creature is proficient in and the bonus is derived from its ability scores and Challenge Rating (see [Saving Throws and Skills](#saving-throws-and-skills)). The right-click NPC roll picker (see [Rolling for NPC Tokens](#rolling-for-npc-tokens)) reads from the same stat block, so a template with a well-filled-in action list gets clickable attack and damage rolls automatically.

### Copying Templates to Another Campaign

If you DM multiple campaigns, you can copy a template from one campaign to another. Expand the template, then use the **Copy to Campaign** dropdown to select the target campaign. You must have the DM role in both campaigns.

---

## Campaign Export & Import

Export your campaign as a portable `.cozyvtt` archive and import it on another CozyVTT instance — or use it as a backup.

### Exporting a Campaign

1. Open the campaign and click **Settings** (gear icon)
2. In the **General** tab, scroll to the **Export Campaign** section
3. Optionally toggle **Include audio assets** (off by default to reduce file size)
4. Click **Export Campaign**
5. A `.cozyvtt` file downloads to your computer

**What's included:**
- All maps (images, grid settings, wall segments, fog, lighting)
- All tokens placed on maps
- Custom creatures and their stat blocks
- Token templates
- All associated asset files (map images, token images)
- Campaign settings (name, description, game system, vibe settings, spirit layer)

**What's NOT included:**
- Character sheets (player privacy)
- Chat history
- Session records
- SRD creatures (they're re-imported on the target instance)
- User accounts or membership data

### Importing a Campaign

1. From the **Dashboard**, click the **Import** button (next to Create Campaign)
2. Drop or browse for a `.cozyvtt` archive
3. Review the preview: map count, creature count, token templates, asset count, and total size
4. Optionally rename the campaign and toggle whether to import tokens
5. Click **Import Campaign**
6. Once complete, click **Open Campaign** to jump in

The imported campaign is created fresh with new IDs — it does not interfere with any existing campaigns. You become the DM automatically.

### Security Notes

Imported archives are validated at multiple levels:
- File paths are sanitized to prevent directory traversal
- Decompressed size is tracked to prevent zip bomb attacks
- Asset files are validated by magic bytes, not just extension
- All JSON data is validated against strict schemas with size limits
- New UUIDs are generated for all entities — nothing from the archive can reference existing data

---

## Managing Your Players

### Preparing Character Sheets Before Players Join

If your players are new to the system — or haven't accepted the invite yet — you can build sheets for them in advance and let them pick one up when they arrive.

Open **Character Templates** from the dashboard and click **New Template**, or build a character normally and use **Save as Template** in the editor. Either way the result is visible to everyone on your instance, and a player copies it with one click: they get a character of their own, fully theirs to edit, and your template is unchanged.

This is worth doing for a one-shot or a new group. Rather than talking four people through character creation at the table, publish four templates beforehand and let each player take one and rename it.

Templates are per game system, so a D&D 5e template is only useful to a D&D 5e character. See [Character Templates](USER_GUIDE.md#character-templates) in the user guide for the full details, including why a template's image has to be a global asset.

### Viewing the Roster

The Campaign Roster in the left sidebar gives you a real-time view of all players and their characters. During a session, you can see who's connected.

### Removing a Player

To remove a player from your campaign, open **Campaign Settings** and find the player in the roster. Use the remove option to kick them from the campaign.

### Character Assignment

Players assign their own characters to your campaign when they accept an invitation. If a player needs to swap characters (e.g., death, retirement, trying a new one), they can reassign from their Characters page, or you can coordinate with them.

---

## Running a Session

### Measuring and Area Templates

Two tools in the map toolbar help you work out what a spell or a move actually reaches. Both draw on your screen only — they aren't saved to the map, and nobody else sees what you're measuring.

**Your players have both tools too**, working the same way on their own screens, so a player can check their own spell's reach without asking you to measure it for them. The one difference is the ruler, below.

**Ruler** (the ruler icon) — click a start point, then move the cursor to measure the distance between two squares in feet, using the map's own scale and its diagonal rule. For a player there's nothing to click: their ruler always measures from their own token.

**AoE Shape** (the lightning icon) — overlays a spell area on the map. Pick **Circle**, **Cone**, **Line** or **Cube**, set the size in feet (or use a preset), and move the cursor to position it. Click the map to pin the shape in place; with a shape pinned, moving the cursor aims cone and line templates. Press **Esc** to drop the placement, and again to put the tool away.

**Aiming a cone or line.** Click the square the effect comes from — usually the caster's token — and that square becomes the pivot. Moving the cursor then swings the shape around it, and the point it starts from slides around that square's edge to follow: straight out the middle of an edge when you aim along a row or column, out the corner when you aim diagonally. It always leaves on the side you're aiming at, so the shape sweeps *around* the token rather than back through it. The pivot stays put however far you swing, so you can keep turning until you've found what the attack actually catches.

**Placing something away from the caster.** Some effects aren't measured from anyone — a wall of fire is a line you drop wherever you like within range. **Alt+click** places the shape freely: it ignores the grid and pins the origin exactly where you clicked, and the shape then turns about that point.

Otherwise templates snap to your map's grid, so a shape covers whole squares rather than straddling them:

- **Cube** — always axis-aligned, covering exactly the squares it should. A 10 ft cube on a 5 ft grid covers 2×2 squares; a 15 ft cube covers 3×3. It doesn't rotate, because a tilted square can't line up with a square grid
- **Line** — starts at the edge of the square you pinned and is centred across its width, so a 20 ft × 5 ft line laid along a row or column covers exactly 4×1 squares. Widths that come to an *even* number of squares (10 ft on a 5 ft grid) sit half a square into the rows either side, because the line is centred on the square you pinned rather than on the line between two squares — Alt+click if you need one placed exactly
- **Cone** — its point sits on the edge of the square you pinned, so the cone leaves that square evenly. The spreading edges are at an angle, so they'll still cut across squares — that's the shape, not a bug. Judge affected squares by how much of each is covered, as you would at the table
- **Circle** — centred on the square under the cursor

> Sizes use the map's **feet per square** setting (Map Settings), which defaults to 5 ft. If your templates look twice or half the size you expect, check that value first.

### Starting a Session

When your players are ready, click **Start Session** in the right sidebar's **Session** tab. This:

- Changes the campaign status to **Live** (green indicator in the header)
- Enables token movement for players
- Logs a system message in chat announcing the session has started

*GIF pending — Starting a session and seeing the status change.*

### Pausing a Session

Need a break? Click **Pause Session**. This:

- Changes the campaign status to **Paused** (amber indicator)
- Disables token movement for players
- A "Session Paused" overlay appears on the player's canvas

*Screenshot pending — Paused session indicator from player view.*

Click **Resume Session** when you're ready to continue.

### Ending a Session

Click **End Session** when the adventure is done for the night. CozyVTT will save the session state — token positions, chat history, initiative order — so everything is ready for next time.

The dialog also offers a **Session Notes** box. Whatever you write there is kept with that session and shown to **everyone in the campaign** under **Session → Past Sessions**, newest first, with the date and how long you played. It is the recap your players read before the next game, so write it for them rather than as a private reminder — there is nowhere here that hides notes from the table.

Leaving it blank is fine; the session still appears in the list, marked as having no notes.

*Screenshot pending — End session confirmation dialog.*

### Editing or clearing a past session's notes

Under **Session → Past Sessions**, each entry has a **pencil** button that only
you can see. Click it to rewrite that session's notes, then the **tick** to save
or the **cross** to cancel.

**To delete a recap entirely, clear the box and save.** The entry stays in the
list — it is a record that the session happened — but it goes back to reading
"No notes were written."

This exists for a specific reason. CozyVTT saved session notes long before
anything displayed them, so the first time you open Past Sessions you may find
recaps going back months that nobody has ever seen — including any you wrote as
private reminders to yourself, back when nothing showed them to anyone. Read
through them and clear anything you would rather the table did not see.

Notes are limited to 2,000 characters, the same as the box in the end-session
dialog.

### The Chat Panel (DM View)

As the DM, chat works the same as it does for players — type and hit Enter to send. However, you have one extra option: **Secret Dice Rolls**. When you roll dice, you can choose to roll secretly. Only you see the result in chat; players see a "DM rolled secretly" notice.

This is perfect for behind-the-screen perception checks, wandering monster rolls, and dramatic reveals.

*Screenshot pending — Secret dice roll option.*

### The Vibe Tracker

The **Vibe Tracker** is your tool for wordlessly communicating the current scene's tone. Set it from the **Session** tab in the right sidebar. Options range from relaxed and cozy to tense and terrifying.

Players can see the current vibe — use it to prime the atmosphere before describing a scene. Switching the vibe as the scene shifts is a subtle but powerful storytelling tool.

*GIF pending — DM changing the vibe and player view updating.*

---

## Combat and Initiative

### Starting the Initiative Tracker

When combat begins, click **Start Initiative** in the right sidebar's **Initiative** tab. The tracker becomes visible to all players.

*Screenshot pending — Initiative tracker with active combat.*

### Adding Combatants

Combatants are the tokens already on your map — you don't type names in by hand. There are two ways to add one:

- Click **+ Add** in the Initiative tab and pick a token from the list.
- Right-click a token on the map and choose **Add to Initiative**.

Each combatant carries its token's name, portrait and HP across automatically, but **not an initiative value** — a combatant joins the order showing **—** until something rolls for it. Joining the fight and having a place in it are separate steps, so a token added to tonight's fight never arrives carrying last week's result. Set a value by clicking the dash beside a combatant, or use the dice button on the row to roll one.

**Players can roll their own.** Once you've added a player's token, a dice button appears for them too — but only on their own row, and only for a token they control. They can also right-click their token on the map and pick **Roll Initiative** from the **Roll...** menu. Either way it lands in your turn order and the roll shows in chat.

You keep everything else: only you decide who is in the fight, drag the order around, type a value in by hand, advance the turn, or end combat. You can still roll for any combatant, players included — useful when someone is away from the keyboard as the fight starts. A player who isn't in the tracker yet has nothing to roll: the option doesn't appear until you add them.

**What gets rolled follows the game system**, worked out from the combatant's sheet or stat block rather than being a plain d20:

| System | Initiative |
|---|---|
| **D&D 5e** | `d20 +` Dexterity modifier, plus the sheet's **other bonus** box (Alert, Jack of All Trades, and so on) |
| **Pathfinder 2e** | `d20 +` the stat named by the sheet's **Uses:** dropdown — Perception by default, Stealth when someone is sneaking |
| **Call of Cthulhu 7e** | **No roll.** Investigators are ranked in DEX order, so the control reads **Set Initiative** and takes their DEX. Nothing appears in the dice log, because no dice were thrown |
| **Shadowrun 6e** | The character's initiative dice and base from their sheet |
| **NPCs** | A D&D 5e stat block rolls from its recorded Dexterity. A token with no sheet or stat block rolls a plain d20 |

Two things worth knowing. **Call of Cthulhu's readied firearms** act at DEX + 50 — that depends on the round rather than the investigator, so click the value and type it in when it applies. And **advantage on initiative** (a Sentinel Shield) isn't automatic; roll `2d20kh1` in the dice panel and enter the result.

Since values are saved on the token, you can always click a number and correct it, whatever produced it.

*GIF pending — Adding combatants and setting initiative order.*

### Managing Turn Order

Combatants are sorted by initiative automatically. You can drag and drop to reorder if there are ties or special circumstances.

Click **Next Turn** to advance to the next combatant in the order.

The active combatant is highlighted in two places, for everyone at the table:

- **In the tracker** — the row is tinted and marked with *"[Name]'s turn"*.
- **On the map** — a pulsing gold ring is drawn around the acting token. This is the quickest way to tell which of five identical goblins is up.

The ring uses a gold band edged in black so it stays visible over any map image, light or dark. It follows the normal visibility rules: if a token is hidden from players or sitting in unexplored fog, players see no ring — so an ambusher waiting in the dark stays secret even when their turn comes around. You'll still see the ring on your own screen.

Players who have the operating system's *reduce motion* setting turned on get the same ring without the pulse.

### Finding a Combatant on the Map

Turn order and map don't always line up in your head — especially with a row of identical monsters. Hover to connect the two:

- **Hover a row in the tracker** → that token lights up on the map: a thin white ring and a slight brightening. It's quieter than the gold turn ring, and a token can show both at once.
- **Hover a token on the map** → its row in the tracker tints to match.

This works for players too, and it's read-only — hovering never selects, moves or changes anything. Like the turn ring, it respects visibility: hovering the row of a hidden or fogged creature lights it up on your screen but not on your players'.

### Pinging a Location

Put the cursor where you mean and press **Tab**. A dot with radiating rings appears there for everyone, in your colour with your name beside it — far quicker than describing a spot out loud.

- The cursor has to be over the map; Tab does nothing over the sidebar or chat.
- Tab still behaves normally when you're typing or navigating with the keyboard, so it won't interfere with the rest of the interface.
- Everyone can ping, and each person's colour is assigned automatically and stays consistent.
- Pings are drawn above dynamic lighting on purpose, so you can point into an unlit area and players will still see the mark — pointing at somewhere dark is exactly when you need it. Note this means a ping does **not** respect fog: it marks a spot, so don't use it to gesture at something your players aren't meant to know about yet.
- Rapid repeat pings are rate-limited server-side and quietly dropped.

### Updating HP

Click a combatant's HP during combat to update it. Changes are broadcast to all players in real time — your players will wince visibly when the boss heals.

### Removing Combatants

Click the remove button next to any combatant to pull them from the tracker (when they flee, are defeated, or the situation changes).

### Ending Combat

Click **End Initiative** to close combat and hide the tracker. The order is preserved in case you need to resume.

---

## Fog of War

Fog of war covers your map and lets you reveal it a piece at a time, so players discover a dungeon room by room instead of seeing the whole floor plan at once. You control it by hand — nothing is revealed until you say so.

> 💡 **Fog of war and dynamic lighting are two different things.** Fog is manual: you decide what has been revealed, and it stays revealed. Dynamic lighting (the next section) is automatic and depends on where each character is standing and what walls block their view. You can use either on its own, or both together.

### Revealing and Hiding

Click the **Fog** button in the campaign header to open the **Fog of War** panel, then pick a mode:

- **Reveal** — drag a box over the map to show that area to players
- **Hide** — drag a box to cover an area back up

**Drag a box over the area you want.** The selection snaps to whole grid squares as you drag, and the size is shown in the middle of the box as you go — so you can drag exactly `4 × 7` and get exactly those 28 squares. Release to apply.

To toggle a single square, just click it without dragging. Before you start a drag, the square under your cursor is outlined, so you always know which one a click would take.

*GIF pending — Dragging a fog reveal box across a corridor.*

Some details worth knowing:

- **Drag in any direction.** Right-to-left and bottom-to-top work exactly like dragging forward.
- **Cancel a drag** with **Esc**, or by right-dragging (which pans the map instead). Neither reveals anything.
- **Dragging off the edge is fine** — the box clamps to the map.
- Only the DM sees the fog controls and the selection box. Players just see areas appear.

### Revealing or Hiding Everything

The panel's **Reveal all** and **Hide all** buttons apply to the entire map. Both ask for a second click to confirm, since they are hard to undo by hand — **Hide all** is the quick way to reset a map you have finished exploring, ready for next time.

### Fog and Tokens

A token standing in an unrevealed area is hidden from players entirely, even if the token itself is set to visible. That is what makes fog useful for staging: you can place a room full of monsters in advance and your players will not see them until you reveal the square they are standing in.

**Entirely** means the details panel too. Pointing at an unrevealed square tells a player nothing — no name, no picture, no hit points, no conditions. A player's own token is the one exception, and is always shown to them wherever it stands.

Worth knowing what fog does *not* do: it hides tokens from view, but the map still sends them to the player's browser, because revealing a square has to be instant. A token you want kept secret from a determined player should be set **hidden** rather than merely left in the dark — a hidden token is never sent at all.

---

## Walls & Dynamic Lighting

Walls define the physical boundaries of your map — they block line of sight and control what players can see through dynamic lighting. Dynamic lighting makes every player's view depend on where their character is standing, creating genuine exploration tension.

### The Wall Drawing Tool

Open the **Wall Controls** panel by clicking the **Walls** button in the campaign header (DM-only). The panel has six tool modes:

- **Draw** — Click to place wall endpoints; click again to extend the polyline; double-click to finish. Each pair of consecutive points creates a wall segment.
- **Select** — Click a wall segment to select it and change its type or delete it. Click an endpoint to select it; drag an endpoint to move it (all connected segments move together). Click **Merge point** to remove a bend point and join two segments into one.
- **Split** — Click on a wall segment to add a midpoint, splitting it into two segments.
- **Erase** — Click and drag to brush-erase wall segments.
- **Polygon** — Click to place corners of a room; click near the starting point to close the shape and create all wall segments at once.
- **Brush** — Paint over the map to trace walls; the brush stroke is automatically simplified into straight wall segments. With **Snap to grid** enabled, segments align perfectly to grid intersections.

Wall types are selected from the **Draw type** section in the Wall Controls panel:

| Type | Color | Blocks Vision | Notes |
|------|-------|---------------|-------|
| Wall | Orange (customizable) | Yes | Standard blocking wall |
| Door (Closed) | Purple | Yes | Clickable to open |
| Door (Open) | Green | No | Click to close |
| Door (Locked) | Red | Yes | DM must unlock |
| Window | Blue | No | Transparent to light |

### Polygon Drawing Mode

The **Polygon** tool lets you draw complex wall shapes by clicking corners:

1. Select **Polygon** mode from the Wall Controls panel
2. Click to place each corner point — a preview line follows your cursor
3. To close the shape, click near your starting point (within the snap radius) — all edges are committed as wall segments in one action
4. Press **Escape** to cancel the polygon without placing any walls
5. Press **Ctrl+Z** to remove the last point while drawing

Polygon mode is great for tracing irregular room shapes without drawing each wall segment individually.

### Brush Drawing Mode

The **Brush** tool lets you paint over the map to quickly trace walls:

1. Select **Brush** mode from the Wall Controls panel
2. Adjust the **Brush size** slider as needed
3. Click and drag over the map where walls should be
4. On release, the brush stroke is simplified into straight wall segments using Douglas-Peucker line simplification

**Tips for the brush tool:**
- Enable **Snap to grid** for straight, grid-aligned walls (recommended for dungeon maps)
- Disable snap for organic or curved wall layouts
- When snap is off, the tool uses image edge detection to refine wall placement

### Snap-to-Wall for Doors and Windows

When drawing a **door** or **window**, CozyVTT can automatically **snap to an existing wall** and replace a section of it — saving you from manually splitting walls.

**How it works:**

1. Select the **Door** or **Window** tool type from the wall type dropdown
2. Click near an existing wall to start — the starting point snaps to the nearest wall (shown as a green dot)
3. Click a second point along the **same wall** — the endpoint also snaps
4. CozyVTT automatically:
   - Removes the original wall segment between your two points
   - Creates the door or window segment in its place
   - Preserves the remaining wall stubs on either side

**Visual feedback:**
- Green snap dots appear when your cursor is near a wall
- The preview line changes color: **violet** for doors, **blue** for windows
- Both dots turn green when snapping to the same wall (confirming the replacement will work)

This reduces the old workflow (split wall twice → delete middle segment → draw door) down to just **two clicks**.

### Editing Walls

- **Select mode** — Click a segment to change its type or delete it
- **Drag endpoints** — In Select mode, click and drag any endpoint dot to reposition it; all connected segments move together
- **Merge points** — In Select mode, click an intermediate point (connecting exactly 2 same-type segments) and click **Merge point** to join them into one straight segment
- **Split** — Click on a wall segment to add a midpoint

### Drawing Walls Efficiently

1. **Use the brush with snap-to-grid** — The fastest way to trace dungeon walls
2. **Trace room boundaries first** — Outline major rooms, then add hallways and secondary walls
3. **Use doors sparingly** — Every door is an interactive element players can click; use them for actual openable doors, not decorative arches
4. **Use snap-to-wall for doors/windows** — Much faster than splitting walls manually
5. **Drag endpoints to fine-tune** — Adjust wall positions without redrawing

> **Tip:** Maps created in tools like Dungeondraft or Dungeon Alchemist can be exported as Universal VTT (.uvtt) files, which include wall data directly — no manual wall drawing needed. Use **Import UVTT** instead.

### Undo / Redo

Wall edits support full undo/redo:
- **Ctrl+Z** (or Cmd+Z) — Undo last wall change
- **Ctrl+Y** / **Ctrl+Shift+Z** — Redo
- The undo/redo buttons are also in the Wall Controls panel

Undo/redo applies to: placing walls, deleting walls, splitting, merging, dragging endpoints, and toggling doors.

### Enabling Dynamic Lighting

Dynamic lighting is off by default. To enable it:

1. Click the **Maps** button → select your map → click the **Edit** (pencil) icon
2. In the map settings, check **Enable Dynamic Lighting**
3. Click **Save Map**

Once enabled, players only see the areas their characters have line of sight to. The rest of the map is hidden beneath a deep fog overlay.

*Screenshot pending — Map settings with Dynamic Lighting checkbox.*

### Token Sight Radius

Each token has a **Sight Radius** property (in grid squares). This determines how far the token can see. A radius of 0 means unlimited sight (sees the entire map assuming no walls).

Update a token's sight radius in the Token Manager or the Quick Editor panel.

> **Tip:** Set sight radius to match in-game values: 6 squares (30 ft) for a typical character, 12 squares (60 ft) for a character with Darkvision.

### Light Sources

Place light sources on the map to illuminate areas for players. Each light has two radii that match standard TTRPG light rules:

- **Bright radius** — the inner zone of full, clear visibility. Characters can see normally within this area.
- **Dim radius** — the outer zone of reduced visibility. In D&D 5e this corresponds to "lightly obscured" (disadvantage on Perception); in PF2e it grants the "concealed" condition.

When two dim zones from different light sources overlap, the combined area is treated as bright light.

#### A light does not see for your players

A light shows a player something only where their own character could already
have seen it. Walls block sight as well as light, so a lamp burning inside a
closed room reveals nothing to someone standing outside it, and the creatures in
that room are not sent to their browser at all until they can see in. This is how
dynamic lighting works in every virtual tabletop that has it, and it is what lets
you light a building in advance without spoiling what is inside.

A token's **sight radius** governs how far it makes things out in the dark. It
does not limit how far it can notice something that is lit: a character with a
short sight radius still sees a bonfire across a field, provided nothing solid is
in the way.

Two practical consequences when you are building a map:

- **A room stays dark until someone can see into it.** If you want a lit room
  visible from the corridor, leave a door or a gap — a sealed room reads as
  darkness, which is usually what you want.
- **Windows are not walls.** A window segment passes light and sight, so a lit
  room behind one *is* visible from outside. That is the tool for "you can see
  the lamp burning through the shutters".

> **If you are upgrading from 1.2.2**, this is a change. Lit rooms used to be
> visible to everyone whether or not they could see in, so maps built against
> that behaviour may now be darker than you expect until a character gets line of
> sight.

#### Placing Lights

1. Open the **Lights** panel in the wall/lighting controls
2. Click **Place**, then click on the map to drop a light
3. Choose a **preset** (Candle, Torch, Lamp, Lantern, Campfire) or dial in custom bright and dim radii
4. Pick a color from the palette or enter a custom hex

| Preset | Bright (sq) | Dim (sq) | Typical Use |
|--------|-------------|----------|-------------|
| Candle | 1 | 2 | Desk, altar |
| Torch | 4 | 8 | Wall sconce, carried torch |
| Lamp | 3 | 6 | Oil lamp on a table |
| Lantern | 6 | 12 | Hooded lantern |
| Campfire | 8 | 16 | Outdoor fire pit |

#### Editing & Moving Lights

Switch to **Select** mode to click on a light. You can then drag it to reposition, adjust its radii and color, toggle it on/off (extinguished torch), or delete it.

> **Tip:** The DM always sees light icons on the map. Toggle **Preview Player View** to see how the bright/dim zones actually look to players.

### Previewing the Player View

As DM you always see all walls and the full map. To preview what a player is actually seeing:

- Click **Preview Player View** in the Wall Controls panel (appears when dynamic lighting is enabled)
- Your canvas switches to the player's perspective, showing only what your controlled tokens can see
- Click again to return to full DM view

### Performance Notes

- **Under 200 wall segments** — The visibility algorithm scans all walls directly. Plenty fast for typical dungeon layouts.
- **Over 200 wall segments** — A spatial grid index activates automatically to prune distant walls from the raycasting calculation. Maps with 500+ segments run at full frame rate.

---

## The Spirit Layer

The Spirit Layer is a second plane for your map — useful for games where some characters can perceive things others can't (astral space in Shadowrun, the ethereal plane in D&D, the spirit world in various systems).

It is a **separate plane, not a see-through overlay.** Someone viewing the spirit realm sees the tokens on that plane *instead of* the ordinary ones, not as well as them. You, as DM, always see both.

### Sending players to the spirit realm

There are two ways a player ends up there:

- **The whole table at once.** Click the **Spirit Layer** button in the campaign header and toggle it **on**. Every player is in the spirit realm until you toggle it back off.
- **One player at a time.** Give a player control of a token that lives on the spirit layer. Any player controlling a spirit-layer token on the current map sees the spirit realm; everyone else stays on the material plane.

*Screenshot pending — Spirit Layer control panel.*

Players in the spirit realm see a pulsing **Spirit Realm** badge in the corner of the map, so they know why the view changed.

> **A player in the spirit realm cannot see ordinary tokens — including their own.** That is the point: they have left the material plane. It has one surprising consequence, below.

### The Spirit Layer and dynamic lighting

On a map with **dynamic lighting** switched on, a player sees by their own token's line of sight. A player who is in the spirit realm but has no spirit-layer token has nothing to see with — so the map renders **completely black** for them.

If a player reports a black map, check whether the Spirit Layer is toggled on in the campaign header. Either switch it off, or give that player a spirit-layer token to look through.

### Spirit Layer Styles

Two style options are available:

- **Wispy** — A built-in atmospheric effect with a spectral, fog-like appearance
- **Custom Color** — Set a specific hex color for the overlay tint (great for matching your game's lore, e.g., a purple astral glow or a sickly green necrotic haze)

*Screenshot pending — Map with wispy spirit layer overlay.*

*Screenshot pending — Map with custom color spirit layer overlay.*

### Token Visibility in the Spirit Layer

Every token sits on exactly one plane: the material one, or the spirit layer. Moving a token to the spirit layer is what makes it visible to players in the spirit realm — and hides it from everyone still on the material plane. This is how you show astral or spiritual entities only to the characters with the perception to see them.

In the Token Manager, toggle **Spirit Layer Visibility** for each token as needed.

*GIF pending — Toggling a token's spirit layer visibility.*

---

## Atmosphere Controls

Set the mood with audio and visual effects — the Atmosphere panel is your toolkit for immersion.

### Opening the Atmosphere Panel

Click the **Atmosphere** button in the campaign header.

*Screenshot pending — Atmosphere panel.*

### Ambient Audio

Upload audio files to your Asset Library (type: **Audio**), then select them in the Atmosphere panel. All connected players hear the audio automatically.

- Set a specific audio track for the current scene
- Audio loops automatically until you change or stop it
- Use ambient sounds (rain, tavern chatter, dungeon drips) to set the scene without narrating it

*GIF pending — Setting ambient audio and the player hearing it start.*

### Atmosphere Effects

Visual particle overlays render on top of the map to complement your audio. Six effects are available:

| Effect | Description |
|--------|-------------|
| Rain | Falling rain drops with diagonal wind drift |
| Mist | Slowly drifting fog banks |
| Leaves | Autumn leaves swept across the screen |
| Sparkles | Twinkling magic particles |
| Snow | Gentle snowfall with horizontal sway |
| Wind | Horizontal wind streaks and gust clouds |

*Screenshot pending — Map with atmosphere effect applied.*

**Pro tip:** Layer effects purposefully. Spooky dungeon? Set the vibe to "Night" and add mist. Forest ambush? Leaves with suspenseful audio. Magical temple? Sparkles with ethereal music.

---

## Session State and Continuity

CozyVTT remembers your campaign between sessions, so you can pick up exactly where you left off.

### What Gets Saved

When you end a session (or when the server saves automatically), CozyVTT preserves:

- **Token positions** — Everyone stays put on the map
- **Chat history** — The full log is available when players rejoin
- **Initiative order** — Combat state is preserved
- **Map selection** — The active map remains active
- **Atmosphere settings** — Audio and effects settings are remembered

### Resuming a Session

When you're ready to play again, navigate to the campaign and click **Start Session**. Players will see token positions and map exactly as you left them.

*Screenshot pending — Campaign page loading with preserved state.*

### Multi-Session Campaign Tips

- **Use the map notes / description** to leave yourself reminders about where the party is and what's happening. The campaign description field in Campaign Settings is a good place for this.
- **Update token HP** at session end so it reflects the party's state going into the next session
- **Clear chat history** if you want a fresh start for a new chapter (optional — old history doesn't affect gameplay, just scrollback)

---

## Tips and Best Practices

### Before the Session

1. **Upload your maps early** — Don't spend the first ten minutes of a session uploading files
2. **Pre-place tokens** — Set up the starting map and place tokens in their starting positions
3. **Queue up your audio** — Test that your ambient tracks sound right before players join
4. **Double-check the roster** — Make sure all players have their characters assigned and tokens placed
5. **Start the session a few minutes early** — Let players connect and get settled before the story begins

### During the Session

- **Use the vibe tracker** to signal tone shifts without breaking narrative immersion
- **Roll in the open** for skill checks players would witness; roll secretly for perception checks and DM rolls
- **Switch maps with confidence** — the transition is instant; use it for dramatic scene changes
- **Keep the initiative tracker visible** during combat so players always know whose turn it is
- **Update HP as it changes** — real-time HP updates make combat feel alive

### Running Multiple Campaigns

As a DM, you can run as many campaigns as you like simultaneously. Each campaign is completely isolated — separate maps, tokens, rosters, chat logs, and state. Switch between them freely from the dashboard.

### Working with the Admin

If you're on a shared CozyVTT instance, coordinate with your platform administrator for:
- Creating accounts for new players before you invite them
- Uploading assets to the Global scope (available to all DMs on the platform)
- Recovering from any platform-level issues

---

*For player-perspective features, see the [Player Guide](PLAYER_GUIDE.md).*

*For general platform features, see the [User Guide](USER_GUIDE.md).*
