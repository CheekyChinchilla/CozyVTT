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
10. [Walls & Dynamic Lighting](#walls--dynamic-lighting)
11. [The Spirit Layer](#the-spirit-layer)
12. [Atmosphere Controls](#atmosphere-controls)
13. [Session State and Continuity](#session-state-and-continuity)
14. [Tips and Best Practices](#tips-and-best-practices)

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

1. Open **Campaign Settings**
2. Find the **Invite Players** section
3. Enter the player's email address — they must already have an account on your CozyVTT instance
4. The player will see a **Pending Invitation** banner on their dashboard

*Screenshot pending — Invite player flow.*

When a player accepts, they'll choose which of their characters to bring. Once they've joined, their character appears in the **Campaign Roster** on the left sidebar.

> **Note:** If registration is closed on your instance, the platform administrator will need to create accounts for your players before you can invite them.

### The Campaign Roster

The left sidebar's **Campaign Roster** shows all players currently in your campaign along with their assigned characters. This is a quick-reference during sessions for names, character names, and party composition.

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

Tokens aren't automatically placed on the map — you drag them from the Token Manager onto the canvas.

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
- Apply or remove conditions (visual badges appear on the token)

*Screenshot pending — NPC quick editor popup with image picker.*

#### Changing a Token's Image

1. Click the token on the map to open the Quick Editor
2. Click the token avatar (top-left of the editor) — a hover overlay with an image icon appears
3. The **Image Picker** opens, showing all TOKEN-type assets from your campaign
4. Select an image, or click **Upload New** to upload a fresh asset
5. Click **None** to remove the image and revert to a colored-letter placeholder

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

Right-click any NPC token on the map (DM only) and choose **Roll...** to open the NPC roll picker. It surfaces every rollable option from the token's stat block:

- **Ability checks** — STR, DEX, CON, INT, WIS, CHA (1d20 + ability modifier)
- **Saving throws** — all six saves, with proficient saves marked
- **Skills** — only skills the stat block lists explicit bonuses for
- **Combat** — attack rolls (`+N to hit` parsed from action descriptions) and damage rolls (every `XdY+Z` expression extracted from each action)

For d20 systems (D&D 5e, PF2e) the picker also has an **Advantage / Disadvantage** selector that rewrites the dice expression before rolling (`2d20kh1` / `2d20kl1`). Pathfinder 2e shows the same selector labeled **Fortune / Misfortune**.

If a token doesn't have a stat block, or you're running a non-d20 system, there's a **Custom Roll** input at the bottom of the picker — type any valid dice expression (e.g. `3d8+2`) and optional label, then roll. The result is broadcast to chat with the token name as context (e.g. *"Goblin: Scimitar Damage = 5"*).

*Screenshot pending — NPC roll picker with stat-block-derived options.*

### Managing Token Visibility

Some tokens shouldn't be visible to players until the right moment. The **Spirit Layer Visibility** setting on a token controls whether it appears in the spirit layer view (see [The Spirit Layer](#the-spirit-layer)).

For standard visibility (show/hide from players entirely), token placement itself is the control — unplaced tokens are invisible to players.

---

## The Creature Library

The Creature Library is your DM-side catalog of creature templates — stat blocks, images, and metadata ready to drag onto the map as NPC tokens.

### Opening the Creature Library

Click the **Creatures** button in the campaign header to open the Creature Library panel. The library shows all available creature templates: both **SRD creatures** (imported from Open5e) and **custom creatures** you've created for this campaign.

### SRD Creature Seeding

The first time you open the Creature Library in a new campaign, it may be empty. Click **Import SRD Creatures** to fetch the full D&D 5e SRD bestiary from Open5e. This is a one-time operation that populates the library with hundreds of ready-to-use creatures.

- Seeding takes a few seconds — a progress indicator shows while it runs
- SRD creatures are **global** (shared across all campaigns on the instance) and **read-only**
- You can duplicate any SRD creature to create an editable custom version

### Browsing and Searching

The library supports:

- **Search** — Type in the search bar to filter by creature name
- **Source filter** — Filter by `srd` (imported) or `custom` (your creations)
- **Challenge Rating filter** — Narrow down by CR
- **Pagination** — Results load in pages; scroll down and click "Load More" to fetch additional creatures

### Favorites

Star your most-used creatures for quick access. Click the **star icon** next to any creature in the library to favorite it. Favorites are stored **per-campaign, per-user** — your favorites in one campaign don't affect another.

Favorites appear in a collapsible **"Favorites"** section at the top of the Creature Library panel, above the main creature list. Expand it to see all your starred creatures with one click.

> **Note:** Favorites are per campaign — starring a creature in Campaign A does not star it in Campaign B.

### Placing Creatures on the Map

Click any creature in the library to expand its details, then click **Place on Map** (or drag it onto the canvas). A new NPC token is created with:

- The creature's name
- Its stat block (viewable and editable in the Quick Editor)
- Its image (if one has been associated)
- Default disposition from the template (hostile, friendly, or neutral)
- Display mode from the template (pog, top-down, or full-art)

### Creating Custom Creatures

Click **+ New Creature** at the top of the Creature Library to create a custom creature template. Fill in:

- **Name** — Required
- **Stat Block** — The creature's combat stats (HP, AC, attacks, etc.)
- **Challenge Rating** — Optional, used for filtering
- **Creature Type** — Optional (e.g., beast, undead, fiend)
- **Image** — Optional; choose from your TOKEN assets
- **Size** — Grid size (default 1×1)
- **Disposition** — Hostile, friendly, or neutral
- **Display Mode** — Pog, top-down, or full-art

Custom creatures are scoped to your campaign and fully editable.

### Editing Custom Creatures

Click the **pencil icon** next to any custom creature in the library to open it for editing. You can update any field — name, stat block, image, disposition, display mode, and all advanced stats (traits, actions, legendary actions, etc.).

SRD creatures cannot be edited directly. Duplicate them first, then edit the copy.

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

For **NPC-type templates**, the edit form includes the full stat block editor — AC, ability scores, saves, skills, traits, actions, bonus actions, reactions, and legendary actions — so you can build a complete monster once and reuse it across maps and campaigns. The right-click NPC roll picker (see [Rolling for NPC Tokens](#rolling-for-npc-tokens)) reads from the same stat block, so a template with a well-filled-in action list gets clickable attack and damage rolls automatically.

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

### Viewing the Roster

The Campaign Roster in the left sidebar gives you a real-time view of all players and their characters. During a session, you can see who's connected.

### Removing a Player

To remove a player from your campaign, open **Campaign Settings** and find the player in the roster. Use the remove option to kick them from the campaign.

### Character Assignment

Players assign their own characters to your campaign when they accept an invitation. If a player needs to swap characters (e.g., death, retirement, trying a new one), they can reassign from their Characters page, or you can coordinate with them.

---

## Running a Session

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

*Screenshot pending — End session confirmation dialog.*

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

Click **+ Add** to add a combatant manually. Enter:
- **Name** — Character or monster name
- **Initiative** — The initiative roll result
- **HP** — Starting hit points

You can also use the **Roll Initiative** button to auto-roll for NPCs you've added.

*GIF pending — Adding combatants and setting initiative order.*

### Managing Turn Order

Combatants are sorted by initiative automatically. You can drag and drop to reorder if there are ties or special circumstances.

Click **Next Turn** to advance to the next combatant in the order. The active combatant is highlighted for all players to see.

### Updating HP

Click a combatant's HP during combat to update it. Changes are broadcast to all players in real time — your players will wince visibly when the boss heals.

### Removing Combatants

Click the remove button next to any combatant to pull them from the tracker (when they flee, are defeated, or the situation changes).

### Ending Combat

Click **End Initiative** to close combat and hide the tracker. The order is preserved in case you need to resume.

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

The Spirit Layer is an alternate visual overlay for your map — useful for games where some characters can perceive things others can't (astral space in Shadowrun, ethereal plane in D&D, spirit world in various systems).

### Toggling the Spirit Layer

Click the **Spirit Layer** button in the campaign header to open the Spirit Layer controls.

*Screenshot pending — Spirit Layer control panel.*

Toggle the spirit layer **on** to activate the overlay on the map. Toggle it **off** to return to the normal view.

### Spirit Layer Styles

Two style options are available:

- **Wispy** — A built-in atmospheric effect with a spectral, fog-like appearance
- **Custom Color** — Set a specific hex color for the overlay tint (great for matching your game's lore, e.g., a purple astral glow or a sickly green necrotic haze)

*Screenshot pending — Map with wispy spirit layer overlay.*

*Screenshot pending — Map with custom color spirit layer overlay.*

### Token Visibility in the Spirit Layer

Each token can be set as visible or hidden within the spirit layer independently of its normal-world visibility. This lets you show astral/spiritual entities only to characters with the perception to see them.

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
