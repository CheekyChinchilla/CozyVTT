# CozyVTT Player Guide

Welcome, adventurer! This guide will get you from "I got an invitation link" to "I'm rolling dice with my friends" as quickly and painlessly as possible.

No technical knowledge required. Let's go.

---

## Table of Contents

1. [Getting Your Account](#getting-your-account)
2. [Accepting a Campaign Invitation](#accepting-a-campaign-invitation)
3. [Creating Your Character](#creating-your-character)
4. [The Campaign Page](#the-campaign-page)
   - [Leaving a campaign](#leaving-a-campaign)
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

Your DM invites you by typing part of your display name into a search and picking your account from the people who match. Two people can have the same display name, and your profile picture is how your DM tells you apart. Here's what happens next:

1. **Log in** to CozyVTT
2. On your **Dashboard**, a **Pending Invitations** section appears below the Your Characters, Asset Library, Documents and Character Templates cards. An invitation sent while the dashboard is open shows up when you come back to the tab, or within a minute
3. Each invitation shows the campaign name and, after **DM:**, who runs the campaign
4. Click **View Invitation →** to open it. Tick the characters you want to bring, if you have any created already, then click **Accept Invitation**. Only characters of the campaign's game system are offered, and only ones not already in a campaign: a D&D 5e campaign takes D&D 5e characters, and a campaign set to Flexible takes Flexible characters
5. Or click **Decline** if it's not for you. An invitation runs out after 14 days, and the DM can withdraw it before you answer; either way it leaves your dashboard

*Screenshot pending — Pending invitations section.*

If you haven't created a character yet, you can accept the invitation without one and assign a character later. Jump to [Creating Your Character](#creating-your-character) and come back.

Once you've accepted, the campaign appears under **Your Campaigns** on the dashboard. Click it anytime to enter the campaign.

---

## Creating Your Character

Before you can fully participate in a campaign, you'll want a character. On your dashboard, click **Manage** beside **Your Characters** to get to your character library.

*Screenshot pending — Characters page (empty state).*

### Step 1: Start a New Character

Click **Create Character**. A dialog pops up asking you to choose a **Game System** — this determines which character sheet you'll fill out.

Ask your DM which system you're playing:

| System | What it's for |
|--------|--------------|
| D&D 5e | Dungeons & Dragons 5th Edition |
| Pathfinder 2e | Pathfinder 2nd Edition |
| Call of Cthulhu 7e | Horror and investigation (Lovecraftian) |
| Flexible | Homebrew or rules-light systems |

*Screenshot pending — New character dialog with game system options.*

### Step 2: Fill Out Your Sheet

Give your character a name and click **Create Character**. The dialog closes, **Character created successfully!** appears, and the new character is on your Characters page. Choose **Edit Character** from its card's menu (**⋮**) to open the **Character Editor**. This is your character sheet — fill it out just like you would on paper.

*Screenshot pending — Character editor (D&D 5e example).*

The sheet is split into sections depending on the system. Take your time — you can save partial work and come back. The header shows the last time you saved.

**A few things to know:**
- Click **Save** regularly. There's no auto-save and no keyboard shortcut — the header shows the time of your last save
- Leaving with unsaved changes asks you to confirm first, whether you use the back arrow or close the tab. Confirm and those changes are gone
- **Export** in the editor's header saves a local JSON backup of your character

### Step 3: Add a Profile Image (Optional)

Want your token on the map to look like your character? The sheet editor has a token image: pick a picture, and it is uploaded when you save and becomes your token's art when your DM places you on the map.

### Step 4: Assign to Your Campaign

Once your character is created, you'll need to assign them to your campaign so the DM can see them in the roster and place their token on the map.

From the **Characters** page:
1. Find your character card
2. Open the card's menu (**⋮**) and choose **Assign to Campaign**
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
- The **Campaign Roster** showing all players and their characters
- A small dot beside each person shows whether they're **in session** right now — green if they're connected, grey if not. Handy for telling "thinking" apart from "their internet fell over"
- A character with hit points on its sheet shows a bar on its card, with the current and maximum beside it. On your own character you also get a row of buttons to change them: **−5**, **−** (one down), **+** (one up) and **+5**. Your DM has them on every character. The minus buttons are damage, so in D&D 5e and Pathfinder 2e your temporary hit points go first
- Click a character to read its sheet. Right-click one for a menu (on a touch screen, press and hold it): **View Character Sheet** for anyone's character, and for your own **Roll...**, **Edit Character Sheet** and **Remove from Campaign**, which takes the character out of the campaign and keeps it in your library
- If you're curious about your fellow adventurers, it's all here
- **Your role** at the bottom of the **Campaign Info** panel, and under it **Leave Campaign**, which takes you out of the campaign after asking (see [Leaving a campaign](#leaving-a-campaign))

### Center — The Map
This is the battle map. During a session, you'll see your token here and can move it: click it to pick it up, then click where it should go ([Moving Your Token](#moving-your-token)). On a tablet, see [On a touch screen](#on-a-touch-screen). The toolbar at its top left zooms and fits the view, and you move the view by dragging an empty part of the map ([Moving Around the Map](USER_GUIDE.md#moving-around-the-map)).

### Right Sidebar — Your Tools
A tabbed panel — click a tab to switch between:
- **Chat** — Talk to everyone (an unread badge shows on the tab when messages arrive while you're on another tab)
- **Dice** — Roll your dice
- **Initiative** — See the turn order during combat
- **Notes** — Your own private notes (see [Your Own Notes](#your-own-notes))
- **Session** — The vibe and past sessions (the Live / Paused badge is in the header)

You can also drag the divider to resize the sidebar, or collapse it to give the map more room.

### The Header Bar
The top bar shows:
- Campaign name, a **Live** or **Paused** badge while a session is running or paused, and the current vibe
- Connection indicator — a dot that goes green when you're connected
- A **book icon** — the rulebooks and handouts your DM has shared with this campaign
- Navigation controls

*Screenshot pending — Campaign header with status indicators.*

### Rulebooks and Handouts

Press the **book icon** in the header to see what your DM has shared with the campaign: a rulebook, a page of house rules, a handout for the scene. **Read** opens it in a full-screen reader over the map, and the arrow beside it opens it in a new browser tab, handy for keeping the rules up on a second screen while you play. Only Firefox on a computer shows a PDF inside the reader. In Chrome, Edge, Safari and on a phone the reader offers **Open this PDF in a new tab** instead, as the arrow does.

You can read everything on that list and nothing that is not on it. Sharing is the DM's to do, so if a rulebook you expected is missing, ask them. If your DM edits a shared document, you see the new text the next time you open it.

You can keep documents of your own too, from **Documents** on your dashboard: upload a PDF, or write text or Markdown notes and edit them later. Those are yours alone unless a DM shares one with a campaign.

### Connection Status

When you first load the campaign page, CozyVTT connects to the live session. Look for the **connection indicator** in the header — it turns green when you're successfully connected. If you see a loading spinner, just wait a moment.

If you lose connection (WiFi hiccup, a server restart), CozyVTT keeps trying to reconnect by itself for as long as it takes: every few seconds at first, then every 30 seconds, and at once when you come back to the tab. The indicator shows **Connecting...** while it tries. When it shows **Disconnected** or **Connection Error** in red, the **Retry** button beside it tries straight away.

### If your DM hands you the game

A campaign has one DM, but that can be passed on — when a DM steps back, hands
over to a co-DM, or wants someone else to run a session. If it is passed to you,
your screen changes on the spot: you do not need to reload, and nothing about
your character changes. You keep it, and you can still play it.

What you gain is the DM's side of the campaign — the map, token, creature and
settings controls appear in the top bar, and the campaign's roster shows you as
the Dungeon Master. The person who handed it over becomes an ordinary player.

**Handing it back** is the same action in reverse: **Campaign Settings →
Members**, then the crown beside their name. If the campaign was originally
theirs they can also take it back themselves, so nobody is ever stranded.

If this happens unexpectedly, it is worth asking your DM — it is a deliberate
action somebody took, not something that happens on its own.

### Leaving a campaign

If you no longer want to play or watch, you can leave a campaign yourself; you
do not need to ask the DM.

1. Open the campaign and find **Your role** at the bottom of the **Campaign
   Info** panel, in the left sidebar.
2. Click **Leave Campaign** under it. A window asks whether you are sure and
   says what happens.
3. Click **Leave Campaign** in that window. You see "You left this campaign."
   and land on your dashboard, where the campaign's card is gone.

| What | After you leave |
|---|---|
| The campaign | You stop seeing it and playing in it straight away, in every tab you have it open in |
| Your characters in it | On **My Characters**, yours as before, in no campaign |
| Your tokens on its maps | They stay where they are; only the DM can move or remove them |
| Your place in the initiative order | It stays until the DM removes it |
| Your notes and saved rolls | Kept, and readable from your dashboard under **Notes From Campaigns You Have Left** (see [Your Own Notes](#your-own-notes)) |

To come back, ask the DM to invite you again. Your notes and saved rolls are
then in the campaign again; your characters you assign again yourself.

**If you see no Leave Campaign button,** the panel says why. The DM cannot
leave until they hand the DM seat to another member (**Campaign Settings →
Members**, then the crown beside that person, see [If your DM hands you the
game](#if-your-dm-hands-you-the-game)). Whoever owns the campaign cannot leave
it at all, since only the DM could let them back in; they can delete it
instead, on the **Danger Zone** tab of **Owner Settings** (of **Campaign
Settings** while they are the DM).

---

## Chat and Dice

Chat and dice are your two most-used tools. They each have their own tab in the right sidebar, one click apart during a session.

### The Chat Panel

*Screenshot pending — Chat panel with a few messages.*

Type your message in the input box at the bottom and press **Enter** to send. Your display name appears next to your messages.

Chat is for everything: in-character dialogue, out-of-character coordination, questions for the DM, celebrations when you roll a nat 20.

**Chat tips:**
- **System messages** (gray, slightly different style) announce session events like a session starting, pausing or ending
- **Dice results** appear in the **Dice** panel, the tab beside chat, not in the conversation itself
- **Whispers** reach one person only: choose them in the **To** list above the box, or start a message with `/w` or `/whisper` and their name (`/w Mara Meet me by the well`). The line under the box names who it will reach before you send it. Only the two of you see it, marked with a lock; the DM does not see whispers between players. See [Whispering to one person](USER_GUIDE.md#whispering-to-one-person)
- Scroll up to read the history, and press **Load More** at the top for older messages. The chat holds the newest 400 at a time, and the whole log stays on the server
- A message that doesn't get through, because the connection dropped or the chat cooldown is still running, is marked **Not sent**. **Retry** sends it again, and a message that did get through after all is not posted twice if you retry within ten minutes; **Discard** removes it

### The Dice Roller

*Screenshot pending — Dice roller panel.*

Under **Quick Roll**, click **d4**, **d6**, **d8**, **d10**, **d12**, **d20** or **d100** to roll that die. **Adv** and **Dis** roll a d20 with advantage or disadvantage, and **4d6kh3** rolls four d6 and keeps the highest three. Your result appears in the **Dice** panel immediately, where everyone at the table can see it. A roll you make from your sheet, the roster or the map's **Roll...** menu lands there too; if one doesn't go through, a message says why.

**Rolling custom expressions:**
Type directly into the expression input and press **Enter** or **Roll**. The optional **Character** and **Purpose** boxes under it put a name and a note on the roll for everyone to read, such as "Goblin" and "Scimitar damage", and the circular-arrow button beside **Roll** (**Clear all fields**) empties all the boxes. Supported notation:

| Expression | What it does |
|-----------|-------------|
| `d20` | One d20 |
| `2d6` | Two d6s, summed |
| `d100` | Percentile roll |
| `1d20+5` | d20 plus 5 |
| `2d6-1` | 2d6 minus 1 |
| `4d6kh3` | Four d6s, keep highest three |
| `4d6kl3` | Four d6s, keep lowest three |
| `4d6dl1` | Four d6s, drop the lowest one |

One roll can hold up to 100 dice in all, dice of up to 1,000 sides, and numbers up to 9,999, and the expression can be 200 characters long. Its total must stay within about 2.1 billion either way, however the dice land, and it can never divide by something that could be zero, so `1d20/0` and `9999*9999*9999` are refused. Spaces are fine around `+`, `-`, `*` and `/`, but two terms need an operator between them: `1d20 5` is refused, where `1d20+5` is meant. Anything over those limits is refused with a message saying which, and a roll made while the session is paused follows exactly the same rules.

*GIF pending — Typing a dice expression and seeing the result in the Dice panel.*

**Saved rolls.** Some rolls aren't on your character sheet and never will be — a
homebrew subsystem your table invented, a recurring `2d6+3` for a house rule,
`4d6kh3` for rolling up a new character, an attack the sheet can't describe.
Rather than retyping those every session, save them: press **Saved** under the
dice buttons, give the roll a name and an expression, and it becomes a button of
its own. Click it and it rolls, with its name as the roll's purpose, so the
**Dice** panel shows "Longsword" and not just `1d20+5`. Whatever is in the
**Character** box goes with it, as for a typed roll.

If you have just typed something into the expression box, opening **Saved**
carries it across, so naming it is the only thing left to do.

Your list of saved rolls is **yours alone** — not even your DM can see it, only
the name of one you roll — and saved rolls stay
with the campaign you made them in, so one table's homebrew doesn't clutter
another game. You can rename, edit or delete them from the same **Saved** button,
and you can keep up to 50 per campaign. If an expression can't be rolled, CozyVTT
says so when you save it rather than letting you find out later with a button
that never works.

**Why everyone saw my roll:** Dice results are public by default — everyone sees what you rolled unless you tick **Secret Roll** first (see *Secret rolls* below). When your DM rolls secretly, nothing reaches you at all, not even a notice that they rolled.

**Your roll history sticks around.** The panel reads like the chat beside it — a running list, oldest at the top, newest at the bottom — so you can see several rolls at once instead of stepping through them one at a time. It's kept on the server, so refreshing the page, closing the tab and coming back, or losing your connection for a minute won't wipe it. Only the DM can clear it.

**Secret rolls.** Tick **Secret Roll** and your result is hidden from the other players. It still appears in your own list, marked as secret, so you can look back at it. **Your DM can see it too** — that is deliberate, so they can settle a dispute about what was actually rolled. If you would rather not have your secret rolls cluttering the list, the **Secret** button at the top of the panel, which appears once the list holds a secret roll, hides them; that only changes your own view, and nobody else's rolls are affected either way.

Nobody else's secret rolls ever reach you. Not hidden in the page — never sent to your browser at all.

One thing to know: if the DM has **paused** the session, your rolls from the **Dice** tab are worked out in your own browser and aren't sent anywhere. Handy for messing about between scenes, but those rolls vanish if you refresh. A roll from your sheet, the roster or the map's **Roll...** menu still goes to the table as usual.

### Rolling from your sheet

Your character's sheet rolls at the table when you open it on the campaign page, from the **Campaign Roster** for instance. Click an ability, a saving throw, a skill or an attack to roll it, or a weapon's damage to roll that. The roll lands in the **Dice** panel named for what it was, such as "Dexterity Save". A small dice icon beside a stat says it rolls. A sheet opened from the **Characters** page doesn't roll, since there's no table there.

**Advantage and Disadvantage.** Right-click an ability, a saving throw, a skill or an attack for a small menu of **Normal**, **Advantage** and **Disadvantage**, and choose one to roll. On a phone or a tablet, press and hold the stat for half a second instead: the menu opens where your finger is, and you lift your finger and tap a choice. The stat doesn't also roll as you lift, and a finger that slides scrolls the sheet as usual and opens nothing.

| Choice | What is rolled | The Dice panel says |
|---|---|---|
| **Normal** | One d20, as a click rolls it | Dexterity Save |
| **Advantage** | Two d20s, keeping the higher (`2d20kh1`) | Dexterity Save (Advantage) |
| **Disadvantage** | Two d20s, keeping the lower (`2d20kl1`) | Dexterity Save (Disadvantage) |

On a Pathfinder 2e sheet the menu reads **Normal**, **Fortune** and **Misfortune**, which roll the same way. Click or tap anywhere else, or press **Esc**, to close the menu; the sheet stays open. Damage and hit dice have no menu, since the rules give advantage to ability checks, saving throws and attack rolls only. A Call of Cthulhu sheet rolls `1d100` and has no menu: its bonus and penalty dice aren't offered yet.

**Roll mode, for a run of rolls.** When several rolls in a row have advantage, set **Roll mode** in the sheet's header to **Advantage** (or **Disadvantage**). Every ability, saving throw, skill and attack you click or tap after that rolls that way, and the **Dice** panel says so on each one. It stays set until you change it back to **Normal** or close the sheet, starts at **Normal** each time you open the sheet, and is highlighted while it's set to anything else, so you can see it's on. Damage and hit dice still roll as written, and a choice in the menu goes for that one roll whatever **Roll mode** says. On a Pathfinder 2e sheet it reads **Normal**, **Fortune** and **Misfortune**. A Call of Cthulhu sheet has no **Roll mode**, and neither has a sheet you can't roll from, such as another player's character or a sheet opened from the **Characters** page.

---

## Moving Your Token

When the DM has placed your character's token on the map, you can move it: click the token to pick it up, move the pointer to where you want it, and click that square to put it down. Letting go of the mouse button does not put it down, so there is no need to hold it. Right-click, press **Esc**, or move the pointer off the map, to put the token back where it was. You can't move it while the session is paused or has ended.

**Selecting a token.** Clicking a token also selects it, and a dashed light-blue ring marks it until you click empty ground or select another; dragging the map leaves it selected. You can select any token you can see, yours or not, by clicking it; a right-click selects the token too when its menu opens for you. A token that isn't yours is only selected, never picked up. A screen reader says which token is selected and on which square.

**Moving from the keyboard.** Click the map first, so the keys go to it. With your token selected, the arrow keys move it one square, or five with **Shift**; if you're holding it, an arrow puts it down one square over from where it stood. **,** and **.** (or **<** and **>**) select your previous or next token, handy when you control more than one, and the map pans to keep it in sight. **Enter** opens the selected token's menu, and **Esc** lets go of one thing at a time: the menu, then the **Ping** button if you pressed it, then a token you're holding, then the ruler or the area template if you have one up, then the selection. The mouse's rules apply: no moving while the session is paused, and not onto a square someone else is standing on. The keys go to the map only while it has the keyboard: click anywhere else, such as on the chat, and they go there instead, and a window open over the map takes them too. Click the map again to take them back. A token you selected that the map no longer shows, because it has gone under fog, stays selected but the keys leave it alone. Every key is in [Keyboard Shortcuts](#keyboard-shortcuts).

*GIF pending — Picking up a player token and placing it across the map.*

Your movement is visible to everyone in real time — your party can watch you creep around the corner (or run straight into danger).

**Turning your token.** To show which way you're facing, right-click your token (on a touch screen, press and hold it) and choose **Rotate Left** or **Rotate Right**: each turns it 45 degrees, and the menu stays open so you can keep turning. Or select it and press **[** to turn it anticlockwise or **]** clockwise. Everyone sees it turn. You can turn any token the DM has made yours to control, while the session is live: like moving, turning waits while it is paused or has ended.

**When you can't move your token:**
- If the session is **Paused**, moving and turning your token are disabled until the DM resumes. If the DM pauses while you are holding your token, it goes back to where it was
- If your token hasn't been placed by the DM yet, it won't appear on the map
- If the DM has handed control of your character's token to someone else, or to nobody, it is not yours to move until they set you as its controller in **Edit Token**
- If the DM has ended the session (status shows "Inactive"), movement is disabled until the next one starts

*Screenshot pending — Paused session banner blocking movement.*

If your token is missing or in the wrong place, just let your DM know in chat — they can adjust it.

### On a touch screen

On a tablet, or a phone after **Continue anyway**, your finger does what the mouse does, and a little more:

| To | Do this |
|---|---|
| Move your token | Put your finger on it, slide it to the square and lift: it goes down where you lift, and stays selected. A second finger on the glass before you lift puts it back where it was. |
| Move it in two taps | Tap your token, then tap the square. In between it stays in your hand, drawn faded on its own square with the selection ring, so you can move the map with one finger, or pinch, and keep hold of it. Slide the token from its own square to carry it, or tap the square it came from to put it back. |
| Put back a token you are holding | Tap **Put back** in the bar at the top of the map, which names the token. It does what **Esc** does. |
| Move the map | Slide one finger anywhere but on a token you can move. Pinch two fingers to zoom, about your fingers. |
| Read a token's details | Tap it. It is selected, and its card shows at the bottom left of the map, as hovering it with a mouse would (see [Pointing at a token](#pointing-at-a-token)). The card lets taps through to the map under it, except on its **✕**, which closes it until you next tap a token, the same one included. |
| Open a token's menu | Press and hold the token for half a second: the menu a right-click opens there opens, with the same items, and the token is selected. Lift your finger and tap an item. |
| Open a character's or a combatant's menu | Press and hold its row in the **Campaign Roster** or the initiative tracker for half a second: the menu a right-click opens there opens. A tap on a character still opens its sheet, and sliding your finger scrolls the panel. |
| Roll from your sheet with advantage | Tap a stat to roll it. Press and hold it for half a second for **Normal**, **Advantage** and **Disadvantage** (**Fortune** and **Misfortune** in Pathfinder 2e), or set **Roll mode** in the sheet's header for a run of rolls. See [Rolling from your sheet](#rolling-from-your-sheet). |
| Open or close a door | Tap it, as you would click it. Press and hold it for its menu. |
| Measure a distance | With the **Ruler** up, tap the square, or slide one finger to it; the line stays after you lift (see [Measuring and Spell Areas](#measuring-and-spell-areas)). |
| Aim a spell area | With **AoE Shape** up, slide your finger from the square it comes from towards the target (see [Measuring and Spell Areas](#measuring-and-spell-areas)). Untick **Snap to grid** to place it off the grid, as **Alt** does with a mouse. |
| Point at the map | Tap the spot twice, quickly, on empty ground: everyone sees your ping where the second tap lands, as with **Tab**. It works while no tool is up; two taps on a token do what they always do, and ping nothing. Or press and hold the spot for half a second, on empty ground or on a token that has no menu for you. Or tap **Ping** in the map's toolbar, then tap the spot; you can move the map first. Tap **Ping** again to put it away. |
| Draw on the map | With **Draw** up, one finger draws and two fingers move and pinch the map; with the eraser, the text label or the polygon, one finger moves the map too, and a tap acts. Holding a finger still opens no menu (see [Drawing and pointing](#drawing-and-pointing)). |

A stylus works as a mouse, and opens no menu by holding: use a finger for that. Tap your token with it to pick it up and tap the square to put it down. On a tablet that can tell a stylus hovering just above it, the token follows the stylus meanwhile; take the stylus away and the token waits, faded, on its own square.

On a phone or a tablet some controls are bigger than on a computer, at least 44 pixels square, so a fingertip hits the one it means: the map's toolbar, **Put back**, the **AoE Shape** panel's buttons, the card's **✕**, the items of the token, door and character menus and of a character sheet's roll menu, the buttons of a sheet's **Roll mode**, the close buttons of messages, dialogs, side panels and the **Roll...** pickers, the icon buttons in the page's header, your character's hit point buttons in the party panel, and the names and your die in the initiative tracker. A menu taller than the screen scrolls. Where a row is too narrow for its buttons, they go onto a line of their own: in a narrow party panel your character's hit point buttons take two lines, **−5** and **−1** beside the hit points and **+1** and **+5** under them on the right. With a mouse they keep their usual size, and other controls keep the size they have on a computer.

### Two creatures can't stand in the same square

Try to finish a move on a square somebody is already standing in and the move is refused, with a note saying who is in the way. That matches the rules: you can move *past* another creature, but you can't end your move on top of one.

A creature at **zero hit points** is the exception. It's drawn faded to show it's down, and you can move onto its square — the body stays there marking where it fell without getting in the way of the fight. That only works when you can see its hit points: another player's character, or a creature whose HP bar the DM has turned on. A creature whose hit points the DM keeps hidden looks standing to you until the DM removes it.

If your token ends up underneath another one anyway — your DM can place tokens wherever they like — clicking the square still picks up **your** token, not the one drawn over it. You can always get your own token back.

## Your Own Notes

The **Notes** tab is yours alone. Keep up to 200 notes for a campaign — a plan for next session, what you've worked out about the villain, who owes whom money.

**Nobody else can read them.** Not the other players, and not your DM. That's enforced by the server, not just hidden from view.

**Write in Markdown.** A `#` makes a heading, `**bold**` makes bold, a `-` starts a list, and `[text](https://…)` makes a link. The eye button switches to a preview so you can see it laid out; the pencil switches back to editing.

Notes save themselves a moment after you stop typing — there's no Save button to forget. Pick between them with the dropdown at the top, and the **+** button starts a new one.

A single note can hold about fifty pages of text, so a long campaign journal is fine. If you paste in something enormous the counter under the note turns red and it won't save until you trim it.

**If you leave the campaign or are removed from it,** an open campaign page says "You left this campaign." or "You were removed from this campaign." and takes you to your dashboard (if a character sheet there has unsaved changes, it stays open so you can save them first). Your notes and saved rolls for it are not deleted, and you can still read them. They appear on your dashboard under **Notes From Campaigns You Have Left**: press **Open** beside the campaign to read each note and see your saved rolls, and **Download** in that window to save them all as one Markdown file (plain text you can open in any text editor). The download fetches all the notes in one go, so with many long notes it can take a few seconds. It can be used 60 times an hour; past that it says how many minutes to wait. You can no longer change them. If you are invited back, they are in the campaign's **Notes** tab and **Saved** list again. If the campaign is deleted, they are deleted with it, so download anything you want to keep.

### Catching up on last time

The **Session** tab has a **Past Sessions** list. When your DM ends a session they can write a few lines about what happened, and those notes appear here — newest first, with the date and how long you played. It's the place to look when you've forgotten whose idea the rope was.

If a session shows no notes, your DM simply didn't write any that night.

### Pointing at a token

Hover any token and a card appears in the bottom-left with a large view of its picture, its **HP**, any **conditions** it has, and its **Initiative** if it is in the current fight. It stays useful while you are holding a token: the card follows the square under your cursor, so you can see who is already standing where you are about to land. On a touch screen, which has no hover, tap a token instead: the card shows the token you selected, and taps on the map under it still reach the map. Close it with **✕**; it shows again the next time you tap a token.

You will only ever see what you are meant to. Another player's hit points come from their character sheet, which you can already read. A creature's are the DM's to reveal, and appear only once they turn its HP bar on. A grey token with a question mark is something you can see but cannot make out: the DM has obscured it, and your browser is not sent its name, picture, conditions, hit points or who controls it until they reveal it. And a token standing in unrevealed fog tells you nothing at all — no name, no picture, nothing.

### Why parts of the map are dark

If your DM uses **fog of war**, most of the map starts hidden. It's how your DM keeps a dungeon from being a spoiler — you see a room when you get there, not before.

Areas open up as you explore. If your DM is using **dynamic lighting** as well, what you can see also depends on where your character is standing, which walls are in the way, and what is lit, so the view shifts as you move. Anything in bright light shows clearly. Dim light, and the dark within your character's darkvision, show half-dark. Beyond that is black, but the square you stand on is always visible, so you always know where you are. If your DM keeps **Remember Explored Areas** on for the map, places your character has already seen stay on your map, greyed and darkened, until you can see them again, so a corridor you have walked is not pitch black behind you. A light only shows you something you could actually see — a lamp burning inside a closed room tells you nothing from outside it, and whatever is in there stays hidden until you can see in.

Two things worth knowing:

- **Creatures standing in hidden areas are invisible to you** — including their tokens, and including their turn marker during combat. If the initiative tracker shows a creature you can't find on the map, that's deliberate. Something is out there. A creature the DM has hidden is not listed at all until they reveal it, and neither is one on a map the DM hasn't switched to, or on the other plane when your DM uses the spirit realm.
- **You can't reveal fog yourself.** Only the DM can, so there's nothing you can accidentally break by moving around.
- **You open and close the doors you can see.** Click a door to open or close it, or right-click it for **Open Door** or **Close Door**. With dynamic lighting on, that means a door your character can see: one in the dark, or behind a wall, can't be clicked until you can see it. With fog of war on, it means a door beside a square the DM has revealed to you. A locked door looks like any closed door until you try it, and then you are told it is locked.

### Sound and weather on the map

Your DM can start an ambient track and lay weather over the map: rain, mist, drifting leaves, sparkles, snow or wind. Both arrive on their own when your DM sets them, and stop when your DM stops them; there is nothing for you to turn on. The time of day can carry its own music too, which changes when the DM changes the vibe.

If you hear nothing, check your browser has not blocked sound for the tab. Most browsers refuse to play audio until you have clicked something on the page, so clicking anywhere in the campaign usually starts it.

---

## Measuring and Spell Areas

Two tools in the toolbar above the map answer "can I actually reach that?" before you commit to a turn. Both are private — they draw on your screen only, so nobody sees you working out whether the fireball catches your own party.

**Ruler** (the ruler icon) — measures from **your own token**, so there's nothing to click: turn it on and move the cursor, and the distance in feet follows, using the map's scale and its diagonal rule. If your DM hasn't placed your token on the map yet, the ruler has nothing to measure from and won't draw.

On a touch screen, which has no cursor, tap the square you want to measure to, or slide one finger to it: the line stays when you lift, and the next tap moves its end. While the ruler is up, one finger measures and two fingers move and zoom the map. A tap on your own token still picks it up and puts the ruler away, and while you hold it a tap puts it down, as it would with the ruler away. A stylus taps the same way.

**AoE Shape** (the lightning icon) — draws a spell area. Pick **Circle**, **Cone**, **Line** or **Cube**, set the size in feet or use one of the presets, and move the cursor to position it. A cone has your game's shape: in D&D 5e as wide at its far end as it is long, in Pathfinder 2e a quarter circle.

For a cone or a line, **click your own token first**. That square becomes the pivot, and moving the cursor swings the shape around it — the point it comes out of slides around the square's edge to follow your aim, so it always leaves on the side you're pointing and never cuts back across you. Keep turning until you can see what the attack catches.

For something you cast at a distance rather than from yourself — a wall of fire, say — hold **Alt** while clicking, or untick **Snap to grid** in the AoE panel. That drops the grid snapping and pins the shape exactly where you clicked, and it turns about that point instead.

On a touch screen, which has no cursor to aim with, put your finger on the square the cone or line comes from and slide it towards your target: the shape is pinned on that square and turns to follow your finger, and stays aimed when you lift. A tap moves a shape to the square you tap.

Press **Esc** to drop the placement, and again to put the tool away.

Shapes cover whole squares wherever the grid allows it. A cone's spreading edges are at an angle so they'll still clip across squares — that's the shape, not a bug. Judge the edge cases the way you would at the table, and if it matters, ask your DM.

---

## The Initiative Tracker

The **Initiative** tab in the right sidebar shows the turn order. As the DM adds combatants they appear there, and when the DM clicks **Start Combat** the first one's turn begins.

*Screenshot pending — Initiative tracker during combat.*

You'll see:
- **The combatants in the fight**, in order, highest initiative first. A creature isn't listed while the DM has it hidden, while it stands on a map the DM hasn't switched to, or while it is on the other plane when your DM uses the spirit realm; one that is merely out of your sight, in the dark or under fog, is listed
- **Current turn** highlighted
- **HP** for a creature once the DM has turned its HP bar on, and for any creature token you control; it follows the token as the DM changes it. Your own character's hit points are on your sheet and roster card, not in the tracker

When it's your turn, your name is highlighted. Describe your actions in chat and move your token on the map.

The DM controls when initiative advances — after your turn, they'll click **Next Turn** and the focus moves to the next combatant.

*Screenshot pending — Your name highlighted in the initiative order.*

**During combat tips:**
- Have your actions planned before your turn — it keeps things moving
- Check HP totals to gauge how the fight is going
- Use chat for action narration and out-of-character dice commentary

**Sheets and rolls from the tracker.** Click or tap a character's name in the tracker, or right-click it, and choose **View Character Sheet** to read their sheet, or, on your own character, **Roll...** for the same rolls as right-clicking your token on the map. Double-clicking a character's name opens their sheet straight away. From the keyboard, press **Tab** until the name has the focus and press **Enter** for the menu. Creatures have nothing to open here, and neither does a character whose token is on a map the DM hasn't switched to.

### Rolling Your Own Initiative

Once the DM has added your token to the tracker, you roll for yourself — you don't have to wait for the DM to do it for you. There are two ways, and they do the same thing:

- **In the tracker** — a dice icon 🎲 appears beside your own name. You'll only ever see it on your own row; you can't roll for other players or for the DM's monsters. Clicking your name there and choosing **Roll...** offers **Roll Initiative** too
- **On the map** — right-click your token, choose **Roll...**, and pick **Roll Initiative** at the top of the menu

Either way the result drops straight into the turn order and the roll appears in the **Dice** panel, so everyone can see what you got.

Roll once, before the DM clicks **Start Combat**: a second roll is refused, and once combat has started the dice icon and **Roll Initiative** are no longer offered to you. If your initiative needs changing, ask your DM. Your roll stays in the **Dice** panel after a reload. If your token's identity is obscured, the roll comes in under your token's name for you and as *Unknown creature* for everyone else; the history keeps it as *Unknown creature*, so that is how it reads after a reload.

**What you actually roll depends on your game system**, and it's worked out from your sheet:

| System | Initiative |
|---|---|
| **D&D 5e** | `d20 +` your Dexterity modifier, plus the **other bonus** box on your sheet |
| **Pathfinder 2e** | `d20 +` whichever stat the **Uses:** dropdown names — Perception unless your GM asks for something else |
| **Call of Cthulhu 7e** | Nothing is rolled. Investigators act in DEX order, so the button reads **Set Initiative** and takes your DEX |

**D&D 5e players — the "other bonus" box.** Your Dexterity is added automatically, but plenty of things add to initiative beyond it: the **Alert** feat's flat +5, a Bard's Jack of All Trades or a Champion's Remarkable Athlete, subclasses that let you use a different ability. Put the total of those in **Initiative — other bonus** on the Combat tab and it's included every time; the box takes anything from -30 to +30. The Initiative number itself is worked out for you now, so there's nothing to keep in step by hand.

If something gives you **advantage** on initiative (a Sentinel Shield, say), that isn't handled automatically yet — roll `2d20kh1` in the dice panel and ask your DM to enter it.

### Levelling up (D&D 5e)

Change **Level** at the top of the editor and **Proficiency Bonus** moves with it: +2 at levels 1 to 4, +3 at 5 to 8, +4 at 9 to 12, +5 at 13 to 16 and +6 at 17 to 20. Every save, skill and spell number worked out from it follows. If your table uses a different bonus, type it in the box and it stays as you set it; the sheet shows what your level gives under the box, with a button to switch back to it.

### Bonuses the sheet can't work out (D&D 5e)

Every skill and saving throw is worked out for you from your ability scores, your proficiency bonus and the Prof and Exp boxes, so it keeps up as your character grows. Some things add to them that the sheet can't know about: a Bard's **Jack of All Trades**, a Paladin's **Aura of Protection**, a **Ring of Protection**, a feat. In **Edit**, under **Stats & Skills**, each skill and saving throw has a small box beside its total. Type the extra there, `1` for +1 or `-1` for a penalty, and the total, the sheet and the dice all include it.

A character from an earlier version may have totals that already include something like this. The first time you open such a character in the editor, the difference is put in the box for you, so every total stays exactly as it was. If one of those boxes holds a number you don't recognise, the total was out of step with your ability scores; change the box to `0` to use the worked-out total.

### Skills the sheet doesn't have (D&D 5e)

Thieves' tools, a musical instrument, a vehicle, or whatever your table invented — none of these are among the eighteen printed skills, but they roll the same way. Under **Stats & Skills** there's a **Your Own Skills** section: **+ Add Skill**, type the name, choose the ability it uses, and tick **Prof** (or **Exp** for expertise).

The bonus is worked out for you from that ability and your proficiency bonus, so it keeps up as your character grows — there's nothing to re-enter when you level. The **Other** box is for anything the maths can't know about, like a +1 set of tools.

Your own skills show up with the rest on your sheet and in the right-click roll menu, so rolling them is one click.

### Spending a hit die on a short rest (D&D 5e)

At the end of a short rest you can spend hit dice to get hit points back. Your pool is on the **Combat** tab — `3/5 d10` means you have five d10 hit dice and three of them are unspent.

**Click the pool to spend one.** It rolls a single die plus your Constitution modifier and puts the result in the roll history like any other roll, and the count goes down by one. You can also reach it by right-clicking your token and choosing **Roll...**, where it sits under **Hit Dice**. If the roll doesn't go through (the connection dropped, or too many rolls at once), a message says why and the die is not spent.

It rolls **one** die, not the whole pool — spending is one die at a time, and the rules let you decide whether to spend another after seeing each result. So click again if you want a second.

**Setting your pool up.** In **Edit**, each row is labelled: **Class**, **Die**, **Left** and **Max**. Put a single die under Die — `d10` for a fighter, `d6` for a wizard — and how many you have at your level under Max. Left is how many are unspent, and it reads `Left / Max` the same way the sheet shows `3/5`. You don't repeat the count in the Die box; that's what Max is for.

**A hit die that isn't a plain die.** If your game uses something else — a homebrew class whose hit die is `2d6`, or one with a flat bonus like `1d10+1` — type that in the die box and it rolls exactly as written, with your Constitution added on top. Anything the dice roller understands works here.

**Add the hit points yourself.** CozyVTT rolls the die and keeps count of what you have left, but it doesn't change your HP for you — use the **+** button on your roster card for the amount you rolled. (If your Constitution modifier is negative and the total comes out below zero, you regain nothing rather than losing hit points.)

Once the pool is empty the number stops being clickable. Your DM can also spend one on your behalf if you're not at the table, and it comes off your sheet the same way.

**Getting them back.** A short rest is when you *spend* hit dice — it doesn't give any back. A **long rest** does: you regain all your lost hit points, plus spent hit dice up to **half your total, rounded down, and always at least one**. So a level 5 fighter with `5d10` gets two back, not five, and a level 1 character gets their single die back.

CozyVTT doesn't apply that for you yet. After a long rest, click **Edit** on your sheet and set the remaining number for each pool yourself — **Max** is there so you can see what you're counting back up towards.

### Weapons that do more than one thing

**Properties** — Finesse, Light, Thrown and the rest — are buttons on each weapon in the Combat tab. Tap the ones that apply and they appear as labels on your sheet.

The eleven buttons are the ones the rules name, not a limit. If your game has a property of its own, type it into **Add your own property** and it gets a label like any other. Your own properties show in amber while editing so you can tell them apart, and clicking one removes it.

**More than one damage roll.** A spear is 1d6 in one hand and 1d8 in two, and a spell may hit harder at higher levels. Use **Other Damage Rolls** to add each one with a note saying when it applies — "Two-handed", "At 5th level". Each gets its own line on your sheet that you can click to roll, so you're not doing arithmetic mid-fight.

If you already wrote a second damage die into a weapon's notes, it stays exactly as you typed it — nothing rewrites your sheet. Move it into its own row whenever you like and it becomes rollable.

**The option only appears once you're in the tracker.** If your token isn't in the turn order yet, there's nothing to roll for — ask your DM to add you. Rolling is how you take part in a fight you're already in; it isn't a way to add yourself to one.

Your DM can still roll for you (and re-roll, or type a value in by hand) — handy if you're away from the keyboard when combat kicks off.

**Watch the map, too.** Whoever's turn it is gets a pulsing gold ring around their token. That's the fastest way to tell which creature is acting when the DM has several of the same monster on the board — three identical wolves look alike in the list, but only one is ringed on the map.

If a creature is somewhere you haven't explored, you won't see a ring for it — the tracker will show its turn passing, but its position stays a mystery. A creature the DM has hidden isn't in your tracker at all, and neither is one on a map the DM hasn't switched to or on the other plane.

**Not sure which wolf is which?** Hover a name in the tracker and that creature's token lights up on the map with a thin white outline. It works the other way too — hover a token on the map and its row in the turn order tints. Hovering only points; it never selects or moves anything.

**Reading conditions on the map.** A creature under a condition carries small amber badges above its token, each a two-letter code — **PA** for Paralyzed, **PO** for Poisoned, **PR** for Prone, and so on. If it has more than four, the extras collapse into a grey **+N** badge. Hover the token and the panel in the bottom-left names every condition in full, so you can tell a Paralyzed enemy from a merely Poisoned one before deciding what to do about it.

### Pointing at the Map

Saying "no, the *other* door" never works. Instead, click the map, put your mouse where you mean and press **Tab**. A dot appears with rings radiating out of it, in your colour and labelled with your name, and everyone at the table sees it in the same spot for a couple of seconds.

A few things worth knowing:

- **Your mouse has to be over the map's picture.** Tab does nothing if the cursor is over the chat panel, the sidebar or the empty space around the map.
- **Click the map first.** Tab pings only while the map has the keyboard, which a click on it gives. Typing in chat, or on a button or a panel divider, Tab moves between controls as usual.
- **Shift+Tab leaves the map.** Once you've clicked the map, Tab pings while the pointer is over it; **Shift+Tab** takes the keyboard back to the page's controls.
- **Anyone can ping**, players and DM alike. Your colour is assigned automatically and stays the same every session.
- Pings are just a gesture. They don't move anything, don't reveal anything, and vanish on their own.

If you ping repeatedly in quick succession, some will be quietly ignored — that's a spam guard, not a bug.

**Without a keyboard**, click or tap **Ping** in the map's toolbar, then the spot; click it again or press **Esc** to put it away without pinging. On a touch screen you can also press and hold the spot for half a second, on empty ground or on a token that has no menu for you (see [On a touch screen](#on-a-touch-screen)).

**Double tap to ping.** On a touch screen, two quick taps on empty ground ping the spot where the second lands. The taps must come within half a second of each other and land within 20 pixels of each other. The first tap still does what a tap does, such as clearing the selection, so there is no wait. A third quick tap starts again: three taps ping once, four twice. It works only while no tool is up: with **Ping**, **Draw**, the **Ruler** or **AoE Shape** up, a tap is that tool's. Two taps on a token, or on a door, do what they always do and ping nothing; to point at a creature, use **Ping**, or press and hold it if it has no menu for you. A stylus double taps the same way; a mouse's double-click pings nothing.

### Drawing and pointing

**Draw** (the pencil, after **Ping** in the map's toolbar) opens the drawing tools in the top right corner of the map, with the pen chosen. Sketch a plan, circle a door, label a room: everyone at the table sees it as you draw, and it stays on the map until it is erased. Click **Draw** again, the **×** on the panel, or press **Esc** to put the tools away.

| Tool | How |
|---|---|
| **Pen** | Drag to draw freehand. A click makes a dot. |
| **Line**, **Arrow** | Drag from one end to the other. |
| **Rectangle**, **Ellipse** | Drag from one corner of the box to the other. |
| **Polygon** | Click or tap each corner, then the first corner again, or **Done**, to close it. |
| **Text label** | Click or tap where it goes, type it and press **Enter**. |
| **Eraser** | Click or tap one of your own drawings to erase it. |
| **Laser pointer** | Drag to point at something. Everyone sees the trail, which fades within 3 seconds; nothing is kept. |

Pick a colour, a width, and for shapes **Fill shapes** and **Snap to grid**. **Clear mine** erases every drawing of yours on the map. You can erase only your own drawings; the DM can erase anyone's.

While the tools are up, a click draws, so it does not pick up your token. Put them away to move it. With a mouse the right button moves the map; on a touch screen, two fingers do.

You can draw while your DM lets players draw (**Players may draw**, on unless they turn it off), except while the session is paused or has ended. Then, while the map holds drawings of yours, **Draw** offers only the eraser and **Clear mine**, so you can still tidy up; with none, it is gone from the toolbar. A spectator has no **Draw**. A ping is different: anyone can ping, a spectator too, at any time.

Drawings are the topmost layer of the map: they show over the tokens, the fog and the dark, so you can plan over ground you have not seen yet ("we'll head this way"). The laser pointer shows over everything too, as a ping does.

---

## The Vibe Tracker

The **Vibe Tracker**, in the **Session** tab, shows the time of day your DM has set for the scene: dawn, day, dusk and night unless your DM has named their own. When it changes, the whole map shifts colour to match over a few seconds, and the header shows the current one. If your DM edits or removes the current period, your view follows at once.

*Screenshot pending — Vibe tracker showing the current period.*

You don't control this — only the DM does. Just let it color your roleplaying.

---

## Managing Your Characters

### Your Character Library

The **Characters** page shows all your characters across every campaign and system. You can have up to 1,000 characters, copies included; past that, creating, copying or importing another says so, and deleting one you no longer need makes room.

*Screenshot pending — Characters page with multiple characters.*

**Things you can do from the Characters page:**

- **Click a character** — Open its sheet to read. **Edit** is on the sheet itself when you want to change something

The card's menu (**⋮**) holds the rest:

- **Edit Character** — Skip straight to the character editor
- **Copy/Duplicate** — Duplicate a character (handy for making variants or backups)
- **Assign to Campaign** — Add a character to a campaign. For a character already in one it reads **Reassign Campaign**, which moves it to another or unassigns it
- **Export as JSON** — Download your character as a JSON file (great for backups or sharing builds)
- **Delete Character** — Remove a character permanently (you'll be asked to confirm)

**Import**, at the top of the page, loads a previously exported character JSON.

### Editing Your Character

Clicking a character card opens its sheet to read; click **Edit** on the sheet to start changing it. **Edit Character** in the card's menu skips the reading step and goes straight to the Character Editor. Either way, make your changes and click **Save** — they take effect immediately.

If you leave the editor with changes you haven't saved, you'll be asked to confirm before they're discarded — whether you use the back arrow or close the tab. Once you've saved, backing out is silent; there's nothing left to lose. If you typed something while the save was still going through, the editor stays open with it instead of closing, and you save again. Simply opening a sheet and reading it never counts as a change.

Renaming a character on its sheet renames it everywhere: the card in your library, the editor's title bar, and your DM's roster all follow.

**If your character changes while you're editing it**, say your DM takes hit points with the **−** on your roster card, your save is refused so it can't put the old numbers back. You don't lose what you typed. The editor stays open and a box headed **This character has changed** lists your changes, already put onto the new version, which keeps the hit points your DM set. Press **Save my changes** to save them, or **Keep editing** to carry on without saving. If you both changed the same thing, the box shows your value and the newer one, and you pick which to keep before saving. A sheet you only have open to read on the campaign page follows changes by itself. One opened from the Characters page, or the Character Editor, does not update while it is open.

> **Tip:** Update your character after each session — update HP, spell slots, inventory, and anything that changed. Your DM will thank you.

### Exporting and Importing

**Export:** Choose **Export as JSON** in a character card's menu, or **Export** in the Character Editor's header, to download a `.json` file. This is a complete backup of your character data.

**Import:** Click **Import** on the Characters page and upload a previously exported JSON file. The character appears in your library.

> **Tip:** Export your character after every few sessions as a backup. It takes five seconds and could save you hours of re-entry if something goes wrong.

---

## Your Profile

Click your avatar (the round picture at the top right of the dashboard) to reach your **Profile & Settings** page.

*Screenshot pending — Profile page.*

### Setting Up Your Profile

**Display Name:** Click **Edit** beside **Profile Information** to change it, then **Save Changes**. This is what everyone else sees, and it can be 2 to 50 characters.

**Avatar:** Click your avatar (or the placeholder) to upload a profile picture, a JPEG, PNG or WebP image. Use the built-in crop tool to frame it:
- Drag the image to reposition
- Use the zoom slider to zoom in/out
- Click **Apply & Upload** when you're happy

A new avatar replaces the old one, and the old picture is deleted. **Remove Avatar**, under your avatar, takes it away and deletes the picture, and you are shown with the placeholder again.

*GIF pending — Avatar upload and crop.*

**Bio:** Add an optional bio of up to 500 characters, with the same **Edit** button. Great for introducing your character roster or your player persona.

### Security Settings

**Change Password:** In the Security section, enter your current password and your new password (twice), then click **Change Password**.

**Multi-Factor Authentication (MFA):** For extra security, press **Enable** beside **Two-Factor Authentication**. You'll need an authenticator app (Google Authenticator, Authy, 1Password, etc.). Enter your current password to begin, scan the QR code shown during setup, verify the code to confirm, and save the 10 backup codes somewhere safe. Turning MFA on signs out your other devices. The Profile page then shows how many backup codes you have left, and **Backup Codes** makes new ones.

*Screenshot pending — MFA setup with QR code.*

### Themes & Fonts

The **Appearance** section of your profile lets you pick the color theme and font *you* see across the app. 16 built-in themes (warm, cool, dark, neutral, vibrant) plus 8 open-source font families. There's also a **Custom** option for picking your own primary/accent/background/text colors. Your choice saves to your account and persists across logout/login — when you sign back in, your theme is restored.

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
| Advantage (D&D) | `2d20kh1` (the **Adv** button) |
| Disadvantage (D&D) | `2d20kl1` (the **Dis** button) |

### Session Status Indicators

| Status | What it means |
|--------|--------------|
| Preparation | No session has been run yet — you can move your token |
| 🟢 Live | Session is active — you can move your token |
| 🟡 Paused | DM paused — moving and turning tokens disabled, and your rolls from the Dice tab stay in your own browser: the DM and other players don't see them. Rolls from your sheet or a **Roll...** menu still reach the table |
| ⚫ Inactive | The last session has ended — token movement disabled |

The campaign card on the dashboard calls a **Live** campaign **Active**.

### Keyboard Shortcuts

On the map, once you've clicked it. Press `?` on the map, or click **Keyboard shortcuts** (the keyboard icon in the header, beside **Campaign documents**), to see this list on screen.

| Action | Shortcut |
|--------|---------|
| Select the previous or next token you can act on | `,` `.` (or `<` `>`) |
| Move the selected token one square | `Arrow keys` |
| Move the selected token five squares | `Shift + arrow keys` |
| Turn the selected token 45 degrees anticlockwise or clockwise | `[` `]` |
| Open the selected token's menu | `Enter` |
| Let go of one thing: the menu, the armed **Ping**, a held token, the tool, then the selection | `Esc` |
| Ping the map | `Tab` (cursor over the map) |
| Ping the map, on a touch screen, where there is no token or door and no tool is up | `Double tap` |
| Place a spell area off the grid | `Alt + click` (AoE tool) |
| Show these shortcuts | `?` |

**Shift+Tab** moves the keyboard from the map back to the page's controls.

In the chat box:

| Action | Shortcut |
|--------|---------|
| Send chat message | Enter |
| New line in chat without sending | Shift + Enter |

### Common Questions

**My token isn't on the map.** Ask your DM to place it. They drag your character onto the map from the Campaign Roster.

**I can't move my token.** Check that the session isn't Paused or Inactive, and that the token is yours to move (your DM sets that in **Edit Token**).

**CozyVTT won't open on my tablet or old computer.** It needs Chrome or Edge 111, Firefox 128 or Safari 16.4 (iPadOS 16.4 on an iPad), or newer: Chrome, Edge and Safari from 2023, Firefox from 2024. An older browser may not load the app, or may draw parts of it wrongly, so update the browser or use another device.

**I lost connection.** CozyVTT reconnects by itself; **Retry** beside the connection indicator in the header tries at once. Your session state is saved on the server.

**Someone edited my character.** Only you and your campaign's DM can edit your characters. If you have concerns, speak with your platform administrator.

**I want to stop playing in a campaign.** Click **Leave Campaign** in the **Campaign Info** panel: see [Leaving a campaign](#leaving-a-campaign).

**I need to switch characters.** From the Characters page, unassign your current character from the campaign and assign the new one. Let your DM know so they can update the token.

**I forgot my password.** Use the **Forgot password?** link on the sign-in page if your instance sends email. Otherwise contact your platform administrator — they can reset it and give you a temporary login.

---

*For a complete feature walkthrough including asset management, see the [User Guide](USER_GUIDE.md).*

*Running your own campaign? Check out the [DM Guide](DM_GUIDE.md).*
