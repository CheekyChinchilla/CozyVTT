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

From the **Dashboard**, click **Create Campaign**. Fill in:

- **Campaign Name** — The title your players will see
- **Description** — A brief blurb about the campaign (optional but recommended)
- **Game System** — The ruleset you're playing under

Click **Create Campaign** and you're taken directly to the campaign page.

*Screenshot pending — Campaign creation modal.*

### Campaign Settings

Once inside the campaign, click the **Campaign Settings** button (gear icon in the header) to open the Campaign Settings panel.

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

**Spectators.** A member can also be a spectator: someone watching the game without a character in it. A spectator sees the map as a player with no token does, can read and write in the chat and ping the map, and keeps private notes and dice macros of their own, but cannot roll dice or initiative, move or edit tokens, or edit a character sheet at the table, not even through a token that still names them from when they were a player: such a token is treated as nobody's, so they see it as any other player would and it gives them no sight on a lit map. A character they brought while a player stays in the roster, but they cannot edit it while they are a spectator; you can. They can still add one of their own characters to the roster, take one out, or delete it. Edit Token and the Token Manager offer only players as a token's controller. Everyone you invite joins as a player, and the app has no control yet for making someone a spectator; the role can only be set through the API (`PUT /api/campaigns/{campaignId}/members/{userId}/role`).

### The Campaign Roster

The left sidebar's **Campaign Roster** shows all players currently in your campaign along with their assigned characters. It is a quick reference during sessions for names, character names and party composition — and it is also how you get a player's character onto the map.

**Moving a token to another map.** Switching maps offers to bring tokens along, a token's right-click menu offers **Move to Map…**, and in the Token Manager the map icon (**Move to another map**) opens **Move to which map?**. A token that moves keeps everything about it: its type, who controls it, its darkvision, hit points, conditions, notes and stat block.

**Placing a character.** Drag any character from the roster onto the canvas, or right-click it and choose **Add to Map**, which drops it in the centre of the current map. Either works whether or not the character has a token picture: one without a picture is drawn as a coloured circle with its initial, the same as a creature with no art. The token is created as a **player** token, controlled by whoever owns the character while they are a player, so they can move it themselves; a character of your own, or one a spectator owns, is placed with no controller, so you move it. Only the controller can, and the map is drawn from the controller's point of view; change it any time in **Edit Token → Controlled By**.

**Stacking tokens is a DM privilege.** Players are stopped from finishing a move on a square someone else is standing in — the rules say you cannot end your move in another creature's space, and the map now enforces it. You are exempt: place a rider on a mount, pile up a swarm or arrange scenery however you need to. A creature at zero hit points does not block anyone; it is drawn faded and can be stood on. Players only know a creature is down if they can see its hit points, so for them this applies to characters, their own tokens and creatures whose **Show HP bar** is on; a creature whose bar you keep off still looks standing to them, and still blocks its square, until you remove it. And if you do stack a token on top of a player's, they can still click the square and get their own token back.

**Who's actually here.** A small dot on each person's icon shows whether they're connected right now — green for in session, grey for not. It updates as people arrive and leave, so you can tell at a glance whether the quiet player is thinking or has dropped off. Someone with the campaign open in two tabs stays green until they close the last one.

This replaced the "X has joined the campaign" messages that used to appear in chat. Those fired on every page load and every momentary disconnect, so a player with a patchy connection could bury the conversation without saying a word. If your campaign still has a backlog of them, the **eraser button** at the top of the chat panel clears them for everyone — it only removes those notices, and leaves the rest of the conversation alone. Nothing was deleted automatically when you upgraded.

### Handing the game to someone else

Sometimes the person running the game needs to change: you are handing a
campaign to a co-DM, you are stepping back but the group plays on, or you want
someone else to narrate while you play a character for a session.

Open **Campaign Settings → Members** and click the **crown** next to whoever
should take over. You will be asked to confirm, because it takes effect at once.

What happens:

- **They become the DM** and get the DM's controls — maps, tokens, fog, the lot.
- **You become a player** in the same campaign. You keep your characters and
  stay at the table; you simply stop having the DM's controls.
- **It happens live.** Nobody has to reload. If you are both in the session when
  you do it, the controls move between you there and then.
- **Owning the campaign does not move.** If you created it, you still own it —
  which means you can still delete it, and you can be made DM again later.

**A campaign has exactly one DM**, so handing it over is a swap rather than an
addition. If you want two people running a game at once, that is not something
CozyVTT does yet.

> **Getting it back.** The new DM can hand it back the same way. And if the
> campaign is yours — you created it — you keep a way in regardless: an **Owner
> Settings** button appears in the top bar, holding the two things that stay
> yours, deleting the campaign and taking the DM seat back. It sits in the same
> place the DM's own settings button occupies. So handing the
> game over can never lock you out of your own campaign. If you are *not* the owner,
> ask the new DM, or your instance's administrator can move it for you.

---

## Preparing Your Maps

Good maps make great sessions. Here's how to get them into CozyVTT.

### Uploading Map Assets

Before you can use a map in your campaign, it needs to live in the **Asset Library**.

1. Open the **Asset Library** from your dashboard
2. Click **Upload Asset**
3. Choose your image file (JPEG, PNG, and WebP work great)
4. Set the type to **Map**
5. Set the scope to **Campaign** (shared with everyone in that campaign, who can browse it in the asset library straight away) or **Personal** (private to you until the players are shown something that uses it)
6. Give it a descriptive name — you'll thank yourself later when you have twenty maps
7. Add tags if you like (e.g., "dungeon", "outdoor", "tavern")
8. Click **Upload**

*GIF pending — Uploading a map to the asset library.*

### Adding Maps to Your Campaign

Once your map is in the asset library:

1. Inside your campaign, click **Map Library** (the map icon) in the header
2. The Map Library panel opens
3. Click **Create Map**, pick your uploaded image and check the grid settings
4. The map is now available to switch to at any time

You can change a map's **Width**, **Height** and **Grid Size** later with the **pencil** (Edit map) in the Map Library. Changing any of them resets that map's fog of war to fully covered and forgets what every player has explored of it.

**Map size limits.** A map can be:

| Setting | Smallest | Largest |
|---|---|---|
| Width and Height (grid squares) | 1 | 500 |
| Grid Size (pixels per square) | 10 | 500 |
| Feet per square (**Grid Scale**) | 1 | 100 |

Create Map and Edit Map offer nothing outside these, and applying a **Grid detected** suggestion keeps it inside them. A Universal VTT file whose map is more than 500 squares on a side is refused when you import it.

A map holds up to **1,000 tokens**. Adding one more, or moving tokens onto a map that would take it past 1,000, is refused with a message; a map that already had more before version 1.5.1 keeps them, and you can still move, edit and remove them.

A map made before version 1.5.1 may be larger than this. It still opens, and Edit Map still saves changes that leave its size alone, but fog of war and explored areas cannot be turned on for a map with more than 250,000 squares (500 by 500). Turning either on there says so, and a map that already had fog on shows none. To use fog on it, make it 500 squares or fewer on each side in Edit Map.

*Screenshot pending — Map Library panel with multiple maps.*

### Switching Maps

Open the **Map Library** and click **Set Active** on the map you want. This immediately updates the view for all connected players — no need to coordinate.

*GIF pending — Switching maps, showing player view update.*

Plan your map order loosely in advance (forest → cave entrance → dungeon interior), but don't worry about locking anything in. You can switch maps freely during a session.

### Map Best Practices

- **Resolution matters** — Maps look best at 70–100 pixels per grid square. Going higher increases load time without visible benefit at normal zoom levels.
- **Label your maps** — Use descriptive names like "Session 3 - Goblin Cave" rather than "map_final_v3.png"
- **Prepare ahead** — Load all maps you might need before the session starts so there's no fumbling during play. Players cannot see a map until you switch to it: its walls, lights and tokens stay yours alone while you prepare it, and so does art uploaded as **Personal**. Art in the campaign's library is not hidden: anyone in the campaign can browse **Campaign** assets, and that is where **Upload New** in the Create Map window puts a map image, as uploading a token image from inside the campaign does. To keep a map a surprise, upload its art as **Personal** from the Asset Library first, then pick it with **Browse Assets** when you create the map. A map made with **Import UVTT** always puts its picture in the campaign's library, so move that picture to **Personal** straight after importing (see [Importing a Universal VTT file](#importing-a-universal-vtt-file))
- **Keep backups** — Export important maps so you can recover them if needed
- **Deleting art a map uses** — Delete in the Asset Library asks first. If a map, a token, a character, a template, a creature or the campaign's ambient sound still uses the file, a second window lists them (the campaigns you run are named; other people's are only counted) and removes it only if you choose **Delete anyway**. A map left without its picture shows "This map has no picture" until you choose another in **Edit Map**, and a deleted file cannot be brought back

---

## Setting Up Tokens

Tokens are the visual representations of everyone (and everything) on the map.

### Opening the Token Manager

Click **Token Manager** (the crossed-swords icon) in the campaign header to open it.

*Screenshot pending — Token Manager panel.*

### Creating a Token

The Token Manager opens on the form for a new token. Fill in what applies, then click **Place on Map**; the token appears in the middle of the current map, ready to drag into position.

- **Token Type** — **Player**, **NPC / Creature** or **Object**
- **Token image** — Upload one, pick a token image from your library, or leave it empty for a placeholder
- **Token Name** — Shown when anyone points at the token
- **Display Mode** — Pog, Top-Down or Full Art (see below)
- **Disposition** (Friendly, Neutral or Hostile), **HP Max** (0 means no HP bar; once it is above 0, **Show HP bar to players** appears, ticked by default) and **Initiative** — for creatures
- **DM Notes** (never shown to players) and **Hidden from players on placement** — for creatures and objects
- **Size (grid cells)** — Small/Med, Large or Huge
- **Darkvision** — How far the token sees with no light, in grid squares (0 = none; at the usual 5 ft a square, 12 = 60 ft, and the hint works it out for the map's own scale); not offered for Objects
- **Controlled by** — Which player may move it

*Screenshot pending — Token creation form.*

### Token Roster

The **Token Roster** (visible only to you, in the left sidebar) lists all tokens on the current map. Point at a token in the list for its actions: edit it, hide or show it, obscure or reveal its identity, duplicate it, or remove it. The buttons stay visible on a touch screen and while you tab through them, and a failed action now shows a message. Removing a token, here, in the Token Manager, in the quick editor or with **Remove from Map** in the token's right-click menu, asks first and names the token.

### Placing Tokens on the Map

Tokens aren't automatically placed on the map. Where they come from depends on what they are:

- **Player characters** — drag one from the **Campaign Roster**, or right-click a character there and choose **Add to Map**.
- **NPCs and monsters** — the **Place on Map** button on a creature in the **Creature Library**, or on a token template.
- **Anything you built yourself** — **Place on Map** in the **Token Manager**.

Everything except a character dragged from the roster lands in the middle of the current map; drag it where it belongs.

*GIF pending — Placing a token and dragging it into position.*

### Token Display Modes

Tokens support three display modes that control how they appear on the map:

| Mode | Appearance | Best for |
|------|-----------|----------|
| **Pog** | Circular token with the image cropped to a circle | Classic tabletop token style |
| **Top-Down** | Image rendered from above, no border | Overhead dungeon art, top-down tokens |
| **Full-Art** | Full rectangular image shown at token size | Character portraits, scenic tokens |

Choose the display mode in the Token Manager's **Add Token** section when you place a token. It can't be changed once the token is on the map.

**Colored-Letter Placeholders:** Tokens without an image show a colored circle with the first letter of the token's name. Player tokens are blue; creatures are red when hostile, teal when friendly and amber when neutral; objects and creatures with no disposition are grey — making it easy to distinguish dispositions at a glance. An obscured token keeps its color and letter on your own map, with a small **?** badge as a reminder; players who do not control it, and **Preview Player View**, see a grey circle with a question mark whatever it is.

### Editing Tokens During Play

Right-click any token on the map and choose **Edit Token**, or click the pencil beside it in the Token Roster, to open the quick editor. It opens for player, NPC and object tokens; the HP, stat block and disposition sections are shown for NPCs. From here you can:

- Update HP (current, max, and temporary)
- Rename the token
- View and edit the stat block (for NPC tokens with creature template data). An edit is saved a moment after you stop typing, or straight away when you click out of the stat block, switch it back to **View** or close the editor
- **Change the token image** — click the token avatar in the editor's header to open the image picker
- **Save the image back to the creature template** — so future placements of that creature reuse the same image
- **Hide from Players** or **Show to Players**, the same switch as the eye in the roster and as **Hide from Players** / **Reveal to Players** on the right-click menu
- **Obscure Identity** or **Reveal Identity**, the same switch as on the right-click menu, in the roster and in the Token Manager (see [Obscuring a Token's Identity](#obscuring-a-tokens-identity))
- Apply or remove conditions. All fifteen D&D 5e conditions are offered here, the same set the character sheet uses. Each one shows as a small amber badge above the token — a two-letter code, so **PA**ralyzed, **PO**isoned, **PE**trified and **PR**one stay distinguishable at a glance. Past four, the rest collapse into a grey **+N** badge so the row never grows wider than the token. Anyone can hover a token to read its conditions in full, players included — they can't act around a condition they can't identify

*Screenshot pending — NPC quick editor popup with image picker.*

#### Changing a Token's Image

1. Right-click the token on the map and choose **Edit Token**
2. Click the token avatar (top-left of the editor) — a hover overlay with an image icon appears
3. The **Image Picker** opens, showing every token image you have access to — platform-wide assets, your own uploads, and assets from campaigns you're a member of
4. Select an image, or click **Upload** to upload a fresh asset
5. Click **None** to remove the image and revert to a colored-letter placeholder

The map updates immediately for everyone at the table — no one needs to refresh. This changes only that one token; to change the image every future placement uses, edit the creature template instead (see [Creature Token Images](#creature-token-images)).

#### Saving an Image to a Creature Template

After setting a token's image, you can save it back to the creature template so every future placement of that creature uses the same image:

1. In the quick editor, below the token image, click **Save image to creature template**

**SRD creatures are read-only.** If the token is based on an SRD creature (imported from Open5e), CozyVTT will automatically create a custom duplicate of that creature for your campaign:

- You'll be prompted to **name the duplicate** (e.g., "Ancient Red Dragon (Fire Variant)"), then click **Create & Save Image**
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

> **Spending a player's hit dice.** A D&D 5e character's menu includes a **Hit Dice** section, and choosing one rolls a single die plus their Constitution and takes one off their pool — on *their* sheet, not a copy of it. That is deliberate, so you can cover a short rest for someone who isn't at the table, but it is a change to their character rather than just a roll. The hit points are not applied automatically; use the **+** on their roster card for the amount rolled.

> **Changing a character someone has open.** Hit points you change from the roster, and hit dice you spend, reach a sheet that player has open to read straight away. If they have it open in the editor, their next save is refused rather than putting the old values back. Their editor stays open, puts their own changes onto the new version, which keeps the hit points you set, and asks them to confirm before saving; where you both changed the same thing, they choose which to keep. The same goes the other way when you are editing a sheet the player changes, including one opened with **Edit Character Sheet** from the roster's right-click menu.

**What each system offers.** The rolls on the menu depend on your campaign's game system, because not every system has something meaningful to compute from a stat block:

| System | Stat-block rolls |
|---|---|
| D&D 5e | Full — abilities, saves, skills and combat, with bonuses derived from ability scores and Challenge Rating |
| Pathfinder 2e | Full — using the modifiers printed on the stat block, with Fortitude/Reflex/Will saves |
| Call of Cthulhu 7e | Custom Roll only — a percentile system has no d20 rolls to offer |
| Shadowrun 6e | Custom Roll only — a dice-pool system has no d20 rolls to offer |

If a token doesn't have a stat block, or you're running one of the systems above that offers none, there's a custom roll box at the bottom of the picker — type any valid dice expression (e.g. `3d8+2`) and an optional label, then click **Roll**. The result appears in the **Dice** panel for everyone, with the token's name as context (e.g. *"Goblin: Scimitar Damage = 5"*); an obscured or hidden token, or one on the spirit layer, is named *Unknown creature* there, since the Dice panel reaches players who are not sent it.

*Screenshot pending — NPC roll picker with stat-block-derived options.*

### Roll History

The **Dice** tab keeps the rolls made in your campaign in a scrolling list, oldest at the top and newest at the bottom. It's stored on the server, so it survives a refresh, a navigation away and back, and a dropped connection — yours and your players'. Come back the next evening and last session's rolls are still there. Initiative rolls are the exception: their entries in the list are not stored and are gone after a reload.

**What each person sees.** Players see the open rolls plus their own secret ones. You see everything, including your players' secret rolls, marked as such — the same oversight you have live. That filtering happens on the server, so a player reloading the page never picks up a roll they weren't meant to see.

**Personal notes are the exception.** The **Notes** tab gives every member their own Markdown notes for the campaign, and those you cannot see — not through the interface, and not by any request the app will answer. It is the one place a player has that you have no window into, deliberately: unlike a secret roll, nothing about a player's private planning needs settling by you. You get the same tab for your own notes, equally private from them.

Your players are told this plainly now. The secret-roll checkbox used to read "only you can see", which was not true and set an expectation you could not keep; it reads "hidden from other players" instead, and the confirmation says your DM can still see it. Nobody is going to be surprised later that you were watching.

**Clearing it.** Only you can, using the trash icon on the Dice panel. It empties the panel for everyone and stays empty when they reload. The rolls aren't destroyed — they're hidden from the panel from that point on, so a dispute about what someone rolled an hour ago is still settleable from the database. Ending a session does *not* clear history; if you want a clean slate, clear it yourself.

> **One exception.** While a session is **paused**, players' rolls are worked out in their own browser and never sent to the server — that's deliberate, so a paused table can still fiddle with dice without it counting. Those rolls aren't in the history and won't survive a refresh.

### Managing Token Visibility

Some tokens shouldn't be visible to players until the right moment. A token on the spirit layer is seen only by players in the spirit realm (see [The Spirit Layer](#the-spirit-layer)).

To hide a token from players entirely, right-click it on the map and choose **Hide from Players**, open **Edit Token** and choose the same, or click the eye beside it in the Token Roster. All three work for any token, whether it is a character, a creature or an object. A creature or an object can also be placed already hidden: tick **Hidden from players on placement** in the Token Manager, which is how you stage a monster in a room before the table knows it is there. A hidden token is never sent to players at all, so it cannot be found by pointing at its square or by reading the page, and it stops lending its sight to any player view or preview. **Show to Players** (**Reveal to Players** on the right-click menu) puts it back.

### Obscuring a Token's Identity

Sometimes the table should see that something is there without knowing what: a creature the party has not identified, a shape in the dark, an ally in disguise. Right-click the token and choose **Obscure Identity**, or use the same switch in **Edit Token**, the Token Roster or the Token Manager. Players who do not control the token then see a plain grey shape with a question mark where it stands, the hover card calls it an unknown creature, and so does its row in the initiative tracker. Its name, picture, conditions, hit points, disposition, facing, who controls it and what kind of token it is are not sent to their browsers at all, so nothing can be read from the page either. You keep seeing the token as it is, with a small **?** badge as a reminder, and **Preview Player View** shows you the shape the table sees. Rolls you make for it from its stat block, and its initiative roll, appear in the dice log as *Unknown creature*; the roll's label and dice still show, so when the attack's name would give the creature away, use a custom roll with a plain label. A roll a player makes from their character's sheet is headed with the character's name, with the player shown beside it as *(rolled by …)*, so obscuring a player's token hides the token, not the player or their character. **Reveal Identity** puts everything back.

Obscuring is a switch you set by hand. It does not follow the light, since the rules have no half-seen state between dim light (a creature is lightly obscured) and darkness (heavily obscured), and a player's own token is never obscured to them.

---

## The Creature Library

The Creature Library is your DM-side catalog of creature templates — stat blocks, images, and metadata ready to drag onto the map as NPC tokens.

### Opening the Creature Library

Click **Creature Library** (the skull icon) in the campaign header's DM toolbar to open the Creature Library panel. The toolbar's buttons are icons; point at one to see its name. The library shows all available creature templates: both **SRD creatures** (imported from Open5e) and **custom creatures** you've created for this campaign.

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
- **Source filter** — **SRD (Official)** for imported creatures, or **Custom / Homebrew** for your own
- **Challenge Rating filter** — Narrow down by CR
- **Game system filter** — Defaults to your campaign's own system, so a Call of Cthulhu table isn't scrolling past 300 D&D monsters. Switch it to **All game systems** to browse everything — useful when you want to adapt a stat block from another system. Creatures saved without a system recorded always appear, whichever way this is set
- **Pagination** — Results load in pages; scroll down and click **Load More** to fetch additional creatures

> **Library looks empty in a non-D&D campaign?** Only D&D 5e ships SRD content, and the library defaults to your campaign's system. The empty state offers a one-click switch to **All game systems**.

### Favorites

Star your most-used creatures for quick access. Click the **star icon** next to any creature in the library to favorite it. Favorites are stored **per-campaign, per-user** — your favorites in one campaign don't affect another.

Favorites appear in a collapsible **"Favorites"** section at the top of the Creature Library panel, above the main creature list. Expand it to see all your starred creatures with one click.

> **Note:** Favorites are per campaign — starring a creature in Campaign A does not star it in Campaign B.

### Placing Creatures on the Map

Click any creature in the library to expand its details, then click **Place on Map**. A new NPC token is created in the middle of the current map with:

- The creature's name
- Its stat block (viewable and editable in the quick editor)
- Its hit points, taken from the stat block's **HP Max** (creatures with no HP recorded start at 10 — adjust in the quick editor)
- Its HP bar **shown to players**; untick **Show HP bar to players** in Edit Token to keep its hit points secret
- Its image (if one has been associated)
- Default disposition from the template (hostile, friendly, or neutral)
- Display mode from the template (pog, top-down, or full-art)

### Creating Custom Creatures

Click **Create Custom** at the top of the Creature Library to create a custom creature template. Fill in:

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

Custom creatures are scoped to your campaign and fully editable. **Delete** on a custom creature asks first, naming it; tokens already on a map keep their own copy of its stats.

A stat block can hold up to 64 KB of text in all, about ten times the largest creature in the SRD (the Vampire). That is room for very long homebrew descriptions; a stat block over it is refused when you save it, with a message saying it is too large.

### Saving Throws and Skills

Rather than typing a number for each save and skill, you tick what the creature is
good at and CozyVTT works out the bonus. This applies everywhere a stat block is
edited: the Creature Library, the Token Template editor, and the quick editor on a
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

Click the **pencil icon** (Edit creature) next to any custom creature in the library to open it for editing. You can update any field — name, stat block, saving throws and skills, image, disposition, display mode, and all advanced stats (traits, actions, legendary actions, etc.).

SRD creatures cannot be edited directly. Duplicate them first, then edit the copy.

### Creature Token Images

The **Token Image** field in the creature editor gives you two ways to set a picture:

- **Browse Assets** — opens a grid of the token images already available to you. Use the search box to filter by name, then click one to select it. Click it again to deselect.
- **Upload New** — adds a new image. The upload dialog opens pre-set to a **token** asset scoped to **this campaign**, which is what you usually want: everyone in the campaign can then use it, and it appears in Browse Assets from then on. You can change the type or scope in the dialog if you need to.

The grid only ever shows images you have access to: platform-wide assets, your own personal uploads, and assets belonging to campaigns you're a member of. Uploads are validated by their actual file contents rather than their file extension, so renaming a document to `.png` won't get it through.

*Screenshot pending — Creature editor with the token image picker expanded.*

Whatever you choose here becomes the default image for every token placed from that creature. To change the image on a single token that's already on the map without touching the template, use the quick editor instead — see [Changing a Token's Image](#changing-a-tokens-image).

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

Click **Token Templates** (the stamp icon) in the campaign header. The panel slides open from the left, like the Creature Library.

### Creating a Template

There are two ways to create a template:

1. **From the library** — Click **New Template** and fill in the form: name, image, type (NPC/player/object), disposition, display mode, size, HP, notes, and optional stat block.
2. **From the map** — Right-click any token on the map and select **Save as Template**. This captures the token's current image, type, disposition, display mode, size, HP, notes, and stat block.

**Max HP** is the template's hit points. **Show HP Bar** only decides whether players see them, so a monster can have hit points with its bar hidden. Leave Max HP empty for something that has no hit points, such as a chest.

### Placing Templates on a Map

Expand a template in the library and click **Place on Map** to create a new token from the template on the current map. The token inherits all of the template's properties.

### Editing and Deleting Templates

Expand a template and click the **pencil** (Edit template) to modify its properties, or **Delete** to remove it permanently. Delete asks first, naming the template.

**Save Changes** changes only what you edited. A template saved from a wounded token keeps its current hit points when you rename it, and changing Max HP keeps a full template full. Changing an NPC template to another type removes its stat block.

For **NPC-type templates**, the edit form includes the full stat block editor — AC, ability scores, saves, skills, traits, actions, bonus actions, reactions, and legendary actions — so you can build a complete monster once and reuse it across maps and campaigns. Saves and skills work exactly as they do in the Creature Library: tick what the creature is proficient in and the bonus is derived from its ability scores and Challenge Rating (see [Saving Throws and Skills](#saving-throws-and-skills)). The right-click NPC roll picker (see [Rolling for NPC Tokens](#rolling-for-npc-tokens)) reads from the same stat block, so a template with a well-filled-in action list gets clickable attack and damage rolls automatically.

### Copying Templates to Another Campaign

If you DM multiple campaigns, you can copy a template from one campaign to another. Expand the template, click **Copy**, and pick the target campaign from the list. You must have the DM role in both campaigns.

---

## Campaign Export & Import

Export your campaign as a portable `.cozyvtt` archive and import it on another CozyVTT instance — or use it as a backup.

### Exporting a Campaign

1. Open the campaign and click **Campaign Settings** (the gear icon)
2. In the **General** tab, scroll to the **Export Campaign** section
3. Optionally toggle **Include audio assets** (off by default to reduce file size). It adds the sound your atmosphere plays: the track of each time-of-day period and the ambient track
4. Click **Export Campaign**
5. In Chrome and Edge, choose where to save the file; the archive is written there as it arrives. Other browsers download it as they would any file, and save it once it has all arrived

A large campaign takes as long to export as your connection needs; nothing gives up after a set time. Choose where to save within a minute or so: on a large campaign the server stops sending if nothing takes the file for longer than that.

**Size limit.** A campaign archive can hold up to **500 MB** of pictures, sound and campaign data, which is the most an import accepts. If the campaign's files add up to more, **Export Campaign** says how large they are instead of making an archive no server could import. If leaving out audio would bring it under the limit, the message says so; otherwise remove maps or pictures the campaign no longer uses and export again. Each person can export 20 campaigns an hour, one at a time.

**What's included:**
- All maps (images, grid settings, wall segments, fog, lighting)
- All tokens placed on maps
- Custom creatures and their stat blocks
- Token templates
- All associated asset files (map images, token images) that you can open yourself. A picture that has been deleted, or that someone uploaded to their own library and who has since left the campaign, is left out: the map or token that used it arrives without a picture, with everything else intact. Such a map shows "This map has no picture" until you choose one in **Edit Map**; a token without one is drawn as a plain marker until you choose one in **Edit Token**
- Campaign settings (name, description, game system, vibe settings, spirit layer)
- With **Include audio assets** ticked, the sound files the atmosphere uses, so each period and the ambient track play again in the imported campaign. Without it, the imported campaign's periods and ambient sound have no track, the import window says which, and you can choose new ones in the Atmosphere panel

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

An archive can be up to **500 MB**. Anyone with an account can import one, players included, and becomes the new campaign's DM. Each person can preview 20 archives and import 20 campaigns an hour, one at a time. If the import window says the archive is larger than the server accepts, the web proxy in front of the server has a lower size limit than CozyVTT's; whoever runs the server can raise it as the deployment guide describes.

The imported campaign is created fresh with new IDs — it does not interfere with any existing campaigns. You become the DM automatically.

**What comes back as it was, what is shortened, and what is left out.** Everything in the archive is held to what CozyVTT itself can store, so whatever arrives can be opened, edited and saved again. When the import finishes, its window lists anything it had to change under **Changed to fit**, and anything it could not bring in under **Left out**, each with the reason. The map count it shows is the maps it made.

- **Kept as it was:** everything a campaign made in CozyVTT holds, up to the limits the app itself has: maps up to 500 by 500 squares with any grid size from 10 to 500, up to 1,000 tokens, 5,000 walls and doors and 200 lights on each map, and their fog. The Map Library lists the maps in the order the original did, and the campaign opens on the oldest.
- **Shortened:** a map name over 200 characters, a token name over 200 characters, token notes over 5,000 characters, and text or lists in a stat block longer than the creature editor allows (an action's description over 5,000 characters, say, or more than 50 actions). Older versions of CozyVTT stored some of these at any length, and an imported creature that kept them could not be placed on a map or saved.
- **Game system:** a campaign or creature whose game system this server does not know, from a hand-edited archive for example, is imported with none.
- **Moved:** a token that is not on a whole square, or that hangs off the edge of its map, is put on the nearest whole square inside it.
- **Left out on its own:** a token, wall, door or light that CozyVTT cannot store (a token with no position, for example), a wall or light more than 500 squares outside its map, and any tokens past the first 1,000 on a map. The rest of the map is imported. A stat block that cannot be stored even when shortened is left off its token or template, which are kept; a creature, which needs one, is left out.
- **Left out whole:** a map larger than the map limits (more than 500 squares on a side, a grid size outside 10 to 500, or more than 100 feet per square). Make the map smaller on the server it came from, export again and import that.
- **Pictures and sound** that are missing from the archive, larger than an upload of their kind may be, or not a format the upload window accepts, are left out, and whatever used them arrives without them.

An import either brings in the whole campaign or nothing at all. If it stops part-way, because the archive turns out to be damaged or the server runs into a problem of its own, no half-made campaign is left in your list and none of its pictures are left on the server. The window says what went wrong; when the problem was the server's, it says so and whoever runs the server can find the details in its log. Try again once that is sorted out.

### Security Notes

Imported archives are validated at multiple levels:
- File paths are sanitized to prevent directory traversal
- Each file inside the archive is unpacked a piece at a time and stopped as soon as it passes its limit, so a small archive that would unpack to gigabytes (a "zip bomb") is refused without harm. The limits are 10 MB for each of the campaign's data files, the upload limit of its kind for each picture or sound file (50 MB for a map picture unless your server's admin has changed it), and 500 MB for the whole archive. A picture or sound file over its limit is left out of the import; anything else over a limit stops the import with a message saying which
- An archive listing more than 1,000 files is refused before it is opened
- Each picture and sound file must be, by its content, a format the upload window accepts for its kind (a map picture is PNG, JPEG or WebP; a token picture PNG, JPEG, WebP or GIF; a sound file MP3, Ogg or WAV), and is stored as what it really is, whatever the archive calls it. Anything else is left out of the import
- All JSON data is validated against strict schemas with size limits, the same ones the app applies when you make or edit a map, token, creature or template. Data nested more than 32 levels deep, far deeper than any export, leaves out the map holding it, or stops the import when it is in the campaign's own settings
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

**It takes effect at once**, even if they are in the session at that moment.
They stop being able to chat, roll or move anything, and stop seeing what the
rest of the table is doing, without waiting for them to close the page.

**Their characters leave with them.** Each of their characters is taken out of
the campaign: it stays theirs, but you and the other players can no longer open
or edit its sheet, and nothing they change on it reaches your table except its
picture. A token on the map that was bound to one of those characters stays
where it is, still shows the character's picture, and follows it if they change it.

Two people cannot be removed: whoever is currently the DM, and whoever owns the
campaign. If you were handed the DM seat by the owner, they stay at the table as
a player and you cannot remove them. Hand the seat back if you want to step away
(see [Handing the game to someone else](#handing-the-game-to-someone-else)).

### Character Assignment

Players assign their own characters to your campaign when they accept an invitation. If a player needs to swap characters (e.g., death, retirement, trying a new one), they can reassign from their Characters page, or you can coordinate with them.

### Sharing Rulebooks and Handouts

The **Campaign documents** button (the book icon to the right of the DM toolbar) opens the documents shared with this campaign. Every member sees it; what the DM sees in addition is the means to change it.

**Three ways to put a document in front of the table:**

- **Share existing** — pick one of your own documents, or a global one, from the list. It stays yours; sharing does not copy it, and if you edit it later the table reads the new version. Documents other people have shared with campaigns you play in are not on this list: reading one there does not make it yours to pass on.
- **Upload** — upload a PDF, text or Markdown file straight into the campaign. It belongs to the campaign from the start, so members can read it at once with no share step.
- **Write** — write a text or Markdown document on the spot, for a handout or the session's notes. Same as Upload: the campaign's own, readable immediately.

**Stop sharing** removes a shared document from the campaign and leaves the document itself untouched. The campaign's own documents (uploaded or written from here) have no share to remove. The bin button beside one deletes it, for everyone and for good, after asking; if something still uses the document, a second window says where and removes it only if you choose **Delete anyway**. It is also how to remove a document whose uploader has since deleted their account; such a document is listed as shared by "a deleted account".

A player sees the shared list and can read and open everything on it, and nothing else. They cannot share, unshare, or edit a document that is not theirs, and the server refuses those regardless of what the page offers.

**Keeping notes current.** Text and Markdown documents can be edited in place: open one and press **Edit**. This is the natural home for a running session log or a set of house rules that change as the campaign goes on, since the table always reads the latest text and you never re-upload. See [Documents](USER_GUIDE.md#documents) in the user guide for formats, sizes and what is and is not allowed.

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

> Sizes use the map's **feet per square** setting (**Grid Scale** in Edit Map), which defaults to 5 ft. If your templates look twice or half the size you expect, check that value first.

### Starting a Session

When your players are ready, click **Start Session** in the right sidebar's **Session** tab. This:

- Changes the campaign status to **Live** (green indicator in the header)
- Lets players move their tokens again if the last session had ended (a paused session is continued with **Resume Session**, below)
- Logs a system message in chat announcing the session has started

*GIF pending — Starting a session and seeing the status change.*

### Pausing a Session

Need a break? Click **Pause Session**. This:

- Changes the campaign status to **Paused**
- Disables token movement for players
- Shows players a banner above the map: *Session is paused. Token movement is disabled, and your dice rolls stay on your own screen.*

*Screenshot pending — Paused session indicator from player view.*

Click **Resume Session** when you're ready to continue. Anything you change on the map during the break, such as tokens you hide, move or add, or a map you switch to, stays as you left it: the snapshot pausing takes is a record of where the break began, not something the app puts back.

### Ending a Session

Click **End Session** when the adventure is done for the night. The campaign becomes **Inactive**, so players cannot move tokens until you start the next session. Nothing needs saving: token positions, fog, walls, lights, chat and the dice history are stored as you play, and a snapshot of the current map's tokens, the vibe and the spirit layer is kept with the session record as a note of where the night ended; nothing is ever restored from it. An initiative order is not part of that; it lasts only while the server is running, so end combat before you finish if you want a clean slate.

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

As the DM, chat works the same as it does for players — type and hit Enter to send. Dice have their own **Dice** tab, where anyone can tick **Secret Roll** before rolling. A secret roll of yours is seen by you alone: players receive nothing, not even a notice that you rolled. A player's secret roll is hidden from the other players and shown to you, marked as secret.

This is perfect for behind-the-screen perception checks, wandering monster rolls, and dramatic reveals.

*Screenshot pending — Secret dice roll option.*

### The Vibe Tracker

The **Vibe Tracker**, in the **Session** tab of the right sidebar, sets the time of day for the scene. A new campaign has four periods, dawn, day, dusk and night; click one to switch. Each period tints the whole map for everyone with its own colour filter, fading over a few seconds, and its name shows in the header. The gear beside the tracker opens the period editor, where you can rename periods, add or remove them, and set each one's colour and filter with sliders. Each period can also carry an **audio track**, picked from the same set the Atmosphere panel plays: switching to that period starts the track looping for everyone at the table, and switching to a period without one silences the table. If the tracker has been switched off for the campaign, the panel says so in place of the periods, and saving the period editor turns it back on.

Switching the period as the story moves on, from a bright afternoon to a cold night on the road, sets the mood before you say a word.

*GIF pending — DM changing the vibe and player view updating.*

---

## Combat and Initiative

### Starting the Initiative Tracker

The **Initiative** tab in the right sidebar is always there, for you and your players. Add the combatants (below), roll or set their initiative, then click **Start Combat**: round one begins with the first combatant in the order. Players see each combatant in their own tracker as you add it, apart from creatures you have hidden, ones on a map you have not switched to, and ones on the other plane from the player (see [The Spirit Layer](#the-spirit-layer)).

*Screenshot pending — Initiative tracker with active combat.*

### Adding Combatants

Combatants are the tokens already on your map — you don't type names in by hand. There are two ways to add one:

- Click **Add Combatant** in the Initiative tab and pick a token from the list. It lists only tokens players can see, so add a hidden creature the second way.
- Right-click a token on the map and choose **Add to Initiative**.

Each combatant shows its token's name, portrait and HP, and follows the token: change any of them on the token and every tracker updates. A player sees a creature's HP there only when its **Show HP bar** is on or they control the token (a character's token carries no HP of its own, so a player's own hit points stay on the sheet and roster card), and never sees a hidden creature listed at all, nor one standing on a map you have not switched to, nor one on the other plane from them, so an ambusher you add to the order before revealing it stays your secret; rolling its initiative shows in your Dice panel alone. A creature that is merely out of a player's sight, in the dark or under fog, is still listed, so hide a token to keep it out of the order. A combatant joins with its token's details but **not an initiative value** — a combatant joins the order showing **—** until something rolls for it. Joining the fight and having a place in it are separate steps, so a token added to tonight's fight never arrives carrying last week's result. Set a value by clicking the dash beside a combatant, or use the dice button on the row to roll one.

**Players can roll their own.** Once you've added a player's token, a dice button appears for them too — but only on their own row, and only for a token they control. They can also right-click their token on the map and pick **Roll Initiative** from the **Roll...** menu. Either way it lands in your turn order and the roll shows in the **Dice** panel. They can only roll before you click **Start Combat**; once combat has started, the option is gone for them and the server refuses it, so only you can change their initiative.

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

Change a creature's hit points on its token, in **Edit Token** or the quick editor, and the tracker follows: everyone who is allowed to see that creature's HP sees the new value at once. The same goes for its name and portrait, and for hiding it, which takes it out of the players' trackers until you reveal it again.

### Removing Combatants

Click the remove button next to any combatant to pull them from the tracker (when they flee, are defeated, or the situation changes).

### Ending Combat

Click **End combat** (the circled ✕ beside **Next Turn**) and confirm with **End Combat**. The order is cleared for everyone; the initiative values stay on the tokens, and the next fight starts from an empty order as you add combatants to it.

---

## Fog of War

Fog of war covers your map and lets you reveal it a piece at a time, so players discover a dungeon room by room instead of seeing the whole floor plan at once. You control it by hand — nothing is revealed until you say so.

**Under fog, players see nothing at all**: not the map artwork, not the tokens standing there, not the walls, doors or light glows. The one exception is a player's own token, which is always drawn wherever it stands. You see fogged areas as a translucent tint instead, so you can keep working under it.

> 💡 **Fog of war and dynamic lighting are two different things.** Fog is manual: you decide what has been revealed, and it stays revealed. Dynamic lighting (the next section) is automatic and depends on where each character is standing and what walls block their view. You can use either on its own, or both together.

### Turning Fog On or Off

Fog is a per-map setting, and **a new map starts with it off**. Tick **Fog of war on this map** at the top of the **Fog of War** panel, or the **Fog of War** box in **Edit Map**, to turn it on; the map is fully covered until you reveal something. Untick it to switch fog off for that map: players see the whole map at once (dynamic lighting, if on, still applies). What you had revealed is kept, so turning fog back on shows the same areas as before.

Maps made before this setting existed have fog on, exactly as they always did.

### Revealing and Hiding

Open the **Fog of War** panel, one of the DM tool panels stacked at the top right of the map (each starts folded; click its title to open it, and drag the bar above them to move the stack), then pick a mode:

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

The panel's **Reveal all** and **Hide all** buttons apply to the entire map. Both ask for a second click (**Confirm?**), since they are hard to undo by hand — **Hide all** is the quick way to reset a map you have finished exploring, ready for next time.

### Fog and Tokens

A token standing in an unrevealed area is hidden from players entirely, even if the token itself is set to visible. That is what makes fog useful for staging: you can place a room full of monsters in advance and your players will not see them until you reveal the square they are standing in.

**Entirely** means the details panel too. Pointing at an unrevealed square tells a player nothing — no name, no picture, no hit points, no conditions. A player's own token is the one exception, and is always shown to them wherever it stands.

Worth knowing what fog does *not* do: it hides tokens from view, but the map still sends them to the player's browser, because revealing a square has to be instant. A token you want kept secret from a determined player should be set **hidden** rather than merely left in the dark — a hidden token is never sent at all.

---

## Walls & Dynamic Lighting

Walls define the physical boundaries of your map — they block line of sight and control what players can see through dynamic lighting. Dynamic lighting makes every player's view depend on where their character is standing, creating genuine exploration tension.

### The Wall Drawing Tool

Open the **Walls** panel, one of the DM tool panels stacked at the top right of the map. The panel has six tool modes:

- **Draw** — Click to place wall endpoints; click again to extend the polyline; double-click to finish. Each pair of consecutive points creates a wall segment.
- **Select** — Click a wall segment to select it and change its type or delete it. Click an endpoint to select it; drag an endpoint to move it (all connected segments move together). Click **Merge point** to remove a bend point and join two segments into one.
- **Split** — Click on a wall segment to add a midpoint, splitting it into two segments.
- **Erase** — Click and drag to brush-erase wall segments.
- **Polygon** — Click to place corners of a room; click near the starting point to close the shape and create all wall segments at once.
- **Brush** — Paint over the map to trace walls; the brush stroke is automatically simplified into straight wall segments. With **Snap to grid** enabled, segments align perfectly to grid intersections.

Wall types are selected from the **Draw type** buttons in the Walls panel:

| Type | Color | Blocks Vision | Notes |
|------|-------|---------------|-------|
| Wall | Orange (customizable) | Yes | Standard blocking wall |
| Door (Closed) | Purple | Yes | Clickable to open |
| Door (Open) | Green | No | Click to close |
| Door (Locked) | Red | Yes | DM must unlock |
| Window | Blue | No | Transparent to light |

Walls and lights can sit past the edge of the map, up to 500 grid squares beyond it, which is far more room than any drawing or imported map needs. One placed further out than that is refused with a message. Walls already further out, from before version 1.5.1, are kept and still save with the rest; only moving one of them somewhere still that far out is refused.

### Polygon Drawing Mode

The **Polygon** tool lets you draw complex wall shapes by clicking corners:

1. Select **Polygon** mode from the Walls panel
2. Click to place each corner point — a preview line follows your cursor
3. To close the shape, click near your starting point (within the snap radius) — all edges are committed as wall segments in one action
4. Press **Escape** to cancel the polygon without placing any walls
5. Press **Ctrl+Z** to remove the last point while drawing

Polygon mode is great for tracing irregular room shapes without drawing each wall segment individually.

### Brush Drawing Mode

The **Brush** tool lets you paint over the map to quickly trace walls:

1. Select **Brush** mode from the Walls panel
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

1. Select a door or **Window** from the **Draw type** buttons
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

### Selecting and Moving Walls

In **Select** mode you can pick up walls and move them, which is the way to fix
a wall set that does not line up with its artwork.

| To do this | Do that |
|---|---|
| Select one wall | Click it |
| Add or remove one | **Shift**+click |
| Select an area | Drag a box over empty space; anything it touches comes with it |
| Select every wall | **Ctrl+A** (**Cmd+A** on a Mac) |
| Move what is selected | Drag any of it, or nudge with the **arrow keys** |
| Move by a whole square | **Shift** + an arrow key |
| Delete what is selected | **Delete** or **Backspace** |
| Let go | **Escape** once clears the selection, again puts the tool away |

These keys, like **Ctrl+Z** and **Ctrl+Y** below, act on the map only while you
are not typing. In the chat box, a note or any other text box they type as
usual and leave the walls alone.

Changing the wall type applies to everything selected, so a boxful of walls can
become windows at once. **Ctrl+Z** undoes a move or a delete like any other wall
edit, and players see the change straight away without reloading.

> **Lining walls up with a map image.** If a map's walls sit beside the artwork
> instead of on it, usually because the file they came from was cropped, select
> them all and nudge them into place with Shift and the arrow keys.

### Drawing Walls Efficiently

1. **Use the brush with snap-to-grid** — The fastest way to trace dungeon walls
2. **Trace room boundaries first** — Outline major rooms, then add hallways and secondary walls
3. **Use doors sparingly** — Every door is an interactive element players can click; use them for actual openable doors, not decorative arches
4. **Use snap-to-wall for doors/windows** — Much faster than splitting walls manually
5. **Drag endpoints to fine-tune** — Adjust wall positions without redrawing
6. **Select and move** — Pick up a wall, a room's worth, or the lot, and move them together (see above)

> **Tip:** Maps created in tools like Dungeondraft or Dungeon Alchemist can be exported as Universal VTT (.uvtt) files, which include wall data directly — no manual wall drawing needed. Use **Import UVTT** instead.

### Importing a Universal VTT file

**Import UVTT** at the top of the Map Library takes a `.uvtt`, `.dd2vtt` or
`.df2vtt` file and makes a map from it: the picture, the walls, the doors and
any lights, all placed for you. If the file brings lights, the map starts with
dynamic lighting on; otherwise it starts off, like any new map.

**The picture goes into the campaign's library.** Import UVTT files the
map's picture as a **Campaign** asset, so everyone in the campaign can browse it
in the Asset Library as soon as the import finishes, even though the map itself
stays yours until you switch to it. There is no option to import it as
Personal. To keep a surprise map's picture hidden, open it in the Asset Library
straight after importing (it has the map's name), and under **Move to…** choose
**Personal**, then **Move to Personal**. The map keeps its picture, and your
players can see it once you switch to that map. Until you move it, anyone
browsing the library can see it.

**Size limits.** The picture inside the file must be a PNG, JPEG or WebP no larger than the map size limit (50 MB unless your host changed it). It travels inside the file as text, which makes the file about a third bigger than the picture, so the import accepts a file of up to the map limit plus a third plus 8 MB (75 MB at 50 MB). A file over that is refused straight away with a message saying so. A map holds at most 5,000 wall segments, doors included, and 200 lights; a file with more is refused before anything is imported, and if it would fit without its furniture walls the message says so. A file holding more than a million points, doors, lights and settings in all, far more than any map uses even with its furniture walls left in the file, is refused straight away. The map's name can be up to 200 characters. A PDF is not accepted as a map picture, here or anywhere else, since a PDF cannot be drawn on the map. If the file is refused although it is under these limits, the proxy in front of CozyVTT may have a smaller limit (your host can raise it; see *Upload Size Limits* in the Deployment guide).

**One import at a time.** Start the next import once the last one has finished. A second file sent while one is still being read is refused with "Another import is still running", and nothing is lost: send it again. Importing a folder of maps one after another is never slowed down.

**One file is one map.** A Universal VTT holds a single picture, so a dungeon
with several levels comes as one file per level, and each one becomes its own
map in CozyVTT. That is how the format works everywhere, not a CozyVTT limit.

**Furniture walls.** Some tools keep the walls for furniture, pillars and
crates apart from the room walls. They block sight the same way a wall does, so
whether a table should hide what is behind it is your call: when a file has
them, the import asks, and leaving the box unticked means only the architecture
blocks sight.

**If CozyVTT asks "Some walls sit outside this map's picture".** The file
describes walls in places its own picture does not reach. That normally means
the tool that exported it cropped the picture to part of the map but wrote out
the walls for all of it, which is a fault in that tool rather than in the file
you chose or in CozyVTT. Import it and everything inside the picture works
normally; the walls beyond the edge arrive with nothing underneath them, and
they cannot block sight, because sight stops at the edge of the map. If a whole
section of your map is missing its artwork, check whether the tool you exported
from can export that section on its own, or export the map as a PNG instead and
[add it as an ordinary map](#adding-maps-to-your-campaign).

### Exporting a Universal VTT file

The app has no button for this yet. The server can produce a `.uvtt` file for a map, for a script or a tool built on the unsupported HTTP surface (`GET /api/campaigns/{campaignId}/maps/{id}/export-uvtt`, DM only), and importing that file back gives a map that sees and lights the same way, with the limits of the format: a window is written as an open doorway, because the format has no windows and a wall in its place would block sight, so it comes back as an open door; a locked door comes back as an ordinary closed door; and a switched-off light is kept and comes back switched off, though other tools may show it lit. Tokens, fog and the spirit layer are not included.

### Undo / Redo

Wall edits support full undo/redo:
- **Ctrl+Z** (or Cmd+Z) — Undo last wall change
- **Ctrl+Y** / **Ctrl+Shift+Z** — Redo
- The undo/redo buttons are also in the Walls panel

Undo/redo applies to: placing walls, deleting walls, splitting, merging, moving walls and dragging endpoints. Opening or closing a door is not a wall edit and is not undone; click the door again. Nor is anything someone else changes: when a player opens a door, your map shows it at once, and undoing your own last edit leaves it open.

The history belongs to the map it was made on. Switching to another map starts with nothing to undo, so an undo can never put one map's walls onto another.

### Enabling Dynamic Lighting

Dynamic lighting is off on a new map, unless the map was imported from a Universal VTT file that brought lights. To enable it:

1. Open the **Map Library** and click the **pencil** (Edit map) on your map
2. In **Edit Map**, tick **Enable Dynamic Lighting**
3. Click **Save Changes**

Once enabled, players only see the areas their characters have line of sight to, and within that, only what is lit or within their darkvision. The rest of the map is black.

*Screenshot pending — Map settings with Dynamic Lighting checkbox.*

### Global Illumination

**Global Illumination** is a per-map switch, in **Edit Map** and at the top of the **Lights** panel. With it on, everything in a token's line of sight counts as lit, so walls are all that limit what a player sees; lights only add glow. With it off, lights and darkvision decide: a player sees what their tokens' darkvision reaches, plus whatever a light source lights, and the square they stand on.

New maps start with it off. Maps made before it existed have it on, which is exactly how lighting always worked for them, so nothing changes at your table until you untick it. When you do, the Lights panel warns you if there are no lights on the map yet: until you place one, or give the party darkvision, players see almost nothing.

### Explored Areas

On a map with dynamic lighting, the places a player's tokens have seen stay on that player's map, greyed and darkened, until they can see them again. Each player has their own memory of a map, kept on the server, so it survives a reload and a change of device, and it is never used to decide what the server sends them: it only greys in map artwork they already had. The DM view never shows it; use **Preview Player View** to see a player's, either by picking the player or by picking a token they control. The preview keeps up with that memory as it grows, and it adds to it: move a player's token while previewing them and the ground it sees is remembered for that player, whether or not they are connected. Only where a token is put down counts: picking a player's token up and carrying it about shows the player the token moving, but reveals nothing to them and adds nothing to their memory until you put it down, and nothing at all if you put it back.

- **Remember Explored Areas** in **Edit Map** switches it per map. New maps start with it off; maps from before it existed have it on.
- **Reset explored areas** at the bottom of the **Fog of War** panel forgets what every player has seen of the map (it asks for a second click). Their view right now is unchanged; only the grey memory goes.

### Darkvision

Each token has a **Darkvision** value, in grid squares: how far it makes things out with no light at all. **0 means none**, which is what a new token starts with; 12 squares is 60 ft at the usual 5 ft a square, the common darkvision, and the field's hint works the feet out for the map's own scale. It never limits how far a lit thing can be noticed.

Set it in the **Token Manager** when placing a token, or afterwards from **Edit Token** (right-click the token, or the pencil in the Token Roster), which opens for player tokens too. Only you can change it: it decides what the server sends that token's player.

> **Tip:** With no darkvision and no lights nearby, a player sees only the square their token stands on. If that is not what you want for a map, tick **Global Illumination** in the map's settings (see above).

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

A token's **Darkvision** governs how far it makes things out in the dark. It
does not limit how far it can notice something that is lit: a character with
little or no darkvision still sees a bonfire across a field, provided nothing
solid is in the way.

Two practical consequences when you are building a map:

- **A room stays dark until someone can see into it.** If you want a lit room
  visible from the corridor, leave a door or a gap — a sealed room reads as
  darkness, which is usually what you want.
- **Windows are not walls.** A window segment passes light and sight, so a lit
  room behind one *is* visible from outside. That is the tool for "you can see
  the lamp burning through the shutters".

> Maps made before 1.5.0 have **Global Illumination** on, so a lit room is
> visible to everyone with line of sight into it, as it always was. Untick it
> in **Edit Map** to make lights and darkvision decide what a player sees.

#### Placing Lights

1. Open the **Lights** panel among the DM tool panels at the top right of the map
2. Click **Place**, then click on the map to drop a light
3. Choose a **preset** (Candle, Torch, Lamp, Lantern, Campfire) or dial in custom bright and dim radii
4. Pick a color from the palette or enter a custom hex

Players see the result straight away: a creature a new light shows appears on their screens, and one left in the dark when a light is moved, switched off or removed disappears. Opening or closing a door works the same way.

| Preset | Bright (sq) | Dim (sq) | Typical Use |
|--------|-------------|----------|-------------|
| Candle | 1 | 2 | Desk, altar |
| Torch | 4 | 8 | Wall sconce, carried torch |
| Lamp | 3 | 6 | Oil lamp on a table |
| Lantern | 6 | 12 | Hooded lantern |
| Campfire | 8 | 16 | Outdoor fire pit |

#### Editing & Moving Lights

Switch to **Select** mode to click on a light. You can then drag it to reposition, adjust its radii and color, untick **Enabled** to put it out (an extinguished torch), or click **Delete Light**.

> **Tip:** The DM always sees light icons on the map. Toggle **Preview Player View** to see how the bright/dim zones actually look to players; the icons are hidden there, as they are for players.

### Previewing the Player View

As DM you always see all walls, all tokens and the full map. To see what a player is actually seeing:

- Click **Preview Player View** at the bottom-right of the map (it appears when dynamic lighting or fog of war is on), then pick whose eyes to look through in the box beside it: a **player**, a single **token**, or **All player tokens**
- Your canvas switches to that view: the chosen tokens' darkvision, the lights they can see, the doors they can actually see (in their line of sight and lit, within their darkvision, or under Global Illumination), the fog exactly as it is revealed, and the ground that player remembers, kept up to date as their token moves. Tokens that view would not have been sent are not drawn
- Your tool panels stay, so you can place lights and walls while watching the result. The light markers are hidden, as they are for players, so to select or move a light, return to your own view first
- The preview is on the plane that viewer is on: a player whose token you have sent to the spirit layer is previewed in the spirit realm, with the spirit layer image, the spirit tint and only spirit-plane tokens, seeing through their spirit token, exactly as their own screen shows it. So is a single token on the spirit layer (the picker marks those *(spirit)*), and every view while the spirit layer is open to everyone. **All player tokens** stays on the material plane unless the spirit layer is open to everyone
- The preview shows exactly what that viewer is sent, the hover card and a dragged token included: a creature's hit points only once its HP bar is on, and an obscured token as the grey shape. **All player tokens** masks every obscured token, since nobody at a shared screen is its sole controller

**Running the game in person, on one projected screen?** You move every token yourself, so there are no player accounts to preview as. Pick a token to show the table what that character can see, or **All player tokens** for the whole party's view with the monsters' sight left out. Previewing one token also shows what the player who controls it remembers, so you see that character's explored ground as well as what they can see now, and moving the token while you preview it adds to that memory, so a game you run alone still builds up each player's explored ground. **All player tokens** shows none, because it is several people at once and their memories laid over each other would describe nobody.

Click the button again to return to your own view.

### Performance Notes

- **Under 200 wall segments** — The visibility algorithm scans all walls directly. Plenty fast for typical dungeon layouts.
- **Over 200 wall segments** — A spatial grid index activates automatically to prune distant walls from the raycasting calculation. Maps with 500+ segments run at full frame rate.

---

## The Spirit Layer

The Spirit Layer is a second plane for your map — useful for games where some characters can perceive things others can't (astral space in Shadowrun, the ethereal plane in D&D, the spirit world in various systems).

It is a **separate plane, not a see-through overlay.** Someone viewing the spirit realm sees the tokens on that plane *instead of* the ordinary ones, not as well as them. You, as DM, always see both.

### Sending players to the spirit realm

There are two ways a player ends up there:

- **The whole table at once.** Click **Spirit Layer** (the ghost icon) in the campaign header and open the veil with the switch at the top of the panel. Every player is in the spirit realm until you close it again.
- **One player at a time.** Give a player control of a token that lives on the spirit layer. Any player controlling a spirit-layer token on the current map sees the spirit realm; everyone else stays on the material plane.

*Screenshot pending — Spirit Layer control panel.*

Players in the spirit realm see a pulsing **Spirit Realm** badge in the corner of the map, so they know why the view changed.

> **A player in the spirit realm cannot see ordinary tokens — including their own.** That is the point: they have left the material plane. It has one surprising consequence, below.

### The Spirit Layer and dynamic lighting

On a map with **dynamic lighting** switched on, a player sees by their own token's line of sight. A player who is in the spirit realm but has no spirit-layer token has nothing to see with — so the map renders **completely black** for them.

If a player reports a black map, check whether the veil is open in the **Spirit Layer** panel. Either close it, or give that player a spirit-layer token to look through.

### Spirit Layer Styles

The **Spirit Layer** panel offers five looks for the spirit realm:

- **Wispy** — drifting mist, the default
- **Ethereal** — a shimmering silver-teal glow
- **Shadow** — dark and ominous
- **Dream** — shifting violet, for a fey or psychic realm
- **Custom** — your own colour (great for matching your game's lore, e.g., a sickly green necrotic haze), with one of four animations: **Particles**, **Shimmer**, **Shadow** or **Rainbow**

*Screenshot pending — Map with wispy spirit layer overlay.*

*Screenshot pending — Map with custom color spirit layer overlay.*

### Token Visibility in the Spirit Layer

Every token sits on exactly one plane: the material one, or the spirit layer. Moving a token to the spirit layer is what makes it visible to players in the spirit realm — and hides it from everyone still on the material plane. This is how you show astral or spiritual entities only to the characters with the perception to see them.

Choose the plane when you place a player or creature token (**Place on Layer** in the Token Manager; objects always go on the material plane), or move one afterwards with **Send to Spirit Realm** and **Return to Material Plane** in the Token Manager's list or on the token's right-click menu.

*GIF pending — Sending a token to the spirit realm.*

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

**Which tracks you can play.** The panel lists your own audio, anything in the global library, and audio uploaded to this campaign. Audio belonging to a *different* campaign is not offered, even one you play in, because it belongs to that table.

**Vibes carry their own music.** A track picked in the period editor starts whenever you switch to that period. The Atmosphere panel then acts as a live override: stop its track, or let a non-looping one finish, and the vibe's music comes back on its own. Stopping the vibe's own track from the panel silences the table until the next vibe switch. The return after a finished one-shot is sent by your browser, so keep your tab open while one plays.

**What your players can hear.** The sound is not relayed from your computer; each player's browser fetches the track from your CozyVTT instance. So while a track is playing, everyone in the campaign can fetch that one track, including a track from your personal library. Stop it, and it is private to you again. Nothing else in your library is exposed, and no one can browse or list your audio.

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

**Pro tip:** Layer effects purposefully. Spooky dungeon? Set the vibe to night and add mist. Forest ambush? Leaves with suspenseful audio. Magical temple? Sparkles with ethereal music.

---

## Session State and Continuity

CozyVTT remembers your campaign between sessions, so you can pick up exactly where you left off.

### What Gets Saved

Everything is stored as you play, so there is no save step and nothing is lost by closing the page:

- **Token positions**, fog, walls and lights — everyone stays put on the map
- **Chat and dice history** — the full log is there when players rejoin
- **Map selection** — the active map remains active
- **Atmosphere settings** — audio, effects and the vibe are remembered
- **Explored areas** — each player's memory of a lit map

The one exception is an **initiative order**, which lives only while the server is running: a restart or an upgrade forgets it, though the initiative values stay on the tokens.

### Resuming a Session

When you're ready to play again, navigate to the campaign and click **Start Session**. Players will see token positions and map exactly as you left them.

*Screenshot pending — Campaign page loading with preserved state.*

### Multi-Session Campaign Tips

- **Use your Notes tab** to leave yourself reminders about where the party is and what's happening; nobody else can read it. The session notes you write when you end a session are the recap for the table.
- **Update token HP** at session end so it reflects the party's state going into the next session
- **Tidy up old join/leave notices** if your campaign is old enough to have them — the eraser at the top of the chat panel removes those and nothing else (see [The Campaign Roster](#the-campaign-roster)). There's no way to clear the conversation itself, and no need to: old chat doesn't affect gameplay, and you can scroll back through it whenever you want

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
