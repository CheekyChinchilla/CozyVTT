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
6. [Documents](#documents)
7. [Running Sessions](#running-sessions)
8. [Advanced Features](#advanced-features)
9. [Your Profile](#your-profile)
10. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## Getting Started

### First-Time Setup (Admin Only)

When you first navigate to your CozyVTT instance, you'll be greeted by the **Setup Wizard** — a short four-step process that creates the administrator account and configures the platform. Nobody else has an account until it is done, so run it before you share the address with anyone.

*Screenshot pending — Setup wizard welcome screen.*

**Step 1 — Welcome**
Read the brief intro and click **Next** to begin. The whole process takes about two minutes.

**Step 2 — Admin Account**
Create the administrator account. This is the most powerful account on the platform — keep these credentials safe!

- **Setup token** — Proves you run this server, so a stranger who finds a new instance first cannot make themselves its administrator. The backend prints it in its log when it starts: on the server, `docker compose logs backend | grep "setup token"` shows it. If you set `SETUP_TOKEN` in `.env`, enter that value instead. See [Complete the setup wizard](DEPLOYMENT.md#4-complete-the-setup-wizard)
- **Display Name** — What other users will see (2–50 characters)
- **Email Address** — Your login email address
- **Password** — Must be at least 12 characters with an uppercase letter, a lowercase letter, a number and a special character: one of `! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : " \ | , . < > / ?` (a space, `~` or an accented letter does not count)
- **Confirm Password** — The same password again
- A live password strength meter gives you instant feedback as you type. It shows **Good** or **Strong** only for a password that meets every rule above, so a password it calls **Weak** or **Fair** will be refused

*Screenshot pending — Admin account creation form with password strength indicator.*

**Step 3 — System Configuration**
Give your instance its identity:

- **Instance Name** — Appears in the browser tab and in every email the instance sends (e.g., "The Hearthstone Tavern"). You can change it later under **Admin Panel → Settings**.
- **Enable Public Registration** — Tick it to let new users register themselves. For private groups, leave it unticked and create accounts manually from the Admin Panel

Earlier versions also asked for a **Timezone** here and showed it under **Admin Panel → Settings**. Nothing ever used it, so it has been removed; times are shown in each person's own browser time zone, as they always were. An instance that saved one keeps it stored, unused.

*Screenshot pending — System configuration step.*

**Step 4 — Review**
Double-check everything, then click **Complete Setup**. If anything looks wrong, use the **Back** button to correct it.

Once setup is complete, you'll be logged in as the administrator and taken to your dashboard.

---

### Logging In

Navigate to your CozyVTT URL and enter your email and password. If Multi-Factor Authentication (MFA) is enabled on your account, you'll be prompted for your authenticator code after entering your password. If you opened a link to a page, such as a campaign, while signed out, signing in takes you on to that page.

**Too many wrong passwords locks sign-in for a while.** There are two limits. A correct password never counts towards either, so signing in normally cannot lock you out.

| Limit | What the sign-in page says | When it lifts |
|---|---|---|
| Five wrong passwords in 15 minutes from one internet address, such as everyone on your home network (a password reset link that does not work counts too) | "Too many authentication attempts, please try again later" | 15 minutes after the oldest of the five |
| Ten wrong passwords in an hour for your account, from every device together | "Too many failed sign-ins for this account, please try again later" | An hour after the oldest of the ten, or at once when you get a new password: set it with the **Forgot password?** link (if your instance sends email), or ask an administrator for a temporary one. An administrator can also clear the lock, and your password stays as it was |

If you connect over IPv6, your internet provider usually gives your home or office a whole block of addresses, and the first limit counts all of them as one, as it counts everyone behind one IPv4 address.

Only two passwords from one internet address are checked at the same moment. A third person on that address pressing **Sign In** in the same second sees "Too many password checks from your address at once. Please try again in a moment." Trying again a moment later works, and it counts towards neither limit.

When the second limit locks an account, the Admin Panel's **Activity** tab gets a line naming the account and the address the last wrong password came from (see [The activity log](#the-activity-log-admins)).

**Clearing a sign-in lock (admins).** In the **Users** tab of the Admin Panel, a locked account shows **Locked until** and the time the lock ends by itself. The lock counts wrong passwords, and on an account with two-factor sign-in wrong codes too (five in fifteen minutes); the time shown is whichever ends later. **Clear lock** on that row asks you to confirm, then lets the account sign in at once with its usual password, and writes a line to the **Activity** tab. If the owner did not make those attempts, someone may be guessing the password, so consider resetting it as well. The locks are kept in the backend's memory, so restarting it also clears them, and the list shows a lock as it stood when the tab was opened: **Refresh** reads it again. The same goes for the password you confirm when changing your password, your email address or deleting your account: ten wrong ones in fifteen minutes, and those three say "Too many wrong passwords, please try again later".

**How long a sign-in lasts.** Tick **Remember me** on the sign-in page to stay signed in between visits. Without it, a sign-in ends after an hour with no activity; with it, after 30 days with no activity. Those are the usual lengths; the person who runs your instance can change them. A campaign page that is open counts as activity, and so does a character sheet with unsaved changes, so neither drops you in the middle of a game. Whichever you choose, **a sign-in lasts at most 30 days**, however much you use it. Your administrator can change both lengths. When the 30 days run out you are taken to the sign-in page, which says "Your sign-in has reached its 30-day limit. Sign in again." Signing in again takes you back to the page you were on.

*GIF pending — Login flow with MFA step.*

**Forgot your password?** If your instance has email configured, use the **Forgot password?** link on the sign-in page; it opens a page headed **Forgot your password?**. Otherwise contact your platform administrator, who can email you a reset link or generate a temporary password from the Admin Panel. On an instance that cannot send email, the page the link opens says "Password reset by email is not available" and offers no form. If the page says "Your request could not be completed, so no email was sent", try again in a few minutes. Only the newest link works: asking for another one cancels the one before, and each link can be used once. Asking again within five minutes sends nothing new, and the link you already have keeps working; if it has not arrived after five minutes, ask again.

**First time signing in?** An account someone else created for you always ends its first sign-in with you choosing your own password. Until you do, the temporary password you were given won't open anything else — so nobody, including the admin who created the account, keeps a way in.

---

### User Accounts

CozyVTT has two platform-level roles:

| Role | What they can do |
|------|-----------------|
| **Admin** | Manage the entire platform: users, settings, backups, and global assets |
| **User** | Create campaigns (as DM), join campaigns (as player), manage characters |

Your role badge is visible on your profile page.

### The activity log (admins)

The **Activity** tab of the Admin Panel, headed **Platform Activity** and reloaded with its **Refresh** button, has four lists: **Currently Online** (the accounts with a live sign-in, with each one's role, last login and when its sign-in expires), **Recent Admin Actions** (the newest 100 lines of the admins' activity log), **Recent Registrations** (the 50 newest accounts) and **Recent Game Sessions** (the 20 most recent). The rest of this section is about the activity log. A line is written each time an administrator:

- creates, invites, approves or deletes an account;
- makes someone an administrator, or takes the role away;
- grants or takes away **Global Assets** or template editing;
- changes someone else's email address, display name, avatar or bio (the line says the bio changed and keeps none of its text);
- resets someone's password or two-factor authentication, or sends them a reset link or an invitation;
- clears an account's sign-in lock;
- changes the instance's settings or default theme (only the settings whose value changed are listed, and saving without changing anything writes no line);
- makes, deletes or restores a backup, or deletes leftover files;
- moves someone else's personal file into a campaign or to **Global** (the line names the file, its owner and where it went);
- sends a test email from the **Settings** tab.

The instance writes lines of its own too, such as an account locked after too many wrong passwords. Each line of **Recent Admin Actions** shows:

| Column | What it shows |
|---|---|
| **Time** | How long ago it happened |
| **Level** | INFO, or WARNING for the more serious actions, such as deleting an account or changing someone's email address |
| **By** | The administrator who acted, by display name and email address. **The instance** for a line the instance wrote itself |
| **Action** | What was done, naming the account it was done to by its email address. Under a change to an account or to the settings, **What changed** opens a list of each value before and after, except a bio, which shows only **Bio: changed**. Lines about the settings written by earlier versions list every setting that was sent, with its new value only |

**What the log keeps, and for how long.** Lines are kept for as long as the instance exists: nothing removes them, and there is no control to clear them. A line names the account it was about by its email address, and deleting that account leaves the line as it is. **By** is looked up each time the tab opens, so if the administrator's own account is deleted later, their lines stay and **By** shows **Deleted account**. **What a line stores about an account change:** the email address, display name and avatar address before and after, and whether Global Assets and template editing were granted or taken away. For a bio it stores only that the bio changed: none of the old or new text is kept, so nothing a person wrote about themselves stays in the log. Lines written by earlier versions of CozyVTT still hold the bio text they stored; they are not rewritten. The log is part of every backup.

### Campaign Roles

Within a campaign you have one of three roles. Whoever creates a campaign is its DM, and everyone the DM invites joins as a player:

| Role | What they can do |
|------|-----------------|
| **DM** | Everything: maps, tokens, fog and lighting, the initiative order, inviting and removing members |
| **Player** | Move the tokens they control, roll dice, chat, keep notes, and read and edit their own characters. They can leave the campaign with **Leave Campaign**, in the **Campaign Info** panel ([Leaving a campaign](PLAYER_GUIDE.md#leaving-a-campaign)) |
| **Spectator** | Watch the map, follow and write in the chat, and ping the map; they keep private notes and dice macros of their own, but cannot roll dice or initiative, move or edit tokens, or edit a character sheet, even their own, while they are a spectator. They can still add one of their characters to the campaign's roster, take one out of it, or delete one of their own characters, and leave the campaign as a player can. There is no control in the app for making someone a spectator yet; the role can only be set through the API |

---

## The Dashboard

After logging in, the **Dashboard** is your home base. From here you can see everything happening across your campaigns at a glance.

*Screenshot pending — Full dashboard view.*

### What's on the Dashboard

**Quick Stats** — A summary row showing how many campaigns you're running, how many you're playing in, and how many are currently active.

**Pending Invitations** — If a DM has invited you to a campaign, a banner appears here. You can accept (and choose which of your characters to bring) or decline.

*Screenshot pending — Pending invitation banner.*

**Your Campaigns** — A grid of campaign cards. Each card shows the campaign name, description, your role, and the current session status. Click any campaign card to jump right in.

*Screenshot pending — Campaign card grid with status indicators.*

**Notes From Campaigns You Have Left** — Shown only if you left a campaign, or a DM removed you from one, in which you kept personal notes or saved rolls. **Open** beside a campaign shows each note and your saved rolls, and **Download** in the window it opens saves them all as one Markdown file. They cannot be changed here. If the campaign is deleted, they are deleted with it.

**Your Characters**, **Asset Library**, **Documents** and **Character Templates** — each section has a button that takes you to that page in one click.

### Creating a New Campaign

Click **Create Campaign** on the dashboard to open the campaign creation form.

*GIF pending — Creating a new campaign.*

Fill in:
- **Campaign Name** — Required. Keep it evocative!
- **Description** — Optional, but players will see this when they're invited
- **Game System** — What ruleset you'll be playing under

Click **Create Campaign** and you're in. You'll be taken straight to the campaign page.

---

## Campaign Management

### Campaign Page Overview

The campaign page is your command center during play. On a computer, or a tablet held sideways, it's a three-column workspace (on a phone it has a layout of its own; see [The campaign page on a phone or tablet](#the-campaign-page-on-a-phone-or-tablet)):

*Screenshot pending — Full campaign page layout with labeled panels.*

- **Left Sidebar** — Campaign info, the campaign roster, and (for DMs) the token roster
- **Center Canvas** — The battle map where tokens live and adventures happen
- **Right Sidebar** — a tabbed panel with **Chat**, **Dice**, **Initiative**, **Notes** and **Session** (vibe, session controls and past sessions); a badge on the Chat tab shows unread messages while you're on another tab. When the panel is too narrow for every name, the tabs other than the open one show only their icon; point at one to see its name

You can **drag the dividers** between the columns to resize them, and collapse the side columns entirely to give the map more room. On a phone or a tablet a divider takes your finger anywhere in a strip 44 pixels wide around it, so you need not hit the thin line itself. A menu or a picker open over that strip takes your tap itself. Your layout and last-used tab are remembered per browser. The **header bar** across the top contains navigation, connection status, and DM controls.

**In a window narrower than 1,024 pixels**, such as a phone, most tablets held upright, or a laptop with two windows side by side, the page uses its compact layout, described in the next section.

**On a tablet** in landscape, 1,024 pixels wide or more, the table opens as on a computer and works by touch: slide a token with your finger, tap a token for its details, press and hold a token, a character or a combatant for its menu, and pinch to zoom (see [On a touch screen](PLAYER_GUIDE.md#on-a-touch-screen)). The page is as tall as the browser shows it, so on a phone or a tablet its bottom stays above the browser's toolbar.

### The campaign page on a phone or tablet

On a phone, on most tablets held upright and in a browser window narrower than 1,024 pixels, the campaign page shows the map across the whole screen, with a one-line header above it and a bar of buttons along the bottom. Nothing is left out: every panel and tool of the three-column layout is one or two taps away.

*Screenshot pending — The campaign page on a phone, with the Chat sheet open.*

The header holds **Back to the dashboard** (the arrow), the campaign's name and the session's state (**Live**, **Paused** or **Inactive**). If the connection to the server drops, its state shows there too until it is back.

The bar along the bottom:

| Button | What it opens |
|---|---|
| **Map** | Closes whatever is open over the map |
| **Chat** | The chat. A number on the button counts messages that arrived while the chat was closed |
| **Dice** | The dice roller |
| **Initiative** | The initiative tracker |
| **Party** | The campaign's info, the roster and, for the DM, the **Token Roster** |
| **More** | **Notes**, **Session** (the vibe, the session controls and past sessions), **Documents** and **Shortcuts**; for the DM, every tool of the header's toolbar: **Map Library**, **Token Manager**, **Creature Library**, **Token Templates**, **Spirit Layer**, **Atmosphere** and **Campaign Settings**; and **Owner Settings** for the campaign's owner when someone else is the DM |

Each opens as a sheet that rises over the map. **Dice**, **Initiative** and **Party** open at half the screen's height and **Chat** at two thirds, with **To**, the message box and **Send** on one line, so the map above stays in view and you can still pinch, pan and tap it. Tap the bar at the top of a sheet, or drag it up, to make the sheet full height, and tap or drag it down again to make it half. To close a sheet, tap its **✕**, tap its button again or **Map**, drag it down by the bar at its top, press **Esc**, or use the phone's **Back**. Tapping another button switches to its sheet. **Notes**, **Session** and **More** open at full height.

The map's toolbar is one row at its top: **Zoom Out**, the zoom, **Zoom In**, **Ping**, **Draw** and **More**. That **More** opens **Map controls**: **Fit to Screen**, the grid and its colour, the **Ruler**, the **AoE Shape**, and for the DM **Show tools** (the **Fog of War**, **Walls** and **Lights** panels) and the spirit tokens. **Draw** opens its tools in a strip across the bottom of the map, with the map above it to draw on. A token's details show at the bottom of the map when you tap it.

Menus open as a list from the bottom of the screen: press and hold a token, a door, a character in the roster or a combatant in the initiative tracker. Tap an item, or **Cancel**.

**A phone on its side** has no room for the bar, so its buttons move into the header, and sheets open from the right at the map's full height.

**On a tablet** the sheets and the bar are at most 672 pixels wide, in the middle of the screen. Turning a tablet between upright and sideways switches between this layout and the three columns without losing anything: a message you were typing, a token you were carrying, the zoom, **Preview Player View** and any window you had open stay as they were.

**In a narrow browser window on a computer** the compact layout works with the mouse and the keyboard: click where you would tap, and **Enter** and **Esc** work as on the three-column page. Make the window 1,024 pixels wide or more for the three columns.

---

### Adding Maps

Maps are the battlegrounds, taverns, and dungeons your players will explore. Before a session, upload your map images to the **Asset Library** (see [The Asset Library](#the-asset-library)), then add them to your campaign.

As the DM, click **Map Library** (the map icon) in the campaign header.

*Screenshot pending — Map Library panel.*

From here you can:
- **Create Map** from an uploaded image in your asset library, or one you upload there with **Upload New**, which goes to your **Personal** library unless you choose **Campaign** (see [Adding Maps to Your Campaign](DM_GUIDE.md#adding-maps-to-your-campaign)); or **Import UVTT** from a mapping tool
- **Set Active** to switch to a different map — this updates the view for all connected players immediately
- **Edit** a map's settings, export it, or delete it

*GIF pending — Switching the active map mid-session.*

### Managing Campaign Settings

Click **Campaign Settings** (the gear icon) in the campaign header. Here you can update the campaign name, description, and other properties, among them **Players may draw** on the **General** tab, which lets players draw on the map and is on until you turn it off (see [Drawing on the map](DM_GUIDE.md#drawing-on-the-map)).

### Managing Your Roster

Players join your campaign by accepting an invitation. Once they're in, they appear in the **Campaign Roster** on the left sidebar. You can see all current members and their characters, with the hit points of each (see [The Campaign Roster](DM_GUIDE.md#the-campaign-roster)).

To invite someone:
1. Click **Invite Player** in the left sidebar, or on the **Members** tab of **Campaign Settings**
2. Type at least 2 letters of their display name in **Search by display name**, or the whole name if it is one letter long, and pick them from the people who match (they need an account first). See [Inviting Players](DM_GUIDE.md#inviting-players)
3. They'll see a pending invitation on their dashboard

**Handing the campaign to someone else.** A campaign has one DM, and that seat
can be passed to another member — useful when you are handing off to a co-DM or
stepping back from a game that carries on without you. It does not change who
*owns* the campaign, so if you created it you can still delete it and can take
the seat back later. See
[Handing the game to someone else](DM_GUIDE.md#handing-the-game-to-someone-else).

---

### Tokens

Tokens represent characters, monsters, NPCs, and objects on the map.

**Placing tokens:** Open the **Token Manager** (the crossed-swords icon in the header) to add, configure, and manage all tokens in your campaign. DMs can also place tokens directly from the **Creature Library** (see [DM Guide](DM_GUIDE.md#the-creature-library)).

*Screenshot pending — Token Manager panel.*

Each token has:
- **Name** — Displayed on hover
- **Image** — Choose from your asset library (TOKEN type assets), or leave blank for a colored-letter placeholder
- **Type** — Player, NPC / Creature, or Object
- **HP** — Hit points, which players see only for their own token or once the DM turns on the token's HP bar
- **Size** — How many grid squares the token occupies (default 1×1)
- **Display Mode** — **Pog** (circular), **Top-Down** (overhead art), or **Full-Art** (full rectangular image)
- **Disposition** — Hostile (red), Friendly (teal), or Neutral (amber) — affects a creature's placeholder color and ring
- **Conditions** — Two-letter amber badges above the token for status effects (**PO**isoned, **ST**unned, and so on). Hover any token to read its conditions in full
- **Layer** — The material plane or the spirit layer; a spirit-layer token is seen only by players in the spirit realm
- **Darkvision** — How far it sees without light, in grid squares
- **Hidden** or **Obscured** — Hidden tokens are not sent to players at all; an obscured one shows only as a grey shape with a question mark
- **Stat Block** — NPC tokens can carry a stat block with AC, HP, speed, attacks, and abilities

**Colored-letter placeholders:** Tokens without an assigned image display a colored circle with the first letter of their name. Player tokens are blue; for creatures the color reflects the disposition, and objects are grey.

**Moving tokens:** During a session, click a token to pick it up, move the pointer to where it should go, and click that square to put it down. Letting go of the mouse button does not put it down, so there is no need to hold it. Right-click, press **Esc**, or move the pointer off the map, to put the token back where it was. Everyone connected sees the movement as it happens.

**Selecting and the keyboard:** Clicking a token also selects it, marked with a dashed light-blue ring, and the keyboard then acts on it: the arrow keys move it a square (five with **Shift**), **,** and **.** step to the previous or next token you can act on, and **Enter** opens its menu. Press **?** on the map for every key, or see [Keyboard Shortcuts](PLAYER_GUIDE.md#keyboard-shortcuts).

**Turning tokens:** Right-click a token and choose **Rotate Left** or **Rotate Right** to turn it 45 degrees, to show which way it faces, or select it and press **[** or **]**. The DM can turn any token at any time, and set an exact angle in **Edit Token**; a player can turn the tokens they control while the session is live, as they move them.

*GIF pending — Picking up a token and putting it down across the map.*

---

## Character Management

### Your Character Library

The **Characters** page (**Manage** beside **Your Characters** on the dashboard) shows all the characters you own across every campaign and game system.

*Screenshot pending — Characters page grid view.*

From here you can:
- **Create a new character**
- **Click a character** to read its sheet — **Edit** is on the sheet when you want to change something
- From a card's menu (**⋮**): **Edit Character** directly, skipping the reading step; **Copy/Duplicate** it (great for variants or backup sheets); **Assign to Campaign** (**Reassign Campaign** once it is in one), which is also where you unassign it if they've hung up their boots; **Export as JSON** (for backups or sharing); or **Delete Character** (with a confirmation prompt — we know how precious they are)
- **Import** a character from a JSON file

One account can have up to 1,000 characters, copies included. Past that, creating, copying or importing another says so; deleting one you no longer need makes room. A copy's name is the original's with " (Copy)" added, shortened if needed so the whole name stays within 200 characters.

### Creating a Character

Click **Create Character** to open the character creation dialog. Choose your **Game System** first — this determines which character sheet you'll fill out.

*Screenshot pending — New character dialog with game system selector.*

Give the character a name and click **Create Character**. The dialog closes, **Character created successfully!** appears, and the new character is added to your Characters page. Choose **Edit Character** from its card's menu (**⋮**) to fill in the sheet in the **Character Editor**.

### The Character Editor

The Character Editor is where you fill in every detail about your character — stats, skills, equipment, backstory, the works. What you see here depends on your game system.

*Screenshot pending — Character editor with D&D 5e sheet open.*

Click **Save** to save your progress. A timestamp in the header shows when your character was last saved. If you try to leave with changes you haven't saved, you'll be asked to confirm first — that covers the back arrow and closing or reloading the browser tab. After a save, leaving is silent. Anything you type while a save is still going through stays in the editor, which then stays open with it, counted as unsaved, until you press **Save** again.

**If a save is refused because a box is too long or a list has too many entries**, a message starting "Not saved." names the first five boxes at fault and what is wrong with each, such as `backstory: Can be at most 100,000 characters`, and says how many more there are. Nothing you typed is lost; the editor stays open. Shorten or remove what the message names, then press **Save** again. A sheet saved before a limit existed still opens as it was; the limit is checked the next time you save. This works the same in the editor that opens over a character sheet on the Characters page or at the table.

**The D&D 5e editor checks a sheet before saving it.** If **Race** or **Class** is empty, maximum hit points or **Armor Class** is below 1, an attack, item or spell you typed in has no name, a hit die has no class, or the spell save DC or passive Perception would be below 1, nothing is saved. A red box above the sheet lists what to fix, the editor opens the tab the first one is on, and a note under each box says what is wrong; it goes as soon as you change that box. The boxes also stop at what a sheet stores when you leave them: **Armor Class** and maximum hit points at 1, a custom skill's **Other** at -30 to +30, and the **Other bonus** of the spell save DC and of passive Perception where either would reach 1; the text boxes stop at the length a sheet stores. An attack holds at most 20 properties. A sheet stored with more than 20 spell slots of a level, or an initiative, passive Perception or spellcasting bonus outside -30 to +30, opens with that number brought within range and a note above the sheet naming each one, such as "level 3 spell slots (24 to 20)"; saving keeps the new values.

**The Pathfinder 2e and Call of Cthulhu editors check names before saving.** If a Pathfinder 2e sheet's ancestry, heritage or class is empty, or a strike, lore, spell, ritual, item or feat has no name, or a Call of Cthulhu sheet's occupation or era is empty or a weapon has no name, nothing is saved. A red box above the sheet lists what to fill in, and the editor opens the tab the first one is on.

**If the character changed while you were editing it**, for example your DM took hit points at the table or you saved it from another window, your save is refused so that it cannot put the old values back. Nothing you typed is lost. The editor stays open and a box headed **This character has changed** lists your changes, already put onto the newest version of the character. Press **Save my changes** to save them, or **Keep editing** to go back to the editor without saving anything. If you changed something that was also changed in the newer version, it is listed under **Changed in both places** with both values; pick the one to keep for each, and **Save my changes** becomes available. This works the same in the editor that opens over a character sheet on the Characters page or at the table.

**Lists on a sheet stop at 500 entries.** On a D&D 5e, Pathfinder 2e or Call of Cthulhu sheet that covers inventory or possessions, attacks, strikes or weapons, spells, cantrips, features, feats and the other lists, and the boxes that take a list, such as languages, senses and possessions; the traits of one Pathfinder 2e strike stop at 50, a D&D 5e sheet's **Your Own Skills** at 30, and the **Other Damage Rolls** of one D&D 5e attack at 10. At 500 the **+ Add** button is greyed out and a note under it says the list is full; remove an entry to add another. The Cantrips box and the boxes that take a list stop taking entries at the limit. On a Pathfinder 2e sheet an item bonus is from -30 to +30 and a spell rank has at most 20 slots, no more of them used than there are; the boxes correct a number outside that when you leave them, and lowering a rank's total brings its used count down with it. A sheet saved with more entries opens with all of them, and cannot be saved until the list is shortened; the message after **Save** names the list.

While a sheet has changes you haven't saved, you stay signed in however long you take. **If you are signed out anyway**, for example because your computer slept for over an hour or your password was changed on another device, your changes are not lost. Pressing **Save** shows "You've been signed out" above the sheet and keeps everything you typed. Click **Sign in in a new tab**, sign in there, come back to the editor and press **Save** again. This works the same in the editor that opens over a character sheet on the Characters page or at the table.

You can also click **Export** in the editor header at any time to download a JSON backup copy.

### Character Templates

A template is a starter sheet somebody has already filled in and shared. If you're new to a system — or your DM has prepared something for you — starting from one saves you a blank page.

Open **Character Templates** from the dashboard. Every template on the instance is listed; filter by game system, search by name, or tick **Only mine** to see just your own.

**Using one.** Click **Use** on any template. That creates a character that belongs entirely to you — you can rename it and change anything you like, and the original template is untouched. Whoever published it has no control over your character.

**Publishing one.** There are four ways:

- **New Template** on the templates page, which starts from a blank sheet for the system you pick
- **Save as Template** in the character editor, which publishes the sheet you're looking at. The character's picture goes with it only if it is a global asset; a picture you uploaded yourself is left out, and a message says so (see the note on template images below)
- while creating a character, if you want to keep the character and share it at the same time
- **Import** on the templates page, which publishes a character JSON file as a template

Templates you publish are visible to everyone on your instance, so a template never keeps the player's name, and a Call of Cthulhu investigator's Keeper's Notes are left out. You can edit or delete your own at any time while you have an account; if you delete your account, they stay in the library for everyone, no longer linked to you. One account can publish up to 500 templates; past that, publishing another says so, and deleting one you no longer need makes room.

**Editing one.** The pencil on one of your templates opens **Edit Template**, with the name and description at the top and the sheet below. **Save Details** saves the name and description and closes the dialog; the sheet's own **Save** saves the sheet, and the dialog stays open showing it. If the sheet has changes you haven't saved, closing the dialog asks first, and **Save Details** keeps it open so you can save them. The template's sheet has no token picture box, because a template's picture has to be a global asset (see the note below).

If someone else saved the template while you had it open, such as a template editor tidying it, your save is refused so that it cannot put the older version back. For the sheet, a box headed **This template has changed** lists your changes, already put onto the newest version, and works as it does for a character (see [The Character Editor](#the-character-editor)): **Save my changes** saves them, **Keep editing** goes back without saving. For **Save Details**, if the other person changed the name or description too, a message under the name says what it is now called, and pressing **Save Details** again saves yours in its place; otherwise yours is saved straight away.

**Importing from another instance.** The **Import** button accepts any character JSON — one you exported from this instance, one you wrote yourself, or one exported from a *different* CozyVTT server. That last case is the useful one: export a character from wherever you built it, bring the file to a new instance, and publish it there for that group to copy. Character exports and templates hold the same thing — a sheet plus a game system — so no conversion is involved. You'll see a preview before anything is published, and you can set the name and description at that point.

> **A note on template images.** A template's picture has to be a **global** asset, because everyone who can see the template needs to be able to load it — a personal asset would show as broken for everyone but you. If you don't have permission to upload global assets, pick an existing global one or leave the image blank.

> **Template editors.** Admins can grant a user the **template editor** permission, which lets them tidy up or correct anyone's template. Nobody has it by default. If someone edits a template you published, that's why.

### Assigning a Character to a Campaign

A character has to belong to a campaign before it shows up in that campaign's roster. There are two ways:

- **When you create it** — pick the campaign in the new character dialog. The character joins the roster straight away.
- **Afterwards** — open a character card's menu on the Characters page, choose **Assign to Campaign** (**Reassign Campaign** for a character already in one), and pick the campaign.

You can only choose a campaign you are already a member of.

*GIF pending — Assigning a character to a campaign.*

Once assigned, that character becomes available as a token in the campaign, and the DM can see them in the campaign roster.

---

### Character Sheets by Game System

CozyVTT includes sheets for several popular game systems. Here's a quick overview of what each one covers:

Every box on a sheet has a length limit, far above what a sheet needs: a character's name can be up to 200 characters, notes, descriptions, backstories and features up to 100,000, the D&D 5e proficiency boxes up to 2,000, and any other box up to 1,000.

#### Dungeons & Dragons 5th Edition

The classic. Covers all the D&D 5e essentials:

- Ability scores and modifiers
- Skills with proficiency tracking
- Hit points, armor class, and saving throws
- Skill and saving throw bonuses worked out from your scores, with an **Other** box beside each for anything else that adds to it
- Initiative, passive Perception, spell save DC and spell attack worked out for you, each with an **Other bonus** box that takes -30 to +30
- Spells, spell slots (up to 20 of each level), and spellcasting stats
- Equipment, weapons, and inventory
- Features, traits, and background info

*Screenshot pending — D&D 5e character sheet.*

#### Pathfinder 2nd Edition

The action-economy tactician's dream:

- Attributes (STR, DEX, CON, INT, WIS, CHA) with ancestry, class, and item bonuses
- Skills with trained/expert/master/legendary proficiencies
- Class features, feats, and focus points: the pool holds 1 point with your first focus spell, up to 3 as you set it, and the points left stay within it
- Spells and spell slots, with the spell attack and spell DC worked out from one **Spellcasting proficiency** and each its own item bonus
- Inventory with bulk tracking: ten light items make 1 Bulk, and you are encumbered only above 5 + Strength
- Ancestry, background, and heritage

*Screenshot pending — Pathfinder 2e character sheet.*

#### Call of Cthulhu 7th Edition

For when the vibes turn from cozy to eldritch:

- Characteristics (STR, CON, SIZ, DEX, APP, INT, POW, EDU), plus a separate Luck Score
- Derived stats: HP, Sanity, Magic Points, Movement Rate
- Dodge, which starts at half DEX and is raised with skill points and improvements on the Skills tab, like any other skill
- Skills with base values and advancement tracking. On the **Skills** tab of **Edit**, each specialised list has an add control: Fighting and Firearms specialisations and sciences offer the rulebook's choices at their base values (Sword 20%, Bow 15%, Physics 1%) or **Other** to name your own, and **Add Language** and **Add Skill** add a row to name. Each added row has a name box and a remove button, and Art/Craft, Pilot, Survival and your own language each take a specialisation
- Weapons and attacks
- Backstory, personal description, and ideals
- Possessions and important people
- **Keeper's Notes**, on the Backstory tab, for the Keeper alone: only the DM of the investigator's campaign can see or change them, so the investigator's player and the rest of the table never see them. They stay with the campaign: moving the investigator into another campaign, bringing it into one when you accept an invitation, or copying it, leaves them behind.

*Screenshot pending — Call of Cthulhu 7e character sheet.*

#### Shadowrun 6th Edition

Street magic meets corporate dystopia:

> **Note:** Shadowrun 6th Edition is planned, not available yet. CozyVTT has groundwork for its rules, but no character sheet, so it is left out of the lists you pick a game system from.

#### Flexible System

Running a homebrew game or a system that doesn't have a dedicated sheet? The **Flexible** sheet is a customizable, free-form character sheet where you define your own fields and sections. Perfect for rules-light games, narrative systems, or anything in between.

A Flexible sheet can hold up to 100 sections. A stats section holds up to 200 stats, a list or a table up to 1,000 rows, a table up to 50 columns, and a text section up to 100,000 characters.

To put the sections, or the entries of a list, in another order, drag them up or down. With a mouse you can take hold of one anywhere but in a text box; on a phone or a tablet, take hold of the grip, the six dots at its left, so that a swipe anywhere else scrolls the sheet.

*Screenshot pending — Flexible character sheet.*

---

## The Asset Library

The Asset Library is where all your campaign media lives — maps, token images, ambient audio, and avatar images.

*Screenshot pending — Asset Library grid view.*

### Asset Types

| Type | What it's for | Files it takes |
|------|--------------|----------------|
| **Map** | Battle maps, dungeon layouts, world maps | PNG, JPEG or WebP |
| **Token** | Character portraits, monster icons, object images | PNG, JPEG, WebP or GIF |
| **Audio** | Ambient soundscapes, background music | MP3, Ogg or WAV |
| **Avatar** | Your personal profile picture | PNG, JPEG or WebP |

A PNG that is animated is refused for now, for every kind of picture.

A map, token or avatar picture can be at most 16,384 pixels wide and 16,384 pixels tall (a WebP at most 16,383, the most the format allows). An animated GIF or WebP also has limits, because every player's browser unpacks every frame of it:

| Limit for an animated picture | Map | Token or avatar |
|------|-----|-----------------|
| Frames | 1,000 | 1,000 |
| Pixels across all its frames (width × height × frames) | 200 million | 50 million |

For example, a token animation of 1,000 × 1,000 pixels can have up to 50 frames. A picture over a limit is refused, and the upload window says which limit and by how much; make it smaller, or give it fewer frames, in an image editor and upload it again. Pictures uploaded before these limits came in are kept as they are.

An Ogg sound file is taken whatever it was recorded in, Opus included. An Ogg file in FLAC or Speex uploaded before version 1.5.2 may not play; upload it again.

Rulebooks and handouts are not here. They have their own **Documents** section, described below, so a PDF never sits among your map thumbnails.

### Uploading Assets

Click **Upload Asset** to add a new asset. You'll choose:
- The file to upload
- A name for the asset, up to 200 characters (the file's own name is filled in for you)
- An optional description, up to 1,000 characters
- The **scope** — where this asset lives:
  - **Personal** — Only you can see and use it
  - **Campaign** — Shared with everyone in a specific campaign: one you run, or, for a token picture, one you play in
  - **Global** — Available platform-wide (Admin/Global Asset Manager only)
- Optional tags for easy filtering later: up to 50, each up to 50 characters

*GIF pending — Uploading a new map asset.*

### Finding Assets

Use the **search bar** to find assets across your whole library, by part of a name or by a whole tag. Filter by scope (Global, Personal, Campaign), type (Maps, Tokens, Audio, Avatars), and sort by date, name or size; the sort covers the whole library too. The library shows 24 assets at a time; once there are more, **Previous** and **Next** under the grid move between pages. The tag chips under the toolbar are the tags on the page on screen: click one to show only the assets on that page with that tag.

### Viewing and Managing Assets

Click any asset card to open its **detail panel** on the right, with its preview, description, tags and details. Tags cannot be changed after the upload. The panel also lets you move it to another library with **Move to…** and delete it, where you may: an asset you uploaded (one in a campaign's library while you are still in that campaign), any asset in the library of a campaign you run as its DM, and any asset at all for a server admin. Only the person who uploaded an asset can move it to **Personal**, which is their own library. An avatar always stays in your personal library. Press **Escape**, click **Close** (the **×** at its top) or click outside the panel to close it.

**Deleting an asset asks first, and warns you if it is still in use.** The first question names the asset. If a map, a token, a character, a character template, a creature, a token template, a campaign's ambient sound or the sound of one of a campaign's times of day still uses it, nothing is deleted yet: a second window lists where it is used, and the file is removed only if you choose **Delete anyway**. A deleted file cannot be brought back, and everything in that list is left without its picture or sound. You see names for the campaigns you run, your own characters and shared character templates; anything else is only counted ("2 maps you cannot see"), so the list never reveals other people's campaigns. Documents work the same way from the Documents page. An administrator deleting a file from the **Assets** tab of the Admin Panel is asked the same two questions, and sees everything in the list by name, whoever's campaign it is in.

*Screenshot pending — Asset detail panel.*

### Files with no owner, and leftover files (admins)

Two kinds of file can end up reachable by administrators alone. Both are found on the **Assets** tab of the Admin Panel.

**Files with no owner.** When an account is deleted, its avatar and the personal files nothing uses are deleted with it, and the files it uploaded that a campaign still uses stay, with no owner. A personal file that only one campaign uses or shares becomes that campaign's own when the account was in that campaign, so its table goes on seeing it; one that several campaigns use, a campaign the account was not in, or something outside a campaign such as a character template, stays personal with no owner, and the **Activity** tab gets a line naming it. A campaign's own files that outlive their uploader and then their campaign end up the same way. To list them, set the **Uploader** filter to **No Uploader (account deleted)**. Documents are listed only when the **Type** filter is set to **Document**. From there each one can be moved to Global or into a campaign, so people can use it again, or deleted.

**Leftover files.** These are files in the uploads folder that no asset names at all: for example a file that could not be removed when its asset was deleted, or one that a restored backup brought back although the restored database does not know it. Nothing in CozyVTT shows or uses them; they only take up disk space.

1. Under **Leftover Files**, press **Check for Leftover Files**. You see the list, each file's size and when it last changed, and the total. Checking deletes nothing. At most 5,000 files are listed at a time; once those are deleted, check again for the rest.
2. If you want them gone, press **Delete *N* Files** and confirm. Each file is checked again first and kept if an asset names it by then. You are told how many were deleted and how many were kept.

A file changed in the last hour is not listed, since an upload may still be finishing; the check tells you how many it left out, and checking again later lists them. A deleted file cannot be brought back without a backup of the uploads folder. Only the folders CozyVTT writes uploads to are looked at; anything else you keep in the uploads folder is left alone. Do not run the check while a backup is being restored.

**How full the disk is.** CozyVTT does not limit how much one account uploads in total, so keep an eye on the disk. The **System Overview** on the Admin Panel's **Dashboard** tab shows, under **Storage**, how much space is free on the disk that holds the uploads. Once that disk is more than 80% full, a red warning at the top of the page says how full it is and what to do: delete files nobody needs from the **Assets** tab, delete old backups, or move the uploads folder to a larger disk (see [File Storage](DEPLOYMENT.md#file-storage)).

---

## Documents

Rulebooks, house rules, handouts: the things a table reads rather than looks at. **Documents** on your dashboard keeps them apart from maps and tokens, and lets you read them without leaving CozyVTT.

### What you can keep here

| Format | How it gets here | Editable later? |
|--------|------------------|-----------------|
| **PDF** | Upload | No, it is a file; upload a new one to replace it |
| **Plain text** (`.txt`) | Upload, or **Write one** | Yes, by whoever uploaded or wrote it (see [Editing](#editing)) |
| **Markdown** (`.md`) | Upload, or **Write one** | Yes, by whoever uploaded or wrote it (see [Editing](#editing)) |

Markdown documents render headings, lists, emphasis, tables, task lists and links. A single press of Enter starts a new line, the way it does in a chat message, so notes read the way you typed them.

The size limit is set by whoever runs your instance; the default is 50 MB, enough for most rulebook PDFs. Written documents are limited to about 900 KB of text, which is a very long document, and anything bigger is a file to upload.

### Who can read a document

This is decided by where you put it when you upload or write it:

| Scope | Who can read it |
|-------|-----------------|
| **Personal** | You alone, until a DM shares it with a campaign (see below). |
| **Campaign** | Every member of that campaign, immediately. Only the campaign's DM can put a document here. |
| **Global** | Everyone on the instance. Only an administrator or a global asset manager can put a document here. |

A DM can share their own documents, and Global ones, with their campaign from inside it, and stop sharing later. A document someone else shared with a table you play at is yours to read there, not to share on. Sharing does not copy the file; the campaign's members read the same document you have, and if you edit it they see the new text next time they open it.

### Reading

Click a document's name or its **Read** button to open it in a full-screen reader over whatever page you are on. **Open in a new tab** does what it says, for reading on a second screen while play continues. A PDF is shown by your browser's own PDF viewer. Firefox on a computer shows it inside the reader. Chrome, Edge, Safari and phone browsers will not show a PDF inside another page, so there the reader says so and offers **Open this PDF in a new tab** in its place. If a PDF does not appear in Firefox, use **Open this PDF in a new tab** above it, or **Open in a new tab** at the bottom of the reader.

### Editing

Open a text or Markdown document and press **Edit**. Who can edit a document is who can delete it, and **Edit** in the reader and the bin button on the **Documents** page show only for someone who can:

| Scope | Who can edit it |
|-------|-----------------|
| **Personal** | You, and an administrator. |
| **Campaign** | Whoever wrote or uploaded it while they are still in the campaign, the campaign's DM, and an administrator. Someone who leaves or is removed from the campaign can no longer edit what they put there. |
| **Global** | An administrator, and whoever wrote or uploaded it while they are still a global asset manager. |

What you type is saved exactly as typed, and replaces the old text all at once: a save the server cannot finish, because it was restarted for example, leaves the document as it was before. If a save is refused, your text stays in the box and the reason is shown. Closing the editor or the **New document** window with Escape, the X or Cancel asks first once there is something typed or changed, and **Keep writing** or **Keep editing** takes you back to the text. Nothing is asked when there is nothing to lose.

### Safety

Uploads are checked rather than trusted. A PDF must really be a PDF, and a text or Markdown file must really be text; a program renamed to `.md` is refused. Documents are always shown as text or as a PDF, never as a web page, so a file that contains HTML or a script is displayed as-is and nothing in it can run. There is no need to avoid typing `<` or `>` in a document; they show as typed.

Pictures in a Markdown document or note only load from your own CozyVTT, and only a map, token or avatar picture from the asset library. An image that points at another website would make every reader's browser contact that site, revealing who opened the document, and one that points anywhere else on your CozyVTT would make every reader's browser ask for that page as them; instead its description (or *image not shown*, when it has none) is shown and nothing is fetched. To show a picture, upload it to your asset library as a map or token image and use its address, which looks like `/api/assets/maps/` or `/api/assets/tokens/` followed by a long id: for example `![The old mill](/api/assets/maps/bc5f19c0-158b-4330-a5cc-6133666a4fec)`. To find it, right-click the picture in the **Asset Library** and choose your browser's **Open image in new tab**: the address bar of the new tab shows it.

Links in a document or note open in a new tab, so following one never takes you away from the table.

---

## Running Sessions

This section is primarily for players during an active session. For DM-specific features, see the [DM Guide](DM_GUIDE.md).

### Joining a Session

Navigate to your campaign from the dashboard and connect to the session. If the DM has started a session, you'll see a live status indicator in the header.

*GIF pending — Connecting to an active session.*

The campaign page reconnects by itself whenever the connection drops, however long it is gone, and your position is restored when you come back (see [I lost connection mid-session](#i-lost-connection-mid-session)).

### The Chat Panel

The **Chat** panel on the right sidebar is how everyone communicates during a session.

*Screenshot pending — Chat panel with example messages.*

Type your message in the input field and press **Enter** to send. Messages show your display name and a timestamp. System messages (like session start/stop events) appear in a different style. A message can be up to 2,000 characters; the count appears under the box as you get close.

Your message shows as *sending…* until the server has it. If it doesn't get through (the connection dropped, or the DM's chat cooldown hasn't run out yet), it is marked **Not sent** with the reason. Click **Retry** to send it again, or **Discard** to remove it. If the first try did reach the server after all, retrying within ten minutes does not post it twice (a restart of the server in between forgets that it arrived).

While you are scrolled up reading earlier messages, new ones don't pull you down; a **Jump to newest** button appears at the bottom instead, and takes you to them. The **Dice** panel does the same for new rolls.

The chat holds the newest 400 messages. While you are at the newest message, the oldest leave the panel as new ones arrive, and **Load More**, at the top of the chat, brings back older messages 50 at a time. Nothing is deleted: the whole history stays on the server. The count beside the **Chat** heading says how many are shown. While you are scrolled up, the oldest leave only once the chat holds 800, and what **Load More** brought back stays until 400 more have arrived; a message marked **Not sent** stays until you retry or discard it.

#### Whispering to one person

A whisper is a message that only you and one other member of the campaign can see.

1. In the **To** list above the message box, choose the person. The DM has a group of their own at the top, **DM** (or **DM, not in session**). The other members in the session right now come next, under **In session**, and the rest under **Not in session**.
   You should see "Only you and Mara can see this." under the box (with their name in place of Mara's). When the person is the DM, the DM's shield shows beside it.
2. Type your message and press **Enter**.
   It appears in the chat with a lock, **Whisper to Mara** and its own colour. Mara sees it with a lock and **Whisper from** your name.
3. To talk to the whole table again, choose **Everyone** in the **To** list. The list keeps the person you chose until you change it.

To whisper a single message without changing the list, start it with `/w` (or `/whisper`) and the person's name, such as `/w Mara Meet me by the well`. A name with a space in it works as you would type it (`/w Mara Lee Over here`), and the start of a name is enough when it fits only one person. As you type, the line under the box names who the message will reach, whatever the **To** list says, so check it before you press **Enter**. If the name fits more than one person, or nobody, the line says so, and the message is not sent; choose the person in the **To** list instead.

**Two members with the same name** are never shown alike, since anyone can choose their own name:

| When | What is shown beside the name |
|---|---|
| Two members share a name | Their role, and a player's character: **Dana (DM)**, **Mara (Player, Vex)**, **Mara (Player)**, **Ash (Spectator)** |
| That is still the same for two of them | The day each joined: **Mara (Player, joined 3 Oct)** |
| They joined on the same day | Their order of joining, the earlier first: **Mara (Player, joined 3 Oct, 1)**, **Mara (Player, joined 3 Oct, 2)** |

A name alone cannot make someone the DM: only the real DM is in the **DM** group and gets the shield under the box.

To reply to a whisper, click **Whisper from** (or **Whisper to**) on it: the **To** list switches to that person.

**Who can read a whisper:** you and the person you chose, and nobody else. The DM sees a whisper only when they are one of the two. Whispers stay in the chat history like other messages, so the two of you see them again after a refresh. They are stored on the server like all chat, so whoever runs the server can read them in its database and its backups.

If the person leaves the campaign, the **To** list keeps them and says they are no longer in the campaign, and a whisper to them is marked **Not sent**. **Retry** on a whisper that was not sent sends it to the same person again.

### Rolling Dice

The **Dice Roller** has its own **Dice** tab beside Chat. Click one of the dice under **Quick Roll** (d4 to d100) to roll it, or type a custom expression and press **Enter** or **Roll**.

*GIF pending — Rolling dice and seeing the result in the Dice panel.*

**Saving a roll you use often.** Press **Saved** below the dice buttons to keep a
named roll — a house rule, a homebrew subsystem, `4d6kh3` for rolling up a
character. It becomes a one-click button beside the dice. Saved rolls are private
to you and belong to the one campaign, and the same button is where you rename,
edit or delete them. See the
[Player Guide](PLAYER_GUIDE.md#the-dice-roller) for the full description.

**Supported dice notation:**
- `d20` — Roll a single d20
- `2d6` — Roll two d6s and sum them
- `4d6kh3` — Roll four d6s and keep the highest three (great for ability score generation!)
- `1d20+5` — Roll a d20 and add 5
- `2d6-1` — Roll 2d6 and subtract 1
- `4d6dl1`: Roll four d6s and drop the lowest one
- `1d20*2`, `4d6/2`: multiply or divide; multiplication and division come first, and a fractional total is rounded down

One roll can hold up to 100 dice in all (the [Player Guide](PLAYER_GUIDE.md#the-dice-roller) lists the other limits).

Dice results go to the **Dice** panel, where everyone can see them. It keeps a
running list of the latest 50 rolls, oldest at the top and newest at the
bottom, and it follows along as they come in unless you have scrolled up to read
something earlier. A roll of your own always brings you down to it. The list
survives a refresh.

**Secret rolls.** Tick **Secret Roll** before rolling and the other players
never see it. Your DM does — deliberately, so they can settle an argument about
what was really rolled — and the checkbox says so. Your own secret rolls stay in
your list marked **🔒 Secret**, so you can look back at them; the **Secret**
button at the top of the panel, which appears once the list holds a secret roll,
hides them from your own view if you would rather
keep the list to open rolls, which changes nothing for anyone else.

### Your Own Notes

The **Notes** tab is yours alone. Keep up to 200 for each campaign — a
plan for next session, what the party has worked out about the villain, a
running list of who owes whom money.

Notes are written in **Markdown**, so headings, lists, bold, quotes and links
all work, and the eye button switches to a laid-out preview. Pick between them
from the dropdown, and **+** starts a new one. They save themselves a moment
after you stop typing; the line underneath tells you whether everything is
saved.

**These are private.** Nobody else can read them — your DM included. That is
enforced by the server, not just hidden in the page. A single note can run to
100,000 characters, roughly fifty printed pages.

### Past Sessions

The **Session** tab has a **Past Sessions** list: every finished session,
newest first, with its date, how long you played, and whatever the DM wrote
about it when they ended it. It is the thing to read before the next game.

Everyone in the campaign sees the same list. A session the DM wrote nothing for
still appears, marked as having no notes.

### Moving Around the Map

The toolbar at the top left of the map holds the controls for your own view; point at a button to see its name. On a phone the toolbar has fewer buttons and the rest are under its **More** (see [The campaign page on a phone or tablet](#the-campaign-page-on-a-phone-or-tablet)). On a map too narrow for them in one row, such as a tablet's with both side panels open, the buttons wrap onto a second row, and the panels below the toolbar move down to make room. Nothing you do there changes anyone else's view, except a **Ping** and what you draw, which the whole table sees.

| Control | What it does |
|---|---|
| **Zoom Out**, **Zoom In** | Change the zoom, from 10% to 300%, keeping the middle of the map view where it is. The current zoom is shown between them. The mouse wheel zooms too, towards the pointer, and on a touch screen so does pinching two fingers on the map, about your fingers |
| **Fit to Screen** | Shows the whole map in the space available |
| **Toggle Grid** | Shows or hides the grid lines, which start shown. While they are shown, the **Grid Color** button beside it switches them between black and white |
| **Ruler**, **AoE Shape** | Measure a distance and lay a spell area over the map (see [Measuring and Spell Areas](PLAYER_GUIDE.md#measuring-and-spell-areas)) |
| **Ping** | The next click or tap on the map shows everyone that spot, as **Tab** does over the map (see [Pointing at the Map](PLAYER_GUIDE.md#pointing-at-the-map)). Click it again, or press **Esc**, to put it away without pinging. On a touch screen, two quick taps on empty ground ping too, while no tool is up |
| **Draw** | Opens the drawing tools: a pen, lines, arrows, rectangles, ellipses, polygons, text labels, an eraser and a laser pointer, in a colour and width you choose. The table sees what you draw as you draw it. The DM always has it; a player has it while the DM lets players draw, except while the session is paused or has ended; while they may not draw, it offers only the **Eraser** and **Clear mine**, and only while the map holds drawings of theirs; a spectator does not have it (see [Drawing and pointing](PLAYER_GUIDE.md#drawing-and-pointing) and, for the DM, [Drawing on the map](DM_GUIDE.md#drawing-on-the-map)) |

To move the view, drag an empty part of the map; on a touch screen, drag it with one finger.

### Moving Your Token

When the DM has placed your character's token on the map, you can move it: **click** the token to pick it up, move the pointer to where you want it, and **click** that square to put it down. Right-click, press **Esc**, or move the pointer off the map, to put it back where it was.

Clicking the token also selects it. Then the arrow keys move it one square at a time, or five with **Shift**, and **[** and **]** turn it (see [Moving Your Token](PLAYER_GUIDE.md#moving-your-token) in the player guide).

On a touch screen, put your finger on the token, slide it to the square and lift; or tap the token, then tap the square. A token you have tapped stays in your hand, drawn faded on its own square, while you move the map; to put it back, tap the square it came from. See [On a touch screen](PLAYER_GUIDE.md#on-a-touch-screen) in the player guide.

*GIF pending — Moving a player token.*

Token movement is broadcast to everyone in real time — your party can watch you walk into that very suspicious hallway.

> **Note:** Token movement is disabled while the session is paused and after the DM has ended it, until the next session starts.

### The Vibe Tracker

The **Vibe Tracker**, in the **Session** tab, shows the time of day the DM has set for the scene: dawn, day, dusk and night by default, or periods the DM has named. Each one tints the whole map with its own colour filter, and the header shows which is current.

It's your DM's way of setting the tone without breaking the narrative.

*Screenshot pending — Vibe tracker showing the current period.*

### The Initiative Tracker

The **Initiative** tab on the right sidebar shows the turn order as the DM adds combatants, who's active once combat starts, and HP for creatures whose HP bar the DM has turned on and for any creature token you control; your own character's hit points are on your sheet and roster card, not in the tracker. A creature the DM has hidden is not listed, nor one on a map the DM has not switched to, nor one on the other plane when the DM uses the spirit layer; one that is merely out of your sight is.

*Screenshot pending — Initiative tracker panel during combat.*

During your turn, you'll see your name highlighted. Use your token to move and the chat to narrate your actions!

Whoever's turn it is also gets a pulsing gold ring around their token on the map, so it's clear which creature is acting even when several look alike. Hovering a name in the tracker outlines that token on the map, and hovering a token on the map tints its row in the list. Right-click a character's name in the tracker for their sheet and, on your own character, its rolls; double-click it to open the sheet.

---

## Advanced Features

### Session State Saving

CozyVTT saves as you play: token positions, fog, walls, lights, chat and dice history, and the atmosphere are all stored the moment they change, so there is no save button and nothing is lost by closing the page. When you come back, everything is right where you left it. The one exception is an initiative order, which lasts only while the server is running.

Ending a session records it, with the DM's notes, under **Past Sessions**.

### Multi-Map Support

A campaign can have multiple maps loaded at once. The DM can switch the active map at any time, and all players are taken to the new map immediately. Great for transitions between locations without stopping the action.

*GIF pending — DM switching maps mid-session.*

### The Spirit Layer

The Spirit Layer is a second plane for the map, used for games where some characters can perceive things others can't — astral space, the ethereal plane, the spirit world. It is a separate plane rather than a see-through overlay: a player viewing the spirit realm sees the tokens on that plane instead of the ordinary ones, including instead of their own. The DM chooses which tokens live on it, who can see it, and the visual style.

If you are a player and the map has gone dark or your token has vanished, ask your DM whether the Spirit Layer is switched on — see [The Spirit Layer](DM_GUIDE.md#the-spirit-layer) in the DM guide.

*Screenshot pending — Map with spirit layer overlay.*

### Ambient Atmosphere

DMs can set ambient audio tracks and visual atmosphere effects from the Atmosphere panel. Six visual overlays are available — rain, mist, leaves, sparkles, snow, and wind. Players hear the audio and see the visual effects automatically when connected to an active session.

The track your DM chooses is fetched by your own browser from the instance, which is why you can hear a track that lives in the DM's personal library. That access lasts as long as the track is playing and covers only that one track.

*Screenshot pending — Atmosphere controls panel.*

### Dynamic Lighting

When a DM enables dynamic lighting on a map, players only see what their tokens can make out: bright light shows clearly, dim light and the dark within a token's **darkvision** show half-dark, and everything else is black. A token's darkvision (in grid squares; 12 is 60 ft at 5 ft a square) is set by the DM and starts at none. A map's **Global Illumination** setting makes everything in line of sight count as lit; maps made before 1.5.0 have it on, which is how lighting always behaved. Areas a player has explored stay on their map in grey until they can see them again; each player has their own memory of a map, and the DM can turn it off per map or reset it. Light sources placed by the DM have two radii:

- **Bright radius** — full visibility, strong glow (e.g. the inner 20 ft of a torch)
- **Dim radius** — reduced visibility with a fainter glow (e.g. the outer 20 ft of a torch)

Where two dim light zones overlap, the area is treated as bright light. This matches the light rules in D&D 5e, Pathfinder 2e, and most other TTRPG systems.

**Light does not see for you.** A lit area is only visible to you if your token
could actually see it — walls block sight as well as light, so a lamp burning
inside a closed room shows you nothing from outside it, and the creatures in
there stay hidden until you can see in. Your token's **darkvision** governs how
far you make things out in the dark; it does not stop you noticing a lit room
across a courtyard once you have a clear line to it.

*Screenshot pending — Map with dynamic lighting and bright/dim zones.*

### Appearance & Theming

CozyVTT theming works in two layers:

**Per-user (every account)** — From your **Profile** page you pick the theme and font *you* want to see when you're logged in. Your choice is saved to your account and persists across logout/login. See the [Your Profile → Themes](#themes--fonts) section below.

**Instance default (admin only)** — Platform administrators set the default theme used on the login page and applied to brand-new users until they pick their own. Configured under **Admin Panel → Appearance**:

- **Default theme** — 16 built-in themes spanning warm, cool, dark, neutral, and vibrant palettes
- **Default font** — 8 open-source font families (Quicksand + Inter default, plus medieval, elegant, handwritten, etc.)
- **Custom theme builder** — primary, accent, background, and text colors; complementary shades derived automatically. The picker shows a live **Readability** check with the contrast ratio of each key text/background pair, flagging anything below the 4.5:1 minimum, and CozyVTT adjusts text shades automatically where it can
Changes preview live as you configure them.

**Custom branding (logo, mascot, favicon)** is not part of the Appearance panel yet. The instance
already honours custom images — they appear on the login page and across the app, system-wide
regardless of each user's theme — but there is no upload screen, so a self-hoster sets them by
**replacing the default images** in `frontend/public/` (`default-logo.png`, `default-mascot.png`,
`favicon-32.png`, `favicon-192.png`) and rebuilding.

The branding settings on `PUT /api/admin/settings` name a path this instance serves, such as
`/default-logo.png`. An address on another website is refused: it would have every visitor's
browser contact that site before they have even signed in, and the app only displays images it
serves itself.

An admin upload UI is on the roadmap — see [Future Features](FUTURE_FEATURES.md).

---

## Your Profile

Click your avatar (the round picture at the top right of the dashboard) to reach your **Profile & Settings** page.

*Screenshot pending — Profile page.*

### Updating Your Profile

Click **Edit** beside **Profile Information** to change your display name or bio, then click **Save Changes**. Your email address is shown there but cannot be changed (see [How do I change my email address?](#how-do-i-change-my-email-address)).

The Profile page takes a display name of 2 to 50 characters, and a bio of up to 500. Invisible characters, such as zero-width spaces and the marks that turn text round to read right to left, are removed when it is saved, so a name cannot look blank or pretend to be someone else's by reversing part of it. The invisible joiners that emoji such as families and skin tones, and Persian, Urdu and Indic names, need are kept only where the characters on both sides are neither spaces nor plain ASCII (the unaccented English letters, digits and punctuation of a US keyboard), so a joiner between two accented letters such as é is kept too; next to a plain ASCII character or a space, at either end, or two in a row, they are removed. The invisible tags that make up the Scotland, Wales and England flags are kept in those flags and removed anywhere else. Display names are not unique: someone else on your instance can have the same one.

**Uploading an Avatar:**
Click on your current avatar (or the placeholder) to choose an image file (JPEG, PNG or WebP). The **Crop Avatar** window opens: drag the picture to frame it and use the zoom slider to dial in exactly the right framing, then click **Apply & Upload** to save.

A new avatar replaces the old one: the old picture is deleted from the server. **Remove Avatar**, under your avatar, takes it away and deletes the picture, and you are shown with the placeholder again. Deleting your avatar picture from the **Asset Library** does the same. A picture you have also used somewhere else, such as a token's picture, is kept until nothing uses it, but it is no longer your avatar.

*GIF pending — Avatar crop and upload flow.*

### Changing Your Password

In the **Security** section, enter your current password and your new password (twice, to confirm), then click **Change Password**.

A wrong current password is said on the form ("Current password is incorrect"), and what you typed stays in the boxes. The same goes for the password, and the code, asked for when you delete your account, turn MFA off or make new backup codes.

**Changing your password signs you out everywhere else.** Any other browser or
device still signed in to your account is signed out straight away, and an open
game table on it is disconnected in the same moment and taken to the sign-in
page, which says why, unless a character sheet is open there with unsaved changes, which stays
open and says how to sign in again; the one you are using stays where it is. If you ever think somebody else has got into your account, changing
your password is what removes them. Turning off MFA does the same thing, and so
does resetting your password from the sign-in page's **Forgot password?** link,
which signs out every device, the one you are holding included. Changing or
resetting your password also cancels any reset or invitation link you have been
emailed and not used.

### Multi-Factor Authentication (MFA)

For extra account security, press **Enable** beside **Two-Factor Authentication** in the **Security** section. You'll be asked for your current password first, then use an authenticator app (like Google Authenticator, Authy, or 1Password) to scan a QR code. After that, every login will ask for a one-time code.

**Turning MFA on signs you out everywhere else**, as turning it off does: any other browser or device signed in to your account is signed out, and the one you are using stays where it is.

**Each code works once.** If you sign in on two devices within the same half-minute, the second one will refuse the code you just used; wait for your app to show the next one. After five wrong codes in 15 minutes, the code step is locked for your account for a while, from every device.

**You have five minutes to enter the code** after your password is accepted. After that the page says "Your sign-in timed out at the code step. Sign in again with your password.", and you start again from the sign-in page. Changing or resetting your password also ends any sign-in that was waiting at the code step, on every device. **Back to login** on the code page ends the waiting sign-in too, so you can start again with another account or password.

You'll also receive 10 **backup codes** when you set up MFA: store these somewhere safe. They're your lifeline if you lose access to your authenticator app: on the code page, **Can't access your app? Use a backup code** takes one in place of the code, and each one works once. They are shown once: until you tick the box saying you have saved them, the browser asks before you reload or close the page. If you lose them anyway, make new ones from **Backup Codes** on your Profile page, with your password. The Profile page shows how many you have left beside **Enabled** (for example "7 of 10 backup codes left"), and after you sign in with a backup code a line at the top of the next page says how many remain, with a reminder to make new ones once three or fewer are left.

**Administrators must use MFA.** If your account is a platform administrator and MFA is off, a banner on every page says by which date it has to be on (7 days from when your account became subject to the rule: the upgrade that introduced it, your account's creation, the moment you were made an administrator or, if you were invited, the moment you set your password from the invitation email, whichever is latest), with a **Set it up now** link to the setup page. After that date the app takes you to the setup page, and until MFA is on the account can do only three things: set it up, change its password, or sign out. Other accounts are not affected. An administrator cannot turn MFA off; if you lose your authenticator and your backup codes, another administrator can reset it from **Admin → Users**, which gives you 7 days to set it up again.

### Themes & Fonts

From the **Appearance** section of your profile, pick the color theme and font *you* want to see across the app:

- Browse 16 built-in themes in warm, cool, dark, neutral and vibrant palettes
- Pick from 8 open-source font families
- Or click **Custom** to dial in your own primary / accent / background / text colors

Your choice is saved to your account and applies immediately. While you drag one of the **Custom** colours, the page follows the colour as it changes and saves it once you let go for a moment. It also persists across logout — when you log back in, your theme is restored. Unauthenticated visitors and brand-new users see whatever theme the platform admin has set as the instance default.

### Signing Out

Click **Sign Out** in the Danger Zone section, or **Logout** at the top of the dashboard, to log out.

---

## Troubleshooting & FAQ

### CozyVTT does not open on an old phone, tablet or computer

CozyVTT needs Chrome or Edge 111, Firefox 128 or Safari 16.4 (iPadOS 16.4 on an iPad), or a newer version: Chrome, Edge and Safari from 2023, Firefox from 2024. An older browser may not load the app, or may draw parts of it wrongly. Update the browser, or the device's system software if that is what holds the browser back. An iPad that cannot update past iPadOS 15 needs another device. A phone or computer that installs its browser updates is not affected.

### I can't connect to my campaign

- Check that you have an active internet connection
- Look at the connection indicator in the campaign header; it turns green once you're connected. You don't need a live session to connect
- Try refreshing the page — CozyVTT will reconnect automatically
- If the problem persists, check with your platform administrator that the server is running

### A page says "Can't reach the server"

CozyVTT did not answer when the page checked who is signed in, usually because the server is restarting, being upgraded or being restored from a backup. A restart or an upgrade does not sign you out. The page tries again by itself, after a few seconds and then every 30 seconds, and opens as soon as the server answers; **Try Again** checks at once. If it stays for more than a few minutes, ask your platform administrator whether the server is running.

### A page says "The instance is being restored from a backup"

An administrator is restoring CozyVTT from a backup. When the restore starts, an open campaign page goes to the sign-in page, which says "The instance is being restored from a backup. Sign in again once it has finished." Until it has finished, signing in answers "The instance is being restored from a backup. Try again in a minute; everyone signs in again once it has finished." and a page you open says "Can't reach the server". Wait a minute or two and sign in again: a finished restore signs everyone out, and everything is as it was when the backup was made.

### My token disappeared from the map

Token placement is managed by the DM. If your token isn't on the map, ask your DM to place it. Character assignment to a campaign must happen before a token can be placed.

### I can't see the maps or my character sheet is blank

This is usually a loading issue. Refresh the page. If the problem persists, check the Asset Library to make sure the map image was uploaded correctly.

If a character sheet window says **Error Loading Character Sheet**, that sheet holds something the page cannot show. Only the sheet window is affected: the map and the rest of the page carry on, and **Try Again** draws the sheet again. If it keeps happening, tell your platform administrator which character it is.

### I lost connection mid-session

CozyVTT reconnects by itself for as long as the connection is away, trying again every few seconds at first and then every 30 seconds, and at once when you come back to a tab or a phone screen you had left. The connection indicator shows **Connecting...** meanwhile. Your session state (token positions, etc.) is preserved, and chat messages other people sent while you were away, a pause or the end of the session, the map the table moved to, the vibe, the weather and ambient track, the spirit layer, and a dice history the DM cleared are all brought up to date once you're back. A chat message you send while disconnected is marked **Not sent**; click **Retry** once you are back. If the indicator shows **Connection Error** or **Disconnected**, press **Retry**, or refresh the page; everything should be right where you left it.

If the page says "You were removed from this campaign." or "This campaign was deleted.", the DM has removed you or the campaign is gone, and the page takes you to your dashboard. It says "You left this campaign." when you have left it, from this tab or another.

### Someone else is editing my character

Only you (the character owner) and the DM of an assigned campaign can edit a character. If you think someone else has access they shouldn't, contact your platform administrator.

### My dice rolls aren't showing up

Rolls appear in the **Dice** panel, the tab beside Chat — not in the conversation itself. If the panel is empty, check the connection indicator in the header: rolls need a live connection to the campaign. While the session is paused, rolls are worked out in your own browser and kept only there. If you're not on the campaign page, navigate there first.

### How do I change my email address?

Email addresses cannot be changed from the app. Contact your platform administrator. The Admin Panel has no control for it either: an admin changes it through the API, with `PUT /api/users/:id` (see the [API Reference](API_REFERENCE.md)).

### How do I delete my account?

Go to your **Profile** page and scroll to the **Danger Zone** section. Click **Delete Account**, type `DELETE` to confirm, enter your password, and click **Delete My Account**. This is permanent. It removes your account, your characters, your personal notes and your saved dice rolls. It also deletes your avatar, and every personal file you uploaded that nothing uses: a file in your own library that no map, token, character, template, creature or campaign sound uses, and that you have not shared into a campaign, is removed from the server, a moment after the page says your account is gone.

Your chat messages and the dice rolls you made stay in their campaigns, no longer linked to you. So do the files you uploaded into a campaign, and documents you shared into a campaign stay shared, so the table's history, its handouts and its own art are not lost. A whisper stays readable by the other person in it: one you sent by the person you sent it to, and one sent to you by its sender. Character templates you published stay in the shared library for everyone to use, and token templates and custom creatures you made as a DM stay in their campaigns, all no longer linked to you. Once your account is gone you cannot edit or delete them: a published template can then be removed by an administrator or someone allowed to edit templates, and a token template or creature by the campaign's DM. Delete any you want gone before you delete your account. A personal file that a campaign still uses, such as a map picture you chose from your own library, stays on the server with no owner. When only one campaign uses or shares it, and you are in that campaign, it becomes that campaign's own file and the table goes on seeing it. When more than one campaign uses it, or a campaign you are not in, none of them can show it until an administrator moves it, so move it where you want it from your asset library before you delete your account, if your role there allows it.

Every other browser or device signed in to the account is signed out at the same moment.

> **If you run a campaign,** whether you created it or were handed the DM seat, hand the seat to someone else in the campaign's settings, or delete the campaign, before you delete your account; until then the deletion is refused and tells you which campaigns are in the way. A campaign you created but someone else now runs as DM passes to them automatically.

If you are the instance's only admin, the deletion is refused with a message saying so: an instance must always have an admin. Promote another user to admin from the Admin Panel first, then delete your account.

### I forgot my password

Use the **Forgot password?** link on the sign-in page if your instance sends email. Otherwise contact your platform administrator; they can reset your password from the Admin Panel and give you a temporary password to log in with.

---

*For DM-specific features like map management, atmosphere controls, and running combat, see the [DM Guide](DM_GUIDE.md).*

*For a player-focused quick-start, see the [Player Guide](PLAYER_GUIDE.md).*
