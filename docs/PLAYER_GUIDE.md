# CozyVTT Player Guide

Welcome, adventurer! This guide will get you from "I got an invitation link" to "I'm rolling dice with my friends" as quickly and painlessly as possible.

No technical knowledge required. Let's go.

---

## Table of Contents

1. [Getting Your Account](#getting-your-account)
2. [Accepting a Campaign Invitation](#accepting-a-campaign-invitation)
3. [Creating Your Character](#creating-your-character)
4. [The Campaign Page](#the-campaign-page)
5. [Chat and Dice](#chat-and-dice)
6. [Moving Your Token](#moving-your-token)
7. [The Initiative Tracker](#the-initiative-tracker)
8. [The Vibe Tracker](#the-vibe-tracker)
9. [Managing Your Characters](#managing-your-characters)
10. [Your Profile](#your-profile)
11. [Quick Reference](#quick-reference)

---

## Getting Your Account

Your platform administrator (or your DM, if they're also the admin) sets up your account. Depending on how their instance is configured, you'll get one of two things by email.

**If you receive an invitation link** (most common):

1. Click **Accept Invitation** in the email
2. Choose your own password — nobody else ever sees it
3. Sign in with your email and that password

The link is valid for **7 days**. If it expires, ask your administrator to send another.

**If you receive a temporary password instead:**

1. Go to the CozyVTT URL
2. Sign in with your email and the temporary password
3. You'll be asked immediately to choose your own password — this is required, and until you do, the temporary one won't get you anywhere else in the app

Either way you end up with a password only you know. Pick something you'll actually remember.

*Screenshot pending — Login page.*

> **Tip:** Head to your [Profile](#your-profile) right away to upload a photo and set your display name. Your DM and fellow players will see it everywhere.

---

## Accepting a Campaign Invitation

Your DM will invite you to a campaign using your email address. Here's what happens next:

1. **Log in** to CozyVTT
2. On your **Dashboard**, you'll see a **Pending Invitations** banner at the top
3. The banner shows the campaign name and your DM's name
4. Click **Accept** — you'll be asked which of your characters to bring (if you have any created already)
5. Or click **Decline** if it's not for you

*Screenshot pending — Pending invitation banner.*

If you haven't created a character yet, you can accept the invitation without one and assign a character later. Jump to [Creating Your Character](#creating-your-character) and come back.

Once you've accepted, the campaign appears in your **Campaign Grid** on the dashboard. Click it anytime to enter the campaign.

---

## Creating Your Character

Before you can fully participate in a campaign, you'll want a character. Click **Characters** in the top navigation (or the Characters card on the dashboard) to get to your character library.

*Screenshot pending — Characters page (empty state).*

### Step 1: Start a New Character

Click **+ New Character**. A dialog pops up asking you to choose a **Game System** — this determines which character sheet you'll fill out.

Ask your DM which system you're playing:

| System | What it's for |
|--------|--------------|
| D&D 5e | Dungeons & Dragons 5th Edition |
| Pathfinder 2e | Pathfinder 2nd Edition |
| Call of Cthulhu 7e | Horror and investigation (Lovecraftian) |
| Flexible | Homebrew or rules-light systems |

*Screenshot pending — New character dialog with game system options.*

### Step 2: Fill Out Your Sheet

After selecting a system, you're taken to the **Character Editor**. This is your character sheet — fill it out just like you would on paper.

*Screenshot pending — Character editor (D&D 5e example).*

The sheet is split into sections depending on the system. Take your time — you can save partial work and come back. The header shows the last time you saved.

**A few things to know:**
- Click **Save** (or press the keyboard shortcut) regularly — look for the "Unsaved changes" indicator if you've made edits
- If you close the tab without saving, your recent changes will be lost
- You can **Export to JSON** from the header to save a local backup of your character

### Step 3: Add a Profile Image (Optional)

Want your token on the map to look like your character? You can set a token image when saving. Ask your DM for details on how they handle token images in your campaign.

### Step 4: Assign to Your Campaign

Once your character is created, you'll need to assign them to your campaign so the DM can see them in the roster and place their token on the map.

From the **Characters** page:
1. Find your character card
2. Click the **Assign** button (or the menu on the card)
3. Select the campaign you want to assign them to

*GIF pending — Assigning a character to a campaign.*

Your DM will see the character in the campaign roster and can place your token on the map.

---

## The Campaign Page

Click your campaign from the dashboard to enter it. This is where the action happens.

*Screenshot pending — Full campaign page with labeled sections.*

The page has three main areas:

### Left Sidebar — Campaign Info
- Campaign name and description at the top
- The **Party Roster** showing all players and their characters
- If you're curious about your fellow adventurers, it's all here

### Center — The Map
This is the battle map. During a session, you'll see your token here and can drag it to move around.

### Right Sidebar — Your Tools
A tabbed panel — click a tab to switch between:
- **Chat** — Talk to everyone (an unread badge shows on the tab when messages arrive while you're on another tab)
- **Dice** — Roll your dice
- **Initiative** — See the turn order during combat
- **Session** — The vibe/scene tone and session status

You can also drag the divider to resize the sidebar, or collapse it to give the map more room.

### The Header Bar
The top bar shows:
- Campaign name and session status (Live / Paused / Inactive)
- Connection indicator — a dot that goes green when you're connected
- Navigation controls

*Screenshot pending — Campaign header with status indicators.*

### Connection Status

When you first load the campaign page, CozyVTT connects to the live session. Look for the **connection indicator** in the header — it turns green when you're successfully connected. If you see a loading spinner, just wait a moment.

If you lose connection (WiFi hiccup, etc.), CozyVTT will automatically try to reconnect. If it can't, a message appears and you can refresh the page to reconnect manually.

---

## Chat and Dice

Chat and dice are your two most-used tools. They each have their own tab in the right sidebar, one click apart during a session.

### The Chat Panel

*Screenshot pending — Chat panel with a few messages.*

Type your message in the input box at the bottom and press **Enter** to send. Your display name appears next to your messages.

Chat is for everything: in-character dialogue, out-of-character coordination, questions for the DM, celebrations when you roll a nat 20.

**Chat tips:**
- **System messages** (gray, slightly different style) announce session events like "Session started" or "Initiative started"
- **Dice results** appear in chat automatically when you roll
- Scroll up to read the history — the full session log is preserved

### The Dice Roller

*Screenshot pending — Dice roller panel.*

Click any die icon to roll it. Your result appears in chat immediately.

**Rolling custom expressions:**
Type directly into the expression input. Supported notation:

| Expression | What it does |
|-----------|-------------|
| `d20` | One d20 |
| `2d6` | Two d6s, summed |
| `d100` | Percentile roll |
| `1d20+5` | d20 plus 5 |
| `2d6-1` | 2d6 minus 1 |
| `4d6kh3` | Four d6s, keep highest three |
| `4d6kl3` | Four d6s, keep lowest three |

*GIF pending — Typing a dice expression and seeing the result in chat.*

**Why my roll showed up in chat:** Dice results are public by default. Everyone can see what you rolled. The DM may occasionally roll secretly — you'll see a "DM rolled secretly" message instead of the actual result.

---

## Moving Your Token

When the DM has placed your character's token on the map and the session is **Live**, you can move it by clicking and dragging.

*GIF pending — Clicking and dragging a player token across the map.*

Your movement is visible to everyone in real time — your party can watch you creep around the corner (or run straight into danger).

**When you can't move your token:**
- If the session is **Paused**, token movement is disabled until the DM resumes
- If your token hasn't been placed by the DM yet, it won't appear on the map
- If the session hasn't started (status shows "Inactive"), movement is disabled

*Screenshot pending — Paused session banner blocking movement.*

If your token is missing or in the wrong place, just let your DM know in chat — they can adjust it.

---

## The Initiative Tracker

When combat begins, the DM will start initiative tracking. The **Initiative Tracker** appears in the right sidebar and shows the turn order.

*Screenshot pending — Initiative tracker during combat.*

You'll see:
- **All combatants** in order, highest initiative first
- **Current turn** highlighted
- **HP** for each combatant (updating in real time)

When it's your turn, your name is highlighted. Describe your actions in chat and move your token on the map.

**Watch the map, too.** Whoever's turn it is gets a pulsing gold ring around their token. That's the fastest way to tell which creature is acting when the DM has several of the same monster on the board — three identical wolves look alike in the list, but only one is ringed on the map.

If a creature is hidden or somewhere you haven't explored, you won't see a ring for it — the tracker will show its turn passing, but its position stays a mystery.

**Not sure which wolf is which?** Hover a name in the tracker and that creature's token lights up on the map with a thin white outline. It works the other way too — hover a token on the map and its row in the turn order tints. Hovering only points; it never selects or moves anything.

The DM controls when initiative advances — after your turn, they'll click "Next" and the focus moves to the next combatant.

*Screenshot pending — Your name highlighted in the initiative order.*

**During combat tips:**
- Have your actions planned before your turn — it keeps things moving
- Check HP totals to gauge how the fight is going
- Use chat for action narration and out-of-character dice commentary

---

## The Vibe Tracker

The **Vibe Tracker** is a small mood indicator set by your DM. Keep an eye on it — it's a subtle signal about the current scene's tone.

*Screenshot pending — Vibe tracker showing different moods.*

You might see vibes like:
- **Cozy** — The party is safe, probably at the tavern
- **Tense** — Something's wrong; pay attention
- **Mysterious** — Things are not as they appear
- **Triumphant** — You've done something great!
- **Ominous** — Danger is near (or already here)

You don't control this — only the DM does. Just let it color your roleplaying.

---

## Managing Your Characters

### Your Character Library

The **Characters** page shows all your characters across every campaign and system. You can have as many characters as you like.

*Screenshot pending — Characters page with multiple characters.*

**Things you can do from the Characters page:**

- **Edit** — Open the character editor to update your sheet
- **Copy** — Duplicate a character (handy for making variants or backups)
- **Export** — Download your character as a JSON file (great for backups or sharing builds)
- **Import** — Load a previously exported character JSON
- **Assign / Unassign** — Add or remove a character from a campaign
- **Delete** — Remove a character permanently (you'll be asked to confirm)

### Editing Your Character

Click **Edit** on any character card to open the Character Editor. Make your changes and click **Save**. Changes take effect immediately.

> **Tip:** Update your character after each session — update HP, spell slots, inventory, and anything that changed. Your DM will thank you.

### Exporting and Importing

**Export:** From the Characters page or from within the Character Editor, use the Export button to download a `.json` file. This is a complete backup of your character data.

**Import:** Click **Import Character** on the Characters page and upload a previously exported JSON file. The character appears in your library.

> **Tip:** Export your character after every few sessions as a backup. It takes five seconds and could save you hours of re-entry if something goes wrong.

---

## Your Profile

Click your name or avatar in the top navigation to reach your **Profile** page.

*Screenshot pending — Profile page.*

### Setting Up Your Profile

**Display Name:** Click **Edit** next to your name to change it. This is what everyone else sees.

**Avatar:** Click your avatar (or the placeholder) to upload a profile picture. Use the built-in crop tool to frame it:
- Drag the image to reposition
- Use the zoom slider to zoom in/out
- Click **Upload** when you're happy

*GIF pending — Avatar upload and crop.*

**Bio:** Add an optional bio in the bio field. Great for introducing your character roster or your player persona.

### Security Settings

**Change Password:** In the Security section, enter your current password and your new password (twice), then save.

**Multi-Factor Authentication (MFA):** For extra security, enable MFA. You'll need an authenticator app (Google Authenticator, Authy, 1Password, etc.). Scan the QR code shown during setup, verify the code to confirm, and save the backup codes somewhere safe.

*Screenshot pending — MFA setup with QR code.*

### Themes & Fonts

The **Themes** section of your profile lets you pick the color theme and font *you* see across the app. 16 built-in themes (light, warm, cool, dark, neutral, vibrant) plus 8 open-source font families. There's also a **Custom** option for picking your own primary/accent/background/text colors. Your choice saves to your account and persists across logout/login — when you sign back in, your theme is restored.

---

## Quick Reference

### Dice Notation Cheat Sheet

| Roll | Notation |
|------|---------|
| Single d20 | `d20` or `1d20` |
| Two d6 | `2d6` |
| d20 with +5 bonus | `1d20+5` |
| 4d6 drop lowest (ability scores) | `4d6kh3` |
| Percentile | `d100` |
| Advantage (D&D) | `2d20kh1` |
| Disadvantage (D&D) | `2d20kl1` |

### Session Status Indicators

| Status | What it means |
|--------|--------------|
| 🟢 Live | Session is active — you can move tokens |
| 🟡 Paused | DM paused — token movement disabled |
| ⚫ Inactive | No active session |

### Keyboard Shortcuts

| Action | Shortcut |
|--------|---------|
| Save character | Ctrl/Cmd + S (in Character Editor) |
| Send chat message | Enter |

### Common Questions

**My token isn't on the map.** Ask your DM to place it. They do this from the Token Manager.

**I can't move my token.** Check that the session is Live (not Paused or Inactive).

**I lost connection.** Refresh the page — your session state is saved on the server.

**Someone edited my character.** Only you and your campaign's DM can edit your characters. If you have concerns, speak with your platform administrator.

**I need to switch characters.** From the Characters page, unassign your current character from the campaign and assign the new one. Let your DM know so they can update the token.

**I forgot my password.** Contact your platform administrator — they can reset it and give you a temporary login.

---

*For a complete feature walkthrough including asset management, see the [User Guide](USER_GUIDE.md).*

*Running your own campaign? Check out the [DM Guide](DM_GUIDE.md).*
