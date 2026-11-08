# Changelog

All notable changes to CozyVTT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

The notes for 1.5.4 and earlier were shortened in 1.6.0. The full notes of each release are in `CHANGELOG.md` at its tag, such as [v1.5.4](https://github.com/CheekyChinchilla/CozyVTT/blob/v1.5.4/CHANGELOG.md).

---

## [Unreleased]

### Upgrading from 1.5.4

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is a database change, made by itself on the first start in four steps, one after another. All of it is added; no message, map, campaign, saved roll or document you have is changed or removed:

- Chat messages gain a column for the person a whisper is for, and an index, and the kinds of chat message gain one, the whisper.
- Maps gain a table for what is drawn on them, and campaigns a column for whether players may draw, which is on for every campaign you have.
- Saved rolls gain two columns, for the character a roll is made as and what it is for. Both are empty on every saved roll you have, so each rolls as it did.
- Documents gain a table of the pictures each one shows by its address, and uploads a column for when a document was last read for it; both start empty. The server fills them as a document is uploaded, written or saved. It reads the plain text and Markdown documents you already have after the upgrade, each once, five at a time whenever a player opens their Asset Library or a picture or anyone deletes an asset, until all have been read.

There is no new server setting and no manual step. The backend and frontend containers are rebuilt with the new code. `nginx/nginx.conf` and `docker-compose.yml` do not change, so `git pull` does not stop at your own edits to them, and a proxy of your own in place of the bundled nginx needs nothing new.

To go back to 1.5.4 after upgrading, restore the backup you took before the upgrade. The restore also takes back everything done since the upgrade, the drawings and whispers among it. Without the restore, 1.5.4 cannot read a whisper: the chat of a campaign where one was sent shows an error in place of its history. After going back, reload every open CozyVTT tab, since a page still open from this release would send a message meant as a whisper to the whole table.

#### What you will notice

- **The chat has a To list above the message box.** It starts at **Everyone**, so a message goes to the whole table until someone chooses a person.
- **On a phone or a tablet, the map's toolbar, the menus and many buttons are bigger, and text in boxes is at least 16 pixels high.** With a mouse they look as before.
- **Players can draw on the map.** **Players may draw** is on in every campaign after the upgrade (turn it off in **Campaign Settings**, on the **General** tab), and drawings show over fog and the dark for everyone, so a note to keep from players needs **Only I can see this**.
- **A D&D 5e or Pathfinder 2e sheet you can roll from has Roll mode in its header.** It starts at **Normal** each time the sheet opens, so a click rolls as before.
- **In a long session the chat holds the newest 400 messages.** **Load More**, at the top of the chat, brings back older ones.
- **A player can no longer turn their token while the session is paused or has ended.** The DM turns any token at any time.
- **Below 1,024 pixels wide the campaign page has a phone layout, and the Desktop Required notice is gone.** That is a phone, most tablets held upright, or a narrow browser window at the usual text size.
- **A player's Asset Library no longer lists the pictures of maps the table is not on.** Each comes back while the table is on a map using it.
- **Just after the upgrade, a map picture in an older handout may not load for players.** The server reads each handout once, a few at a time as the table plays; opening the handout again afterwards shows the picture.
- **Each map's card in the Map Library, except the active map's, has Open to prepare beside Set Active.**
- **A backup of tens of thousands of uploaded files takes longer to make.** About 18 seconds for 40,000 files, where 1.5.4 took about 9; about a minute for 80,000 and two minutes for 100,000.

#### What to do afterwards, if it applies to you

- **Reload any CozyVTT page left open through the upgrade.** Until you do, it shows a whisper to you as an ordinary message; only you and its sender are sent it.
- **If you have put a symbolic link in `backend/uploads`, back up what it points to on its own.** A backup leaves the link out and the backend log names it, and a backup made before the upgrade did not hold those files either. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

### Added

- **Whisper to one person in the chat.** ([#45](https://github.com/CheekyChinchilla/CozyVTT/issues/45)) Choose someone in the **To** list above the chat box, or type `/w` and their name; only the two of you see it, and the DM sees a whisper only when they are one of the two. Whispers are stored like the rest of the chat, so whoever runs the server can read them in its database and backups. See [Whispering to one person](docs/USER_GUIDE.md#whispering-to-one-person).

- **Draw on the map.** ([#46](https://github.com/CheekyChinchilla/CozyVTT/issues/46)) **Draw**, in the map's toolbar, has a pen, lines, arrows, shapes and text labels that everyone on the map sees, over tokens, fog and the dark. The DM can keep a drawing to themselves with **Only I can see this**, and players draw while **Players may draw** is on, except while the session is paused or has ended. See [Drawing on the map](docs/DM_GUIDE.md#drawing-on-the-map) and [Drawing and pointing](docs/PLAYER_GUIDE.md#drawing-and-pointing).

- **A laser pointer for the map.** **Laser pointer**, in the drawing tools, draws a trail everyone sees as you drag, which fades within 3 seconds and is never kept. See [Drawing and pointing](docs/PLAYER_GUIDE.md#drawing-and-pointing).

- **Draw a map in CozyVTT.** ([#46](https://github.com/CheekyChinchilla/CozyVTT/issues/46)) **Create Map** has **Draw a map**, a blank map you paint with **Mapmaker**: brushes, shapes, textures, rooms that add their own walls, stamps, fill, text and more. **Save** writes the painting over the map's picture after asking and keeps no earlier version, so download the picture first to keep it; an unsaved painting is kept as a draft in the browser. See [Drawing a map](docs/DM_GUIDE.md#drawing-a-map).

- **Prepare a map while your players keep playing.** **Open to prepare**, on a map's card in the **Map Library**, opens a map on the DM's screen only; players are sent nothing of it until **Bring everyone here**. See [Preparing a map while the table plays](docs/DM_GUIDE.md#preparing-a-map-while-the-table-plays).

- **The campaign page fits a phone.** ([#31](https://github.com/CheekyChinchilla/CozyVTT/issues/31)) Below 1,024 pixels wide the map fills the screen, with **Map**, **Chat**, **Dice**, **Initiative**, **Party** and **More** along the bottom, each opening its panel as a sheet over the map. Every control there is at least 44 by 44 pixels, and the on-screen keyboard never covers what you type. See [The campaign page on a phone or tablet](docs/USER_GUIDE.md#the-campaign-page-on-a-phone-or-tablet).

- **CozyVTT can go on a phone's or a tablet's home screen,** from the browser's own menu. It opens full screen at the dashboard, without the browser's address bar; on Android, Chrome installs it full screen only from an `https://` address. See [Adding CozyVTT to your home screen](docs/USER_GUIDE.md#adding-cozyvtt-to-your-home-screen).

- **The table works by touch on a tablet.** Pinch to zoom, drag to move the view, slide a finger to carry a token, and press and hold a token or a door for its menu or empty ground to ping it. A tap on a token shows its card, and the new **Ping** button pings the next spot you tap. See [On a touch screen](docs/PLAYER_GUIDE.md#on-a-touch-screen).

- **Double tap the map to ping it on a touch screen.** Two quick taps on empty ground ping the spot for the whole table, while no tool is up. See [Pointing at the Map](docs/PLAYER_GUIDE.md#pointing-at-the-map).

- **A roll from a character sheet shows that it went.** The stat pressed gives a short pulse, a phone that allows it gives a short buzz, and while the **Dice** panel is off the screen a message gives the result, such as "Longsword Attack: 17". See [Rolling from your sheet](docs/PLAYER_GUIDE.md#rolling-from-your-sheet).

- **Roll with advantage or disadvantage from a sheet on a phone or a tablet.** On a D&D 5e or Pathfinder 2e sheet, press and hold a stat for its **Normal**, **Advantage** and **Disadvantage** menu. A D&D 5e or Pathfinder 2e sheet also has **Roll mode** in its header on every device, which applies to every check, save, skill and attack you roll from it until you change it or close the sheet. See [Rolling from your sheet](docs/PLAYER_GUIDE.md#rolling-from-your-sheet).

- **Move, turn and step through tokens from the keyboard.** Click a token to select it, then use the arrow keys to move it, **[** and **]** to turn it, **,** and **.** to step to the next token and **Enter** for its menu. Keyboard moves follow the same rules as the mouse. See [Moving Your Token](docs/PLAYER_GUIDE.md#moving-your-token).

- **A list of the map's keyboard shortcuts.** Press **?** on the map, or click **Keyboard shortcuts** in the header, to see every key the map takes. See [Keyboard Shortcuts](docs/DM_GUIDE.md#keyboard-shortcuts).

- **While you hold a token, the map shows how far it has come.** The bottom left of the map shows the distance, such as "Carried 15 ft (3 sq)", measured as the **Ruler** measures. See [Moving Your Token](docs/PLAYER_GUIDE.md#moving-your-token).

- **Follow my selection in Player Preview.** The box beside **Preview Player View** offers **Follow my selection**, which shows what the token you select sees; it never falls back to your own view. See [Previewing the Player View](docs/DM_GUIDE.md#previewing-the-player-view).

- **The AoE Shape panel has a Snap to grid box.** Unticked, a shape goes exactly where you click or tap, which a finger or a stylus could not do before. On a touch screen, slide from a cone's or a line's origin to aim it. See [Measuring and Spell Areas](docs/PLAYER_GUIDE.md#measuring-and-spell-areas).

- **On a touch screen the DM moves a combatant up or down the order with arrows on its row.** Dragging by touch does not work in every browser. See [Managing Turn Order](docs/DM_GUIDE.md#managing-turn-order).

- **Reset position puts the DM's tool panels back in their corner.** The bar above the **Fog of War**, **Walls** and **Lights** panels offers it once you have moved them.

- **The Walls panel has buttons for what took a key or a double-click.** **Done**, **Cancel**, **Add to selection** and **Delete segment** sit in the panel, and its **Undo** now does what **Ctrl+Z** does. See [The Wall Drawing Tool](docs/DM_GUIDE.md#the-wall-drawing-tool).

- **Edit Token offers D&D 5e effects beside the conditions.** **Blessed**, **Concentrating**, **Hasted** and six more each have a badge no condition shares. See [Editing Tokens During Play](docs/DM_GUIDE.md#editing-tokens-during-play).

- **Give temporary hit points from a token's menu or the roster.** **Temporary HP...** asks how many and, when the creature already has some, whether to keep those or take the new ones. It is not offered for Call of Cthulhu. See [Granting Temporary Hit Points](docs/DM_GUIDE.md#granting-temporary-hit-points).

- **Players and spectators can leave a campaign.** **Leave Campaign**, under **Your role** in **Campaign Info**, asks first. Your characters go back to **My Characters**, and your notes and saved rolls stay readable on your dashboard. See [Leaving a campaign](docs/PLAYER_GUIDE.md#leaving-a-campaign).

- **A saved roll can keep a character and a purpose of its own.** In **Saved**, a roll has optional **Character** and **Purpose** boxes; a saved roll you already have rolls as before. See [Rolling Dice](docs/USER_GUIDE.md#rolling-dice).

### Changed

- **Changes for scripts and integrations.** See [API changes in Unreleased](docs/api-changes/unreleased.md).

- **A player can no longer turn their token while the session is paused or has ended, as with moving it.** The DM turns any token at any time, and a player can still change their token's conditions.

- **Lighting on a very large map is worked out at a slightly lower resolution.** On a lit map of more than 16,777,216 pixels, such as 5,000 by 3,400, the edges of light and shadow are a little softer. That is the largest canvas Safari on an iPhone or iPad can hold.

- **On a touch screen the ruler measures by taps.** The DM taps a start and an end; a player's ruler starts at their token and a tap sets the end. See [Measuring and Area Templates](docs/DM_GUIDE.md#measuring-and-area-templates) and [Measuring and Spell Areas](docs/PLAYER_GUIDE.md#measuring-and-spell-areas).

- **A click or a tap on a combatant's name in the initiative tracker opens its menu.** A double-click still opens a character's sheet at once.

- **On a phone or a tablet, the map's toolbar, the menus and many buttons are at least 44 by 44 pixels.** With a mouse they keep their size. See [On a touch screen](docs/PLAYER_GUIDE.md#on-a-touch-screen).

- **The Dice panel shows more rolls.** Each roll takes two lines with its total large beside them, where it repeated its numbers three times. The seven dice share one row, **d20** first, and **Character** and **Purpose** wait behind **More**. See [Rolling Dice](docs/USER_GUIDE.md#rolling-dice).

- **System notices in the chat take one quiet line.** A session paused or resumed, or the spirit layer shown or hidden, is a small centred line in place of a card like a message, and the message box's placeholder no longer repeats the keys written under it.

- **The chat box grows as you type,** up to six lines on a computer and four on a phone, then scrolls, and shrinks back once the message is sent. It stayed two lines tall on a computer. See [The Chat Panel](docs/USER_GUIDE.md#the-chat-panel).

- **The chat holds the newest 400 messages, and Load More brings back older ones.** A long session made the page heavier the longer the table played. Nothing is deleted: the whole history stays on the server. See [The Chat Panel](docs/USER_GUIDE.md#the-chat-panel).

- **A backup leaves out a symbolic link in the uploads folder, and the backend log names it.** A restore turned such a link into a small file holding its path, and the files behind it were never in the backup. A campaign export leaves out a linked picture or sound the same way. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

### Removed

- **The Desktop Required notice is gone.** Below 1,024 pixels the campaign page now uses its phone layout, a narrow browser window on a computer included, and the remembered **Continue anyway** is no longer read. See [The campaign page on a phone or tablet](docs/USER_GUIDE.md#the-campaign-page-on-a-phone-or-tablet).

### Fixed

- **On a lit map without fog of war, players no longer see a strip of the map's edge.**

- **Create Backup says when the Admin Panel could not restore the backup it made.** A backup over the restore's limits (4 GB, 100,000 files or 10 GiB unpacked) is still made, now with a warning pointing to the command-line restore. See [Database Backups](docs/DEPLOYMENT.md#database-backups).

- **A backup of tens of thousands of uploaded files no longer runs the backend out of memory.** With the usual 512 MB a backup of about 60,000 files used to stop part-way; 100,000 files now back up within about 275 MB.

- **A backup no longer holds a file that makes the restore refuse it.** A file in `backend/uploads` with two dots in a row or a backslash in its name is left out and named in the backend log; rename it to back it up. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

- **An imported campaign's pictures and sounds keep their names, descriptions and tags.** Export the campaign again from a server running this version; an older archive does not carry them. See [Exporting a Campaign](docs/DM_GUIDE.md#exporting-a-campaign).

- **A campaign export stopped part-way no longer keeps a file open in the backend.**

- **Text holding the null character is refused with a message, and a campaign archive holding one imports.** Pasted text carrying the invisible character U+0000 failed to save with a vague error; it is now refused with "Text cannot contain the null character (U+0000)." Type the text again instead of pasting it. An archive is imported with the character taken out.

- **Stopping the backend no longer forgets what a player explored in the second before the stop.**

- **A password reset email asked for just before the backend stops is still sent.** A mail server slower than 2 seconds can still miss it; asking again after 5 minutes sends a new link.

- **A DM who handed the DM seat over can no longer delete the new DM's map pictures.** A member who does not run the campaign may delete or move a file they uploaded only while nothing but their own characters, tokens and documents use it. See [Viewing and Managing Assets](docs/USER_GUIDE.md#viewing-and-managing-assets).

- **Deleting a picture asks first when a document can show it.** A text or Markdown document showing the picture by its address, such as a handout, is now listed in the question. See [Viewing and Managing Assets](docs/USER_GUIDE.md#viewing-and-managing-assets).

- **A refused move no longer names a creature hidden under fog.** The note says "Someone" for a creature the player cannot see.

- **A token someone is carrying goes back to its square when they are removed from the campaign.**

- **Players' pages stop hearing about a map once the table has left it.** For up to a second after a switch made from another tab or by a script, a few updates for the old map could still arrive; they carried nothing players had not just been shown.

- **A map's spirit layer picture is never drawn over another map.**

- **A player's fog of war is drawn even when something drawn before it on the map fails.**

- **A fog box over most of a large map, and a wide view of explored ground, are no longer lost.** Ground lost this way before the upgrade is remembered once a token sees it again after the map is next opened.

- **A large lit map pans smoothly for players.** A frame while panning a 5,600 by 4,200 lit map took about 1.15 seconds in a slowed test and now takes 17 milliseconds.

- **The map is drawn at your screen's resolution.** On phones, tablets and high-density displays the map, tokens and walls are sharp, up to three pixels per point.

- **A new map fits the view even when its picture arrives before the map area has a size.**

- **Changing a map's picture during play no longer blanks the map while the new picture loads.** The old picture stays until the new one is ready.

- **In Player Preview a click no longer picks up a creature the preview does not show.** To move a hidden creature, return to your own view first.

- **A token you have picked up keeps its hit-point bar, condition badges and rings** while it waits on its own square.

- **A wall or a light the map has no room for is no longer drawn.** At 5,000 walls or 200 lights the tools refuse before drawing, and anything else the server refuses is taken off your map again. See [The Wall Drawing Tool](docs/DM_GUIDE.md#the-wall-drawing-tool).

- **A wall line you had started no longer waits, unseen, in another tool.** Choosing another tool drops it; the walls its clicks placed stay.

- **Esc closes only the roll picker or the menu it is pressed in,** and no longer also puts away the map's tool.

- **Tab moves on from a panel divider while the pointer rests on the map.** Tab pings only while the map has the keyboard.

- **Tab no longer pings beside the map's picture.**

- **Edit Token saves to the map its token is on,** even if the map on screen changes while it is open.

- **Edit Token offers no 51st condition.** At 50, the conditions a token does not carry are greyed out, with a note saying why.

- **A token turned several times in quick succession ends up facing the way it was turned last.** Each turn was sent at once, so the server could store them out of order, and two refused turns could leave the token showing a facing never stored. A refused turn now puts back the facing the server last stored.

- **A token's or a door's menu, and a Roll... picker opened from it, close when the map changes.**

- **A token's or a door's menu closes when a character's menu opens.**

- **A door's menu stays on the screen** near the right or bottom edge.

- **A token's menu opens with Move to Map… shut.**

- **A token's menu shows one divider above Remove from Map in a campaign with one map.**

- **A tap on a menu over a divider between the page's columns works.**

- **The initiative tracker opens a combatant's character sheet whatever map their token is on.** **Roll...** is still offered only for a combatant on the map on screen, and players' trackers are unchanged. See [A Combatant's Sheet and Rolls](docs/DM_GUIDE.md#a-combatants-sheet-and-rolls).

- **The AoE Shape panel no longer covers the map's toolbar with a mouse.**

- **The map's toolbar fits a narrow map.** It wraps onto a second row, and the panels below it start under that row.

- **The campaign page stays above the browser's toolbar on a phone or a tablet.**

- **The chat and the Dice log stay at the newest message or roll when their panel gets shorter.**

- **The Dice panel's colours follow the app's theme whether your computer is set to light or dark, and its quick dice stay readable under the pointer.**

- **Damage and hit dice the dice cannot roll are no longer offered as a roll.** The **Roll...** pickers leave such damage out, and on a sheet damage such as `1d8 slashing` shows as written and says why it cannot roll; **Custom Roll** explains a refusal before sending. See [Rolling from your sheet](docs/PLAYER_GUIDE.md#rolling-from-your-sheet).

- **A character sheet's roll menu stays on the screen, and Esc closes only the menu.**

- **On a phone or a tablet a character sheet shows which stats roll.** The dice icons that showed only under a mouse pointer now show all the time.

- **Character sheets and their editors fit a phone.** Below 640 pixels wide or 500 tall they take the whole screen, and the D&D 5e, Pathfinder 2e, Call of Cthulhu and Flexible layouts are rearranged to fit a phone. See [The Character Editor](docs/USER_GUIDE.md#the-character-editor).

- **Every tab of a character sheet can be reached on a phone.** Tabs wrap onto a second row where they do not fit.

- **On a phone or a tablet, a swipe on a Flexible sheet's editor scrolls the page.** A finger drags a section or an entry by its grip.

- **A sheet editor's two notes under the portrait no longer overlap.**

- **Text dragged from one box to another in a character sheet opened from the map now lands there.**

- **A Call of Cthulhu creature is no longer given D&D 5e's Challenge Rating and worked-out saves and skills.** The Creature Library and the token editor name its characteristics as its stat block does, and take its skills as printed. See [Saving Throws and Skills](docs/DM_GUIDE.md#saving-throws-and-skills).

- **Importing a character file made for a game system this CozyVTT doesn't have gives a message.** Choosing the file used to break the preview; it's now refused there, naming the system. See [Character Templates](docs/USER_GUIDE.md#character-templates).

- **The Call of Cthulhu skills list puts its headings over its columns.**

- **A Call of Cthulhu age saved as text shows in the editor and is kept until you type a number.** An age already replaced by 0 is in a backup taken before that save.

- **The My Characters page and the character editor's page no longer scroll sideways on a phone.**

- **Tapping a box on an iPhone or an iPad no longer zooms the page.**

- **Dialogs, side panels and pop-up messages fit a phone.**

- **The dashboard fits a phone narrower than 400 pixels when you are an administrator.**

- **The Admin Panel fits a phone.** Its tabs scroll sideways in their own row.

- **The Crop Avatar window works on a phone, a tablet and the keyboard.**

- **Every map card in the Map Library can be deleted on a phone.**

- **On a screen narrower than 1,024 pixels, the Creature Library's and Token Templates' forms open in place of the list.** See [Creating Custom Creatures](docs/DM_GUIDE.md#creating-custom-creatures).

- **Create Custom in the Creature Library opens an empty form while a creature is being edited.**

- **Create Map's and Edit Map's buttons no longer sit over the form.**

- **The grid preview in Create Map and Edit Map is sharp on a phone.**

- **Edit Map shows the grid preview beside the grid's settings,** with the lighting and fog switches in a **Lighting and Fog** section below.

- **Create Map and Edit Map describe the Alternating diagonal rule at the map's Grid Scale,** such as "10/20/10/20 ft diagonals" on 10 ft squares.

- **Each Confirm? in the Fog of War panel stays readable.**

- **The Lights panel spells Global Illumination as Edit Map does.**

- **Deleting a campaign tells its owner once.**

- **Remove from Campaign names the character,** as in "Remove Ash's hero from the campaign?"

- **The remove button is no longer shown beside the campaign's owner** on the **Members** tab of **Campaign Settings**.

- **Removing a spectator from a campaign calls them a spectator.**

- **The Members tab in Campaign Settings writes each role as the rest of the app does.**

- **The dashboard no longer shows a campaign you have just been removed from.**

- **Character sheet tabs and the Admin Panel's tabs work as tabs for a screen reader and the keyboard.** **Tab** stops on the open tab, and the arrow keys, **Home** and **End** move between them.

- **A screen reader names more controls.** Every remove button in the sheet editors, the size boxes in Create Map and Edit Map, **Include audio assets**, the ✕ on the Creature Library and Token Templates forms, **Preview Player View**, and the buttons that show only an icon on a phone.

- **The keyboard reaches your avatar on the Profile page.** It is a button, **Change avatar**, that **Tab** reaches.

### Security

- **Players no longer see map pictures before the table goes there.** A map picture in a campaign's library shows to players and spectators only while their table is on a map using it; handouts the DM shares keep their pictures. See [Uploading Assets](docs/USER_GUIDE.md#uploading-assets).

- **What one account can make the server hold for its live connections is bounded.** A signed-in account could make the server keep answers in memory until the backend passed its memory limit and restarted, dropping every table. Messages from one account are now rate limited, and a connection that stops reading is closed.

- **A condition named `constructor` or `__proto__` on a token no longer breaks the map.**

## [1.5.4] - 2026-10-25

### Upgrading from 1.5.3

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is one new setting, `BACKEND_MEMORY_LIMIT`, which you can leave out: without it the backend keeps the 512 MB it has always had (see [Backend memory](docs/DEPLOYMENT.md#backend-memory)). No setting is removed, and there is no database change or manual step. The backend and frontend containers are rebuilt with the new code. The nginx container is recreated, because `docker-compose.yml` now stops it with a different signal.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If you deleted the `nginx` service to use your own proxy, `git stash pop` reports a conflict there, because this release changes that service. Keep it deleted: remove the lines from `<<<<<<< Updated upstream` down to `=======`, both included, and the `>>>>>>> Stashed changes` line below them, then run `git reset` and `git stash drop` as the guide says. If you changed the backend's `memory: 512M` line, `git stash pop` reports a conflict there too. Keep the new line, `memory: ${BACKEND_MEMORY_LIMIT:-512M}`: remove the `<<<<<<< Updated upstream` line, and the lines from `=======` down to `>>>>>>> Stashed changes`, both included. Then put your value in `.env` as `BACKEND_MEMORY_LIMIT=` followed by it, such as `BACKEND_MEMORY_LIMIT=1G`, and run `docker compose up -d`.

#### What you will notice

- **The app needs Firefox 128 or newer.** Chrome and Edge 111 and Safari 16.4 are still enough.
- **A new map, token or avatar picture has size limits.** At most 16,384 pixels a side, and for an animation at most 1,000 frames; pictures already uploaded are kept as they are.
- **Character sheets take your theme.** A dark theme no longer shows a pale card with light text on it.
- **An invitation sent from the app runs out after 14 days.** One that has run out can be sent again, and **Campaign Settings → Members** lists the ones still open.
- **A player rolls initiative once per fight.** A second roll is refused; the DM can still change the number.
- **A saved roll that cannot work is refused when it is used,** such as one that could divide by zero, with the reason; edit it to fix it.

#### What to do afterwards, if it applies to you

- **If you serve CozyVTT with your own Nginx** following [Serve with Nginx](docs/DEPLOYMENT.md#5-serve-with-nginx), you can narrow its security policy as the bundled one now is: copy the `map $host $csp_socket_sources` block from the top of the example into the top of your site file, and in your `Content-Security-Policy` line change `connect-src 'self' ws: wss:` to `connect-src 'self' $csp_socket_sources`. Then `sudo nginx -t` and `sudo systemctl reload nginx`. Your current line keeps working if you leave it.

- **If your `DATABASE_URL` names a schema** (it ends in `?schema=` followed by a name other than `public`), everyone is signed out by the upgrade and signs in once more: sign-ins are now kept in that schema. The ones from before stay in a `session` table in the `public` schema, which CozyVTT no longer reads. If nothing else on that database uses a table of that name, you can remove it with `DROP TABLE public.session;`.

- **If your `DATABASE_URL` names a schema and you kept backups made with `backup.sh`,** those files hold the whole database, so neither the dashboard nor the scripts restore them now. Keep them, and make a new backup with **Create Backup** on the Admin Panel's **Backups** tab after the upgrade: it holds your schema alone and restores as usual. To restore one of the older files, follow [Restoring an older script backup of an install that names a schema](docs/DEPLOYMENT.md#restoring-an-older-script-backup-of-an-install-that-names-a-schema).

### Added

- **The backend's memory limit is a setting.** Set `BACKEND_MEMORY_LIMIT` in `.env` (`1G`, `2G`) and run `docker compose up -d`; without it 512 MB applies, as before, and it cannot go below 256M. See [Backend memory](docs/DEPLOYMENT.md#backend-memory).

- **See and clear an account's sign-in lock from the Admin Panel.** In **Admin → Users** a locked account shows **Locked until**, and **Clear lock** lets it sign in at once with its usual password. See [Logging In](docs/USER_GUIDE.md#logging-in).

- **A Call of Cthulhu investigator's contacts, and notes on Luck and wealth, can be edited.** **Edit** has a **Contacts** list on the **Possessions** tab, a note under **Luck Score** and **Wealth notes** under **Assets**.

- **Specialised skills can be added to a Call of Cthulhu investigator.** Fighting, Firearms and science specialisations come from the rulebook's list at their base values, and **Add Language** and **Add Skill** add others.

- **A D&D 5e sheet shows an item's value, the character's carrying capacity and the player's name.**

- **See and withdraw the invitations you have sent.** **Campaign Settings → Members** lists them under **Invited**, with an **×** to withdraw each, and an invitation now runs out after 14 days.

- **Continue anyway on the campaign page in a narrow window.** ([#85](https://github.com/CheekyChinchilla/CozyVTT/issues/85)) Below 1024 pixels wide the **Desktop Required** notice gained a button that opens the desktop layout; your browser remembers the choice.

- **Jump to newest in the chat and the Dice panel.** While you are scrolled up, a button at the bottom of the list takes you down to what has arrived.

- **Open a combatant's sheet and roll for them from the initiative tracker.** ([#90](https://github.com/CheekyChinchilla/CozyVTT/issues/90)) Right-click a combatant for **View Character Sheet** and **Roll...**, or double-click a player character's row for their sheet. See [A Combatant's Sheet and Rolls](docs/DM_GUIDE.md#a-combatants-sheet-and-rolls).

- **Tokens can be turned to face any direction.** ([#89](https://github.com/CheekyChinchilla/CozyVTT/issues/89)) Right-click a token for **Rotate Left** and **Rotate Right**, 45 degrees a turn; the DM can type an exact **Facing** in **Edit Token**. See [Turning a Token](docs/DM_GUIDE.md#turning-a-token).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.4](docs/api-changes/1.5.4.md).

- **A server admin moving someone's personal file into a campaign is written to the activity log,** under **Recent Admin Actions** on the Admin Panel's **Activity** tab.

- **The placeholders in the D&D 5e and Pathfinder 2e editors' headers take the header's own colour.**

- **The Asset Library, the pickers and the Map Library load small previews of maps and tokens,** so a library of large maps opens faster. A picture imported from an archive, or uploaded before previews were made, is still shown full size.

- **In Chrome, Edge, Safari and on phones, the document reader offers a PDF as a button to open it in a new tab.** Those browsers will not show a PDF inside the reader; Firefox on a computer still does.

- **Only an asset's uploader can move it to their Personal library.** A campaign's DM can still delete such an asset and make the other moves.

- **The app now needs Firefox 128, from July 2024, or a newer version.** The styles moved to Tailwind CSS 4, which uses features Firefox added in 128. Chrome and Edge 111 and Safari 16.4 are still enough, and Firefox ESR 128 and later are new enough.

### Removed

- **The backend no longer installs the mathjs package,** about 20 MB with its dependencies. Dice roll as before.

- **The Call of Cthulhu read-only sheet no longer has a palette button.** Choose the header colour in **Edit**, as on the other sheets.

### Fixed

- **Stopping or upgrading CozyVTT during a restore lets the restore finish,** for up to 10 minutes, and `docker compose logs backend` says it is waiting.

- **A database password with a `%` that encodes nothing works for every backup and restore.** A password such as `pa%ss` or `100%` broke them all; percent-encoded characters such as `%40` are decoded as before.

- **Backups and restores work on an install whose database address carries settings of the app's, and keep to the schema it names.** On an address that names a schema, a backup and a restore cover that schema alone. The backup and restore scripts work with the `public` schema only, and refuse another, pointing to the Admin Panel's backups.

- **A restore sent a damaged upload says so:** "The upload could not be read. Nothing was changed."

- **A backup no longer holds an empty backups folder among the uploaded files.**

- **A restore is listed in Admin → Activity when the database update after it fails.**

- **A backup the restore refuses part-way gives its disk space back at once.**

- **The warning about a missing or example session secret names the right file:** the `.env` in the CozyVTT folder for Docker, and `backend/.env` without Docker.

- **A notes download someone stops part-way is no longer logged as an error.**

- **The backend's log no longer shows an error each time two overlapping changes are sorted out.** Each retry is logged only with `LOG_LEVEL=debug`, and an error only when the backend gives up after 5 tries.

- **The backend container finds a database whose address names no port.** It uses PostgreSQL's usual port, 5432.

- **The backend starts when its uploads or logs folder is on a NAS or network share that refuses a change of owner.** It warns if it cannot write there, naming the user ID to give the folder to. See [the backend's log says it cannot write to `/app/uploads` or `/app/logs`](docs/DEPLOYMENT.md#the-backends-log-says-it-cannot-write-to-appuploads-or-applogs).

- **A second stop while the backend is stopping no longer logs an error.**

- **Stopping CozyVTT no longer waits 10 seconds while a player is connected.**

- **The instance's name and branding arrive once the server answers,** on a page opened while CozyVTT was restarting.

- **The two-factor setup page says when the server is not answering.**

- **Copy works for a new user's temporary password on a plain-HTTP instance,** and says so when it cannot.

- **A one-letter display name can be chosen on every page.**

- **Two refusals name their buttons as the app shows them:** **Send Reset Link** and **Change Password**.

- **The server refuses a sign-up whose email address holds `<` or `>`.**

- **A campaign keeps showing a map or token picture from the personal library of someone who deleted their account.** A personal file used only by one campaign the account was in now becomes that campaign's own; others get a line in **Activity**. Files kept by an earlier deletion show under the **No Uploader (account deleted)** filter on the Admin Panel's **Assets** tab, for an administrator to move.

- **A map you switch to cannot be deleted at the same moment.**

- **The Campaign Roster keeps up with characters deleted, created into the campaign, or moved to another one.**

- **A campaign's name and description can be as long as the server allows,** 200 and 5,000 characters.

- **A campaign that exports can be imported again, however large.** Maps, pictures and sounds are limited only by the archive's 1,000 files, and custom creatures and token templates by 2,000 each; **Export Campaign** says when a campaign is over those.

- **A campaign import keeps picture and sound names within an upload's limits,** 200 characters for a name and 255 for a file name.

- **A new invitation appears on the dashboard without pressing Refresh.**

- **An invitation names the campaign's DM,** where it named the owner.

- **Campaign Settings shows Danger Zone only to those who may delete the campaign:** its owner and administrators.

- **Emptying a campaign's description in Campaign Settings clears it.**

- **Open Campaign after an import opens the campaign.**

- **Remove from Campaign in the Campaign Roster removes the character, for the DM too.**

- **A character taken out of a campaign leaves the campaign page at once.**

- **A chat cooldown the DM turns on during play reaches the players at the table,** as do the other saved **Campaign Settings**.

- **Saving Campaign Settings, removing a player and handing over the DM seat leave the table as it is.**

- **Sending an invitation leaves the page as it is.**

- **The Campaign Roster keeps its list while it updates.**

- **A campaign that is still loading when you open another one can no longer replace it.**

- **A character's name reads on a pale header colour,** in every system's sheet and editor.

- **The buttons on a character sheet's header read clearly on every header colour.**

- **A DM opening a player's sheet sees the player's name.**

- **A sheet opened from the Characters page no longer offers rolls it cannot make.**

- **Save and Cancel can be tapped in a character editor on a phone.**

- **Character sheets follow your theme,** with the theme's paper, text, borders and colours in every system.

- **The header colour you pick is drawn everywhere a sheet uses it.**

- **The built-in character templates follow the rules.** Characters already made from a template keep their numbers; the Call of Cthulhu editor works an investigator's out again when it is next saved.

- **The Pathfinder 2e and Call of Cthulhu editors say which name is missing** before a save is refused.

- **A feature listed twice is kept twice.**

- **Save as Template works for a character with a picture.** The template is published without the picture, unless it is already a global asset.

- **Two people editing one character template no longer undo each other.**

- **A copied character keeps "(Copy)" in its name when it is saved.**

- **A Flexible sheet's add buttons stop where the server does:** 100 sections, 200 stats in a section, 1,000 list entries, and 50 columns and 1,000 rows in a table.

- **Game systems are named in words everywhere,** where some places showed a code such as `DND_5E`.

- **You can delete your character while its campaign is being played,** after a warning naming the campaign.

- **Create & Publish as Template publishes the character you made, and says so when it cannot.**

- **Choosing a Flexible campaign in Create New Character makes the character Flexible.**

- **Create New Character says what happens after Create.**

- **Create New Character takes a name as long as the sheet does,** 200 characters.

- **A refused template sheet save names the boxes to fix.**

- **Edit Template no longer offers a token picture it cannot use.**

- **A screen reader names every box in the three character editors, and the boxes stop at the length a sheet stores.**

- **A Call of Cthulhu investigator whose CON and SIZ add up to less than 10 can be saved.**

- **A Call of Cthulhu investigator's own language follows EDU.**

- **The Call of Cthulhu sheet shows the derived attributes an investigator's characteristics give.**

- **A Call of Cthulhu investigator's token picture is checked and named after the investigator.**

- **A Call of Cthulhu weapon rolls its damage bonus and its skill's current value.** Damage such as "1d3+DB" rolls the damage bonus.

- **The Call of Cthulhu read-only sheet reads clearly.**

- **Every Call of Cthulhu skill rolls from the sheet, named once.**

- **A Call of Cthulhu box can be cleared and retyped.**

- **A Call of Cthulhu investigator stored without skills can be saved.**

- **A Call of Cthulhu investigator with POW 100 can be saved, and current Sanity stays within the maximum.**

- **Cthulhu Mythos typed on a Call of Cthulhu sheet lowers maximum Sanity.**

- **A Call of Cthulhu major wound threshold rounds up.**

- **A Pathfinder 2e ancestry or class with 0 hit points counts as 0.**

- **An item's value keeps fractions of a gold piece on the D&D 5e and Pathfinder 2e sheets.**

- **The Pathfinder 2e sheet and editor agree on more of a character.**

- **Pathfinder 2e spell slots never show more used than there are.**

- **A Pathfinder 2e lore named with "Lore" rolls under its own name.**

- **The Pathfinder 2e sheet shows and rolls the saves, Perception and skills its own numbers give.**

- **A Pathfinder 2e check penalty lowers the skill however it is typed.**

- **The Pathfinder 2e focus pool holds what your character has.**

- **A Pathfinder 2e feat with no level is listed first on the sheet.**

- **A Pathfinder 2e feat from a built-in template opens with its text in the editor.**

- **A Pathfinder 2e character stored with spellcasting but no spell attack or spell DC can be saved.**

- **A Pathfinder 2e spell DC uses its own item bonus, and one spellcasting rank sets both spell attack and spell DC.** A character whose DC changes because of this gets a note above the sheet when it opens.

- **Pathfinder 2e Bulk follows the rules on the sheet and in the editor.**

- **A Pathfinder 2e character whose AC, Class DC or Spell DC works out under 10 can be saved.**

- **Every Pathfinder 2e Add Feat button has its colour.**

- **The D&D 5e editor says when it has brought a stored number within range.**

- **The D&D 5e editor says what to fix before a save is refused.**

- **A row added by mistake no longer stops a D&D 5e sheet from saving.**

- **A D&D 5e character's Proficiency Bonus follows their level.** See [Levelling up (D&D 5e)](docs/PLAYER_GUIDE.md#levelling-up-dd-5e).

- **A D&D 5e sheet stops adding skills and damage rolls where it can still be saved.**

- **Unticking Requires Attunement on a D&D 5e item ends its attunement.**

- **A D&D 5e sheet's Total Weight counts items with no weight or quantity.**

- **Naming a D&D 5e spellcasting ability raises the spell save DC and spell attack.** A sheet saved before with the ability empty shows a negative **Other bonus** on its Spells tab; set it back to 0.

- **A D&D 5e character stored without its saving throws can be saved from the editor.**

- **Coloured messages, labels, text and buttons read clearly in every theme.**

- **Text boxes, checkboxes and dropdown lists are dark in a dark theme.**

- **The panels show a token's disposition and HP in the map's own colours.**

- **The Spirit Realm badge over the map can be read over any map.**

- **Personal notes follow your theme.**

- **A screen reader no longer reads out older chat messages as they load.**

- **Three more controls read correctly to a screen reader.**

- **An asset card's View, Download and Delete buttons can be reached with Tab and are always shown on a touch screen.**

- **The DM can reorder initiative and edit a value from the keyboard.**

- **Screen readers hear new dice rolls and the connection status, and the dice panel's boxes and windows have names.**

- **The map's Fog of War, Walls and Lights panels open and fold from the keyboard.**

- **The DM's side panels work from the keyboard and are announced as dialogs.**

- **With reduce motion turned on, windows and notifications fade out where they are.**

- **With one window open over another, Escape and Tab act on the top one only.**

- **The Desktop Required notice is no longer hidden behind an open window.**

- **A screen reader reads a Creature Library row and its favourite star as two controls.**

- **The Atmosphere panel's volume slider tells the table however it is moved.**

- **A document saved twice at the same moment records the size of the text it keeps.**

- **Every sound file and document you may use is offered.**

- **The picture pickers can find every picture you may use,** by part of a name or a whole tag, with **Load more**.

- **The Asset Library's search and sort cover the whole library.**

- **An MP1 or MP2 sound file is refused when it is uploaded or imported.** Convert it to MP3, Ogg or WAV.

- **A PDF uploaded under another name opens as a PDF.**

- **A document you stop editing after a refused save shows its text again.**

- **The Upload Asset window's progress bar shows how much of the file has been sent.**

- **A picture that fails to load no longer breaks the asset pickers.**

- **The Asset Library's detail panel slides away when you close it.**

- **In Firefox, the Asset Library's cards fade in once as it opens.**

- **An asset you move in the Asset Library takes its new place at once.**

- **The Asset Library offers Campaign as a place to move an asset only when one of your campaigns can take it.**

- **The Asset Library offers Delete and Move to whoever may use them.**

- **A move the Asset Library refuses says why.**

- **A file whose name has accented or other non-ASCII letters keeps its name.** Files uploaded before keep their stored names; upload one again to show its name correctly.

- **The Upload Asset window takes Ogg and WAV sound files in Firefox, and Markdown documents in every browser.**

- **Searching a library for `%` or `_` finds only names that hold one.**

- **A mistyped `ASSET_UPLOAD_RATE_LIMIT` no longer turns the upload limit off.** A value that is not a number is ignored, with a warning in the log, and the default of 30 uploads a minute per user applies.

- **A campaign archive is uploaded once when you import it.**

- **Changing a creature's ability scores or Challenge Rating moves its saves and skills, and saves them.**

- **A Pathfinder 2e stat block shows the creature's level, its attribute modifiers and Fort, Ref and Will.**

- **Stat blocks in Flexible and Shadowrun campaigns print negative saves and skills properly.**

- **The Creature Library and Token Templates say why a save was refused, and their boxes stop at the server's limits.**

- **Copying a token template to another campaign says it worked, naming the campaign, or says why it was refused.**

- **Deleting a favourite creature takes it out of the Creature Library's Favorites too.**

- **Edit Token shows changes made elsewhere while it is open, and no longer undoes them.**

- **A token whose controller is no longer a player says so.**

- **The Token Manager no longer offers to send an object to the spirit realm.**

- **The Token Manager says why the server refused.**

- **A Player token from the Token Manager can stand for a character,** chosen from a **Character** list.

- **A token's conditions follow the campaign's game system, and you can type your own.** See [Editing Tokens During Play](docs/DM_GUIDE.md#editing-tokens-during-play).

- **A token added, changed or removed reaches everyone at once, from wherever it was changed.**

- **A token goes back where it stands when whoever was carrying it loses their connection.**

- **Damage from the minus buttons takes temporary hit points first, on the roster and in Edit Token.**

- **A player who right-clicks a creature or an object on the map no longer gets an empty menu.**

- **More actions say why when they fail.**

- **Players no longer see walls and doors through the fog of war.**

- **Moving a token on a lit map with many walls no longer holds up the server.** On a map of 1,000 walls, a move seen by 12 players took about 345 ms of the server's time and now takes about 21.

- **The DM tool panels stay on the map,** and double-clicking the bar above them puts them back in their corner.

- **A light's colour can be typed into the Lights panel.**

- **The Spirit Layer panel shows the veil and the style as the server has them.**

- **Saving the vibe periods updates everyone's table at once.**

- **Saving the vibe periods keeps the weather, and the ambient track, as they are.**

- **Moving the pointer over the map does less work.**

- **Token pictures load together when a map opens, and one that cannot be loaded is not asked for again every time a token moves.**

- **A burst of edits to one map no longer holds up the rest of the server.**

- **Fog of war fades away over the squares you reveal.**

- **The AoE Shape tool's cone has the right shape for your game:** as wide as it is long in D&D 5e, a quarter circle in Pathfinder 2e.

- **Walls, doors and lights stay on the map's picture when you change its Width, Height or Grid Size.**

- **Players see an edit to the map on screen straight away.**

- **The map's Zoom In and Zoom Out buttons zoom about the middle of the view.**

- **A player opening or closing a door while you drag walls keeps their change.**

- **Clicking a token beside a door picks the token up, or puts the one you are holding down there.**

- **Switching maps lets go of whatever you were holding on the last one,** and **Esc** puts a held token back.

- **Letting go of the mouse button off the map finishes what you were doing.**

- **The ruler counts alternating diagonals at the map's own scale.**

- **Preview Player View can always be ended.**

- **The light tool's Select does nothing during a preview.**

- **The DM's spirit token button on the map toolbar says what a click does.**

- **The right mouse button pans the map under every wall, fog and light tool, and opens no menu there.**

- **Clicking near a polygon's first corner closes the shape.**

- **Esc puts the light tool away, as it does the wall tools.**

- **Reset explored areas clears every player's memory of the map.**

- **Export as .uvtt file says why a map cannot be exported, and saves only a real file.**

- **Export as .uvtt file works for a map picture of more than 16,383 by 16,383 pixels.**

- **Ending a session with Save game state unticked keeps the snapshot taken when you paused.**

- **Starting, pausing and ending a session from two tabs at once can no longer leave two sessions open, or an ended session marked Paused.** A campaign an earlier version left marked **Paused** or **Active** with no session open offers **Start Session**.

- **The session timer counts from the session's start after Resume Session.**

- **The paused-session notices say which rolls stay private:** only rolls from the **Dice** tab.

- **Advantage, disadvantage and a plain d20 show their critical in the Dice panel.**

- **Initiative rolls stay in the Dice panel after a reload.**

- **A player rolls initiative once per fight.** Taking their token out of the order and putting it back lets them roll again.

- **A token deleted while its initiative was being rolled no longer appears in the order.**

- **A dice expression is read the same way everywhere, and one that cannot work is refused when it is rolled or saved.** A saved roll stored before that breaks the rules is refused when used, with the reason; edit it to fix it.

- **A roll from a character sheet, the roster or the map's Roll... menu says why when it does not go through,** and spending a hit die keeps the die when its roll is refused.

- **What the table refuses is shown as a message, and the Dice panel shows only what happened to its own rolls.**

- **A saved roll shows its name in the dice log.**

- **Coming back after a dropped connection brings back what the DM changed meanwhile.**

- **Coming back after a long disconnect fills in the chat messages you missed,** up to 500.

- **Chat times move on.**

- **Enter no longer sends a chat message or a roll while you are picking characters in an input method.**

- **The Dice and Chat boxes keep the keyboard after you roll or send.**

- **A failed Load More in chat no longer leaves its message up for good, or makes the list jump later.**

- **A chat message that does not get through says so,** marked **Not sent** with **Retry** and **Discard**. A message stops at 2,000 characters.

- **Firefox no longer logs "Invalid URI. Load of media resource failed" on every campaign page.**

- **Hit point changes during a fight do less work.**

- **The Session tab at the top of the right-hand panel is no longer cut off.**

- **The campaign page no longer scrolls sideways.**

- **The campaign page opens when the browser refuses to store site data.**

- **The dark backdrop behind a character sheet opened from the campaign roster covers the whole window.**

- **A failed save or request no longer copies what it sent into the browser's console.**

- **Pop-up messages leave one at a time, each after its own few seconds.**

### Security

- **Ten security advisories against five of the backend's libraries are cleared,** in body-parser, multer, zod, nodemailer and fast-uri. The updates change nothing in how the app behaves.

- **A map, token or avatar picture is held to limits that keep an animation from swamping players' browsers.** At most 16,384 pixels a side, and an animation at most 1,000 frames and 200 million pixels across them for a map, 50 million for a token or an avatar. Pictures already uploaded are not affected.

- **A crafted map in a campaign archive no longer costs the import far more memory than its size.**

- **On an install whose database address names a schema, a password change or a removed account ends the other sign-ins.** The sign-in store also keeps to the address's `connection_limit`.

- **The live table connects only to the instance itself.** A reverse proxy of your own should pass the browser's host name on (`proxy_set_header Host $host;` in Nginx); where it does not, the live table still works over a slower connection.

- **A server admin who runs a campaign can share only their own documents and global ones with it.**

- **An invited administrator has the full 7 days to set up two-factor authentication,** counted from when they set their password.

- **Forgot password answers as quickly for an address with an account as for one without.**

- **A flood of sign-ins can no longer stall the server.** At most 2 passwords are checked at a time, with 50 more waiting; past that the forms say "The server is busy, try again in a moment."

- **A player removed or demoted while their page is switching campaigns loses the access at once.**

- **A game tab left open is disconnected when its sign-in ends.**

- **A character saved as a template leaves the player's name and the Keeper's Notes behind.**

- **A picture whose campaign was deleted no longer has its details shown to everyone.**

- **A text document opened from the browser's cache keeps its sandbox.**

- **Asking for something you may not see is answered as if it were not there.**

- **With fog of war on, a player can open or close only a door beside a square revealed to them.**

- **The security advisories against the tools that build and test CozyVTT are cleared.** None of them was ever in an instance.

## [1.5.3] - 2026-10-17

### Upgrading from 1.5.2

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

Coming from 1.5.1 or earlier, read the **Upgrading** notes of every release in between too, oldest first. The commands are the same, and each release's notes say what it needs from you.

This release moves CozyVTT to new versions of what it is built on and adds no features. There is no new setting, required or optional, no setting is removed, and there is no manual step. Two database updates run by themselves on the first start. One records the table that keeps sign-ins, which the backend made for itself when it first started, so it finds the table there and changes nothing, and nobody is signed out. The other clears the author of any custom creature whose author's account was already deleted, since it named an account that no longer exists; the creatures themselves are kept. Nothing else you have stored is rewritten.

All four containers are recreated, because `docker-compose.yml` changes each of them: every container drops the Linux capabilities its start-up does not use, the backend's and the bundled nginx's files become read-only, as the frontend's already were, and the frontend image is no longer built with `VITE_API_URL` and `VITE_SOCKET_URL` (see **Changed** and **Security** below). Compose makes two new volumes on the first start, `nginx_temp` for uploads and downloads on their way through nginx and `backend_tmp` for the backend's `/tmp`; neither needs a backup. Your campaigns, uploads and backups are not touched; Docker's own log of each container starts afresh. The images stay on Node.js 26, nginx 1.30 and PostgreSQL 15, `nginx/nginx.conf` does not change, and `.env.example` gains no setting and loses none.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If you deleted the `nginx` service to use your own proxy, `git stash pop` reports a conflict there, because this release changes that service. Keep it deleted: remove the lines from `<<<<<<< Updated upstream` down to `=======`, both included, and the `>>>>>>> Stashed changes` line below them, then run `git reset` and `git stash drop` as the guide says.

If you use your own proxy in place of the bundled nginx, it needs nothing new. It must send `/api/` and `/socket.io/` to the backend on the page's own address, as [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy) shows, which is now the only way the page reaches the backend: a `VITE_API_URL` or `VITE_SOCKET_URL` left in `.env` is no longer built into the app.

An install without Docker stays on Node.js 26 and upgrades with the usual commands in [Without Docker](docs/DEPLOYMENT.md#without-docker). `npm run build` in the `backend` folder now also prepares the database client, which `npm install` no longer does, so run both, in the order the guide gives.

#### What you will notice

- **The app needs Chrome or Edge 111, Firefox 114 or Safari 16.4, or a newer version.** An older browser, such as Safari on an iPad that cannot update past iPadOS 15, no longer loads the app.

- **Many of the app's icons are drawn a little differently.** Each still stands for what it did.

- **The database's log shows two harmless `chmod: ... Operation not permitted` lines each time it starts.** Its folders already have the right permissions.

- **A browser that has used your instance over HTTPS keeps to HTTPS for its name for a year,** up from 180 days. Read [HTTPS is remembered by browsers](docs/DEPLOYMENT.md#https-is-remembered-by-browsers) before you ever move the name back to plain HTTP.

- **People in one home who connect over IPv6 share the request and sign-in limits,** as people behind one IPv4 address already did.

#### What to do afterwards, if it applies to you

- **If you run commands in the backend container, add `-u appuser`,** such as `docker compose exec -u appuser backend node dist/scripts/migrate-sheet-fields.js --dry-run`. Run Prisma's own commands as `./node_modules/.bin/prisma` in place of `npx prisma`, such as `docker compose exec -u appuser backend ./node_modules/.bin/prisma migrate status`, because `npx` writes to a folder that is now read-only. A command that writes a file of its own must write it under `/tmp`; copy it out with `docker compose cp backend:/tmp/the-file .`.

- **If your `docker-compose.override.yml` adds a program that needs a Linux capability, such as a network tool,** give it back there with `cap_add`, as [the deployment guide](docs/DEPLOYMENT.md#a-container-stops-with-permission-denied-operation-not-permitted-or-read-only-file-system) shows. Without it, that program fails with `Operation not permitted`.

- **If a file of yours in `nginx/conf.d` writes a log to a file of its own,** send that log to `/dev/stdout` instead, such as `access_log /dev/stdout;`. Otherwise nginx stops with `Read-only file system`.

- **If `.env` still sets `VITE_API_URL` or `VITE_SOCKET_URL`,** you can delete both lines: nothing reads them any more.

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.3](docs/api-changes/1.5.3.md).

- **The backend's database library moves to Prisma 7.** It opens at most 10 connections for its own queries, and settings in `DATABASE_URL`, such as `sslmode`, apply to every connection. Deleting an account now clears the author of the creatures it made and keeps the creatures. See [Without Docker](docs/DEPLOYMENT.md#without-docker) for the build order outside Docker.

- **The app now needs Chrome or Edge 111, Firefox 114 or Safari 16.4, all released in 2023, or a newer version.** Until now Chrome 87, Firefox 78 and Safari 14 were enough.

- **The libraries CozyVTT is built on are updated to recent releases,** among them Express 5 and React 19. Nobody is signed out, and campaign exports and backups hold the same files as before.

- **A browser that has used your instance over HTTPS now keeps to HTTPS for its name for a year,** up from 180 days. An instance only ever used over plain HTTP is not affected. See [HTTPS is remembered by browsers](docs/DEPLOYMENT.md#https-is-remembered-by-browsers).

- **Visitors who connect over IPv6 are counted by their network for the request and sign-in limits.** All the addresses in one /56 block share one allowance; the limits for each account are unchanged. See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Many of the app's icons are drawn a little differently.** Screen readers now pass over icons that are only decoration.

- **`VITE_API_URL` and `VITE_SOCKET_URL` in `.env` no longer reach the app.** The page always reaches the backend on its own address, so a proxy of your own must send `/api/` and `/socket.io/` there. See [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy).

- **For people working on CozyVTT: after this update, start the development stack once with `docker compose -f docker-compose.dev.yml up --build -V`.** Without it the development containers keep running the old packages.

### Security

- **Security advisories against the tools that build and test CozyVTT are cleared.** None of their code is part of a running instance.

- **The check of who belongs to a campaign takes the campaign from the request's address alone.** No request could reach the old path.

- **Two security advisories against the library that moves between the app's pages are cleared.** Neither could be reached in CozyVTT.

- **Each container keeps only the powers its start-up needs.** All four drop the Linux capabilities their start-up does not use, which is why backend commands now take `-u appuser`. See [the deployment guide](docs/DEPLOYMENT.md#a-container-stops-with-permission-denied-operation-not-permitted-or-read-only-file-system).

- **The bundled nginx can no longer change its own files.** Its filesystem is read-only, with uploads and downloads on the new `nginx_temp` volume.

- **The backend can no longer change its own program files.** Only `backend/uploads`, `backend/backups`, `backend/logs` and `/tmp` (the new `backend_tmp` volume) are writable, and a database copy left in `/tmp` by a stopped backup is removed at each start.

- **Building CozyVTT stops at a package that wants to run a program while it installs, unless CozyVTT has approved it.**

## [1.5.2] - 2026-10-14

### Upgrading from 1.5.1

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

Coming from 1.5.0 or earlier, read the **Upgrading** notes of every release in between too, oldest first. The commands are the same, and each release's notes say what it needs from you.

**If a Cloudflare Tunnel or another proxy sits in front of CozyVTT, change `.env` before you pull or straight after.** The bundled nginx now believes only the proxies you list about who each visitor is. Until now it believed any machine on a private network, so anything that could reach nginx from such an address, an ordinary visitor over IPv6 included, could choose the address CozyVTT counts it as. For a tunnel or proxy on the same server, add:

```env
NGINX_TRUSTED_PROXIES=172.16.0.0/12
HTTP_PORT=127.0.0.1:80
HTTPS_PORT=127.0.0.1:443
```

then run `docker compose up -d`. `172.16.0.0/12` is the range on most servers ([check yours](docs/DEPLOYMENT.md#the-range-for-a-proxy-on-the-same-server)). The two port lines keep nginx's ports to this server, so visitors can only arrive through the tunnel; keep your own port numbers if you changed them, and leave the two lines out if your proxy reaches nginx from another machine. Without the first line, every visitor counts as the proxy's one address: a few wrong passwords from anyone lock everybody out of signing in for 15 minutes, the whole table shares one limit of 300 requests a minute, and sign-in cookies are no longer marked HTTPS-only. 1.5.1 ignores the first line and already reads the other two, so you can add all three before you pull. Requests a tunnel sends straight to the backend, without the bundled nginx, are unaffected. Other setups, and a check that it worked, are in [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

There is no database change and no new required setting, and nothing you have stored is rewritten. A production instance whose `SESSION_SECRET` is shorter than 32 characters, or an example value from the guides, now refuses to start; **What you will notice** below says what to do. All four containers are recreated, because `docker-compose.yml` changes each of them: every container gets Docker's `no-new-privileges` option, the frontend container's files become read-only, the backend is given longer to stop, and nginx moves to its stable 1.30 releases with a reworked `nginx/nginx.conf`. Your campaigns, uploads and backups are not touched; Docker's own log of each container starts afresh. The backend image now runs on Node.js 26, and the app is built with it. An install without Docker needs Node.js 26 before it is upgraded: follow [Install Node.js 26](docs/DEPLOYMENT.md#1-install-nodejs-26) and check that `node --version` prints a version starting `v26`.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml).

If you have edited `nginx/nginx.conf`, to turn on HTTPS or to add a proxy's addresses, this is the last time `git pull` stops at it. HTTPS now goes in a file of your own in the new `nginx/conf.d/` folder, which git leaves alone, and a proxy's addresses go in `.env`. Move your edits over once, before you pull:

1. Keep a copy of what you changed: `git diff nginx/nginx.conf > ~/my-nginx-changes.txt`
2. Put the shipped file back: `git checkout nginx/nginx.conf`
3. Pull: `git pull origin main` (with the `git stash` steps above if you also edited `docker-compose.yml`)
4. For HTTPS, create `nginx/conf.d/https.conf` from the example in [SSL/TLS with Let's Encrypt](docs/DEPLOYMENT.md#configure-nginx-to-use-the-certificate), with your domain. Your certificates stay where they are, in `nginx/certs/`. If your copy of the HTTPS block had a `Strict-Transport-Security` line turned on, turn on the one in the example too.
5. For `set_real_ip_from` lines you added, put those addresses in `NGINX_TRUSTED_PROXIES` in `.env`, separated by spaces.
6. `docker compose up -d --build`, then open your site over HTTPS to check it.

Skip step 4 and, after step 6, your instance answers over plain HTTP only.

If you use your own proxy in place of the bundled nginx, it must send `/api/` and `/socket.io/` to the backend on the page's own address, as [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy) shows: `VITE_API_URL` and `VITE_SOCKET_URL`, for a backend on another address, are no longer offered in `.env.example` (see **Removed** below). Your proxy may also compress the backend's answers, as the bundled nginx now does, and if it replaces CozyVTT's security headers with a policy of its own, you can remove `fonts.googleapis.com` and `fonts.gstatic.com` from it.

There are two new settings for `.env`, both optional. `NGINX_TRUSTED_PROXIES` lists the proxies in front of the bundled nginx; leave it out and nginx believes none. `SETUP_TOKEN` matters only on a fresh install; leave it out and the backend prints a token for the setup wizard in its log.

#### What you will notice

- **A weak `SESSION_SECRET` stops a production instance starting.** If `docker compose logs backend` shows `[FATAL] SESSION_SECRET`, put the output of `openssl rand -hex 32` in `.env` and run `docker compose up -d`; a new secret signs everyone out once.

- **A sign-in ends 30 days after it was made, however active it has been.** `REMEMBER_ME_MAX_AGE` in `.env`, if you set it, is now the longest any sign-in lasts.

- **An administrator without two-factor authentication has 7 days to set it up.** After the date on the banner, the account can only set it up, change its password or sign out.

- **On a fresh install only, the setup wizard asks for a setup token.** Find it with `docker compose logs backend | grep "setup token"`.

- **The browser tab shows your instance's name,** and the Timezone box is gone from the setup wizard and **Admin Panel → Settings**.

- **Only an administrator can import the D&D 5e SRD creatures, and Invite Player finds people by name.** Type at least 2 letters of a display name.

- **New limits, set far above what a table uses,** on characters, templates, invitation emails, sheet lists and uploads. What is already saved stays.

- **The Profile page has a Remove Avatar button,** and uploading a new avatar deletes the old picture.

#### What to do afterwards, if it applies to you

- **If you got a Let's Encrypt certificate with the deployment guide's earlier steps, check that it can renew.** Run `sudo certbot renew --dry-run`. If it says `Could not bind TCP port 80`, follow [If you obtained your certificate with the earlier steps](docs/DEPLOYMENT.md#if-you-obtained-your-certificate-with-the-earlier-steps).

- **If you installed without Docker, update your Nginx site file from the example in [Manual Deployment](docs/DEPLOYMENT.md#5-serve-with-nginx).** Copy its `gzip` lines and `server_tokens off;`, the headers in its `location /` block, the `if (-d $request_filename)` block and the `try_files $uri /index.html;` line that replaces the old one, the two `X-Forwarded` lines in its `/socket.io/` block, and the `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto` lines in its `/health` block, then run `sudo nginx -t` and `sudo systemctl reload nginx`. Without them the app page has no Content-Security-Policy, the app's scripts and styles and the backend's answers are not compressed, and reloading or bookmarking the Asset Library page (`/assets`) shows "403 Forbidden".

- **To remove the files of accounts deleted before this release,** open the **Assets** tab of the Admin Panel and choose **Uploader**: **No Uploader (account deleted)**.

### Added

- **Administrators can find and delete files that nothing uses.** The Admin Panel's **Assets** tab has a **Leftover Files** check, and filters for files whose uploader was deleted and for documents. See [Files with no owner, and leftover files](docs/USER_GUIDE.md#files-with-no-owner-and-leftover-files-admins).

- **The app shows how many two-factor backup codes you have left,** on the Profile page and after signing in with one.

- **Signing in takes you to the page you were trying to open,** when it is a page of your own instance.

- **The Admin Panel warns when the disk holding the uploads is nearly full,** above 80%, under **Storage** in **System Overview**. See [File Storage](docs/DEPLOYMENT.md#file-storage).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.2](docs/api-changes/1.5.2.md).

- **Deleting an account now deletes its avatar and the personal files nothing uses.** Campaign files and shared documents stay, with no owner, and so does a personal file a campaign uses, which the campaign cannot show until an administrator moves it there. Accounts deleted earlier keep their files; find them with **No Uploader (account deleted)** on the Admin Panel's **Assets** tab.

- **A player removed from a campaign can still read their notes and saved rolls from it,** on their dashboard under **Notes From Campaigns You Have Left**. See [Removing a Player](docs/DM_GUIDE.md#removing-a-player).

- **The bundled nginx, and the web server inside the frontend image, now use nginx's stable 1.30 releases.**

- **The fonts now come from your own instance, so visitors' browsers no longer contact Google.** A proxy of your own that replaces CozyVTT's security headers can drop `fonts.googleapis.com` and `fonts.gstatic.com` from its policy.

- **The app's scripts and styles, and everything the backend sends as data, are now compressed on their way to the browser.** An install without Docker needs the new `gzip` lines in its Nginx site file.

- **HTTPS, and any other nginx settings of your own, now go in a file in the new `nginx/conf.d/` folder, which git leaves alone.** See [SSL/TLS with Let's Encrypt](docs/DEPLOYMENT.md#ssltls-with-lets-encrypt).

- **CozyVTT now runs on Node.js 26,** supported until April 2029. An install without Docker needs it before upgrading.

### Removed

- **The Timezone setting is gone from the setup wizard and from Admin Panel → Settings.** Nothing used it; times are shown in each viewer's own time zone.

- **`.env.example` no longer offers `VITE_API_URL` and `VITE_SOCKET_URL`.** A backend on another address left pictures, sounds and PDFs blank. If you set them, empty them, have your proxy send `/api/` and `/socket.io/` to the backend on the page's own address, and run `docker compose up -d --build`. See [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy).

### Fixed

- **Dice rolls made in the same instant keep one order in the dice history.**

- **A Flexible character sheet or template laid out wrongly is no longer saved.**

- **A published character template keeps only the fields its sheet has.**

- **A character sheet that cannot be shown no longer takes the whole page with it.**

- **A Flexible sheet already stored in a shape its page could not read opens again, and can be put right.**

- **The D&D 5e Spells tab opens for every caster, and spell slots are held to 20 of each level.**

- **The D&D 5e "other bonus" boxes for initiative, passive Perception, spell save DC and spell attack take -30 to +30.**

- **The name written on a character sheet is held to 200 characters, like the name a character is created with.**

- **Every box on a character sheet now has a length limit:** 100,000 characters for notes and other long text, 1,000 for most boxes. A sheet stored with more keeps loading, but the longer box must be shortened before the sheet can be saved again.

- **The Import Campaign window works with a screen reader and the keyboard.**

- **A screen reader names the D&D 5e editor's Alignment and Background boxes.**

- **Saving a text or Markdown document can no longer leave it empty or cut off.**

- **An upload that cannot be saved no longer leaves files behind on the server.**

- **A session or rate-limit setting that is not a whole number no longer breaks sign-in or turns the limit off.** A bad `SESSION_MAX_AGE`, `REMEMBER_ME_MAX_AGE` or `RATE_LIMIT_MAX_REQUESTS` falls back to the default, and the log says so.

- **The sign-in, sign-up, two-factor code and password reset pages say why they refused.**

- **Correct two-factor codes entered at the same moment from one address are all accepted.**

- **Two setup wizards submitted at the same moment no longer both change the instance's settings, and a setup that fails part-way no longer locks the instance.**

- **The instance always keeps an administrator, whatever happens at the same moment.**

- **Deleting the account of someone who runs a campaign they did not create is refused until they hand the DM seat on.**

- **A campaign keeps exactly one DM when its seat changes hands at the same moment as something else.**

- **The Custom theme shows the colours that were picked.**

- **Dragging a custom colour on the Profile page saves it once.**

- **The instance name is now the browser tab's title and is used in emails.**

- **Create User and Invite User in the Admin Panel check the display name the way sign-up does, and refuse an email address holding `<` or `>`.**

- **Only one restore runs at a time, and nothing changes the database while a restore replaces it.** During a restore, every request is answered "The instance is being restored from a backup. Try again in a minute; everyone signs in again once it has finished."

- **A backup the restore refuses now says why.**

- **An uploaded backup left behind by a restore that was cut short is cleaned up.**

- **The backup and restore scripts accept a database password written percent-encoded.**

- **The restore script reads a backup with very long lines quickly.**

- **A sound that a time of day plays counts as in use.**

- **The Admin Panel's status card shows how the server really is:** **Healthy**, **Degraded** or **Unknown**.

- **Admin Panel settings that could not be loaded can no longer be saved over the real ones.**

- **After a restore, Go to Login opens the sign-in page.**

- **The Admin Panel's Create User and Invite User window works with a screen reader and the keyboard.**

- **The Admin Panel's Assets tab keeps showing what its filters say.**

- **A sign-in never waits more than 15 seconds behind other attempts still being checked.**

- **A wrong password or code on the Profile page is now said on the form.**

- **A server restart no longer sends everyone to the sign-in page.** The page says "Can't reach the server" and opens once the server answers.

- **The Forgot your password? page no longer says a link was sent when none was.** An instance without email says "Password reset by email is not available".

- **A backup code mistyped at sign-in can be corrected with Backspace.**

- **Going back to the sign-up or two-factor code page after signing in no longer shows a blank page.**

- **Back to login on the two-factor code page goes back to the sign-in page.**

- **The Copy buttons for the two-factor key and the backup codes work over plain HTTP, and say when they could not copy.**

- **Reloading the two-factor setup page keeps you on it, and the browser asks before you leave unsaved backup codes.**

- **The password strength meter no longer calls a password Strong that the page then refuses.**

- **A campaign page says why its table has ended, and leaves it.**

- **A campaign page reconnects by itself however long the server is away, and shows Connected once it has.**

- **On a lit map, a token two squares or taller sees from its middle.**

- **On a lit map, a player can open or close only a door one of their tokens can see.**

- **The quick editor no longer shows a token change that was not saved.**

- **The token menu offers View Character Sheet only for a character in the campaign, and says why when a sheet cannot be opened.**

- **A Universal VTT import that fails while saving leaves nothing behind.**

- **Universal VTT imports use less of the server's memory, and wait their turn when several arrive at once.** An import waits at most 20 seconds for its turn and runs for at most 30. See [Importing a Universal VTT file](docs/DM_GUIDE.md#importing-a-universal-vtt-file).

- **Stopping or upgrading CozyVTT while the Admin Dashboard is making a backup now lets the backup finish,** for up to 10 minutes.

- **An error the backend cannot recover from is now written to its log files,** in `backend/logs/error.log`.

- **The API guide shows what the server really sends.**

- **The WebSocket guide for scripts and integrations is corrected.**

- **The restore script says plainly which address to check afterwards.**

- **The example settings file and the deployment guide now say what the database password and email need.** The database password must use letters and digits only, and email counts as set up only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set.

- **The Let's Encrypt steps in the deployment guide now keep the certificate renewing.**

- **The deployment guide now says that browsers remember HTTPS for your instance's name.**

- **The deployment guide's steps for an install without Docker work as written.**

- **The User, Player and DM Guides were checked against the app and corrected.**

- **The User Guide says how a token is moved.**

- **The Player Guide no longer says a token is dragged, and no longer lists Shadowrun.**

- **The DM Guide says how a token is moved and which tokens send a player to the spirit realm.**

- **The guides for people working on CozyVTT match the code again.**

- **The bug report form and the security policy now say what to send and what to leave out.**

- **The README says how a token is moved.**

- **A connection still being made when you leave a campaign no longer breaks the next campaign you open.**

- **Reloading or bookmarking the Asset Library page now opens it.** On an instance with a port in its address, a browser may remember the old redirect until its cache is cleared.

- **Uploading a large file on a slow connection no longer fails with "Failed to upload asset".**

- **The Import Campaign window can no longer be closed while an import is running.**

- **A refused character sheet save names the boxes to fix, in the editor at the table as well.**

- **The lists on a D&D 5e, Pathfinder 2e or Call of Cthulhu sheet hold up to 500 entries.** A sheet already stored with more keeps loading, and its next save names the list to shorten.

- **Pathfinder 2e item bonuses are held to -30 to +30, and spell slots to 20 a rank.**

- **An Ogg sound file recorded in Opus can now be uploaded, and Ogg files carrying FLAC or Speex now play.** A FLAC or Speex file uploaded before that does not play has to be uploaded again.

- **The Creature Library credits the D&D 5e SRD whenever it lists SRD creatures.**

### Security

- **A sign-in ends 30 days after it was made, and an account keeps at most 20 sign-ins.**

- **A failure to end someone's sign-ins is no longer reported as success, and deleting an account ends its sign-ins in the same step.**

- **Administrator accounts must use two-factor authentication.** An administrator without it has 7 days, then can only set it up, change their password or sign out.

- **The setup wizard can no longer be claimed by a stranger.** It asks for a setup token, printed in the backend log while setup is not complete, or chosen with the optional `SETUP_TOKEN` in `.env`.

- **Password reset and invitation links are stored hashed.**

- **One password reset email per account every five minutes.**

- **An administrator can no longer reset their own two-factor authentication or password from the Admin Panel.**

- **Signing in with an email that has no account takes as long as a wrong password.**

- **Ten wrong passwords in an hour lock an account from every address, and the admins are told** in **Admin → Activity**. A new password opens the account at once.

- **The password you confirm when changing your password, your email address or deleting your account now has an attempt limit,** 10 wrong passwords per 15 minutes.

- **A sign-in waiting at the two-factor code step ends with the password that started it, and expires after five minutes.**

- **Sign-in and registration no longer answer with the server's own error text.**

- **A production instance refuses to start on a session secret that could be guessed:** an example value from the guides, or one shorter than 32 characters.

- **Everything an administrator does to someone's account is now written to Admin → Activity, with who did it.** See [The activity log](docs/USER_GUIDE.md#the-activity-log-admins).

- **The instance's default theme colours are checked before they are saved.**

- **An invitation can be sent again only to an account that has never signed in.**

- **Signing out now clears the lists the app had loaded for you.**

- **A failed two-factor code or setup wizard no longer leaves the code or the new password in the browser's console.**

- **On a lit map, a token carried out of a player's sight leaves their map at that point.**

- **Only someone who could delete a document can rewrite it, and only someone who could delete a global asset can take it out of the library.**

- **A DM's change to a player's token picture changes only the tokens in campaigns that DM runs.**

- **Call of Cthulhu Keeper's Notes are now the Keeper's alone.**

- **Players' browsers are no longer told which doors are locked or where the lights that are off are.** See [What players' browsers receive](docs/DM_GUIDE.md#what-players-browsers-receive).

- **Pictures in a document or note load only from the asset library, and links open in a new tab.** See [Safety](docs/USER_GUIDE.md#safety).

- **A map picture uploaded from Create Map goes to your personal library unless you choose the campaign's.** Pictures already in the campaign's library stay there; to hide one, move it to **Personal** in the Asset Library. See [Adding Maps to Your Campaign](docs/DM_GUIDE.md#adding-maps-to-your-campaign).

- **A DM can have the instance send 20 invitation emails an hour, and the email's subject no longer quotes the campaign.**

- **The Invite Player dialog searches by name, and no longer lists everyone on the instance.** See [Inviting Players](docs/DM_GUIDE.md#inviting-players).

- **Display names no longer keep invisible characters.**

- **One account can publish up to 500 character templates, and the template list loads without every template's sheet.**

- **One account can have up to 1,000 characters, and the Characters page no longer loads every sheet at once.**

- **An upload's name, description and tags have limits:** 200 characters, 1,000, and 50 tags of 50 characters.

- **A new avatar deletes the old picture, and an avatar can be removed.**

- **Only an administrator can import the SRD creatures, and the import gives up on Open5e after 15 seconds.**

- **Refused dice rolls now count towards the dice roll limit.**

- **The development stack, `docker-compose.dev.yml`, now opens its ports to the computer it runs on and no one else.** See [Local Setup (With Docker)](docs/DEVELOPMENT.md#local-setup-with-docker).

- **The bundled nginx believes a visitor's address, and whether they used HTTPS, only from proxies you list** in the new optional `NGINX_TRUSTED_PROXIES`. See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Every container now runs with Docker's `no-new-privileges` option, the container that serves the app's files is read-only, and neither bundled nginx names its version.**

- **The Nginx example for an install without Docker now gives the app page its Content-Security-Policy and Permissions-Policy.** The dashboard's backups need `pg_dump` on the machine the backend runs on.

- **Environment files in the `backend` folder are now kept out of its Docker image.**

- **The libraries the backend and the app are built on are updated to recent releases within the versions they already used, which fixes a security advisory in the image library.**

- **Two-factor codes are checked by a maintained library, and a code is accepted only as exactly six digits.** Authenticator apps already set up keep working.

- **A map's picture and spirit layer picture can only be map pictures from the asset library.**

- **The server reads a stored picture only once it has checked that the file is a PNG, JPEG, WebP or GIF image.** A map whose picture is another kind of file cannot be exported as `.uvtt`; choose a map picture for it in **Edit Map**.

- **Asking for a password reset now gives the same answer for every address even when the server has trouble saving the link.**

## [1.5.1] - 2026-10-10

### Upgrading from 1.5.0

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is no database change, no new required setting and no manual step. Nothing you have stored is rewritten. All four containers are recreated, because `docker-compose.yml` now gives Docker's own log of each container a size limit. Your campaigns, uploads and backups are kept in a volume and in folders that the recreation does not touch, but Docker's old container logs are removed with the old containers.

If you have edited `nginx/nginx.conf`, for example to turn on HTTPS, or `docker-compose.yml`, `git pull` stops at it because this release changes both files. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If `git stash pop` reports a conflict in `nginx/nginx.conf`, keep your own lines, then compare your HTTPS block with the new commented-out one and add what it has that yours lacks:

- the two `set` lines after `server_name`, naming `$cozyvtt_backend` and `$cozyvtt_frontend`,
- `$cozyvtt_backend` in place of `http://backend:4000`, and `$cozyvtt_frontend` in place of `http://frontend:80`, in every `proxy_pass` line,
- the whole `location /api/campaigns/import` block.

The new `resolver` line near the top of the file covers both blocks.

If you use your own proxy instead of the bundled nginx, give `/api/campaigns/import` a body limit of at least 505 MB and 300 seconds to answer, as [Minimum proxy requirements](docs/DEPLOYMENT.md#minimum-proxy-requirements) describes, or larger campaign archives cannot be imported. There is one new setting, `CAMPAIGN_ARCHIVE_RATE_LIMIT`, and it is optional: leave it out and the default of 20 applies.

#### What you will notice

- **New limits, set far above what a table or a DM preparing a campaign does.** A map is 1 to 500 squares a side with up to 1,000 tokens, a stat block up to 64 KB, and each account may preview, import and export 20 campaign archives an hour; existing maps over these keep loading. Fog of war and explored areas are refused on a map of more than 250,000 squares.
- **Deleting something now asks first,** and shows where a picture or sound is still used.
- **A PDF is no longer accepted as a map picture.** PDF map pictures you already have are kept.
- **CozyVTT now accepts a Universal VTT file of up to 75 MB** with the default map limit. The bundled nginx still stops one over 55 MB unless you raise `NGINX_MAX_BODY_SIZE`; see [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).
- **D&D 5e skills and saving throws have a box for other bonuses.** Opening an existing sheet in the editor puts any difference there, so no total changes.
- **Edits lost before this release are not brought back by it.** A backup from before the loss is the only way back.

#### What to do afterwards, if it applies to you

- **If you set up a `logrotate` rule for `backend/logs`, remove it.** The backend now rotates its own log files, and the two would fight over them.
- **Log lines written before the upgrade still contain full email addresses.** New lines keep only the first letter and the domain. To remove the old lines, follow [Persistent Log Files](docs/DEPLOYMENT.md#persistent-log-files).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.1](docs/api-changes/1.5.1.md).

- **PDF files are no longer accepted as a map picture.** A map takes PNG, JPEG or WebP; PDFs still go in the Documents library, and a map already stored as a PDF is kept.

- **Deleting an asset that is still in use now shows where it is used before anything is removed.** The file goes only with **Delete anyway**, in the Asset Library, the Documents pages and the Admin Panel's Assets tab.

- **The Admin Panel asks before deleting a backup or changing someone's role.**

- **Deleting a custom creature, a token template or a token from the map now asks first.**

- **Dice rolls allow far more before the limit:** 200 a minute and 50 in any one second, where 30 a minute was reachable.

### Fixed

- **A Universal VTT import that is refused now says why.**

- **A Universal VTT import can no longer exhaust the server's memory.** One person runs one import at a time.

- **Exporting a map to a Universal VTT file is quick on large maps, and keeps more of the map.**

- **The proxy size advice now covers Universal VTT imports.** See [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).

- **Closing a document you are writing or editing no longer throws the text away without asking.**

- **The backend's log files say what went wrong.**

- **Log files no longer grow until the disk is full.** The backend keeps five 10 MB files of each of its two logs, and Docker five of 10 MB for each container, from the next `docker compose up -d`.

- **The backend keeps running when the database restarts.**

- **Audio tracks are served correctly from any point in the file.**

- **Stopping, restarting or upgrading the stack is quick and clean,** usually within a second.

- **Markdown documents opened from the Documents page are formatted.**

- **Typing in a token's stat block no longer saves, and resends the whole map to every player, on every keystroke.**

- **Dragging the ambient sound's volume slider no longer sends every step to the whole table.**

- **A chat cooldown longer than a minute now lasts its full length.**

- **The dice log keeps up with new rolls.**

- **Uploaded file names keep their double quotes.**

- **Exporting a large campaign no longer risks stopping the server, and works on slow connections.** An export over 500 MB, the most an import accepts, is refused with its size.

- **Campaign archives up to 500 MB can be imported through the bundled nginx.**

- **A large campaign import or backup restore on a slow connection is no longer cut off after five minutes.** It now has an hour.

- **The site no longer answers 502 after only the backend is recreated.**

- **The deployment guide's section on the API documentation is corrected.**

- **The DM Guide's map export and campaign import sections match the app.**

- **The Characters page shows a character as you last saved it.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40))

- **Saving in the Character Editor no longer copies the whole sheet into the browser's console.**

- **Opening a D&D 5e sheet's editor and cancelling leaves the sheet as it was.**

- **A D&D 5e sheet with cantrips typed in counts as saved once you save it.**

- **What you type while a sheet is saving is kept.**

- **A save refused because the character changed keeps your edits.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40)) The editor lists them under **This character has changed**, with **Save my changes** and **Keep editing**.

- **Edit Template keeps your sheet edits when a save fails.**

- **Saving a Flexible sheet keeps everything stored in it.**

- **A colour you pick for a D&D 5e or Pathfinder 2e sheet stays picked while you edit.**

- **Players can no longer see through a wall that has the same identifier as another.**

- **Editing one light through the API can no longer leave its dim radius smaller than its bright radius.**

- **A single wall can be set to a locked door through the API.**

- **Tokens always stand on whole squares, with all of them on the map.**

- **Wall, door, light and fog changes made at the same moment are all kept.**

- **Undoing a wall change after switching maps no longer puts the old map's walls on the new one.**

- **Typing in the chat box, or any other text box, no longer edits the map's walls.**

- **The DM's map tool panels keep one width.**

- **Walls, doors and lights can be drawn on a map opened over plain HTTP from another device.**

- **The DM's map shows doors players open, and the DM's next wall edit no longer closes them again.**

- **Handing over the DM seat no longer mixes up the spirit realm for the two people involved.**

- **Reconnecting brings back doors and lights changed while you were away.**

- **Switching a map's lighting or fog no longer brings back its old picture.**

- **Saving Edit Map no longer removes the map's spirit layer picture.**

- **D&D 5e features that share a name are all kept.** One already lost is only in a backup taken before.

- **Call of Cthulhu: Dodge keeps the points put into it.** A Dodge already reset has to be typed in again, or restored from a backup.

- **Editing a token template no longer deletes its hit points.** Hit points already lost have to be entered again in **Max HP**.

- **Pathfinder 2e characters made from a built-in template keep their skill bonuses.** One saved with the lower numbers gets them back when next saved in the editor.

- **Typing a list into a character sheet works.**

- **D&D 5e: an older sheet's languages show under Languages.** A language already saved under Weapons has to be moved by hand.

- **D&D 5e: skills and saving throws can include bonuses the sheet cannot work out, and keep them.** A bonus an earlier save removed has to be typed in again, or restored from a backup.

- **Moving a character's older fields no longer deletes what it has not moved.** Run `migrate:sheet-fields` and check its report before saving such a character in the editor; content lost before the upgrade is only in a backup.

- **The character maintenance commands report problems properly,** and end with an error status when they fail.

- **A map name set through the API is limited to 200 characters, as everywhere else.**

- **An uploaded picture, sound file or document is recorded as what it really is.**

- **A campaign import that fails part-way no longer leaves a half-made campaign behind.**

- **Importing a campaign no longer loses whole maps, and says what it changed or left out,** under **Changed to fit** and **Left out**.

- **Imported creatures and templates can be placed on a map and edited.**

- **"Include audio assets" now puts your atmosphere's sound in a campaign export.** An archive exported before holds no sound; export it again.

- **An imported campaign's maps are listed in the order they were in.**

### Security

- **One player can no longer flood the chat, hit points, hit dice or token moves.** Each has a limit per player far above what a table sends; the DM's chat cooldown still works on top.

- **One account can no longer hold unlimited live connections, or rejoin a campaign in a loop.** An account may have 40 open at once.

- **The DM's live controls have limits too.**

- **A dice roll's character name and purpose are limited in length,** 200 and 300 characters.

- **Exploring a map no longer rewrites a player's whole memory of it several times a second.**

- **Signing in with the right password can no longer lock anyone out.** Only wrong answers count toward the limit of five in fifteen minutes from one address.

- **A damaged upload can no longer shut the server down or leave it stuck.**

- **A signed-in user can no longer fill the server's disk through its log.**

- **A malformed request is no longer logged with the text around the mistake.**

- **Log files no longer keep full email addresses,** only the first letter and the domain. See [Persistent Log Files](docs/DEPLOYMENT.md#persistent-log-files) to remove older lines.

- **A specially crafted email address could make the server stop responding for minutes.** An address over 254 characters is refused.

- **A specially crafted atmosphere setting could make the server stop responding for minutes.**

- **A specially crafted hit dice entry on a character sheet could freeze the browser of anyone who opened the sheet.**

- **Restoring a specially crafted backup from the Admin Panel could make the server stop responding.**

- **A very large map can no longer take the whole server down.** Maps are 1 to 500 squares a side, with a grid of 10 to 500 pixels and 1 to 100 feet a square; a larger older map still opens.

- **One map can no longer be grown until the server stalls.** A map holds up to 1,000 tokens and a stat block up to 64 KB; a map that has more keeps them.

- **A wall placed absurdly far away can no longer freeze the server.** Walls and lights may reach up to 500 grid squares past the map's edge.

- **A crafted campaign archive can no longer crash the server.** An archive listing more than 1,000 files is refused.

- **Campaign imports and exports are limited per person:** 20 previews, 20 imports and 20 exports an hour, one at a time, set with the optional `CAMPAIGN_ARCHIVE_RATE_LIMIT`. See [Campaign Import and Export Limits](docs/DEPLOYMENT.md#campaign-import-and-export-limits).

- **Campaign imports take only the files an upload would.**

## [1.5.0] - 2026-10-03

### Upgrading from 1.4.0

The upgrade is the usual one, but read the two lists below: a few things look different afterwards, and some instances need a step or two. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

The database is updated automatically on the first start. The update adds three settings to every map (fog on or off, Global Illumination, and remembering explored areas), set so that existing maps keep their fog and Global Illumination. Remembering explored areas starts on, so players' maps begin to keep ground they have seen, in grey. It adds one new, empty table for explored areas. It also lets two existing columns be empty (who made a dice roll, and who uploaded a file) so that a deleted account's rolls and uploads can stay. No existing row is changed or removed, and there is no manual data migration. No new setting is required.

If you have edited `nginx/nginx.conf`, for example to turn on HTTPS, `git pull` stops at it because this release changes that file too. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If `git stash pop` reports a conflict, keep your own lines, then compare your HTTPS block with the new commented-out one and add what it has that yours lacks:

- `proxy_request_buffering off;` in the `location /api/admin/backups/restore` block,
- the whole `location = /health` block,
- `$remote_addr` wherever the file sets `X-Forwarded-For`.

#### What you will notice

- **Fog of war now hides the map completely.** Players see solid black where nothing has been revealed; existing maps keep fog on, with the same areas revealed.
- **Existing lit maps keep line-of-sight lighting.** They get **Global Illumination** switched on, though unlit ground is now fully dark where it was nearly dark; turn it off in Edit Map or the Lights panel when you want lights and darkvision to matter.
- **A player or spectator with no token on a lit map sees nothing.** To let a spectator watch a lit map, turn dynamic lighting off for that map.
- **Players' maps remember explored areas,** in grey, on lit maps. It is on for existing maps.
- **A token belongs to whoever is set as its controller.** A character's token set to **Nobody (DM controls)**, or to someone else, gives its player no sight on a lit map and cannot be seen by them through fog; choose them in **Edit Token → Controlled By** if they should have it.
- **Character sheets drop fields their game system does not define,** the next time each sheet is saved. Fields written by sheets before 1.3.0 are moved to where the sheet reads them, and where that place already holds something, the older copy is dropped.

#### What to do afterwards, if it applies to you

- **Regenerate your MFA backup codes.** Existing backup codes stop working, because they are now stored like passwords. Sign in with your authenticator app and use **Profile & Settings → Security → Backup Codes → Regenerate**. The authenticator app keeps working.
- **Move old backups.** Backups now live in `backend/backups/`, outside the uploads folder. If you have backups in `backend/uploads/backups/`, move them once the upgraded stack has started; the dashboard lists only the new folder. On Docker both folders belong to the backend's user inside the container, so the move needs `sudo`. The `chmod` makes the moved backups readable by that user alone, like new ones:

  ```bash
  sudo sh -c 'mv backend/uploads/backups/*.zip backend/backups/ && chmod 600 backend/backups/*.zip'
  ```

  Without Docker, the folder is created the first time the Backups tab is opened. To move backups before that, run `mkdir -p backend/backups && chmod 700 backend/backups`, then the part in quotes above on its own, without `sudo sh -c`.
- **Check your database password.** A production instance now refuses to start while `DATABASE_PASSWORD` is still the placeholder from `.env.example`. If `docker compose logs backend` shows that message, change the password inside the database first, because the database only reads `POSTGRES_PASSWORD` when it is first created. Changing `.env` alone would lock the backend out. With the stack up (the database runs even while the backend refuses to start):

  ```bash
  NEW_PASSWORD=$(openssl rand -hex 24)
  docker compose exec database psql -U cozyvtt -d cozyvtt -c "ALTER USER cozyvtt WITH PASSWORD '$NEW_PASSWORD';"
  echo "$NEW_PASSWORD"
  ```

  Put the printed value in `.env` as `DATABASE_PASSWORD`, then run `docker compose up -d`. If you changed `DATABASE_USER` or `DATABASE_NAME`, use your own names in place of `cozyvtt` (the refusal message prints the command with your names filled in). See [Changing the database password](docs/DEPLOYMENT.md#changing-the-database-password).
- **Without Docker, make the database role own the database and its `public` schema.** Restoring a backup now recreates the `public` schema, which only its owner may do. Docker installs already have this. On a manual install, run these once, with your own names if you changed them (the second is needed on PostgreSQL 14, or on a database first created on 14, and is harmless on newer versions):

  ```bash
  sudo -u postgres psql -c "ALTER DATABASE cozyvtt OWNER TO cozyvtt;"
  sudo -u postgres psql -d cozyvtt -c "ALTER SCHEMA public OWNER TO cozyvtt;"
  ```

  Nothing else needs it until you restore a backup.

**Backups made from the Admin Dashboard on 1.4.0 could not be restored.** They were not damaged, and they restore on 1.5.0, including into a fresh 1.5.0 install. An install without Docker can keep backups somewhere else with the optional `BACKUP_DIR` setting.

### Added

- **Obscure a token's identity.** Right-click a token for **Obscure Identity**: players who do not control it see a grey shape called "Unknown creature", and nothing else about it reaches their browsers. See [Obscuring a Token's Identity](docs/DM_GUIDE.md#obscuring-a-tokens-identity).

- **Maps remember what each player has explored.** On a map with dynamic lighting, **Remember Explored Areas** in Edit Map turns it on for a map, and **Reset explored areas** in the Fog of War panel clears it. See [Explored Areas](docs/DM_GUIDE.md#explored-areas).

- **Tokens have darkvision,** set in grid squares in the Token Manager or Edit Token. See [Darkvision](docs/DM_GUIDE.md#darkvision).

- **Preview the map through a token,** or **All player tokens** for the whole party. See [Previewing the Player View](docs/DM_GUIDE.md#previewing-the-player-view).

- **The DM can delete the campaign's own documents** from the Campaign documents panel.

- **Fog of war can be turned on or off for each map,** at the top of the Fog of War panel or in Edit Map. See [Turning Fog On or Off](docs/DM_GUIDE.md#turning-fog-on-or-off).

- **Each vibe period can play its own music,** chosen in the period editor. Notes typed into the old audio box are dropped the next time the periods are saved.

### Changed

- **Tied initiative keeps the order combatants were added in.**

- **Dynamic lighting limits what players see.** A player sees what their tokens' darkvision reaches and what a light lights. **Global Illumination** keeps the older line-of-sight behaviour, and is on for maps made before this release. See [Enabling Dynamic Lighting](docs/DM_GUIDE.md#enabling-dynamic-lighting).

- **Preview Player View shows one chosen player's view.**

- **New maps start with fog of war off.**

- **The Creature Library and Token Templates buttons have their own icons,** a skull and a stamp.

- **Spectators can chat but can no longer roll dice.**

### Fixed

- **Deleting an account works.** The person's chat, rolls and uploads stay, no longer linked to anyone. A campaign they created with no other DM must be handed over or deleted first.

- **Display names are checked by the server,** 1 to 50 characters.

- **A new instance gets exactly one first administrator.**

- **Accepting an invitation brings only characters that can join that campaign.**

- **Character sheets store only the fields their game system defines.**

- **Saving a sheet no longer undoes hit point changes the DM made.**

- **A save refused over a bad value keeps your edits.**

- **An emptied text box no longer stops a sheet saving.**

- **D&D 5e characters made before 1.3.0 show their proficiencies and languages.**

- **A D&D 5e character without spellcasting details can be saved.**

- **Pathfinder 2e spells no longer stop a sheet saving.**

- **Pathfinder 2e spell slots show how many are used.**

- **Pathfinder 2e feat descriptions show on the read-only sheet.**

- **Call of Cthulhu skills inside a group can be edited.**

- **Call of Cthulhu possession notes keep their dashes.**

- **A short colour code such as `#fff` works as a sheet's header colour.**

- **Screen readers can reach the character sheet and its editor.**

- **The editor that opens over a character sheet asks "Discard Changes?" only when you have changed something.**

- **Escape no longer throws away edits in the sheet editor.**

- **The Characters page shows a sheet as it was last saved.**

- **Leaving a Flexible sheet with unsaved changes asks first.**

- **Being signed out no longer loses the changes in a character sheet editor.**

- **A character sheet editor with unsaved changes keeps you signed in.**

- **Fog of war hides the map from players.**

- **Players see lighting changes straight away.**

- **The screen and the server agree on what a player can see.**

- **Move to Map… includes maps made after the page loaded.**

- **The Map Library remembers which map the table is on.**

- **Wall and fog changes made through the API reach players' open maps at once.**

- **Revealed fog no longer looks lost after a refresh.**

- **A map with no picture says so:** "This map has no picture".

- **Light edges fade softly.**

- **Carrying a player's token no longer reveals the map to them.**

- **A token picked up and put back returns for everyone.**

- **The Token Templates list shows each template's picture.**

- **Any token can be hidden from the right-click menu.**

- **A token moved to another map keeps all its details.**

- **Moving several tokens between maps no longer loses or doubles any.**

- **A moved token keeps its initiative entry, and the table stays on its map.**

- **A player's token is the one they control, on screen as on the server.**

- **The page keeps its member list up to date as people join, leave or change role.**

- **Refused changes to a token now say why.**

- **Creatures and token templates with unrecognised values can be placed.**

- **The initiative tracker follows the token.**

- **Rolling or typing initiative works for a combatant on another map.**

- **Removing the last combatant ends the fight.**

- **A roll that finishes after the fight ends, or after its combatant is removed, no longer brings either back.**

- **A combatant whose token or map is deleted now leaves the order.**

- **Resuming a paused session keeps what the DM did during the break.**

- **Role changes take effect on open pages at once.**

- **Messages and rolls sent by others during a reconnect are no longer missed.**

- **A player no longer falls behind after a dropped connection.**

- **The connection badge shows Connected after the server closes and reopens a connection.**

- **A game table whose sign-in has ended goes to the sign-in page.**

- **Deleting a campaign removes everyone still on it from its live game.**

- **A brief database error while telling the table about a change no longer reports a saved change as failed.**

- **The vibe tracker says when it is off.**

- **The vibe period editor keeps its buttons on screen.**

- **Player Preview looks only through tokens the players would have.**

- **Player Preview hides the DM's light markers.** Leave the preview to move or edit a light.

- **Backups made from the Admin Dashboard restore again,** including backups made on 1.4.0 and backups from an older version into a newer one.

- **A restore checks the file first and keeps a copy of what it replaces.**

- **The command-line restore script no longer deletes your database before the backup has loaded.**

- **Long backups and restores no longer show as failed while still running.**

- **A backup appears in the list only once it is complete.**

- **Two backups made in the same second no longer overwrite each other.**

- **A backup that fails while being written no longer stops the backend.**

- **A backups folder the backend cannot use is reported by name.**

- **The restore script explains a full temporary folder.**

- **The message shown when the backup tools are missing names the right fix.**

- **Malformed requests from scripts get a message that says what is wrong.**

- **A map whose picture was deleted before the campaign was exported now imports without a picture.**

- **`SESSION_MAX_AGE`, `REMEMBER_ME_MAX_AGE` and `LOG_LEVEL` in `.env` now work on Docker.** Use `docker compose up -d` after changing `.env`; `docker compose restart` keeps the old settings.

- **The bundled web server forwards `/health` to the backend,** which answers 503 when the database is unreachable.

- **The deployment guide covers backups behind your own proxy.**

- **Above a PDF, the document reader now says "Not showing?" and links to open it in a new tab.**

- **Imported tokens and token templates are held to the same limits as ones placed by hand.**

- **Imported tokens whose picture was not in the archive import with no picture.**

- **The API's character validation check reports real problems.**

- **Guides and in-app text corrected.**

- **Developer documentation corrections.**

### Security

- **A profile picture can only point at that user's own uploaded avatar.**

- **A page on another address can no longer act as you.** A request that changes something, and a live game connection, must come from the address in `CORS_ORIGIN`.

- **MFA backup codes are harder to guess and stored like passwords.** Existing codes stop working; regenerate them.

- **A backup code works only once, even when two sign-ins use it at the same moment.**

- **An authenticator code works only once, and wrong codes are limited per account.**

- **Setting up MFA, turning it off and regenerating backup codes have attempt limits.**

- **Changing an email address through the API, or turning on MFA, needs your current password.**

- **Only the newest password-reset or invitation link works.**

- **The forgot-password page no longer gives away which addresses have accounts by how long it takes.**

- **Ending a sign-in closes its live game connections too.**

- **Deleting your own account signs it out on every device.**

- **An instance can no longer lose its last administrator.**

- **An account registered while admin approval is required cannot sign in before it is approved.**

- **Each sign-in starts a new session.**

- **One password rule everywhere: at least 12 characters, with an uppercase letter, a lowercase letter, a number and a special character.** Passwords already set are not affected.

- **Names and descriptions typed by users appear as plain text in emails.**

- **The Creature Library's homebrew count covers only your campaign.**

- **Saving someone else's character no longer reveals its game system.**

- **Maps the DM has not shown yet are private to the DM.** Players and spectators get only the campaign's current map, though art in the campaign's asset library stays visible to every member.

- **Players are not told about combatants on a map the table is not showing.**

- **A removed player's characters leave the campaign with them.**

- **A former member can no longer delete or move campaign assets they uploaded.**

- **Deleting a campaign hands its library to the uploaders and deletes the campaign in one step.**

- **Only the DM can add assets to a campaign's library, by uploading or by moving.** Players may still add token art.

- **A picture can only be used by someone allowed to read it.**

- **Exports include only files the person exporting may open.**

- **The creature and token template libraries can be read only by the DM.**

- **The campaign overview no longer shows players a map's spirit-layer image address.**

- **Campaign settings are checked before they are saved.**

- **Only the DM's chat messages are shown as DM messages.**

- **A live connection is only ever in one campaign.**

- **Repeated requests can no longer slow the server down.**

- **Players are sent only what they may see of a token.** A creature with its HP bar off no longer looks downed to players at zero hit points.

- **The initiative tracker no longer shows players exact hit points or hidden creatures.**

- **An obscured token no longer reveals its controller, kind, facing or stored initiative to other players.**

- **Rolling initiative for a hidden creature is no longer announced to every player.**

- **Token moves reach only the players who would be sent the token.**

- **Revealing a token from the Spirit Layer panel no longer sends players its notes and position.**

- **Every token field is checked before it is stored, and a token can be bound only to a character in its own campaign.**

- **A spectator never controls a token and cannot change a character.**

- **A spectator cannot move or edit a token through the API, and only the DM can resize a token.**

- **A player opening or closing a door can only change whether it is open.**

- **Pausing or ending a session stops players moving tokens on the server as well as in the browser.**

- **Branding image paths containing a backslash or a control character are refused.**

- **A character sheet's header colour is used only if it is a preset or a `#RRGGBB` colour.**

- **Atmosphere filters and the spirit realm's custom colour are checked before use.**

- **A crafted backup file can no longer run shell commands in the backend container.** A backup is still SQL the database runs with full rights, so restore only backups made on an instance you trust.

- **Backups no longer contain sign-in sessions, and a restore signs everyone out.** After the command-line restore script, restart the backend.

- **Backups are readable only by the backend's user.** On Docker, copying a dashboard backup off the server by hand needs `sudo`.

- **The database password no longer shows in the server's process list during a backup or restore.**

- **Backups are kept outside the uploads folder,** in `backend/backups/`.

- **A production instance refuses to start with the placeholder database password.** See [Changing the database password](docs/DEPLOYMENT.md#changing-the-database-password).

- **The bundled nginx no longer saves a huge upload to the restore address from anyone who sends one.**

- **Behind a Cloudflare Tunnel or another proxy, one person's wrong passwords no longer lock everyone out.** See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Dependencies updated for published advisories.** The unused OpenAI client library is removed.

## [1.4.0] - 2026-09-14

### Upgrading from 1.3.0

Nothing to do beyond the usual upgrade, and nothing you have is changed or removed. The upgrade adds two new, empty database tables (one for saved dice macros, one for documents shared with a campaign); they are created automatically on the first startup after you pull, and no existing table is touched. Back up first as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

**One new optional setting.** `MAX_DOCUMENT_SIZE_MB` sets the largest document a DM can upload and defaults to **50 MB** if you do not set it, so you can ignore it unless you want a different limit. It lives beside the other size limits under **Admin → Settings → Upload Size Limits**. Rulebooks are large, so if you raise it, raise `NGINX_MAX_BODY_SIZE` to match, or the bundled proxy will reject the upload before it reaches CozyVTT.

There is no manual data migration for this release.

### Added

- **Walls can be selected and moved.** Click, Shift-click, drag a box or press Ctrl+A, then drag or nudge with the arrow keys. This is also the fix when a map's walls do not sit on its artwork. See [Selecting and Moving Walls](docs/DM_GUIDE.md#selecting-and-moving-walls).

- **Rulebooks and handouts, readable inside CozyVTT.** ([#39](https://github.com/CheekyChinchilla/CozyVTT/issues/39)) A **Documents** section on the dashboard holds PDF, plain text and Markdown documents, uploaded or written in CozyVTT, and a DM shares them with a campaign. Adds a `documents/` folder under your uploads directory. See [Documents](docs/USER_GUIDE.md#documents).

- **Save the rolls you keep retyping.** ([#47](https://github.com/CheekyChinchilla/CozyVTT/issues/47)) **Saved**, beneath the dice buttons, keeps up to fifty named rolls per campaign, seen by you alone. See [Rolling Dice](docs/USER_GUIDE.md#rolling-dice).

- **The DM can hand the game to someone else.** ([#33](https://github.com/CheekyChinchilla/CozyVTT/issues/33)) The **crown** in **Campaign Settings → Members** moves the DM seat, live. The campaign's owner keeps **Owner Settings** to delete it or take the seat back. See [Handing the game to someone else](docs/DM_GUIDE.md#handing-the-game-to-someone-else).

- **Hit dice can be spent from the sheet and the roll menu.** ([#43](https://github.com/CheekyChinchilla/CozyVTT/issues/43)) A click rolls one die plus Constitution and counts it off; apply the healing with the roster's **+**. See [Spending a hit die on a short rest (D&D 5e)](docs/PLAYER_GUIDE.md#spending-a-hit-die-on-a-short-rest-dd-5e).

- **A roll of your own, from your own token.** **Custom Roll** sits at the foot of your character's roll menu, filed under your character.

### Fixed

- **Updated the image library that makes map and token previews,** which had known flaws in reading GIF images.

- **Only the person who controls a token can drag it.**

- **Removing someone from a campaign now takes effect straight away.**

- **Changing your password now signs out your other devices,** and so does turning off two-factor authentication.

- **Taking away someone's access now takes effect at once.**

- **Homebrew creatures stay in the campaign they were made for.**

- **A failed restore no longer empties your database.** A restore is all or nothing.

- **An uploaded map or token image can no longer be served as a web page or a script.**

- **The map tool panels start out of the way,** folded.

- **Folding a tool panel away puts its tool down.**

- **An imported map is no longer pitch black for your players.** Lighting comes on only when the file has lights.

- **Maps imported from a UVTT get the same checks, and a preview, as any other upload.**

- **Maps exported as part of a bigger map now line up.**

- **Furniture can block sight now, if you want it to.** The import asks whether to bring in furniture walls.

- **A map too big to edit is now refused when you import it,** past 5000 wall segments.

- **Coloured lights from a UVTT keep their colour.**

- **A Universal VTT whose walls reach outside its own picture now says so before importing.** ([#59](https://github.com/CheekyChinchilla/CozyVTT/issues/59))

- **Instance branding images must live on your own instance.** If you set a link to another site, replace it with your own file.

- **The app now tells your browser what it is allowed to do.** A reverse proxy of your own must pass response headers through, and over HTTPS one more header can be turned on by hand, commented in `nginx/nginx.conf`. See [Minimum proxy requirements](docs/DEPLOYMENT.md#minimum-proxy-requirements).

- **An asset's scope is spelled out everywhere it appears.**

- **The atmosphere track list only offers tracks that will actually play.**

- **Atmosphere audio from the DM's own library now plays for the whole table.**

- **An uploaded audio file can no longer be served as a web page.**

- **Downloading an asset follows the same rules as viewing it.**

- **Tables and single line breaks in Markdown.**

- **Notes and documents no longer load pictures from other websites.** Upload a picture to your asset library and link to it there.

- **An upload has to look like what it claims to be.**

- **Clearing the dice history now follows who is running the game.**

- **Two settings CozyVTT offered but ignored,** `VITE_API_URL` and `VITE_SOCKET_URL`, are read from `.env`. Leave them blank unless the backend answers at another address.

- **Dice rolls live in the Dice panel, and always have.** The guides now say so, and rolls no longer write a hidden copy into the chat log.

- **Chat history goes all the way back again.** ([#44](https://github.com/CheekyChinchilla/CozyVTT/issues/44))

- **A roll now says who it is for, not just who pressed the button,** with **(DM rolled)** beside a roll the DM made for someone.

- **Only you and your DM can roll your character's dice.** ([#42](https://github.com/CheekyChinchilla/CozyVTT/issues/42)) Others can still read your sheet.

- **The backup script runs on Linux and macOS.**

- **CozyVTT declares its licence correctly,** AGPL-3.0-only.

## [1.3.0] - 2026-09-04

### Upgrading from 1.2.2

`docker compose up -d --build`. No configuration changes.

This release adds one new table, for the personal notes feature. The backend container applies it on start; you don't run anything by hand. It is purely additive: no existing table or row is altered, so campaigns, characters, maps and history all carry over untouched. If the migration fails, the backend refuses to start, so it never serves a half-updated database.

As with any release that migrates, take a database dump first, since migrations here are forward-only:

```bash
./backend/scripts/backup.sh
```

**Pathfinder 2e tables have one command to run afterwards.** The starter templates used to fill in fields the sheet never read, and this moves that content to where it is displayed:

```bash
docker compose exec backend npm run migrate:sheet-fields
```

Add `-- --dry-run` first if you would like to see what it would change. D&D 5e sheets need nothing; they are read correctly as they are.

**One change worth telling your players about.** Dynamic lighting now requires line of sight: a lit room is only visible to someone who can actually see into it. If your maps relied on a light revealing a room to the whole table, those rooms will now stay dark until a character can see them.

### Added

- **Notes of your own, in a new Notes tab.** Up to two hundred Markdown notes per campaign, saved as you type and private to you, the DM included. See [Your Own Notes](docs/USER_GUIDE.md#your-own-notes).

- **You can add skills of your own to a D&D 5e sheet,** under **Your Own Skills**, for tool proficiencies or homebrew skills. See [Skills the sheet doesn't have (D&D 5e)](docs/PLAYER_GUIDE.md#skills-the-sheet-doesnt-have-dd-5e).

- **The notes your DM writes at the end of a session are finally readable,** in **Past Sessions** on the **Session** tab, for the whole campaign. Notes written before this release appear too, so a DM who used the box as a private reminder should read them first; the pencil on each entry edits or clears it. See [Editing or clearing a past session's notes](docs/DM_GUIDE.md#editing-or-clearing-a-past-sessions-notes).

- **The Call of Cthulhu sheet can record what the rules ask an investigator to track:** conditions, Cthulhu Mythos and spells, appearance, and Keeper's Notes.

- **A weapon you add yourself can carry properties,** the eleven from the rules or your own.

- **A weapon can have more than one damage roll,** each rollable on its own. See [Weapons that do more than one thing](docs/PLAYER_GUIDE.md#weapons-that-do-more-than-one-thing).

- **A feature or trait can carry its description.**

### Changed

- **The dice panel reads like a conversation,** a running list with the newest at the bottom.

- **The token details panel is bigger and properly laid out,** with the token's picture, HP, conditions and initiative.

- **Exhaustion is tracked properly, in its six levels.**

- **Spell save DC and spell attack are worked out for you,** each with an **Other bonus** box. Numbers you had typed are kept as that bonus.

- **A misleading promise about secret rolls has been corrected.** The box reads **"hidden from other players"**: the DM has always seen secret rolls.

- **The roster's "Reassign to Player" menu entry is gone.** It never did anything.

- **Internal: the codebase is strictly typed again.** Nothing about how CozyVTT behaves changes.

- **Three unnecessary packages removed from the backend install.**

### Fixed

- **Signing in successfully no longer counts towards the lockout.** Five wrong answers in fifteen minutes still lock an address; creating accounts is limited to ten an hour per address.

- **Players can see the map and the token art again.** A picture a campaign uses can be seen by everyone in that campaign.

- **Character sheets now show the features and proficiencies they were built with.** Pathfinder 2e characters need the one command in the upgrade notes.

- **Pathfinder 2e sheets show the right Armor Class, Class DC and Initiative.**

- **Your character keeps the name you gave it.**

- **Characters no longer claim to be wizards.**

- **A Pathfinder 2e sheet no longer breaks when a strike has no proficiency recorded.**

- **The Pathfinder 2e sheet shows everything it lets you record,** with deity and alignment added.

- **A Pathfinder 2e character with a ritual can be saved again.**

- **Adding a feature to a sheet works, and a deleted one stays deleted.**

- **A D&D 5e sheet with an empty Hit Dice total opens again.**

- **Your D&D 5e languages stay where you put them.**

- **Hit points changed on a character sheet show up straight away.**

- **A character created for a campaign now actually appears in it.**

- **The DM can put any player's character on the map,** by dragging from the roster or with **Add to Map**.

- **Your own secret rolls stay in your list,** with a **Secret** button to hide them.

- **The roll picker now offers the rolls a Pathfinder 2e or Call of Cthulhu character actually has.**

- **Pointing at the dark no longer tells you what is standing in it.**

- **You cannot lose your own token underneath someone else's.** Creatures no longer share a square, and a creature at zero hit points is drawn faded and can be stood on; the DM may still stack tokens. See [Two creatures can't stand in the same square](docs/PLAYER_GUIDE.md#two-creatures-cant-stand-in-the-same-square).

- **Messages from the map are readable again.**

- **A token added to the initiative tracker starts with no initiative.**

- **A DM can now mark an NPC with any of the fifteen D&D 5e conditions.**

- **The setup wizard now keeps the settings it asks you for.**

- **Finishing setup takes you to your dashboard, signed in.**

- **Uploaded files are filed by what they are.** Files you already have stay where they are.

- **A lit room behind a wall is no longer visible, or readable, through the wall.** ([#29](https://github.com/CheekyChinchilla/CozyVTT/issues/29)) You see something when you have line of sight to it and it is lit.

- **A character's new picture reaches its token again.**

- **One unreadable dice roll no longer takes down the whole campaign screen.**

- **The backup and restore scripts work on a Docker install.**

- **A large save no longer fails with an unexplained error.** The request limit is 1 MB.

- **The SRD attribution now says the right thing.** CozyVTT uses the System Reference Document 5.1 under Creative Commons Attribution 4.0, and the files are renamed `SRD_ATTRIBUTION.md` and `SRD_LICENSE.txt`.

- **The rest of the documentation has been checked against the code.**

- **The WebSocket protocol is documented in one place, and the event list can no longer fall behind.**

- **Twelve endpoints that no longer exist have been removed from `docs/API_REFERENCE.md`.**

- **The backend route reference is accurate again, and is no longer described as a public API.**

### Security

- **A token's hit points, size, conditions and stat block are now checked before they are stored.**

## [1.2.2] - 2026-08-27

### Upgrading from 1.2.1

`docker compose up -d --build`. No configuration changes.

This release adds one nullable column, which the backend container applies on start; you don't run anything by hand. It is purely additive and touches no existing row: campaigns simply start with no "history cleared" timestamp, which means every roll you have already made stays visible. If the migration fails, the backend refuses to start, so it never serves a half-updated database.

As with any release that migrates, take a database dump first, since migrations here are forward-only:

```bash
./backend/scripts/backup.sh
```

### Added

- **Campaign invitation emails are now opt-in.** The invite dialog has **Also email them an invitation**, unticked to start; the invitation shows on the player's dashboard either way.

### Changed

- **Clicking a character in your gallery opens it for reading, not for editing,** with **Edit** on the sheet.

- **Players joining and leaving no longer post to chat.** A green or grey dot beside each name in the **Campaign Roster** shows who is in the session. A DM can clear old notices with the eraser button on the chat panel.

### Fixed

- **The Roll button no longer sticks on "Rolling…",** and chat, the roster, the map and the initiative tracker keep working after a dropped connection.

- **A character's name now appears on its sheet,** and **Player Name** is filled in from the owner's display name. Characters created before this release are not changed.

- **Number fields on character sheets can be cleared and retyped.**

- **Changing a character's token image updates the map,** without changing a token's name.

- **Roll history survives a refresh.** ([#25](https://github.com/CheekyChinchilla/CozyVTT/issues/25)) Secret rolls stay secret; rolls made while the session is paused stay in the browser.

- **Clearing roll history now sticks.** The rolls themselves are kept.

- **Leaving the character editor asks before discarding your work, and only then.**

- **Invitation links now open the "choose a password" screen instead of the sign-in page.** ([#22](https://github.com/CheekyChinchilla/CozyVTT/issues/22))

- **The character sheet no longer shows two Save buttons.** ([#23](https://github.com/CheekyChinchilla/CozyVTT/issues/23))

- **Save and Cancel no longer sit on top of Experience Points and the colour picker.** ([#23](https://github.com/CheekyChinchilla/CozyVTT/issues/23))

- **The character sheet viewer no longer shows two Edit buttons.**

- **The close button on the character sheet window is back on the window.**

- **Players can roll their own initiative,** from their row in the tracker or **Roll Initiative** on their token, once the DM has added them and until combat starts. See [Rolling Your Own Initiative](docs/PLAYER_GUIDE.md#rolling-your-own-initiative).

- **Token conditions are readable on the map.** ([#27](https://github.com/CheekyChinchilla/CozyVTT/issues/27)) Each shows as a two-letter badge, and hovering a token names its conditions in full.

- **Initiative rolls now follow each game system's rules.** D&D 5e adds Dexterity and an **Initiative other bonus**, Pathfinder 2e the stat its **Uses:** names, and Call of Cthulhu sets DEX order with no roll. D&D 5e characters made before keep the total they had.

- **Passive Perception is right on a D&D 5e sheet, expertise included.** ([#26](https://github.com/CheekyChinchilla/CozyVTT/issues/26)) An **Other bonus** box takes the Observant feat and the like.

- **Renaming a character updates it everywhere.**

- **Call of Cthulhu characteristics are in the same order whether you are reading or editing.**

- **The token right-click menu is only as wide as it needs to be, and no longer lists "Roll…" twice.**

## [1.2.1] - 2026-08-23

### Upgrading from 1.2.0

`docker compose up -d --build`. No configuration changes.

This release adds a database table, which the backend container applies on start; you don't run anything by hand. If the migration fails, the backend refuses to start, so a broken upgrade cannot go unnoticed.

The change is additive and touches no existing data: one new table nothing previously read, and one new permission column that defaults to off. **Nobody gains the template editor permission on upgrade**: an admin grants it per user. Your characters, campaigns, maps and creatures are untouched.

As with any release that migrates, take a database dump first. Migrations here are forward-only, so rolling back to 1.2.0 means restoring one:

```bash
./backend/scripts/backup.sh
```

### Added

- **Character templates, shareable starter sheets.** Publish one from the **Character Templates** page, from a sheet with **Save as Template**, while creating a character, or by importing a character JSON; copying one makes a character of your own. A per-user **template editor** permission, granted in the Admin Panel, lets someone edit anyone's. See [Character Templates](docs/USER_GUIDE.md#character-templates).

- **Alt+click places an area template freely,** off the grid.

### Fixed

- **A global asset manager can delete their own global assets again.**

- **Cone and line templates now sweep around the square you pin them on.**

- **Esc now closes the area template tool,** first dropping the placement, then putting the tool away.

- **A token with no image no longer shows a heart icon.**

## [1.2.0] - 2026-08-22

### Upgrading from 1.1.2

`docker compose up -d --build` is all that is required: **no database migration, and no configuration changes.** Creature stat blocks are stored as JSON and every new field is optional, so existing creatures, tokens, token templates and campaign archives load unchanged.

Your existing creatures keep their exact numbers. CozyVTT works backwards from each stored bonus to show the right proficiency checkboxes, so an SRD Goblin opens already showing Stealth as expertise at its printed +6 without anything being rewritten.

One optional follow-up:

- **Record proficiency on your seeded SRD creatures.** The editor infers it on the fly regardless, so this is a tidiness step, not a fix. It writes the structure into the stored stat blocks so it doesn't have to be re-derived each time:

  ```bash
  # See what would change without writing anything
  docker compose exec backend node dist/scripts/backfillCreatureProficiency.js --dry-run

  # Apply it
  docker compose exec backend node dist/scripts/backfillCreatureProficiency.js
  ```

  It only touches creatures with `source: 'srd'` (**your custom creatures are never read or written**) and it never changes a printed bonus, only records the reasoning behind it. Safe to run more than once; a second run reports everything as already done. Add `--verbose` for a per-creature breakdown. On a full SRD library expect roughly 212 of 322 creatures updated, with a handful of entries left as overrides where the published stat block doesn't follow the CR proficiency table (the Night Hag is one).

### Added

- **Ping a location on the map with Tab.** A dot with rings, in your colour and labelled with your name, shows to everyone for about a second and a half. See [Pointing at the Map](docs/PLAYER_GUIDE.md#pointing-at-the-map).

- **The acting combatant's token is highlighted on the map** with a pulsing gold ring, never shown for a creature players cannot see.

- **Hovering an initiative row highlights that token on the map, and the other way round.**

- **Creature saving throws and skills are worked out for you** from proficiency, ability scores and Challenge Rating, with overrides for homebrew. Existing creatures keep their exact numbers. See [Saving Throws and Skills](docs/DM_GUIDE.md#saving-throws-and-skills).

### Changed

- **Creature rolls now depend on your game system.** Call of Cthulhu and Shadowrun offer **Custom Roll** only.

- **Pathfinder 2e creatures use Pathfinder's own structure:** Fortitude, Reflex and Will, a Level, and attribute modifiers, entered as printed.

- **The Creature Library now shows your campaign's game system by default,** with **All game systems** in Filters, and the seeding button reads **Import D&D 5e SRD**.

- **Challenge Rating is chosen from a list.**

- **Fog of war is now a box selection instead of a brush,** snapped to whole squares. The brush and its size slider are gone; revealed areas carry over. See [Revealing and Hiding](docs/DM_GUIDE.md#revealing-and-hiding).

### Fixed

- **Editing a creature no longer deletes its saving throws and skills,** XP or notes.

- **A creature can no longer be given an impossible saving throw.**

- **Negative bonuses no longer display as `+-1`,** and multi-word skills read as "Sleight of Hand".

- **Editing one creature straight after another no longer carries the first one's data across.**

- **AoE templates now line up with the grid.**

- **Creature token images can be chosen from the asset library, not just uploaded.**

- **Creature token images were broken even when uploaded.**

- **Changing a token's image updates the map immediately for everyone.**

- **The NPC Quick Editor's close button is no longer pushed off the panel edge.**

- **The initiative tracker no longer freezes after a WebSocket reconnect.**

- **The documentation covers creatures, character templates, the ruler and the AoE Shape tool, and the asset deletion rules,** and several guide sections were corrected to match the app.

## [1.1.2] - 2026-08-21

A readability and account-management release: text is legible on every theme, admins can invite users by email instead of handing out passwords, and the external reverse proxy documentation now describes a setup that works.

### Upgrading from 1.1.1

```bash
git pull
docker compose up -d --build
```

No database migration, no configuration changes. Verified by upgrading a 1.1.1 instance in place: existing accounts sign in with their original passwords and are **not** forced to reset, campaigns, characters and uploaded files are untouched, and saved theme choices, custom colours included, carry over exactly.

Two changes are visible immediately and are intentional:

- Muted and accent-coloured text shifts slightly (darker on light themes, lighter on dark ones): that text was below the readable minimum on most themes
- Error, success and warning panels now tint with your theme instead of always being pale pink or green

If your instance has SMTP configured, **Admin → Users** gains an **Invite User** button; if it doesn't, Create User behaves exactly as before.

### Added

- **Invite users by email.** With SMTP configured, **Admin → Users → Invite User** sends a link valid for 7 days, and the person chooses their own password. **Invite** on a user who has never signed in sends a fresh one.

### Changed

- **Custom theme colours are checked for readability,** with each key pair's contrast shown and anything under 4.5:1 flagged.

- **The temporary password from Create User is shown only when it cannot be emailed.**

- **Password requirement checklists are defined once,** so they match what the server enforces.

### Fixed

- **Text is now readable on every theme,** at 4.5:1 or better everywhere.

- **Screens now follow your theme,** where panels, badges and stat blocks used fixed colours.

- **Stat blocks are readable on the dark themes.**

- **The Pathfinder and Call of Cthulhu stat block accents render.**

- **Faint labels on character sheets and the DM's map panels are readable.**

- **Admin-issued temporary passwords now stop working once used.** Until it is replaced, the account can only change its password.

- **Resetting a user's password from the admin panel signs out their existing sessions.**

- **The external reverse proxy instructions describe a setup that works,** with a new Cloudflare Tunnel section, a troubleshooting section and a `docker-compose.override.example.yml` for your own changes. See [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy).

- **The health check instructions work,** using `docker compose exec`.

- **`docker-compose.yml`'s header lists what running without the bundled nginx needs.**

## [1.1.1] - 2026-08-17

A bug-fix release for two settings that looked configurable but weren't: upload size limits set in `.env`, and a creature's HP Max.

### Upgrading from 1.1.0

`docker compose up -d --build` is all that is required: no migration, no configuration changes.

Two optional follow-ups:
- To give SRD monsters their hit points, open a campaign's creature library and click **Seed SRD**. It backfills HP onto the SRD creatures already in your library and leaves custom creatures alone.
- If you raise a `MAX_*_SIZE_MB` above about 50 MB, also raise `NGINX_MAX_BODY_SIZE` (bundled Nginx) or your own proxy's body limit; the backend logs a warning at startup telling you the value it needs.

### Added

- **`NGINX_MAX_BODY_SIZE`** sets the bundled Nginx request body cap, `55M` by default, without editing `nginx/nginx.conf`. See [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).

- **A public endpoint returns the server's upload limits,** so a change takes effect on restart without rebuilding the frontend.

### Changed

- **Default upload limits in code match the documented ones,** 50 MB for maps and 20 MB for audio.

- **The bundled Nginx reads its body size from `NGINX_MAX_BODY_SIZE`,** and `nginx/nginx.conf` is mounted as a template.

- **The backend logs its upload limits at startup,** and warns when they pass the proxy's cap, including Cloudflare's 100 MB.

- **The upload dialog shows the largest size for the asset type,** and the admin panel the body limit your proxy needs.

### Fixed

- **Creature HP Max now saves,** and a creature is placed with its own hit points.

- **SRD monsters now carry their real hit points.** Re-running **Seed SRD** fills them in for creatures already imported.

- **Upload size limits set in `.env` are now applied:** `MAX_MAP_SIZE_MB`, `MAX_TOKEN_SIZE_MB`, `MAX_AUDIO_SIZE_MB` and `MAX_AVATAR_SIZE_MB`.

- **An oversize upload names the asset type and its real limit.**

- **Files dropped onto the upload dialog are checked against the type selected.**

- **Avatars are checked against the server's avatar limit after cropping.**

## [1.1.0] - 2026-07-12

A modernisation release: faster real-time play, a resizable session workspace, a shared component layer, a hardened backend, and accessibility and polish throughout, with no breaking changes for existing installs.

### Changed

- **The map draws on three stacked canvases,** so dragging a token repaints only the tokens.

- **Lit maps with many walls stay smooth,** since moving one token or light works out only that source again.

- **Spirit-layer and lighting updates no longer do more database work for each player at the table.**

- **Opening a campaign loads only what it shows,** so large campaigns open quickly.

- **Token moves no longer redraw the whole campaign page,** and the Dashboard, Characters and Asset Library keep what they have loaded.

- **Pictures are cached by the browser,** and the default logo and mascot shrink from 1.4 MB to 64 KB.

- **The session screen is a resizable workspace.** Drag the dividers to resize the three columns, or collapse the side ones; the layout is remembered per browser.

- **Chat, Dice, Initiative and Session are full-height tabs,** with an unread badge on Chat.

- **The DM's header buttons are grouped icon buttons** with tooltips.

- **Buttons and dialogs share one look,** and follow the theme throughout.

- **The browser tab and home screen have a proper icon.**

- **Animation respects the system's reduce motion setting.**

- **The backend is reorganised and better tested,** with structured logs in `backend/logs/error.log`. Nothing changes for an install.

### Fixed

- **The setup wizard appears on a brand-new install.**

- **Completing the setup wizard reliably marks the instance as configured.**

- **Session status updates live for players.**

- **Uploading a token image from a character sheet inside a campaign saves.**

- **Ending combat and restoring a backup ask in the app's own dialog.**

- **A connection that has not joined the campaign can no longer change hit points.**

### Security

- **Dependencies updated to clear every known advisory in shipped code.**

- **A backup restore checks the archive before unpacking it,** against files written outside the restore folder and archives that unpack to far more than their size.

- **One connection can no longer flood the map with token moves or wall and light edits.**

## [1.0.0] - 2026-05-17

Initial public release.

### Added

- **A self-hosted tabletop for several campaigns at once,** each run by its own DM, with Admin, DM and Player roles, a setup wizard, an admin dashboard with backups, and registration with optional admin approval.

- **16 colour themes, a custom theme builder and 8 open-licence fonts,** chosen per user, with the admin's choice as the default and on the sign-in page. Branding images are replaced in `frontend/public/`.

- **Sign-in with email and password, two-factor authentication with backup codes,** Remember me for 30 days, password reset by email or a temporary password from an admin, request limits, and file checks on every upload.

- **Character sheets for D&D 5e, Pathfinder 2e and Call of Cthulhu 7e,** and a Flexible sheet for any other system.

- **Campaigns and sessions:** invitations, the roster, starting, pausing and ending a session, session notes, and campaign export and import.

- **The map:** a grid, tokens moved live for everyone, players, NPCs and objects with hit points, conditions and stat blocks, the spirit layer and fog of war.

- **Walls and dynamic lighting:** six wall tools, doors and windows, snapping, undo and redo, light sources with bright and dim radii, and a preview of the player view.

- **The Creature Library** of SRD creatures, with custom and duplicated creatures, **Token Templates**, and rolls from a creature's stat block.

- **The Asset Library,** with Global, Campaign and personal files and upload limits per type.

- **Atmosphere:** the vibe tracker, six atmosphere effects (rain, mist, leaves, sparkles, snow and wind), spirit layer styles and ambient audio.

- **Chat, a dice roller with secret rolls, and an initiative tracker.**

- **Docker Compose deployment** with an internal network, a development stack, structured logs, a `/health` check, configurable ports, and support for a reverse proxy of your own.

Known limitations at release: assets could not be moved between scopes, the global asset manager permission had no admin control, branding had no upload screen, a campaign could not be imported without its tokens, there was no built-in log rotation, the Shadowrun 6e sheet was unfinished, and accessibility had not been audited.
