# CozyVTT User Guide

Welcome to CozyVTT — your cozy, self-hosted virtual tabletop for adventuring with friends. Whether you're rolling dice across a dungeon crawl or weaving stories through the astral plane, CozyVTT keeps everyone at the same table, no matter where they are.

This guide covers everything you need to get started, from the setup wizard to advanced session features.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [The Dashboard](#the-dashboard)
3. [Campaign Management](#campaign-management)
4. [Character Management](#character-management)
5. [The Asset Library](#the-asset-library)
6. [Running Sessions](#running-sessions)
7. [Advanced Features](#advanced-features)
8. [Your Profile](#your-profile)
9. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Getting Started

### First-Time Setup (Admin Only)

When you first navigate to your CozyVTT instance, you'll be greeted by the **Setup Wizard** — a short four-step process that configures the platform before anyone else can log in.

*Screenshot pending — Setup wizard welcome screen.*

**Step 1 — Welcome**
Read the brief intro and click **Next** to begin. The whole process takes about two minutes.

**Step 2 — Admin Account**
Create the administrator account. This is the most powerful account on the platform — keep these credentials safe!

- **Display Name** — What other users will see (2–50 characters)
- **Email** — Your login email address
- **Password** — Must be at least 12 characters with uppercase, lowercase, and at least one number
- A live password strength meter gives you instant feedback as you type

*Screenshot pending — Admin account creation form with password strength indicator.*

**Step 3 — System Configuration**
Give your instance its identity:

- **Instance Name** — Appears in browser tabs and the page title (e.g., "The Hearthstone Tavern")
- **Timezone** — Used for timestamps across the platform; you can auto-detect or pick from a list
- **Public Registration** — Choose whether new users can register themselves. For private groups, leave this **off** and create accounts manually from the Admin Panel

*Screenshot pending — System configuration step.*

**Step 4 — Review**
Double-check everything, then click **Complete Setup**. If anything looks wrong, use the **Back** button to correct it.

Once setup is complete, you'll be logged in as the administrator and taken to your dashboard.

---

### Logging In

Navigate to your CozyVTT URL and enter your email and password. If Multi-Factor Authentication (MFA) is enabled on your account, you'll be prompted for your authenticator code after entering your password.

*GIF pending — Login flow with MFA step.*

**Forgot your password?** Contact your platform administrator — they can generate a temporary password from the Admin Panel.

---

### User Accounts

CozyVTT has two platform-level roles:

| Role | What they can do |
|------|-----------------|
| **Admin** | Manage the entire platform: users, settings, backups, and global assets |
| **User** | Create campaigns (as DM), join campaigns (as player), manage characters |

Your role badge is visible on your profile page.

---

## The Dashboard

After logging in, the **Dashboard** is your home base. From here you can see everything happening across your campaigns at a glance.

*Screenshot pending — Full dashboard view.*

### What's on the Dashboard

**Quick Stats** — A summary row showing how many campaigns you're running, how many you're playing in, and how many are currently active.

**Pending Invitations** — If a DM has invited you to a campaign, a banner appears here. You can accept (and choose which of your characters to bring) or decline.

*Screenshot pending — Pending invitation banner.*

**Your Campaigns** — A grid of campaign cards. Each card shows the campaign name, description, your role (DM or Player), and the current session status. Click any campaign card to jump right in.

*Screenshot pending — Campaign card grid with status indicators.*

**Quick Access** — Cards for your Character Library and Asset Library so you can navigate there in one click.

### Creating a New Campaign

Click the **+ New Campaign** button from the dashboard to open the campaign creation form.

*GIF pending — Creating a new campaign.*

Fill in:
- **Campaign Name** — Required. Keep it evocative!
- **Description** — Optional, but players will see this when they're invited
- **Game System** — What ruleset you'll be playing under

Click **Create Campaign** and you're in. You'll be taken straight to the campaign page.

---

## Campaign Management

### Campaign Page Overview

The campaign page is your command center during play. It's a three-panel layout designed for a desktop screen:

*Screenshot pending — Full campaign page layout with labeled panels.*

- **Left Sidebar** — Campaign info, party roster, and (for DMs) the token roster
- **Center Canvas** — The battle map where tokens live and adventures happen
- **Right Sidebar** — Chat, dice roller, vibe tracker, and initiative tracker

The **header bar** across the top contains navigation, connection status, and DM controls.

---

### Adding Maps

Maps are the battlegrounds, taverns, and dungeons your players will explore. Before a session, upload your map images to the **Asset Library** (see [The Asset Library](#the-asset-library)), then add them to your campaign.

As the DM, click the **Maps** button in the campaign header to open the Map Manager.

*Screenshot pending — Map Manager panel.*

From here you can:
- **Add a map** by selecting an uploaded image from your asset library
- **Switch to a different map** — this updates the view for all connected players immediately
- **Remove a map** from the campaign

*GIF pending — Switching the active map mid-session.*

### Managing Campaign Settings

Click the **Settings** button (gear icon) in the campaign header to open Campaign Settings. Here you can update the campaign name, description, and other properties.

### Managing Your Roster

Players join your campaign by accepting an invitation. Once they're in, they appear in the **Campaign Roster** on the left sidebar. You can see all current members and their characters.

To invite someone:
1. Go to **Campaign Settings**
2. Find the **Invite Players** section
3. Enter the email address of the user on your platform
4. They'll see a pending invitation on their dashboard

---

### Tokens

Tokens represent characters, monsters, NPCs, and objects on the map.

**Placing tokens:** Open the **Token Manager** (Tokens button in the header) to add, configure, and manage all tokens in your campaign. DMs can also place tokens directly from the **Creature Library** (see [DM Guide](DM_GUIDE.md#the-creature-library)).

*Screenshot pending — Token Manager panel.*

Each token has:
- **Name** — Displayed on hover
- **Image** — Choose from your asset library (TOKEN type assets), or leave blank for a colored-letter placeholder
- **Type** — PC, NPC, or Object
- **HP** — Hit points that other players can see update in real time
- **Size** — How many grid squares the token occupies (default 1×1)
- **Display Mode** — **Pog** (circular), **Top-Down** (overhead art), or **Full-Art** (full rectangular image)
- **Disposition** — Hostile (red), Friendly (green), or Neutral (blue) — affects the placeholder color
- **Conditions** — Visual badge indicators for status effects (poisoned, stunned, etc.)
- **Spirit Layer Visibility** — Whether the token appears in the spirit layer view
- **Stat Block** — NPC tokens can carry a stat block with AC, HP, speed, attacks, and abilities

**Colored-letter placeholders:** Tokens without an assigned image display a colored circle with the creature's first initial. The color reflects the token's disposition.

**Moving tokens:** During a session, drag tokens around the map. Everyone connected sees the movement as it happens.

*GIF pending — Dragging a token across the map.*

---

## Character Management

### Your Character Library

The **Characters** page (accessible from the top nav or dashboard) shows all the characters you own across every campaign and game system.

*Screenshot pending — Characters page grid view.*

From here you can:
- **Create a new character**
- **Edit** an existing character
- **Copy** a character (great for variants or backup sheets)
- **Export** a character to JSON (for backups or sharing)
- **Import** a character from a JSON file
- **Assign** a character to a campaign, or **unassign** them if they've hung up their boots
- **Delete** a character (with a confirmation prompt — we know how precious they are)

### Creating a Character

Click **+ New Character** to open the character creation dialog. Choose your **Game System** first — this determines which character sheet you'll fill out.

*Screenshot pending — New character dialog with game system selector.*

After choosing a system, you'll be taken to the **Character Editor**.

### The Character Editor

The Character Editor is where you fill in every detail about your character — stats, skills, equipment, backstory, the works. What you see here depends on your game system.

*Screenshot pending — Character editor with D&D 5e sheet open.*

Click **Save** (or use the keyboard shortcut) to save your progress. A timestamp in the header shows when your character was last saved. An unsaved changes indicator appears if you've made changes you haven't saved yet — don't close the tab without saving!

You can also **Export to JSON** from the editor header at any time to grab a backup copy.

### Assigning a Character to a Campaign

Characters need to be assigned to a campaign before they show up in that campaign's roster. From the Characters page, click the **Assign** option on any character card and pick the campaign.

*GIF pending — Assigning a character to a campaign.*

Once assigned, that character becomes available as a token in the campaign, and the DM can see them in the campaign roster.

---

### Character Sheets by Game System

CozyVTT includes sheets for several popular game systems. Here's a quick overview of what each one covers:

#### Dungeons & Dragons 5th Edition

The classic. Covers all the D&D 5e essentials:

- Ability scores and modifiers
- Skills with proficiency tracking
- Hit points, armor class, and saving throws
- Spells, spell slots, and spellcasting stats
- Equipment, weapons, and inventory
- Features, traits, and background info

*Screenshot pending — D&D 5e character sheet.*

#### Pathfinder 2nd Edition

The action-economy tactician's dream:

- Attributes (STR, DEX, CON, INT, WIS, CHA) with ancestry, class, and item bonuses
- Skills with trained/expert/master/legendary proficiencies
- Class features, feats, and focus points
- Spells and spell slots
- Inventory with bulk tracking
- Ancestry, background, and heritage

*Screenshot pending — Pathfinder 2e character sheet.*

#### Call of Cthulhu 7th Edition

For when the vibes turn from cozy to eldritch:

- Characteristics (STR, CON, SIZ, DEX, APP, INT, POW, EDU, LCK)
- Derived stats: HP, Sanity, Magic Points, Movement Rate
- Skills with base values and advancement tracking
- Weapons and attacks
- Backstory, personal description, and ideals
- Possessions and important people

*Screenshot pending — Call of Cthulhu 7e character sheet.*

#### Shadowrun 6th Edition

Street magic meets corporate dystopia:

> **Note:** Shadowrun 6e support is on the roadmap for a future release. Stay tuned!

#### Flexible System

Running a homebrew game or a system that doesn't have a dedicated sheet? The **Flexible** sheet is a customizable, free-form character sheet where you define your own fields and sections. Perfect for rules-light games, narrative systems, or anything in between.

*Screenshot pending — Flexible character sheet.*

---

## The Asset Library

The Asset Library is where all your campaign media lives — maps, token images, ambient audio, and avatar images.

*Screenshot pending — Asset Library grid view.*

### Asset Types

| Type | What it's for |
|------|--------------|
| **Map** | Battle maps, dungeon layouts, world maps |
| **Token** | Character portraits, monster icons, object images |
| **Audio** | Ambient soundscapes, background music |
| **Avatar** | Your personal profile picture |

### Uploading Assets

Click the **Upload** button to add a new asset. You'll choose:
- The file to upload
- A name for the asset
- The **scope** — where this asset lives:
  - **Personal** — Only you can see and use it
  - **Campaign** — Shared with everyone in a specific campaign
  - **Global** — Available platform-wide (Admin/Global Asset Manager only)
- Optional tags for easy filtering later

*GIF pending — Uploading a new map asset.*

### Finding Assets

Use the **search bar** to find assets by name or tag. Filter by scope (Global, Personal, Campaign), type (Maps, Tokens, Audio, Avatars), and sort by date or name. Click a tag chip to filter to just assets with that tag.

### Viewing and Managing Assets

Click any asset card to open its **detail panel** on the right. From there you can see full metadata, edit tags, or delete the asset.

*Screenshot pending — Asset detail panel.*

---

## Running Sessions

This section is primarily for players during an active session. For DM-specific features, see the [DM Guide](DM_GUIDE.md).

### Joining a Session

Navigate to your campaign from the dashboard and connect to the session. If the DM has started a session, you'll see a live status indicator in the header.

*GIF pending — Connecting to an active session.*

The campaign page automatically reconnects if you lose your internet connection briefly — your position is restored when you come back.

### The Chat Panel

The **Chat** panel on the right sidebar is how everyone communicates during a session.

*Screenshot pending — Chat panel with example messages.*

Type your message in the input field and press **Enter** to send. Messages show your display name and a timestamp. System messages (like session start/stop events) appear in a different style.

### Rolling Dice

The **Dice Roller** is right below chat. Click a die face to roll it, or type a custom expression.

*GIF pending — Rolling dice and seeing result in chat.*

**Supported dice notation:**
- `d20` — Roll a single d20
- `2d6` — Roll two d6s and sum them
- `4d6kh3` — Roll four d6s and keep the highest three (great for ability score generation!)
- `1d20+5` — Roll a d20 and add 5
- `2d6-1` — Roll 2d6 and subtract 1

Dice results are posted to chat so everyone can see them. DMs can also roll **secretly** — the result is only visible to them.

### Moving Your Token

When the DM has placed your character's token on the map and the session is live, you can **drag it** to move around. Just click and drag to your destination.

*GIF pending — Moving a player token.*

Token movement is broadcast to everyone in real time — your party can watch you walk into that very suspicious hallway.

> **Note:** Token movement is disabled when the session is paused.

### The Vibe Tracker

The **Vibe Tracker** is a mood indicator that the DM sets to communicate the current atmosphere of the scene. It might say things like "Cozy," "Tense," "Mysterious," or "Triumphant."

Keep an eye on it — it's your DM's way of setting the tone without breaking the narrative.

*Screenshot pending — Vibe tracker showing different states.*

### The Initiative Tracker

When combat starts, the **Initiative Tracker** appears (or is revealed by the DM) on the right sidebar. It shows the current turn order, who's active, and HP for each combatant.

*Screenshot pending — Initiative tracker panel during combat.*

During your turn, you'll see your name highlighted. Use your token to move and the chat to narrate your actions!

---

## Advanced Features

### Session State Saving

CozyVTT automatically saves session state — token positions, chat history, and initiative order are preserved between sessions. When you come back, everything is right where you left it.

The DM can also manually trigger a save or end the session, which locks in the current state.

### Multi-Map Support

A campaign can have multiple maps loaded at once. The DM can switch the active map at any time, and all players are taken to the new map immediately. Great for transitions between locations without stopping the action.

*GIF pending — DM switching maps mid-session.*

### The Spirit Layer

The Spirit Layer is a special visual overlay primarily used for Shadowrun and similar games where some characters can perceive things others can't. The DM can toggle the spirit layer on or off per-token, and choose the visual style.

*Screenshot pending — Map with spirit layer overlay.*

### Ambient Atmosphere

DMs can set ambient audio tracks and visual atmosphere effects from the Atmosphere panel. Six visual overlays are available — rain, mist, leaves, sparkles, snow, and wind. Players hear the audio and see the visual effects automatically when connected to an active session.

*Screenshot pending — Atmosphere controls panel.*

### Dynamic Lighting

When a DM enables dynamic lighting on a map, players only see what their token can. Light sources placed by the DM have two radii:

- **Bright radius** — full visibility, strong glow (e.g. the inner 20 ft of a torch)
- **Dim radius** — reduced visibility with a fainter glow (e.g. the outer 20 ft of a torch)

Where two dim light zones overlap, the area is treated as bright light. This matches the light rules in D&D 5e, Pathfinder 2e, and most other TTRPG systems.

*Screenshot pending — Map with dynamic lighting and bright/dim zones.*

### Appearance & Theming

CozyVTT theming works in two layers:

**Per-user (every account)** — From your **Profile** page you pick the theme and font *you* want to see when you're logged in. Your choice is saved to your account and persists across logout/login. See the [Your Profile → Themes](#themes--fonts) section below.

**Instance default (admin only)** — Platform administrators set the default theme used on the login page and applied to brand-new users until they pick their own. Configured under **Admin Panel → Appearance**:

- **Default theme** — 16 built-in themes spanning warm, cool, dark, neutral, and vibrant palettes
- **Default font** — 8 open-source font families (Quicksand + Inter default, plus medieval, elegant, handwritten, etc.)
- **Custom theme builder** — primary, accent, background, and text colors; complementary shades derived automatically
- **Custom branding** — logo, mascot, and favicon shown on the login page and across the instance (always system-wide regardless of user theme)

Changes preview live as you configure them.

---

## Your Profile

Click your display name or avatar in the top navigation to reach your **Profile** page.

*Screenshot pending — Profile page.*

### Updating Your Profile

Click **Edit** next to your display name or bio to change them. Click **Save** when you're done.

**Uploading an Avatar:**
Click on your current avatar (or the placeholder) to open the avatar uploader. Choose an image file, then use the crop tool to frame it perfectly. The zoom slider lets you dial in exactly the right framing. Click **Upload** to save.

*GIF pending — Avatar crop and upload flow.*

### Changing Your Password

In the **Security** section, enter your current password and your new password (twice, to confirm), then click **Save**.

### Multi-Factor Authentication (MFA)

For extra account security, enable **MFA** in the Security section. You'll use an authenticator app (like Google Authenticator, Authy, or 1Password) to scan a QR code. After that, every login will ask for a one-time code.

You'll also receive a set of **backup codes** when you set up MFA — store these somewhere safe. They're your lifeline if you lose access to your authenticator app.

### Themes & Fonts

From the **Themes** section of your profile, pick the color theme and font *you* want to see across the app:

- Browse 16 built-in themes across light, warm, cool, dark, neutral, and vibrant categories
- Pick from 8 open-source font families
- Or click **Custom** to dial in your own primary / accent / background / text colors

Your choice is saved to your account and applies immediately. It also persists across logout — when you log back in, your theme is restored. Unauthenticated visitors and brand-new users see whatever theme the platform admin has set as the instance default.

### Signing Out

Click **Sign Out** in the Danger Zone section (or from the header menu) to log out.

---

## Troubleshooting & FAQ

### I can't connect to my campaign

- Check that you have an active internet connection
- Make sure the DM has started a session (you'll see a "Live" indicator in the header when a session is active)
- Try refreshing the page — CozyVTT will reconnect automatically
- If the problem persists, check with your platform administrator that the server is running

### My token disappeared from the map

Token placement is managed by the DM. If your token isn't on the map, ask your DM to place it. Character assignment to a campaign must happen before a token can be placed.

### I can't see the maps or my character sheet is blank

This is usually a loading issue. Refresh the page. If the problem persists, check the Asset Library to make sure the map image was uploaded correctly.

### I lost connection mid-session

CozyVTT will automatically try to reconnect if you lose connection briefly. Your session state (token positions, chat, etc.) is preserved. If reconnection fails, refresh the page — everything should be right where you left it.

### Someone else is editing my character

Only you (the character owner) and the DM of an assigned campaign can edit a character. If you think someone else has access they shouldn't, contact your platform administrator.

### My dice rolls aren't showing in chat

Make sure the session is active (you see the "Live" indicator). Dice rolls require an active WebSocket connection to the campaign. If you're not in the campaign page, navigate there first.

### How do I change my email address?

Email addresses cannot be changed by users directly. Contact your platform administrator — they can update it from the Admin Panel.

### How do I delete my account?

Go to your **Profile** page and scroll to the **Danger Zone** section. Click **Delete Account**, type `DELETE` to confirm, and enter your password. This is permanent and will remove all your campaigns, characters, and messages.

> **Warning:** If you're a DM running active campaigns, deleting your account will also remove those campaigns for all players. Make sure to hand off or wrap up campaigns before deleting.

### I forgot my password

Contact your platform administrator. They can reset your password from the Admin Panel and give you a temporary password to log in with.

---

*For DM-specific features like map management, atmosphere controls, and running combat, see the [DM Guide](DM_GUIDE.md).*

*For a player-focused quick-start, see the [Player Guide](PLAYER_GUIDE.md).*
