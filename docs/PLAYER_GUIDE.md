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
7. [Measuring and Spell Areas](#measuring-and-spell-areas)
8. [The Initiative Tracker](#the-initiative-tracker)
9. [The Vibe Tracker](#the-vibe-tracker)
10. [Managing Your Characters](#managing-your-characters)
11. [Your Profile](#your-profile)
12. [Quick Reference](#quick-reference)

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
- Click **Save** regularly. There's no auto-save and no keyboard shortcut — the header shows the time of your last save
- Leaving with unsaved changes asks you to confirm first, whether you use the back arrow or close the tab. Confirm and those changes are gone
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
- A small dot beside each person shows whether they're **in session** right now — green if they're connected, grey if not. Handy for telling "thinking" apart from "their internet fell over"
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

**Why my roll showed up in chat:** Dice results are public by default — everyone sees what you rolled unless you tick **Secret Roll** first (see *Secret rolls* below). When your DM rolls secretly you get a "DM rolled secretly" message rather than the result.

**Your roll history sticks around.** The panel reads like the chat beside it — a running list, oldest at the top, newest at the bottom — so you can see several rolls at once instead of stepping through them one at a time. It's kept on the server, so refreshing the page, closing the tab and coming back, or losing your connection for a minute won't wipe it. Only the DM can clear it.

**Secret rolls.** Tick **Secret Roll** and your result is hidden from the other players. It still appears in your own list, marked as secret, so you can look back at it. **Your DM can see it too** — that is deliberate, so they can settle a dispute about what was actually rolled. If you would rather not have your secret rolls cluttering the list, the **Secret** button at the top of the panel hides them; that only changes your own view, and nobody else's rolls are affected either way.

Nobody else's secret rolls ever reach you. Not hidden in the page — never sent to your browser at all.

One thing to know: if the DM has **paused** the session, your rolls are worked out in your own browser and aren't sent anywhere. Handy for messing about between scenes, but those rolls vanish if you refresh.

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

### Two creatures can't stand in the same square

Try to finish a move on a square somebody is already standing in and the move is refused, with a note saying who is in the way. That matches the rules: you can move *past* another creature, but you can't end your move on top of one.

A creature at **zero hit points** is the exception. It's drawn faded to show it's down, and you can move onto its square — the body stays there marking where it fell without getting in the way of the fight.

If your token ends up underneath another one anyway — your DM can place tokens wherever they like — clicking the square still picks up **your** token, not the one drawn over it. You can always get your own token back.

## Your Own Notes

The **Notes** tab is yours alone. Keep as many notes as you like for a campaign — a plan for next session, what you've worked out about the villain, who owes whom money.

**Nobody else can read them.** Not the other players, and not your DM. That's enforced by the server, not just hidden from view.

**Write in Markdown.** A `#` makes a heading, `**bold**` makes bold, a `-` starts a list, and `[text](https://…)` makes a link. The eye button switches to a preview so you can see it laid out; the pencil switches back to editing.

Notes save themselves a moment after you stop typing — there's no Save button to forget. Pick between them with the dropdown at the top, and the **+** button starts a new one.

A single note can hold about fifty pages of text, so a long campaign journal is fine. If you paste in something enormous the counter under the note turns red and it won't save until you trim it.

### Catching up on last time

The **Session** tab has a **Past Sessions** list. When your DM ends a session they can write a few lines about what happened, and those notes appear here — newest first, with the date and how long you played. It's the place to look when you've forgotten whose idea the rope was.

If a session shows no notes, your DM simply didn't write any that night.

### Pointing at a token

Hover any token and a card appears in the bottom-left with a large view of its picture, its **HP**, any **conditions** it has, and its **Initiative** if it is in the current fight. It stays useful while you are dragging: the card follows the square under your cursor, so you can see who is already standing where you are about to land.

You will only ever see what you are meant to. Another player's hit points come from their character sheet, which you can already read. A creature's are the DM's to reveal, and appear only once they turn its HP bar on. And a token standing in unrevealed fog tells you nothing at all — no name, no picture, nothing.

### Why parts of the map are dark

Most of the map usually starts hidden. That's **fog of war**, and it's how your DM keeps a dungeon from being a spoiler — you see a room when you get there, not before.

Areas open up as you explore. If your DM is using **dynamic lighting** as well, what you can see also depends on where your character is standing and which walls are in the way, so the view shifts as you move. A light only shows you something you could actually see — a lamp burning inside a closed room tells you nothing from outside it, and whatever is in there stays hidden until you can see in.

Two things worth knowing:

- **Creatures standing in hidden areas are invisible to you** — including their tokens, and including their turn marker during combat. If the initiative tracker shows a creature you can't find on the map, that's deliberate. Something is out there.
- **You can't reveal fog yourself.** Only the DM can, so there's nothing you can accidentally break by moving around.

---

## Measuring and Spell Areas

Two tools in the toolbar above the map answer "can I actually reach that?" before you commit to a turn. Both are private — they draw on your screen only, so nobody sees you working out whether the fireball catches your own party.

**Ruler** (the ruler icon) — measures from **your own token**, so there's nothing to click: turn it on and move the cursor, and the distance in feet follows, using the map's scale and its diagonal rule. If your DM hasn't placed your token on the map yet, the ruler has nothing to measure from and won't draw.

**AoE Shape** (the lightning icon) — draws a spell area. Pick **Circle**, **Cone**, **Line** or **Cube**, set the size in feet or use one of the presets, and move the cursor to position it.

For a cone or a line, **click your own token first**. That square becomes the pivot, and moving the cursor swings the shape around it — the point it comes out of slides around the square's edge to follow your aim, so it always leaves on the side you're pointing and never cuts back across you. Keep turning until you can see what the attack catches.

For something you cast at a distance rather than from yourself — a wall of fire, say — hold **Alt** while clicking. That drops the grid snapping and pins the shape exactly where you clicked, and it turns about that point instead.

Press **Esc** to drop the placement, and again to put the tool away.

Shapes cover whole squares wherever the grid allows it. A cone's spreading edges are at an angle so they'll still clip across squares — that's the shape, not a bug. Judge the edge cases the way you would at the table, and if it matters, ask your DM.

---

## The Initiative Tracker

When combat begins, the DM will start initiative tracking. The **Initiative Tracker** appears in the right sidebar and shows the turn order.

*Screenshot pending — Initiative tracker during combat.*

You'll see:
- **All combatants** in order, highest initiative first
- **Current turn** highlighted
- **HP** for each combatant (updating in real time)

When it's your turn, your name is highlighted. Describe your actions in chat and move your token on the map.

### Rolling Your Own Initiative

Once the DM has added your token to the tracker, you roll for yourself — you don't have to wait for the DM to do it for you. There are two ways, and they do the same thing:

- **In the tracker** — a dice icon 🎲 appears beside your own name. You'll only ever see it on your own row; you can't roll for other players or for the DM's monsters
- **On the map** — right-click your token, choose **Roll...**, and pick **Roll Initiative** at the top of the menu

Either way the result drops straight into the turn order and the roll appears in chat, so everyone can see what you got.

**What you actually roll depends on your game system**, and it's worked out from your sheet:

| System | Initiative |
|---|---|
| **D&D 5e** | `d20 +` your Dexterity modifier, plus the **other bonus** box on your sheet |
| **Pathfinder 2e** | `d20 +` whichever stat the **Uses:** dropdown names — Perception unless your GM asks for something else |
| **Call of Cthulhu 7e** | Nothing is rolled. Investigators act in DEX order, so the button reads **Set Initiative** and takes your DEX |
| **Shadowrun 6e** | Your initiative dice plus your initiative base, both from your sheet |

**D&D 5e players — the "other bonus" box.** Your Dexterity is added automatically, but plenty of things add to initiative beyond it: the **Alert** feat's flat +5, a Bard's Jack of All Trades or a Champion's Remarkable Athlete, subclasses that let you use a different ability. Put the total of those in **Initiative — other bonus** on the Combat tab and it's included every time. The Initiative number itself is worked out for you now, so there's nothing to keep in step by hand.

If something gives you **advantage** on initiative (a Sentinel Shield, say), that isn't handled automatically yet — roll `2d20kh1` in the dice panel and ask your DM to enter it.

### Skills the sheet doesn't have (D&D 5e)

Thieves' tools, a musical instrument, a vehicle, or whatever your table invented — none of these are among the eighteen printed skills, but they roll the same way. Under **Stats & Skills** there's a **Your Own Skills** section: **+ Add Skill**, type the name, choose the ability it uses, and tick **Prof** (or **Exp** for expertise).

The bonus is worked out for you from that ability and your proficiency bonus, so it keeps up as your character grows — there's nothing to re-enter when you level. The **Other** box is for anything the maths can't know about, like a +1 set of tools.

Your own skills show up with the rest on your sheet and in the right-click roll menu, so rolling them is one click.

### Weapons that do more than one thing

**Properties** — Finesse, Light, Thrown and the rest — are buttons on each weapon in the Combat tab. Tap the ones that apply and they appear as labels on your sheet.

The eleven buttons are the ones the rules name, not a limit. If your game has a property of its own, type it into **Add your own property** and it gets a label like any other. Your own properties show in amber while editing so you can tell them apart, and clicking one removes it.

**More than one damage roll.** A spear is 1d6 in one hand and 1d8 in two, and a spell may hit harder at higher levels. Use **Other Damage Rolls** to add each one with a note saying when it applies — "Two-handed", "At 5th level". Each gets its own line on your sheet that you can click to roll, so you're not doing arithmetic mid-fight.

If you already wrote a second damage die into a weapon's notes, it stays exactly as you typed it — nothing rewrites your sheet. Move it into its own row whenever you like and it becomes rollable.

**The option only appears once you're in the tracker.** If your token isn't in the turn order yet, there's nothing to roll for — ask your DM to add you. Rolling is how you take part in a fight you're already in; it isn't a way to add yourself to one.

Your DM can still roll for you (and re-roll, or type a value in by hand) — handy if you're away from the keyboard when combat kicks off.

**Watch the map, too.** Whoever's turn it is gets a pulsing gold ring around their token. That's the fastest way to tell which creature is acting when the DM has several of the same monster on the board — three identical wolves look alike in the list, but only one is ringed on the map.

If a creature is hidden or somewhere you haven't explored, you won't see a ring for it — the tracker will show its turn passing, but its position stays a mystery.

**Not sure which wolf is which?** Hover a name in the tracker and that creature's token lights up on the map with a thin white outline. It works the other way too — hover a token on the map and its row in the turn order tints. Hovering only points; it never selects or moves anything.

**Reading conditions on the map.** A creature under a condition carries small amber badges above its token, each a two-letter code — **PA** for Paralyzed, **PO** for Poisoned, **PR** for Prone, and so on. If it has more than four, the extras collapse into a grey **+N** badge. Hover the token and the panel in the bottom-left names every condition in full, so you can tell a Paralyzed enemy from a merely Poisoned one before deciding what to do about it.

### Pointing at the Map

Saying "no, the *other* door" never works. Instead, put your mouse where you mean and press **Tab**. A dot appears with rings radiating out of it, in your colour and labelled with your name, and everyone at the table sees it in the same spot for a couple of seconds.

A few things worth knowing:

- **Your mouse has to be over the map.** Tab does nothing if the cursor is over the chat panel or the sidebar.
- **Tab still works normally everywhere else.** If you're typing in chat, or you've tabbed your way to a button, Tab keeps moving between controls as usual — it only pings when you're not in the middle of something.
- **Anyone can ping**, players and DM alike. Your colour is assigned automatically and stays the same every session.
- Pings are just a gesture. They don't move anything, don't reveal anything, and vanish on their own.

If you ping repeatedly in quick succession, some will be quietly ignored — that's a spam guard, not a bug.

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

- **Click a character** — Open its sheet to read. **Edit** is on the sheet itself when you want to change something
- **Edit** — Skip straight to the character editor
- **Copy** — Duplicate a character (handy for making variants or backups)
- **Export** — Download your character as a JSON file (great for backups or sharing builds)
- **Import** — Load a previously exported character JSON
- **Assign / Unassign** — Add or remove a character from a campaign
- **Delete** — Remove a character permanently (you'll be asked to confirm)

### Editing Your Character

Clicking a character card opens its sheet to read; click **Edit** on the sheet to start changing it. The **Edit** action on the card itself skips the reading step and goes straight to the Character Editor. Either way, make your changes and click **Save** — they take effect immediately.

If you leave the editor with changes you haven't saved, you'll be asked to confirm before they're discarded — whether you use the back arrow or close the tab. Once you've saved, backing out is silent; there's nothing left to lose. Simply opening a sheet and reading it never counts as a change.

Renaming a character on its sheet renames it everywhere: the card in your library, the editor's title bar, and your DM's roster all follow.

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
| New line in chat without sending | Shift + Enter |
| Ping the map | Tab (cursor over the map) |
| Place a spell area off the grid | Alt + click (AoE tool) |
| Drop a placement / close the tool | Esc |

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
